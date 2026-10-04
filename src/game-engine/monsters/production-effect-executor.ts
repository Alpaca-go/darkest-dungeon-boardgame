import type { CompactMonsterAction } from '../../data/monsters/production-monster-definition-types';
import type { MonsterRuntimeOperation, ProductionMonsterExecutionAdapter } from './production-runtime-types';

/** Keep the accepted self-before-attack contract; PRINTED_EFFECT self-wounds retain their effect slot.
 * AFTER_ACTION self-wounds are queued once outside the target loop, even when attacks miss.
 */
export function buildProductionMonsterOperations(actorId: string, action: CompactMonsterAction,
  targetIds: readonly string[], attackRoll?: number): MonsterRuntimeOperation[] {
  const operations: MonsterRuntimeOperation[] = [];
  const afterAction: MonsterRuntimeOperation[] = [];
  const seen = new Set<number>();
  const emit = (index: number, targetId: string, before = false) => {
    const effect = action.effects[index];
    if (effect.kind === 'DEFERRED') throw new Error('Deferred effect reached executable planner');
    const p = effect.parameters;
    const once = p.target === 'self' || p.target === 'party';
    // Party effects stay at each target's slot until the first successful application;
    // a missed first target must not swallow a later successful party effect.
    if (p.target === 'self' && seen.has(index)) return;
    if (p.target === 'self') seen.add(index);
    const timing = effect.primitiveId === 'self-wound-sequencing'
      ? p.timing === 'AFTER_ACTION' ? 'AFTER_ACTION' : 'PRINTED_EFFECT'
      : before ? 'BEFORE_ATTACK' : action.attack.kind === 'ROLL' ? 'ON_HIT' : 'PRINTED_EFFECT';
    const operation: MonsterRuntimeOperation = { kind: 'EFFECT', actorId,
      targetId: p.target === 'self' ? actorId : targetId, relativeToId: p.target === 'self' ? targetId : actorId,
      primitiveId: effect.primitiveId, parameters: p, effectIndex: index, oncePerAction: once, timing,
      hitTargetId: timing === 'ON_HIT' ? targetId : null };
    (timing === 'AFTER_ACTION' ? afterAction : operations).push(operation);
  };
  if (action.attack.kind === 'ROLL') {
    if (!Number.isInteger(attackRoll) || attackRoll! < 1 || attackRoll! > 10) throw new Error('ATTACK_D10_REQUIRED');
    action.effects.forEach((e, i) => {
      if (e.kind !== 'DEFERRED' && e.parameters.target === 'self' && e.primitiveId !== 'self-wound-sequencing')
        emit(i, targetIds[0], true);
    });
  }
  for (const targetId of targetIds) {
    if (action.attack.kind === 'ROLL') operations.push({ kind: 'ATTACK', actorId, targetId, roll: attackRoll!,
      attack: action.attack, markedDamageBonus: action.effects.reduce((sum, e) => sum + (e.kind !== 'DEFERRED'
        && e.primitiveId === 'markedDamageBonus' ? Number(e.parameters.amount) : 0), 0) });
    // Keep marked-bonus evidence at its normalized slot; ATTACK already consumes its numeric modifier.
    action.effects.forEach((_, i) => emit(i, targetId));
  }
  return [...operations, ...afterAction];
}

export function dispatchProductionMonsterOperations(adapter: ProductionMonsterExecutionAdapter,
  operations: readonly MonsterRuntimeOperation[]): void {
  adapter.preflight(operations);
  const hits = new Map<string, boolean>();
  const appliedActionEffects = new Set<number>();
  for (const operation of operations) {
    if (operation.kind === 'ATTACK') hits.set(operation.targetId, adapter.attack(operation).hit);
    else if (operation.hitTargetId === null || hits.get(operation.hitTargetId) === true) {
      if (operation.oncePerAction && appliedActionEffects.has(operation.effectIndex)) continue;
      // Match the accepted staged pipeline: on-hit effects require a surviving target.
      if (operation.hitTargetId !== null && !adapter.units().some(u => u.id === operation.targetId && u.isAlive)) continue;
      adapter.effect(operation);
      if (operation.oncePerAction) appliedActionEffects.add(operation.effectIndex);
    }
  }
}
