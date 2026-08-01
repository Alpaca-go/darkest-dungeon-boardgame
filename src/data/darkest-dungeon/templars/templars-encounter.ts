// Phase 10B §7 / §21：Templars Dual Boss Encounter Definition + Victory Rule。
//
// 资料实况：`templars-victory-condition` = unavailable。
// 硬约束（§3 / §21）：
// - 不自行规定「只杀 Impaler 或 Warlord 即可胜利」；
// - 不根据「Boss Fight」标题自行断言胜利条件；
// → 正式 Encounter 的 victoryCondition 固定为 'definition-driven'，
//   且 `getTemplarsVictoryRule('formal')` 返回 null → official 禁用。
//
// Prototype Harness 可使用「两名均死亡」验证 Dual Boss 框架，
// 但该假设**只挂在 prototype ID 上**，绝不写进 verified 数据（§7）。

import type { DualBossEncounterDefinition, DualBossVictoryRule } from '../../../types/dual-boss';
import {
  TEMPLARS_ENCOUNTER_OFFICIAL_ID,
  TEMPLARS_PROTOTYPE_HARNESS_ID,
  TEMPLARS_ROOM_OFFICIAL_ID,
  TEMPLARS_ROOM_PROTOTYPE_ID,
  TEMPLAR_IMPALER_OFFICIAL_ID,
  TEMPLAR_IMPALER_PROTOTYPE_ID,
  TEMPLAR_WARLORD_OFFICIAL_ID,
  TEMPLAR_WARLORD_PROTOTYPE_ID,
} from './ids';

// ---------------------------------------------------------------------------
// 正式 Encounter（requiredAreaId 空 + victory 未确认 → 驱动 Data Gate）
// ---------------------------------------------------------------------------

export const TEMPLARS_ENCOUNTER_OFFICIAL: DualBossEncounterDefinition = {
  id: TEMPLARS_ENCOUNTER_OFFICIAL_ID,
  guardianFamilyId: 'templars',

  bossMembers: [
    {
      actorDefinitionId: TEMPLAR_IMPALER_OFFICIAL_ID,
      role: 'impaler',
      requiredStance: 'aggressive',
      requiredAreaId: '', // Room Tile Area 未知
      initiativeCardsPerRound: 2,
    },
    {
      actorDefinitionId: TEMPLAR_WARLORD_OFFICIAL_ID,
      role: 'warlord',
      requiredStance: 'ranged',
      requiredAreaId: '', // Room Tile Area 未知
      initiativeCardsPerRound: 2,
    },
  ],

  roomDefinitionId: TEMPLARS_ROOM_OFFICIAL_ID,

  victoryCondition: 'definition-driven',
  failureCondition: 'party-defeated',

  officialDataStatus: 'partial',
  sourceReference: 'DD_EN_COREBOX_RULES.pdf:p39',
  enabledInOfficialPool: false,
};

/** 正式 Victory Rule —— **无来源资料，恒为 null**（禁止推测）。 */
export const TEMPLARS_VICTORY_RULE_OFFICIAL: DualBossVictoryRule | null = null;

// ---------------------------------------------------------------------------
// Prototype Harness
// ---------------------------------------------------------------------------

export const TEMPLARS_ENCOUNTER_PROTOTYPE: DualBossEncounterDefinition = {
  id: TEMPLARS_PROTOTYPE_HARNESS_ID,
  guardianFamilyId: 'templars',

  bossMembers: [
    {
      actorDefinitionId: TEMPLAR_IMPALER_PROTOTYPE_ID,
      role: 'impaler',
      requiredStance: 'aggressive',
      requiredAreaId: 'prototype-templars-impaler-area',
      initiativeCardsPerRound: 2,
    },
    {
      actorDefinitionId: TEMPLAR_WARLORD_PROTOTYPE_ID,
      role: 'warlord',
      requiredStance: 'ranged',
      requiredAreaId: 'prototype-templars-warlord-area',
      initiativeCardsPerRound: 2,
    },
  ],

  roomDefinitionId: TEMPLARS_ROOM_PROTOTYPE_ID,

  // 仅 Prototype 可断言「两名均死亡」。
  victoryCondition: 'all-boss-members-defeated',
  failureCondition: 'party-defeated',

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

export const TEMPLARS_VICTORY_RULE_PROTOTYPE: DualBossVictoryRule = {
  type: 'all-listed-boss-actors-defeated',
  requiredActorDefinitionIds: [TEMPLAR_IMPALER_PROTOTYPE_ID, TEMPLAR_WARLORD_PROTOTYPE_ID],
};
