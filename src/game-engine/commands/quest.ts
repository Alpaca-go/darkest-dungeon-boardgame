// Phase 11A.2.1 — Quest Production Commands（Finding E 修复：retarget 去重）。
//
// 三个职责：
//   - commitLeaveDungeon（§16）
//   - commitQuestFailureFromDefeat（§16）
//   - commitReturnToHamlet（§17）
//
// Finding E：retargetPendingReplacement 唯一权威实现在 commands/replacement.ts，
// 本文件直接复用，不再保留 inlined 副本。
import type { CampaignState, QuestOutcome } from '../../types';
import { finishQuest, failQuestFromBattle } from '../quest-result';
import { startHamletPhase, hamletEntryBlockedByTrinkets } from '../hamlet';
import { evaluateReplacementFlow } from '../stagecoach';
import { retargetPendingReplacement } from './replacement';
import { finalizeQuestReturnToHamlet } from '../campaign/campaign-orchestrator';

export type QuestCommandError =
  | 'already-resolved'
  | 'no-active-quest'
  | 'no-summary'
  | 'trinket-pending-choice';

export interface QuestCommandResult {
  ok: boolean;
  campaign: CampaignState;
  error: QuestCommandError | null;
}

export type ReplacementResumePhase = 'dungeon-explore' | 'quest-result' | 'hamlet';

// ---------------------------------------------------------------------------
// 1. commitLeaveDungeon（§16）
// ---------------------------------------------------------------------------

/**
 * 主动离开地牢并结算任务。统一搬出 finishQuest + retargetPendingReplacement + evaluateReplacementFlow。
 */
export function commitLeaveDungeon(
  campaign: CampaignState,
  resumePhase: ReplacementResumePhase = 'quest-result',
): QuestCommandResult {
  if (campaign.gamePhase !== 'dungeon-explore' || !campaign.dungeon) {
    return { ok: false, campaign, error: 'no-active-quest' };
  }
  if (campaign.questResultResolved) {
    return { ok: false, campaign, error: 'already-resolved' };
  }
  let next = finishQuest(campaign, 'left');
  if (next === campaign) return { ok: false, campaign: next, error: 'no-active-quest' };
  next = retargetPendingReplacement(next, resumePhase);
  next = evaluateReplacementFlow(next);
  return { ok: true, campaign: next, error: null };
}

// ---------------------------------------------------------------------------
// 2. commitQuestFailureFromDefeat（§16）
// ---------------------------------------------------------------------------

export function commitQuestFailureFromDefeat(
  campaign: CampaignState,
  resumePhase: ReplacementResumePhase = 'quest-result',
): QuestCommandResult {
  if (!campaign.battle || campaign.battle.status !== 'defeat') {
    return { ok: false, campaign, error: 'no-active-quest' };
  }
  let next = failQuestFromBattle(campaign);
  if (next === campaign) return { ok: false, campaign: next, error: 'no-active-quest' };
  next = retargetPendingReplacement(next, resumePhase);
  next = evaluateReplacementFlow(next);
  return { ok: true, campaign: next, error: null };
}

// ---------------------------------------------------------------------------
// 3. commitReturnToHamlet（§17 + Finding D 修复）
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
 *
 * Finding D：若 Trinket Allocation 仍存在未解决玩家选择，
 *   返回 `error: 'trinket-pending-choice'`，**不**返回 ok=true。
 *   Production Engine 不得"清空" Trinket Allocation 来强行进入 Hamlet。
 */
export function commitReturnToHamlet(
  campaign: CampaignState,
  input: ReturnToHamletInput,
  options?: { resolveAllocations?: (c: CampaignState) => CampaignState | null },
): ReturnToHamletResult {
  // 1. Orchestrator 推进（Standard / Boss / Act Advance）
  let next = campaign;
  if (input.questId) {
    const result = finalizeQuestReturnToHamlet(campaign, input);
    if (result.ok) next = result.campaign;
  }

  // 2. 检查 Trinket Allocation 是否有未解决玩家选择。
  //    Finding D：若仍有未解决 pending allocations 且没有提供外部 resolver，
  //    必须返回错误（不允许 Production Engine 自动"清空"）。
  if (hamletEntryBlockedByTrinkets(next)) {
    if (!options?.resolveAllocations) {
      return {
        ok: false,
        campaign: next,
        error: 'trinket-pending-choice',
        outcomeApplied: input.questOutcome,
      };
    }
    const resolved = options.resolveAllocations(next);
    if (resolved) next = resolved;
    else {
      return {
        ok: false,
        campaign: next,
        error: 'trinket-pending-choice',
        outcomeApplied: input.questOutcome,
      };
    }
  }

  // 3. 进入 Hamlet 阶段。
  const next2 = startHamletPhase(next);
  let after: CampaignState = next2 === next ? next : next2;

  // 4. retarget + 5. replacement 始终执行。
  after = retargetPendingReplacement(after, 'hamlet');
  after = evaluateReplacementFlow(after);

  return { ok: true, campaign: after, error: null, outcomeApplied: input.questOutcome };
}
