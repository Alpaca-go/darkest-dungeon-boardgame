// Phase 8B：统一被动收集器（开发文档 §8）。
//
// 从「Hero Quirks + Hero Disease（+ 未来 Trinket）」收集全部被动来源，
// 输出稳定排序后的 PassiveSource 列表。前置修正器与后置反应器共用该列表，
// 因此 Disease 不存在任何专属的平行被动引擎（核心约束 2）。
//
// 依赖方向：stress / damage / healing / battle / quirks → 本模块 → data/*（无环）。

import type {
  DiseaseDefinition,
  HeroInstance,
  PassiveSource,
  QuirkCondition,
  QuirkDefinition,
  RuleDamageSource,
  RuleEventType,
} from '../../types';
import { getQuirkById } from '../../data/quirks';
import { getDiseaseById } from '../../data/diseases';
import { sortPassiveSources } from './passive-ordering';

/** Quirk 的默认优先级（Quirk 定义中没有 priority 字段）。 */
const QUIRK_DEFAULT_PRIORITY = 20;

/** 英雄全部 Quirk id（positive + negative）。 */
export function heroQuirkIds(
  hero: Pick<HeroInstance, 'positiveQuirkIds' | 'negativeQuirkIds'>
): string[] {
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

function quirkSource(def: QuirkDefinition, ownerHeroId: string): PassiveSource {
  return {
    sourceType: 'quirk',
    instanceId: def.id,
    definitionId: def.id,
    priority: QUIRK_DEFAULT_PRIORITY,
    ownerHeroId,
    modifiers: def.modifiers ?? [],
    reactions: def.reactions ?? [],
    name: def.name,
  };
}

function diseaseSource(
  def: DiseaseDefinition,
  instanceId: string,
  ownerHeroId: string
): PassiveSource {
  return {
    sourceType: 'disease',
    instanceId,
    definitionId: def.id,
    priority: def.priority,
    ownerHeroId,
    modifiers: def.modifiers,
    reactions: def.reactions,
    name: def.name,
  };
}

/**
 * 纯函数版收集器：给定 quirk id 列表 + disease 快照，返回稳定排序的被动来源。
 * 战斗内（BattleUnit 快照）与战役层（HeroInstance）共用。
 */
export function collectPassiveSourcesRaw(
  quirkIds: readonly string[],
  disease: { diseaseId: string | null | undefined; instanceId: string | null | undefined },
  ownerHeroId: string,
  /**
   * Phase 9A：额外被动来源（当前用于 Imminent Threat）。
   * 由调用方在战役层解析后传入，收集器本身不认识任何具体来源类型。
   */
  extraSources: readonly PassiveSource[] = []
): PassiveSource[] {
  const sources: PassiveSource[] = resolveQuirkDefs(quirkIds).map((d) => quirkSource(d, ownerHeroId));
  const def = getDiseaseById(disease.diseaseId);
  if (def) {
    sources.push(diseaseSource(def, disease.instanceId ?? def.id, ownerHeroId));
  }
  for (const extra of extraSources) sources.push(extra);
  return sortPassiveSources(sources);
}

/** 战役层收集器：按 HeroInstance 收集 Quirk + Disease 被动。 */
export function collectHeroPassiveSources(hero: HeroInstance): PassiveSource[] {
  return collectPassiveSourcesRaw(
    heroQuirkIds(hero),
    { diseaseId: hero.disease?.diseaseId ?? null, instanceId: hero.disease?.instanceId ?? null },
    hero.instanceId
  );
}

// ---------------------------------------------------------------------------
// 前置修正器（pre-modifier）：只调数值，禁止派生事件
// ---------------------------------------------------------------------------

/** 单条修正命中明细（日志 / 测试断言用）。 */
export interface PassiveModifierApplication {
  sourceType: PassiveSource['sourceType'];
  /** 定义 id（Quirk id / Disease id / Threat id）。 */
  quirkId: string;
  /**
   * Phase 9A：来源实例 id。
   * Threat 效果的实例 id 形如 `${threatId}:${effectKey}`，
   * 供「每次 Hamlet 只生效一次」的消耗记录定位到具体效果。
   */
  instanceId: string;
  /** 展示名。 */
  quirkName: string;
  delta: number;
}

export interface PassiveModifierResult {
  /** 调整后的数值（下限 0）。 */
  amount: number;
  /** 实际生效的修正明细（未命中条件的不在内）。 */
  applied: PassiveModifierApplication[];
}

/** 条件判定（同时声明的条件需全部满足）。 */
export function passiveConditionMet(
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
 * 修正器解析核心（纯函数）：Quirk + Disease 合并后按稳定顺序累加 flatDelta。
 */
export function applyPassiveModifiersRaw(
  quirkIds: readonly string[],
  disease: { diseaseId: string | null | undefined; instanceId: string | null | undefined },
  light: number,
  eventType: RuleEventType,
  baseAmount: number,
  damageSource?: RuleDamageSource,
  extraSources: readonly PassiveSource[] = []
): PassiveModifierResult {
  const applied: PassiveModifierApplication[] = [];
  let amount = baseAmount;
  for (const src of collectPassiveSourcesRaw(quirkIds, disease, '', extraSources)) {
    for (const m of src.modifiers) {
      if (m.eventType !== eventType) continue;
      if (!passiveConditionMet(m.condition, light, damageSource)) continue;
      amount += m.flatDelta;
      applied.push({
        sourceType: src.sourceType,
        quirkId: src.definitionId,
        instanceId: src.instanceId,
        quirkName: src.name,
        delta: m.flatDelta,
      });
    }
  }
  return { amount: Math.max(0, amount), applied };
}

/** 把修正明细拼成日志后缀（无修正时返回空串）。 */
export function describePassiveApplications(applied: PassiveModifierApplication[]): string {
  if (applied.length === 0) return '';
  const parts = applied.map(
    (a) => `${a.quirkName} ${a.delta > 0 ? '+' : ''}${a.delta}`
  );
  return `（被动修正：${parts.join('，')}）`;
}
