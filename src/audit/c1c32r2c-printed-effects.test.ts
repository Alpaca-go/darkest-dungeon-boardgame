import { describe, expect, it } from 'vitest';
import { drawnRuinsFixture, fixtureArea } from '../game-engine/ruins/executor-test-fixture';
import { applyRuinsPrintedEffects, recordRuinsEvent, resolveRuinsPrintedMovementChoice } from '../game-engine/ruins/printed-effect-runtime';
import { applyRuinsEnemyDamage, tickRuinsConditions } from '../game-engine/ruins/condition-runtime';
import { ruinsTile } from '../game-engine/ruins/source-registry';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { selectRuinsMonsterTargets, stageRuinsAttack } from '../game-engine/ruins/monster-runtime';
import { ruinsMonster } from '../game-engine/ruins/source-registry';
import { legalTargetsForActor, freezePendingMonsterAttack, commitPendingMonsterAttackResolution } from '../game-engine/battle';
import { processBattleDiseaseInfections } from '../game-engine/diseases/battle-bridge';
import type { BattleState } from '../types';
import type { PrintedEffect } from '../types/ruins-executable';

function apply(battle: BattleState, effects: PrintedEffect[], actorId = battle.monsters[0].id, targetId = battle.heroes[0].id) {
  const next = structuredClone(battle);
  const parent = recordRuinsEvent(next.ruinsContext!, 'PRINTED_EFFECT_TEST_DECLARED', actorId, [targetId], null, {});
  return applyRuinsPrintedEffects(next, actorId, targetId, effects, parent);
}

describe('C1C32R2C typed effects and saved combat state', () => {
  it('executes stress, party stress, light, fixed healing and ALL_WOUNDS with replay equality', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.roomNumber === 1);
    const battle = structuredClone(campaign.battle);
    battle.heroes[0].hp -= 5;
    const effects: PrintedEffect[] = [{ type: 'stress', target: 'target', amount: 2 },
      { type: 'stress', target: 'party', amount: 1 }, { type: 'light', target: 'party', amount: -2 },
      { type: 'heal', target: 'target', amount: 2 }, { type: 'heal', target: 'target', amount: 'ALL_WOUNDS' }];
    const after = apply(battle, effects);
    expect(after.heroes[0].hp).toBe(after.heroes[0].maxHp);
    expect(after.heroes.map(unit => unit.stress)).toEqual([3, 1, 1, 1]);
    expect(after.light).toBe(Math.max(0, battle.light! - 2));
    const save = JSON.parse(JSON.stringify(createSaveSnapshot({ ...campaign, battle: after })));
    expect(validateSaveFile(save)).toBeNull();
    expect(restoreSaveSnapshot(save).battle).toEqual(after);
  });

  it.each(['bleed','blight','stun','buff','debuff','mark','guard','riposte'] as const)('persists, expires and removes %s', condition => {
    const campaign = drawnRuinsFixture(encounter => encounter.roomNumber === 1);
    const hero = campaign.battle.heroes[0];
    hero.resistances = undefined;
    hero.categoricalResistances = [];
    const effected = apply(campaign.battle, [{ type: 'condition', target: 'target', condition, amount: 1, turns: 2 }]);
    const save = JSON.parse(JSON.stringify(createSaveSnapshot({ ...campaign, battle: effected })));
    expect(validateSaveFile(save)).toBeNull();
    const restored = restoreSaveSnapshot(save).battle!;
    expect(restored.ruinsContext!.conditionStacks[hero.id]).toEqual([{ condition, amount: 1, turns: 2 }]);
    const removed = apply(restored, [{ type: 'removeCondition', target: 'target', condition }]);
    expect(removed.ruinsContext!.conditionStacks[hero.id]).toEqual([]);
    const expired = tickRuinsConditions(tickRuinsConditions(restored, hero.id), hero.id);
    expect(expired.ruinsContext!.conditionStacks[hero.id]).toEqual([]);
  });

  it('keeps independently timed Bleed tokens and applies categorical resistance without a random check', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.roomNumber === 1);
    const hero = campaign.battle.heroes[0];
    hero.resistances = undefined;
    hero.categoricalResistances = ['bleed'];
    const calls = campaign.battle.ruinsContext!.rngCalls;
    const stacked = apply(campaign.battle, [
      { type: 'condition', target: 'target', condition: 'bleed', amount: 1, turns: 2 },
      { type: 'condition', target: 'target', condition: 'bleed', amount: 2, turns: 4 }]);
    expect(stacked.heroes[0].bleed).toBe(3);
    expect(stacked.ruinsContext!.rngCalls).toBe(calls);
    expect(tickRuinsConditions(stacked, hero.id).heroes[0].bleed).toBe(2);
    const immune = structuredClone(campaign.battle);
    immune.heroes[0].immunities = ['bleed'];
    expect(apply(immune, [{ type: 'condition', target: 'target', condition: 'bleed', amount: 4, turns: 3 }]).heroes[0].bleed).toBe(0);
  });

  it('forces Guard targets on both sides, then permits normal targeting after expiry', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.roomNumber === 1);
    const actor = campaign.battle.monsters[0];
    const guardedHero = campaign.battle.heroes[2];
    const guarded = apply(campaign.battle, [{ type: 'condition', target: 'target', condition: 'guard', amount: 1, turns: 1 }], actor.id, guardedHero.id);
    const skill = ruinsMonster(actor.sourceId, guarded.ruinsContext!.ruleSetVersion).skills.find(item => item.targetSide === 'hero')!;
    expect(selectRuinsMonsterTargets({ battle: guarded, tile: ruinsTile(guarded.ruinsContext!.tileId),
      placements: guarded.ruinsContext!.placements, guardStacks: guarded.ruinsContext!.guardStacks }, actor.id, skill)).toEqual([guardedHero.id]);
    expect(tickRuinsConditions(guarded, guardedHero.id).ruinsContext!.guardStacks[guardedHero.id]).toBe(0);
    const monsterGuard = campaign.battle.monsters.find(unit => unit.position <= 3)!;
    const next = apply(campaign.battle, [{ type: 'condition', target: 'self', condition: 'guard', amount: 1, turns: 2 }], monsterGuard.id, monsterGuard.id);
    next.activeActorId = next.heroes[0].id;
    expect(legalTargetsForActor(next, 'crusader-smite')).toEqual([monsterGuard.id]);
  });

  it('resolves Riposte before printed Protection using the shared damage primitive', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.monsters.some(monster => monster.definitionId === 'bone-defender'));
    const target = campaign.battle.monsters.find(monster => monster.sourceId === 'bone-defender')!;
    const actor = campaign.battle.heroes[0];
    const prepared = apply(campaign.battle, [{ type: 'condition', target: 'self', condition: 'riposte', amount: 1, turns: 2 }], target.id, target.id);
    const after = applyRuinsEnemyDamage(prepared, actor.id, target.id, 5);
    expect(after.battle.heroes[0].hp).toBe(actor.hp - 3);
    expect(after.battle.monsters.find(monster => monster.id === target.id)?.hp).toBe(target.hp - 3);
    expect(after.battle.ruinsContext!.events.slice(-2).map(event => event.type)).toEqual(['PRINTED_RIPOSTE_DAMAGE','PRINTED_ENEMY_DAMAGE']);
    const heroRiposte = apply(campaign.battle, [{ type: 'condition', target: 'self', condition: 'riposte', amount: 1, turns: 2 }], actor.id, actor.id);
    const reflectedAtProtectedMonster = applyRuinsEnemyDamage(heroRiposte, target.id, actor.id, 5);
    expect(reflectedAtProtectedMonster.battle.monsters.find(monster => monster.id === target.id)?.hp).toBe(target.hp - 2);
  });

  it('draws a Disease once, reloads the queued acquisition and uses the existing campaign acquisition pipeline', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.roomNumber === 1);
    const calls = campaign.battle.ruinsContext!.rngCalls;
    const effected = apply(campaign.battle, [{ type: 'disease', target: 'target', acquisition: 'DRAW_FROM_DECK' }]);
    expect(effected.ruinsContext!.rngCalls).toBe(calls + 1);
    const save = JSON.parse(JSON.stringify(createSaveSnapshot({ ...campaign, battle: effected })));
    expect(validateSaveFile(save)).toBeNull();
    const restored = restoreSaveSnapshot(save);
    const committed = processBattleDiseaseInfections(restored);
    expect(committed.heroes[0].disease?.diseaseId).toBe(effected.pendingDiseaseInfections![0].diseaseId);
    expect(processBattleDiseaseInfections(committed)).toEqual(committed);
  });

  it('queues exactly one critical Stress for each Hero across a single source multi-target attack', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.roomNumber === 1
      && encounter.monsters.some(monster => monster.definitionId === 'bone-captain'));
    const battle = structuredClone(campaign.battle), actor = battle.monsters.find(monster => monster.sourceId === 'bone-captain')!;
    for (const hero of battle.heroes) fixtureArea(battle, hero.id, 'ruins-tile-1:NW');
    fixtureArea(battle, actor.id, 'ruins-tile-1:N');
    const skill = ruinsMonster(actor.sourceId, battle.ruinsContext!.ruleSetVersion).skills.find(skill => skill.number === 2)!;
    const targets = battle.heroes.map(hero => hero.id);
    const parent = recordRuinsEvent(battle.ruinsContext!, 'MONSTER_SKILL_SELECTED', actor.id, targets, null,
      { d10: 1, skillNumber: skill.number, stance: actor.stance });
    let next = stageRuinsAttack(battle, actor.id, skill, targets, parent, 1);
    for (let count = 0; next.pendingMonsterAttack && count < 4; count++)
      next = commitPendingMonsterAttackResolution(freezePendingMonsterAttack(next));
    expect(next.pendingMonsterAttack).toBeNull();
    const stress = next.pendingStressEvents!.filter(event => event.sourceType === 'critical');
    expect(stress).toHaveLength(4);
    for (const hero of next.heroes) expect(stress.filter(event => event.heroInstanceId === hero.sourceId)).toHaveLength(1);
    expect(next.ruinsContext!.events.filter(event => event.type === 'MONSTER_CRITICAL_AREA_STRESS')).toHaveLength(1);
  });

  it('preserves spatial candidates and remaining effects across a Shuffle save without rerolling', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.roomNumber === 1);
    const actor = campaign.battle.monsters[0], target = campaign.battle.heroes[0];
    fixtureArea(campaign.battle, actor.id, 'ruins-tile-1:NW');
    fixtureArea(campaign.battle, target.id, 'ruins-tile-1:NW');
    const effected = apply(campaign.battle, [{ type: 'shuffle', target: 'target', direction: 'push', distance: 1 },
      { type: 'stress', target: 'target', amount: 2 }]);
    expect(effected.heroes[0].stance).toBe('defensive');
    const choice = effected.ruinsContext!.pendingChoice;
    expect(choice?.kind).toBe('PRINTED_SHUFFLE');
    const save = JSON.parse(JSON.stringify(createSaveSnapshot({ ...campaign, battle: effected })));
    expect(validateSaveFile(save)).toBeNull();
    const restored = restoreSaveSnapshot(save).battle!;
    const result = resolveRuinsPrintedMovementChoice(restored, choice!.choiceId, choice!.candidateIds[0]);
    expect(result.heroes[0].stress).toBe(2);
    expect(result.ruinsContext!.rngCalls).toBe(effected.ruinsContext!.rngCalls);
    expect(result).toEqual(resolveRuinsPrintedMovementChoice(effected, choice!.choiceId, choice!.candidateIds[0]));
  });
});
