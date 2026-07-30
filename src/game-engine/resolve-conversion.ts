// Phase 7 / 8A：Quest 结束时 Virtue/Affliction → 真实 Quirk 转换，
// 以及新 Quest 开始时的精神状态重置。
// 幂等键 = questId + heroId + sourceResolveId：同一 Quest 的同一状态只转换一次，
// 重复调用（刷新 / 重复结算）不会二次发放 Quirk。
// Phase 8A 起：Quirk 走 acquireQuirk 状态机（上限 3 / 替换决策 / Madness Death），
// 并具备真实被动效果，不再是占位数据。

import type { CampaignState, ResolveConversionRecord } from '../types';
import { NEGATIVE_QUIRKS, POSITIVE_QUIRKS, getQuirkById } from '../data/quirks';
import { createId, nowIso, pick } from './random';
import { pushLog } from './log';
import { pushMentalEvent } from './mental-log';
import { acquireQuirk } from './quirks';

/** 转换记录上限（防存档膨胀）。 */
const CONVERSION_RECORD_LIMIT = 100;

/** 幂等判断：该 Quest 中该英雄的该 Resolve 状态是否已转换过。 */
export function hasConversionRecord(
  campaign: CampaignState,
  questId: string,
  heroId: string,
  sourceResolveId: string
): boolean {
  return campaign.resolveConversionRecords.some(
    (r) => r.questId === questId && r.heroId === heroId && r.sourceResolveId === sourceResolveId
  );
}

/**
 * Quest 结束统一入口：把所有仍处于 Virtue/Affliction 的英雄转换为真实 Quirk。
 * - Virtue → 随机正面 Quirk；Affliction → 随机负面 Quirk（排除已拥有的）；
 * - 发放统一走 acquireQuirk（上限 3 / 替换决策 / 第 4 个负面 → Madness Death）；
 * - 转换后英雄回到 normal（清空 virtueId/afflictionId）；
 * - 已死亡英雄不转换（死亡时状态保留在尸体上，无 Quirk 收益）；
 * - 幂等：同一 questId+heroId+sourceResolveId 只发放一次；
 * - resolveTestedThisQuest 不在此处重置（由 resetMentalStateForNewQuest 处理）。
 */
export function convertResolveStatesAtQuestEnd(campaign: CampaignState): CampaignState {
  const questId = campaign.currentQuestId ?? campaign.lastQuestResult?.questId ?? '';
  let next = campaign;

  for (const hero of campaign.heroes) {
    // 每次循环用最新状态（next 可能已被上一次转换更新）
    const fresh = next.heroes.find((h) => h.instanceId === hero.instanceId);
    if (!fresh || fresh.dead || fresh.resolveState === 'normal') continue;

    const from = fresh.resolveState === 'virtuous' ? 'virtue' : 'affliction';
    const sourceResolveId =
      (from === 'virtue' ? fresh.virtueId : fresh.afflictionId) ?? 'unknown';

    // 幂等：已转换过则只清理状态，不再发放
    const already = hasConversionRecord(next, questId, fresh.instanceId, sourceResolveId);

    let grantedQuirkId = '';
    if (!already) {
      const owned = new Set([...fresh.positiveQuirkIds, ...fresh.negativeQuirkIds]);
      const pool = (from === 'virtue' ? POSITIVE_QUIRKS : NEGATIVE_QUIRKS).filter(
        (q) => !owned.has(q.id)
      );
      const fallbackPool = from === 'virtue' ? POSITIVE_QUIRKS : NEGATIVE_QUIRKS;
      const quirk = pool.length > 0 ? pick(pool) : pick(fallbackPool);
      grantedQuirkId = quirk?.id ?? (from === 'virtue' ? 'balanced' : 'nervous');

      const record: ResolveConversionRecord = {
        id: createId('rcv'),
        questId,
        heroId: fresh.instanceId,
        from,
        sourceResolveId,
        grantedQuirkId,
        convertedAt: nowIso(),
      };
      const records = [...next.resolveConversionRecords, record];
      next = {
        ...next,
        resolveConversionRecords:
          records.length > CONVERSION_RECORD_LIMIT
            ? records.slice(records.length - CONVERSION_RECORD_LIMIT)
            : records,
      };
    }

    // 1) 先清理英雄的 Resolve 状态（无论是否已转换过）
    next = {
      ...next,
      heroes: next.heroes.map((h) =>
        h.instanceId === fresh.instanceId
          ? { ...h, resolveState: 'normal' as const, virtueId: null, afflictionId: null }
          : h
      ),
    };

    // 2) 首次转换：走 acquireQuirk 状态机发放（可能产生决策 / Madness Death）
    if (!already && grantedQuirkId) {
      const ev = pushMentalEvent(next, {
        questId,
        heroId: fresh.instanceId,
        type: 'resolve-converted-to-quirk',
        sourceType: 'resolve-effect',
        sourceId: sourceResolveId,
        resultId: grantedQuirkId,
      });
      next = ev.campaign;
      const quirkName = getQuirkById(grantedQuirkId)?.name ?? grantedQuirkId;
      next = pushLog(
        next,
        `${fresh.name} 的 ${from === 'virtue' ? 'Virtue' : 'Affliction'} 转化为怪癖「${quirkName}」。`,
        from === 'virtue' ? 'success' : 'warning'
      );
      next = acquireQuirk(next, fresh.instanceId, grantedQuirkId, {
        source: 'resolve-conversion',
        deathSource: 'quest-result',
        deathResumePhase: 'quest-result',
      }).campaign;
    }
  }

  return next;
}

/**
 * 新 Quest 开始时重置精神状态（在 selectQuest 中调用）：
 * - resolveTestedThisQuest → false（每个 Quest 每英雄一次 Resolve Test）；
 * - 清空 processedStressBatchIds（批次幂等键只在单个 Quest 内有意义）；
 * - 兜底清理未转换的 Virtue/Affliction（正常流程应已在 Quest 结束时转换）。
 * 不重置 stress（压力跨 Quest 保留，靠 Tavern 等手段恢复）。
 */
export function resetMentalStateForNewQuest(campaign: CampaignState): CampaignState {
  return {
    ...campaign,
    processedStressBatchIds: [],
    heroes: campaign.heroes.map((h) =>
      h.dead
        ? h
        : {
            ...h,
            resolveTestedThisQuest: false,
            resolveState: 'normal' as const,
            virtueId: null,
            afflictionId: null,
          }
    ),
  };
}
