// Phase 7：Resolve Test（决心检定）。
// 英雄 Stress 第一次达到 10 时进行一次 d10 检定：
//   roll <= virtueThreshold（默认 2）→ Virtue；否则 → Affliction。
// 每个 Quest 每名英雄最多一次；结果先写入状态再交给 UI 展示。

import type {
  CampaignState,
  HeroInstance,
  ResolveEffectDefinition,
  ResolveTestModifiers,
  ResolveTestResult,
} from '../types';
import { d10, pick } from './random';
import { pushLog } from './log';
import { pushMentalEvent } from './mental-log';
import { syncHeroMentalToBattle } from './mental-log';
import { VIRTUES, VIRTUE_FALLBACK_ID, getVirtueById } from '../data/virtues';
import { AFFLICTIONS, AFFLICTION_FALLBACK_ID, getAfflictionById } from '../data/afflictions';
import { STRESS_MAX } from './stress-constants';

/**
 * 计算 Virtue 阈值：roll <= threshold → Virtue。
 * Phase 7 默认 delta = 0（即阈值 2）；Phase 8 的 Quirk/Disease 通过 modifiers 调整。
 * 禁止在页面或多处写死 `roll <= 2`。
 */
export function getVirtueThreshold(
  _hero: HeroInstance,
  modifiers?: Partial<ResolveTestModifiers>
): number {
  const delta = modifiers?.virtueThresholdDelta ?? 0;
  return Math.max(0, Math.min(10, 2 + delta));
}

/**
 * 从数据池随机抽一张卡（可注入 RNG 走 random.ts 的 pick）。
 * 数据池为空时使用 fallback（focused / fearful），fallback 命中会在返回值中标记。
 */
export function drawResolveCard(type: 'virtue' | 'affliction'): {
  card: ResolveEffectDefinition;
  usedFallback: boolean;
} {
  const pool = type === 'virtue' ? VIRTUES : AFFLICTIONS;
  if (pool.length > 0) return { card: pick(pool), usedFallback: false };
  const fallback =
    type === 'virtue' ? getVirtueById(VIRTUE_FALLBACK_ID) : getAfflictionById(AFFLICTION_FALLBACK_ID);
  if (!fallback) throw new Error(`Resolve 卡牌数据池与 fallback 均不可用：${type}`);
  return { card: fallback, usedFallback: true };
}

export interface PerformResolveTestOutput {
  campaign: CampaignState;
  result: ResolveTestResult | null;
  /** 前置条件不满足时的原因（不静默修改数据）。 */
  skippedReason?: string;
}

/**
 * 执行 Resolve Test（前置条件不满足时返回 skippedReason，不修改数据）：
 * 掷 d10 → 决定 Virtue/Affliction → 抽卡 → 写状态（stress 重置 0、
 * resolveTestedThisQuest=true、lastResolveQuestId）→ 写事件与日志 → 同步战斗单位。
 * 注意：stress 重置为 0 不会再次触发阈值（直接赋值，不走 applyStress）。
 */
export function performResolveTest(
  campaign: CampaignState,
  heroInstanceId: string,
  modifiers?: Partial<ResolveTestModifiers>
): PerformResolveTestOutput {
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId);
  const questId = campaign.currentQuestId;
  if (!hero) return { campaign, result: null, skippedReason: '英雄不存在' };
  if (hero.dead) return { campaign, result: null, skippedReason: '英雄已死亡' };
  if (hero.stress < STRESS_MAX) {
    return { campaign, result: null, skippedReason: `Stress 未达到 ${STRESS_MAX}` };
  }
  if (hero.resolveTestedThisQuest) {
    return { campaign, result: null, skippedReason: '本 Quest 已进行过 Resolve Test' };
  }
  if (!questId) return { campaign, result: null, skippedReason: '当前没有进行中的 Quest' };

  const threshold = getVirtueThreshold(hero, modifiers);
  const roll = d10();
  let outcome: 'virtue' | 'affliction' = roll <= threshold ? 'virtue' : 'affliction';
  // 未来接口预留：本阶段无正常玩法来源
  if (modifiers?.forceVirtue) outcome = 'virtue';
  if (modifiers?.forceAffliction) outcome = 'affliction';

  const { card, usedFallback } = drawResolveCard(outcome);

  const result: ResolveTestResult = {
    heroId: hero.instanceId,
    questId,
    roll,
    outcome,
    virtueThreshold: threshold,
    cardId: card.id,
    resolveState: outcome === 'virtue' ? 'virtuous' : 'afflicted',
  };

  // 1) 写英雄状态（规则结果先落地，UI 只做展示层）
  let next: CampaignState = {
    ...campaign,
    heroes: campaign.heroes.map((h) =>
      h.instanceId === hero.instanceId
        ? {
            ...h,
            stress: 0, // Resolve Test 后重置；直接赋值，不得再次触发阈值
            resolveTestedThisQuest: true,
            resolveState: result.resolveState,
            virtueId: outcome === 'virtue' ? card.id : null,
            afflictionId: outcome === 'affliction' ? card.id : null,
            lastResolveQuestId: questId,
          }
        : h
    ),
  };

  // 2) 精神事件：resolve-test + virtue/affliction-gained
  const e1 = pushMentalEvent(next, {
    questId,
    heroId: hero.instanceId,
    type: 'resolve-test',
    sourceType: 'resolve-effect',
    roll,
    resultId: card.id,
  });
  next = e1.campaign;
  const e2 = pushMentalEvent(next, {
    questId,
    heroId: hero.instanceId,
    type: outcome === 'virtue' ? 'virtue-gained' : 'affliction-gained',
    sourceType: 'resolve-effect',
    sourceId: card.id,
    resultId: card.id,
  });
  next = e2.campaign;

  // 3) 页面日志
  next = pushLog(
    next,
    `${hero.name} 进行 Resolve Test：d10 = ${roll}（阈值 ${threshold}）→ ` +
      `获得 ${outcome === 'virtue' ? 'Virtue' : 'Affliction'}：${card.name}，Stress 重置为 0。`,
    outcome === 'virtue' ? 'success' : 'warning'
  );
  if (usedFallback) {
    next = pushLog(next, `[开发] Resolve 卡池为空，使用 fallback 卡牌 ${card.id}。`, 'warning');
  }

  // 4) 同步进行中的战斗单位
  next = syncHeroMentalToBattle(next, hero.instanceId);

  return { campaign: next, result };
}
