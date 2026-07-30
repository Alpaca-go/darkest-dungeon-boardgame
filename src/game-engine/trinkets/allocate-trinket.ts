// Phase 8C：待分配 Trinket 的结算（开发文档 §9.3）。
//
// 玩家的三种选择：
//   assign  —— 指定英雄装备（要求有空余容量）；
//   replace —— 指定英雄丢弃一件既有 Trinket 后装备新的（不存在暂存区）；
//   discard —— 直接丢弃。
//
// 幂等：allocationId 已结算（status !== 'pending'）时原样返回。
// 死亡转移的分配必须先于 Replacement 结算（核心约束 8），
// 由 hasPendingDeathTransfer() 供 stagecoach 判定使用。

import type { CampaignState, PendingTrinketAllocation } from '../../types';
import { pushLog } from '../log';
import { getTrinketById, trinketDisplayName } from '../../data/trinkets/trinket-registry';
import { getFreeTrinketCapacity, getTrinketCapacity } from './capacity';
import {
  addTrinketToHero,
  createTrinketInstance,
  findHero,
  pushTransferRecord,
  removeTrinketFromHero,
} from './trinket-state';

export type TrinketAllocationChoice =
  | { type: 'assign'; heroId: string }
  | { type: 'replace'; heroId: string; replaceInstanceId: string }
  | { type: 'discard' };

export interface AllocateResult {
  campaign: CampaignState;
  error: string | null;
}

/** 队列中第一条待处理分配（UI 强制先进先出）。 */
export function nextPendingAllocation(
  campaign: CampaignState
): PendingTrinketAllocation | undefined {
  return (campaign.pendingTrinketAllocations ?? []).find((a) => a.status === 'pending');
}

/** 是否还有未结算的死亡转移（Replacement 必须等待它清空）。 */
export function hasPendingDeathTransfer(campaign: CampaignState): boolean {
  return (campaign.pendingTrinketAllocations ?? []).some(
    (a) => a.status === 'pending' && a.isDeathTransfer
  );
}

function closeAllocation(
  campaign: CampaignState,
  allocationId: string,
  status: 'resolved' | 'discarded'
): CampaignState {
  return {
    ...campaign,
    pendingTrinketAllocations: (campaign.pendingTrinketAllocations ?? []).map((a) =>
      a.allocationId === allocationId ? { ...a, status } : a
    ),
  };
}

/** 校验一次分配选择是否合法（null = 合法）。 */
export function allocationChoiceError(
  campaign: CampaignState,
  allocationId: string,
  choice: TrinketAllocationChoice
): string | null {
  const alloc = (campaign.pendingTrinketAllocations ?? []).find(
    (a) => a.allocationId === allocationId
  );
  if (!alloc) return '待分配记录不存在';
  if (alloc.status !== 'pending') return '该分配已结算';
  if (choice.type === 'discard') return null;

  const hero = findHero(campaign, choice.heroId);
  if (!hero) return '英雄不存在';
  if (!hero.isAlive || hero.dead) return '阵亡英雄不能接收饰品';
  if (!alloc.candidateHeroIds.includes(hero.instanceId)) return '该英雄不在可接收名单内';

  if (choice.type === 'assign') {
    if (getFreeTrinketCapacity(hero) <= 0) {
      return `${hero.name} 的饰品容量已满（${getTrinketCapacity(hero)}），请选择替换或丢弃`;
    }
    return null;
  }
  // replace
  const owned = (hero.equippedTrinkets ?? []).some(
    (t) => t.instanceId === choice.replaceInstanceId
  );
  if (!owned) return '要替换的饰品不在该英雄身上';
  return null;
}

/**
 * 结算一条待分配 Trinket。
 * 无论成功与否都不会留下「半个状态」：先写规则状态，再写日志。
 */
export function resolveTrinketAllocation(
  campaign: CampaignState,
  allocationId: string,
  choice: TrinketAllocationChoice
): AllocateResult {
  const alloc = (campaign.pendingTrinketAllocations ?? []).find(
    (a) => a.allocationId === allocationId
  );
  if (!alloc) return { campaign, error: '待分配记录不存在' };
  if (alloc.status !== 'pending') return { campaign, error: null }; // 幂等

  const err = allocationChoiceError(campaign, allocationId, choice);
  if (err) return { campaign, error: err };

  const name = trinketDisplayName(alloc.trinketId);

  if (choice.type === 'discard') {
    let next = closeAllocation(campaign, allocationId, 'discarded');
    next = pushTransferRecord(next, {
      trinketId: alloc.trinketId,
      instanceId: alloc.instanceId,
      fromHeroId: alloc.fromHeroId ?? null,
      toHeroId: null,
      reason: 'discard',
    });
    next = pushLog(next, `饰品「${name}」被丢弃。`, 'warning');
    return { campaign: next, error: null };
  }

  const hero = findHero(campaign, choice.heroId)!;
  let next = campaign;
  let replacedNote = '';

  if (choice.type === 'replace') {
    const old = (hero.equippedTrinkets ?? []).find((t) => t.instanceId === choice.replaceInstanceId)!;
    next = removeTrinketFromHero(next, hero.instanceId, choice.replaceInstanceId);
    next = pushTransferRecord(next, {
      trinketId: old.trinketId,
      instanceId: old.instanceId,
      fromHeroId: hero.instanceId,
      toHeroId: null,
      reason: 'replace',
    });
    replacedNote = `，替换掉「${trinketDisplayName(old.trinketId)}」`;
  }

  next = addTrinketToHero(
    next,
    hero.instanceId,
    createTrinketInstance({
      instanceId: alloc.instanceId,
      trinketId: alloc.trinketId,
      source: alloc.source,
      sourceEventId: alloc.sourceEventId,
      questId: alloc.questId,
    })
  );
  next = pushTransferRecord(next, {
    trinketId: alloc.trinketId,
    instanceId: alloc.instanceId,
    fromHeroId: alloc.fromHeroId ?? null,
    toHeroId: hero.instanceId,
    reason: alloc.isDeathTransfer ? 'death-transfer' : 'manual',
  });
  next = closeAllocation(next, allocationId, 'resolved');
  next = pushLog(
    next,
    `${hero.name} 接收了饰品「${name}」（正面）${replacedNote}。`,
    'success'
  );
  return { campaign: next, error: null };
}

/** 主动替换英雄身上的一件 Trinket（Hamlet / 探索阶段的整理操作）。 */
export function replaceEquippedTrinket(
  campaign: CampaignState,
  heroId: string,
  discardInstanceId: string
): AllocateResult {
  const hero = findHero(campaign, heroId);
  if (!hero) return { campaign, error: '英雄不存在' };
  const t = (hero.equippedTrinkets ?? []).find((x) => x.instanceId === discardInstanceId);
  if (!t) return { campaign, error: '该英雄没有这件饰品' };
  let next = removeTrinketFromHero(campaign, heroId, discardInstanceId);
  next = pushTransferRecord(next, {
    trinketId: t.trinketId,
    instanceId: t.instanceId,
    fromHeroId: heroId,
    toHeroId: null,
    reason: 'discard',
  });
  next = pushLog(next, `${hero.name} 丢弃了饰品「${trinketDisplayName(t.trinketId)}」。`, 'info');
  return { campaign: next, error: null };
}

/** 丢弃（语义别名，供 UI 与文档命名一致）。 */
export const discardTrinket = replaceEquippedTrinket;

/** 未知定义的 Trinket 在 UI 上的安全描述（不抛错、不白屏）。 */
export function describeTrinketSafely(trinketId: string): string {
  const def = getTrinketById(trinketId);
  if (!def) return `未知饰品（${trinketId}）：数据缺失，仅可丢弃`;
  return `${def.name}（Lv${def.level}）`;
}
