// Phase 10B §6 / §13 / §14：Templar Impaler Actor Definition。
//
// 资料实况（docs/reports/phase-10b-templars-data-audit.md）：
// - `templar-impaler-battle-card` = unavailable → stats / skills 全缺；
// - `body-slam` = partial → 只知「命中 Hero 时触发 Pit Toss」，
//   Accuracy / Crit / Damage / Target 与效果顺序未知。
//
// 因此正式 Definition：
// - `stats = null`、`skills = []` → validateTemplarActor 必然失败 → official 禁用；
// - **绝不**从电子游戏数值、造型或另一名 Templar 推算（§3）。

import type { TemplarActorDefinition, TemplarSkillDefinition } from '../../../types/templars';
import {
  TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
  TEMPLAR_IMPALER_OFFICIAL_ID,
  TEMPLAR_IMPALER_PROTOTYPE_ID,
} from './ids';

// ---------------------------------------------------------------------------
// 正式 Definition（空壳；驱动 Data Gate）
// ---------------------------------------------------------------------------

export const TEMPLAR_IMPALER_OFFICIAL: TemplarActorDefinition = {
  id: TEMPLAR_IMPALER_OFFICIAL_ID,
  role: 'impaler',
  actorType: 'boss',
  name: 'Templar Impaler',
  campaignLevel: 3,

  // 以下两项由规则书 p.39 verified：
  requiredStance: 'aggressive',
  actionsPerRound: 2,

  // 以下两项 unavailable：
  stats: null,
  skills: [],

  color: '#8b6b3d',

  officialDataStatus: 'partial',
  sourceReference: 'DD_EN_COREBOX_RULES.pdf:p39',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// Prototype Harness（仅供开发验证 Dual Boss / Pit Toss 框架）
// ---------------------------------------------------------------------------

/**
 * Prototype Body Slam。
 *
 * 唯一 verified 的语义是 `onHitEffects: [{ type: 'trigger-pit-toss', target: 'hit-hero' }]`，
 * 即「命中 Hero → Pit Toss」。数值（accuracy / damage / stress）全部是原型占位，
 * 明确挂在 prototype ID 上，**不得**复制到 `templar-impaler-body-slam`。
 */
export const TEMPLAR_BODY_SLAM_PROTOTYPE: TemplarSkillDefinition = {
  id: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
  actorDefinitionId: TEMPLAR_IMPALER_PROTOTYPE_ID,
  name: 'Body Slam（原型）',
  d10Rolls: [1, 2, 3, 4, 5, 6],
  usableFromAreaIds: ['prototype-templars-impaler-area'],
  targetSide: 'enemy',
  targetKind: 'hero',
  accuracy: 8,
  minDamage: 3,
  maxDamage: 5,
  stress: 0,
  onHitEffects: [{ type: 'trigger-pit-toss', target: 'hit-hero' }],
  // 原型固定顺序：命中 → 伤害 → Pit Toss → 状态。正式顺序未核对（§14.2）。
  effectSequence: ['hit-resolution', 'damage', 'pit-toss', 'conditions'],
  description: 'Impaler 原型撞击：命中 Hero 后触发 Pit Toss。数值仅供管线验证。',
  officialDataStatus: 'prototype',
};

/** Impaler 的第二条原型技能（用于验证「不是所有技能都触发 Pit Toss」）。 */
export const TEMPLAR_IMPALER_JAB_PROTOTYPE: TemplarSkillDefinition = {
  id: 'prototype-impaler-jab',
  actorDefinitionId: TEMPLAR_IMPALER_PROTOTYPE_ID,
  name: '突刺（原型）',
  d10Rolls: [7, 8, 9, 10],
  usableFromAreaIds: ['prototype-templars-impaler-area'],
  targetSide: 'enemy',
  targetKind: 'hero',
  accuracy: 8,
  minDamage: 2,
  maxDamage: 4,
  stress: 1,
  onHitEffects: [],
  effectSequence: ['hit-resolution', 'damage', 'conditions'],
  description: 'Impaler 原型突刺：不触发 Pit Toss。用于反例测试。',
  officialDataStatus: 'prototype',
};

export const TEMPLAR_IMPALER_PROTOTYPE: TemplarActorDefinition = {
  id: TEMPLAR_IMPALER_PROTOTYPE_ID,
  role: 'impaler',
  actorType: 'boss',
  name: 'Templar Impaler（原型 Harness）',
  campaignLevel: 3,

  requiredStance: 'aggressive',
  actionsPerRound: 2,

  stats: {
    maxHp: 45,
    dodge: 10,
    speed: 3,
    resistances: { stun: 40, blight: 40, bleed: 40, disease: 60, debuff: 40, move: 80 },
    immunities: ['mark'],
    size: 1,
  },
  skills: [TEMPLAR_BODY_SLAM_PROTOTYPE, TEMPLAR_IMPALER_JAB_PROTOTYPE],

  color: '#8b6b3d',

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};
