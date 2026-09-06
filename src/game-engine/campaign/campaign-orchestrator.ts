// Phase 11A.1：Campaign Orchestration Layer（§5）。
//
// 职责：把 Quest lifecycle → Campaign progress → Boss gate → Act advance → Threat lifecycle
//      → Act IV unlock 全部用纯函数串起来。
// 约束（dev doc §4 / §5）：
// - 不读 store、不写存档、不渲染 UI；
// - 不塞 Battle AI / Reward / Hamlet Building 逻辑；
// - 顶层镜像（act / campaignLevel / currentThreatId）由 syncCampaignProgressMirrors 同步；
// - 任何 Campaign 里程碑必须具有稳定 transactionId，重复调用幂等。

import type {
  CampaignAct,
  CampaignProgressState,
  CampaignState,
  QuestOutcome,
} from '../../types';
import {
  THREATS_TO_UNLOCK_DARKEST_DUNGEON,
  campaignLevelForAct,
  canSelectBossQuest,
  canSelectStandardQuest,
  recomputeBossLock,
  withActStarted,
  withStandardQuestCompleted,
  withoutActiveThreat,
} from './campaign-progress';
import {
  drawThreatForCurrentAct,
  shouldDrawThreatForCurrentAct,
  threatDrawTransactionIds,
  withThreatDrawHistory,
} from './threat-selection';
import { createId, nowIso } from '../random';
import { pushLog } from '../log';
import {
  isBossQuestId,
  isStandardQuestId,
} from '../../data/quests';
import {
  FACE_THE_THREAT_QUEST_ID,
} from '../../data/quests/face-the-threat';
import {
  unlockDarkestDungeonAct,
} from './act-four/unlock-act-four';

// ---------------------------------------------------------------------------
// 事务键集中定义（§20）
// ---------------------------------------------------------------------------

/** 统一事务键生成器。 */
export const campaignTransactionIds = {
  actStart: (campaignId: string, act: CampaignAct) => `act-start:${campaignId}:act-${act}`,
  standardComplete: (campaignId: string, questRunId: string) =>
    `standard-complete:${campaignId}:${questRunId}`,
  bossComplete: (campaignId: string, bossQuestId: string) =>
    `boss-complete:${campaignId}:${bossQuestId}`,
  bossVictory: (campaignId: string, bossQuestId: string) =>
    `boss-victory:${campaignId}:${bossQuestId}`,
  bossDefeat: (campaignId: string, bossQuestId: string) =>
    `boss-defeat:${campaignId}:${bossQuestId}`,
  actFourUnlock: (campaignId: string) => `act-four-unlock:${campaignId}`,
} as const;

// ---------------------------------------------------------------------------
// 错误类型
// ---------------------------------------------------------------------------

export type CampaignCommandError =
  | 'standard-locked'
  | 'boss-locked'
  | 'no-active-threat'
  | 'quest-not-found'
  | 'outcome-not-completed'
  | 'wrong-quest-type'
  | 'boss-family-mismatch'
  | 'threat-mismatch'
  | 'boss-already-defeated'
  | 'threat-already-defeated'
  | 'quest-run-already-applied';

export interface CampaignCommandResult {
  ok: boolean;
  campaign: CampaignState;
  transactionId: string;
  /** 已应用（幂等命中）时为 true。 */
  alreadyApplied: boolean;
  error: CampaignCommandError | null;
}

// ---------------------------------------------------------------------------
// 顶层镜像同步（§15）
// ---------------------------------------------------------------------------

/** 顶层 act / campaignLevel / currentThreatId 与 campaignProgress 同步。 */
export function syncCampaignProgressMirrors(campaign: CampaignState): CampaignState {
  const cp = campaign.campaignProgress;
  if (
    campaign.act === cp.act &&
    campaign.campaignLevel === cp.campaignLevel &&
    campaign.currentThreatId === cp.activeThreatId
  ) {
    return campaign;
  }
  return {
    ...campaign,
    act: cp.act,
    campaignLevel: cp.campaignLevel,
    currentThreatId: cp.activeThreatId,
  };
}

// ---------------------------------------------------------------------------
// 事务簿记（§20）
// ---------------------------------------------------------------------------

const TRANSACTION_HISTORY_LIMIT = 100;

function withTransactionRecorded(
  campaign: CampaignState,
  transactionId: string,
): CampaignState {
  if (campaign.processedCampaignTransactionIds.includes(transactionId)) {
    return campaign;
  }
  return {
    ...campaign,
    processedCampaignTransactionIds: [
      ...campaign.processedCampaignTransactionIds,
      transactionId,
    ].slice(-TRANSACTION_HISTORY_LIMIT),
  };
}

function hasTransaction(campaign: CampaignState, transactionId: string): boolean {
  return campaign.processedCampaignTransactionIds.includes(transactionId);
}

// ---------------------------------------------------------------------------
// 1. Act Start（§6.1）
// ---------------------------------------------------------------------------

/**
 * 初始化当前 Act：
 * - 调用 `withActStarted` 推进进度（带 transactionId 幂等）；
 * - 调用 `drawThreatForCurrentAct` 抽取 Threat；
 * - 写入 campaignAdvanceHistory 记录。
 *
 * 注意：
 * - 新 Campaign 默认处于 Act 1 / Level 1 + pendingThreatInitialization=true，
 *   第一次「明确的 Campaign command」（如选择任务）会触发本函数。
 * - 重复调用：transactionId 已存在 → 原状态返回。
 */
export function initializeCampaignAct(
  campaign: CampaignState,
  options?: { now?: string },
): CampaignCommandResult {
  const cp = campaign.campaignProgress;
  const act = cp.act as CampaignAct;
  const now = options?.now ?? nowIso();
  const transactionId = campaignTransactionIds.actStart(campaign.id, act);

  // ---- 幂等：已处理过本事务 ----
  if (hasTransaction(campaign, transactionId)) {
    return {
      ok: true,
      campaign: syncCampaignProgressMirrors(campaign),
      transactionId,
      alreadyApplied: true,
      error: null,
    };
  }

  // ---- 已初始化且 Threat 已存在 → 视为幂等（兼容 createNewCampaign 后立即 selectQuest） ----
  if (cp.activeThreatId !== null && !cp.pendingThreatInitialization) {
    return {
      ok: true,
      campaign: syncCampaignProgressMirrors(withTransactionRecorded(campaign, transactionId)),
      transactionId,
      alreadyApplied: true,
      error: null,
    };
  }

  // ---- 推进进度：act 不变（仍在当前 Act），但 withActStarted 会重置部分字段（幂等检查防止重复） ----
  // 这里不需要 withActStarted（Act 没变），只需要 Threat Draw。
  // 但若 campaignProgress.actStartTransactionIds 为空，标记一次以保持可观测。
  const progress1 = {
    ...cp,
    actStartTransactionIds: [
      ...cp.actStartTransactionIds,
      transactionId,
    ].slice(-50),
  };

  let next: CampaignState = {
    ...campaign,
    campaignProgress: progress1,
    updatedAt: now,
  };

  // ---- 抽 Threat ----
  if (act >= 1 && act <= 3 && !next.campaignProgress.darkestDungeonUnlocked) {
    const drawResult = drawThreatForCurrentAct(next, {
      now,
      transactionId: threatDrawTransactionIds.forAct(campaign.id, act),
    });
    if (!drawResult.ok) {
      return {
        ok: false,
        campaign: next,
        transactionId,
        alreadyApplied: false,
        error:
          drawResult.reason === 'empty-pool'
            ? 'no-active-threat'
            : drawResult.reason === 'invalid-act'
              ? 'standard-locked'
              : 'quest-not-found',
      };
    }
    next = drawResult.campaign;
    if (drawResult.threat) {
      next = withThreatDrawHistory(next, {
        fromAct: act,
        threatId: drawResult.threat.id,
        bossFamilyId: drawResult.threat.bossFamilyId,
        transactionId: drawResult.transactionId,
        at: now,
      });
      next = pushLog(
        next,
        `Imminent Threat 已抽取：${drawResult.threat.name}（家族 ${drawResult.threat.bossFamilyId}）。`,
        'info',
      );
    }
  }

  next = withTransactionRecorded(next, transactionId);
  next = syncCampaignProgressMirrors(next);
  return {
    ok: true,
    campaign: next,
    transactionId,
    alreadyApplied: false,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 2. Quest Selection Gate（§8）
// ---------------------------------------------------------------------------

/** 验证一个 questId 是否可被选中（Engine 层门控）。 */
export function validateQuestSelection(
  campaign: CampaignState,
  questId: string,
): CampaignCommandError | null {
  const cp = campaign.campaignProgress;
  if (cp.darkestDungeonUnlocked) {
    // Act IV：不允许再选 Standard / Boss Quest
    return 'standard-locked';
  }
  if (isStandardQuestId(questId)) {
    return canSelectStandardQuest(cp) ? null : 'standard-locked';
  }
  if (isBossQuestId(questId)) {
    if (!canSelectBossQuest(cp)) {
      return cp.activeThreatId === null ? 'no-active-threat' : 'boss-locked';
    }
    return null;
  }
  return 'quest-not-found';
}

// ---------------------------------------------------------------------------
// 3. Standard Quest 完成（§9）
// ---------------------------------------------------------------------------

/**
 * Standard Quest 完成事务：
 * - 只在 outcome === 'completed' 时计数；
 * - failed / incomplete → 不计数，原状态返回；
 * - 同一 questRunId 重复调用 → 幂等返回。
 */
export function finalizeQuestProgress(
  campaign: CampaignState,
  input: {
    questId: string;
    questRunId: string;
    questOutcome: QuestOutcome;
    now?: string;
  },
): CampaignCommandResult {
  const now = input.now ?? nowIso();
  const transactionId = campaignTransactionIds.standardComplete(
    campaign.id,
    input.questRunId,
  );

  // ---- 幂等 ----
  if (hasTransaction(campaign, transactionId)) {
    return {
      ok: true,
      campaign: syncCampaignProgressMirrors(campaign),
      transactionId,
      alreadyApplied: true,
      error: null,
    };
  }

  if (!isStandardQuestId(input.questId)) {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyApplied: false,
      error: 'wrong-quest-type',
    };
  }

  if (input.questOutcome !== 'completed') {
    return {
      ok: okOutcomeButNoCount(input.questOutcome),
      campaign: withTransactionRecorded(campaign, transactionId),
      transactionId,
      alreadyApplied: false,
      error: 'outcome-not-completed',
    };
  }

  // ---- 推进 campaignProgress：withStandardQuestCompleted（内部已重算 Boss Lock） ----
  const nextProgress = withStandardQuestCompleted(campaign.campaignProgress);

  let next: CampaignState = {
    ...campaign,
    campaignProgress: nextProgress,
    updatedAt: now,
  };

  next = withTransactionRecorded(next, transactionId);
  next = syncCampaignProgressMirrors(next);
  next = pushLog(
    next,
    `Standard Quest 完成计数：${nextProgress.completedStandardQuestsThisAct}/${nextProgress.requiredStandardQuestsBeforeBoss}。`,
    'success',
  );
  return {
    ok: true,
    campaign: next,
    transactionId,
    alreadyApplied: false,
    error: null,
  };
}

/** failed / incomplete 不算错误，只是「不计数」——业务上仍允许通过。 */
function okOutcomeButNoCount(outcome: QuestOutcome): boolean {
  return outcome === 'failed' || outcome === 'incomplete';
}

// ---------------------------------------------------------------------------
// 4. Boss Victory（§11）
// ---------------------------------------------------------------------------

/**
 * 正式 Boss 胜利事务：
 * - 验证 quest = face-the-threat；
 * - 验证 Threat / Boss Family 与 campaignProgress 一致；
 * - 验证 Family / Threat 未被击败过；
 * - 写入 defeatedThreatIds / defeatedBossFamilyIds（去重）；
 * - 清空 active Threat、deactivate ActiveThreatRuntime；
 * - 标记 bossQuestCompletedThisAct = true。
 *
 * 幂等：transactionId（基于 questRunId）已存在 → 原状态返回。
 */
export function finalizeBossVictory(
  campaign: CampaignState,
  input: {
    bossQuestId: string;
    questRunId: string;
    threatId: string;
    bossFamilyId: string;
    now?: string;
  },
): CampaignCommandResult {
  const now = input.now ?? nowIso();
  // Phase 11A.1 §20：事务键必须用 questRunId 而不是纯 questId，因为同一 Boss Quest
  // 在不同 Act 可重复游玩。
  const transactionId = campaignTransactionIds.bossVictory(
    campaign.id,
    input.questRunId,
  );

  // ---- 幂等 ----
  if (hasTransaction(campaign, transactionId)) {
    return {
      ok: true,
      campaign: syncCampaignProgressMirrors(campaign),
      transactionId,
      alreadyApplied: true,
      error: null,
    };
  }
  if (campaign.campaignProgress.bossQuestCompletedThisAct) {
    return {
      ok: true,
      campaign: syncCampaignProgressMirrors(withTransactionRecorded(campaign, transactionId)),
      transactionId,
      alreadyApplied: true,
      error: null,
    };
  }

  if (input.bossQuestId !== FACE_THE_THREAT_QUEST_ID) {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyApplied: false,
      error: 'wrong-quest-type',
    };
  }
  const cp = campaign.campaignProgress;
  if (cp.activeThreatId !== input.threatId) {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyApplied: false,
      error: 'threat-mismatch',
    };
  }
  if (cp.activeBossFamilyId !== input.bossFamilyId) {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyApplied: false,
      error: 'boss-family-mismatch',
    };
  }
  if (cp.defeatedBossFamilyIds.includes(input.bossFamilyId)) {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyApplied: false,
      error: 'boss-already-defeated',
    };
  }
  if (cp.defeatedThreatIds.includes(input.threatId)) {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyApplied: false,
      error: 'threat-already-defeated',
    };
  }

  // ---- 写入：去重后的 defeatedThreatIds / defeatedBossFamilyIds ----
  const newDefeatedThreatIds = cp.defeatedThreatIds.includes(input.threatId)
    ? cp.defeatedThreatIds
    : [...cp.defeatedThreatIds, input.threatId];
  const newDefeatedFamilyIds = cp.defeatedBossFamilyIds.includes(input.bossFamilyId)
    ? cp.defeatedBossFamilyIds
    : [...cp.defeatedBossFamilyIds, input.bossFamilyId];

  // ---- 清空 active Threat、deactivate runtime ----
  const progress1: CampaignProgressState = recomputeBossLock({
    ...withoutActiveThreat(cp),
    defeatedThreatIds: newDefeatedThreatIds,
    defeatedBossFamilyIds: newDefeatedFamilyIds,
    bossQuestCompletedThisAct: true,
  });

  const runtime = campaign.activeThreatRuntime;
  const nextRuntime =
    runtime && runtime.active
      ? {
          ...runtime,
          active: false,
          deactivatedAt: now,
          deactivationTransactionId: transactionId,
        }
      : runtime;

  let next: CampaignState = {
    ...campaign,
    campaignProgress: progress1,
    activeThreatRuntime: nextRuntime,
    currentThreatId: null,
    updatedAt: now,
  };
  next = withTransactionRecorded(next, transactionId);
  next = syncCampaignProgressMirrors(next);
  next = pushLog(
    next,
    `Boss 已被击败：家族 ${input.bossFamilyId}。累计击败家族数 ${newDefeatedFamilyIds.length}。`,
    'success',
  );
  return {
    ok: true,
    campaign: next,
    transactionId,
    alreadyApplied: false,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 5. Act Advance（§12）
// ---------------------------------------------------------------------------

/**
 * Boss 击败后推进 Act：
 * - 当前 act + 1；
 * - 重置 Standard 计数 + 锁；
 * - 抽新 Act 的 Threat（除击败 3 个家族 → 走 Act IV Unlock）。
 * - 重复调用幂等：transactionId 已存在 → 原状态返回。
 */
export function advanceCampaignAfterBoss(
  campaign: CampaignState,
  options?: { now?: string },
): CampaignCommandResult {
  const now = options?.now ?? nowIso();
  const cp = campaign.campaignProgress;
  const currentAct = cp.act as CampaignAct;
  const transactionId = campaignTransactionIds.actStart(
    campaign.id,
    (currentAct + 1) as CampaignAct,
  );

  // ---- 幂等 ----
  if (hasTransaction(campaign, transactionId)) {
    return {
      ok: true,
      campaign: syncCampaignProgressMirrors(campaign),
      transactionId,
      alreadyApplied: true,
      error: null,
    };
  }

  // ---- 第三个 Boss 后 → 走 Act IV Unlock（§13） ----
  if (cp.defeatedBossFamilyIds.length >= THREATS_TO_UNLOCK_DARKEST_DUNGEON && currentAct === 3) {
    const unlockTxId = campaignTransactionIds.actFourUnlock(campaign.id);
    const unlockResult = unlockDarkestDungeonAct(campaign, { now });
    if (!unlockResult.ok) {
      return {
        ok: false,
        campaign: syncCampaignProgressMirrors(campaign),
        transactionId: unlockTxId,
        alreadyApplied: unlockResult.alreadyUnlocked,
        error: 'quest-not-found',
      };
    }
    let next = unlockResult.campaign;
    next = withTransactionRecorded(next, transactionId);
    next = withTransactionRecorded(next, unlockTxId);
    next = syncCampaignProgressMirrors(next);
    return {
      ok: true,
      campaign: next,
      transactionId: unlockTxId,
      alreadyApplied: unlockResult.alreadyUnlocked,
      error: null,
    };
  }

  // ---- 普通 Act Advance ----
  if (currentAct >= 4) {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyApplied: false,
      error: 'standard-locked',
    };
  }
  const nextAct = (currentAct + 1) as CampaignAct;
  if (nextAct > 3) {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyApplied: false,
      error: 'standard-locked',
    };
  }

  // ---- withActStarted 会重置计数 + 设 pendingThreatInitialization ----
  const nextProgress = withActStarted(cp, {
    act: nextAct,
    transactionId,
    now,
  });

  let next: CampaignState = {
    ...campaign,
    campaignProgress: nextProgress,
    act: nextProgress.act,
    campaignLevel: campaignLevelForAct(nextAct),
    currentThreatId: null,
    activeThreatRuntime: null,
    updatedAt: now,
  };

  // ---- 抽新 Act 的 Threat ----
  const drawResult = drawThreatForCurrentAct(next, {
    now,
    transactionId: threatDrawTransactionIds.forAct(campaign.id, nextAct),
  });
  if (!drawResult.ok) {
    return {
      ok: false,
      campaign: next,
      transactionId,
      alreadyApplied: false,
      error:
        drawResult.reason === 'empty-pool'
          ? 'no-active-threat'
          : drawResult.reason === 'invalid-act'
            ? 'standard-locked'
            : 'quest-not-found',
    };
  }
  next = drawResult.campaign;
  if (drawResult.threat) {
    next = withThreatDrawHistory(next, {
      fromAct: nextAct,
      threatId: drawResult.threat.id,
      bossFamilyId: drawResult.threat.bossFamilyId,
      transactionId: drawResult.transactionId,
      at: now,
    });
    next = pushLog(
      next,
      `Act ${nextAct} 开始，Imminent Threat 已抽取：${drawResult.threat.name}。`,
      'success',
    );
  }

  next = withTransactionRecorded(next, transactionId);
  next = syncCampaignProgressMirrors(next);
  return {
    ok: true,
    campaign: next,
    transactionId,
    alreadyApplied: false,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 6. 复合：Quest 结算 → 完整 Campaign 推进（§9 + §10 + §11 + §12）
// ---------------------------------------------------------------------------

/**
 * 一次性 Quest 结算推进：
 * 1. 若 Standard Quest 且 outcome=completed → finalizeQuestProgress；
 * 2. 若 Standard Quest 且 outcome=failed/incomplete → 仅记录、不计数；
 * 3. 若 Boss Quest → 走 finalizeBossVictory → advanceCampaignAfterBoss。
 *
 * 这是 store 层 `returnToHamlet` 唯一应该调用的 Campaign 入口（与
 * headless-shim 的 shimReturnToHamlet 对齐）。
 */
export function finalizeQuestReturnToHamlet(
  campaign: CampaignState,
  input: {
    questId: string;
    questRunId: string;
    questOutcome: QuestOutcome;
    now?: string;
  },
): CampaignCommandResult {
  const now = input.now ?? nowIso();

  if (isStandardQuestId(input.questId)) {
    return finalizeQuestProgress(campaign, {
      questId: input.questId,
      questRunId: input.questRunId,
      questOutcome: input.questOutcome,
      now,
    });
  }
  if (isBossQuestId(input.questId)) {
    if (input.questOutcome === 'failed') {
      // Boss 失败 = Campaign Over（Face the Threat canRetreat=false, campaignFailureOnFailure=true）
      // 不通过 orchestrator 推进；上层会触发 campaignOver，threat/family 也不写。
      return {
        ok: true,
        campaign: withTransactionRecorded(syncCampaignProgressMirrors(campaign), campaignTransactionIds.bossDefeat(campaign.id, input.questRunId)),
        transactionId: campaignTransactionIds.bossDefeat(campaign.id, input.questRunId),
        alreadyApplied: false,
        error: null,
      };
    }
    if (input.questOutcome !== 'completed') {
      return {
        ok: false,
        campaign,
        transactionId: campaignTransactionIds.bossVictory(campaign.id, input.questRunId),
        alreadyApplied: false,
        error: 'outcome-not-completed',
      };
    }
    const bossVictory = finalizeBossVictory(campaign, {
      bossQuestId: input.questId,
      questRunId: input.questRunId,
      threatId: campaign.campaignProgress.activeThreatId ?? '',
      bossFamilyId: campaign.campaignProgress.activeBossFamilyId ?? '',
      now,
    });
    if (!bossVictory.ok) {
      return bossVictory;
    }
    return advanceCampaignAfterBoss(bossVictory.campaign, { now });
  }
  return {
    ok: false,
    campaign,
    transactionId: '',
    alreadyApplied: false,
    error: 'quest-not-found',
  };
}

// ---------------------------------------------------------------------------
// 7. 选择 Quest 复合入口（§5.chooseQuest 提议）
// ---------------------------------------------------------------------------

/**
 * 包装 selectQuest：先做 Quest Gate 校验 + 必要时初始化 Act / Threat，再委托给
 * 引擎侧的 quest 选择流程。
 *
 * 注意：本函数不直接生成 dungeon / 副本任务；那是 selectQuest(c, questId) 的职责。
 */
export function engineChooseQuest(
  campaign: CampaignState,
  questId: string,
  options?: { now?: string },
): CampaignCommandResult {
  // 1. 初始化 Act / Threat（如需要）
  let next: CampaignState = campaign;
  if (shouldDrawThreatForCurrentAct(next) || next.campaignProgress.pendingThreatInitialization) {
    const init = initializeCampaignAct(next, options);
    if (!init.ok) {
      return {
        ok: false,
        campaign: next,
        transactionId: init.transactionId,
        alreadyApplied: false,
        error: init.error,
      };
    }
    next = init.campaign;
  }

  // 2. 校验 Quest 是否可选
  const validation = validateQuestSelection(next, questId);
  if (validation !== null) {
    return {
      ok: false,
      campaign: next,
      transactionId: '',
      alreadyApplied: false,
      error: validation,
    };
  }

  return {
    ok: true,
    campaign: next,
    transactionId: '',
    alreadyApplied: false,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 便捷：创建 questRunId（若调用方未提供）
// ---------------------------------------------------------------------------

export function createQuestRunId(questId: string): string {
  return `${questId}:${createId('run')}`;
}
