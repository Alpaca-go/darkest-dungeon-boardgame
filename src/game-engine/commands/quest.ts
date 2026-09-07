// Phase 11A.2 §16–§17 — Quest Production Commands。
//
// 三个职责：
//   - commitLeaveDungeon（§16）
//   - commitQuestFailureFromDefeat（§16）
//   - commitReturnToHamlet（§17，组合 finalizeQuestReturnToHamlet + Trinket + startHamletPhase）
//
// Store 不再自行串这些步骤。
import type { CampaignState, QuestOutcome } from '../../types';
import { finishQuest, failQuestFromBattle } from '../quest-result';
import { startHamletPhase, hamletEntryBlockedByTrinkets } from '../hamlet';
import { evaluateReplacementFlow } from '../stagecoach';
import { resolveAllPendingTrinketAllocations } from './trinket';
import { finalizeQuestReturnToHamlet } from '../campaign/campaign-orchestrator';

export type QuestCommandError =
  | 'already-resolved'
  | 'no-active-quest'
  | 'no-summary';

export interface QuestCommandResult {
  ok: boolean;
  campaign: CampaignState;
  error: QuestCommandError | null;
}

// ---------------------------------------------------------------------------
// 1. retargetPendingReplacement（§18 正式导出；保留在 replacement.ts）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 2. commitLeaveDungeon（§16）
// ---------------------------------------------------------------------------

/**
 * 主动离开地牢并结算任务。统一搬出 finishQuest + retargetPendingReplacement + evaluateReplacementFlow。
 */
export function commitLeaveDungeon(
  campaign: CampaignState,
  resumePhase: 'dungeon-explore' | 'quest-result' | 'hamlet' = 'quest-result',
): QuestCommandResult {
  if (campaign.gamePhase !== 'dungeon-explore' || !campaign.dungeon) {
    return { ok: false, campaign, error: 'no-active-quest' };
  }
  if (campaign.questResultResolved) {
    return { ok: false, campaign, error: 'already-resolved' };
  }
  let next = finishQuest(campaign, 'left');
  if (next === campaign) return { ok: false, campaign: next, error: 'no-active-quest' };
  next = retargetPendingReplacementInternal(next, resumePhase);
  next = evaluateReplacementFlow(next);
  return { ok: true, campaign: next, error: null };
}

// ---------------------------------------------------------------------------
// 3. commitQuestFailureFromDefeat（§16）
// ---------------------------------------------------------------------------

export function commitQuestFailureFromDefeat(
  campaign: CampaignState,
  resumePhase: 'dungeon-explore' | 'quest-result' | 'hamlet' = 'quest-result',
): QuestCommandResult {
  if (!campaign.battle || campaign.battle.status !== 'defeat') {
    return { ok: false, campaign, error: 'no-active-quest' };
  }
  let next = failQuestFromBattle(campaign);
  if (next === campaign) return { ok: false, campaign: next, error: 'no-active-quest' };
  next = retargetPendingReplacementInternal(next, resumePhase);
  next = evaluateReplacementFlow(next);
  return { ok: true, campaign: next, error: null };
}

// ---------------------------------------------------------------------------
// 4. commitReturnToHamlet（§17）
// ---------------------------------------------------------------------------

export interface ReturnToHamletInput {
  questId: string;
  questRunId: string;
  questOutcome: QuestOutcome;
}

export interface ReturnToHamletResult extends QuestCommandResult {
  /** 实际应用的 quest outcome（failed/incomplete 仍走 transaction 簿记但不计数）。 */
  outcomeApplied: QuestOutcome;
}

/**
 * 一次性组合：
 *   1. finalizeQuestReturnToHamlet（Campaign Orchestrator 推进）
 *   2. Trinket Allocation blocker 解决
 *   3. startHamletPhase
 *   4. retargetPendingReplacement（如果需要）
 *   5. evaluateReplacementFlow
 */
export function commitReturnToHamlet(
  campaign: CampaignState,
  input: ReturnToHamletInput,
): ReturnToHamletResult {
  // 1. Orchestrator 推进（Standard / Boss / Act Advance）
  let next = campaign;
  // 1. orchestrator 推进（Standard / Boss / Act Advance）。
  if (input.questId) {
    const result = finalizeQuestReturnToHamlet(campaign, input);
    if (result.ok) next = result.campaign;
  }

  // 2. 强制结清所有 Trinket Allocation（避免 quest-result 页面在 headless 下空转）。
  if (hamletEntryBlockedByTrinkets(next)) {
    next = resolveAllPendingTrinketAllocations(next);
  }

  // 3. 进入 Hamlet 阶段。
  const next2 = startHamletPhase(next);
  let after: CampaignState = next2 === next ? next : next2;

  // 4. retarget + 5. replacement 始终执行（即使 startHamletPhase 拒绝前进）。
  after = retargetPendingReplacementInternal(after, 'hamlet');
  after = evaluateReplacementFlow(after);

  return { ok: true, campaign: after, error: null, outcomeApplied: input.questOutcome };
}

// ---------------------------------------------------------------------------
// 内部 helpers
// ---------------------------------------------------------------------------

/**
 * §18 正式导出 retargetPendingReplacement 的实现。
 * 这里是 inlined 实现以避免循环 import；正式 re-export 在 commands/index.ts 与
 * commands/replacement.ts 双重暴露。
 */
function retargetPendingReplacementInternal(
  c: CampaignState,
  resumePhase: 'dungeon-explore' | 'quest-result' | 'hamlet',
): CampaignState {
  const pending = c.stagecoach.pendingReplacement;
  if (!pending || pending.resolved || pending.resumePhase === resumePhase) return c;
  return {
    ...c,
    stagecoach: {
      ...c.stagecoach,
      pendingReplacement: { ...pending, resumePhase },
    },
  };
}
