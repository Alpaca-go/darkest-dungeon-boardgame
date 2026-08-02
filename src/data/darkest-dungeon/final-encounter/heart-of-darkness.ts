// Phase 10E §Heart of Darkness：Impending Doom / Forecast / Campaign Victory。
//
// 数据来源：docs/data/darkest-dungeon/final-encounter/heart-of-darkness.json
//   （officialDataStatus = 'partial'，sourceReference = DD_EN_COREBOX_RULES.pdf:p41）
// 审计结论：docs/reports/phase-10e-final-encounter-data-audit.md §2.5
//
// 关键缺口：
// - impendingDoom.d10SkillMap 十格**全为空字符串** → 正式 Heart 无法执行任何行动；
// - skills = [] → 本体技能表缺失；
// - comeUntoYourMaker.definition = null → 硬约束 21：**明确禁用，不按电子游戏实现**。
//
// 可实现的部分是 Forecast 的**生命周期**（硬约束 18—20）：
// Battle Start 先生成 → 玩家可见 → 回合到来时消费（不重掷）→ Action 完成后生成下一次。

import type {
  FinalFormMechanicsValidation,
  HeartOfDarknessMechanics,
} from '../../../types/final-forms';
import { PROTOTYPE_FINAL_MECHANICS_PREFIX } from './ancestor-first-form';

/** Impending Doom 的骰面数（d10）。 */
export const IMPENDING_DOOM_DIE_FACES = 10;

function emptyD10Map(): Record<number, string> {
  const map: Record<number, string> = {};
  for (let roll = 1; roll <= IMPENDING_DOOM_DIE_FACES; roll += 1) map[roll] = '';
  return map;
}

export const OFFICIAL_HEART_OF_DARKNESS_MECHANICS: HeartOfDarknessMechanics = {
  id: 'heart-of-darkness',
  formId: 'heart-of-darkness',

  initiativeCardCount: 2,
  cannotBeSkipped: true,

  impendingDoom: {
    triggerAtBattleStart: true,
    triggerAfterCompletedAction: true,
    forecastVisibleToPlayers: true,
    consumeForecastOnTurn: true,
    // 十格全空 —— JSON 原样转写，不填充任何推测技能。
    d10SkillMap: emptyD10Map(),
  },

  skillIds: [],

  // 硬约束 21：官方数据 unavailable → 恒禁用。
  comeUntoYourMakerEnabled: false,

  victoryPolicy: 'campaign-victory',

  officialDataStatus: 'partial',
  sourceReference: 'DD_EN_COREBOX_RULES.pdf:p41',
  enabledInOfficialPool: false,
};

function prototypeD10Map(): Record<number, string> {
  const map: Record<number, string> = {};
  for (let roll = 1; roll <= IMPENDING_DOOM_DIE_FACES; roll += 1) {
    map[roll] = `${PROTOTYPE_FINAL_MECHANICS_PREFIX}impending-doom-${roll}`;
  }
  return map;
}

export const PROTOTYPE_HEART_OF_DARKNESS_MECHANICS: HeartOfDarknessMechanics = {
  ...OFFICIAL_HEART_OF_DARKNESS_MECHANICS,
  id: `${PROTOTYPE_FINAL_MECHANICS_PREFIX}heart-of-darkness`,

  impendingDoom: {
    ...OFFICIAL_HEART_OF_DARKNESS_MECHANICS.impendingDoom,
    d10SkillMap: prototypeD10Map(),
  },

  skillIds: [`${PROTOTYPE_FINAL_MECHANICS_PREFIX}heart-strike`],

  // 即便在 prototype 下也**不**实现 Come Unto Your Maker（硬约束 21 无豁免）。
  comeUntoYourMakerEnabled: false,

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// 校验（Data Gate）
// ---------------------------------------------------------------------------

export function validateHeartOfDarknessMechanics(
  m: HeartOfDarknessMechanics,
): FinalFormMechanicsValidation {
  const missing: string[] = [];
  const issues: string[] = [];

  if (m.initiativeCardCount !== 2) issues.push('Heart of Darkness 的 Initiative Card 必须为 2');
  if (!m.cannotBeSkipped) issues.push('Heart of Darkness 不得被标记为可跳过');

  const doom = m.impendingDoom;
  if (!doom.triggerAtBattleStart) issues.push('Impending Doom 必须在 Battle Start 生成 Forecast');
  if (!doom.triggerAfterCompletedAction) {
    issues.push('Impending Doom 必须在 Action 完成后生成下一个 Forecast');
  }
  if (!doom.consumeForecastOnTurn) issues.push('Heart 回合必须消费既有 Forecast，不得重掷');
  if (!doom.forecastVisibleToPlayers) issues.push('Forecast 必须对玩家可见');

  for (let roll = 1; roll <= IMPENDING_DOOM_DIE_FACES; roll += 1) {
    if (!doom.d10SkillMap[roll]) missing.push(`heart-of-darkness:impending-doom-skill:${roll}`);
  }

  if (m.skillIds.length === 0) missing.push('heart-of-darkness:skills');

  if (m.comeUntoYourMakerEnabled) {
    issues.push('Come Unto Your Maker 官方数据缺失，不得启用');
  }

  if (m.victoryPolicy !== 'campaign-victory') {
    issues.push('击败 Heart of Darkness 必须直接结算 Campaign Victory');
  }

  if (m.officialDataStatus === 'unavailable') {
    issues.push('Heart of Darkness 机制数据缺失（unavailable）');
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}
