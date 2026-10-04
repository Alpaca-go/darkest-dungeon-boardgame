import { getProductionMonsterDefinition } from '../../data/monsters/production-monster-definition-registry';
import type { ProductionMonsterDefinition } from '../../data/monsters/production-monster-definition-types';
import { resolveProductionMonsterAction } from './production-action-selection';
import { getProductionMonsterActionRuntimeStatus } from './production-runtime-primitives';
import { selectProductionMonsterTargets } from './production-targeting';
import { buildProductionMonsterOperations, dispatchProductionMonsterOperations } from './production-effect-executor';
import { PRODUCTION_MONSTER_RUNTIME_VERSION } from './production-runtime-types';
import type { ProductionMonsterEnvironment, ProductionMonsterExecutionAdapter,
  ProductionMonsterRuntimeRequest, ProductionMonsterRuntimeResult } from './production-runtime-types';

/** Explicit action entry is useful for coverage and saved selection; no eligibility decisions. */
export function planProductionMonsterAction(env: ProductionMonsterEnvironment, actorId: string,
  definition: ProductionMonsterDefinition, actionId: string, attackRoll?: number): ProductionMonsterRuntimeResult {
  const action = definition.actions.find(a => a.actionId === actionId);
  if (!action) return { status: 'UNKNOWN', actionId, reason: 'ACTION_UNBOUND' };
  const disposition = getProductionMonsterActionRuntimeStatus(action);
  if (disposition.status !== 'RUNTIME_READY') return disposition;
  if (!env.units().some(u => u.id === actorId && u.side === 'monster' && u.isAlive))
    return { status: 'NO_ACTION', reason: 'ACTOR_UNAVAILABLE' };
  const targetIds = selectProductionMonsterTargets(env, actorId, action);
  if (!targetIds.length) return { status: 'NO_ACTION', reason: 'NO_LIVING_TARGET' };
  const requiredRange = action.range?.kind === 'EXACT' ? action.range.distance : null;
  if (requiredRange !== null && targetIds.some(id => env.distance(actorId, id) !== requiredRange))
    return { status: 'OUT_OF_RANGE', actionId, requiredRange, targetIds };
  if (action.attack.kind === 'ROLL' && (!Number.isInteger(attackRoll) || attackRoll! < 1 || attackRoll! > 10))
    return { status: 'UNKNOWN', actionId, reason: 'ATTACK_D10_REQUIRED' };
  return { status: 'READY', definitionId: definition.definitionId, actionId, targetIds,
    runtimeVersion: PRODUCTION_MONSTER_RUNTIME_VERSION,
    operations: buildProductionMonsterOperations(actorId, action, targetIds, attackRoll) };
}

export function prepareProductionMonsterAction(env: ProductionMonsterEnvironment,
  request: ProductionMonsterRuntimeRequest): ProductionMonsterRuntimeResult {
  const definition = getProductionMonsterDefinition(request.definitionId);
  if (!definition) return { status: 'UNKNOWN', actionId: null, reason: 'DEFINITION_UNBOUND' };
  const selected = resolveProductionMonsterAction(definition, request.stance, request.skillRoll);
  return selected.status === 'SELECTED' ? planProductionMonsterAction(env, request.actorUnitId,
    definition, selected.action.actionId, request.attackRoll) : selected;
}

export function executeProductionMonsterAction(adapter: ProductionMonsterExecutionAdapter,
  request: ProductionMonsterRuntimeRequest): ProductionMonsterRuntimeResult {
  const result = prepareProductionMonsterAction(adapter, request);
  if (result.status !== 'READY') return result;
  dispatchProductionMonsterOperations(adapter, result.operations);
  return { ...result, status: 'EXECUTED' };
}
