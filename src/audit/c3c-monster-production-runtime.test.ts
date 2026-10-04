import { describe, expect, it } from 'vitest';
import { getProductionMonsterDefinition } from '../data/monsters/production-monster-definition-registry';
import { PRODUCTION_MONSTER_DEFINITIONS } from '../data/monsters/production-monster-definitions';
import type { CompactMonsterAction, ProductionMonsterDefinition } from '../data/monsters/production-monster-definition-types';
import { executeProductionMonsterAction, planProductionMonsterAction, prepareProductionMonsterAction } from '../game-engine/monsters/production-runtime';
import { resolveProductionMonsterAction } from '../game-engine/monsters/production-action-selection';
import { getProductionMonsterActionRuntimeStatus, selectAllLivingHeroes,
  grantTimedProtection, expireTimedProtection, hasRuntimeProtection } from '../game-engine/monsters/production-runtime-primitives';
import { selectProductionMonsterTargets } from '../game-engine/monsters/production-targeting';
import { dispatchProductionMonsterOperations } from '../game-engine/monsters/production-effect-executor';
import { RUINS_STANCES } from '../types/ruins-executable';
import { compareMonsterTargetPriority } from '../game-engine/monster-target-priority';
import { buildC3CArtifacts, sweepProductionRuntime, verifyC3C } from '../../scripts/audit/c3c-monster-runtime';
import { SyntheticMonsterAdapter } from './c3c-synthetic-runtime';

function fixture(id: string, number = 1) {
  const definition = getProductionMonsterDefinition(id)!;
  const action = definition.actions.find(a => a.number === number)!;
  return { definition, action, adapter: new SyntheticMonsterAdapter(definition, action) };
}
function run(id: string, number: number, missed = false) {
  const f = fixture(id, number);
  if (missed) f.adapter.dodge = 100;
  const plan = planProductionMonsterAction(f.adapter, 'actor', f.definition, f.action.actionId, 1);
  expect(plan.status).toBe('READY');
  if (plan.status === 'READY') dispatchProductionMonsterOperations(f.adapter, plan.operations);
  return { ...f, plan };
}

describe('C3C all-action and stance coverage', () => {
  it('executes every source-clear action and atomically blocks every deferred action', () => {
    const result = sweepProductionRuntime();
    expect(result.ready).toBe(168);
    expect(result.deferred).toBe(7);
    expect(result.selections).toBe(77 * 4 * 10);
    expect(result.dispatched).toEqual(expect.arrayContaining(['condition', 'condition-duration', 'heal',
      'attack-roll', 'damage', 'disease-draw', 'disease-infection', 'guard', 'riposte', 'light',
      'spatial-displacement', 'stance-shuffle', 'stress', 'remove-condition', 'self-wound-sequencing', 'timed-protection']));
  });
  it('verifies frozen inputs, import fence, phase scope, derived artifacts and Fast Gate', () => {
    expect(verifyC3C().coverage.unknownActions).toBe(0);
    expect(Object.keys(buildC3CArtifacts())).toHaveLength(4);
  });
  it('rejects all seven through the public executor before preflight, RNG or mutation', () => {
    let blocked = 0;
    for (const definition of PRODUCTION_MONSTER_DEFINITIONS) for (const action of definition.actions) {
      if (action.capability !== 'DEFERRED_SEMANTIC') continue;
      const adapter = new SyntheticMonsterAdapter(definition, action);
      adapter.preflight = () => { throw new Error('Deferred action reached adapter'); };
      const selected = Object.keys(definition.selection).flatMap(stance => Array.from({ length: 10 }, (_, i) => {
        const resolution = resolveProductionMonsterAction(definition, stance, i + 1);
        return resolution.status === 'SELECTED' && resolution.action.actionId === action.actionId ? { stance, skillRoll: i + 1 } : null;
      })).find(Boolean)!;
      expect(selected).toBeTruthy();
      const before = adapter.snapshot();
      const result = executeProductionMonsterAction(adapter, { actorUnitId: 'actor', definitionId: definition.definitionId, ...selected });
      expect(result.status).toBe('DEFERRED_SEMANTIC');
      expect(adapter.snapshot()).toBe(before);
      blocked++;
    }
    expect(blocked).toBe(7);
  });
  it('rejects a nested deferred requirement even if an action aggregate is mislabeled', () => {
    const f = fixture('supplicant');
    const deferred = f.definition.actions.find(a => a.capability === 'DEFERRED_SEMANTIC')!;
    expect(getProductionMonsterActionRuntimeStatus({ ...deferred, capability: 'SUPPORTED_EXISTING_COMPOSITION' }).status).toBe('DEFERRED_SEMANTIC');
  });
  it('never promotes unknown primitive requirements', () => {
    const { action } = fixture('gatekeeper');
    expect(getProductionMonsterActionRuntimeStatus({ ...action, requirements: [...action.requirements,
      { requirementId: 'unknown', status: 'SUPPORTED_EXISTING_PRIMITIVE', primitiveIds: ['unknown'], deferredIds: [] }] }).status).toBe('UNKNOWN');
  });
});

describe('C3C stance/action and environment boundaries', () => {
  it('resolves inherited, no-action and unresolved stances without guessing', () => {
    const { definition } = fixture('gatekeeper');
    const custom: ProductionMonsterDefinition = { ...definition, selection: {
      root: { kind: 'SKILL_TABLE', rows: [{ min: 1, max: 10, actionId: definition.actions[0].actionId }] },
      inherited: { kind: 'INHERITS', stance: 'root' }, chained: { kind: 'INHERITS', stance: 'inherited' },
      empty: { kind: 'NO_ACTION' }, missing: { kind: 'SOURCE_UNRESOLVED', reason: 'SOURCE_UNRESOLVED' },
      cycleA: { kind: 'INHERITS', stance: 'cycleB' }, cycleB: { kind: 'INHERITS', stance: 'cycleA' },
    } };
    expect(resolveProductionMonsterAction(custom, 'chained', 10).status).toBe('SELECTED');
    expect(resolveProductionMonsterAction(custom, 'empty').status).toBe('NO_ACTION');
    expect(resolveProductionMonsterAction(custom, 'missing', 1).status).toBe('DEFERRED_SEMANTIC');
    expect(resolveProductionMonsterAction(custom, 'cycleA', 1).status).toBe('UNKNOWN');
    for (const roll of [undefined, 0, 11, 1.5]) expect(resolveProductionMonsterAction(custom, 'root', roll).status).toBe('UNKNOWN');
  });
  it('rejects out-of-range and missing attack inputs without adapter mutations', () => {
    const { adapter, definition, action } = fixture('gatekeeper');
    const before = adapter.snapshot();
    expect(planProductionMonsterAction(adapter, 'actor', definition, action.actionId).status).toBe('UNKNOWN');
    expect(adapter.snapshot()).toBe(before);
    adapter.coordinates['actor'] = -20;
    const distant = adapter.snapshot();
    expect(planProductionMonsterAction(adapter, 'actor', definition, action.actionId, 1).status).toBe('OUT_OF_RANGE');
    expect(adapter.snapshot()).toBe(distant);
  });
  it('executes explicit Farmhand forms despite definition-level eligibility uncertainty', () => {
    for (const id of ['farmhand-level-1', 'farmhand-level-2']) {
      const definition = getProductionMonsterDefinition(id)!;
      const selection = resolveProductionMonsterAction(definition, 'aggressive', 1);
      expect(selection.status).toBe('SELECTED');
      if (selection.status !== 'SELECTED') throw new Error('Expected printed selection');
      const adapter = new SyntheticMonsterAdapter(definition, selection.action);
      const request = { actorUnitId: 'actor', definitionId: id, stance: 'aggressive', skillRoll: 1, attackRoll: 1 };
      expect(prepareProductionMonsterAction(adapter, request).status).toBe('READY');
      expect(executeProductionMonsterAction(adapter, request).status).toBe('EXECUTED');
    }
  });
  it('preflights the whole operation list before executing any effects', () => {
    const { adapter } = fixture('gatekeeper');
    const before = adapter.snapshot();
    adapter.preflight = () => { throw new Error('Adapter dependency missing'); };
    expect(() => executeProductionMonsterAction(adapter, { actorUnitId: 'actor', definitionId: 'gatekeeper',
      stance: 'aggressive', skillRoll: 1, attackRoll: 1 })).toThrow('Adapter dependency missing');
    expect(adapter.snapshot()).toBe(before);
  });
});

describe('all-heroes-targeting', () => {
  it('selects all four living Heroes across areas in stable order without duplicate IDs', () => {
    const { adapter, action } = fixture('crystalline-aberration-level-1');
    adapter.heroes.forEach((h, i) => { adapter.placements[h.id] = `area-${i}`; adapter.coordinates[h.id] = i + 5; });
    const units = adapter.units();
    const expected = selectAllLivingHeroes(units);
    expect(expected).toHaveLength(4);
    expect(selectAllLivingHeroes([...units].reverse())).toEqual(expected);
    expect(selectAllLivingHeroes([...units, units[0]])).toEqual(expected);
    expect(selectProductionMonsterTargets(adapter, 'actor', action)).toEqual(expected);
    adapter.heroes[0].isAlive = false;
    expect(selectProductionMonsterTargets(adapter, 'actor', action)).toHaveLength(3);
  });
  it('preserves the accepted target comparator', () => {
    const { adapter } = fixture('gatekeeper');
    expect([...adapter.heroes].reverse().sort(compareMonsterTargetPriority).map(u => u.id))
      .toEqual(['hero-1', 'hero-2', 'hero-3', 'hero-4']);
    for (const a of adapter.heroes) for (const b of adapter.heroes)
      expect(compareMonsterTargetPriority(a, b)).toBe(RUINS_STANCES.indexOf(a.stance) - RUINS_STANCES.indexOf(b.stance) || a.id.localeCompare(b.id));
  });
});

describe('self-wound-sequencing', () => {
  it('applies a single-target PRINTED_EFFECT wound once at its printed slot', () => {
    const { adapter, definition, action } = fixture('gatekeeper', 2);
    adapter.heroes.slice(1).forEach(h => { h.isAlive = false; });
    const plan = planProductionMonsterAction(adapter, 'actor', definition, action.actionId, 1);
    expect(plan.status).toBe('READY');
    if (plan.status === 'READY') dispatchProductionMonsterOperations(adapter, plan.operations);
    expect(adapter.find('actor').hp).toBe(79 - 8);
    expect(adapter.events.map(e => e.kind)).toEqual(['ATTACK', 'self-wound-sequencing', 'stress']);
    if (plan.status === 'READY') expect(plan.operations.filter(op => op.kind === 'EFFECT').map(op => op.effectIndex)).toEqual([0, 1]);
  });
  it('runs AFTER_ACTION once after all four target attacks/effects', () => {
    const { adapter } = run('crystalline-aberration-level-1', 1);
    expect(adapter.events.filter(e => e.kind === 'ATTACK')).toHaveLength(4);
    expect(adapter.events.filter(e => e.kind === 'self-wound-sequencing')).toHaveLength(1);
    expect(adapter.events.at(-1)?.kind).toBe('self-wound-sequencing');
    expect(adapter.find('actor').hp).toBe(69);
    expect(adapter.heroes.every(h => h.blight === 2)).toBe(true);
  });
  it('self-wounds once even when all attacks miss, without on-hit effects', () => {
    for (const id of ['gatekeeper', 'drowned-thrall', 'crystalline-aberration-level-1', 'crystalline-aberration-level-2']) {
      const { adapter } = run(id, 2, true);
      expect(adapter.events.filter(e => e.kind === 'self-wound-sequencing')).toHaveLength(1);
      expect(adapter.events.some(e => e.kind === 'stress')).toBe(false);
      if (id !== 'gatekeeper') expect(adapter.events.at(-1)?.kind).toBe('self-wound-sequencing');
    }
  });
  it('retains ordered target effects and performs action-level self effects once', () => {
    const { adapter } = run('drowned-thrall', 2);
    expect(adapter.events[0].kind).toBe('shuffle');
    expect(adapter.events.filter(e => e.kind === 'shuffle')).toHaveLength(1);
    expect(adapter.events.at(-1)?.kind).toBe('self-wound-sequencing');
  });
});

describe('timed-protection', () => {
  it('applies a temporary token, tracks duration and expires without rewriting the profile', () => {
    const { adapter, definition } = run('manservant', 3);
    const base = JSON.stringify(definition.profile);
    expect(adapter.protection).toEqual([{ sourceId: 'actor', unitId: 'actor', remainingTurns: 1 }]);
    expect(hasRuntimeProtection(false, adapter.protection, 'actor')).toBe(true);
    adapter.protection = expireTimedProtection(adapter.protection, 'actor');
    expect(adapter.protection).toEqual([]);
    expect(hasRuntimeProtection(false, adapter.protection, 'actor')).toBe(false);
    expect(hasRuntimeProtection(true, adapter.protection, 'actor')).toBe(true);
    expect(JSON.stringify(definition.profile)).toBe(base);
    expect(adapter.events.map(e => e.kind)).toEqual(['guard', 'timed-protection', 'condition']);
  });
  it('handles repeat grants and unit-scoped expiry deterministically', () => {
    const first = grantTimedProtection([], 'source', 'actor', 1);
    const second = grantTimedProtection(first, 'source', 'actor', 2);
    expect(first).toHaveLength(1);
    expect(second).toEqual(grantTimedProtection(first, 'source', 'actor', 2));
    expect(expireTimedProtection(second, 'other')).toEqual(second);
    const remaining = expireTimedProtection(second, 'actor');
    expect(remaining).toEqual([{ sourceId: 'source', unitId: 'actor', remainingTurns: 1 }]);
    expect(expireTimedProtection(remaining, 'actor')).toEqual([]);
    expect(() => grantTimedProtection([], 'source', 'actor', 0)).toThrow();
  });
});

describe('generic target priorities', () => {
  it('covers Closest, Furthest, Wounded, Stressed, Crowded, Marked and Monster targets', () => {
    const { adapter, action } = fixture('gatekeeper');
    adapter.heroes.forEach((h, i) => { adapter.coordinates[h.id] = i; adapter.placements[h.id] = `area-${i}`; });
    const target = (priority: string, markedFirst = false, targetSide = 'hero') => selectProductionMonsterTargets(adapter, 'actor', {
      ...action, targets: 1, targeting: { priority, markedFirst, targetSide },
    } as CompactMonsterAction);
    expect(target('Closest')).toEqual(['hero-1']);
    expect(target('Furthest')).toEqual(['hero-4']);
    expect(target('Most Wounded')).toEqual(['hero-4']);
    expect(target('Most Stressed')).toEqual(['hero-4']);
    expect(target('Furthest', true)).toEqual(['hero-1']);
    adapter.placements['hero-3'] = 'area-1';
    expect(target('Crowded')).toEqual(['hero-2']);
    adapter.coordinates['ally-1'] = 1;
    adapter.coordinates['ally-2'] = 2;
    expect(target('Closest Monster', false, 'monster')).toEqual(['ally-1']);
    expect(target('Most Wounded Monster', false, 'monster')).toEqual(['ally-2']);
    adapter.guard['hero-4'] = 1;
    expect(target('Closest')).toEqual(['hero-4']);
  });
});

describe('existing party-effect composition', () => {
  it('applies party light once on the first successful target, preserving later hits after a miss', () => {
    const { definition, action, adapter } = fixture('ghoul', 3);
    const attack = adapter.attack.bind(adapter);
    adapter.attack = op => {
      adapter.dodge = op.targetId === 'hero-1' ? 100 : 0;
      return attack(op);
    };
    const plan = planProductionMonsterAction(adapter, 'actor', definition, action.actionId, 1);
    expect(plan.status).toBe('READY');
    if (plan.status === 'READY') dispatchProductionMonsterOperations(adapter, plan.operations);
    expect(adapter.events.filter(e => e.kind === 'light')).toHaveLength(1);
    expect(adapter.light).toBe(4);
    expect(adapter.events.find(e => e.kind === 'light')?.targetId).toBe('hero-2');
    const missed = run('ghoul', 3, true);
    expect(missed.adapter.light).toBe(5);
    const automatic = run('crone', 3);
    expect(automatic.adapter.events.filter(e => e.kind === 'light')).toHaveLength(1);
  });
});
