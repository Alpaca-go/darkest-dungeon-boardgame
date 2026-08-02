// Phase 10E §Ancestor 2nd Form：Absolute Nothingness / Teleportation。
//
// 数据来源：docs/data/darkest-dungeon/final-encounter/ancestor-second-form.json
//   （officialDataStatus = 'partial'，sourceReference = DD_EN_COREBOX_RULES.pdf:p41）
// 审计结论：docs/reports/phase-10e-final-encounter-data-audit.md §2.3
//
// 本 Form 含 manifest 中**唯一的 verified 条目**：absolute-nothingness（count = 3）。
// - 三张 Absolute Nothingness 的 Stance 归属与「不可 Target / 占 Area Space」两个性质齐备；
// - d10 传送表 1-3/4-6/7-9/10 完整（10 = 不传送，硬约束 14）；
// - 但 areaId 依赖 Ancestor Room（unavailable）→ 官方仍为空串。

import type {
  AncestorSecondFormMechanics,
  FinalFormMechanicsValidation,
} from '../../../types/final-forms';
import { NON_AGGRESSIVE_STANCES } from '../../../types/final-forms';
import { PROTOTYPE_FINAL_MECHANICS_PREFIX } from './ancestor-first-form';

/** d10 → 目标 Stance；10 = 不传送（null）。JSON 原样转写。 */
export const ANCESTOR_TELEPORT_MAP: Record<number, 'defensive' | 'ranged' | 'support' | null> = {
  1: 'defensive',
  2: 'defensive',
  3: 'defensive',
  4: 'ranged',
  5: 'ranged',
  6: 'ranged',
  7: 'support',
  8: 'support',
  9: 'support',
  10: null,
};

/** 规则明确：掷出 10 不传送（硬约束 14）。 */
export const ANCESTOR_TELEPORT_NO_MOVE_ROLL = 10;

/** Absolute Nothingness 固定数量（manifest verified count = 3）。 */
export const ABSOLUTE_NOTHINGNESS_COUNT = 3;

export const OFFICIAL_ANCESTOR_SECOND_FORM_MECHANICS: AncestorSecondFormMechanics = {
  id: 'ancestor-second-form',
  formId: 'ancestor-second-form',

  initiativeCardCount: 2,

  absoluteNothingness: NON_AGGRESSIVE_STANCES.map((linkedStance) => ({
    linkedStance,
    // 官方 Ancestor Room 的 Area 布局 unavailable → 不猜测。
    areaId: '',
  })),

  actionEndTeleportMap: { ...ANCESTOR_TELEPORT_MAP },

  capacityPolicy: 'definition-driven',

  officialDataStatus: 'partial',
  sourceReference: 'DD_EN_COREBOX_RULES.pdf:p41',
  enabledInOfficialPool: false,
};

export const PROTOTYPE_ANCESTOR_SECOND_FORM_MECHANICS: AncestorSecondFormMechanics = {
  ...OFFICIAL_ANCESTOR_SECOND_FORM_MECHANICS,
  id: `${PROTOTYPE_FINAL_MECHANICS_PREFIX}ancestor-second-form`,

  absoluteNothingness: NON_AGGRESSIVE_STANCES.map((linkedStance) => ({
    linkedStance,
    areaId: `${PROTOTYPE_FINAL_MECHANICS_PREFIX}area-${linkedStance}`,
  })),

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// 校验（Data Gate）
// ---------------------------------------------------------------------------

export function validateAncestorSecondFormMechanics(
  m: AncestorSecondFormMechanics,
): FinalFormMechanicsValidation {
  const missing: string[] = [];
  const issues: string[] = [];

  if (m.initiativeCardCount !== 2) issues.push('Ancestor 2nd 的 Initiative Card 必须为 2');

  if (m.absoluteNothingness.length !== ABSOLUTE_NOTHINGNESS_COUNT) {
    issues.push(`Absolute Nothingness 必须恰好 ${ABSOLUTE_NOTHINGNESS_COUNT} 张`);
  }
  const stances = new Set(m.absoluteNothingness.map((n) => n.linkedStance));
  if (stances.size !== m.absoluteNothingness.length) {
    issues.push('Absolute Nothingness 的 Stance 不得重复');
  }
  for (const n of m.absoluteNothingness) {
    if (!n.areaId) missing.push(`ancestor-2nd:absolute-nothingness-area:${n.linkedStance}`);
  }

  for (let roll = 1; roll <= 10; roll += 1) {
    if (!(roll in m.actionEndTeleportMap)) {
      missing.push(`ancestor-2nd:teleport-map:${roll}`);
    }
  }
  if (m.actionEndTeleportMap[ANCESTOR_TELEPORT_NO_MOVE_ROLL] !== null) {
    issues.push('掷出 10 必须为「不传送」');
  }

  if (!m.capacityPolicy) missing.push('ancestor-2nd:capacity-policy');

  if (m.officialDataStatus === 'unavailable') {
    issues.push('Ancestor 2nd Form 机制数据缺失（unavailable）');
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}
