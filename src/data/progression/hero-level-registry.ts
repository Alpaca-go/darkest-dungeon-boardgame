import type {
  DataCredibility,
  DataMode,
  HeroLevel,
  HeroLevelDefinition,
  HeroResistanceProfile,
  RegistryValidationIssue,
} from '../../types/progression';
import { HERO_LEVEL_PROFILES } from '../hero-level-profiles';

// ---------------------------------------------------------------------------
// Phase 8D：Hero Level Registry
//
// 数据可信度约定（严格执行，禁止由 Level I 推导 II/III 的"看起来合理"的数值）：
// - verified    ：已核对官方卡面；
// - partial     ：部分字段核对（其余字段沿用原型值）；
// - prototype   ：本项目原型手工数值，仅用于跑通规则闭环；
// - unavailable ：卡面缺失，Registry 不提供该等级定义。
//
// 本轮全部 Hero Level 数据均为 prototype（HP/Speed 沿用 Phase 6 手工 Profile，
// Skill Slot / Trinket Slot / Resistance / Immunity 为本阶段新增原型值）。
// 后续拿到实卡后，只需替换本文件的表格并把 credibility 改为 verified，
// 引擎与 UI 均无需改动。
// ---------------------------------------------------------------------------

/** 当前数据模式。formal 下缺少 verified 数据会被 Registry 校验报告出来。 */
export const HERO_LEVEL_DATA_MODE: DataMode = 'prototype';

/** 各等级的技能槽位数（原型值；Level 3 解锁第 4 槽）。 */
const SKILL_SLOTS_BY_LEVEL: Record<HeroLevel, number> = { 1: 3, 2: 3, 3: 4 };

/** 各等级的饰品槽位数（原型值）。 */
const TRINKET_SLOTS_BY_LEVEL: Record<HeroLevel, number> = { 1: 1, 2: 2, 3: 2 };

/** 各等级的通用抗性（原型值；每级 +10）。 */
function resistancesForLevel(level: HeroLevel): HeroResistanceProfile {
  const base = (level - 1) * 10;
  return {
    stun: 20 + base,
    blight: 20 + base,
    bleed: 20 + base,
    disease: 20 + base,
    debuff: 20 + base,
    move: 20 + base,
  };
}

/**
 * 各等级免疫列表（原型值）。
 * Level 3 起对 Stun 免疫，用于验证「等级 → 战斗即时生效」链路。
 */
function immunitiesForLevel(level: HeroLevel): string[] {
  return level >= 3 ? ['stun'] : [];
}

const PROTOTYPE_NOTE =
  'prototype：HP/Speed 沿用 Phase 6 手工 Profile，槽位/抗性/免疫为 Phase 8D 原型值，未经官方卡面核对。';

/** Hero Level Registry（heroClassId → level → 定义）。 */
export const HERO_LEVEL_REGISTRY: Record<string, HeroLevelDefinition[]> = Object.fromEntries(
  Object.entries(HERO_LEVEL_PROFILES).map(([heroClassId, profiles]) => [
    heroClassId,
    profiles.map((p) => ({
      heroClassId,
      level: p.level,
      maxHp: p.maxHp,
      speed: p.speed,
      skillSlots: SKILL_SLOTS_BY_LEVEL[p.level],
      trinketSlots: TRINKET_SLOTS_BY_LEVEL[p.level],
      resistances: resistancesForLevel(p.level),
      immunities: immunitiesForLevel(p.level),
      credibility: 'prototype' as DataCredibility,
      sourceNote: PROTOTYPE_NOTE,
    })),
  ])
);

/** 查询某英雄某等级的定义。缺数据返回 undefined（调用方必须降级，不得白屏）。 */
export function getHeroLevelDefinition(
  heroClassId: string,
  level: HeroLevel
): HeroLevelDefinition | undefined {
  return HERO_LEVEL_REGISTRY[heroClassId]?.find((d) => d.level === level);
}

/** 该英雄是否具备完整的 1/2/3 级定义。 */
export function hasCompleteHeroLevelDefinitions(heroClassId: string): boolean {
  const list = HERO_LEVEL_REGISTRY[heroClassId] ?? [];
  return [1, 2, 3].every((lv) => list.some((d) => d.level === lv));
}

/** 该英雄可升到的最高等级（缺 Level N 定义时不允许升到 N）。 */
export function maxAvailableHeroLevel(heroClassId: string): HeroLevel {
  const list = HERO_LEVEL_REGISTRY[heroClassId] ?? [];
  let max: HeroLevel = 1;
  for (const lv of [2, 3] as HeroLevel[]) {
    if (list.some((d) => d.level === lv)) max = lv;
    else break;
  }
  return max;
}

/**
 * Registry 校验：
 * - 缺失等级定义；
 * - HP 非单调递增（成长曲线异常）；
 * - formal 模式下存在非 verified 数据。
 * 只返回问题列表，不抛异常（缺数据必须降级而非崩溃）。
 */
export function validateHeroLevelRegistry(
  mode: DataMode = HERO_LEVEL_DATA_MODE
): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  for (const [heroClassId, list] of Object.entries(HERO_LEVEL_REGISTRY)) {
    for (const lv of [1, 2, 3] as HeroLevel[]) {
      const def = list.find((d) => d.level === lv);
      if (!def) {
        issues.push({
          kind: 'missing-level',
          targetId: heroClassId,
          level: lv,
          message: `${heroClassId} 缺少 Level ${lv} 定义`,
        });
        continue;
      }
      if (mode === 'formal' && def.credibility !== 'verified') {
        issues.push({
          kind: 'unverified',
          targetId: heroClassId,
          level: lv,
          message: `${heroClassId} Level ${lv} 数据可信度为 ${def.credibility}，formal 模式不允许`,
        });
      }
    }
    const sorted = [...list].sort((a, b) => a.level - b.level);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].maxHp < sorted[i - 1].maxHp) {
        issues.push({
          kind: 'non-monotonic',
          targetId: heroClassId,
          level: sorted[i].level,
          message: `${heroClassId} Level ${sorted[i].level} 的 maxHp 低于上一等级`,
        });
      }
    }
  }
  return issues;
}

/**
 * 导入模板：拿到官方卡面后按此结构补齐即可（credibility 改为 verified）。
 * 仅用于文档与调试面板展示，不参与运行时逻辑。
 */
export const HERO_LEVEL_IMPORT_TEMPLATE: HeroLevelDefinition = {
  heroClassId: '<hero-class-id>',
  level: 1,
  maxHp: 0,
  speed: 0,
  skillSlots: 0,
  trinketSlots: 0,
  resistances: { stun: 0, blight: 0, bleed: 0, disease: 0, debuff: 0, move: 0 },
  immunities: [],
  credibility: 'unavailable',
  sourceNote: '来源：<卡面/规则书页码>',
};
