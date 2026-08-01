// Phase 10A §22：Campaign Victory 容器。
//
// 规则 31：击败 Heart of Darkness 即赢得整场战役。
//
// 硬约束对照：
// - 硬约束 1：**不新增 GamePhase** —— 顶层仍复用既有 'campaign-over'（route-guards.ts 的
//   Record<GamePhase, string[]> 依赖 GamePhase 封闭，加一个值会连带改动一大片穷举）。
//   胜负由 ActFourStage 区分：'campaign-victory' vs 'campaign-over'，
//   UI 读 isCampaignVictory() 决定渲染「胜利」还是「失败」；
// - 硬约束 4：结算幂等，重复调用不重复发奖励。
//
// 本阶段只做「容器 + 终局标记」：Phase 10A 不实现胜利结算的具体奖励 / 统计页面。

import type { CampaignState } from '../../../types';
import type { ActFourState } from '../../../types/act-four';
import { pushLog } from '../../log';
import { nowIso } from '../../random';
import {
  actFourTransactionIds,
  hasProcessedActFourTransaction,
  withActFourStage,
  withProcessedActFourTransaction,
} from './act-four-state';
import { areAllFinalFormsDefeated } from './final-form-sequence';

/** 战役胜利时写入 campaignOverReason 的固定前缀（UI / E2E 用它区分胜负）。 */
export const CAMPAIGN_VICTORY_REASON_PREFIX = '战役胜利：';

export interface ResolveCampaignVictoryResult {
  ok: boolean;
  campaign: CampaignState;
  alreadyResolved: boolean;
  reason: string | null;
}

/**
 * 结算战役胜利。
 *
 * 幂等键：`campaign-victory:{campaignId}`。
 * 前置：Final Encounter 的三个 Form 全部被击败（最后一个必须是 Heart of Darkness）。
 */
export function resolveCampaignVictory(
  campaign: CampaignState,
  options?: { now?: string },
): ResolveCampaignVictoryResult {
  const state: ActFourState = campaign.actFourState;
  const transactionId = actFourTransactionIds.campaignVictory(campaign.id);

  if (state.stage === 'campaign-victory' || hasProcessedActFourTransaction(state, transactionId)) {
    return { ok: true, campaign, alreadyResolved: true, reason: null };
  }
  if (state.stage === 'campaign-over') {
    return { ok: false, campaign, alreadyResolved: false, reason: '战役已失败，无法结算胜利' };
  }

  const encounter = state.finalEncounterState;
  if (!encounter) {
    return { ok: false, campaign, alreadyResolved: false, reason: 'Final Encounter 尚未开始' };
  }
  if (!areAllFinalFormsDefeated(state)) {
    return {
      ok: false,
      campaign,
      alreadyResolved: false,
      reason: `仍有 Form 未被击败（已击败 ${encounter.defeatedFormIds.length}/${encounter.orderedFormIds.length}）`,
    };
  }

  const now = options?.now ?? nowIso();
  const survivors = campaign.heroes.filter((h) => !h.dead);

  let next: CampaignState = {
    ...campaign,
    // 复用既有终局 GamePhase，不新增枚举值（硬约束 1）。
    gamePhase: 'campaign-over',
    campaignOverReason: `${CAMPAIGN_VICTORY_REASON_PREFIX}Heart of Darkness 已被击败。`,
    battle: null,
    dungeon: null,
    questStatus: 'none',
    updatedAt: now,
  };
  next = pushLog(
    next,
    `Heart of Darkness 归于寂静。${survivors.length} 名英雄活着走出了最深的地牢——战役胜利。`,
    'success',
  );

  let nextState = withProcessedActFourTransaction(
    {
      ...state,
      finalEncounterState: { ...encounter, status: 'victory', lastTransactionId: transactionId },
    },
    transactionId,
  );
  nextState = withActFourStage(nextState, 'campaign-victory', `${transactionId}:stage`);

  return {
    ok: true,
    campaign: { ...next, actFourState: nextState },
    alreadyResolved: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Selector（UI 用它区分「胜利」与「失败」两种终局）
// ---------------------------------------------------------------------------

/** 战役是否以胜利结束。 */
export function isCampaignVictory(campaign: CampaignState): boolean {
  return campaign.actFourState.stage === 'campaign-victory';
}

/** 战役是否以失败结束（Guardian Quest 或 Final Encounter 失败）。 */
export function isCampaignDefeat(campaign: CampaignState): boolean {
  return (
    campaign.gamePhase === 'campaign-over' && campaign.actFourState.stage !== 'campaign-victory'
  );
}

/** 终局结果（三态；未结束为 null）。 */
export function getCampaignOutcome(campaign: CampaignState): 'victory' | 'defeat' | null {
  if (isCampaignVictory(campaign)) return 'victory';
  if (campaign.gamePhase === 'campaign-over') return 'defeat';
  return null;
}
