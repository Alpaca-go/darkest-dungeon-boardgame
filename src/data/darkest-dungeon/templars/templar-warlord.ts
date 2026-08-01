// Phase 10B §6 / §13：Templar Warlord Actor Definition。
//
// 资料实况：`templar-warlord-battle-card` = unavailable。
// 硬约束：**不得从 Impaler 的数据推算 Warlord**（§3）。
// 因此正式 Definition 的 stats / skills 独立留空，各自驱动 Data Gate。

import type { TemplarActorDefinition, TemplarSkillDefinition } from '../../../types/templars';
import { TEMPLAR_WARLORD_OFFICIAL_ID, TEMPLAR_WARLORD_PROTOTYPE_ID } from './ids';

// ---------------------------------------------------------------------------
// 正式 Definition（空壳；驱动 Data Gate）
// ---------------------------------------------------------------------------

export const TEMPLAR_WARLORD_OFFICIAL: TemplarActorDefinition = {
  id: TEMPLAR_WARLORD_OFFICIAL_ID,
  role: 'warlord',
  actorType: 'boss',
  name: 'Templar Warlord',
  campaignLevel: 3,

  // 规则书 p.39 verified：
  requiredStance: 'ranged',
  actionsPerRound: 2,

  // unavailable：
  stats: null,
  skills: [],

  color: '#6b4f8b',

  officialDataStatus: 'partial',
  sourceReference: 'DD_EN_COREBOX_RULES.pdf:p39',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// Prototype Harness
// ---------------------------------------------------------------------------

/**
 * Warlord 的原型技能。
 * 关键测试点（§30-35）：Warlord 的技能**绝不**声明 `trigger-pit-toss`，
 * Pit Toss 只属于 Impaler 的 Body Slam。
 */
export const TEMPLAR_WARLORD_VOLLEY_PROTOTYPE: TemplarSkillDefinition = {
  id: 'prototype-warlord-volley',
  actorDefinitionId: TEMPLAR_WARLORD_PROTOTYPE_ID,
  name: '齐射（原型）',
  d10Rolls: [1, 2, 3, 4, 5],
  usableFromAreaIds: ['prototype-templars-warlord-area'],
  targetSide: 'enemy',
  targetKind: 'hero',
  accuracy: 7,
  minDamage: 2,
  maxDamage: 5,
  stress: 1,
  onHitEffects: [],
  effectSequence: ['hit-resolution', 'damage', 'conditions'],
  description: 'Warlord 原型远程攻击。不触发 Pit Toss。',
  officialDataStatus: 'prototype',
};

export const TEMPLAR_WARLORD_ROAR_PROTOTYPE: TemplarSkillDefinition = {
  id: 'prototype-warlord-roar',
  actorDefinitionId: TEMPLAR_WARLORD_PROTOTYPE_ID,
  name: '咆哮（原型）',
  d10Rolls: [6, 7, 8, 9, 10],
  usableFromAreaIds: ['prototype-templars-warlord-area'],
  targetSide: 'enemy',
  targetKind: 'hero',
  accuracy: 9,
  minDamage: 0,
  maxDamage: 0,
  stress: 2,
  onHitEffects: [],
  effectSequence: ['hit-resolution', 'conditions'],
  description: 'Warlord 原型压力攻击。不触发 Pit Toss。',
  officialDataStatus: 'prototype',
};

export const TEMPLAR_WARLORD_PROTOTYPE: TemplarActorDefinition = {
  id: TEMPLAR_WARLORD_PROTOTYPE_ID,
  role: 'warlord',
  actorType: 'boss',
  name: 'Templar Warlord（原型 Harness）',
  campaignLevel: 3,

  requiredStance: 'ranged',
  actionsPerRound: 2,

  stats: {
    maxHp: 38,
    dodge: 15,
    speed: 4,
    resistances: { stun: 30, blight: 30, bleed: 30, disease: 50, debuff: 30, move: 60 },
    immunities: [],
    size: 1,
  },
  skills: [TEMPLAR_WARLORD_VOLLEY_PROTOTYPE, TEMPLAR_WARLORD_ROAR_PROTOTYPE],

  color: '#6b4f8b',

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};
