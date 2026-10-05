import type { BattleSkillLike, BattleUnit } from '../types';
import { d10, randInt } from './random';

export interface AttackResult {
  roll: number;
  hit: boolean;
  crit: boolean;
  damage: number;
}

/** Printed tabletop attacks have fixed ordinary/critical damage and a low d10 Crit threshold. */
export function resolvePrintedAttackFromRoll(skill: { accuracy: number; damage: number; crit: number; critDamage: number },
  roll: number, dodge: number, accuracyBonus = 0, critBonus = 0): AttackResult {
  if (!Number.isInteger(roll) || roll < 1 || roll > 10) throw new Error('Printed attack requires saved d10');
  const hit = roll <= skill.accuracy + accuracyBonus - dodge;
  const crit = hit && roll <= skill.crit + critBonus;
  return { roll, hit, crit, damage: hit ? (crit ? skill.critDamage : skill.damage) : 0 };
}

/** An attack result whose random damage roll has already been generated. */
export type PreparedAttackResolution = AttackResult;

export function rollAttackDie(): number {
  return d10();
}

export function resolveAttackFromRoll(
  skill: BattleSkillLike,
  roll: number,
  accuracyBonus = 0,
  critBonus = 0,
): AttackResult {
  const accuracy = (skill.accuracy ?? 7) + accuracyBonus;
  const critThreshold = Math.max(2, 10 - Math.max(0, critBonus));
  const natural10 = roll === 10;
  const hit = natural10 || roll <= accuracy;
  const crit = natural10 || (hit && roll >= critThreshold);
  let damage = 0;
  if (hit) {
    const min = skill.minDamage ?? 0;
    const max = skill.maxDamage ?? 0;
    damage = crit ? max : randInt(min, max);
  }
  return { roll, hit, crit, damage };
}

/**
 * 简化 d10 命中判定：
 * - 掷 1..10，结果 <= accuracy 视为命中；
 * - 自然 10 必中且为暴击（暴击统一造成最大伤害）；
 * - Phase 8C：critBonus 降低暴击阈值（crit 判定为 roll >= 10 - critBonus 且命中）。
 * 未命中 damage = 0。
 */
export function resolveAttack(
  skill: BattleSkillLike,
  accuracyBonus = 0,
  critBonus = 0
): AttackResult {
  return resolveAttackFromRoll(skill, d10(), accuracyBonus, critBonus);
}

/** 对目标施加伤害（不低于 0），死亡则标记 isAlive=false。 */
export function applyDamage(unit: BattleUnit, damage: number): BattleUnit {
  const hp = Math.max(0, unit.hp - damage);
  return { ...unit, hp, isAlive: hp > 0 ? unit.isAlive : false };
}
