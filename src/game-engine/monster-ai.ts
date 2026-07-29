import type { BattleState, BattleUnit, MonsterTargetRule } from '../types';
import { getMonsterSkillById } from '../data/monster-skills';
import { isSkillUsableFrom, isLegalTarget } from './targeting';
import { pick } from './random';

export interface MonsterAction {
  skillId: string;
  targetId: string;
}

/** 按目标规则从存活英雄中选择一个目标。 */
export function selectTargetByRule(
  heroes: BattleUnit[],
  rule: MonsterTargetRule
): BattleUnit | undefined {
  const alive = heroes.filter((h) => h.isAlive);
  if (alive.length === 0) return undefined;
  switch (rule) {
    case 'closest':
      return alive.reduce((a, b) => (b.position < a.position ? b : a));
    case 'furthest':
      return alive.reduce((a, b) => (b.position > a.position ? b : a));
    case 'mostWounded':
      return alive.reduce((a, b) => (b.hp < a.hp ? b : a));
    case 'mostStressed':
      return alive.reduce((a, b) => (b.stress > a.stress ? b : a));
    case 'random':
    default:
      return pick(alive);
  }
}

/**
 * 怪物自动行动决策：
 * 1) 读取可用技能（从当前站位可释放）；
 * 2) 选取一个能找到合法目标的技能；
 * 3) 按 targetRule 选择目标。
 * 无可用技能返回 null（由调用方尝试移动或跳过）。
 */
export function chooseMonsterAction(state: BattleState, monster: BattleUnit): MonsterAction | null {
  const skillIds = monster.monsterSkillIds ?? [];
  const skills = skillIds
    .map((id) => getMonsterSkillById(id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const usable = skills.filter((s) => isSkillUsableFrom(monster, s));

  for (const skill of usable) {
    const side = skill.targetSide;
    let targetId: string | undefined;
    if (side === 'self' || side === 'ally') {
      targetId = monster.id; // 怪物技能均为 self/ally 时以自身为目标
    } else {
      const target = selectTargetByRule(state.heroes, monster.targetRule ?? 'random');
      targetId = target?.id;
    }
    if (!targetId) continue;
    const target = side === 'self' || side === 'ally'
      ? monster
      : state.heroes.find((h) => h.id === targetId);
    if (target && isLegalTarget(monster, target, skill)) {
      return { skillId: skill.id, targetId };
    }
  }
  return null;
}
