import { describe, expect, it } from 'vitest';
import { listProductionMonsterDefinitions, getProductionMonsterDefinition } from '../data/monsters/production-monster-definition-registry';
import { productionBattleFixture, drainProductionBattle } from './c3d-battle-fixture';
import { beginProductionMonsterTurn, productionAreaDistance, resolveProductionMonsterChoice, tickProductionMonsterProtection,
  hasProductionMonsterProtection, applyProductionMonsterEnemyDamage, withProductionMonsterSources, productionGuardStacks,
  productionTimedProtectionTokens, grantProductionMonsterProtection } from '../game-engine/monsters/production-battle-runtime';
import { productionRuinsBindings } from '../game-engine/monsters/production-encounter';
import { freezePendingMonsterAttack, commitPendingMonsterAttackResolution, advanceTurn } from '../game-engine/battle';
import { acquireTrinket } from '../game-engine/trinkets/acquire-trinket';
import { advancePendingMonsterAttack, resolveTrinketOpportunity } from '../game-engine/trinkets/battle-trinket-bridge';
import { sweepRealProductionBattle, verifyC3DArtifacts } from '../../scripts/audit/c3d-monster-integration';
import type { BattleState } from '../types';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter } from '../game-engine/ruins/encounter-draw';
import { RUINS_V4, RUINS_V5, RUINS_V6, RUINS_V5_REPLACEMENT_RULING } from '../types/ruins-executable';
import { explicitlySelectRuinsV6 } from '../game-engine/rules/ruins-v6';
import { initializeProductionRuinsBattle } from '../game-engine/monsters/production-encounter';
import { validateOrdinaryRuinsBattle } from '../game-engine/ruins/battle-runtime';

const definition = (id: string) => getProductionMonsterDefinition(id)!;
const fixture = (id = 'bone-soldier', actionIndex = 0) => productionBattleFixture(definition(id), definition(id).actions[actionIndex]);
function relocate(b: BattleState, id: string, area: string) {
  b.productionMonsterContext!.placements[id] = area; b.largeMovementContract!.placements[id] = area;
}
function staged(id = 'bone-soldier', actionIndex = 0, attackRoll = 2) {
  const c = fixture(id, actionIndex); c.battle = beginProductionMonsterTurn(c.battle!, 'actor', { actionId: definition(id).actions[actionIndex].actionId, skillRoll: 3, attackRoll }); return c;
}

describe('C3D real BattleState production integration', () => {
  it('derives all real ready/deferred action bindings and all definition factories', () => {
    const sweep = sweepRealProductionBattle();
    expect(sweep.ready).toBe(168); expect(sweep.deferred).toBe(7); expect(sweep.instantiable).toBe(77);
    expect(listProductionMonsterDefinitions()).toHaveLength(77);
    expect(sweep.effectBindings).toEqual(expect.arrayContaining(['condition', 'disease', 'shuffle', 'self-wound-sequencing', 'timed-protection', 'guard', 'riposte']));
  });
  it('checks compact generated artifacts and frozen inputs', () => verifyC3DArtifacts());
  it('preserves Ruins 24 canonical bindings and 62 distinct physical copies', () => {
    const r = productionRuinsBindings(); expect(r).toHaveLength(24);
    expect(new Set(r.flatMap(r => r.physicalCopyIds)).size).toBe(62);
  });
  it('stages a real attack, retains pinned facts, and never recommits damage', () => {
    const c = staged(); let b = c.battle!;
    expect(b.pendingMonsterAttack?.productionMonsterAttack).toMatchObject({ definitionId: 'bone-soldier', actionId: definition('bone-soldier').actions[0].actionId, operationIndex: 0 });
    const target = b.pendingMonsterAttack!.targetHeroUnitId, before = b.heroes.find(u => u.id === target)!.hp;
    b = commitPendingMonsterAttackResolution(freezePendingMonsterAttack(structuredClone(b)));
    expect(b.heroes.find(u => u.id === target)!.hp).toBeLessThan(before);
    expect(commitPendingMonsterAttackResolution(b)).toEqual(b);
    expect(b.productionMonsterContext!.pendingExecution).toBeNull();
  });
  it.each([
    ['community-trinket-core-camouflage-cloak', 'before-incoming-hit-resolution'],
    ['community-trinket-core-protective-padlock', 'before-incoming-damage-applied'],
  ])('pauses/resumes the real %s reaction window without reroll', (trinketId, window) => {
    let c = staged(); const pending = c.battle!.pendingMonsterAttack!, target = c.battle!.heroes.find(u => u.id === pending.targetHeroUnitId)!;
    c = acquireTrinket(c, { trinketId, source: 'debug', sourceEventId: 'c3d:' + trinketId, heroId: target.sourceId }).campaign;
    c = advancePendingMonsterAttack(c);
    const opportunity = c.pendingTrinketUseOpportunities.find(o => o.status === 'open')!;
    expect(opportunity.useWindow).toBe(window);
    const cursor = c.battle!.productionMonsterContext!.pendingExecution!;
    expect(c.battle!.pendingMonsterAttack!.attackRoll).toBe(2);
    expect(cursor).toMatchObject({ skillRoll: 3, attackRoll: 2, definitionId: 'bone-soldier', operationIndex: 0 });
    const rng = c.battle!.productionMonsterContext!.rngCalls;
    c = resolveTrinketOpportunity(structuredClone(c), opportunity.id, 'decline').campaign;
    expect(c.battle!.pendingMonsterAttack).toBeNull();
    expect(c.battle!.productionMonsterContext!.rngCalls).toBe(rng);
    expect(c.battle!.productionMonsterContext!.events.filter(e => e.type === 'MONSTER_ATTACK_STAGED')).toHaveLength(1);
  });
  it('continues every All-Hero target and AFTER_ACTION self-wound exactly once', () => {
    const d = listProductionMonsterDefinitions().find(d => d.actions.some(a => a.targets === 'ALL_HEROES' && a.effects.some(e => e.kind !== 'DEFERRED' && e.primitiveId === 'self-wound-sequencing' && e.parameters.timing === 'AFTER_ACTION')))!;
    const a = d.actions.find(a => a.targets === 'ALL_HEROES' && a.effects.some(e => e.kind !== 'DEFERRED' && e.primitiveId === 'self-wound-sequencing' && e.parameters.timing === 'AFTER_ACTION'))!;
    const original = productionBattleFixture(d, a).battle!;
    let b = beginProductionMonsterTurn(original, 'actor', { actionId: a.actionId, skillRoll: 1, attackRoll: 1 });
    expect(b.productionMonsterContext!.pendingExecution!.targetIds).toHaveLength(4);
    const hp = b.monsters[0].hp;
    for (let i = 0; i < 3; i++) {
      b = commitPendingMonsterAttackResolution(freezePendingMonsterAttack(structuredClone(b)));
      expect(b.pendingMonsterAttack!.attackRoll).toBe(1); expect(b.monsters[0].hp).toBe(hp);
    }
    b = drainProductionBattle(b);
    expect(b.monsters[0].hp).toBe(Math.max(0, hp - 10));
    expect(b.productionMonsterContext!.events.filter(e => e.type === 'MONSTER_EFFECT_APPLIED' && e.detail.primitiveId === 'self-wound-sequencing')).toHaveLength(1);
  });
  it('the Campaign reaction bridge pauses on a later All-Hero target and completes the pinned sequence', () => {
    const d = definition('crystalline-aberration-level-1'), a = d.actions[0];
    let c = productionBattleFixture(d, a);
    c.battle = beginProductionMonsterTurn(c.battle!, 'actor', { actionId: a.actionId, skillRoll: 4, attackRoll: 2 });
    const ids = c.battle.productionMonsterContext!.pendingExecution!.targetIds;
    const second = c.battle.heroes.find(u => u.id === ids[1])!;
    c = acquireTrinket(c, { trinketId: 'community-trinket-core-protective-padlock', source: 'debug', sourceEventId: 'c3d:multi', heroId: second.sourceId }).campaign;
    c = advancePendingMonsterAttack(c);
    expect(c.battle!.pendingMonsterAttack!.targetHeroUnitId).toBe(second.id);
    expect(c.battle!.pendingMonsterAttack!.attackRoll).toBe(2);
    expect(c.battle!.heroes.find(u => u.id === ids[0])!.hp).toBeLessThan(100);
    expect(c.battle!.heroes.find(u => u.id === second.id)!.hp).toBe(100);
    const opportunity = c.pendingTrinketUseOpportunities.find(o => o.status === 'open')!;
    c = resolveTrinketOpportunity(structuredClone(c), opportunity.id, 'decline').campaign;
    const events = c.battle!.productionMonsterContext!.events;
    expect(events.filter(e => e.type === 'MONSTER_ATTACK_STAGED')).toHaveLength(4);
    expect(events.filter(e => e.type === 'MONSTER_EFFECT_APPLIED' && e.detail.primitiveId === 'self-wound-sequencing')).toHaveLength(1);
    expect(c.battle!.monsters.find(u => u.id === 'actor')!.isAlive).toBe(false);
    expect(c.battle!.productionMonsterContext!.pendingExecution).toBeNull();
  });
  it('excludes dead Heroes and uses distinct live targets across Areas for ALL_HEROES', () => {
    const d = listProductionMonsterDefinitions().find(d => d.actions.some(a => a.targets === 'ALL_HEROES' && a.range === null))!;
    const a = d.actions.find(a => a.targets === 'ALL_HEROES' && a.range === null)!;
    const b = productionBattleFixture(d, a).battle!;
    b.heroes[3].isAlive = false; b.heroes.forEach((h, i) => relocate(b, h.id, 'a' + i));
    const started = beginProductionMonsterTurn(b, 'actor', { actionId: a.actionId, skillRoll: 1, attackRoll: 1 });
    const ids = started.productionMonsterContext!.pendingExecution?.targetIds ?? started.productionMonsterContext!.events.find(e => e.type === 'MONSTER_TARGETS_SELECTED')!.detail.targetIds as string[];
    expect(ids).toHaveLength(3); expect(new Set(ids).size).toBe(3); expect(ids).not.toContain(b.heroes[3].id);
  });
  it('already exact Range stays put; can reach Range moves with the same selected action', () => {
    const c = fixture(); const a = definition('bone-soldier').actions[0];
    const exact = beginProductionMonsterTurn(c.battle!, 'actor', { actionId: a.actionId, skillRoll: 4, attackRoll: 2 });
    expect(exact.productionMonsterContext!.events.some(e => e.type === 'MONSTER_MOVED')).toBe(false);
    const b = fixture().battle!; b.heroes.forEach(h => relocate(b, h.id, 'a2'));
    const moved = beginProductionMonsterTurn(b, 'actor', { actionId: a.actionId, skillRoll: 4, attackRoll: 2 });
    expect(moved.productionMonsterContext!.placements.actor).toBe('a1');
    expect(moved.productionMonsterContext!.pendingExecution).toMatchObject({ actionId: a.actionId, skillRoll: 4, attackRoll: 2 });
  });
  it('moves the best legal distance when Speed cannot reach Range and ends OUT_OF_RANGE', () => {
    const b = fixture().battle!, a = definition('bone-soldier').actions[0]; b.heroes.forEach(h => relocate(b, h.id, 'a5'));
    const moved = beginProductionMonsterTurn(b, 'actor', { actionId: a.actionId, skillRoll: 4, attackRoll: 2 });
    expect(moved.productionMonsterContext!.placements.actor).toBe('a1');
    expect(moved.pendingMonsterAttack).toBeUndefined();
    expect(moved.productionMonsterContext!.events.at(-1)?.detail.reason).toBe('OUT_OF_RANGE');
  });
  it('saves tied destinations and resumes without reselection or reroll', () => {
    const b = fixture().battle!, a = definition('bone-soldier').actions[0];
    b.largeMovementContract!.areas = [
      { id: 'a0', adjacent: ['a1', 'a3'], capacity: 8 }, { id: 'a1', adjacent: ['a0', 'a2'], capacity: 8 },
      { id: 'a3', adjacent: ['a0', 'a2'], capacity: 8 }, { id: 'a2', adjacent: ['a1', 'a3'], capacity: 8 }];
    b.heroes.forEach(h => relocate(b, h.id, 'a2'));
    const started = beginProductionMonsterTurn(b, 'actor', { actionId: a.actionId, skillRoll: 4, attackRoll: 2 });
    const saved = structuredClone(started), choice = saved.productionMonsterContext!.pendingChoice!;
    expect(choice.candidateIds).toEqual(['a1', 'a3']); expect(saved.pendingMonsterAttack).toBeUndefined();
    const resumed = resolveProductionMonsterChoice(saved, choice.choiceId, 'a3');
    expect(resumed.pendingMonsterAttack!.attackRoll).toBe(2);
    expect(resumed.productionMonsterContext!.events.filter(e => e.type === 'MONSTER_ACTION_SELECTED')).toHaveLength(1);
    expect(productionAreaDistance(resumed, 'a3', 'a2')).toBe(1);
    expect(() => resolveProductionMonsterChoice(resumed, choice.choiceId, 'a3')).toThrow();
  });
  it('live Manservant Protection is independent of the printed profile and expires at the turn boundary', () => {
    const d = definition('manservant'), a = d.actions[2]; const base = productionBattleFixture(d, a).battle!;
    const b = drainProductionBattle(beginProductionMonsterTurn(base, 'actor', { actionId: a.actionId, skillRoll: 1, attackRoll: 1 }));
    expect(productionTimedProtectionTokens(b, 'actor')).toHaveLength(1);
    expect(b.monsters[0].productionMonsterProfile!.baseProtection).toBe(d.profile.protection);
    let saved = structuredClone(b); expect(hasProductionMonsterProtection(saved, 'actor')).toBe(true);
    const damage = withProductionMonsterSources(structuredClone(saved), v => applyProductionMonsterEnemyDamage(v, v.heroes[0].id, 'actor', 4).battle);
    expect(saved.monsters[0].hp - damage.monsters[0].hp).toBe(2);
    saved = grantProductionMonsterProtection(saved, 'actor', 'second', 2);
    saved = tickProductionMonsterProtection(saved, 'actor'); expect(productionTimedProtectionTokens(saved, 'actor')).toHaveLength(1);
    saved = tickProductionMonsterProtection(saved, 'actor'); expect(hasProductionMonsterProtection(saved, 'actor')).toBe(false);
    const expired = applyProductionMonsterEnemyDamage(structuredClone(saved), saved.heroes[0].id, 'actor', 4);
    expect(expired.appliedDamage).toBe(4);
    const lifecycle = structuredClone(b); lifecycle.initiativeOrder = ['actor', ...lifecycle.heroes.map(h => h.id)]; lifecycle.initiativeIndex = -1; lifecycle.activeActorId = null;
    const next = advanceTurn(lifecycle); expect(productionTimedProtectionTokens(next, 'actor')).toHaveLength(0);
  });
  it('reads the existing printed unit Guard authority', () => {
    const b = fixture().battle!, hero = b.heroes[1];
    hero.printedConditionTokens = [{ eventId: 'guard', type: 'guard', magnitude: { presence: 'PRINTED_VALUE', value: 1 }, turns: 2 }];
    expect(productionGuardStacks(b, hero.id)).toBe(2);
    const a = definition('bone-soldier').actions[0];
    const started = beginProductionMonsterTurn(b, 'actor', { actionId: a.actionId, skillRoll: 1, attackRoll: 1 });
    expect(started.pendingMonsterAttack!.targetHeroUnitId).toBe(hero.id);
  });
  it('large movement respects two spaces and saves the accepted displacement candidates', () => {
    const d = listProductionMonsterDefinitions().find(d => d.profile.occupiedSpaces === 2 && d.profile.speed! >= 1
      && d.actions.some(a => a.range?.kind === 'EXACT' && a.range.distance === 1 && a.targeting.targetSide === 'hero'))!;
    const a = d.actions.find(a => a.range?.kind === 'EXACT' && a.range.distance === 1 && a.targeting.targetSide === 'hero')!;
    const b = productionBattleFixture(d, a).battle!;
    b.largeMovementContract!.areas = [ { id: 'a0', adjacent: ['a1'], capacity: 8 },
      { id: 'a1', adjacent: ['a0', 'a2'], capacity: 2 }, { id: 'a2', adjacent: ['a1'], capacity: 8 } ];
    b.heroes.forEach(h => relocate(b, h.id, 'a2')); b.monsters.slice(1).forEach(u => relocate(b, u.id, 'a1'));
    const started = beginProductionMonsterTurn(b, 'actor', { actionId: a.actionId, skillRoll: 4, attackRoll: 2 });
    expect(started.productionMonsterContext!.pendingChoice!.kind).toBe('LARGE_DISPLACEMENT');
    expect(started.largeMovementContract!.pendingChoice!.candidateIds.length).toBeGreaterThan(1);
    expect(started.productionMonsterContext!.occupiedSpaces.actor).toBe(2);
    const p = started.productionMonsterContext!.pendingChoice!;
    const resumed = resolveProductionMonsterChoice(structuredClone(started), p.choiceId, p.candidateIds[0]);
    expect(resumed.productionMonsterContext!.placements.actor).toBe('a1');
    expect(resumed.pendingMonsterAttack!.attackRoll).toBe(2);
    expect(resumed.largeMovementContract!.pendingChoice).toBeNull();
  });
  it('shuffle choice resumes after committed attack damage without repeating it', () => {
    const d = definition('bone-soldier'), a = d.actions.find(a => a.effects.some(e => e.kind !== 'DEFERRED' && e.primitiveId === 'shuffle' && e.parameters.target === 'target'))!;
    // Other source-clear definitions may carry target shuffle; choose from the production registry.
    const chosen = a ? { d, a } : listProductionMonsterDefinitions().flatMap(d => d.actions.map(a => ({ d, a })))
      .find(({ a }) => a.attack.kind === 'ROLL' && a.effects.some(e => e.kind !== 'DEFERRED' && e.primitiveId === 'shuffle' && e.parameters.target === 'target' && e.parameters.direction === 'push' && e.parameters.distance === 1))!;
    const b = productionBattleFixture(chosen.d, chosen.a).battle!;
    b.largeMovementContract!.areas = [ { id: 'a0', adjacent: ['a1'], capacity: 8 },
      { id: 'a1', adjacent: ['a0', 'a2', 'a3'], capacity: 8 }, { id: 'a2', adjacent: ['a1'], capacity: 8 }, { id: 'a3', adjacent: ['a1'], capacity: 8 } ];
    b.heroes.forEach(h => relocate(b, h.id, 'a1')); b.monsters.slice(1).forEach(m => relocate(b, m.id, 'a0'));
    let started = beginProductionMonsterTurn(b, 'actor', { actionId: chosen.a.actionId, skillRoll: 1, attackRoll: 2 });
    if (started.productionMonsterContext!.pendingChoice) started = resolveProductionMonsterChoice(started, started.productionMonsterContext!.pendingChoice.choiceId, started.productionMonsterContext!.pendingChoice.candidateIds[0]);
    const targetId = started.pendingMonsterAttack!.targetHeroUnitId;
    const committed = commitPendingMonsterAttackResolution(freezePendingMonsterAttack(started));
    const p = committed.productionMonsterContext!.pendingChoice!;
    expect(p.kind).toBe('SHUFFLE'); expect(p.candidateIds).toEqual(expect.arrayContaining(['a2', 'a3']));
    const hp = committed.heroes.find(h => h.id === targetId)!.hp;
    const resumed = drainProductionBattle(resolveProductionMonsterChoice(structuredClone(committed), p.choiceId, 'a3'));
    expect(resumed.heroes.find(h => h.id === targetId)!.hp).toBe(hp);
  });
  it('binds an accepted drawn Ruins encounter without changing physical draw ownership or historical validation', () => {
    let c = fixture(); c.battle = null; c.gamePhase = 'quest-select';
    c.ruinsRuleSetSelection = { schemaVersion: 1, ruleSetVersion: RUINS_V5, previousVersion: RUINS_V4,
      migrationId: 'c3d-fixture-v5', rulingId: RUINS_V5_REPLACEMENT_RULING, canonical: false };
    c = explicitlySelectRuinsV6(c, 'c3d-fixture-v6');
    c.heroes = c.heroes.map((h, i) => ({ ...h, stance: ['aggressive', 'defensive', 'ranged', 'support'][i] as typeof h.stance }));
    const draw = drawOrdinaryRuinsEncounter(createRuinsDrawState(1, 42, RUINS_V6), 'c3d-ruins', Object.fromEntries(c.heroes.map(h => [h.instanceId, h.stance])));
    const before = JSON.stringify(draw);
    const battle = initializeProductionRuinsBattle(c, draw, 'c3d-ruins');
    expect(JSON.stringify(draw)).toBe(before);
    validateOrdinaryRuinsBattle(battle, draw);
    expect(Object.values(battle.productionMonsterContext!.physicalCopyIds)).toEqual(battle.ruinsContext!.physicalCopyIds);
    expect(battle.productionMonsterContext).toBeDefined(); expect(battle.bossEncounter).toBeUndefined();
  });
});
