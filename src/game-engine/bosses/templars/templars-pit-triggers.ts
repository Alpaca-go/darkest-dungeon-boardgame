// Phase 10B §18 / §19：Spiked Pit 的 Entry / End Turn 触发器（Templars 域封装）。
//
// 硬约束对照：
// - 硬约束 9 / §9：Spiked Pit **不是 BattleActor** —— 它没有 HP、没有 Initiative、
//   不可被选中攻击；它的效果由「Actor 处于该 Area」这一事实触发，
//   而不是由 Pit 自己「行动」触发。因此本模块从不给 Pit 发 Initiative；
// - 硬约束 10 / §9：Pit 的伤害 / 压力**不写在 Body Slam 技能上**，
//   而是来自 Room Definition 的 entryEffects / endTurnEffects；
// - 硬约束 11 / §18：Pit Effect 一律复用既有 Damage / Stress / Death 管线
//   （resolveRoomHazardTrigger → resolveDamage / applyStress），
//   不直接改 HP / Stress，也不绕过 Death's Door 判定；
// - §18：同一 (actor, trigger, sourceEvent) 只结算一次（resolvedTriggerKeys 幂等）。
//
// Entry 触发在 Pit Toss 事务内部完成（见 resolve-pit-toss.ts 步骤 5）；
// 本模块负责**回合结束**这一周期性触发，以及供 UI / 调试使用的只读查询。

import type { CampaignState } from '../../../types';
import type { RoomHazardEvent, RoomHazardTrigger } from '../../../types/room-hazards';
import type { TemplarsEncounterState } from '../../../types/templars';
import { resolveAllPitPeriodicTriggers } from '../../room-hazards';
import { nowIso } from '../../random';
import {
  hasProcessedTemplarsTransaction,
  templarsTransactionIds,
  withProcessedTemplarsTransaction,
} from './templars-runtime';

/**
 * 周期性触发器 —— 只有「回合开始 / 回合结束」属于周期性；
 * `on-forced-entry` / `on-normal-entry` 属于进入事件（在 Pit Toss 事务或移动流程内结算），
 * `on-exit` / `on-condition` 目前无资料来源（§9：无资料不自创效果）。
 */
export type TemplarsPeriodicPitTrigger = Extract<RoomHazardTrigger, 'on-end-turn' | 'on-start-turn'>;

export interface ResolveTemplarsPitTriggerResult {
  ok: boolean;
  campaign: CampaignState;
  state: TemplarsEncounterState | null;
  events: RoomHazardEvent[];
  alreadyResolved: boolean;
  /** 部分 Actor 结算失败的原因（不阻断其余 Actor）。 */
  failures: string[];
  reason: string | null;
}

/**
 * 结算「回合结束」时所有仍在 Spiked Pit 中的 Actor 的 Hazard 效果（§19）。
 *
 * 顺序确定性：按 Room Definition 中的 Pit 顺序 → 各 Pit 内按占据者顺序。
 * 幂等：同一 (battleId, round) 只结算一次；重复调用（含刷新后重放）返回原状态。
 */
export function resolveTemplarsEndTurnPitEffects(
  campaign: CampaignState,
  options?: { now?: string },
): ResolveTemplarsPitTriggerResult {
  return resolveTemplarsPitTrigger(campaign, 'on-end-turn', options);
}

/**
 * 通用周期触发入口。当前只有 `on-end-turn` 有资料来源；
 * `on-start-turn` 在 Room Definition 中恒为空数组
 * （§9：无资料不自创效果），调用它是安全的空操作。
 */
export function resolveTemplarsPitTrigger(
  campaign: CampaignState,
  trigger: TemplarsPeriodicPitTrigger,
  options?: { now?: string },
): ResolveTemplarsPitTriggerResult {
  const actFour = campaign.actFourState;
  const state = actFour.templarsEncounterState;

  if (!state) {
    return {
      ok: false,
      campaign,
      state: null,
      events: [],
      alreadyResolved: false,
      failures: [],
      reason: 'Templars Encounter 尚未 Setup',
    };
  }

  const transactionId = `templars-pit-trigger:${state.battleId}:${trigger}:${state.round}`;
  if (hasProcessedTemplarsTransaction(state, transactionId)) {
    return {
      ok: true,
      campaign,
      state,
      events: [],
      alreadyResolved: true,
      failures: [],
      reason: null,
    };
  }

  const now = options?.now ?? nowIso();
  const pits = state.snapshot.room.spikedPits;

  // 没有 Pit 或没有占据者 → 空操作，但仍记幂等键（避免反复扫描）。
  const occupied = state.spikedPitRuntime.some((r) => r.occupantActorIds.length > 0);
  if (pits.length === 0 || !occupied) {
    const marked = withProcessedTemplarsTransaction(state, transactionId);
    return {
      ok: true,
      campaign: { ...campaign, actFourState: { ...actFour, templarsEncounterState: marked } },
      state: marked,
      events: [],
      alreadyResolved: false,
      failures: [],
      reason: null,
    };
  }

  const result = resolveAllPitPeriodicTriggers({
    campaign,
    pits,
    runtimes: state.spikedPitRuntime,
    trigger,
    sourceEventId: `${trigger}-round-${state.round}`,
    transactionPrefix: templarsTransactionIds.pitEffect(
      state.battleId,
      `${trigger}-round-${state.round}`,
      trigger,
    ),
    battleId: state.battleId,
    now,
  });

  const nextState = withProcessedTemplarsTransaction(
    {
      ...state,
      spikedPitRuntime: result.runtimes,
      roomHazardEventHistory: [...state.roomHazardEventHistory, ...result.events].slice(-200),
    },
    transactionId,
  );

  return {
    ok: true,
    campaign: {
      ...result.campaign,
      actFourState: {
        ...result.campaign.actFourState,
        templarsEncounterState: nextState,
      },
      updatedAt: now,
    },
    state: nextState,
    events: result.events,
    alreadyResolved: false,
    failures: result.failures,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// 只读查询（UI / 测试）
// ---------------------------------------------------------------------------

/** Pit 永远不是 BattleActor —— 该断言用常量固化，供测试与 UI 直接引用（硬约束 9）。 */
export const SPIKED_PIT_IS_BATTLE_ACTOR = false;

/** 某 Hero 当前是否身处任意 Spiked Pit。 */
export function isHeroInAnyPit(state: TemplarsEncounterState, heroId: string): boolean {
  return state.spikedPitRuntime.some((r) => r.occupantActorIds.includes(heroId));
}

/** 某 Pit 当前的占据者（只读）。 */
export function getPitOccupants(state: TemplarsEncounterState, pitDefinitionId: string): string[] {
  return state.spikedPitRuntime.find((r) => r.pitDefinitionId === pitDefinitionId)?.occupantActorIds ?? [];
}

/** 某次触发已产生的 Hazard 事件（按 trigger 过滤，便于断言 Entry vs End Turn）。 */
export function getHazardEventsByTrigger(
  state: TemplarsEncounterState,
  trigger: RoomHazardTrigger,
): RoomHazardEvent[] {
  return state.roomHazardEventHistory.filter((e) => e.trigger === trigger);
}
