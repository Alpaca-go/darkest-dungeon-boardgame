// Phase 10B §15 / §16 / §17：Pit Toss 事务（掷 d10 → 查 Room Map → 强制位移 → Room Effect）。
//
// 硬约束对照：
// - 硬约束 7 / §14.3：**只有命中才走到这里**；Miss 由 body-slam-hook 拦截，不掷 d10；
// - 硬约束 9 / §16：d10 → Pit 的映射**只来自 Room Definition**，
//   不按 Pit 数量平均分配、不使用数组下标、不由引擎推断；
// - 硬约束 11 / §15：整个 Pit Toss 是**原子事务** —— 中途失败必须整体回滚，
//   不留「移动了但没结算效果」或「结算了但没移动」的半状态；
// - 硬约束 14 / §22：d10 结果**先保存后展示**，刷新不重掷（重复调用返回同一条记录）；
// - 硬约束 8 / §18：Pit 效果来自 Room Definition 并复用正式伤害 / 压力管线，
//   绝不在 Body Slam 里硬编码；
// - §25：Hero 不会同时位于两个 Area —— 位移前先从原 Pit / 原 Area 移除。

import type { CampaignState } from '../../../types';
import type { SpikedPitDefinition } from '../../../types/room-hazards';
import type {
  D10Roll,
  PitTossRecord,
  TemplarsEncounterState,
  TemplarsHeroPlacement,
} from '../../../types/templars';
import {
  canForceEnter,
  getActorsInSpikedPit,
  placeActorInPit,
  removeActorFromPits,
  resolveRoomHazardTrigger,
} from '../../room-hazards';
import { pushLog } from '../../log';
import { createId, nowIso } from '../../random';
import { rollD10 } from '../../campaign/act-four/rng';
import {
  hasProcessedTemplarsTransaction,
  templarsTransactionIds,
  withProcessedTemplarsTransaction,
} from './templars-runtime';

export interface ResolvePitTossParams {
  campaign: CampaignState;
  /** 触发本次 Pit Toss 的 Body Slam 命中事件 id。 */
  hitEventId: string;
  rng: () => number;
  now?: string;
}

export interface ResolvePitTossResult {
  ok: boolean;
  campaign: CampaignState;
  record: PitTossRecord | null;
  /** 已处理过（刷新 / 重复调用）—— 不重掷 d10。 */
  alreadyResolved: boolean;
  /** 事务失败并已整体回滚。 */
  rolledBack: boolean;
  reason: string | null;
}

/**
 * 执行一次完整的 Pit Toss（§15 七步）：
 * 1. 掷 d10 → 立即保存；
 * 2. 查 Room Definition 的 d10 → Pit 映射；
 * 3. 校验目标 Pit 与容量策略；
 * 4. 把 Hero 强制移入该 Pit（原子）；
 * 5. 触发 `on-forced-entry` Room Effect（复用 Damage / Stress / Death 管线）；
 * 6. 写事件历史；
 * 7. 任一步失败 → 整体回滚，不留半状态。
 */
export function resolvePitToss(params: ResolvePitTossParams): ResolvePitTossResult {
  const { campaign, hitEventId, rng } = params;
  const actFour = campaign.actFourState;
  const state = actFour.templarsEncounterState;

  if (!state) return tossFail(campaign, 'Templars Encounter 尚未 Setup');

  const hitEvent = state.bodySlamHitEvents.find((e) => e.id === hitEventId);
  if (!hitEvent) return tossFail(campaign, `找不到 Body Slam 命中事件 ${hitEventId}`);
  if (!hitEvent.hit) return tossFail(campaign, 'Body Slam 未命中，不应发起 Pit Toss');
  if (!hitEvent.targetIsHero) return tossFail(campaign, '目标不是 Hero，不应发起 Pit Toss');

  const transactionId = templarsTransactionIds.pitToss(state.battleId, hitEventId);

  // ---- 幂等：刷新 / 重复调用返回同一条记录，绝不重掷 d10（硬约束 14）----
  const existing = state.pitTossHistory.find((r) => r.transactionId === transactionId);
  if (existing || hasProcessedTemplarsTransaction(state, transactionId)) {
    return {
      ok: existing ? existing.status !== 'rolled-back' : false,
      campaign,
      record: existing ?? null,
      alreadyResolved: true,
      rolledBack: existing?.status === 'rolled-back',
      reason: existing?.status === 'rolled-back' ? '此前已回滚' : null,
    };
  }

  const heroId = hitEvent.targetActorId;
  const placement = state.heroPlacements.find((p) => p.heroId === heroId);
  if (!placement) return tossFail(campaign, `Hero ${heroId} 不在 Templars Room 的站位表中`);

  const room = state.snapshot.room;
  const now = params.now ?? nowIso();

  // ---- 步骤 1：掷 d10 并立即保存（先保存后展示）----
  const roll = rollD10(rng) as D10Roll;

  // ---- 步骤 2：d10 → Pit（只来自 Room Definition）----
  const targetPitId = room.pitTossD10Map[roll];
  const pending: PitTossRecord = {
    id: createId('ptoss'),
    battleId: state.battleId,
    sourceActorId: hitEvent.sourceActorId,
    targetHeroId: heroId,
    sourceSkillEventId: hitEvent.skillEventId,
    hitEventId: hitEvent.id,
    roll,
    targetPitId: targetPitId ?? '',
    targetAreaId: '',
    originalAreaId: placement.areaId,
    movementEventId: '',
    roomEffectEventIds: [],
    transactionId,
    status: 'pending',
  };

  if (!targetPitId) {
    return rollback(campaign, state, pending, transactionId, now, `Room Definition 缺少 d10=${roll} 的 Pit 映射`);
  }

  const pit: SpikedPitDefinition | undefined = room.spikedPits.find((p) => p.id === targetPitId);
  if (!pit) {
    return rollback(campaign, state, pending, transactionId, now, `d10=${roll} 指向未定义的 Pit：${targetPitId}`);
  }

  // ---- 步骤 3：容量策略（§17：不静默改投其他 Pit、不重新掷 d10）----
  const occupants = getActorsInSpikedPit(state.spikedPitRuntime, pit.id).filter((id) => id !== heroId);
  const capacity = room.areaCapacities[pit.areaId];
  const gate = canForceEnter(pit, occupants.length, capacity);
  if (!gate.allowed) {
    return rollback(campaign, state, { ...pending, targetAreaId: pit.areaId }, transactionId, now, gate.reason ?? '强制放置被拒绝');
  }

  // ---- 步骤 4：强制位移（原子；先离开原 Area / 原 Pit，§25）----
  const movementEventId = `${transactionId}:move`;
  const movedRuntime = placeActorInPit(removeActorFromPits(state.spikedPitRuntime, heroId), heroId, pit.id);
  const movedPlacements: TemplarsHeroPlacement[] = state.heroPlacements.map((p) =>
    p.heroId === heroId ? { ...p, areaId: pit.areaId, pitId: pit.id } : p,
  );

  const movedRecord: PitTossRecord = {
    ...pending,
    targetAreaId: pit.areaId,
    movementEventId,
    status: 'moved',
  };

  let workingState: TemplarsEncounterState = {
    ...state,
    spikedPitRuntime: movedRuntime,
    heroPlacements: movedPlacements,
  };

  // ---- 步骤 5：触发 on-forced-entry Room Effect（复用正式管线）----
  const pitRuntime = workingState.spikedPitRuntime.find((r) => r.pitDefinitionId === pit.id);
  if (!pitRuntime) {
    return rollback(campaign, state, movedRecord, transactionId, now, `Pit ${pit.id} 缺少 Runtime`);
  }

  const effectTransactionId = templarsTransactionIds.pitEffect(transactionId, pit.id, 'on-forced-entry');
  const hazard = resolveRoomHazardTrigger({
    campaign,
    pit,
    runtime: pitRuntime,
    trigger: 'on-forced-entry',
    actorId: heroId,
    sourceEventId: movementEventId,
    transactionId: effectTransactionId,
    battleId: state.battleId,
    now,
  });

  if (!hazard.ok) {
    return rollback(campaign, state, movedRecord, transactionId, now, hazard.reason ?? 'Room Effect 结算失败');
  }

  workingState = {
    ...workingState,
    spikedPitRuntime: workingState.spikedPitRuntime.map((r) =>
      r.pitDefinitionId === pit.id ? hazard.runtime : r,
    ),
    roomHazardEventHistory: hazard.event
      ? [...workingState.roomHazardEventHistory, hazard.event].slice(-200)
      : workingState.roomHazardEventHistory,
  };

  // ---- 步骤 6：写记录 ----
  const finalRecord: PitTossRecord = {
    ...movedRecord,
    roomEffectEventIds: hazard.event ? [hazard.event.id] : [],
    status: 'effects-resolved',
  };

  let nextState: TemplarsEncounterState = {
    ...workingState,
    pitTossHistory: [...workingState.pitTossHistory, finalRecord].slice(-200),
    templarsBattleRuntime: {
      ...workingState.templarsBattleRuntime,
      lastPitTossTransactionId: transactionId,
    },
  };
  nextState = withProcessedTemplarsTransaction(nextState, transactionId);

  let next: CampaignState = {
    ...hazard.campaign,
    actFourState: { ...hazard.campaign.actFourState, templarsEncounterState: nextState },
    updatedAt: now,
  };
  next = pushLog(
    next,
    `Pit Toss：d10 = ${roll} → ${pit.id}，英雄被掼入 Spiked Pit。`,
    'danger',
  );

  return { ok: true, campaign: next, record: finalRecord, alreadyResolved: false, rolledBack: false, reason: null };
}

/**
 * 整体回滚（硬约束 11）。
 *
 * 回滚的是**游戏状态**（占据者、站位、伤害尚未施加），
 * 但保留 d10 记录以满足「不重新掷骰」：重试时会命中幂等分支。
 */
function rollback(
  campaign: CampaignState,
  originalState: TemplarsEncounterState,
  record: PitTossRecord,
  transactionId: string,
  now: string,
  reason: string,
): ResolvePitTossResult {
  const rolledBackRecord: PitTossRecord = { ...record, status: 'rolled-back' };

  // 使用**回滚前的原始 state**：占据者与站位保持原样，一格都不动。
  let nextState: TemplarsEncounterState = {
    ...originalState,
    pitTossHistory: [...originalState.pitTossHistory, rolledBackRecord].slice(-200),
  };
  nextState = withProcessedTemplarsTransaction(nextState, transactionId);

  let next: CampaignState = {
    ...campaign,
    actFourState: { ...campaign.actFourState, templarsEncounterState: nextState },
    updatedAt: now,
  };
  next = pushLog(next, `Pit Toss 失败并已整体回滚：${reason}`, 'warning');

  return {
    ok: false,
    campaign: next,
    record: rolledBackRecord,
    alreadyResolved: false,
    rolledBack: true,
    reason,
  };
}

function tossFail(campaign: CampaignState, reason: string): ResolvePitTossResult {
  return { ok: false, campaign, record: null, alreadyResolved: false, rolledBack: false, reason };
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

/** 某 Hero 最近一次 Pit Toss 记录。 */
export function getLastPitTossForHero(
  state: TemplarsEncounterState,
  heroId: string,
): PitTossRecord | null {
  for (let i = state.pitTossHistory.length - 1; i >= 0; i -= 1) {
    if (state.pitTossHistory[i].targetHeroId === heroId) return state.pitTossHistory[i];
  }
  return null;
}

/** d10 → Pit 的只读映射（UI / Debug 展示用；来源恒为 Room Definition）。 */
export function getPitTossD10Map(state: TemplarsEncounterState): Record<D10Roll, string> {
  return { ...state.snapshot.room.pitTossD10Map };
}
