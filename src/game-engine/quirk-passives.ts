// Phase 8A：Quirk 前置修正器（pre-modifier）解析。
// Phase 8B 起，本模块成为「统一被动收集器」的战役层门面 ——
// 修正来源同时包含 Quirk 与 Disease（见 rule-events/passive-collector.ts）。
//
// 本模块只做「数值调整」，绝不派生新事件、不调用任何管线 ——
// 这是修正器与反应器（quirks.ts）的边界，也是循环保护的第一道防线。
// 依赖方向：stress/damage/healing/battle → 本模块 → rule-events/* → data/*（无环）。

import type {
  BattleUnit,
  CampaignState,
  HeroInstance,
  RuleDamageSource,
  RuleEventType,
} from '../types';
import {
  applyPassiveModifiersRaw,
  collectHeroPassiveSources,
  describePassiveApplications,
  heroQuirkIds,
  passiveConditionMet,
  resolveQuirkDefs,
  type PassiveModifierApplication,
  type PassiveModifierResult,
} from './rule-events/passive-collector';

export { heroQuirkIds, resolveQuirkDefs, collectHeroPassiveSources };

/** 兼容 Phase 8A 命名。 */
export const quirkConditionMet = passiveConditionMet;

/** 单条修正器命中明细（日志 / 测试断言用）。 */
export type QuirkModifierApplication = PassiveModifierApplication;
export type QuirkModifierResult = PassiveModifierResult;

const NO_DISEASE = { diseaseId: null, instanceId: null } as const;

/**
 * 修正器解析核心（纯函数版本，仅 Quirk）：给定 quirk id 列表 + 光照 + 事件类型，
 * 返回调整后的数值。保留 Phase 8A 签名以兼容既有调用点与测试。
 */
export function applyQuirkModifiersRaw(
  quirkIds: readonly string[],
  light: number,
  eventType: RuleEventType,
  baseAmount: number,
  damageSource?: RuleDamageSource
): QuirkModifierResult {
  return applyPassiveModifiersRaw(quirkIds, NO_DISEASE, light, eventType, baseAmount, damageSource);
}

/**
 * Phase 8B：战斗单位快照版修正器（Quirk + Disease 合并）。
 * 战斗内没有 CampaignState，改由 BattleUnit 上的快照字段驱动。
 */
export function applyUnitPassiveModifiers(
  unit: Pick<BattleUnit, 'quirkIds' | 'diseaseId' | 'diseaseInstanceId'>,
  light: number,
  eventType: RuleEventType,
  baseAmount: number,
  damageSource?: RuleDamageSource
): QuirkModifierResult {
  return applyPassiveModifiersRaw(
    unit.quirkIds ?? [],
    { diseaseId: unit.diseaseId ?? null, instanceId: unit.diseaseInstanceId ?? null },
    light,
    eventType,
    baseAmount,
    damageSource
  );
}

/**
 * 战役层修正器入口：按英雄 instanceId 查找 Quirk + Disease 并应用修正。
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
  return applyPassiveModifiersRaw(
    heroQuirkIds(hero),
    { diseaseId: hero.disease?.diseaseId ?? null, instanceId: hero.disease?.instanceId ?? null },
    campaign.light,
    eventType,
    baseAmount,
    damageSource
  );
}

/** Phase 8B 语义别名（Quirk + Disease + 未来 Trinket）。 */
export const applyPassiveModifiers = applyQuirkModifiers;

/**
 * Resolve Test 的 Virtue 阈值偏移。
 * Balanced +1（更易 Virtue）/ Mercurial -1、Ennui -1（更难），全部叠加。
 */
export function getResolveTestThresholdDelta(campaign: CampaignState, heroInstanceId: string): number {
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId);
  if (!hero || hero.dead) return 0;
  let delta = 0;
  for (const src of collectHeroPassiveSources(hero)) {
    for (const m of src.modifiers) {
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
  return describePassiveApplications(applied);
}
