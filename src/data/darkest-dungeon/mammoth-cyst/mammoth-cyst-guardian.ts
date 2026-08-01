// Phase 10C §7 / §12：Mammoth Cyst Guardian Definition + Conditional Summon Definition。
//
// 资料实况（docs/reports/phase-10c-mammoth-cyst-data-audit.md）：
// - `guardian-victory-cleanup` = partial；
// - `white-cell-stalk-spawn-policy` = partial；
// - `teleportation-d10-area-map` = unavailable；
// - `teleportation-capacity-policy` = unavailable；
// - Stalk / Cyst / Room 完整 Battle Card = unavailable / partial。
//
// 硬约束（§3 / §20）：
// - 不自行规定「只杀 Cyst 即可胜利」（其实规则书 Cyst 即 Guardian 主体，这是 verified 的，
//   但 Victory Condition 的**正式文本**仍需核对 → 正式固定 'definition-driven' 并禁用 official）；
// - 不根据电子游戏或造型推测 Spawn / Map / Capacity；
// → 正式 Definition 的 victoryCondition / cleanupPolicy 固定为 'definition-driven'，
//   且 `getMammothCystGuardianDefinition('formal')` 通过 Data Gate 校验必然失败 → official 禁用。
//
// Prototype Harness 可使用「Cyst 被击败即 Victory、Stalk 随之清理」验证框架，
// 但该假设**只挂在 prototype ID 上**，绝不写进 verified 数据（§7）。

import type {
  ConditionalLinkedActorSummon,
  MammothCystGuardianDefinition,
} from '../../../types/mammoth-cyst';
import {
  MAMMOTH_CYST_ACTOR_OFFICIAL_ID,
  MAMMOTH_CYST_ACTOR_PROTOTYPE_ID,
  MAMMOTH_CYST_GUARDIAN_FAMILY_ID,
  MAMMOTH_CYST_GUARDIAN_OFFICIAL_ID,
  MAMMOTH_CYST_PROTOTYPE_HARNESS_ID,
  MAMMOTH_CYST_ROOM_OFFICIAL_ID,
  MAMMOTH_CYST_ROOM_PROTOTYPE_ID,
  MAMMOTH_CYST_SUMMON_OFFICIAL_ID,
  MAMMOTH_CYST_SUMMON_PROTOTYPE_ID,
  WHITE_CELL_STALK_OFFICIAL_ID,
  WHITE_CELL_STALK_PROTOTYPE_ID,
} from './ids';

// ---------------------------------------------------------------------------
// 正式 Guardian Definition（requiredAreaId 空 + victory 未确认 → 驱动 Data Gate）
// ---------------------------------------------------------------------------

export const MAMMOTH_CYST_GUARDIAN_OFFICIAL: MammothCystGuardianDefinition = {
  id: MAMMOTH_CYST_GUARDIAN_OFFICIAL_ID,
  guardianFamilyId: MAMMOTH_CYST_GUARDIAN_FAMILY_ID,

  bossActorDefinitionId: MAMMOTH_CYST_ACTOR_OFFICIAL_ID,
  linkedActorDefinitionId: WHITE_CELL_STALK_OFFICIAL_ID,
  roomDefinitionId: MAMMOTH_CYST_ROOM_OFFICIAL_ID,
  conditionalSummonDefinitionId: MAMMOTH_CYST_SUMMON_OFFICIAL_ID,

  // §7：正式 Victory / Cleanup 未核对 → 固定 definition-driven，禁 official。
  victoryCondition: 'definition-driven',
  cleanupPolicy: 'definition-driven',

  officialDataStatus: 'partial',
  sourceReference: 'DD_EN_COREBOX_RULES.pdf:p31,p39',
  enabledInOfficialPool: false,
};

/** 正式 Conditional Summon —— **无来源资料，恒为 null**（禁止推测）。 */
export const MAMMOTH_CYST_SUMMON_OFFICIAL: ConditionalLinkedActorSummon | null = null;

// ---------------------------------------------------------------------------
// Prototype Harness
// ---------------------------------------------------------------------------

export const MAMMOTH_CYST_GUARDIAN_PROTOTYPE: MammothCystGuardianDefinition = {
  id: MAMMOTH_CYST_PROTOTYPE_HARNESS_ID,
  guardianFamilyId: MAMMOTH_CYST_GUARDIAN_FAMILY_ID,

  bossActorDefinitionId: MAMMOTH_CYST_ACTOR_PROTOTYPE_ID,
  linkedActorDefinitionId: WHITE_CELL_STALK_PROTOTYPE_ID,
  roomDefinitionId: MAMMOTH_CYST_ROOM_PROTOTYPE_ID,
  conditionalSummonDefinitionId: MAMMOTH_CYST_SUMMON_PROTOTYPE_ID,

  // 仅 Prototype 可断言「Cyst 被击败即 Victory、Stalk 随之清理」。
  victoryCondition: 'boss-defeated',
  cleanupPolicy: 'remove-linked-actors-on-boss-victory',

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

export const MAMMOTH_CYST_SUMMON_PROTOTYPE: ConditionalLinkedActorSummon = {
  id: MAMMOTH_CYST_SUMMON_PROTOTYPE_ID,
  sourceActorDefinitionId: MAMMOTH_CYST_ACTOR_PROTOTYPE_ID,
  linkedActorDefinitionId: WHITE_CELL_STALK_PROTOTYPE_ID,
  condition: { type: 'no-alive-actors-with-tag', tag: 'white-cell-stalk' },
  replacesNormalSkill: true,
  initiativeCardsToAdd: 2,
  maxAlive: 1,
  resummonPolicy: 'on-source-turn-when-none-alive',
};
