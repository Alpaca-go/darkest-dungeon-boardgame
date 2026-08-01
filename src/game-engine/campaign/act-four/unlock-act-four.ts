// Phase 10A §6：Act IV 解锁（纯函数）。
//
// 扩展 Phase 9A 的 campaign-progress：第三个 Imminent Threat 被击败后解锁 Darkest Dungeon。
//
// 硬约束对照：
// - 硬约束 2：Campaign Level 保持 III，绝不升到 IV（campaignLevelForAct(4) === 3）；
// - 硬约束 3：解锁后不再抽 Imminent Threat（activeThreatId 清空 +
//   pendingThreatInitialization=false，保证 UI/引擎都不会再触发抽取）；
// - 硬约束 1：不新增 GamePhase —— 解锁只写 campaignProgress 与 actFourState，
//   顶层仍停在既有的 hamlet / quest-select 流程里；
// - §6：保留「第三个 Boss 之后的正常 Hamlet」，所以 Stage 落在
//   post-third-threat-hamlet，而不是直接跳到 Quest 抽取。

import type { CampaignProgressState, CampaignState } from '../../../types';
import type { ActFourState } from '../../../types/act-four';
import { campaignLevelForAct, THREATS_TO_UNLOCK_DARKEST_DUNGEON } from '../campaign-progress';
import { nowIso } from '../../random';
import { pushLog } from '../../log';
import {
  actFourTransactionIds,
  createUnlockedActFourState,
  hasProcessedActFourTransaction,
  withActFourStage,
  withProcessedActFourTransaction,
} from './act-four-state';

/** 解锁结果。ok=false 时 campaign 原样返回，reason 供日志与 Debug 展示。 */
export interface UnlockActFourResult {
  ok: boolean;
  campaign: CampaignState;
  transactionId: string;
  /** 幂等命中（已解锁过）时为 true —— 这不是错误。 */
  alreadyUnlocked: boolean;
  reason: string | null;
}

/**
 * 是否已满足 Act IV 解锁条件（§6）。
 * 判据只有一条：已击败的 Boss Family 数 >= 3。
 * 注意用 Family 而非 Threat —— 同一 Family 可能对应多个 Threat 卡，
 * Phase 9A 的 defeatedBossFamilyIds 已保证去重语义。
 */
export function canUnlockDarkestDungeonAct(progress: CampaignProgressState): boolean {
  return progress.defeatedBossFamilyIds.length >= THREATS_TO_UNLOCK_DARKEST_DUNGEON;
}

/** 距离解锁 Act IV 还差几个 Boss（UI 展示 x / 3 用）。 */
export function remainingBossesBeforeActFour(progress: CampaignProgressState): number {
  return Math.max(
    0,
    THREATS_TO_UNLOCK_DARKEST_DUNGEON - progress.defeatedBossFamilyIds.length,
  );
}

/** 只推进 campaignProgress 的那一半（拆出来便于单测与迁移复用）。 */
export function withDarkestDungeonUnlocked(
  progress: CampaignProgressState,
): CampaignProgressState {
  return {
    ...progress,
    act: 4,
    // 硬约束 2：Act IV 仍是 Campaign Level III。
    campaignLevel: campaignLevelForAct(4),
    darkestDungeonUnlocked: true,
    // §6：解锁后清空当前 Threat，且不再进入「待初始化」——不会再抽新 Threat。
    activeThreatId: null,
    activeBossDefinitionId: null,
    activeBossFamilyId: null,
    pendingThreatInitialization: false,
    // Act IV 没有 Standard Quest / Face the Threat，锁位一并复位，避免旧 UI 误显示。
    bossQuestUnlocked: false,
    bossQuestRequired: false,
    bossQuestCompletedThisAct: true,
    completedStandardQuestsThisAct: 0,
  };
}

/**
 * 解锁 Darkest Dungeon（Act IV）。
 *
 * 幂等键：`act-four-unlock:{campaignId}`。
 * 重复调用（刷新 / 重复点击 / 重放事务）直接返回既有状态，绝不重置已推进的 Stage。
 */
export function unlockDarkestDungeonAct(
  campaign: CampaignState,
  options?: { now?: string },
): UnlockActFourResult {
  const transactionId = actFourTransactionIds.unlock(campaign.id);
  const now = options?.now ?? nowIso();
  const current: ActFourState = campaign.actFourState;

  // ---- 幂等：已处理过该事务 → 原样返回 ----
  if (current.unlocked || hasProcessedActFourTransaction(current, transactionId)) {
    return {
      ok: true,
      campaign,
      transactionId,
      alreadyUnlocked: true,
      reason: null,
    };
  }

  if (!canUnlockDarkestDungeonAct(campaign.campaignProgress)) {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyUnlocked: false,
      reason: `尚未击败 ${THREATS_TO_UNLOCK_DARKEST_DUNGEON} 个 Boss（当前 ${campaign.campaignProgress.defeatedBossFamilyIds.length}）`,
    };
  }

  const progress = withDarkestDungeonUnlocked(campaign.campaignProgress);
  const actFourState = withProcessedActFourTransaction(
    createUnlockedActFourState(now),
    transactionId,
  );

  const unlocked: CampaignState = {
    ...campaign,
    // 顶层 act / campaignLevel / currentThreatId 是 campaignProgress 的只读镜像，
    // 必须同步，否则旧 UI 会读到 Act III 的旧真相。
    act: progress.act,
    campaignLevel: progress.campaignLevel,
    currentThreatId: null,
    campaignProgress: progress,
    // 硬约束 3：Threat 运行时一并清空，UI 不再有 Face the Threat 入口。
    activeThreatRuntime: null,
    actFourState,
    updatedAt: now,
  };
  const logged: CampaignState = pushLog(
    unlocked,
    `Darkest Dungeon（Act IV）已解锁。Campaign Level 保持 III——这是最深的考验。`,
    'success',
  );
  return {
    ok: true,
    campaign: logged,
    transactionId,
    alreadyUnlocked: false,
    reason: null,
  };
}

/**
 * 完成「第三个 Boss 之后的正常 Hamlet」，进入 Darkest Dungeon Quest 抽取阶段（§6 末尾）。
 *
 * 该 Hamlet 完全走既有 Hamlet 引擎（4 Days + Event 照旧），
 * 本函数只做 Stage 推进，不复制任何 Hamlet 逻辑。
 */
export function completePostThirdThreatHamlet(
  campaign: CampaignState,
  options?: { now?: string },
): UnlockActFourResult {
  const transactionId = `act-four-post-threat-hamlet:${campaign.id}`;
  const current = campaign.actFourState;

  if (!current.unlocked) {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyUnlocked: false,
      reason: 'Act IV 尚未解锁',
    };
  }
  if (hasProcessedActFourTransaction(current, transactionId)) {
    return { ok: true, campaign, transactionId, alreadyUnlocked: true, reason: null };
  }
  if (current.stage !== 'post-third-threat-hamlet') {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyUnlocked: false,
      reason: `当前 Stage 为 ${current.stage}，无法完成第三 Boss 后的 Hamlet`,
    };
  }

  const next = withActFourStage(current, 'guardian-quest-selection', transactionId);
  return {
    ok: true,
    campaign: {
      ...campaign,
      actFourState: next,
      updatedAt: options?.now ?? nowIso(),
    },
    transactionId,
    alreadyUnlocked: false,
    reason: null,
  };
}
