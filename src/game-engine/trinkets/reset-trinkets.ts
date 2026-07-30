// Phase 8C：返回 Hamlet 时的 Trinket 正面重置（关键规则 6）。
//
// 「小队返回 Hamlet 时，所有 Trinket 重置为 Positive Side。」
// 幂等键 = questId + returnTransactionId：同一次返回重复调用不会重复写日志，
// 也不会因为刷新而产生第二次重置。

import type { CampaignState } from '../../types';
import { pushLog } from '../log';

export interface ResetTrinketsResult {
  campaign: CampaignState;
  /** 实际被翻回正面的实例数量。 */
  flippedCount: number;
  /** 是否因幂等键命中而跳过。 */
  skipped: boolean;
}

export function trinketResetKey(questId: string | null, returnTransactionId: string): string {
  return `${questId ?? 'none'}::${returnTransactionId}`;
}

/**
 * 把全部英雄（含阵亡者，防止死亡转移时把负面带出去）的 Trinket 重置为正面，
 * 并清空 usedTurnId / lastUsedEventId。
 */
export function resetAllTrinketsForHamlet(
  campaign: CampaignState,
  questId: string | null,
  returnTransactionId: string
): ResetTrinketsResult {
  const key = trinketResetKey(questId, returnTransactionId);
  if ((campaign.processedTrinketResetKeys ?? []).includes(key)) {
    return { campaign, flippedCount: 0, skipped: true };
  }

  let flippedCount = 0;
  const heroes = campaign.heroes.map((h) => {
    const list = h.equippedTrinkets ?? [];
    if (list.length === 0) return h;
    let touched = false;
    const reset = list.map((t) => {
      if (t.currentSide === 'positive' && t.usedTurnId === null && t.lastUsedEventId === null) {
        return t;
      }
      if (t.currentSide !== 'positive') flippedCount += 1;
      touched = true;
      return { ...t, currentSide: 'positive' as const, usedTurnId: null, lastUsedEventId: null };
    });
    return touched ? { ...h, equippedTrinkets: reset } : h;
  });

  let next: CampaignState = {
    ...campaign,
    heroes,
    processedTrinketResetKeys: [...(campaign.processedTrinketResetKeys ?? []), key].slice(-200),
  };
  if (flippedCount > 0) {
    next = pushLog(next, `返回 Hamlet：${flippedCount} 件饰品重置为正面。`, 'info');
  }
  return { campaign: next, flippedCount, skipped: false };
}
