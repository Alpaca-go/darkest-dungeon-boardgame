import type { ProductionMonsterDefinition } from '../../data/monsters/production-monster-definition-types';

export function resolveProductionMonsterAction(definition: ProductionMonsterDefinition, stance: string, skillRoll?: number) {
  const visited = new Set<string>();
  while (true) {
    if (visited.has(stance)) return { status: 'UNKNOWN' as const, actionId: null, reason: 'STANCE_INHERITANCE_CYCLE' };
    visited.add(stance);
    const selection = definition.selection[stance];
    if (!selection || selection.kind === 'SOURCE_UNRESOLVED') return {
      status: 'DEFERRED_SEMANTIC' as const, actionId: null, deferredIds: [],
      reason: selection?.kind === 'SOURCE_UNRESOLVED' ? selection.reason : 'STANCE_UNBOUND',
    };
    if (selection.kind === 'NO_ACTION') return { status: 'NO_ACTION' as const, reason: 'PRINTED_NO_ACTION' };
    if (selection.kind === 'INHERITS') { stance = selection.stance; continue; }
    if (!Number.isInteger(skillRoll) || skillRoll! < 1 || skillRoll! > 10)
      return { status: 'UNKNOWN' as const, actionId: null, reason: 'SKILL_D10_REQUIRED' };
    const rows = selection.rows.filter(row => row.min <= skillRoll! && skillRoll! <= row.max);
    const action = rows.length === 1 ? definition.actions.find(a => a.actionId === rows[0].actionId) : undefined;
    return action ? { status: 'SELECTED' as const, action }
      : { status: 'UNKNOWN' as const, actionId: null, reason: 'INVALID_SKILL_TABLE' };
  }
}
