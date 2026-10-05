import type { ActiveEffect, BattleState, BattleUnit, MonsterSkillDefinition, PendingMonsterAttack } from '../../types';
import { getProductionMonsterDefinition } from '../../data/monsters/production-monster-definition-registry';
import { resolveProductionMonsterAction } from './production-action-selection';
import { planProductionMonsterAction } from './production-runtime';
import { buildProductionMonsterOperations } from './production-effect-executor';
import { expireTimedProtection, grantTimedProtection, hasRuntimeProtection, MONSTER_EFFECT_DISPATCH } from './production-runtime-primitives';
import { PRODUCTION_MONSTER_RUNTIME_VERSION, type MonsterRuntimeOperation, type ProductionMonsterEnvironment } from './production-runtime-types';
import { PRODUCTION_MONSTER_INTEGRATION_VERSION, type ProductionMonsterChoice } from './production-battle-types';
import { SeededRandom, getRuntimeSources, withRuntimeSources } from '../runtime-sources';
import { d10, random } from '../random';
import { applyBattleUnitDamage } from '../damage';
import { applyBattleUnitHealing } from '../healing';
import { applyEffectsWithResistance, applyEffects, synchronizePrintedConditionTokens } from '../status-effects';
import { clampStressValue } from '../stress-constants';
import { drawDisease } from '../diseases/draw-disease';
import { shuffleAtomicStanceBlocks } from '../ruins/stance-shuffle';
import { shuffleStance, ruinsDisplacementCandidates, withRuinsBattleSources } from '../ruins/printed-effect-runtime';
import { beginLargeMovement, resolveLargeDisplacement, validateLargeMovementContract } from '../rules/large-movement-contract';
import { moveNormalCharacter, moveRuinsUnit, canMoveRuinsUnit } from '../ruins/movement-runtime';
import { ruinsAreaDistance, ruinsMonsterTurnMovementCandidates } from '../ruins/monster-runtime';
import { ruinsTile } from '../ruins/source-registry';
import { runRuinsRoomTrigger } from '../ruins/room-runtime';
import { RUINS_STANCES, type RuinsSkill } from '../../types/ruins-executable';
import { resolvePrintedAttackFromRoll } from '../combat-resolution';
import { synchronizeRuinsConditions } from '../ruins/condition-runtime';

const units = (b: BattleState) => [...b.heroes, ...b.monsters];
const find = (b: BattleState, id: string) => {
  const u = units(b).find(u => u.id === id); if (!u) throw new Error('Production unit unbound: ' + id); return u;
};
const replace = (b: BattleState, u: BattleUnit): BattleState => ({ ...b,
  heroes: b.heroes.map(v => v.id === u.id ? u : v), monsters: b.monsters.map(v => v.id === u.id ? u : v) });
export function recordProductionMonsterEvent(b: BattleState, type: string, detail: Record<string, unknown> = {}, parentEventId: string | null = null): string {
  const c = b.productionMonsterContext!; const eventId = `${b.battleId}:monster:${c.events.length + 1}`;
  c.events.push({ eventId, type, detail, parentEventId }); return eventId;
}

let scope: { battleId: string; random: SeededRandom; calls: number } | null = null;
/** Nested scopes share the same accepted seeded source; the final cursor is persisted on the returned state. */
export function withProductionMonsterSources(b: BattleState, work: (b: BattleState) => BattleState): BattleState {
  if (!b.productionMonsterContext) return work(b);
  if (b.ruinsContext) {
    const next = withRuinsBattleSources(b, work);
    next.productionMonsterContext!.rngCursor = next.ruinsContext!.rngCursor;
    next.productionMonsterContext!.rngCalls = next.ruinsContext!.rngCalls;
    return syncPlacements(next);
  }
  const previous = scope;
  const active = previous?.battleId === b.battleId ? previous : { battleId: b.battleId, random: new SeededRandom(1), calls: b.productionMonsterContext.rngCalls };
  if (active !== previous) active.random.restore(b.productionMonsterContext.rngCursor);
  scope = active;
  try {
    const next = withRuntimeSources({ ...getRuntimeSources(), random: { next: () => { active.calls++; return active.random.next(); } } }, () => work(b));
    if (next.productionMonsterContext) { next.productionMonsterContext.rngCursor = active.random.snapshot(); next.productionMonsterContext.rngCalls = active.calls; }
    return syncPlacements(next);
  } finally { scope = previous; }
}

function placements(b: BattleState) { return b.largeMovementContract?.placements ?? b.productionMonsterContext!.placements; }
export function productionAreaDistance(b: BattleState, from: string, to: string): number {
  if (b.ruinsContext) return ruinsAreaDistance(ruinsTile(b.ruinsContext.tileId), from, to);
  const areas = b.largeMovementContract!.areas;
  if (!areas.some(a => a.id === from) || !areas.some(a => a.id === to)) throw new Error('Unknown production Area');
  const queue: Array<[string, number]> = [[from, 0]], seen = new Set<string>();
  while (queue.length) { const [id, n] = queue.shift()!; if (id === to) return n;
    if (seen.has(id)) continue; seen.add(id);
    areas.find(a => a.id === id)!.adjacent.forEach(a => queue.push([a, n + 1])); }
  return Infinity;
}
export function productionGuardStacks(b: BattleState, id: string): number {
  // Ruins retains its accepted condition authority; explicit manifests use the existing printed unit tokens.
  return Math.max(b.ruinsContext?.guardStacks[id] ?? 0,
    ...(find(b, id).printedConditionTokens ?? []).filter(t => t.type === 'guard').map(t => t.turns));
}
export function createProductionMonsterEnvironment(b: BattleState): ProductionMonsterEnvironment {
  return { units: () => units(b).map(u => ({ ...u, areaId: placements(b)[u.id], guardStacks: productionGuardStacks(b, u.id) })),
    distance: (a, z) => productionAreaDistance(b, placements(b)[a], placements(b)[z]) };
}
function syncPlacements(b: BattleState): BattleState {
  b.productionMonsterContext!.placements = { ...b.largeMovementContract!.placements };
  if (b.ruinsContext) b.ruinsContext.placements = { ...b.largeMovementContract!.placements };
  return b;
}
function canMove(b: BattleState, actor: string, target: string, area: string): boolean {
  if (placements(b)[actor] === area) return true;
  if (b.ruinsContext) return canMoveRuinsUnit(b, actor, target, area);
  try { const moved = b.productionMonsterContext!.occupiedSpaces[actor] === 2
    ? beginLargeMovement(b, actor, target, area) : moveNormalCharacter(b, actor, area);
    return placements(moved)[actor] === area || !!moved.largeMovementContract?.pendingChoice;
  } catch { return false; }
}
function choice(b: BattleState, kind: ProductionMonsterChoice['kind'], actorId: string, relativeToId: string,
  candidateIds: string[], resumePhase: ProductionMonsterChoice['resumePhase']): BattleState {
  const c = b.productionMonsterContext!, parentEventId = c.pendingExecution!.parentEventId;
  const choiceId = recordProductionMonsterEvent(b, kind === 'MOVEMENT' ? 'MONSTER_MOVEMENT_CHOICE_CREATED' : 'MONSTER_DISPLACEMENT_CHOICE_CREATED', { actorId, candidateIds }, parentEventId);
  c.pendingChoice = { choiceId, integrationVersion: c.integrationVersion, parentEventId, kind, actorId, relativeToId, candidateIds: [...candidateIds], resumePhase };
  return b;
}
function move(b: BattleState, actor: string, target: string, area: string, resumePhase: 'MOVEMENT' | 'OPERATIONS'): BattleState {
  if (placements(b)[actor] === area) return b;
  let next = b.ruinsContext ? moveRuinsUnit(b, actor, target, area)
    : b.productionMonsterContext!.occupiedSpaces[actor] === 2 ? beginLargeMovement(b, actor, target, area) : moveNormalCharacter(b, actor, area);
  if (next.largeMovementContract?.pendingChoice) return choice(next, 'LARGE_DISPLACEMENT', actor, target, next.largeMovementContract.pendingChoice.candidateIds, resumePhase);
  next = syncPlacements(next);
  recordProductionMonsterEvent(next, 'MONSTER_MOVED', { actorId: actor, areaId: area }, next.productionMonsterContext!.pendingExecution!.parentEventId);
  if (next.ruinsContext && resumePhase === 'OPERATIONS') next = runRuinsRoomTrigger(runRuinsRoomTrigger(next, 'SHUFFLED_INTO', actor), 'PASSIVE', actor);
  return next;
}
export function productionMonsterMovementCandidates(b: BattleState, actor: string, targets: readonly string[], range: number): string[] {
  const c = b.productionMonsterContext!, u = find(b, actor), target = targets[0];
  if (u.productionMonsterProfile?.printedSpeed === null) throw new Error('SOURCE_UNRESOLVED: printed movement Speed absent');
  if (!target) return [];
  if (b.ruinsContext) {
    const a = getProductionMonsterDefinition(c.definitionIds[actor])!.actions.find(a => a.actionId === c.pendingExecution!.actionId)!;
    const skill = { range: { kind: 'EXACT', distance: range }, targets: a.targets, targetSide: a.targeting.targetSide,
      targeting: a.targeting, effects: [] } as unknown as RuinsSkill;
    return ruinsMonsterTurnMovementCandidates({ battle: b, tile: ruinsTile(b.ruinsContext.tileId), placements: placements(b), guardStacks: b.ruinsContext.guardStacks }, actor, target, skill, c.occupiedSpaces, u.speed);
  }
  const from = placements(b)[actor];
  const gap = (area: string) => Math.max(...targets.map(t => Math.abs(productionAreaDistance(b, area, placements(b)[t]) - range)));
  const destinations = b.largeMovementContract!.areas.filter(a => productionAreaDistance(b, from, a.id) <= u.speed && canMove(b, actor, target, a.id));
  const best = Math.min(gap(from), ...destinations.map(a => gap(a.id)));
  return destinations.filter(a => gap(a.id) === best).map(a => a.id).sort();
}
function afterMovement(b: BattleState): BattleState {
  const c = b.productionMonsterContext!, p = c.pendingExecution!, a = getProductionMonsterDefinition(p.definitionId)!.actions.find(a => a.actionId === p.actionId)!;
  const env = createProductionMonsterEnvironment(b);
  if (a.range?.kind === 'EXACT' && p.targetIds.some(id => env.distance(p.actorUnitId, id) !== (a.range as { distance: number }).distance))
    return completeProductionMonsterAction(b, 'OUT_OF_RANGE');
  p.operations = buildProductionMonsterOperations(p.actorUnitId, a, p.targetIds, p.attackRoll);
  p.phase = 'OPERATIONS'; freezeDiseaseDraws(b); return continueProductionMonsterExecution(b);
}
function freezeDiseaseDraws(b: BattleState) {
  const p = b.productionMonsterContext!.pendingExecution!;
  // Validate all live dependencies before any action-level effect or decision window.
  for (const op of p.operations) {
    find(b, op.actorId); const target = find(b, op.targetId);
    if (op.kind === 'ATTACK' && target.side === 'hero' && target.heroDodgeBinding?.value === undefined && target.bossCombatDodge === undefined)
      throw new Error('SOURCE_UNRESOLVED: production Hero Dodge binding absent');
    if (op.kind === 'EFFECT' && !(op.primitiveId in MONSTER_EFFECT_DISPATCH)) throw new Error('Production effect binding absent');
  }
  p.operations.forEach((op, index) => { if (op.kind === 'EFFECT' && op.primitiveId === 'disease' && !p.diseaseDraws[index]) p.diseaseDraws[index] = drawDisease(random); });
}
/** Explicit action is for authoritative selected actions and integration sweeps; ordinary turns resolve the immutable stance table. */
export function beginProductionMonsterTurn(state: BattleState, actorId: string, facts?: { skillRoll?: number; attackRoll?: number; actionId?: string }): BattleState {
  const original = state.productionMonsterContext;
  if (!original || original.pendingExecution || original.pendingChoice || original.blocker || state.pendingMonsterAttack || state.pendingAction || state.activeActorId !== actorId) return state;
  return withProductionMonsterSources(structuredClone(state), b => {
    const c = b.productionMonsterContext!, actor = find(b, actorId), d = getProductionMonsterDefinition(c.definitionIds[actorId]);
    if (!d || actor.side !== 'monster' || !actor.isAlive) return b;
    const skillRoll = facts?.skillRoll ?? d10(), attackRoll = facts?.attackRoll ?? d10();
    if (![skillRoll, attackRoll].every(n => Number.isInteger(n) && n >= 1 && n <= 10)) throw new Error('Production d10 out of bounds');
    const selected = facts?.actionId ? { status: 'SELECTED' as const, action: d.actions.find(a => a.actionId === facts.actionId)! } : resolveProductionMonsterAction(d, actor.stance, skillRoll);
    if (selected.status !== 'SELECTED') {
      if (selected.status !== 'NO_ACTION') {
        c.blocker = { status: selected.status, definitionId: d.definitionId, actionId: null,
          deferredIds: selected.status === 'DEFERRED_SEMANTIC' ? selected.deferredIds : [], skillRoll, reason: selected.reason };
        recordProductionMonsterEvent(b, 'MONSTER_ACTION_DEFERRED', { ...c.blocker });
      } else recordProductionMonsterEvent(b, 'MONSTER_ACTION_COMPLETED', { reason: selected.status });
      return b;
    }
    if (!selected.action) throw new Error('Explicit production action unbound');
    const a = selected.action;
    const parentEventId = recordProductionMonsterEvent(b, 'MONSTER_ACTION_SELECTED', { actorId, definitionId: d.definitionId, actionId: a.actionId, skillRoll, attackRoll });
    const planned = planProductionMonsterAction(createProductionMonsterEnvironment(b), actorId, d, a.actionId, attackRoll);
    if (planned.status === 'DEFERRED_SEMANTIC' || planned.status === 'UNKNOWN') {
      c.blocker = { status: planned.status, definitionId: d.definitionId, actionId: planned.actionId,
        deferredIds: planned.status === 'DEFERRED_SEMANTIC' ? planned.deferredIds : [], skillRoll, reason: planned.reason };
      recordProductionMonsterEvent(b, planned.status === 'DEFERRED_SEMANTIC' ? 'MONSTER_ACTION_DEFERRED' : 'MONSTER_ACTION_BLOCKED', { ...c.blocker }, parentEventId); return b;
    }
    if (planned.status !== 'READY' && planned.status !== 'OUT_OF_RANGE') { recordProductionMonsterEvent(b, 'MONSTER_ACTION_COMPLETED', { reason: planned.status }, parentEventId); return b; }
    const targetIds = [...planned.targetIds];
    c.pendingExecution = { runtimeVersion: c.runtimeVersion, actorUnitId: actorId, definitionId: d.definitionId, actionId: a.actionId,
      targetIds, skillRoll, attackRoll, operationIndex: 0, operations: planned.status === 'READY' ? [...planned.operations] : buildProductionMonsterOperations(actorId, a, targetIds, attackRoll),
      parentEventId, phase: planned.status === 'READY' ? 'OPERATIONS' : 'MOVEMENT', hits: {}, appliedEffectIndices: [], diseaseDraws: {}, criticalStressHeroIds: [] };
    recordProductionMonsterEvent(b, 'MONSTER_TARGETS_SELECTED', { targetIds }, parentEventId);
    freezeDiseaseDraws(b);
    if (planned.status === 'OUT_OF_RANGE') {
      recordProductionMonsterEvent(b, 'MONSTER_MOVEMENT_REQUIRED', { requiredRange: planned.requiredRange }, parentEventId);
      const candidates = productionMonsterMovementCandidates(b, actorId, targetIds, planned.requiredRange);
      if (candidates.length > 1) return choice(b, 'MOVEMENT', actorId, targetIds[0], candidates, 'MOVEMENT');
      const moved = candidates.length ? move(b, actorId, targetIds[0], candidates[0], 'MOVEMENT') : b;
      return moved.productionMonsterContext!.pendingChoice ? moved : afterMovement(moved);
    }
    freezeDiseaseDraws(b);
    recordProductionMonsterEvent(b, 'MONSTER_ACTION_STAGED', { operations: planned.operations.length }, parentEventId);
    return continueProductionMonsterExecution(b);
  });
}

export function productionMonsterAttackSkill(b: BattleState): MonsterSkillDefinition | undefined {
  const s = b.pendingMonsterAttack?.productionMonsterAttack;
  if (!s) return undefined;
  const a = getProductionMonsterDefinition(s.definitionId)!.actions.find(a => a.actionId === s.actionId)!;
  return { id: s.actionId, monsterId: s.definitionId, name: a.printedName, usableFromPositions: [1, 2, 3, 4], validTargetPositions: [1, 2, 3, 4],
    targetSide: 'enemy', accuracy: s.operation.attack.accuracy, minDamage: s.operation.attack.damage, maxDamage: s.operation.attack.critDamage, description: 'C3C normalized production action' };
}
export function resolveProductionMonsterAttackValues(b: BattleState) {
  const pending = b.pendingMonsterAttack!, op = pending.productionMonsterAttack!.operation;
  const actor = find(b, op.actorId), target = find(b, op.targetId);
  const dodge = target.heroDodgeBinding?.value ?? target.bossCombatDodge;
  if (dodge === undefined) throw new Error('SOURCE_UNRESOLVED: production Hero Dodge binding absent');
  const marks = b.ruinsContext?.conditionStacks[target.id]?.filter(t => t.condition === 'mark').reduce((n, t) => n + t.amount, 0)
    ?? (target.printedConditionTokens ?? []).filter(t => t.type === 'mark').reduce((n, t) => n + (t.magnitude.presence === 'PRINTED_VALUE' ? t.magnitude.value : 1), 0);
  const result = resolvePrintedAttackFromRoll(op.attack, pending.attackRoll, dodge + pending.dodgeModifier, marks || (target.marked ? 1 : 0),
    actor.buffs.reduce((n, e) => n + e.amount, 0) + target.debuffs.reduce((n, e) => n + e.amount, 0));
  return { ...result, damage: result.damage + (result.hit && target.marked ? op.markedDamageBonus : 0) };
}
export function hasProductionMonsterProtection(b: BattleState, id: string): boolean {
  const base = find(b, id).productionMonsterProfile?.baseProtection ?? false;
  return hasRuntimeProtection(base, productionTimedProtectionTokens(b, id), id);
}
export function productionTimedProtectionTokens(b: BattleState, id: string) {
  return (find(b, id).printedConditionTokens ?? []).filter(t => t.type === 'protection')
    .map(t => ({ sourceId: t.eventId, unitId: id, remainingTurns: t.turns }));
}
export function grantProductionMonsterProtection(b: BattleState, id: string, sourceId: string, turns: number): BattleState {
  const target = find(b, id), granted = grantTimedProtection(productionTimedProtectionTokens(b, id), sourceId, id, turns).at(-1)!;
  return replace(b, { ...target, printedConditionTokens: [...(target.printedConditionTokens ?? []),
    { eventId: granted.sourceId, type: 'protection', magnitude: { presence: 'PRINTED_VALUE', value: 1 }, turns: granted.remainingTurns }] });
}
/** Enemy damage preserves the accepted riposte-before-Protection contract and the shared damage settlement. */
export function applyProductionMonsterEnemyDamage(b: BattleState, actorId: string, targetId: string, amount: number) {
  const riposte = Math.max(b.ruinsContext?.riposteStacks[targetId] ?? 0,
    ...(find(b, targetId).printedConditionTokens ?? []).filter(t => t.type === 'riposte').map(t => t.turns));
  let next = b;
  if (amount > 0 && riposte > 0 && find(b, actorId).isAlive) {
    let reflected = Math.ceil(amount / 2); if (hasProductionMonsterProtection(b, actorId)) reflected = Math.ceil(reflected / 2);
    next = replace(next, applyBattleUnitDamage(find(next, actorId), reflected).unit);
  }
  const appliedDamage = hasProductionMonsterProtection(next, targetId) ? Math.ceil(amount / 2) : amount;
  const outcome = applyBattleUnitDamage(find(next, targetId), appliedDamage);
  next = replace(next, outcome.unit);
  return { battle: next, outcome, appliedDamage };
}

function displacementCandidates(b: BattleState, id: string, relative: string, direction: 'push' | 'pull', distance: number): string[] {
  if (b.ruinsContext) return ruinsDisplacementCandidates(b, id, relative, direction, distance);
  const from = placements(b)[id], target = placements(b)[relative], before = productionAreaDistance(b, from, target);
  let frontier = [from];
  for (let step = 0; step < distance; step++) {
    const next = [...new Set(frontier.flatMap(id => b.largeMovementContract!.areas.find(a => a.id === id)!.adjacent))]
      .filter(area => productionAreaDistance(b, from, area) === step + 1
        && productionAreaDistance(b, area, target) === before + (direction === 'push' ? step + 1 : -step - 1) && canMove(b, id, relative, area));
    if (!next.length) break; frontier = next;
  }
  return frontier.filter(a => a !== from).sort();
}

function applyProductionEffect(b: BattleState, op: Extract<MonsterRuntimeOperation, { kind: 'EFFECT' }>): BattleState {
  const p = op.parameters, target = find(b, op.targetId), c = b.productionMonsterContext!, cursor = c.pendingExecution!;
  const eventId = recordProductionMonsterEvent(b, 'MONSTER_EFFECT_APPLIED', { primitiveId: op.primitiveId, effectIndex: op.effectIndex, targetId: target.id }, cursor.parentEventId);
  switch (op.primitiveId) {
    case 'markedDamageBonus': return b;
    case 'self-wound-sequencing': return replace(b, applyBattleUnitDamage(target, Number(p.amount)).unit);
    case 'timed-protection': return grantProductionMonsterProtection(b, target.id, eventId, Number(p.turns));
    case 'condition': case 'guard': case 'riposte': {
      const type = op.primitiveId === 'condition' ? String(p.condition) : op.primitiveId;
      const amount = Number(p.amount ?? 1), duration = Number(p.turns ?? 1);
      const effect = { type, amount, durationTurns: duration } as ActiveEffect;
      const resolved = op.targetId === op.actorId ? { unit: applyEffects(target, [effect]), blocked: [] }
        : applyEffectsWithResistance(target, [effect]);
      const blocked = resolved.blocked[0], turns = blocked?.durationReducedTo ?? (blocked ? 0 : duration);
      if (turns <= 0) return b;
      if (b.ruinsContext) {
        b.ruinsContext.conditionStacks[target.id] = [...(b.ruinsContext.conditionStacks[target.id] ?? []), { condition: type as 'bleed', amount, turns }];
        if (type === 'guard') b.ruinsContext.guardStacks[target.id] = Math.max(b.ruinsContext.guardStacks[target.id] ?? 0, turns);
        if (type === 'riposte') b.ruinsContext.riposteStacks[target.id] = Math.max(b.ruinsContext.riposteStacks[target.id] ?? 0, turns);
        return replace(b, synchronizeRuinsConditions(b, resolved.unit));
      }
      return replace(b, synchronizePrintedConditionTokens({ ...resolved.unit, printedConditionTokens: [...(target.printedConditionTokens ?? []),
        { eventId, type, magnitude: { presence: 'PRINTED_VALUE', value: amount }, turns }] }));
    }
    case 'heal': return replace(b, applyBattleUnitHealing(target, p.amount === 'ALL_WOUNDS' ? target.maxHp - target.hp : Number(p.amount)).unit);
    case 'stress': {
      const targets = p.target === 'party' ? b.heroes.filter(u => u.isAlive) : [target]; let next = b;
      for (const hero of targets) { next = replace(next, { ...find(next, hero.id), stress: clampStressValue(find(next, hero.id).stress + Number(p.amount)) });
        next.pendingStressEvents = [...(next.pendingStressEvents ?? []), { id: `${eventId}:${hero.id}`, heroInstanceId: hero.sourceId, amount: Number(p.amount), sourceType: 'battle-skill', sourceId: cursor.actionId }]; }
      return next;
    }
    case 'light': return { ...b, light: Math.max(0, Math.min(10, (b.light ?? 0) + Number(p.amount))) };
    case 'disease': return { ...b, pendingDiseaseInfections: [...(b.pendingDiseaseInfections ?? []), { id: eventId, heroInstanceId: target.sourceId,
      diseaseId: cursor.diseaseDraws[cursor.operationIndex - 1], sourceSkillId: cursor.actionId }] };
    case 'removeCondition': {
      const type = String(p.condition);
      if (b.ruinsContext) { b.ruinsContext.conditionStacks[target.id] = (b.ruinsContext.conditionStacks[target.id] ?? []).filter(t => t.condition !== type);
        if (type === 'guard') delete b.ruinsContext.guardStacks[target.id]; if (type === 'riposte') delete b.ruinsContext.riposteStacks[target.id];
        return replace(b, synchronizeRuinsConditions(b, target)); }
      return replace(b, synchronizePrintedConditionTokens({ ...target, printedConditionTokens: (target.printedConditionTokens ?? []).filter(t => t.type !== type) }));
    }
    case 'shuffle': {
      if (p.target !== 'self' && target.immunities?.includes('push-pull')) return b;
      const direction = p.direction as 'push' | 'pull';
      const distance = Math.max(0, Number(p.distance) - (p.target !== 'self' && (target.categoricalResistances?.includes('shuffle') || target.categoricalResistances?.includes('push-pull' as 'shuffle')) ? 1 : 0));
      const candidates = displacementCandidates(b, target.id, op.relativeToId, direction, distance);
      let next = b;
      if (target.side === 'monster') {
        const positions = shuffleAtomicStanceBlocks(b.monsters.filter(u => u.isAlive).map(u => ({ id: u.id, start: u.position - 1,
          width: u.productionMonsterProfile!.stanceSlots })), target.id, direction, distance);
        next = { ...b, monsters: b.monsters.map(u => positions[u.id] === undefined ? u : { ...u, position: positions[u.id] + 1, stance: RUINS_STANCES[positions[u.id]] }) };
      } else next = shuffleStance(b, target.id, direction, distance);
      if (target.side === 'hero') next.pendingRuleEvents = [...(next.pendingRuleEvents ?? []), { id: eventId, type: 'hero-shuffled', heroInstanceId: target.sourceId }];
      if (candidates.length > 1) return choice(next, 'SHUFFLE', target.id, op.relativeToId, candidates, 'OPERATIONS');
      return candidates.length ? move(next, target.id, op.relativeToId, candidates[0], 'OPERATIONS') : next;
    }
    default: throw new Error('Unbound production primitive: ' + op.primitiveId);
  }
}

export function continueProductionMonsterExecution(state: BattleState): BattleState {
  let b = state;
  const c = b.productionMonsterContext;
  if (!c?.pendingExecution || c.pendingChoice || c.blocker || b.pendingMonsterAttack || b.ruinsContext?.pendingChoice) return b;
  if (c.pendingExecution.phase === 'MOVEMENT') return afterMovement(b);
  while (b.productionMonsterContext!.pendingExecution) {
    const p = b.productionMonsterContext!.pendingExecution!, op = p.operations[p.operationIndex];
    if (!op) return completeProductionMonsterAction(b);
    if (op.kind === 'ATTACK') {
      if (!find(b, op.targetId).isAlive) { p.hits[op.targetId] = false; p.operationIndex++; continue; }
      if (find(b, op.targetId).side !== 'hero') throw new Error('Production attack target must be Hero');
      if (find(b, op.targetId).heroDodgeBinding?.value === undefined && find(b, op.targetId).bossCombatDodge === undefined)
        throw new Error('SOURCE_UNRESOLVED: production Hero Dodge binding absent');
      const rootEventId = recordProductionMonsterEvent(b, 'MONSTER_ATTACK_STAGED', { targetId: op.targetId, operationIndex: p.operationIndex, attackRoll: op.roll }, p.parentEventId);
      return { ...b, pendingMonsterAttack: { kind: 'monster-attack', rootEventId, stage: 'incoming-attack-window',
        monsterUnitId: op.actorId, targetHeroUnitId: op.targetId, skillId: p.actionId, attackRoll: op.roll,
        dodgeModifier: 0, hit: null, crit: null, baseDamage: null, criticalOverride: null, diseaseRoll: null,
        incomingDamageNumerator: 1, incomingDamageDenominator: 1, incomingDamageRounding: 'ceil', processedTrinketInstanceIds: [],
        productionMonsterAttack: { runtimeVersion: PRODUCTION_MONSTER_RUNTIME_VERSION, integrationVersion: PRODUCTION_MONSTER_INTEGRATION_VERSION,
          definitionId: p.definitionId, actionId: p.actionId, operationIndex: p.operationIndex, targetIds: [...p.targetIds], parentEventId: p.parentEventId, operation: op } } };
    }
    if (!(op.primitiveId in MONSTER_EFFECT_DISPATCH)) throw new Error('Production effect unbound');
    p.operationIndex++; // Commit before spatial pause: the same effect is never applied twice.
    if (op.hitTargetId !== null && (!p.hits[op.hitTargetId] || !find(b, op.targetId).isAlive)) continue;
    if (op.oncePerAction && p.appliedEffectIndices.includes(op.effectIndex)) continue;
    if (op.oncePerAction) p.appliedEffectIndices.push(op.effectIndex);
    b = applyProductionEffect(b, op);
    if (b.productionMonsterContext!.pendingChoice || b.ruinsContext?.pendingChoice) return b;
  }
  return b;
}
export function finishProductionMonsterAttack(b: BattleState, pending: PendingMonsterAttack): BattleState {
  const p = b.productionMonsterContext!.pendingExecution!, s = pending.productionMonsterAttack!;
  if (p.operationIndex !== s.operationIndex || p.actionId !== s.actionId || p.definitionId !== s.definitionId) throw new Error('Production attack cursor mismatch');
  p.hits[pending.targetHeroUnitId] = pending.hit === true; p.operationIndex++;
  return continueProductionMonsterExecution({ ...b, pendingMonsterAttack: null });
}
export function completeProductionMonsterAction(b: BattleState, reason = 'COMPLETED'): BattleState {
  const c = b.productionMonsterContext!, p = c.pendingExecution;
  recordProductionMonsterEvent(b, 'MONSTER_ACTION_COMPLETED', { actionId: p?.actionId ?? null, reason }, p?.parentEventId ?? null);
  c.pendingExecution = null; c.pendingChoice = null;
  return b.ruinsContext && p ? runRuinsRoomTrigger(b, 'END_TURN', p.actorUnitId) : b;
}
export function resolveProductionMonsterChoice(state: BattleState, choiceId: string, selectedId: string): BattleState {
  const p = state.productionMonsterContext?.pendingChoice;
  if (!p || p.choiceId !== choiceId || !p.candidateIds.includes(selectedId) || p.integrationVersion !== PRODUCTION_MONSTER_INTEGRATION_VERSION) throw new Error('Production choice unavailable');
  return withProductionMonsterSources(structuredClone(state), b => {
    b.productionMonsterContext!.pendingChoice = null;
    let next = p.kind === 'LARGE_DISPLACEMENT' ? syncPlacements(resolveLargeDisplacement(b, b.largeMovementContract!.pendingChoice!.choiceId, selectedId))
      : move(b, p.actorId, p.relativeToId, selectedId, p.resumePhase);
    if (next.productionMonsterContext!.pendingChoice) return next;
    return p.resumePhase === 'MOVEMENT' ? afterMovement(next) : continueProductionMonsterExecution(next);
  });
}
export function tickProductionMonsterProtection(b: BattleState, unitId: string, beforeBoundary?: BattleUnit): BattleState {
  if (!b.productionMonsterContext) return b;
  const before = beforeBoundary ?? find(b, unitId);
  const old = (before.printedConditionTokens ?? []).filter(t => t.type === 'protection');
  const expired = expireTimedProtection(old.map(t => ({ sourceId: t.eventId, unitId, remainingTurns: t.turns })), unitId);
  const current = find(b, unitId);
  // The shared condition lifecycle has already ticked the other token families at this boundary.
  return replace(b, { ...current, printedConditionTokens: [...(current.printedConditionTokens ?? []).filter(t => t.type !== 'protection'),
    ...expired.map(t => ({ eventId: t.sourceId, type: 'protection', magnitude: { presence: 'PRINTED_VALUE' as const, value: 1 }, turns: t.remainingTurns }))] });
}
export function validateProductionMonsterBattle(b: BattleState): void {
  const c = b.productionMonsterContext; if (!c) return;
  if (c.schemaVersion !== 1 || c.protectionStorage !== 'BATTLE_UNIT_PRINTED_CONDITION_TOKENS'
    || c.integrationVersion !== PRODUCTION_MONSTER_INTEGRATION_VERSION || c.runtimeVersion !== PRODUCTION_MONSTER_RUNTIME_VERSION || b.bossEncounter)
    throw new Error('Production Monster context version invalid');
  if (c.playerRouteVersion && c.playerRouteVersion !== 'C3E-MONSTER-PLAYER-PATH-v1') throw new Error('Production player route invalid');
  if (!Number.isInteger(c.rngCursor) || !Number.isInteger(c.rngCalls) || c.rngCalls < 0) throw new Error('Production RNG invalid');
  const p = c.pendingExecution, pending = b.pendingMonsterAttack?.productionMonsterAttack;
  if (p) {
    const definition = getProductionMonsterDefinition(p.definitionId);
    if (p.runtimeVersion !== c.runtimeVersion || c.definitionIds[p.actorUnitId] !== p.definitionId
      || !definition?.actions.some(a=>a.actionId===p.actionId) || ![p.skillRoll,p.attackRoll].every(n=>Number.isInteger(n)&&n>=1&&n<=10)
      || !Number.isInteger(p.operationIndex) || p.operationIndex<0 || p.operationIndex>p.operations.length
      || new Set(p.targetIds).size!==p.targetIds.length || p.targetIds.some(id=>!units(b).some(u=>u.id===id))
      || !c.events.some(e=>e.eventId===p.parentEventId)) throw new Error('Production execution invalid');
    const action = definition!.actions.find(a=>a.actionId===p.actionId)!;
    if (JSON.stringify(p.operations)!==JSON.stringify(buildProductionMonsterOperations(p.actorUnitId,action,p.targetIds,p.attackRoll))) throw new Error('Production operations differ from source action');
    if (pending && (pending.runtimeVersion!==c.runtimeVersion || pending.integrationVersion!==c.integrationVersion
      || pending.parentEventId!==p.parentEventId || pending.actionId!==p.actionId || pending.definitionId!==p.definitionId
      || pending.operationIndex!==p.operationIndex || JSON.stringify(p.operations[p.operationIndex])!==JSON.stringify(pending.operation)
      || JSON.stringify(p.targetIds)!==JSON.stringify(pending.targetIds) || b.pendingMonsterAttack!.attackRoll!==p.attackRoll)) throw new Error('Production attack continuation invalid');
  } else if (pending) throw new Error('Production attack orphaned');
  if (c.blocker && (p || pending || c.pendingChoice)) throw new Error('Production blocker partially executed');
  if (c.pendingChoice && !c.events.some(e=>e.eventId===c.pendingChoice!.choiceId && JSON.stringify(e.detail.candidateIds)===JSON.stringify(c.pendingChoice!.candidateIds))) throw new Error('Production choice candidates differ from causal event');
  if (c.pendingChoice && (c.pendingChoice.integrationVersion!==c.integrationVersion
    || new Set(c.pendingChoice.candidateIds).size!==c.pendingChoice.candidateIds.length)) throw new Error('Production saved choice invalid');
  validateLargeMovementContract(b);
  for (const u of b.monsters) {
    const d = getProductionMonsterDefinition(c.definitionIds[u.id]), profile = u.productionMonsterProfile;
    if (!d || profile?.definitionId !== d.definitionId || profile.baseProtection !== d.profile.protection
      || profile.dodge !== (d.profile.dodge ?? 0) || profile.printedSpeed !== d.profile.speed
      || profile.stanceSlots !== (d.profile.stanceSlots ?? 1)) throw new Error('Production definition binding invalid');
  }
  if (JSON.stringify(c.placements) !== JSON.stringify(b.largeMovementContract!.placements)) throw new Error('Production placements differ from live ledger');
  if (c.pendingChoice && (!c.pendingExecution || c.pendingChoice.parentEventId !== c.pendingExecution.parentEventId || !c.pendingChoice.candidateIds.length)) throw new Error('Production choice continuation absent');
}
