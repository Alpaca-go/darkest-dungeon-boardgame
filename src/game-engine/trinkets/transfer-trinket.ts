// Phase 8C：Trinket 主动转移（英雄之间互相给予）。
//
// 规则：
// - 目标英雄必须存活且有空余容量（不存在暂存区，核心约束 11）；
// - 战斗中禁止转移（战斗内只允许「使用」）；
// - 主动转移不重置正/负面（只有返回 Hamlet 与死亡转移才强制回正面）。

import type { CampaignState } from '../../types';
import { pushLog } from '../log';
import { trinketDisplayName } from '../../data/trinkets/trinket-registry';
import { getFreeTrinketCapacity, getTrinketCapacity } from './capacity';
import {
  addTrinketToHero,
  findHero,
  pushTransferRecord,
  removeTrinketFromHero,
} from './trinket-state';

export interface TransferResult {
  campaign: CampaignState;
  error: string | null;
}

/** 校验转移是否合法（null = 合法）。 */
export function transferTrinketError(
  campaign: CampaignState,
  fromHeroId: string,
  toHeroId: string,
  instanceId: string
): string | null {
  if (campaign.battle && campaign.battle.status === 'active') return '战斗中不能转移饰品';
  if (fromHeroId === toHeroId) return '不能转移给自己';
  const from = findHero(campaign, fromHeroId);
  const to = findHero(campaign, toHeroId);
  if (!from || !to) return '英雄不存在';
  if (!to.isAlive || to.dead) return '阵亡英雄不能接收饰品';
  if (!(from.equippedTrinkets ?? []).some((t) => t.instanceId === instanceId)) {
    return '该英雄没有这件饰品';
  }
  if (getFreeTrinketCapacity(to) <= 0) {
    return `${to.name} 的饰品容量已满（${getTrinketCapacity(to)}）`;
  }
  return null;
}

/** 在两名英雄之间转移一件 Trinket。 */
export function transferTrinket(
  campaign: CampaignState,
  fromHeroId: string,
  toHeroId: string,
  instanceId: string
): TransferResult {
  const err = transferTrinketError(campaign, fromHeroId, toHeroId, instanceId);
  if (err) return { campaign, error: err };

  const from = findHero(campaign, fromHeroId)!;
  const to = findHero(campaign, toHeroId)!;
  const trinket = (from.equippedTrinkets ?? []).find((t) => t.instanceId === instanceId)!;

  let next = removeTrinketFromHero(campaign, fromHeroId, instanceId);
  // 保留 currentSide：主动转移不是「重置」时机。
  next = addTrinketToHero(next, toHeroId, { ...trinket, usedTurnId: null });
  next = pushTransferRecord(next, {
    trinketId: trinket.trinketId,
    instanceId,
    fromHeroId,
    toHeroId,
    reason: 'manual',
  });
  next = pushLog(
    next,
    `${from.name} 将饰品「${trinketDisplayName(trinket.trinketId)}」交给了 ${to.name}（${
      trinket.currentSide === 'positive' ? '正面' : '负面'
    }）。`,
    'info'
  );
  return { campaign: next, error: null };
}
