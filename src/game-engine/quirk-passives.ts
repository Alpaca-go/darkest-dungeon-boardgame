// Phase 8A：Quirk 前置修正器（pre-modifier）解析。
// 本模块只做「数值调整」，绝不派生新事件、不调用任何管线 ——
// 这是修正器与反应器（quirks.ts）的边界，也是循环保护的第一道防线。
// 依赖方向：stress/damage/healing/battle → 本模块 → data/quirks（无环）。

import type {
  CampaignState,
  HeroInstance,
  QuirkCondition,
  QuirkDefinition,
  RuleDamageSource,
  RuleEventType,
} from '../types';
import { getQuirkById } from '../data/quirks';

/** 单条修正器命中明细（日志 / 测试断言用）。 */
export interface QuirkModifierApplication {
  quirkId: string;
  quirkName: string;
  delta: number;
}

export interface QuirkModifierResult {
  /** 调整后的数值（下限 0）。 */
  amount: number;
  /** 实际生效的修正明细（未命中条件的不在内）。 */
  applied: QuirkModifierApplication[];
}

/** 英雄全部 Quirk id（positive + negative）。 */
export function heroQuirkIds(hero: Pick<HeroInstance, 'positiveQuirkIds' | 'negativeQuirkIds'>): string[] {
  return [...hero.positiveQuirkIds, ...hero.negativeQuirkIds];
}

/** 将 quirk id 列表解析为定义（忽略未知 id，不抛错）。 */
export function resolveQuirkDefs(quirkIds: readonly string[]): QuirkDefinition[] {
  const defs: QuirkDefinition[] = [];
  for (const id of quirkIds) {
    const def = getQuirkById(id);
    if (def) defs.push(def);
  }
  return defs;
}

/** 条件判定（同时声明的条件需全部满足）。 */
export function quirkConditionMet(
  cond: QuirkCondition | undefined,
  light: number,
  damageSource?: RuleDamageSource
): boolean {
  if (!cond) return true;
  if (cond.minLight !== undefined && light < cond.minLight) return false;
  if (cond.maxLight !== undefined && light > cond.maxLight) return false;
  if (cond.damageSourceIn !== undefined) {
    if (!damageSource || !cond.damageSourceIn.includes(damageSource)) return false;
  }
  return true;
}

/**
 * 修正器解析核心（纯函数版本）：给定 quirk id 列表 + 光照 + 事件类型，
 * 返回调整后的数值。战斗内（快照）与战役层共用。
 */
export function applyQuirkModifiersRaw(
  quirkIds: readonly string[],
  light: number,
  eventType: RuleEventType,
  baseAmount: number,
  damageSource?: RuleDamageSource
): QuirkModifierResult {
  const applied: QuirkModifierApplication[] = [];
  let amount = baseAmount;
  for (const def of resolveQuirkDefs(quirkIds)) {
    for (const m of def.modifiers ?? []) {
      if (m.eventType !== eventType) continue;
      if (!quirkConditionMet(m.condition, light, damageSource)) continue;
      amount += m.flatDelta;
      applied.push({ quirkId: def.id, quirkName: def.name, delta: m.flatDelta });
    }
  }
  return { amount: Math.max(0, amount), applied };
}

/**
 * 战役层修正器入口：按英雄 instanceId 查找 Quirk 并应用修正。
 * 英雄不存在 / 已死亡时原样返回。
 */
export function applyQuirkModifiers(
  campaign: CampaignState,
  heroInstanceId: string,
  eventType: RuleEventType,
  baseAmount: number,
  damageSource?: RuleDamageSource
): QuirkModifierResult {
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId);
  if (!hero || hero.dead) return { amount: Math.max(0, baseAmount), applied: [] };
  return applyQuirkModifiersRaw(heroQuirkIds(hero), campaign.light, eventType, baseAmount, damageSource);
}

/** Resolve Test 的 Virtue 阈值偏移（Balanced +1 更易 Virtue / Mercurial -1 更难，叠加）。 */
export function getResolveTestThresholdDelta(campaign: CampaignState, heroInstanceId: string): number {
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId);
  if (!hero || hero.dead) return 0;
  let delta = 0;
  for (const def of resolveQuirkDefs(heroQuirkIds(hero))) {
    for (const m of def.modifiers ?? []) {
      if (m.eventType === 'resolve-test') delta += m.flatDelta;
    }
  }
  return delta;
}

/** 静态速度修正（Quick Reflexes +1 / Slow Reflexes -1；进入战斗时叠加）。 */
export function getQuirkSpeedBonus(
  hero: Pick<HeroInstance, 'positiveQuirkIds' | 'negativeQuirkIds'>
): number {
  let bonus = 0;
  for (const def of resolveQuirkDefs(heroQuirkIds(hero))) {
    bonus += def.statModifiers?.speed ?? 0;
  }
  return bonus;
}

/** 把修正明细拼成日志后缀（无修正时返回空串）。 */
export function describeModifierApplications(applied: QuirkModifierApplication[]): string {
  if (applied.length === 0) return '';
  const parts = applied.map((a) => `${a.quirkName} ${a.delta > 0 ? '+' : ''}${a.delta}`);
  return `（怪癖修正：${parts.join('，')}）`;
}
