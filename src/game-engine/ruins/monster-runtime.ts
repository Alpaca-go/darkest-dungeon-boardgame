import type { BattleState, BattleUnit } from '../../types';
import type { RuinsMonster, RuinsSkill, RuinsStance, RuinsTile } from '../../types/ruins-executable';
import { RUINS_STANCES } from '../../types/ruins-executable';
import { resolveRuinsStance } from './source-registry';

/** Selection is sourced exclusively from the locked typed Stance table. */
export function resolveRuinsMonsterSkill(definition: RuinsMonster, stance: RuinsStance, d10: number): RuinsSkill | null {
  if (!Number.isInteger(d10) || d10 < 1 || d10 > 10) throw new Error('Saved Monster d10 must be 1–10');
  const behavior = resolveRuinsStance(definition, stance);
  if (behavior.kind === 'NO_ACTION') return null;
  const rows = behavior.rows.filter(row => row.min <= d10 && d10 <= row.max);
  if (rows.length !== 1) throw new Error('Printed Stance d10 table is not exhaustive');
  const skill = definition.skills.find(candidate => candidate.number === rows[0].skill);
  if (!skill) throw new Error('Printed Skill not bound');
  return skill;
}

export function ruinsAreaDistance(tile: RuinsTile, from: string, to: string): number {
  const known = new Set(tile.areas.map(area => area.id));
  if (!known.has(from) || !known.has(to)) throw new Error('Unknown printed Area');
  const queue: Array<[string, number]> = [[from, 0]];
  const visited = new Set<string>();
  while (queue.length) {
    const [area, distance] = queue.shift()!;
    if (area === to) return distance;
    if (visited.has(area)) continue;
    visited.add(area);
    for (const next of tile.areas.find(candidate => candidate.id === area)!.adjacent) queue.push([next, distance + 1]);
  }
  return Infinity;
}

export interface RuinsTargetContext {
  battle: BattleState;
  tile: RuinsTile;
  placements: Record<string, string>;
  /** Printed Guard stacks. Mandatory so callers cannot silently bypass Guard priority. */
  guardStacks: Record<string, number>;
}

/** p24 target priority and Aggressive-to-Support tie order; no array-order fallback. */
export function selectRuinsMonsterTargets(context: RuinsTargetContext, actorId: string, skill: RuinsSkill): string[] {
  const { battle, tile, placements, guardStacks } = context;
  const actor = battle.monsters.find(unit => unit.id === actorId && unit.isAlive);
  if (!actor || !placements[actorId]) throw new Error('Unbound ordinary Monster actor');
  if (skill.targetSide === 'self') return [actorId];
  const population = (skill.targetSide === 'hero' ? battle.heroes : battle.monsters)
    .filter(unit => unit.isAlive && unit.id !== actorId);
  let units = population;
  if (units.some(unit => !placements[unit.id] || !tile.areas.some(area => area.id === placements[unit.id]))) {
    throw new Error('Target placement is not bound to the printed Tile');
  }
  const guarded = skill.targetSide === 'hero' ? units.filter(unit => guardStacks[unit.id] > 0) : [];
  if (guarded.length) units = guarded;
  if (skill.targeting.markedFirst && units.some(unit => unit.marked)) units = units.filter(unit => unit.marked);
  if (!units.length) return [];
  const score = (unit: BattleUnit): number => {
    const distance = ruinsAreaDistance(tile, placements[actorId], placements[unit.id]);
    switch (skill.targeting.priority) {
      case 'Closest': return -distance;
      case 'Furthest': return distance;
      case 'Most Wounded': return unit.maxHp - unit.hp;
      case 'Most Stressed': return unit.stress;
      case 'Crowded': return population.filter(other => placements[other.id] === placements[unit.id]).length;
      case 'Self': return unit.id === actorId ? 1 : 0;
    }
  };
  const sorted = units.sort((a, b) => score(b) - score(a)
    || RUINS_STANCES.indexOf(a.stance) - RUINS_STANCES.indexOf(b.stance)
    || a.id.localeCompare(b.id));
  const first = sorted[0];
  return sorted.filter(unit => placements[unit.id] === placements[first.id]).slice(0, skill.targets).map(unit => unit.id);
}

/** Legal destination candidates are returned for a saved player choice when tied. */
export function ruinsMonsterMovementCandidates(context: RuinsTargetContext, actorId: string,
  targetId: string, skill: RuinsSkill, occupiedSpaces: Record<string, number>, speed: number): string[] {
  if (skill.range.kind === 'SELF') return [context.placements[actorId]];
  const { tile, placements, battle } = context;
  const from = placements[actorId], target = placements[targetId];
  if (!from || !target || !Number.isInteger(speed) || speed < 0) throw new Error('Unbound Monster movement');
  const desired = skill.range.distance;
  if (ruinsAreaDistance(tile, from, target) === desired) return [from];
  const occupancy = (areaId: string) => [...battle.heroes, ...battle.monsters]
    .filter(unit => unit.isAlive && unit.id !== actorId && placements[unit.id] === areaId)
    .reduce((total, unit) => total + (occupiedSpaces[unit.id] ?? 1), 0);
  const spaces = occupiedSpaces[actorId];
  if (spaces !== 1 && spaces !== 2) throw new Error('Unbound printed Monster size');
  return tile.areas.filter(area => ruinsAreaDistance(tile, from, area.id) <= speed
    && ruinsAreaDistance(tile, area.id, target) === desired
    && area.capacity - occupancy(area.id) >= spaces)
    .map(area => area.id).sort();
}
