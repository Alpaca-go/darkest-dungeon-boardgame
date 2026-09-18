// Phase 11A.4R1 WP-2 / WP-7：Room 11 拓扑位移引擎。
//
// 来源约束（community-source-blocker-resolution dossier + Core Rulebook）：
// - 拓扑：Room 11 edges 由已接受 tileGeometry 轮廓派生（COMMUNITY_ROOM11_EDGES），
//   距离 = 该图上的 BFS 边数；绝不使用 Battle position ± N、数组下标或「最近猜测」；
// - Push X（rulebook:21 Shuffle/push）：目标沿拓扑**远离** Skill 使用者 X 个 Area；
//   「cannot place a Shuffled character in a fully occupied Area and the shuffle will
//   be cut short」—— 满员 Area 不可进入，位移提前终止；
// - 召唤 no-space（rulebook:31）：Hero → 「move a Hero to the nearest available
//   Area」；Area 被 Monster 占满 → 「players choose which Monster to move to the
//   nearest available Area」；
// - destinationTieBreak / pathMetric 来源均为 null：任何一步出现多个等距合法目的地
//   时**不随机、不猜**，挂起为 `pendingDisplacementChoice` 显式玩家选择（进存档）。

import type { CampaignState } from '../../../types';
import type {
  MammothCystDisplacementChoice,
  MammothCystDisplacementRecord,
  MammothCystEncounterState,
} from '../../../types/mammoth-cyst';
import { pushLog } from '../../log';
import { createId, nowIso } from '../../random';
import {
  getMammothCystAreaOccupancy,
  hasProcessedMammothCystTransaction,
  withProcessedMammothCystTransaction,
} from './mammoth-cyst-runtime';

// ---------------------------------------------------------------------------
// 图 primitives
// ---------------------------------------------------------------------------

type Edge = { from: string; to: string };

function adjacency(edges: readonly Edge[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    graph.set(edge.from, [...(graph.get(edge.from) ?? []), edge.to]);
    graph.set(edge.to, [...(graph.get(edge.to) ?? []), edge.from]);
  }
  return graph;
}

/** BFS 距离表（不可达的 Area 不出现在结果中）。 */
export function room11DistancesFrom(state: MammothCystEncounterState, originAreaId: string): Map<string, number> {
  const graph = adjacency(state.snapshot.room.areaGraph.edges);
  const dist = new Map<string, number>([[originAreaId, 0]]);
  let frontier = [originAreaId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const neighbor of graph.get(node) ?? []) {
        if (dist.has(neighbor)) continue;
        dist.set(neighbor, dist.get(node)! + 1);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return dist;
}

/** Area 是否可再容纳一个单位（容量只来自 Room Definition；缺失 → 不可用）。 */
export function room11AreaHasSpace(
  state: MammothCystEncounterState,
  areaId: string,
  excludeOccupantId?: string,
): boolean {
  const capacity = state.snapshot.room.areaCapacities[areaId];
  if (typeof capacity !== 'number') return false;
  return getMammothCystAreaOccupancy(state, areaId, excludeOccupantId).length < capacity;
}

/**
 * 「nearest available Area」（rulebook:31）：从 fromAreaId 起 BFS，
 * 返回最近一层的所有有空位 Area（等距并列全部返回，由调用方决定是否挂玩家选择）。
 */
export function nearestAvailableAreas(
  state: MammothCystEncounterState,
  fromAreaId: string,
  movingOccupantId?: string,
): { areaIds: string[]; distance: number } {
  const graph = adjacency(state.snapshot.room.areaGraph.edges);
  const visited = new Set<string>([fromAreaId]);
  let frontier = [fromAreaId];
  let distance = 0;
  while (frontier.length > 0) {
    distance += 1;
    // 先展开完整一层，再统一判定 —— 等距并列目的地必须全部进入候选集。
    const layer = new Set<string>();
    for (const node of frontier) {
      for (const neighbor of graph.get(node) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        layer.add(neighbor);
      }
    }
    const available = [...layer].filter((areaId) => room11AreaHasSpace(state, areaId, movingOccupantId)).sort();
    if (available.length > 0) return { areaIds: available, distance };
    frontier = [...layer];
  }
  return { areaIds: [], distance: 0 };
}

/**
 * Displace Push 的单步候选（rulebook:21）：
 * 邻居中「离 awayFromAreaId 更远」且有容量的 Area。空数组 = cut short。
 */
export function displacePushStepCandidates(
  state: MammothCystEncounterState,
  currentAreaId: string,
  awayFromAreaId: string,
  movingHeroId: string,
): string[] {
  const dist = room11DistancesFrom(state, awayFromAreaId);
  const current = dist.get(currentAreaId);
  if (current === undefined) return [];
  const graph = adjacency(state.snapshot.room.areaGraph.edges);
  return (graph.get(currentAreaId) ?? [])
    .filter((neighbor) => (dist.get(neighbor) ?? -1) > current)
    .filter((neighbor) => room11AreaHasSpace(state, neighbor, movingHeroId))
    .sort();
}

// ---------------------------------------------------------------------------
// 位移落盘（原子：heroPlacements / actorStates 单条覆盖 + 历史 + 幂等键）
// ---------------------------------------------------------------------------

export interface ApplyDisplacementParams {
  kind: MammothCystDisplacementRecord['kind'];
  heroId?: string;
  monsterActorId?: string;
  toAreaId: string;
  distance: number;
  sourceActionEventId: string;
  transactionId: string;
  now?: string;
}

export interface ApplyDisplacementResult {
  ok: boolean;
  campaign: CampaignState;
  state: MammothCystEncounterState | null;
  record: MammothCystDisplacementRecord | null;
  alreadyApplied: boolean;
  reason: string | null;
}

export function applyMammothCystDisplacement(
  campaign: CampaignState,
  params: ApplyDisplacementParams,
): ApplyDisplacementResult {
  const state = campaign.actFourState.mammothCystEncounterState;
  if (!state) return { ok: false, campaign, state: null, record: null, alreadyApplied: false, reason: 'Mammoth Cyst Encounter 尚未 Setup' };

  // 幂等：同一位移事务只结算一次（Save → Reload → 重放不产生第二次位移）。
  if (hasProcessedMammothCystTransaction(state, params.transactionId)) {
    const existing = state.displacementHistory.find((record) => record.transactionId === params.transactionId) ?? null;
    return { ok: true, campaign, state, record: existing, alreadyApplied: true, reason: null };
  }

  const now = params.now ?? nowIso();
  const movingId = params.heroId ?? params.monsterActorId;
  if (!movingId) return { ok: false, campaign, state, record: null, alreadyApplied: false, reason: '缺少被位移单位' };

  const fromAreaId = params.heroId
    ? state.heroPlacements.find((p) => p.heroId === params.heroId)?.areaId
    : state.actorStates.find((a) => a.actorId === params.monsterActorId && a.isAlive)?.areaId;
  if (!fromAreaId) return { ok: false, campaign, state, record: null, alreadyApplied: false, reason: `被位移单位 ${movingId} 不在 Room 11 站位表中` };
  if (!state.snapshot.room.validAreaIds.includes(params.toAreaId)) {
    return { ok: false, campaign, state, record: null, alreadyApplied: false, reason: `目的地 ${params.toAreaId} 不在 validAreaIds 内` };
  }
  if (!room11AreaHasSpace(state, params.toAreaId, movingId)) {
    return { ok: false, campaign, state, record: null, alreadyApplied: false, reason: `目的地 ${params.toAreaId} 已满，位移 cut short / 拒绝` };
  }

  const record: MammothCystDisplacementRecord = {
    id: createId('mcdisp'),
    kind: params.kind,
    heroId: params.heroId ?? null,
    monsterActorId: params.monsterActorId ?? null,
    fromAreaId,
    toAreaId: params.toAreaId,
    distance: params.distance,
    sourceActionEventId: params.sourceActionEventId,
    transactionId: params.transactionId,
    createdAt: now,
  };

  let nextState: MammothCystEncounterState = {
    ...state,
    heroPlacements: params.heroId
      ? state.heroPlacements.map((p) => (p.heroId === params.heroId ? { ...p, areaId: params.toAreaId } : p))
      : state.heroPlacements,
    actorStates: params.monsterActorId
      ? state.actorStates.map((a) => (a.actorId === params.monsterActorId ? { ...a, areaId: params.toAreaId } : a))
      : state.actorStates,
    displacementHistory: [...state.displacementHistory, record].slice(-200),
  };
  nextState = withProcessedMammothCystTransaction(nextState, params.transactionId);

  const name = params.heroId
    ? campaign.heroes.find((h) => h.instanceId === params.heroId)?.name ?? params.heroId
    : state.actorStates.find((a) => a.actorId === params.monsterActorId)?.name ?? params.monsterActorId;
  let next: CampaignState = {
    ...campaign,
    actFourState: { ...campaign.actFourState, mammothCystEncounterState: nextState },
    updatedAt: now,
  };
  next = pushLog(next, `Room 11 位移：${name} 从 ${fromAreaId} 移至 ${params.toAreaId}（${params.kind}）。`, 'warning');
  return { ok: true, campaign: next, state: nextState, record, alreadyApplied: false, reason: null };
}

// ---------------------------------------------------------------------------
// Displace Push（WP-2：Stalk Displace 命中后的 Push 2，rulebook:21）
// ---------------------------------------------------------------------------

export interface StartDisplacePushParams {
  /** 被 Push 的 Hero instanceId。 */
  heroId: string;
  /** Skill 使用者（White Cell Stalk）actorId —— Push 方向的「远离」基准。 */
  awayFromActorId: string;
  /** Push 步数（Displace = 2）。 */
  distance: number;
  sourceActionEventId: string;
  now?: string;
}

export interface StartDisplacePushResult {
  ok: boolean;
  campaign: CampaignState;
  state: MammothCystEncounterState | null;
  /** 等距多目的地 → 挂起的玩家选择（来源无 tie-break，绝不随机）。 */
  pendingChoice: MammothCystDisplacementChoice | null;
  /** 是否发生了至少一步真实位移。 */
  moved: boolean;
  /** true = 因满员 / 无更远邻居而 cut short（rulebook:21）。 */
  cutShort: boolean;
  reason: string | null;
}

/**
 * 启动一次 Displace Push：沿 Room 11 派生拓扑把 Hero 推离 Stalk 至多 distance 步。
 * 每步候选 = 「离 Stalk 更远且未满员」的邻居；唯一候选自动落定，多候选挂起玩家选择，
 * 零候选 cut short。整链幂等（每步独立事务 id），Save/Replay 不重掷、不重走。
 */
export function startDisplacePush(
  campaign: CampaignState,
  params: StartDisplacePushParams,
): StartDisplacePushResult {
  const state = campaign.actFourState.mammothCystEncounterState;
  if (!state) return { ok: false, campaign, state: null, pendingChoice: null, moved: false, cutShort: false, reason: 'Mammoth Cyst Encounter 尚未 Setup' };
  const base = `mammoth-cyst-displace:${state.battleId}:${params.sourceActionEventId}`;

  // 幂等：同一次 Skill 的 Push 只启动一次。
  if (hasProcessedMammothCystTransaction(state, `${base}:start`)) {
    return { ok: true, campaign, state, pendingChoice: state.pendingDisplacementChoice, moved: false, cutShort: false, reason: null };
  }

  const stalk = state.actorStates.find((a) => a.actorId === params.awayFromActorId && a.isAlive);
  const heroArea = state.heroPlacements.find((p) => p.heroId === params.heroId)?.areaId;
  if (!stalk) return { ok: false, campaign, state, pendingChoice: null, moved: false, cutShort: false, reason: `Stalk ${params.awayFromActorId} 不在场，无法确定 Push 方向` };
  if (!heroArea) return { ok: false, campaign, state, pendingChoice: null, moved: false, cutShort: false, reason: `Hero ${params.heroId} 未登记 Room 11 站位` };

  const now = params.now ?? nowIso();
  let working: CampaignState = {
    ...campaign,
    actFourState: {
      ...campaign.actFourState,
      mammothCystEncounterState: withProcessedMammothCystTransaction(state, `${base}:start`),
    },
    updatedAt: now,
  };
  let current = working.actFourState.mammothCystEncounterState!;
  let moved = false;

  for (let stepsRemaining = params.distance; stepsRemaining > 0; stepsRemaining -= 1) {
    const fromAreaId = current.heroPlacements.find((p) => p.heroId === params.heroId)!.areaId;
    const candidates = displacePushStepCandidates(current, fromAreaId, stalk.areaId, params.heroId);
    if (candidates.length === 0) {
      // cut short：满员或已无可远离的邻居。
      working = pushLog(working, `Displace Push 在 ${fromAreaId} 被 cut short（无可进入的更远 Area）。`, 'info');
      return { ok: true, campaign: working, state: current, pendingChoice: null, moved, cutShort: true, reason: null };
    }
    if (candidates.length > 1) {
      const pending: MammothCystDisplacementChoice = {
        id: createId('mcchoice'),
        kind: 'displace-push',
        transactionId: `${base}:step:${stepsRemaining}`,
        sourceActionEventId: params.sourceActionEventId,
        heroId: params.heroId,
        heroCandidateIds: [],
        monsterCandidateIds: [],
        destinationAreaIds: candidates,
        awayFromAreaId: stalk.areaId,
        remainingSteps: stepsRemaining,
        spawnStance: null,
        spawnAreaId: null,
        createdAt: now,
      };
      current = { ...current, pendingDisplacementChoice: pending };
      working = pushLog(
        { ...working, actFourState: { ...working.actFourState, mammothCystEncounterState: current } },
        `Displace Push：${candidates.length} 个等距目的地（${candidates.join(' / ')}），等待玩家选择。`,
        'warning',
      );
      return { ok: true, campaign: working, state: current, pendingChoice: pending, moved, cutShort: false, reason: null };
    }
    const step = applyMammothCystDisplacement(working, {
      kind: 'displace-push',
      heroId: params.heroId,
      toAreaId: candidates[0],
      distance: 1,
      sourceActionEventId: params.sourceActionEventId,
      transactionId: `${base}:step:${stepsRemaining}`,
      now,
    });
    if (!step.ok || !step.state) {
      return { ok: false, campaign: step.campaign, state: step.state, pendingChoice: null, moved, cutShort: false, reason: step.reason };
    }
    working = step.campaign;
    current = step.state;
    moved = true;
  }

  return { ok: true, campaign: working, state: current, pendingChoice: null, moved, cutShort: false, reason: null };
}

// ---------------------------------------------------------------------------
// 玩家选择结算（显式 player choice transaction；进 Save/Replay）
// ---------------------------------------------------------------------------

export interface ResolveDisplacementChoiceSelection {
  /** summon-hero-displacement：被选中的 Hero（多名候选时必填）。 */
  heroId?: string;
  /** summon-monster-displacement：被选中的 Monster actorId（必填）。 */
  monsterActorId?: string;
  /** 目的地 Area（destinationAreaIds 多候选时必填）。 */
  areaId?: string;
  rng?: () => number;
  now?: string;
}

export interface ResolveDisplacementChoiceResult {
  ok: boolean;
  campaign: CampaignState;
  state: MammothCystEncounterState | null;
  /** 选择结算后又产生的后续选择（Displace Push 多步并列时链式出现）。 */
  pendingChoice: MammothCystDisplacementChoice | null;
  alreadyResolved: boolean;
  reason: string | null;
}

/**
 * 结算挂起的位移选择。
 *
 * 校验选择 ∈ 候选集（拒绝候选外的任意值），位移落盘后：
 * - displace-push 且仍有剩余步数 → 计算下一步；唯一候选自动继续，多候选挂起新选择；
 * - summon-* → 由调用方（summon-white-cell-stalk）恢复召唤事务。
 */
export function resolveMammothCystDisplacementChoice(
  campaign: CampaignState,
  selection: ResolveDisplacementChoiceSelection,
): ResolveDisplacementChoiceResult {
  const state = campaign.actFourState.mammothCystEncounterState;
  const pending = state?.pendingDisplacementChoice ?? null;
  if (!state || !pending) {
    return { ok: false, campaign, state: state ?? null, pendingChoice: null, alreadyResolved: false, reason: '没有挂起的位移选择' };
  }

  // 幂等：同一选择事务已结算 → 直接返回当前状态（Save → Reload → 重放安全）。
  if (hasProcessedMammothCystTransaction(state, pending.transactionId)) {
    return { ok: true, campaign, state, pendingChoice: state.pendingDisplacementChoice, alreadyResolved: true, reason: null };
  }

  // ---- 校验选择合法（候选外一律拒绝，绝不静默改写）----
  let heroId = pending.heroId;
  if (pending.heroCandidateIds.length > 1) {
    if (!selection.heroId || !pending.heroCandidateIds.includes(selection.heroId)) {
      return { ok: false, campaign, state, pendingChoice: pending, alreadyResolved: false, reason: `必须从候选人中选择 Hero：${pending.heroCandidateIds.join(', ')}` };
    }
    heroId = selection.heroId;
  }
  let monsterActorId: string | null = null;
  if (pending.kind === 'summon-monster-displacement') {
    if (!selection.monsterActorId || !pending.monsterCandidateIds.includes(selection.monsterActorId)) {
      return { ok: false, campaign, state, pendingChoice: pending, alreadyResolved: false, reason: `必须从候选 Monster 中选择：${pending.monsterCandidateIds.join(', ')}` };
    }
    monsterActorId = selection.monsterActorId;
  }
  let areaId: string | null = null;
  if (pending.destinationAreaIds.length === 1) areaId = pending.destinationAreaIds[0];
  else {
    if (!selection.areaId || !pending.destinationAreaIds.includes(selection.areaId)) {
      return { ok: false, campaign, state, pendingChoice: pending, alreadyResolved: false, reason: `必须从候选目的地中选择 Area：${pending.destinationAreaIds.join(', ')}` };
    }
    areaId = selection.areaId;
  }

  const movingId = heroId ?? monsterActorId;
  if (!movingId || !areaId) {
    return { ok: false, campaign, state, pendingChoice: pending, alreadyResolved: false, reason: '位移选择缺少单位或目的地' };
  }

  const applied = applyMammothCystDisplacement(campaign, {
    kind: pending.kind,
    heroId: heroId ?? undefined,
    monsterActorId: monsterActorId ?? undefined,
    toAreaId: areaId,
    distance: 1,
    sourceActionEventId: pending.sourceActionEventId,
    transactionId: pending.transactionId,
    now: selection.now,
  });
  if (!applied.ok || !applied.state) {
    return { ok: false, campaign: applied.campaign, state: applied.state, pendingChoice: pending, alreadyResolved: false, reason: applied.reason };
  }

  let nextState: MammothCystEncounterState = { ...applied.state, pendingDisplacementChoice: null };
  let next: CampaignState = { ...applied.campaign, actFourState: { ...applied.campaign.actFourState, mammothCystEncounterState: nextState } };

  // ---- Displace Push：继续剩余步数（唯一候选自动落定；多候选链式挂起）----
  if (pending.kind === 'displace-push' && pending.remainingSteps > 1 && heroId && pending.awayFromAreaId) {
    const stepCandidates = displacePushStepCandidates(nextState, areaId, pending.awayFromAreaId, heroId);
    if (stepCandidates.length > 1) {
      const followUp: MammothCystDisplacementChoice = {
        ...pending,
        id: createId('mcchoice'),
        transactionId: `${pending.transactionId}:step-${pending.remainingSteps - 1}`,
        destinationAreaIds: stepCandidates,
        remainingSteps: pending.remainingSteps - 1,
        createdAt: selection.now ?? nowIso(),
      };
      nextState = { ...nextState, pendingDisplacementChoice: followUp };
      next = { ...next, actFourState: { ...next.actFourState, mammothCystEncounterState: nextState } };
      return { ok: true, campaign: next, state: nextState, pendingChoice: followUp, alreadyResolved: false, reason: null };
    }
    if (stepCandidates.length === 1) {
      const continued = applyMammothCystDisplacement(next, {
        kind: 'displace-push',
        heroId,
        toAreaId: stepCandidates[0],
        distance: 1,
        sourceActionEventId: pending.sourceActionEventId,
        transactionId: `${pending.transactionId}:step-${pending.remainingSteps - 1}`,
        now: selection.now,
      });
      if (continued.ok && continued.state) {
        nextState = continued.state;
        next = { ...continued.campaign, actFourState: { ...continued.campaign.actFourState, mammothCystEncounterState: nextState } };
      }
    }
    // 0 候选 = cut short（rulebook:21），不再移动。
  }

  return { ok: true, campaign: next, state: nextState, pendingChoice: nextState.pendingDisplacementChoice, alreadyResolved: false, reason: null };
}
