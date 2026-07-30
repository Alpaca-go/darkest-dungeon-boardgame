// Phase 8C：Trinket 获取状态机（开发文档 §9）。
//
// 单一入口 acquireTrinket：Loot / Quest Reward / Nomad Wagon / 死亡转移 / Debug
// 全部走这里，保证幂等、容量、记录、日志规则只有一份实现。
//
// 状态流转：
//   acquireTrinket
//     ├─ 已处理过的 sourceEventId        → duplicate-event-ignored（原样返回）
//     ├─ 未知 trinketId                  → discarded-unknown-trinket（安全丢弃，不白屏）
//     ├─ 指定英雄且有容量                → equipped（直接装备，Positive 面）
//     ├─ 有存活英雄                      → pending-allocation（进入待分配队列）
//     └─ 无任何存活英雄                  → discarded-no-candidate

import type {
  CampaignState,
  PendingTrinketAllocation,
  TrinketAcquisitionOutcome,
  TrinketAcquisitionRecord,
  TrinketSourceKind,
} from '../../types';
import { createId, nowIso } from '../random';
import { pushLog } from '../log';
import { getTrinketById, trinketDisplayName } from '../../data/trinkets/trinket-registry';
import { hasTrinketCapacity } from './capacity';
import {
  addTrinketToHero,
  aliveHeroIds,
  createTrinketInstance,
  findHero,
  isTrinketEventProcessed,
  markTrinketEventProcessed,
  pushAcquisitionRecord,
  pushTransferRecord,
} from './trinket-state';

export interface AcquireTrinketCommand {
  trinketId: string;
  source: TrinketSourceKind;
  /** 幂等键：同一来源事件重复调用不会重复发卡。 */
  sourceEventId: string;
  questId?: string | null;
  /** 指定归属英雄；不传或容量不足时进入待分配。 */
  heroId?: string;
  /** 死亡转移专用信息。 */
  fromHeroId?: string;
  fromHeroName?: string;
  isDeathTransfer?: boolean;
  /** 复用已生成的实例 id（死亡转移保留原实例）。 */
  instanceId?: string;
}

export interface AcquireTrinketResult {
  campaign: CampaignState;
  outcome: TrinketAcquisitionOutcome;
  record: TrinketAcquisitionRecord | null;
  allocationId: string | null;
  instanceId: string | null;
}

function done(
  campaign: CampaignState,
  outcome: TrinketAcquisitionOutcome,
  record: TrinketAcquisitionRecord | null,
  allocationId: string | null,
  instanceId: string | null
): AcquireTrinketResult {
  return { campaign, outcome, record, allocationId, instanceId };
}

export function acquireTrinket(
  campaign: CampaignState,
  cmd: AcquireTrinketCommand
): AcquireTrinketResult {
  const questId = cmd.questId ?? campaign.currentQuestId ?? null;

  // 1) 幂等
  if (cmd.sourceEventId && isTrinketEventProcessed(campaign, cmd.sourceEventId)) {
    return done(campaign, 'duplicate-event-ignored', null, null, null);
  }

  // 2) 未知定义 → 安全丢弃（核心约束 10：不得白屏）
  const def = getTrinketById(cmd.trinketId);
  if (!def) {
    let next = markTrinketEventProcessed(campaign, cmd.sourceEventId);
    const out = pushAcquisitionRecord(next, {
      trinketId: cmd.trinketId,
      instanceId: '',
      heroId: null,
      heroName: null,
      questId,
      source: cmd.source,
      sourceEventId: cmd.sourceEventId,
      outcome: 'discarded-unknown-trinket',
    });
    next = pushLog(
      out.campaign,
      `获得了无法识别的饰品（${cmd.trinketId}），已安全丢弃。`,
      'warning'
    );
    return done(next, 'discarded-unknown-trinket', out.record, null, null);
  }

  const instanceId = cmd.instanceId ?? createId('trk');

  // 3) 指定英雄且有容量 → 直接装备
  const target = cmd.heroId ? findHero(campaign, cmd.heroId) : undefined;
  if (target && target.isAlive && !target.dead && hasTrinketCapacity(target)) {
    let next = markTrinketEventProcessed(campaign, cmd.sourceEventId);
    next = addTrinketToHero(
      next,
      target.instanceId,
      createTrinketInstance({
        instanceId,
        trinketId: def.id,
        source: cmd.source,
        sourceEventId: cmd.sourceEventId,
        questId,
      })
    );
    next = pushTransferRecord(next, {
      trinketId: def.id,
      instanceId,
      fromHeroId: cmd.fromHeroId ?? null,
      toHeroId: target.instanceId,
      reason: cmd.isDeathTransfer ? 'death-transfer' : 'manual',
    });
    const out = pushAcquisitionRecord(next, {
      trinketId: def.id,
      instanceId,
      heroId: target.instanceId,
      heroName: target.name,
      questId,
      source: cmd.source,
      sourceEventId: cmd.sourceEventId,
      outcome: 'equipped',
    });
    next = pushLog(out.campaign, `${target.name} 装备了饰品「${def.name}」（正面）。`, 'success');
    return done(next, 'equipped', out.record, null, instanceId);
  }

  // 4) 找候选英雄
  const candidates = aliveHeroIds(campaign, cmd.fromHeroId);
  if (candidates.length === 0) {
    let next = markTrinketEventProcessed(campaign, cmd.sourceEventId);
    const out = pushAcquisitionRecord(next, {
      trinketId: def.id,
      instanceId,
      heroId: null,
      heroName: null,
      questId,
      source: cmd.source,
      sourceEventId: cmd.sourceEventId,
      outcome: 'discarded-no-candidate',
    });
    next = pushLog(
      out.campaign,
      `没有可以接收「${def.name}」的英雄，饰品被丢弃。`,
      'warning'
    );
    return done(next, 'discarded-no-candidate', out.record, null, null);
  }

  // 5) 进入待分配队列（刷新可恢复，核心约束 7）
  const allocation: PendingTrinketAllocation = {
    allocationId: createId('talloc'),
    trinketId: def.id,
    instanceId,
    source: cmd.source,
    sourceEventId: cmd.sourceEventId,
    questId,
    createdAt: nowIso(),
    fromHeroId: cmd.fromHeroId,
    fromHeroName: cmd.fromHeroName,
    candidateHeroIds: candidates,
    status: 'pending',
    isDeathTransfer: cmd.isDeathTransfer === true,
  };

  let next = markTrinketEventProcessed(campaign, cmd.sourceEventId);
  next = {
    ...next,
    pendingTrinketAllocations: [...(next.pendingTrinketAllocations ?? []), allocation],
  };
  const out = pushAcquisitionRecord(next, {
    trinketId: def.id,
    instanceId,
    heroId: null,
    heroName: null,
    questId,
    source: cmd.source,
    sourceEventId: cmd.sourceEventId,
    outcome: 'pending-allocation',
  });
  next = pushLog(
    out.campaign,
    cmd.isDeathTransfer
      ? `${cmd.fromHeroName ?? '阵亡英雄'} 的饰品「${def.name}」等待同伴接收。`
      : `获得饰品「${trinketDisplayName(def.id)}」，等待分配。`,
    'info'
  );
  return done(next, 'pending-allocation', out.record, allocation.allocationId, instanceId);
}
