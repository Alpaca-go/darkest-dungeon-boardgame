import type { BattleSkillLike, BattleUnit } from '../types';
import { d10, randInt } from './random';

export interface AttackResult {
  roll: number;
  hit: boolean;
  crit: boolean;
  damage: number;
}

/**
 * 简化 d10 命中判定：
 * - 掷 1..10，结果 <= accuracy 视为命中；
 * - 自然 10 必中且为暴击（暴击统一造成最大伤害）。
 * 未命中 damage = 0。
 */
export function resolveAttack(skill: BattleSkillLike): AttackResult {
  const roll = d10();
  const accuracy = skill.accuracy ?? 7;
  const crit = roll === 10;
  const hit = crit || roll <= accuracy;
  let damage = 0;
  if (hit) {
    const min = skill.minDamage ?? 0;
    const max = skill.maxDamage ?? 0;
    damage = crit ? max : randInt(min, max);
  }
  return { roll, hit, crit, damage };
}

/** 对目标施加伤害（不低于 0），死亡则标记 isAlive=false。 */
export function applyDamage(unit: BattleUnit, damage: number): BattleUnit {
  const hp = Math.max(0, unit.hp - damage);
  return { ...unit, hp, isAlive: hp > 0 ? unit.isAlive : false };
}
