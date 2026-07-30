import type { ActiveEffect, BattleUnit } from '../types';
import { applyBattleUnitDamage, type BattleDamageOutcome } from './damage';
import { applyQuirkModifiersRaw, describeModifierApplications } from './quirk-passives';

/** 给单位施加一个状态效果（返回新单位，不修改原对象）。 */
export function applyEffectToUnit(unit: BattleUnit, effect: ActiveEffect): BattleUnit {
  switch (effect.type) {
    case 'stun':
      return { ...unit, stunned: unit.stunned + effect.amount };
    case 'bleed':
      return { ...unit, bleed: unit.bleed + effect.amount };
    case 'blight':
      return { ...unit, blight: unit.blight + effect.amount };
    case 'mark':
      return { ...unit, marked: true };
    default:
      return unit;
  }
}

/** 施加一组状态效果。 */
export function applyEffects(unit: BattleUnit, effects?: ActiveEffect[]): BattleUnit {
  if (!effects || effects.length === 0) return unit;
  return effects.reduce((u, e) => applyEffectToUnit(u, e), unit);
}

/** 回合开始持续伤害批量结算的结果。 */
export interface StartOfTurnResult {
  unit: BattleUnit;
  messages: string[];
  /** 本批次是否掷了 Deathblow（Death's Door + Bleed/Blight = 只掷一次）。 */
  deathblowRolled: boolean;
  deathblowRoll?: number;
  deathblowResult?: 'safe' | 'dead';
  enteredDeathsDoor: boolean;
  /** 英雄因本批次持续伤害永久死亡。 */
  heroDied: boolean;
}

/**
 * Phase 6：回合开始时的持续伤害批量结算（5.4 / 第 9 节）。
 * Bleed 与 Blight 合并为同一批次，只调用一次统一伤害入口：
 * - Death's Door 英雄同时有 Bleed+Blight → 只掷一次 Deathblow；
 * - 非 Death's Door 英雄合并扣血，首次归零只进入 Death's Door（本批次不掷骰）；
 * - 每种状态仍分别减少自己的层数；
 * - 怪物保持即时死亡规则。
 */
export function resolveStartOfTurnConditions(unit: BattleUnit, light = 0): StartOfTurnResult {
  const messages: string[] = [];
  let next = unit;
  const rawBleed = next.bleed > 0 ? next.bleed : 0;
  const rawBlight = next.blight > 0 ? next.blight : 0;

  // Phase 8A：Clotter / Thick Blooded 等按伤害来源分别修正，再合并为同一批次
  const isHero = next.side === 'hero';
  const bleedMod = isHero
    ? applyQuirkModifiersRaw(next.quirkIds ?? [], light, 'damage-taken', rawBleed, 'bleed')
    : { amount: rawBleed, applied: [] };
  const blightMod = isHero
    ? applyQuirkModifiersRaw(next.quirkIds ?? [], light, 'damage-taken', rawBlight, 'blight')
    : { amount: rawBlight, applied: [] };
  const bleedDmg = rawBleed > 0 ? bleedMod.amount : 0;
  const blightDmg = rawBlight > 0 ? blightMod.amount : 0;
  if (bleedMod.applied.length > 0 && rawBleed > 0) {
    messages.push(
      `${next.name} 流血伤害 ${rawBleed} → ${bleedDmg}${describeModifierApplications(bleedMod.applied)}。`
    );
  }
  if (blightMod.applied.length > 0 && rawBlight > 0) {
    messages.push(
      `${next.name} 腐蚀伤害 ${rawBlight} → ${blightDmg}${describeModifierApplications(blightMod.applied)}。`
    );
  }
  const total = bleedDmg + blightDmg;

  // 分别减少层数（伤害合并结算，层数各自 -1；即使被修正到 0 也要正常衰减）
  if (rawBleed > 0) {
    next = { ...next, bleed: Math.max(0, next.bleed - 1) };
    messages.push(`${next.name} 受到 Bleed 伤害 ${bleedDmg}（剩余 ${next.bleed}）。`);
  }
  if (rawBlight > 0) {
    next = { ...next, blight: Math.max(0, next.blight - 1) };
    messages.push(`${next.name} 受到 Blight 伤害 ${blightDmg}（剩余 ${next.blight}）。`);
  }

  if (total <= 0) {
    return {
      unit: next,
      messages,
      deathblowRolled: false,
      enteredDeathsDoor: false,
      heroDied: false,
    };
  }

  // 单次批量伤害入口（batch：Bleed + Blight 只有一次死亡判定）
  const outcome: BattleDamageOutcome = applyBattleUnitDamage(next, total);
  let resolved = outcome.unit;
  if (outcome.heroDied) {
    resolved = { ...resolved, deathCause: 'deathblow-periodic' };
  }
  messages.push(...outcome.logs);
  if (resolved.side === 'monster' && !resolved.isAlive && unit.isAlive) {
    messages.push(`${resolved.name} 因持续伤害倒下！`);
  }

  return {
    unit: resolved,
    messages,
    deathblowRolled: outcome.deathblowRolled,
    deathblowRoll: outcome.deathblowRoll,
    deathblowResult: outcome.deathblowResult,
    enteredDeathsDoor: outcome.enteredDeathsDoor,
    heroDied: outcome.heroDied,
  };
}

/**
 * 兼容旧签名的包装（Phase 3 命名）。
 * 内部走 Phase 6 统一批量结算管线。
 */
export function applyStartOfTurn(unit: BattleUnit): { unit: BattleUnit; messages: string[] } {
  const r = resolveStartOfTurnConditions(unit);
  return { unit: r.unit, messages: r.messages };
}

/** Stun 跳过：行动结束后移除一层 Stun。 */
export function tickStun(unit: BattleUnit): BattleUnit {
  return { ...unit, stunned: Math.max(0, unit.stunned - 1) };
}
