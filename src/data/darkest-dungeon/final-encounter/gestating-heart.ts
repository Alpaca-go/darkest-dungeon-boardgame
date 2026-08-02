// Phase 10E §Gestating Heart：Sispersion / Wounded Reaction。
//
// 数据来源：docs/data/darkest-dungeon/final-encounter/gestating-heart.json
//   （officialDataStatus = 'partial'，sourceReference = DD_EN_COREBOX_RULES.pdf:p41）
// 审计结论：docs/reports/phase-10e-final-encounter-data-audit.md §2.4
//
// 关键缺口：`darkest-dungeon-monsters` 牌堆**只有 ID、没有内容**
// （全库检索仅在该 JSON 出现一次）→ 官方 monsterDefinitionIds 为空数组，
// Sispersion 在 formal 模式必然被 Data Gate 拦下（硬约束 15）。

import type {
  FinalFormMechanicsValidation,
  GestatingHeartMechanics,
} from '../../../types/final-forms';
import { PROTOTYPE_FINAL_MECHANICS_PREFIX } from './ancestor-first-form';

/** Darkest Dungeon Monster Deck ID（Sispersion 的唯一合法抽取源）。 */
export const DARKEST_DUNGEON_MONSTER_DECK_ID = 'darkest-dungeon-monsters';

export const OFFICIAL_GESTATING_HEART_MECHANICS: GestatingHeartMechanics = {
  id: 'gestating-heart',
  formId: 'gestating-heart',

  initiativeCardCount: 1,

  monsterDeckId: DARKEST_DUNGEON_MONSTER_DECK_ID,
  // 牌堆组成 unavailable → 不猜测，留空驱动 Data Gate。
  monsterDefinitionIds: [],

  sispersion: {
    summonCount: 1,
    selectionPolicy: 'random',
    stancePolicy: 'next-available-stance',
    initiativeCardsToAdd: 1,
  },

  woundedReaction: {
    trigger: 'hero-attack-applied-wounds',
    blightPotency: 2,
    blightDurationTurns: 3,
    heal: 2,
    // JSON 只给了 'definition-driven' 这个策略名，没有实际裁决 → 不猜测。
    triggersAfterLethalWound: null,
  },

  officialDataStatus: 'partial',
  sourceReference: 'DD_EN_COREBOX_RULES.pdf:p41',
  enabledInOfficialPool: false,
};

/** Prototype 抽取池（独立 ID；绝不写入正式牌堆）。 */
export const PROTOTYPE_DARKEST_DUNGEON_MONSTER_DECK_ID = `${PROTOTYPE_FINAL_MECHANICS_PREFIX}darkest-dungeon-monsters`;

export const PROTOTYPE_DARKEST_DUNGEON_MONSTER_IDS: string[] = [
  `${PROTOTYPE_FINAL_MECHANICS_PREFIX}monster-a`,
  `${PROTOTYPE_FINAL_MECHANICS_PREFIX}monster-b`,
  `${PROTOTYPE_FINAL_MECHANICS_PREFIX}monster-c`,
];

export const PROTOTYPE_GESTATING_HEART_MECHANICS: GestatingHeartMechanics = {
  ...OFFICIAL_GESTATING_HEART_MECHANICS,
  id: `${PROTOTYPE_FINAL_MECHANICS_PREFIX}gestating-heart`,

  monsterDeckId: PROTOTYPE_DARKEST_DUNGEON_MONSTER_DECK_ID,
  monsterDefinitionIds: [...PROTOTYPE_DARKEST_DUNGEON_MONSTER_IDS],

  woundedReaction: {
    ...OFFICIAL_GESTATING_HEART_MECHANICS.woundedReaction,
    // harness 取「致死伤害不再触发反应」，仅原型口径。
    triggersAfterLethalWound: false,
  },

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// 校验（Data Gate）
// ---------------------------------------------------------------------------

export function validateGestatingHeartMechanics(
  m: GestatingHeartMechanics,
): FinalFormMechanicsValidation {
  const missing: string[] = [];
  const issues: string[] = [];

  if (m.initiativeCardCount !== 1) issues.push('Gestating Heart 的基础 Initiative Card 必须为 1');

  if (!m.monsterDeckId) missing.push('gestating-heart:monster-deck-id');
  if (m.monsterDefinitionIds.length === 0) missing.push('gestating-heart:monster-deck-contents');

  if (m.sispersion.summonCount <= 0) issues.push('Sispersion 必须至少召唤 1 只');
  if (!m.sispersion.selectionPolicy) missing.push('gestating-heart:sispersion-selection-policy');
  if (!m.sispersion.stancePolicy) missing.push('gestating-heart:sispersion-stance-policy');
  if (m.sispersion.initiativeCardsToAdd <= 0) {
    issues.push('Sispersion 必须同时追加 Initiative Card（召唤与先攻原子）');
  }

  const wr = m.woundedReaction;
  if (!wr.trigger) missing.push('gestating-heart:wounded-reaction-trigger');
  if (wr.blightPotency === null) missing.push('gestating-heart:wounded-reaction-blight-potency');
  if (wr.blightDurationTurns === null) missing.push('gestating-heart:wounded-reaction-blight-duration');
  if (wr.heal === null) missing.push('gestating-heart:wounded-reaction-heal');
  if (wr.triggersAfterLethalWound === null) {
    missing.push('gestating-heart:wounded-reaction-lethal-ruling');
  }

  if (m.officialDataStatus === 'unavailable') {
    issues.push('Gestating Heart 机制数据缺失（unavailable）');
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}
