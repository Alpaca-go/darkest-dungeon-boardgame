import type { CompactMonsterAction } from '../../data/monsters/production-monster-definition-types';
import type { ProductionRuntimeUnit } from './production-runtime-types';
import { compareMonsterTargetPriority } from '../monster-target-priority';

export const NEW_MONSTER_RUNTIME_PRIMITIVES = ['self-wound-sequencing', 'all-heroes-targeting', 'timed-protection'] as const;
export const REUSED_MONSTER_RUNTIME_PRIMITIVES = ['targeting', 'area-distance', 'attack-roll', 'damage',
  'condition', 'condition-duration', 'spatial-displacement', 'stance-shuffle', 'stress',
  'marked-damage-bonus', 'heal', 'disease-draw', 'disease-infection', 'guard', 'light', 'riposte', 'remove-condition'] as const;
export const MONSTER_EFFECT_DISPATCH = {
  shuffle: ['spatial-displacement', 'stance-shuffle'], stress: ['stress'],
  markedDamageBonus: ['marked-damage-bonus'], condition: ['condition', 'condition-duration'],
  heal: ['heal'], light: ['light'], disease: ['disease-draw', 'disease-infection'],
  guard: ['guard'], riposte: ['riposte'], removeCondition: ['remove-condition'],
  'self-wound-sequencing': ['self-wound-sequencing', 'damage'], 'timed-protection': ['timed-protection'],
} as const;

/** The only authorization guard. A deferred requirement/effect blocks the entire action. */
export function getProductionMonsterActionRuntimeStatus(action: CompactMonsterAction) {
  const requirements = [...action.requirements, ...action.effects.map(e => e.capability)];
  const deferredIds = [...new Set(requirements.flatMap(r => r.deferredIds)
    .concat(action.effects.flatMap(e => e.kind === 'DEFERRED' ? [...e.deferredIds] : [])))].sort();
  if (action.capability === 'DEFERRED_SEMANTIC' || action.requirements.some(r => r.status === 'DEFERRED_SEMANTIC')
    || action.effects.some(e => e.kind === 'DEFERRED' || e.capability.status === 'DEFERRED_SEMANTIC'))
    return { status: 'DEFERRED_SEMANTIC' as const, actionId: action.actionId, deferredIds, reason: 'ACTION_SEMANTICS_DEFERRED' };
  const supported = new Set<string>([...NEW_MONSTER_RUNTIME_PRIMITIVES, ...REUSED_MONSTER_RUNTIME_PRIMITIVES]);
  const statuses = ['SUPPORTED_EXISTING_PRIMITIVE', 'SUPPORTED_EXISTING_COMPOSITION', 'NEEDS_NEW_RUNTIME_PRIMITIVE', 'NO_RUNTIME_EFFECT'];
  const unknown = requirements.flatMap(r => r.primitiveIds).filter(id => !supported.has(id));
  const priorities = ['Closest', 'Furthest', 'Most Wounded', 'Most Stressed', 'Crowded', 'Closest Monster',
    'Most Wounded Monster', 'Self', 'All Heroes'];
  if (!statuses.includes(action.capability) || requirements.some(r => !statuses.includes(r.status))
    || !priorities.includes(action.targeting.priority) || !['hero', 'monster', 'self'].includes(action.targeting.targetSide)
    || unknown.length || action.effects.some(e => e.kind !== 'DEFERRED' && !Object.prototype.hasOwnProperty.call(MONSTER_EFFECT_DISPATCH, e.primitiveId)))
    return { status: 'UNKNOWN' as const, actionId: action.actionId, reason: 'UNSUPPORTED_RUNTIME_REQUIREMENT:' + unknown.join(',') };
  return { status: 'RUNTIME_READY' as const, actionId: action.actionId };
}

/** Global Hero selection deliberately ignores areas. */
export function selectAllLivingHeroes(units: readonly ProductionRuntimeUnit[]): string[] {
  return [...new Map(units.filter(u => u.side === 'hero' && u.isAlive).map(u => [u.id, u])).values()]
    .sort(compareMonsterTargetPriority).map(u => u.id);
}

export interface TimedProtection { sourceId: string; unitId: string; remainingTurns: number }
/** Separate duration tokens: repeated grants remain independent and never rewrite a printed profile. */
export function grantTimedProtection(tokens: readonly TimedProtection[], sourceId: string, unitId: string, turns: number): TimedProtection[] {
  if (!Number.isInteger(turns) || turns <= 0) throw new Error('Invalid Protection duration');
  return [...tokens, { sourceId, unitId, remainingTurns: turns }];
}
/** The owning adapter calls this at the same unit condition-duration boundary used by existing tokens. */
export function expireTimedProtection(tokens: readonly TimedProtection[], unitId: string): TimedProtection[] {
  return tokens.map(t => t.unitId === unitId ? { ...t, remainingTurns: t.remainingTurns - 1 } : t)
    .filter(t => t.remainingTurns > 0);
}
export function hasRuntimeProtection(baseProtection: boolean | null, tokens: readonly TimedProtection[], unitId: string): boolean {
  return baseProtection === true || tokens.some(t => t.unitId === unitId && t.remainingTurns > 0);
}
