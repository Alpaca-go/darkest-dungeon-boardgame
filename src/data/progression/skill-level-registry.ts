import type {
  DataCredibility,
  DataMode,
  RegistryValidationIssue,
  SkillLevel,
  SkillLevelDefinition,
} from '../../types/progression';
import { SKILLS } from '../skills';
import { SKILL_LEVEL_BONUS } from '../hero-level-profiles';

// ---------------------------------------------------------------------------
// Phase 8D：Skill Level Registry
//
// 规则 11：技能升级 = 用新等级的技能定义替换旧定义。本项目未拿到 Level II/III
// 实卡，因此严禁编造完整卡面（伤害区间、命中、位移等）。这里采用「增量修正」
// 形式的 prototype 数据：只描述相对 Level I 的加成，battle 结算时叠加。
// 拿到实卡后可把本表换成完整卡面并将 credibility 改为 verified，
// getSkillLevelDefinition 的调用方无需改动。
// ---------------------------------------------------------------------------

export const SKILL_LEVEL_DATA_MODE: DataMode = 'prototype';

const PROTOTYPE_NOTE =
  'prototype：仅相对 Level I 的伤害/治疗增量，来自 Phase 6 SKILL_LEVEL_BONUS，未经官方卡面核对。';

function buildDefinitions(): Record<string, SkillLevelDefinition[]> {
  const out: Record<string, SkillLevelDefinition[]> = {};
  for (const skill of SKILLS) {
    out[skill.id] = ([1, 2, 3] as SkillLevel[]).map((level) => {
      const bonus = SKILL_LEVEL_BONUS[level];
      return {
        skillId: skill.id,
        heroClassId: skill.heroId,
        level,
        damageBonus: bonus.damage,
        healBonus: bonus.heal,
        // 未核对卡面，不编造命中/减压提升。
        accuracyBonus: 0,
        stressHealBonus: 0,
        credibility: (level === 1 ? 'verified' : 'prototype') as DataCredibility,
        sourceNote:
          level === 1
            ? 'verified：Level I 即 skills.ts 的基础卡面定义，无额外加成。'
            : PROTOTYPE_NOTE,
      };
    });
  }
  return out;
}

/** Skill Level Registry（skillId → level → 定义）。 */
export const SKILL_LEVEL_REGISTRY: Record<string, SkillLevelDefinition[]> = buildDefinitions();

/** 查询某技能某等级的定义。缺数据返回 undefined（调用方降级为 Level I）。 */
export function getSkillLevelDefinition(
  skillId: string,
  level: SkillLevel
): SkillLevelDefinition | undefined {
  return SKILL_LEVEL_REGISTRY[skillId]?.find((d) => d.level === level);
}

/** 该技能可升到的最高等级（缺 Level N 定义时不允许升到 N）。 */
export function maxAvailableSkillLevel(skillId: string): SkillLevel {
  const list = SKILL_LEVEL_REGISTRY[skillId] ?? [];
  let max: SkillLevel = 1;
  for (const lv of [2, 3] as SkillLevel[]) {
    if (list.some((d) => d.level === lv)) max = lv;
    else break;
  }
  return max;
}

/** Registry 校验（缺失等级 / 加成倒退 / formal 模式非 verified）。 */
export function validateSkillLevelRegistry(
  mode: DataMode = SKILL_LEVEL_DATA_MODE
): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  const knownSkillIds = new Set(SKILLS.map((s) => s.id));
  for (const [skillId, list] of Object.entries(SKILL_LEVEL_REGISTRY)) {
    if (!knownSkillIds.has(skillId)) {
      issues.push({
        kind: 'unknown-owner',
        targetId: skillId,
        message: `Registry 中的 ${skillId} 不存在于 SKILLS`,
      });
    }
    for (const lv of [1, 2, 3] as SkillLevel[]) {
      const def = list.find((d) => d.level === lv);
      if (!def) {
        issues.push({
          kind: 'missing-level',
          targetId: skillId,
          level: lv,
          message: `${skillId} 缺少 Level ${lv} 定义`,
        });
        continue;
      }
      if (mode === 'formal' && def.credibility !== 'verified') {
        issues.push({
          kind: 'unverified',
          targetId: skillId,
          level: lv,
          message: `${skillId} Level ${lv} 数据可信度为 ${def.credibility}，formal 模式不允许`,
        });
      }
    }
    const sorted = [...list].sort((a, b) => a.level - b.level);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].damageBonus < sorted[i - 1].damageBonus) {
        issues.push({
          kind: 'non-monotonic',
          targetId: skillId,
          level: sorted[i].level,
          message: `${skillId} Level ${sorted[i].level} 的 damageBonus 低于上一等级`,
        });
      }
    }
  }
  return issues;
}

/** 导入模板（拿到官方卡面后按此结构补齐）。 */
export const SKILL_LEVEL_IMPORT_TEMPLATE: SkillLevelDefinition = {
  skillId: '<skill-id>',
  heroClassId: '<hero-class-id>',
  level: 1,
  damageBonus: 0,
  healBonus: 0,
  accuracyBonus: 0,
  stressHealBonus: 0,
  credibility: 'unavailable',
  sourceNote: '来源：<卡面/规则书页码>',
};
