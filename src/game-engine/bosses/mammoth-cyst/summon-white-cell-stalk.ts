// Phase 10C §13 / §14 / §15：White Cell Stalk 原子召唤 + Spawn Policy / 空间解析 + 动态 Initiative。
//
// 规则书 verified：
// - §2.5：Stalk Card 放上 Stance Tracker、模型放入对应 Room Area；
// - §2.7：Stalk 被召唤时**立即**向 Initiative Deck 加入 **2 张**卡；
// - §2.8：通用召唤规则 —— 放入**第一处空 Stance** 及其对应 Area，**除非 Boss 另有说明**；
// - §2.9：被召唤者**可以在当前 Round 行动**（因此新卡插入当前牌堆而非下一轮）。
//
// 硬约束对照：
// - 硬约束 9 / §13：Spawn Stance / Area 一律 **Definition 驱动**；
//   Room Card 未录入时 → `definition-driven` → **拒绝召唤并给出原因**（绝不猜第一空位）；
// - 硬约束 10 / §13：通用「第一空 Stance」只在 Boss **未指定**时使用；
// - 硬约束 11 / §14：Actor 创建与 2 张 Initiative 的加入必须**同一原子事务** ——
//   任一步失败则整体回滚（返回原 state，不留半个 Stalk、不留孤儿卡）；
// - 硬约束 12 / §14：召唤行动**不得**同时发动攻击（本模块只创建单位，不结算任何伤害）；
// - 硬约束 8：maxAlive = 1；
// - RNG 注入（新卡插入位置由注入的 rng 决定，禁止 Math.random）。

import type { DataMode } from '../../../types/progression';
import type {
  ConditionalLinkedActorSummon,
  MammothCystActorState,
  MammothCystEncounterState,
  MammothCystInitiativeCard,
  MammothCystRoomDefinition,
  MonsterStance,
  WhiteCellStalkSummonRecord,
} from '../../../types/mammoth-cyst';
import type { BattleState, BattleUnit, CampaignState } from '../../../types';
import { pushLog } from '../../log';
import { createId, nowIso } from '../../random';
import {
  WHITE_CELL_STALK_BATTLE_POSITION,
  buildMammothCystUnit,
  createMammothCystInitiativeCardsFor,
  getAliveWhiteCellStalkCount,
  getMammothCystAreaOccupancy,
  hasProcessedMammothCystTransaction,
  mammothCystTransactionIds,
  withProcessedMammothCystTransaction,
} from './mammoth-cyst-runtime';
import { decideMammothCystAction } from './mammoth-cyst-action-override';
import type { CommunityRuntimeBlockerCode } from '../../../data/darkest-dungeon/community-reference/runtime-profile';
import type { MammothCystDisplacementChoice } from '../../../types/mammoth-cyst';
import {
  applyMammothCystDisplacement,
  nearestAvailableAreas,
  resolveMammothCystDisplacementChoice,
  type ResolveDisplacementChoiceSelection,
} from './room-11-displacement';

/** 通用「第一处空 Stance」的检查顺序（规则书 Stance Tracker 自上而下）。 */
export const STANCE_ORDER: MonsterStance[] = ['aggressive', 'ranged', 'defensive', 'support'];

// ---------------------------------------------------------------------------
// §13 Spawn Policy 解析
// ---------------------------------------------------------------------------

export interface SpawnSpaceResolution {
  ok: boolean;
  stance: MonsterStance | null;
  areaId: string | null;
  /** 解析路径：Boss 专属指定 / 通用规则；供日志与测试断言。 */
  resolvedBy: 'boss-specified' | 'generic-first-empty-stance' | null;
  /** 解析过程事件 id（写入 SummonRecord.spaceResolutionEventIds）。 */
  eventIds: string[];
  reason: string | null;
}

/** 当前被**存活**怪物占据的 Stance 集合。 */
export function getOccupiedStances(state: MammothCystEncounterState): Set<MonsterStance> {
  return new Set(state.actorStates.filter((a) => a.isAlive).map((a) => a.stance));
}

/**
 * 解析 Stalk 的 Spawn Stance 与 Area（§13）。
 *
 * Stance：
 * - `specified-stance` → 用 Boss 指定（硬约束 10 的例外分支）；
 * - `first-empty-stance` → 通用规则：Stance Tracker 自上而下第一处空位；
 * - `definition-driven` → 资料未录入 → **拒绝**（不猜）。
 *
 * Area：
 * - `specified-area` → 用 Boss 指定；
 * - `corresponding-stance-area` → 查 Room Card 的 stanceAreaMap；
 * - `definition-driven` → **拒绝**。
 *
 * 另外校验：Area 必须在 validAreaIds 内，且未超 Capacity（Capacity 缺失时按 Definition 驱动 → 拒绝）。
 */
export function resolveWhiteCellStalkSpawnSpace(
  state: MammothCystEncounterState,
  room: MammothCystRoomDefinition,
): SpawnSpaceResolution {
  const eventIds: string[] = [];
  const policy = room.whiteCellStalkSpawn;

  // ---- Stance ----
  let stance: MonsterStance | null = null;
  let resolvedBy: SpawnSpaceResolution['resolvedBy'] = null;

  if (policy.stancePolicy === 'specified-stance') {
    if (!policy.specifiedStance) {
      return fail(eventIds, 'Room Definition 声明 specified-stance 但未给出 specifiedStance');
    }
    stance = policy.specifiedStance;
    resolvedBy = 'boss-specified';
    eventIds.push(`spawn-stance:boss-specified:${stance}`);
  } else if (policy.stancePolicy === 'first-empty-stance') {
    const occupied = getOccupiedStances(state);
    const empty = STANCE_ORDER.find((s) => !occupied.has(s)) ?? null;
    if (!empty) {
      return fail(eventIds, 'Stance Tracker 四处 Stance 均被占据，无法按通用规则放置 White Cell Stalk');
    }
    stance = empty;
    resolvedBy = 'generic-first-empty-stance';
    eventIds.push(`spawn-stance:generic-first-empty:${stance}`);
  } else {
    return fail(
      eventIds,
      'White Cell Stalk Spawn Stance 未录入（stancePolicy=definition-driven），拒绝召唤',
    );
  }

  // ---- Area ----
  let areaId: string | null = null;
  if (policy.areaPolicy === 'specified-area') {
    if (!policy.specifiedAreaId) {
      return fail(eventIds, 'Room Definition 声明 specified-area 但未给出 specifiedAreaId');
    }
    areaId = policy.specifiedAreaId;
    eventIds.push(`spawn-area:boss-specified:${areaId}`);
  } else if (policy.areaPolicy === 'corresponding-stance-area') {
    const mapped = room.stanceAreaMap[stance];
    if (!mapped) {
      return fail(
        eventIds,
        `Room Card 未录入 Stance ${stance} 对应的 Area（stanceAreaMap 缺失），拒绝召唤`,
      );
    }
    areaId = mapped;
    eventIds.push(`spawn-area:corresponding-stance:${areaId}`);
  } else {
    return fail(
      eventIds,
      'White Cell Stalk Spawn Area 未录入（areaPolicy=definition-driven），拒绝召唤',
    );
  }

  if (!room.validAreaIds.includes(areaId)) {
    return fail(eventIds, `Area ${areaId} 不在 Room 的 validAreaIds 内`);
  }

  // ---- Capacity（缺失 → Definition 驱动 → 拒绝，不自行放宽）----
  const capacity = room.areaCapacities[areaId];
  if (typeof capacity !== 'number') {
    return fail(eventIds, `Room Card 未录入 Area ${areaId} 的容量，拒绝召唤（不猜容量）`);
  }
  const occupancy = getMammothCystAreaOccupancy(state, areaId).length;
  if (occupancy >= capacity) {
    // WP-7：no-space 不再是终点 —— 保留 stance/areaId 供召唤方进入位移流程。
    return {
      ok: false,
      stance,
      areaId,
      resolvedBy,
      eventIds,
      reason: `Area ${areaId} 已满（${occupancy}/${capacity}），进入 no-space 位移解析`,
    };
  }
  eventIds.push(`spawn-capacity-check:${areaId}:${occupancy}/${capacity}`);

  return { ok: true, stance, areaId, resolvedBy, eventIds, reason: null };
}

function fail(eventIds: string[], reason: string): SpawnSpaceResolution {
  return { ok: false, stance: null, areaId: null, resolvedBy: null, eventIds, reason };
}

// ---------------------------------------------------------------------------
// §14 / §15 原子召唤
// ---------------------------------------------------------------------------

export interface SummonWhiteCellStalkOptions {
  mode?: DataMode | 'community-reference';
  rng?: () => number;
  now?: string;
  /** 触发本次召唤的 Cyst 行动事件 id（通常为该次行动的 Initiative Card id）。 */
  sourceActionEventId: string;
}

export interface SummonWhiteCellStalkResult {
  ok: boolean;
  campaign: CampaignState;
  state: MammothCystEncounterState | null;
  record: WhiteCellStalkSummonRecord | null;
  /** 新加入的 2 张 Initiative Card。 */
  initiativeCards: MammothCystInitiativeCard[];
  alreadySummoned: boolean;
  /** 回滚标记：true 表示中途失败且已整体回滚（campaign / state 保持召唤前）。 */
  rolledBack: boolean;
  reason: string | null;
  blockerCode?: CommunityRuntimeBlockerCode;
  /**
   * WP-7：no-space 位移需要玩家裁决时挂起的选择（英雄候选 / 怪物候选 / 等距目的地）。
   * 非 null 时本次召唤未发生；玩家结算选择后由 resolveSummonDisplacementChoice 恢复召唤。
   */
  pendingChoice: MammothCystDisplacementChoice | null;
}

/**
 * 执行一次 White Cell Stalk 召唤（**单一原子事务**，硬约束 11）。
 *
 * 事务内步骤（任一失败即整体放弃，不写入任何中间态）：
 *   1. 复核条件（aliveStalkCount === 0，硬约束 4 / 8）；
 *   2. 解析 Spawn Stance / Area / Capacity（§13）；
 *   3. 创建 Stalk BattleActor（boss-minion，**不进 Monster Deck**，硬约束 2）；
 *   4. 创建 **2 张** Stalk Initiative Card（§2.7 / 硬约束 11）；
 *   5. 将 2 张卡插入**当前**牌堆（§2.9：可在本 Round 行动）；
 *   6. 写入 SummonRecord + 幂等键。
 *
 * 幂等键：`mammoth-cyst-summon:{battleId}:{sourceActionEventId}`
 * → 同一次 Cyst 行动只召唤一次（硬约束 12 的另一半：也不会一边召唤一边攻击）。
 */
export function summonWhiteCellStalk(
  campaign: CampaignState,
  options: SummonWhiteCellStalkOptions,
): SummonWhiteCellStalkResult {
  const actFour = campaign.actFourState;
  const state = actFour.mammothCystEncounterState;
  const mode: DataMode | 'community-reference' = options.mode ?? 'prototype';

  if (!state) return summonFail(campaign, 'Mammoth Cyst Encounter 尚未 Setup');

  const transactionId = mammothCystTransactionIds.summon(
    state.battleId,
    options.sourceActionEventId,
  );
  if (hasProcessedMammothCystTransaction(state, transactionId)) {
    const existing =
      state.summonHistory.find((r) => r.transactionId === transactionId) ?? null;
    return {
      ok: true,
      campaign,
      state,
      record: existing,
      initiativeCards: existing
        ? state.initiativeCards.filter((c) => existing.initiativeCardIds.includes(c.id))
        : [],
      alreadySummoned: true,
      rolledBack: false,
      reason: null,
      pendingChoice: null,
    };
  }

  // ---- 步骤 1：复核条件（硬约束 4 / 8）----
  const runtime = state.mammothCystBattleRuntime;
  const sourceCard = state.initiativeCards.find((c) => c.id === options.sourceActionEventId);
  if (sourceCard) {
    const decision = decideMammothCystAction(state, sourceCard, mode);
    if (!decision.ok) return summonFail(campaign, decision.reason ?? '召唤前置判定失败');
    if (decision.actionType !== 'summon-linked-actor') {
      return summonFail(campaign, decision.explanation || '当前不满足召唤条件');
    }
  } else if (getAliveWhiteCellStalkCount(state) > 0) {
    return summonFail(campaign, '场上已存在存活的 White Cell Stalk（maxAlive=1）');
  }

  const summonDef: ConditionalLinkedActorSummon | null =
    state.snapshot.guardian.conditionalSummonDefinitionId
      ? (sourceCard ? decideMammothCystAction(state, sourceCard, mode).summonDefinition : null)
      : null;

  // ---- 步骤 2：Spawn 空间解析（§13）----
  const room = state.snapshot.room;
  const space = resolveWhiteCellStalkSpawnSpace(state, room);
  if (!space.ok || !space.stance || !space.areaId) {
    // WP-7（community-reference）：Area 已满 → 按 rulebook:31 进入 no-space 位移解析
    // （Hero 挪最近可用 Area / Monster 占满时玩家选择挪让对象；等距并列 → 显式玩家选择），
    // 位移完成后恢复本次召唤。不再是 ENGINE_UNSUPPORTED blocker。
    const isNoSpace = /已满/.test(space.reason ?? '');
    if (mode === 'community-reference' && isNoSpace && space.stance && space.areaId) {
      return resolveSummonNoSpace(campaign, state, space.stance, space.areaId, options, transactionId);
    }
    // 解析失败 → 整体放弃，不创建任何单位、不加任何卡。
    return {
      ok: false,
      campaign,
      state,
      record: null,
      initiativeCards: [],
      alreadySummoned: false,
      rolledBack: true,
      reason: space.reason,
      pendingChoice: null,
    };
  }

  // ---- 步骤 3：创建 Stalk Actor（boss-minion；不进 Monster Deck）----
  const stalkDef = state.snapshot.whiteCellStalk;
  const generation = runtime.summonGeneration + 1;
  const now = options.now ?? nowIso();
  const rng = options.rng ?? (() => 0.5);

  const baseUnit = buildMammothCystUnit(stalkDef, WHITE_CELL_STALK_BATTLE_POSITION, space.stance);
  // 同一 Definition 可被多次召唤 → actorId 必须带 generation 以区分各代。
  const stalkUnit: BattleUnit = { ...baseUnit, id: `${baseUnit.id}-g${generation}` };
  if (!stalkUnit.isAlive || stalkUnit.maxHp <= 0) {
    return {
      ok: false,
      campaign,
      state,
      record: null,
      initiativeCards: [],
      alreadySummoned: false,
      rolledBack: true,
      reason: 'White Cell Stalk 卡面数值缺失（maxHp 未录入），拒绝召唤',
      pendingChoice: null,
    };
  }

  const stalkState: MammothCystActorState = {
    actorId: stalkUnit.id,
    actorDefinitionId: stalkDef.id,
    owner: 'white-cell-stalk',
    name: stalkDef.name,
    maxHp: stalkUnit.maxHp,
    hp: stalkUnit.hp,
    isAlive: true,
    stance: space.stance,
    areaId: space.areaId,
    actionsPerRound: 2,
    defeatedAt: null,
  };

  // ---- 步骤 4：创建 2 张 Initiative Card（§2.7）----
  const cardsToAdd = summonDef?.initiativeCardsToAdd ?? 2;
  if (cardsToAdd !== 2) {
    return {
      ok: false,
      campaign,
      state,
      record: null,
      initiativeCards: [],
      alreadySummoned: false,
      rolledBack: true,
      reason: `Summon Definition 声明加入 ${cardsToAdd} 张 Initiative，与规则书 verified 的 2 张不符`,
      pendingChoice: null,
    };
  }
  const newCards = createMammothCystInitiativeCardsFor(
    state.guardianDefinitionId,
    stalkUnit.id,
    'white-cell-stalk',
    generation,
  );

  // ---- 步骤 5：插入**当前**牌堆（§2.9 可在本 Round 行动）----
  const insertAt = Math.min(
    state.initiativeDrawPile.length,
    Math.floor(rng() * (state.initiativeDrawPile.length + 1)),
  );
  const nextPile = [
    ...state.initiativeDrawPile.slice(0, insertAt),
    newCards[0].id,
    newCards[1].id,
    ...state.initiativeDrawPile.slice(insertAt),
  ];

  // ---- 步骤 6：写入记录 + 幂等键（至此才产生可见状态变更）----
  const record: WhiteCellStalkSummonRecord = {
    id: createId('wcss'),
    sourceActorId: runtime.mammothCystActorId,
    sourceActionEventId: options.sourceActionEventId,
    generation,
    actorId: stalkUnit.id,
    stance: space.stance,
    areaId: space.areaId,
    initiativeCardIds: [newCards[0].id, newCards[1].id],
    spaceResolutionEventIds: space.eventIds,
    status: 'active',
    transactionId,
  };

  let nextState: MammothCystEncounterState = {
    ...state,
    actorStates: [...state.actorStates, stalkState],
    initiativeCards: [...state.initiativeCards, ...newCards],
    initiativeDrawPile: nextPile,
    summonHistory: [...state.summonHistory, record].slice(-200),
    mammothCystBattleRuntime: {
      ...runtime,
      activeWhiteCellStalkActorId: stalkUnit.id,
      activeSummonRecordId: record.id,
      summonGeneration: generation,
      activeStalkInitiativeCardIds: [newCards[0].id, newCards[1].id],
      lastConditionalOverrideEventId: options.sourceActionEventId,
      lastSummonTransactionId: transactionId,
    },
  };
  nextState = withProcessedMammothCystTransaction(nextState, transactionId);

  // BattleState 同步追加单位（Stalk 是真正的 BattleActor，可被普通技能选中/伤害）。
  const battle: BattleState | null = campaign.battle
    ? {
        ...campaign.battle,
        monsters: [...campaign.battle.monsters, stalkUnit],
        initiativeOrder: [...campaign.battle.initiativeOrder, stalkUnit.id],
      }
    : campaign.battle;

  let next: CampaignState = {
    ...campaign,
    battle,
    actFourState: { ...actFour, mammothCystEncounterState: nextState },
    updatedAt: now,
  };
  next = pushLog(
    next,
    `Mammoth Cyst 的本次行动被召唤取代：White Cell Stalk（第 ${generation} 代）出现在 ${space.stance} Stance / ${space.areaId}，立即加入 2 张 Initiative（本轮即可行动）。`,
    'danger',
  );

  return {
    ok: true,
    campaign: next,
    state: nextState,
    record,
    initiativeCards: [...newCards],
    alreadySummoned: false,
    rolledBack: false,
    reason: null,
    pendingChoice: null,
  };
}

function summonFail(campaign: CampaignState, reason: string): SummonWhiteCellStalkResult {
  return {
    ok: false,
    campaign,
    state: campaign.actFourState.mammothCystEncounterState ?? null,
    record: null,
    initiativeCards: [],
    alreadySummoned: false,
    rolledBack: false,
    reason,
    pendingChoice: null,
  };
}

// ---------------------------------------------------------------------------
// Phase 11A.4R1 WP-7：召唤 no-space 位移解析（rulebook:31）
// ---------------------------------------------------------------------------

/**
 * Spawn Area 已满时的位移解析：
 * - 有存活 Hero 在目标 Area → Hero 挪到 nearest available Area（唯一候选直接落定；
 *   多 Hero / 多等距目的地 → 挂起显式玩家选择，绝不随机）；
 * - Area 被 Monster 占满（无 Hero）→ 玩家选择挪让的 Monster（唯一 Monster 且唯一
 *   目的地时无实际选择空间，直接落定）；
 * - 位移与召唤构成同一逻辑事务：选择挂起期间不产生任何召唤副作用；
 *   玩家结算后由 resolveSummonDisplacementChoice 恢复召唤。
 */
function resolveSummonNoSpace(
  campaign: CampaignState,
  state: MammothCystEncounterState,
  stance: MonsterStance,
  areaId: string,
  options: SummonWhiteCellStalkOptions,
  summonTransactionId: string,
): SummonWhiteCellStalkResult {
  const displacementTransactionId = `${summonTransactionId}:no-space-displace`;
  const base: SummonWhiteCellStalkResult = {
    ok: false,
    campaign,
    state,
    record: null,
    initiativeCards: [],
    alreadySummoned: false,
    rolledBack: false,
    reason: null,
    pendingChoice: null,
  };

  // 幂等：位移已结算但召唤尚未恢复（例如 Save 发生在选择结算后、召唤恢复前）→ 直接恢复召唤。
  if (hasProcessedMammothCystTransaction(state, displacementTransactionId) && !state.pendingDisplacementChoice) {
    return summonWhiteCellStalk(campaign, options);
  }

  const now = options.now ?? nowIso();
  const heroesInArea = state.heroPlacements
    .filter((p) => p.areaId === areaId)
    .filter((p) => campaign.heroes.some((h) => h.instanceId === p.heroId && !h.dead))
    .map((p) => p.heroId)
    .sort();
  const monstersInArea = state.actorStates
    .filter((a) => a.isAlive && a.areaId === areaId)
    .map((a) => a.actorId)
    .sort();

  const nearest = nearestAvailableAreas(state, areaId);
  if (nearest.areaIds.length === 0) {
    return { ...base, rolledBack: true, reason: `Room 11 没有任何可挪让的可用 Area（自 ${areaId} 起全部满员），召唤失败` };
  }

  const pend = (choice: Omit<MammothCystDisplacementChoice, 'id' | 'createdAt'>): SummonWhiteCellStalkResult => {
    const pending: MammothCystDisplacementChoice = { ...choice, id: createId('mcchoice'), createdAt: now };
    const nextState: MammothCystEncounterState = { ...state, pendingDisplacementChoice: pending };
    const next: CampaignState = { ...campaign, actFourState: { ...campaign.actFourState, mammothCystEncounterState: nextState }, updatedAt: now };
    return {
      ...base,
      campaign: pushLog(next, `Summon no-space：等待玩家裁决位移（${pending.kind}，候选目的地 ${pending.destinationAreaIds.join(' / ')}）。`, 'warning'),
      state: nextState,
      reason: 'no-space displacement requires player choice',
      pendingChoice: pending,
    };
  };

  const choiceBase = {
    transactionId: displacementTransactionId,
    sourceActionEventId: options.sourceActionEventId,
    spawnStance: stance,
    spawnAreaId: areaId,
    remainingSteps: 1,
    awayFromAreaId: null,
  };

  if (heroesInArea.length > 0) {
    // rulebook:31：「A Hero must move to the nearest available Area」。
    const heroId = heroesInArea.length === 1 ? heroesInArea[0] : null;
    if (heroId && nearest.areaIds.length === 1) {
      const moved = applyMammothCystDisplacement(campaign, {
        kind: 'summon-hero-displacement',
        heroId,
        toAreaId: nearest.areaIds[0],
        distance: nearest.distance,
        sourceActionEventId: options.sourceActionEventId,
        transactionId: displacementTransactionId,
        now,
      });
      if (!moved.ok) return { ...base, campaign: moved.campaign, state: moved.state, rolledBack: true, reason: moved.reason };
      // 位移落定 → 同一逻辑事务内恢复召唤。
      return summonWhiteCellStalk(moved.campaign, options);
    }
    return pend({
      ...choiceBase,
      kind: 'summon-hero-displacement',
      heroId,
      heroCandidateIds: heroesInArea.length > 1 ? heroesInArea : [],
      monsterCandidateIds: [],
      destinationAreaIds: nearest.areaIds,
    });
  }

  if (monstersInArea.length > 0) {
    // rulebook:31：「players choose which Monster to move to the nearest available Area」。
    if (monstersInArea.length === 1 && nearest.areaIds.length === 1) {
      // 单一 Monster + 单一目的地：玩家选择退化（无实际分支），直接落定。
      const moved = applyMammothCystDisplacement(campaign, {
        kind: 'summon-monster-displacement',
        monsterActorId: monstersInArea[0],
        toAreaId: nearest.areaIds[0],
        distance: nearest.distance,
        sourceActionEventId: options.sourceActionEventId,
        transactionId: displacementTransactionId,
        now,
      });
      if (!moved.ok) return { ...base, campaign: moved.campaign, state: moved.state, rolledBack: true, reason: moved.reason };
      return summonWhiteCellStalk(moved.campaign, options);
    }
    return pend({
      ...choiceBase,
      kind: 'summon-monster-displacement',
      heroId: null,
      heroCandidateIds: [],
      monsterCandidateIds: monstersInArea,
      destinationAreaIds: nearest.areaIds,
    });
  }

  return { ...base, rolledBack: true, reason: `Area ${areaId} 已满但占位表为空（状态不一致），拒绝召唤` };
}

/**
 * 玩家结算召唤 no-space 位移选择：先结算位移（显式 choice transaction，进存档），
 * 再在**同一调用**内恢复被挂起的召唤 —— 位移 + 召唤对外表现为一次原子事务。
 */
export function resolveSummonDisplacementChoice(
  campaign: CampaignState,
  selection: ResolveDisplacementChoiceSelection & { mode?: DataMode | 'community-reference' },
): SummonWhiteCellStalkResult {
  const state = campaign.actFourState.mammothCystEncounterState;
  const pending = state?.pendingDisplacementChoice ?? null;
  if (!state || !pending) return { ...summonFail(campaign, '没有挂起的位移选择'), pendingChoice: null };
  if (pending.kind === 'displace-push') return { ...summonFail(campaign, '该选择属于 Displace Push，而非召唤位移'), pendingChoice: pending };

  const resolved = resolveMammothCystDisplacementChoice(campaign, selection);
  if (!resolved.ok) return { ...summonFail(resolved.campaign, resolved.reason ?? '位移选择结算失败'), state: resolved.state, pendingChoice: resolved.pendingChoice };
  if (resolved.alreadyResolved) {
    // 重放：位移早已落盘 → 直接恢复召唤（summon 自身幂等键保证不重复召唤）。
    return summonWhiteCellStalk(resolved.campaign, {
      mode: selection.mode,
      rng: selection.rng,
      now: selection.now,
      sourceActionEventId: pending.sourceActionEventId,
    });
  }
  return summonWhiteCellStalk(resolved.campaign, {
    mode: selection.mode,
    rng: selection.rng,
    now: selection.now,
    sourceActionEventId: pending.sourceActionEventId,
  });
}
