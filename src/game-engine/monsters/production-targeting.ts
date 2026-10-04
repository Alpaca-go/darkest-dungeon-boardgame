import type { CompactMonsterAction } from '../../data/monsters/production-monster-definition-types';
import { compareMonsterTargetPriority } from '../monster-target-priority';
import type { ProductionMonsterEnvironment, ProductionRuntimeUnit } from './production-runtime-types';
import { selectAllLivingHeroes } from './production-runtime-primitives';

/** C3B-cited area priority followed by the accepted Ruins stance/id tie contract. */
export function selectProductionMonsterTargets(env: ProductionMonsterEnvironment, actorId: string, action: CompactMonsterAction): string[] {
  if (action.targeting.targetSide === 'self') return [actorId];
  if (action.targets === 'ALL_HEROES') return selectAllLivingHeroes(env.units());
  const population = [...new Map(env.units().filter(u => u.isAlive && u.id !== actorId
    && u.side === action.targeting.targetSide).map(u => [u.id, u])).values()];
  let candidates = population;
  const guarded = action.targeting.targetSide === 'hero' ? candidates.filter(u => u.guardStacks > 0) : [];
  if (guarded.length) candidates = guarded;
  if (action.targeting.markedFirst && candidates.some(u => u.marked)) candidates = candidates.filter(u => u.marked);
  const score = (u: ProductionRuntimeUnit) => {
    switch (action.targeting.priority) {
      case 'Closest': case 'Closest Monster': return -env.distance(actorId, u.id);
      case 'Furthest': return env.distance(actorId, u.id);
      case 'Most Wounded': case 'Most Wounded Monster': return u.maxHp - u.hp;
      case 'Most Stressed': return u.stress;
      case 'Crowded': return population.filter(other => other.areaId === u.areaId).length;
      default: throw new Error('Unsupported target priority: ' + action.targeting.priority);
    }
  };
  const sorted = [...candidates].sort((a, b) => score(b) - score(a) || compareMonsterTargetPriority(a, b));
  const first = sorted[0];
  return first ? sorted.filter(u => u.areaId === first.areaId).slice(0, action.targets ?? 1).map(u => u.id) : [];
}
