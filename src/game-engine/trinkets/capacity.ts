// Phase 8C：Trinket 容量规则（关键规则 1-2）。
//
// 容量 = 英雄等级（1..3），不存在任何形式的公共无限仓库：
// 超出容量的 Trinket 只能「替换既有」或「丢弃」，不会被暂存。

import type { HeroInstance } from '../../types';

/** 容量硬上限（英雄等级上限）。 */
export const MAX_TRINKET_CAPACITY = 3;

/** 英雄的 Trinket 容量 = 等级（防御性 clamp 到 0..3）。 */
export function getTrinketCapacity(hero: Pick<HeroInstance, 'level'>): number {
  const lv = typeof hero.level === 'number' && Number.isFinite(hero.level) ? Math.floor(hero.level) : 1;
  return Math.max(0, Math.min(MAX_TRINKET_CAPACITY, lv));
}

/** 已占用的容量。 */
export function getUsedTrinketCapacity(hero: Pick<HeroInstance, 'equippedTrinkets'>): number {
  return (hero.equippedTrinkets ?? []).length;
}

/** 剩余容量（永不为负）。 */
export function getFreeTrinketCapacity(
  hero: Pick<HeroInstance, 'level' | 'equippedTrinkets'>
): number {
  return Math.max(0, getTrinketCapacity(hero) - getUsedTrinketCapacity(hero));
}

/** 该英雄现在是否还能直接装备一件新 Trinket。 */
export function hasTrinketCapacity(
  hero: Pick<HeroInstance, 'level' | 'equippedTrinkets'>
): boolean {
  return getFreeTrinketCapacity(hero) > 0;
}

/**
 * 容量收缩时的越界检测（例如迁移或后续阶段降级）。
 * 返回超出容量的实例 id（调用方需显式处理，不得静默丢弃）。
 */
export function overCapacityInstanceIds(
  hero: Pick<HeroInstance, 'level' | 'equippedTrinkets'>
): string[] {
  const cap = getTrinketCapacity(hero);
  const list = hero.equippedTrinkets ?? [];
  if (list.length <= cap) return [];
  return list.slice(cap).map((t) => t.instanceId);
}
