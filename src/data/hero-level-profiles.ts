import type { HeroLevelProfile } from '../types';

// Phase 6：每个可替补英雄的最小三等级 Profile（data-driven，禁止组件内公式）。
// Level 1 与 heroes.ts baseLife/speed 一致；2/3 级数值为本原型的手工数据。
export const HERO_LEVEL_PROFILES: Record<string, HeroLevelProfile[]> = {
  crusader: [
    { level: 1, maxHp: 42, speed: 2 },
    { level: 2, maxHp: 50, speed: 2 },
    { level: 3, maxHp: 58, speed: 3 },
  ],
  vestal: [
    { level: 1, maxHp: 34, speed: 4 },
    { level: 2, maxHp: 40, speed: 4 },
    { level: 3, maxHp: 46, speed: 5 },
  ],
  highwayman: [
    { level: 1, maxHp: 32, speed: 6 },
    { level: 2, maxHp: 38, speed: 6 },
    { level: 3, maxHp: 44, speed: 7 },
  ],
  hellion: [
    { level: 1, maxHp: 38, speed: 4 },
    { level: 2, maxHp: 45, speed: 4 },
    { level: 3, maxHp: 52, speed: 5 },
  ],
  leper: [
    { level: 1, maxHp: 46, speed: 1 },
    { level: 2, maxHp: 55, speed: 1 },
    { level: 3, maxHp: 64, speed: 2 },
  ],
  occultist: [
    { level: 1, maxHp: 30, speed: 5 },
    { level: 2, maxHp: 35, speed: 5 },
    { level: 3, maxHp: 40, speed: 6 },
  ],
  'plague-doctor': [
    { level: 1, maxHp: 28, speed: 5 },
    { level: 2, maxHp: 33, speed: 5 },
    { level: 3, maxHp: 38, speed: 6 },
  ],
  'grave-robber': [
    { level: 1, maxHp: 30, speed: 7 },
    { level: 2, maxHp: 35, speed: 7 },
    { level: 3, maxHp: 40, speed: 8 },
  ],
};

/** 查询某英雄某等级的 Profile（缺数据时返回 undefined）。 */
export function getHeroLevelProfile(
  heroClassId: string,
  level: 1 | 2 | 3
): HeroLevelProfile | undefined {
  return HERO_LEVEL_PROFILES[heroClassId]?.find((p) => p.level === level);
}

/** 该英雄是否有完整三等级数据（替补候选过滤条件之一）。 */
export function hasCompleteLevelProfiles(heroClassId: string): boolean {
  return (HERO_LEVEL_PROFILES[heroClassId]?.length ?? 0) === 3;
}

/** 技能等级 → 伤害/治疗加成（data-driven，battle 结算读取）。 */
export const SKILL_LEVEL_BONUS: Record<1 | 2 | 3, { damage: number; heal: number }> = {
  1: { damage: 0, heal: 0 },
  2: { damage: 1, heal: 1 },
  3: { damage: 2, heal: 2 },
};
