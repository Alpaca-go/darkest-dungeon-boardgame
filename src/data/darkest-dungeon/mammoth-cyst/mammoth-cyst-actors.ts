// Phase 10C §6 / §10 / §16 / §24：Mammoth Cyst 与 White Cell Stalk Actor Definition。
//
// 资料实况（docs/reports/phase-10c-mammoth-cyst-data-audit.md）：
// - `mammoth-cyst-battle-card` = unavailable；
// - `white-cell-stalk-battle-card` = unavailable；
// - `white-cell-stalk-spawn-policy` = partial；
// - `white-cell-stalk-teleportation` = partial。
//
// 因此正式 Definition：
// - `stats = null`、`skills = []` → validateMammothCystActor 必然失败 → official 禁用；
// - **绝不**从电子游戏数值、造型或另一名 Boss 推算（§3）。

import type {
  MammothCystActorDefinition,
  MammothCystSkillDefinition,
  WhiteCellStalkActorDefinition,
} from '../../../types/mammoth-cyst';
import {
  MAMMOTH_CYST_ACTOR_OFFICIAL_ID,
  MAMMOTH_CYST_ACTOR_PROTOTYPE_ID,
  MAMMOTH_CYST_ROOM_TELEPORTATION_MAP_PROTOTYPE_ID,
  MAMMOTH_CYST_SMASH_PROTOTYPE_ID,
  WHITE_CELL_STALK_OFFICIAL_ID,
  WHITE_CELL_STALK_PROTOTYPE_ID,
  WHITE_CELL_STALK_TELEPORTATION_PROTOTYPE_ID,
} from './ids';

// ---------------------------------------------------------------------------
// Mammoth Cyst —— 正式 Definition（空壳；驱动 Data Gate）
// ---------------------------------------------------------------------------

export const MAMMOTH_CYST_ACTOR_OFFICIAL: MammothCystActorDefinition = {
  id: MAMMOTH_CYST_ACTOR_OFFICIAL_ID,
  actorType: 'boss',
  name: 'Mammoth Cyst',
  campaignLevel: 3,

  // 规则书 p.39 verified：
  requiredStance: 'aggressive',
  actionsPerRound: 2,

  // unavailable：
  stats: null,
  skills: [],

  color: '#6b8b3d',
  officialDataStatus: 'partial',
  sourceReference: 'DD_EN_COREBOX_RULES.pdf:p39',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// Mammoth Cyst —— Prototype Harness（仅供开发验证 Cyst / Stalk / Teleportation 框架）
// ---------------------------------------------------------------------------

/**
 * Prototype Mammoth Cyst 普通攻击。
 * 覆盖 1—10（单条 Skill 覆盖全部骰点），数值全部是原型占位，
 * 明确挂在 prototype ID 上，**不得**复制到 `mammoth-cyst-level-3`。
 */
export const MAMMOTH_CYST_SMASH_PROTOTYPE: MammothCystSkillDefinition = {
  id: MAMMOTH_CYST_SMASH_PROTOTYPE_ID,
  actorDefinitionId: MAMMOTH_CYST_ACTOR_PROTOTYPE_ID,
  name: '碾压（原型）',
  d10Rolls: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  usableFromAreaIds: ['prototype-mammoth-cyst-area'],
  targetSide: 'enemy',
  targetKind: 'hero',
  accuracy: 7,
  minDamage: 3,
  maxDamage: 6,
  stress: 1,
  triggersTeleportation: false,
  rollPolicy: 'one-roll-per-target',
  requiresHit: true,
  description: 'Mammoth Cyst 原型碾压：基础攻击，不触发 Teleportation。数值仅供管线验证。',
  officialDataStatus: 'prototype',
};

export const MAMMOTH_CYST_ACTOR_PROTOTYPE: MammothCystActorDefinition = {
  id: MAMMOTH_CYST_ACTOR_PROTOTYPE_ID,
  actorType: 'boss',
  name: 'Mammoth Cyst（原型 Harness）',
  campaignLevel: 3,

  requiredStance: 'aggressive',
  actionsPerRound: 2,

  stats: {
    maxHp: 60,
    dodge: 8,
    speed: 2,
    resistances: { stun: 50, blight: 50, bleed: 50, disease: 70, debuff: 50, move: 70 },
    immunities: ['mark'],
    size: 2,
  },
  skills: [MAMMOTH_CYST_SMASH_PROTOTYPE],

  color: '#6b8b3d',
  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// White Cell Stalk —— 正式 Definition（空壳；驱动 Data Gate）
// ---------------------------------------------------------------------------

export const WHITE_CELL_STALK_OFFICIAL: WhiteCellStalkActorDefinition = {
  id: WHITE_CELL_STALK_OFFICIAL_ID,
  actorType: 'boss-minion',
  name: 'White Cell Stalk',
  campaignLevel: 3,

  requiredStance: null,
  actionsPerRound: 2,

  stats: null,
  skills: [],

  color: '#d9d9d9',
  officialDataStatus: 'partial',
  sourceReference: 'DD_EN_COREBOX_RULES.pdf:p39',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// White Cell Stalk —— Prototype Harness
// ---------------------------------------------------------------------------

/**
 * Prototype White Cell Stalk Teleportation。
 * 规则书唯一 verified 的语义是「掷 1d10 并将受影响 Hero 放到对应 Area」（§2.8）。
 * 覆盖 1—10（任一 Stalk 行动都演示 Teleportation 框架），
 * 映射只来自 Room Definition 的 teleportationD10Map（§19）。
 */
export const WHITE_CELL_STALK_TELEPORTATION_PROTOTYPE: MammothCystSkillDefinition = {
  id: WHITE_CELL_STALK_TELEPORTATION_PROTOTYPE_ID,
  actorDefinitionId: WHITE_CELL_STALK_PROTOTYPE_ID,
  name: 'Teleportation（原型）',
  d10Rolls: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  usableFromAreaIds: ['prototype-white-cell-stalk-area'],
  targetSide: 'enemy',
  targetKind: 'hero',
  accuracy: 9,
  minDamage: 0,
  maxDamage: 0,
  stress: 0,
  triggersTeleportation: true,
  teleportationMapId: MAMMOTH_CYST_ROOM_TELEPORTATION_MAP_PROTOTYPE_ID,
  rollPolicy: 'single-roll-for-all-targets',
  requiresHit: false,
  description: 'White Cell Stalk 原型 Teleportation：掷 1d10，按 Room Map 强制位移 Hero。数值仅供管线验证。',
  officialDataStatus: 'prototype',
};

export const WHITE_CELL_STALK_PROTOTYPE: WhiteCellStalkActorDefinition = {
  id: WHITE_CELL_STALK_PROTOTYPE_ID,
  actorType: 'boss-minion',
  name: 'White Cell Stalk（原型 Harness）',
  campaignLevel: 3,

  requiredStance: null,
  actionsPerRound: 2,

  stats: {
    maxHp: 20,
    dodge: 12,
    speed: 4,
    resistances: { stun: 30, blight: 30, bleed: 30, disease: 50, debuff: 30, move: 90 },
    immunities: ['mark'],
    size: 1,
  },
  skills: [WHITE_CELL_STALK_TELEPORTATION_PROTOTYPE],

  color: '#d9d9d9',
  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};
