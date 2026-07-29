import type { ActiveEffect, BattleUnit } from '../types';

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

/**
 * 回合开始时的持续效果结算（Bleed / Blight）。
 * 按当前层数造成伤害，然后层数 -1；归零后不再触发。死亡则标记 isAlive=false。
 * 返回更新后的单位与需要写入日志的消息。
 */
export function applyStartOfTurn(unit: BattleUnit): { unit: BattleUnit; messages: string[] } {
  let next = unit;
  const messages: string[] = [];
  if (next.bleed > 0) {
    const dmg = next.bleed;
    next = { ...next, hp: Math.max(0, next.hp - dmg), bleed: Math.max(0, next.bleed - 1) };
    messages.push(`${next.name} 受到 Bleed 伤害 ${dmg}（剩余 ${next.bleed}）。`);
  }
  if (next.blight > 0) {
    const dmg = next.blight;
    next = { ...next, hp: Math.max(0, next.hp - dmg), blight: Math.max(0, next.blight - 1) };
    messages.push(`${next.name} 受到 Blight 伤害 ${dmg}（剩余 ${next.blight}）。`);
  }
  if (next.hp <= 0 && next.isAlive) {
    next = { ...next, isAlive: false, hp: 0 };
    messages.push(`${next.name} 因持续伤害倒下！`);
  }
  return { unit: next, messages };
}

/** Stun 跳过：行动结束后移除一层 Stun。 */
export function tickStun(unit: BattleUnit): BattleUnit {
  return { ...unit, stunned: Math.max(0, unit.stunned - 1) };
}
