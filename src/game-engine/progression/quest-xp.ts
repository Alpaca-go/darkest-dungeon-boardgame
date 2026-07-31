import type { CampaignState, QuestXpResult } from '../../types';
import { nowIso } from '../random';
import { pushLog } from '../log';
import { earnPartyXp } from './xp-ledger';
import { applyQuestXpToStagecoach } from '../stagecoach';
import { eligibleXpHeroIds } from './quest-objectives';

// ---------------------------------------------------------------------------
// Phase 8D：返回 Hamlet 时的 Quest XP 发放
//
// 规则 2：XP 在小队回到 Hamlet 时统一发放（quest-result 阶段只结算不发放）。
// 规则 3：所有合格英雄获得相同 XP。
// 规则 4：Stagecoach 同时累计相同 XP（不是队伍总和）。
// 规则 13：Stagecoach XP 只增不减，招募 / 升级都不会扣它。
// 幂等：pendingQuestXp.distributed 为 true 或已不存在时不会二次发放。
// ---------------------------------------------------------------------------

/** 发放结果（含是否真正发生了发放，便于 UI 提示与测试断言）。 */
export interface DistributeQuestXpOutcome {
  campaign: CampaignState;
  distributed: boolean;
  result: QuestXpResult | null;
}

/**
 * 发放当前挂起的 Quest XP。回到 Hamlet 的单一入口调用，幂等。
 * 合格英雄在发放时刻重新计算（回程途中不会再有人阵亡，但保持规则可推导）。
 */
export function distributeQuestXp(campaign: CampaignState): DistributeQuestXpOutcome {
  const pending = campaign.pendingQuestXp;
  if (!pending || pending.distributed) {
    return { campaign, distributed: false, result: null };
  }

  const heroIds = eligibleXpHeroIds(campaign);
  const finalResult: QuestXpResult = {
    ...pending,
    eligibleHeroIds: heroIds,
    distributed: true,
    distributedAt: nowIso(),
  };

  let next: CampaignState = { ...campaign };

  if (pending.xpPerHero > 0 && heroIds.length > 0) {
    next = earnPartyXp(
      next,
      heroIds,
      pending.xpPerHero,
      `任务「${pending.questName}」完成 ${pending.completedObjectiveCount} 个 Objective`
    );
  } else {
    next = pushLog(
      next,
      `任务「${pending.questName}」未完成任何 Objective，本次不获得 XP。`,
      'warning'
    );
  }

  // Stagecoach 与英雄获得相同 XP（幂等标记在 applyQuestXpToStagecoach 内部处理）。
  next = applyQuestXpToStagecoach(next, pending.stagecoachXp);

  next = {
    ...next,
    pendingQuestXp: null,
    questXpResults: [...next.questXpResults, finalResult].slice(-50),
  };

  return { campaign: next, distributed: true, result: finalResult };
}
