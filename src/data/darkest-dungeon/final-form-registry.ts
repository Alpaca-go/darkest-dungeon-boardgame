// Phase 10A §18 / §22：Final Boss Form Registry + Data Gate。
//
// 规则 28—30：Final Boss 有四个有序 Form，但只面对三个；
// 顺序固定 Ancestor 1st → Ancestor 2nd → Gestating Heart → Heart of Darkness；
// Quest 决定跳过前三个中的一个；Heart of Darkness 不能被跳过（硬约束 13）。
//
// 硬约束 23：Phase 10A 不得提前实现任何 Final Form 的正式技能。
// 因此正式四个 Form 的 maxHp = null / skillIds = [] / officialDataStatus = 'unavailable'，
// prototype-final-form-* 提供 harness 数值验证「顺序 / 跳过 / 切换 / 胜利」。

import type {
  FinalEncounterRoomDefinition,
  FinalFormDefinition,
  FinalFormId,
  FormTransitionPolicy,
  SkippableFinalFormId,
} from '../../types/final-encounter';
import type { RegistryValidationIssue } from '../../types/progression';

// ---------------------------------------------------------------------------
// §18 固定顺序
// ---------------------------------------------------------------------------

/** 四个 Form 的固定顺序（规则 29，不可配置）。 */
export const FINAL_FORM_ORDER: FinalFormId[] = [
  'ancestor-first-form',
  'ancestor-second-form',
  'gestating-heart',
  'heart-of-darkness',
];

/** 可被 Quest 取消的三个 Form（Heart of Darkness 不在其中）。 */
export const SKIPPABLE_FINAL_FORM_IDS: SkippableFinalFormId[] = [
  'ancestor-first-form',
  'ancestor-second-form',
  'gestating-heart',
];

/** 不可跳过的 Form（硬约束 13）。 */
export const UNSKIPPABLE_FINAL_FORM_ID: FinalFormId = 'heart-of-darkness';

const FINAL_FORM_DISPLAY_NAMES: Record<FinalFormId, string> = {
  'ancestor-first-form': 'Ancestor 第一形态',
  'ancestor-second-form': 'Ancestor 第二形态',
  'gestating-heart': 'Gestating Heart',
  'heart-of-darkness': 'Heart of Darkness',
};

/** Form 展示名（UI / 日志用；正式卡面接入后可替换）。 */
export function getFinalFormDisplayName(formId: FinalFormId): string {
  return FINAL_FORM_DISPLAY_NAMES[formId];
}

// ---------------------------------------------------------------------------
// 正式 Form（刻意留空 → Data Gate）
// ---------------------------------------------------------------------------

// Phase 11A.3 dev doc §17 / §25-29：rulebook-backed partial provenance。
// 每个 official Form 写上已确认 structural rules 的 sourceReference
// （即使数值未填，结构已经 verified）。
function rulebookFormSourceReference(formId: FinalFormId): string {
  switch (formId) {
    case 'ancestor-first-form':
      return 'DD_EN_COREBOX_RULES.pdf:p40（structural: stance / reflection count / initiative / guard / imperfect death 10 wounds）';
    case 'ancestor-second-form':
      return 'DD_EN_COREBOX_RULES.pdf:p41（structural: initiative 2 / 3× Absolute Nothingness untargetable + occupies Area / d10 teleport map 1-3:defensive,4-6:ranged,7-9:support,10:none）';
    case 'gestating-heart':
      return 'DD_EN_COREBOX_RULES.pdf:p41（structural: aggressive / 1 initiative / Sispersion adds 1 initiative / wounded reaction: Blight 2-3 turns + Heal 2）';
    case 'heart-of-darkness':
      return 'DD_EN_COREBOX_RULES.pdf:p41（structural: aggressive / 2 initiative / Impending Doom rolls at battle start + after completed action / defeat = campaign victory）';
  }
}

export const OFFICIAL_FINAL_FORMS: FinalFormDefinition[] = FINAL_FORM_ORDER.map((formId) => ({
  id: `final-form-${formId}`,
  formId,
  name: '',
  spawnRule: 'standard',
  skippable: formId !== UNSKIPPABLE_FINAL_FORM_ID,
  maxHp: null,
  skillIds: [],
  attendantActorDefinitionIds: [],
  // Phase 11A.3 dev doc §17：保持 unavailable（卡面数值缺）
  officialDataStatus: 'unavailable',
  enabledInOfficialPool: false,
  // Phase 11A.3 dev doc §9 / §17：把已 verified 的 rulebook structural provenance 写进 official。
  sourceReference: rulebookFormSourceReference(formId),
}));

/** 正式 Final Encounter Room（所有 Form 共用；Area 未核对 → 空）。 */
export const OFFICIAL_FINAL_ENCOUNTER_ROOM: FinalEncounterRoomDefinition = {
  id: 'final-encounter-room',
  name: '',
  heroPlacementRule: 'first-empty-stance',
  formAreaId: '',
  validAreaIds: [],
  officialDataStatus: 'unavailable',
  // Phase 11A.3 dev doc §9 / §30：已 verified 的 structural rules。
  sourceReference:
    'DD_EN_COREBOX_RULES.pdf:p36（structural: same Room across all forms / no Rest / no Stance adjustment / new Initiative + Round on Form switch / Final Hamlet 4 days no Hamlet Event / no Dungeon Exploration + roll Provisions before Encounter）',
};

// ---------------------------------------------------------------------------
// Prototype Form（harness）
// ---------------------------------------------------------------------------

/** Prototype Form ID 前缀（硬约束 20 / 资料不足时的指定命名）。 */
export const PROTOTYPE_FINAL_FORM_ID_PREFIX = 'prototype-final-form-';

const PROTOTYPE_FORM_HP: Record<FinalFormId, number> = {
  'ancestor-first-form': 20,
  'ancestor-second-form': 24,
  'gestating-heart': 28,
  'heart-of-darkness': 32,
};

export const PROTOTYPE_FINAL_FORMS: FinalFormDefinition[] = FINAL_FORM_ORDER.map((formId) => ({
  id: `${PROTOTYPE_FINAL_FORM_ID_PREFIX}${formId}`,
  formId,
  name: `原型 ${FINAL_FORM_DISPLAY_NAMES[formId]}`,
  spawnRule: 'standard',
  skippable: formId !== UNSKIPPABLE_FINAL_FORM_ID,
  maxHp: PROTOTYPE_FORM_HP[formId],
  skillIds: [`${PROTOTYPE_FINAL_FORM_ID_PREFIX}${formId}-strike`],
  attendantActorDefinitionIds: [],
  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
}));

/** Prototype Final Encounter Room（所有 Form 共用同一个 Room，硬约束 18）。 */
export const PROTOTYPE_FINAL_ENCOUNTER_ROOM_ID = 'prototype-final-encounter-room';

export const PROTOTYPE_FINAL_ENCOUNTER_ROOM: FinalEncounterRoomDefinition = {
  id: PROTOTYPE_FINAL_ENCOUNTER_ROOM_ID,
  name: '原型 Final Encounter Room',
  heroPlacementRule: 'first-empty-stance',
  formAreaId: 'proto-final-form-area',
  validAreaIds: [
    'proto-final-form-area',
    'proto-final-hero-1',
    'proto-final-hero-2',
    'proto-final-hero-3',
    'proto-final-hero-4',
  ],
  officialDataStatus: 'prototype',
};

// ---------------------------------------------------------------------------
// §20 跨 Form 状态策略（集中定义，不散落 if）
// ---------------------------------------------------------------------------

/**
 * 默认策略。
 * preserveConditions 未核对 → 'definition-driven'（硬约束：不确定字段不得写死）。
 * resetHeroTurnUsage / resetTrinketTurnUsage：Form 切换后开启新 Battle Round，
 * 「每回合一次」资源随新回合重置，属于既有 Round 语义，不是恢复 Life / Stress。
 * resetBattleUsage = false：整场 Final Encounter 视为同一场战斗，
 * 「每场战斗一次」资源不因换 Form 而刷新（保守选择，避免凭空给玩家额外资源）。
 */
export const DEFAULT_FORM_TRANSITION_POLICY: FormTransitionPolicy = {
  preserveHeroLife: true,
  preserveHeroStress: true,
  preserveHeroStances: true,
  preserveConditions: 'definition-driven',
  resetHeroTurnUsage: true,
  resetTrinketTurnUsage: true,
  resetBattleUsage: false,
};

// ---------------------------------------------------------------------------
// 取数
// ---------------------------------------------------------------------------

export function getFinalFormPool(
  mode: 'formal' | 'prototype' = 'prototype',
): FinalFormDefinition[] {
  return mode === 'formal' ? OFFICIAL_FINAL_FORMS : PROTOTYPE_FINAL_FORMS;
}

export function getFinalFormDefinition(
  formId: FinalFormId,
  mode: 'formal' | 'prototype' = 'prototype',
): FinalFormDefinition | undefined {
  return getFinalFormPool(mode).find((f) => f.formId === formId);
}

export function getFinalEncounterRoom(
  mode: 'formal' | 'prototype' = 'prototype',
): FinalEncounterRoomDefinition {
  return mode === 'formal' ? OFFICIAL_FINAL_ENCOUNTER_ROOM : PROTOTYPE_FINAL_ENCOUNTER_ROOM;
}

/** 类型守卫：给定值是否为合法的可跳过 Form。 */
export function isSkippableFinalFormId(value: unknown): value is SkippableFinalFormId {
  return typeof value === 'string' && SKIPPABLE_FINAL_FORM_IDS.includes(value as SkippableFinalFormId);
}

/** 类型守卫：给定值是否为合法 Form ID。 */
export function isFinalFormId(value: unknown): value is FinalFormId {
  return typeof value === 'string' && FINAL_FORM_ORDER.includes(value as FinalFormId);
}

// ---------------------------------------------------------------------------
// 校验（Data Gate）
// ---------------------------------------------------------------------------

export interface FinalFormValidationResult {
  isComplete: boolean;
  missing: string[];
  issues: string[];
}

export function validateFinalForm(form: FinalFormDefinition): FinalFormValidationResult {
  const missing: string[] = [];
  const issues: string[] = [];

  if (!form.name) missing.push(`final-form-name:${form.formId}`);
  if (form.maxHp === null) missing.push(`final-form-hp:${form.formId}`);
  if (form.skillIds.length === 0) missing.push(`final-form-skills:${form.formId}`);

  if (form.formId === UNSKIPPABLE_FINAL_FORM_ID && form.skippable) {
    issues.push('Heart of Darkness 不得被标记为可跳过');
  }
  if (form.officialDataStatus === 'unavailable') {
    issues.push(`Final Form ${form.formId} 数据缺失（unavailable）→ official 禁用`);
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

/** official Final Encounter 是否启用（四个 Form + Room 全部齐备）。 */
export function isFinalEncounterOfficialEnabled(): boolean {
  if (OFFICIAL_FINAL_FORMS.length !== 4) return false;
  const formsOk = OFFICIAL_FINAL_FORMS.every(
    (f) =>
      f.enabledInOfficialPool &&
      f.officialDataStatus === 'verified' &&
      validateFinalForm(f).isComplete,
  );
  if (!formsOk) return false;
  const room = OFFICIAL_FINAL_ENCOUNTER_ROOM;
  return (
    room.officialDataStatus === 'verified' &&
    !!room.name &&
    !!room.formAreaId &&
    room.validAreaIds.length > 0
  );
}

export function getFinalEncounterDataGaps(): string[] {
  const gaps: string[] = [];
  for (const form of OFFICIAL_FINAL_FORMS) {
    const result = validateFinalForm(form);
    if (!result.isComplete) {
      gaps.push(`${form.id}（${[...result.missing, ...result.issues].join('；')}）`);
    }
  }
  if (
    OFFICIAL_FINAL_ENCOUNTER_ROOM.officialDataStatus !== 'verified' ||
    !OFFICIAL_FINAL_ENCOUNTER_ROOM.formAreaId
  ) {
    gaps.push('final-encounter-room（Final Room Card / Area 缺失）');
  }
  return gaps;
}

export function validateFinalFormRegistry(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];

  if (isFinalEncounterOfficialEnabled()) {
    issues.push({
      kind: 'unknown-owner',
      targetId: 'final-encounter',
      message: 'Final Encounter official 内容意外启用，需复核数据',
    });
  }

  // 顺序必须固定为四个且以 heart-of-darkness 结尾
  if (FINAL_FORM_ORDER.length !== 4 || FINAL_FORM_ORDER[3] !== UNSKIPPABLE_FINAL_FORM_ID) {
    issues.push({
      kind: 'unknown-owner',
      targetId: 'final-form-order',
      message: 'FINAL_FORM_ORDER 必须为四个 Form 且以 heart-of-darkness 结尾',
    });
  }

  for (const form of PROTOTYPE_FINAL_FORMS) {
    if (form.enabledInOfficialPool) {
      issues.push({
        kind: 'unverified',
        targetId: form.id,
        message: 'Prototype Final Form 不得 enabledInOfficialPool',
      });
    }
    if (!form.id.startsWith(PROTOTYPE_FINAL_FORM_ID_PREFIX)) {
      issues.push({
        kind: 'unverified',
        targetId: form.id,
        message: 'Prototype Final Form 必须使用 prototype-final-form-* ID',
      });
    }
    if (!validateFinalForm(form).isComplete) {
      issues.push({
        kind: 'unknown-owner',
        targetId: form.id,
        message: 'Prototype Final Form 不自洽',
      });
    }
  }

  return issues;
}
