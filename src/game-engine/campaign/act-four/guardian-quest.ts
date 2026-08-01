// Phase 10A §13 / §14 / §15：Guardian Quest 容器 + Victory / Failure。
//
// Guardian Quest 是一个 **Boss Quest**：
// - 不能主动离开（canRetreat: false）；
// - 失败 → Campaign Over（campaignFailureOnFailure: true，硬约束 11）；
// - Victory 固定 3 XP；
// - Victory 后不进入普通 Quest Select、不重新抽 Threat，直接进 Final Hamlet（§15）。
//
// 硬约束对照：
// - 硬约束 23：不实现三类 Guardian 的正式技能 —— 本文件只负责「容器 + 状态机 + 幂等」，
//   实际战斗仍由既有 Battle 引擎跑，Guardian 数值来自 prototype harness；
// - 硬约束 20：prototype Guardian 只能用 prototype- 前缀 ID；
// - 硬约束 12：skippedFinalFormId 必须原样保留到 Final Encounter，此处只读不写。

import type { CampaignState } from '../../../types';
import type {
  ActFourState,
  DarkestDungeonGuardianDefinition,
  DarkestDungeonQuestState,
} from '../../../types/act-four';
import type { SkippableFinalFormId } from '../../../types/final-encounter';
import {
  getDarkestDungeonGuardianById,
  isDarkestDungeonOfficialGuardianPoolEnabled,
  validateDarkestDungeonGuardian,
} from '../../../data/darkest-dungeon/guardian-registry';
import {
  DARKEST_DUNGEON_QUEST_XP_REWARD,
  getDarkestDungeonQuestById,
} from '../../../data/darkest-dungeon/quest-registry';
import { earnPartyXp } from '../../progression/xp-ledger';
import { failCampaign } from '../../stagecoach';
import { pushLog } from '../../log';
import { createId, nowIso } from '../../random';
import type { ActFourContentMode } from './draw-quest';
import {
  actFourTransactionIds,
  hasProcessedActFourTransaction,
  withActFourStage,
  withProcessedActFourTransaction,
} from './act-four-state';

// ---------------------------------------------------------------------------
// 创建 Guardian Quest 容器
// ---------------------------------------------------------------------------

export interface CreateGuardianQuestResult {
  ok: boolean;
  campaign: CampaignState;
  quest: DarkestDungeonQuestState | null;
  guardian: DarkestDungeonGuardianDefinition | null;
  alreadyCreated: boolean;
  reason: string | null;
}

/**
 * 由「已抽到的 Quest + 已生成的地图」创建 Guardian Quest 状态。
 *
 * 必须在 drawDarkestDungeonQuest → drawDarkestDungeonLayout → buildDarkestDungeonMap 之后调用。
 */
export function createGuardianQuest(
  campaign: CampaignState,
  options?: { mode?: ActFourContentMode; now?: string },
): CreateGuardianQuestResult {
  const state: ActFourState = campaign.actFourState;
  const mode: ActFourContentMode = options?.mode ?? 'prototype';

  if (state.guardianQuestState) {
    return {
      ok: true,
      campaign,
      quest: state.guardianQuestState,
      guardian: getDarkestDungeonGuardianById(state.guardianQuestState.guardianDefinitionId) ?? null,
      alreadyCreated: true,
      reason: null,
    };
  }

  const questDefinitionId = state.selectedQuestId;
  const guardianId = state.guardianDefinitionId;
  const skipped = state.skippedFinalFormId;
  const layoutId = state.layoutDrawRecord?.selectedLayoutId ?? null;
  const objectiveRoomId = state.bossSlotAssignment?.objectiveRoomSlotId ?? null;

  if (!questDefinitionId) return questFail(campaign, '尚未抽取 Darkest Dungeon Quest');
  if (!guardianId) return questFail(campaign, 'Quest 未指向任何 Guardian');
  if (!skipped || skipped === 'heart-of-darkness') {
    return questFail(campaign, 'Quest 未保存合法的 Skipped Final Form');
  }
  if (!layoutId) return questFail(campaign, '尚未抽取 Layout');
  if (!objectiveRoomId) return questFail(campaign, 'Boss Slot 尚未分配');

  const questDef = getDarkestDungeonQuestById(questDefinitionId);
  if (!questDef) return questFail(campaign, `找不到 Quest 定义 ${questDefinitionId}`);

  const guardian = getDarkestDungeonGuardianById(guardianId);
  if (!guardian) return questFail(campaign, `找不到 Guardian 定义 ${guardianId}`);

  // ---- Data Gate（硬约束 19）----
  if (mode === 'formal' && !isDarkestDungeonOfficialGuardianPoolEnabled()) {
    return questFail(campaign, 'official Guardian 数据缺失，正式 Guardian Quest 已禁用');
  }
  const guardianValidation = validateDarkestDungeonGuardian(guardian);
  if (!guardianValidation.isComplete) {
    return questFail(
      campaign,
      `Guardian ${guardian.id} 数据不完整：${[...guardianValidation.missing, ...guardianValidation.issues].join('；')}`,
    );
  }

  const now = options?.now ?? nowIso();
  const quest: DarkestDungeonQuestState = {
    id: createId('ddq'),
    questDefinitionId,
    guardianDefinitionId: guardian.id,
    skippedFinalFormId: skipped as SkippableFinalFormId,
    layoutId,
    objectiveRoomId,
    status: 'active',
    xpReward: DARKEST_DUNGEON_QUEST_XP_REWARD,
    canRetreat: false,
    campaignFailureOnFailure: true,
    guardianBattleId: null,
    lastTransactionId: null,
  };

  return {
    ok: true,
    campaign: {
      ...campaign,
      actFourState: { ...state, guardianQuestState: quest },
      updatedAt: now,
    },
    quest,
    guardian,
    alreadyCreated: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// 进入 Guardian Room / 开始 Guardian Battle
// ---------------------------------------------------------------------------

export interface StartGuardianBattleResult {
  ok: boolean;
  campaign: CampaignState;
  battleId: string | null;
  alreadyStarted: boolean;
  reason: string | null;
}

/**
 * 进入 Objective Room 并创建 Guardian Battle。
 *
 * 幂等键：`guardian-battle-start:{questId}:{roomId}`。
 * 同一 Room 不重复创建 Boss Battle（§10「复用 Room Reveal 和 Boss Battle Create 幂等」）。
 */
export function startGuardianBattle(
  campaign: CampaignState,
  roomId: string,
  options?: { now?: string },
): StartGuardianBattleResult {
  const state = campaign.actFourState;
  const quest = state.guardianQuestState;
  if (!quest) {
    return { ok: false, campaign, battleId: null, alreadyStarted: false, reason: 'Guardian Quest 尚未创建' };
  }
  if (roomId !== quest.objectiveRoomId) {
    return {
      ok: false,
      campaign,
      battleId: null,
      alreadyStarted: false,
      reason: `Room ${roomId} 不是 Objective Room`,
    };
  }

  const transactionId = actFourTransactionIds.guardianBattleStart(quest.id, roomId);

  if (quest.guardianBattleId || hasProcessedActFourTransaction(state, transactionId)) {
    return {
      ok: quest.guardianBattleId !== null,
      campaign,
      battleId: quest.guardianBattleId,
      alreadyStarted: true,
      reason: quest.guardianBattleId ? null : '事务已处理但缺少 battleId（存档损坏）',
    };
  }

  const battleId = createId('ddbattle');
  const nextQuest: DarkestDungeonQuestState = {
    ...quest,
    status: 'guardian-battle-active',
    guardianBattleId: battleId,
    lastTransactionId: transactionId,
  };

  let next = withProcessedActFourTransaction(
    { ...state, guardianQuestState: nextQuest },
    transactionId,
  );
  next = withActFourStage(next, 'guardian-battle-active', `${transactionId}:stage`);

  return {
    ok: true,
    campaign: {
      ...pushLog(campaign, `Guardian 出现在 Objective Room（${roomId}）。`, 'danger'),
      actFourState: next,
      updatedAt: options?.now ?? nowIso(),
    },
    battleId,
    alreadyStarted: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// §15 Guardian Victory
// ---------------------------------------------------------------------------

export interface GuardianVictoryResult {
  ok: boolean;
  campaign: CampaignState;
  xpAwarded: number;
  alreadyResolved: boolean;
  reason: string | null;
}

/**
 * Guardian 被击败：结算 3 XP → 进入 Final Hamlet（§15）。
 *
 * 幂等键：`guardian-victory:{battleId}`。
 * 注意：**不** 进入普通 Quest Select，**不** 重新抽 Threat，**不** 走普通 Act 推进。
 */
export function resolveGuardianVictory(
  campaign: CampaignState,
  options?: { now?: string },
): GuardianVictoryResult {
  const state = campaign.actFourState;
  const quest = state.guardianQuestState;
  if (!quest) {
    return { ok: false, campaign, xpAwarded: 0, alreadyResolved: false, reason: 'Guardian Quest 尚未创建' };
  }
  const battleId = quest.guardianBattleId;
  if (!battleId) {
    return { ok: false, campaign, xpAwarded: 0, alreadyResolved: false, reason: 'Guardian Battle 尚未开始' };
  }

  const transactionId = actFourTransactionIds.guardianVictory(battleId);
  if (quest.status === 'victory' || hasProcessedActFourTransaction(state, transactionId)) {
    return { ok: true, campaign, xpAwarded: 0, alreadyResolved: true, reason: null };
  }

  // ---- 3 XP：发给仍存活的队伍成员（复用既有 XP 引擎，不另起账本）----
  const eligible = campaign.heroes.filter((h) => !h.dead).map((h) => h.instanceId);
  let next = earnPartyXp(campaign, eligible, quest.xpReward, 'Guardian 胜利');
  next = pushLog(next, 'Guardian 已被击败。踏入最终准备阶段。', 'success');

  const nextQuest: DarkestDungeonQuestState = {
    ...quest,
    status: 'victory',
    lastTransactionId: transactionId,
  };

  let nextState = withProcessedActFourTransaction(
    { ...next.actFourState, guardianQuestState: nextQuest },
    transactionId,
  );
  nextState = withActFourStage(nextState, 'guardian-victory', `${transactionId}:stage`);

  return {
    ok: true,
    campaign: { ...next, actFourState: nextState, updatedAt: options?.now ?? nowIso() },
    xpAwarded: quest.xpReward,
    alreadyResolved: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Guardian Failure（硬约束 11：Campaign Over）
// ---------------------------------------------------------------------------

export interface GuardianFailureResult {
  campaign: CampaignState;
  alreadyFailed: boolean;
}

/**
 * Guardian Quest 失败 → **Campaign Over**，没有替补、没有重试（硬约束 11）。
 * 复用既有 failCampaign()，不另建一套战役失败流程。
 */
export function resolveGuardianFailure(
  campaign: CampaignState,
  reason: string,
  options?: { now?: string },
): GuardianFailureResult {
  const state = campaign.actFourState;
  const quest = state.guardianQuestState;

  if (state.stage === 'campaign-over' || campaign.gamePhase === 'campaign-over') {
    return { campaign, alreadyFailed: true };
  }

  const transactionId = `guardian-failure:${quest?.id ?? campaign.id}`;
  const nextQuest: DarkestDungeonQuestState | null = quest
    ? { ...quest, status: 'failed', lastTransactionId: transactionId }
    : null;

  let nextState: ActFourState = withProcessedActFourTransaction(
    { ...state, guardianQuestState: nextQuest },
    transactionId,
  );
  nextState = withActFourStage(nextState, 'campaign-over', `${transactionId}:stage`);

  const failed = failCampaign(campaign, `Darkest Dungeon Guardian Quest 失败：${reason}`);

  return {
    campaign: { ...failed, actFourState: nextState, updatedAt: options?.now ?? nowIso() },
    alreadyFailed: false,
  };
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

/** Guardian Quest 是否禁止主动撤退（恒 true，UI 用它隐藏「撤退」按钮）。 */
export function isGuardianQuestRetreatBlocked(state: ActFourState): boolean {
  return state.guardianQuestState !== null && state.guardianQuestState.canRetreat === false;
}

/** Guardian Quest 是否已胜利。 */
export function isGuardianDefeated(state: ActFourState): boolean {
  return state.guardianQuestState?.status === 'victory';
}

// ---------------------------------------------------------------------------

function questFail(campaign: CampaignState, reason: string): CreateGuardianQuestResult {
  return { ok: false, campaign, quest: null, guardian: null, alreadyCreated: false, reason };
}
