import type { BattleSkillLike, BattleState, BattleUnit } from '../types';

/** 技能是否可从该单位的当前站位释放。 */
export function isSkillUsableFrom(unit: BattleUnit, skill: BattleSkillLike): boolean {
  const from = skill.usableFromPositions ?? [];
  return from.includes(unit.position);
}

/** 目标对该技能是否合法（阵营 + 站位 + 存活）。 */
export function isLegalTarget(actor: BattleUnit, target: BattleUnit, skill: BattleSkillLike): boolean {
  if (!target.isAlive) return false;
  const fallback = 'kind' in skill && skill.kind === 'attack' ? 'enemy' : 'self';
  const side = skill.targetSide ?? fallback;
  if (side === 'self') return target.id === actor.id;
  if (side === 'ally') return target.side === actor.side && target.id !== actor.id;
  // enemy
  return target.side !== actor.side && (skill.validTargetPositions ?? []).includes(target.position);
}

/** 计算当前行动者可合法选中的目标 id 列表。 */
export function computeLegalTargetIds(
  state: BattleState,
  actor: BattleUnit,
  skill: BattleSkillLike
): string[] {
  return allUnits(state)
    .filter((u) => isLegalTarget(actor, u, skill))
    .map((u) => u.id);
}

/** 合并英雄与怪物单位（用于遍历）。 */
export function allUnits(state: BattleState): BattleUnit[] {
  return [...state.heroes, ...state.monsters];
}
