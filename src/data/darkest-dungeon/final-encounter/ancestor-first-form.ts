// Phase 10E §Ancestor 1st Form：Reflections / GUARD / Imperfect Reaction / Time Heals All。
//
// 数据来源：docs/data/darkest-dungeon/final-encounter/ancestor-first-form.json
//   （officialDataStatus = 'partial'，sourceReference = DD_EN_COREBOX_RULES.pdf:p40）
// 审计结论：docs/reports/phase-10e-final-encounter-data-audit.md §2.2
//
// 官方常量是 JSON 的 1:1 转写：
// - 结构字段（数量 / 随机 Stance / 4 张 Initiative / GUARD / 10 Wounds）JSON 有 → 照搬；
// - 卡面数值（Ancestor 与两种 Reflection 的 HP / Skill）JSON 无 → null / []，驱动 Data Gate；
// - Time Heals All 只有 skillId，无效果本体 → fullStanceSkillDefined = false；
// - Fill 补位来源未知 → vacantStanceFillKind = null。

import type {
  AncestorFirstFormMechanics,
  FinalFormMechanicsValidation,
  ReflectionCardDefinition,
} from '../../../types/final-forms';
import { NON_AGGRESSIVE_STANCES } from '../../../types/final-forms';

/** Prototype 机制 ID 前缀（硬约束 23：prototype 必须独立命名）。 */
export const PROTOTYPE_FINAL_MECHANICS_PREFIX = 'prototype-final-encounter-';

const OFFICIAL_REFLECTION_CARDS: ReflectionCardDefinition[] = [
  // perfect-reflection-card / imperfect-reflection-card 在 manifest 中均为 unavailable。
  { kind: 'perfect', maxWounds: null, skillIds: [] },
  { kind: 'imperfect', maxWounds: null, skillIds: [] },
];

export const OFFICIAL_ANCESTOR_FIRST_FORM_MECHANICS: AncestorFirstFormMechanics = {
  id: 'ancestor-first-form',
  formId: 'ancestor-first-form',

  perfectReflectionCount: 2,
  imperfectReflectionCount: 1,
  randomizeAcrossStances: [...NON_AGGRESSIVE_STANCES],

  initiativeCardCount: 4,
  allocationPolicy: 'reflection-first-then-ancestor',
  preserveCardCountAfterReflectionDeath: true,

  guardPolicy: 'reflections-always-guard-ancestor',

  imperfectDeathWounds: 10,

  fullStanceSkillId: 'ancestor-time-heals-all',
  // 只有 ID，没有效果本体（治疗量 / 目标 / 时机全部缺失）。
  fullStanceSkillDefined: false,

  vacantStanceResolverId: 'ancestor-fill-reflection-stances',
  // 补位来源（补 Perfect 还是 Imperfect）官方未给出 → 不猜测。
  vacantStanceFillKind: null,

  reflectionCards: OFFICIAL_REFLECTION_CARDS,

  officialDataStatus: 'partial',
  sourceReference: 'DD_EN_COREBOX_RULES.pdf:p40',
  enabledInOfficialPool: false,
};

/** Prototype harness：补齐官方缺失的数值，用于跑通机制。 */
export const PROTOTYPE_ANCESTOR_FIRST_FORM_MECHANICS: AncestorFirstFormMechanics = {
  ...OFFICIAL_ANCESTOR_FIRST_FORM_MECHANICS,
  id: `${PROTOTYPE_FINAL_MECHANICS_PREFIX}ancestor-first-form`,

  fullStanceSkillId: `${PROTOTYPE_FINAL_MECHANICS_PREFIX}time-heals-all`,
  fullStanceSkillDefined: true,

  vacantStanceResolverId: `${PROTOTYPE_FINAL_MECHANICS_PREFIX}fill-reflection-stances`,
  // harness 选择用 Perfect 补位（仅原型，不回写正式 Definition）。
  vacantStanceFillKind: 'perfect',

  reflectionCards: [
    { kind: 'perfect', maxWounds: 6, skillIds: [`${PROTOTYPE_FINAL_MECHANICS_PREFIX}perfect-strike`] },
    { kind: 'imperfect', maxWounds: 4, skillIds: [`${PROTOTYPE_FINAL_MECHANICS_PREFIX}imperfect-strike`] },
  ],

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// 校验（Data Gate）
// ---------------------------------------------------------------------------

export function validateAncestorFirstFormMechanics(
  m: AncestorFirstFormMechanics,
): FinalFormMechanicsValidation {
  const missing: string[] = [];
  const issues: string[] = [];

  if (m.perfectReflectionCount <= 0) missing.push('ancestor-1st:perfect-reflection-count');
  if (m.imperfectReflectionCount <= 0) missing.push('ancestor-1st:imperfect-reflection-count');
  if (m.randomizeAcrossStances.length !== 3) {
    issues.push('Reflection 必须随机分配到恰好三个非 aggressive Stance');
  }
  if (m.initiativeCardCount !== 4) issues.push('Ancestor 1st 的 Initiative Card 必须恒为 4');
  if (!m.preserveCardCountAfterReflectionDeath) {
    issues.push('Reflection 死亡不得减少 Initiative Card');
  }
  if (!m.guardPolicy) missing.push('ancestor-1st:guard-policy');

  if (m.imperfectDeathWounds === null) missing.push('ancestor-1st:imperfect-death-wounds');

  if (!m.fullStanceSkillId) missing.push('ancestor-1st:time-heals-all-id');
  if (!m.fullStanceSkillDefined) missing.push('ancestor-1st:time-heals-all-effect');

  if (!m.vacantStanceResolverId) missing.push('ancestor-1st:fill-resolver-id');
  if (m.vacantStanceFillKind === null) missing.push('ancestor-1st:fill-source-kind');

  for (const card of m.reflectionCards) {
    if (card.maxWounds === null) missing.push(`ancestor-1st:${card.kind}-reflection-hp`);
    if (card.skillIds.length === 0) missing.push(`ancestor-1st:${card.kind}-reflection-skills`);
  }

  if (m.officialDataStatus === 'unavailable') {
    issues.push('Ancestor 1st Form 机制数据缺失（unavailable）');
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}
