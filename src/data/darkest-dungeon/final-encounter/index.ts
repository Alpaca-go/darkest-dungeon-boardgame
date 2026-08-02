// Phase 10E：Final Encounter 机制 Registry 汇总 + 统一 Data Gate。
//
// 硬约束 22/23/24：
// - official 数据缺失 → 正式池一律禁用（isFinalEncounterMechanicsOfficialEnabled 恒 false）；
// - prototype 一律使用 prototype-final-encounter-* 独立 ID；
// - prototype 数值绝不回写正式 Definition（两组常量完全分离，只在 getter 里二选一）。

import type {
  AncestorFirstFormMechanics,
  AncestorRoomAreaDefinition,
  AncestorSecondFormMechanics,
  FinalFormMechanics,
  FinalFormMechanicsValidation,
  GestatingHeartMechanics,
  HeartOfDarknessMechanics,
} from '../../../types/final-forms';
import type { FinalFormId } from '../../../types/final-encounter';
import type { RegistryValidationIssue } from '../../../types/progression';

import {
  OFFICIAL_ANCESTOR_FIRST_FORM_MECHANICS,
  PROTOTYPE_ANCESTOR_FIRST_FORM_MECHANICS,
  PROTOTYPE_FINAL_MECHANICS_PREFIX,
  validateAncestorFirstFormMechanics,
} from './ancestor-first-form';
import {
  OFFICIAL_ANCESTOR_SECOND_FORM_MECHANICS,
  PROTOTYPE_ANCESTOR_SECOND_FORM_MECHANICS,
  validateAncestorSecondFormMechanics,
} from './ancestor-second-form';
import {
  OFFICIAL_GESTATING_HEART_MECHANICS,
  PROTOTYPE_GESTATING_HEART_MECHANICS,
  validateGestatingHeartMechanics,
} from './gestating-heart';
import {
  OFFICIAL_HEART_OF_DARKNESS_MECHANICS,
  PROTOTYPE_HEART_OF_DARKNESS_MECHANICS,
  validateHeartOfDarknessMechanics,
} from './heart-of-darkness';
import {
  OFFICIAL_ANCESTOR_ROOM_AREAS,
  PROTOTYPE_ANCESTOR_ROOM_AREAS,
  getAncestorRoomAreas,
  validateAncestorRoomAreas,
} from './ancestor-room';

export * from './ancestor-first-form';
export * from './ancestor-second-form';
export * from './gestating-heart';
export * from './heart-of-darkness';
export * from './ancestor-room';

export type FinalMechanicsMode = 'formal' | 'prototype';

// ---------------------------------------------------------------------------
// 取数
// ---------------------------------------------------------------------------

export function getAncestorFirstFormMechanics(
  mode: FinalMechanicsMode = 'prototype',
): AncestorFirstFormMechanics {
  return mode === 'formal'
    ? OFFICIAL_ANCESTOR_FIRST_FORM_MECHANICS
    : PROTOTYPE_ANCESTOR_FIRST_FORM_MECHANICS;
}

export function getAncestorSecondFormMechanics(
  mode: FinalMechanicsMode = 'prototype',
): AncestorSecondFormMechanics {
  return mode === 'formal'
    ? OFFICIAL_ANCESTOR_SECOND_FORM_MECHANICS
    : PROTOTYPE_ANCESTOR_SECOND_FORM_MECHANICS;
}

export function getGestatingHeartMechanics(
  mode: FinalMechanicsMode = 'prototype',
): GestatingHeartMechanics {
  return mode === 'formal' ? OFFICIAL_GESTATING_HEART_MECHANICS : PROTOTYPE_GESTATING_HEART_MECHANICS;
}

export function getHeartOfDarknessMechanics(
  mode: FinalMechanicsMode = 'prototype',
): HeartOfDarknessMechanics {
  return mode === 'formal'
    ? OFFICIAL_HEART_OF_DARKNESS_MECHANICS
    : PROTOTYPE_HEART_OF_DARKNESS_MECHANICS;
}

/** 按 Form ID 取机制定义（四个 Form 的统一入口）。 */
export function getFinalFormMechanics(
  formId: FinalFormId,
  mode: FinalMechanicsMode = 'prototype',
): FinalFormMechanics {
  switch (formId) {
    case 'ancestor-first-form':
      return getAncestorFirstFormMechanics(mode);
    case 'ancestor-second-form':
      return getAncestorSecondFormMechanics(mode);
    case 'gestating-heart':
      return getGestatingHeartMechanics(mode);
    case 'heart-of-darkness':
      return getHeartOfDarknessMechanics(mode);
  }
}

/** 每个 Form 每轮的 Initiative Card 数（基础值，不含 Sispersion 追加）。 */
export function getFinalFormInitiativeCardCount(
  formId: FinalFormId,
  mode: FinalMechanicsMode = 'prototype',
): number {
  return getFinalFormMechanics(formId, mode).initiativeCardCount;
}

// ---------------------------------------------------------------------------
// 校验（统一 Data Gate）
// ---------------------------------------------------------------------------

export function validateFinalFormMechanics(
  m: FinalFormMechanics,
): FinalFormMechanicsValidation {
  switch (m.formId) {
    case 'ancestor-first-form':
      return validateAncestorFirstFormMechanics(m);
    case 'ancestor-second-form':
      return validateAncestorSecondFormMechanics(m);
    case 'gestating-heart':
      return validateGestatingHeartMechanics(m);
    case 'heart-of-darkness':
      return validateHeartOfDarknessMechanics(m);
  }
}

export function getAncestorRoomAreaDefinition(
  mode: FinalMechanicsMode = 'prototype',
): AncestorRoomAreaDefinition {
  return getAncestorRoomAreas(mode);
}

/**
 * official Final Encounter **机制** 是否启用。
 * 需要四个 Form 的机制 + Ancestor Room Area 全部齐备；
 * 依审计结论恒为 false（11 项 unavailable）。
 */
export function isFinalEncounterMechanicsOfficialEnabled(): boolean {
  const forms: FinalFormMechanics[] = [
    OFFICIAL_ANCESTOR_FIRST_FORM_MECHANICS,
    OFFICIAL_ANCESTOR_SECOND_FORM_MECHANICS,
    OFFICIAL_GESTATING_HEART_MECHANICS,
    OFFICIAL_HEART_OF_DARKNESS_MECHANICS,
  ];
  const formsOk = forms.every(
    (f) =>
      f.enabledInOfficialPool &&
      f.officialDataStatus === 'verified' &&
      validateFinalFormMechanics(f).isComplete,
  );
  if (!formsOk) return false;
  return validateAncestorRoomAreas(OFFICIAL_ANCESTOR_ROOM_AREAS).isComplete;
}

/** 机制层数据缺口清单（人类可读，供 UI / 报告展示）。 */
export function getFinalEncounterMechanicsGaps(): string[] {
  const gaps: string[] = [];
  const entries: [string, FinalFormMechanics][] = [
    ['ancestor-first-form', OFFICIAL_ANCESTOR_FIRST_FORM_MECHANICS],
    ['ancestor-second-form', OFFICIAL_ANCESTOR_SECOND_FORM_MECHANICS],
    ['gestating-heart', OFFICIAL_GESTATING_HEART_MECHANICS],
    ['heart-of-darkness', OFFICIAL_HEART_OF_DARKNESS_MECHANICS],
  ];
  for (const [label, m] of entries) {
    const r = validateFinalFormMechanics(m);
    if (!r.isComplete) gaps.push(`${label}（${[...r.missing, ...r.issues].join('；')}）`);
  }
  const roomResult = validateAncestorRoomAreas(OFFICIAL_ANCESTOR_ROOM_AREAS);
  if (!roomResult.isComplete) {
    gaps.push(`ancestor-room（${[...roomResult.missing, ...roomResult.issues].join('；')}）`);
  }
  return gaps;
}

/** Registry 自洽性校验（构建期 / 单测调用）。 */
export function validateFinalEncounterMechanicsRegistry(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];

  if (isFinalEncounterMechanicsOfficialEnabled()) {
    issues.push({
      kind: 'unknown-owner',
      targetId: 'final-encounter-mechanics',
      message: 'Final Encounter 机制 official 内容意外启用，需复核数据',
    });
  }

  const prototypes: FinalFormMechanics[] = [
    PROTOTYPE_ANCESTOR_FIRST_FORM_MECHANICS,
    PROTOTYPE_ANCESTOR_SECOND_FORM_MECHANICS,
    PROTOTYPE_GESTATING_HEART_MECHANICS,
    PROTOTYPE_HEART_OF_DARKNESS_MECHANICS,
  ];
  for (const m of prototypes) {
    if (m.enabledInOfficialPool) {
      issues.push({
        kind: 'unverified',
        targetId: m.id,
        message: 'Prototype Final Form 机制不得 enabledInOfficialPool',
      });
    }
    if (!m.id.startsWith(PROTOTYPE_FINAL_MECHANICS_PREFIX)) {
      issues.push({
        kind: 'unverified',
        targetId: m.id,
        message: 'Prototype Final Form 机制必须使用 prototype-final-encounter-* ID',
      });
    }
    const r = validateFinalFormMechanics(m);
    if (!r.isComplete) {
      issues.push({
        kind: 'unknown-owner',
        targetId: m.id,
        message: `Prototype 机制不自洽：${[...r.missing, ...r.issues].join('；')}`,
      });
    }
  }

  if (!PROTOTYPE_ANCESTOR_ROOM_AREAS.id.startsWith(PROTOTYPE_FINAL_MECHANICS_PREFIX)) {
    issues.push({
      kind: 'unverified',
      targetId: PROTOTYPE_ANCESTOR_ROOM_AREAS.id,
      message: 'Prototype Ancestor Room 必须使用 prototype-final-encounter-* ID',
    });
  }

  return issues;
}
