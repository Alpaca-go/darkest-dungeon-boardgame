// Phase 10A §16：Final Hamlet（恰好 4 Days，且不抽 Hamlet Event）。
//
// 规则 24 / 25：
// - Guardian 被击败后回到 Hamlet，进行 **恰好 4 天** 的准备；
// - 这 4 天 **不抽 Hamlet Event**（drawHamletEvent 用字面量 false 锁死）。
//
// 硬约束对照：
// - 硬约束 1：不新建第二套 Hamlet 状态机 —— 仍写既有 CampaignState.hamlet，
//   FinalHamletState 只是 Act IV 侧的「4 天账本 + 幂等簿记」；
// - 硬约束 4：随机结果先保存 —— Caretaker 每日阻塞建筑落盘后刷新不重掷；
// - 硬约束 3：不再抽 Imminent Threat；结束后 **不** 回 quest-select，
//   而是进入 final-encounter-ready（与 endHamletDay() 的普通分支刻意不同）。
//
// 注意：Caretaker 每日阻塞是 Hamlet 的**常规每日机制**，不是 Hamlet Event，
// 因此 Final Hamlet 仍然保留（只把「抽 Event」这一步去掉）。

import type { CampaignState, HamletState } from '../../../types';
import type { ActFourState } from '../../../types/act-four';
import type { FinalHamletState } from '../../../types/final-encounter';
import { HAMLET_BUILDINGS, getHamletBuildingById } from '../../../data/hamlet-buildings';
import { pushLog } from '../../log';
import { createId, nowIso } from '../../random';
import {
  actFourTransactionIds,
  hasProcessedActFourTransaction,
  withActFourStage,
  withProcessedActFourTransaction,
} from './act-four-state';
import { createSeededRng, pickIndex } from './rng';

/** 规则 24：Final Hamlet 恰好 4 天，不可被数据覆盖。 */
export const FINAL_HAMLET_TOTAL_DAYS = 4 as const;

type FinalHamletDay = FinalHamletState['currentDay'];

function isFinalHamletDay(day: number): day is FinalHamletDay {
  return day === 1 || day === 2 || day === 3 || day === 4;
}

// ---------------------------------------------------------------------------
// 开始 Final Hamlet
// ---------------------------------------------------------------------------

export interface StartFinalHamletOptions {
  rng?: () => number;
  seed?: number;
  now?: string;
}

export interface StartFinalHamletResult {
  ok: boolean;
  campaign: CampaignState;
  finalHamlet: FinalHamletState | null;
  alreadyStarted: boolean;
  reason: string | null;
}

/**
 * Guardian Victory 之后进入 Final Hamlet。
 *
 * 幂等键：`final-hamlet-start:{campaignId}`。
 * - 恰好 4 天（preparationDays = 4）；
 * - **不抽 Hamlet Event**（currentEventId = null，nextQuestProvisionBonus = 0）；
 * - 清理 dungeon / battle，gamePhase → 'hamlet'（复用既有顶层阶段，不新增 GamePhase）。
 */
export function startFinalHamlet(
  campaign: CampaignState,
  options?: StartFinalHamletOptions,
): StartFinalHamletResult {
  const state: ActFourState = campaign.actFourState;
  const transactionId = actFourTransactionIds.finalHamletStart(campaign.id);

  if (state.finalHamletState || hasProcessedActFourTransaction(state, transactionId)) {
    return {
      ok: state.finalHamletState !== null,
      campaign,
      finalHamlet: state.finalHamletState,
      alreadyStarted: true,
      reason: state.finalHamletState ? null : '事务已处理但缺少 finalHamletState（存档损坏）',
    };
  }

  if (!state.unlocked) {
    return startFail(campaign, 'Act IV 尚未解锁');
  }
  if (state.stage !== 'guardian-victory') {
    return startFail(campaign, `当前阶段 ${state.stage} 不能进入 Final Hamlet（需先击败 Guardian）`);
  }

  const now = options?.now ?? nowIso();
  const rng = options?.rng ?? createSeededRng(options?.seed ?? 0x10a16);
  const blockedBuildingId = pickCaretakerBuilding(rng);

  const finalHamlet: FinalHamletState = {
    status: 'active',
    totalDays: FINAL_HAMLET_TOTAL_DAYS,
    currentDay: 1,
    drawHamletEvent: false,
    completedHeroIdsByDay: {},
    buildingUsageByDay: {},
    completedDayTransactionIds: [],
    lastTransactionId: transactionId,
  };

  // 复用既有 HamletState：不新建第二套 Hamlet 状态机（硬约束 1）。
  const hamlet: HamletState = {
    visitId: createId('hvisit'),
    preparationDays: FINAL_HAMLET_TOTAL_DAYS,
    currentDay: 1,
    caretakerBlockedBuildingId: blockedBuildingId,
    occupiedBuildingIds: [],
    // 规则 25：Final Hamlet 不抽 Hamlet Event。
    currentEventId: null,
    log: [],
    nextQuestProvisionBonus: 0,
  };

  let next: CampaignState = {
    ...campaign,
    heroes: campaign.heroes.map((h) => ({ ...h, hasActedToday: false })),
    dungeon: null,
    battle: null,
    guildVisitSession: null,
    gamePhase: 'hamlet',
    hamlet,
    updatedAt: now,
  };

  next = pushLog(
    next,
    `最后的准备开始：Final Hamlet 共 ${FINAL_HAMLET_TOTAL_DAYS} 天，本次不抽取 Hamlet Event。`,
    'warning',
  );
  next = pushLog(
    next,
    `第 1 天开始，Caretaker 占据了 ${getHamletBuildingById(blockedBuildingId)?.name ?? blockedBuildingId}。`,
    'info',
  );

  let nextState = withProcessedActFourTransaction({ ...state, finalHamletState: finalHamlet }, transactionId);
  nextState = withActFourStage(nextState, 'final-hamlet', `${transactionId}:stage`);

  return {
    ok: true,
    campaign: { ...next, actFourState: nextState },
    finalHamlet,
    alreadyStarted: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// 推进一天
// ---------------------------------------------------------------------------

export interface AdvanceFinalHamletDayResult {
  ok: boolean;
  campaign: CampaignState;
  /** 推进后的当前天（已结束时为 4）。 */
  currentDay: FinalHamletDay;
  /** 4 天是否全部走完。 */
  completed: boolean;
  alreadyProcessed: boolean;
  reason: string | null;
}

/**
 * 结束当前这一天。
 *
 * 幂等键：`final-hamlet-day:{campaignId}:{day}`。
 * - Day 1—3 结束 → currentDay + 1，重置 hasActedToday / occupiedBuildingIds，重掷 Caretaker；
 * - Day 4 结束 → Final Hamlet 完成，Stage 推进到 `final-encounter-ready`。
 *
 * 与 endHamletDay() 的关键差异（硬约束 3）：
 * **绝不**回到 'quest-select'，也不重新抽 Threat / Standard Quest。
 */
export function advanceFinalHamletDay(
  campaign: CampaignState,
  options?: StartFinalHamletOptions,
): AdvanceFinalHamletDayResult {
  const state = campaign.actFourState;
  const finalHamlet = state.finalHamletState;

  if (!finalHamlet) {
    return dayFail(campaign, 1, 'Final Hamlet 尚未开始');
  }
  if (finalHamlet.status === 'completed') {
    return {
      ok: true,
      campaign,
      currentDay: finalHamlet.currentDay,
      completed: true,
      alreadyProcessed: true,
      reason: null,
    };
  }

  const day = finalHamlet.currentDay;
  const transactionId = actFourTransactionIds.finalHamletDay(campaign.id, day);

  if (
    finalHamlet.completedDayTransactionIds.includes(transactionId) ||
    hasProcessedActFourTransaction(state, transactionId)
  ) {
    return {
      ok: true,
      campaign,
      currentDay: finalHamlet.currentDay,
      // 上面已提前返回 status === 'completed' 的分支，此处必然尚未完成。
      completed: false,
      alreadyProcessed: true,
      reason: null,
    };
  }

  const now = options?.now ?? nowIso();
  const heroes = campaign.heroes.map((h) => ({ ...h, hasActedToday: false }));
  // 记录本日已行动的英雄与已占用建筑（刷新恢复用）。
  const completedHeroIdsByDay = {
    ...finalHamlet.completedHeroIdsByDay,
    [day]: campaign.heroes.filter((h) => h.hasActedToday).map((h) => h.instanceId),
  };
  const buildingUsageByDay = {
    ...finalHamlet.buildingUsageByDay,
    [day]: [...campaign.hamlet.occupiedBuildingIds],
  };

  const isLastDay = day >= FINAL_HAMLET_TOTAL_DAYS;

  if (!isLastDay) {
    const nextDayNumber = day + 1;
    if (!isFinalHamletDay(nextDayNumber)) {
      return dayFail(campaign, day, `非法的 Final Hamlet 天数 ${nextDayNumber}`);
    }
    const rng = options?.rng ?? createSeededRng((options?.seed ?? 0x10a16) + nextDayNumber);
    const blockedBuildingId = pickCaretakerBuilding(rng);

    const nextFinalHamlet: FinalHamletState = {
      ...finalHamlet,
      currentDay: nextDayNumber,
      completedHeroIdsByDay,
      buildingUsageByDay,
      completedDayTransactionIds: [...finalHamlet.completedDayTransactionIds, transactionId],
      lastTransactionId: transactionId,
    };

    let next: CampaignState = {
      ...campaign,
      heroes,
      hamlet: {
        ...campaign.hamlet,
        preparationDays: Math.max(0, FINAL_HAMLET_TOTAL_DAYS - day),
        currentDay: nextDayNumber,
        occupiedBuildingIds: [],
        caretakerBlockedBuildingId: blockedBuildingId,
        currentEventId: null,
      },
      updatedAt: now,
    };
    next = pushLog(
      next,
      `Final Hamlet 第 ${day} 天结束。第 ${nextDayNumber} 天开始，Caretaker 占据了 ${
        getHamletBuildingById(blockedBuildingId)?.name ?? blockedBuildingId
      }。`,
      'info',
    );

    return {
      ok: true,
      campaign: {
        ...next,
        actFourState: withProcessedActFourTransaction(
          { ...state, finalHamletState: nextFinalHamlet },
          transactionId,
        ),
      },
      currentDay: nextDayNumber,
      completed: false,
      alreadyProcessed: false,
      reason: null,
    };
  }

  // ---- Day 4 结束：Final Hamlet 完成 ----
  const nextFinalHamlet: FinalHamletState = {
    ...finalHamlet,
    status: 'completed',
    completedHeroIdsByDay,
    buildingUsageByDay,
    completedDayTransactionIds: [...finalHamlet.completedDayTransactionIds, transactionId],
    lastTransactionId: transactionId,
  };

  let next: CampaignState = {
    ...campaign,
    heroes,
    hamlet: {
      ...campaign.hamlet,
      preparationDays: 0,
      occupiedBuildingIds: [],
      caretakerBlockedBuildingId: null,
      currentEventId: null,
    },
    // 硬约束 3：不回 quest-select、不清空 Act IV 进度。
    dungeon: null,
    battle: null,
    updatedAt: now,
  };
  next = pushLog(next, 'Final Hamlet 的 4 天准备结束。再无退路——只剩最深处。', 'danger');

  let nextState = withProcessedActFourTransaction(
    { ...state, finalHamletState: nextFinalHamlet },
    transactionId,
  );
  nextState = withActFourStage(nextState, 'final-encounter-ready', `${transactionId}:stage`);

  return {
    ok: true,
    campaign: { ...next, actFourState: nextState },
    currentDay: FINAL_HAMLET_TOTAL_DAYS,
    completed: true,
    alreadyProcessed: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

/** 当前是否处于 Final Hamlet（UI 用它隐藏「抽 Hamlet Event」相关展示）。 */
export function isFinalHamletActive(state: ActFourState): boolean {
  return state.finalHamletState?.status === 'active';
}

/** Final Hamlet 是否明确禁止抽 Hamlet Event（恒 false 才合法）。 */
export function shouldDrawHamletEvent(state: ActFourState): boolean {
  if (!state.finalHamletState) return true;
  return state.finalHamletState.drawHamletEvent;
}

/** Final Hamlet 进度（day / total）。 */
export function getFinalHamletProgress(state: ActFourState): { day: number; total: number } {
  const h = state.finalHamletState;
  return { day: h?.currentDay ?? 0, total: FINAL_HAMLET_TOTAL_DAYS };
}

/** 是否可以进入 Final Encounter 准备（4 天走完）。 */
export function canPrepareFinalEncounter(state: ActFourState): boolean {
  return state.finalHamletState?.status === 'completed' && state.stage === 'final-encounter-ready';
}

// ---------------------------------------------------------------------------

function pickCaretakerBuilding(rng: () => number): string {
  const index = pickIndex(rng, HAMLET_BUILDINGS.length);
  return HAMLET_BUILDINGS[index === -1 ? 0 : index].id;
}

function startFail(campaign: CampaignState, reason: string): StartFinalHamletResult {
  return { ok: false, campaign, finalHamlet: null, alreadyStarted: false, reason };
}

function dayFail(
  campaign: CampaignState,
  day: FinalHamletDay,
  reason: string,
): AdvanceFinalHamletDayResult {
  return {
    ok: false,
    campaign,
    currentDay: day,
    completed: false,
    alreadyProcessed: false,
    reason,
  };
}
