import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { actors, attack, communityAttack, defeatWithHeroSkills, deployShufflingSummons, beginCommunityFinalEncounter, noRng, reload, scenario, summonedActors, targetId, win } from './capability-test-support';
import { applyStatusEffectEvent, resolveStartOfTurnConditions, tickStun } from '../../../game-engine/status-effects';
import { runMonsterTurn } from '../../../game-engine/battle';
import { executeMammothCystAction } from '../../../game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action';
import { createCommunityCheckpoint, createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { drawDarkestDungeonQuest } from '../../../game-engine/campaign/act-four/draw-quest';
import { transitionToNextFinalForm } from '../../../game-engine/campaign/act-four/transition-final-form';
import { communityFinalFormUnit, runCommunityFinalFormTurn } from '../../../game-engine/campaign/act-four/community-final-combat';
import { commitBattleVictory } from '../../../game-engine/commands/battle';
import { seededRuntimeSources, setRuntimeSources, setRandomSource } from '../../../game-engine/random';
beforeEach(() => { setRuntimeSources(seededRuntimeSources(1203)); setRandomSource(() => 0.49); });
afterEach(() => setRandomSource(null));

describe('Community capability whole SaveFile replay acceptance', () => {
  for (const actor of [...actors, ...summonedActors]) it(`SR-resistance-${actor} effect events survive migration and replay without duplicate stacks`, () => {
    const before = reload(summonedActors.includes(actor as typeof summonedActors[number]) ? deployShufflingSummons() : scenario(actor as typeof actors[number])); const id = targetId(before, actor);
    const effects = [{ type: 'bleed' as const, amount: 3, durationTurns: 2 }, { type: 'blight' as const, amount: 3, durationTurns: 2 }, { type: 'stun' as const, amount: 3, durationTurns: 2 }];
    const battle = applyStatusEffectEvent(before.battle!, id, effects, 'resistance-event');
    const restored = reload({ ...before, battle }); setRandomSource(noRng);
    expect(restored.battle!.statusEffectEvents).toEqual(battle.statusEffectEvents);
    expect(restored.battle!.monsters).toEqual(battle.monsters);
    expect(applyStatusEffectEvent(restored.battle!, id, effects, 'resistance-event')).toBe(restored.battle);
    const savedUnit = restored.battle!.monsters.find(unit => unit.id === id)!;
    expect(tickStun(savedUnit)).toEqual(tickStun(battle.monsters.find(unit => unit.id === id)!));
    expect(resolveStartOfTurnConditions(savedUnit).unit).toEqual(resolveStartOfTurnConditions(battle.monsters.find(unit => unit.id === id)!).unit);
  });
  for (const [actor, roll] of [['mammoth-cyst', 1], ['mammoth-cyst', 6], ['white-cell-stalk', 5]] as const) it(`SR-critical-${actor}-${roll} saved printed roll damage and exact target replay without RNG`, () => {
    const first = attack(actor, roll, 1);
    const restored = reload(first.result.campaign); setRandomSource(noRng);
    const result = executeMammothCystAction(restored, first.cardId, { mode: 'community-reference', targetHeroId: first.heroId, rng: noRng });
    expect(result.ok).toBe(true); expect(result.skillRoll).toEqual(first.result.skillRoll);
    expect(result.campaign).toBe(restored);
    expect(result.damageDealt).toBe(first.result.damageDealt);
    expect(result.campaign.processedDamageEventIds).toEqual(first.result.campaign.processedDamageEventIds);
  });
  for (const actor of ['templars-impaler', 'templars-warlord', 'shuffling-horror', 'cultist-priest', 'malignant-growth'] as const) it(`SR-critical-${actor}-5 saved printed roll damage and exact target replay without RNG`, () => {
    const first = communityAttack(actor, 5, 1);
    const restored = reload(first.campaign); setRandomSource(noRng);
    const result = runMonsterTurn(restored.battle!, targetId(restored, actor));
    expect(result.communityAttackEvents).toEqual(first.result.communityAttackEvents);
    expect(result.heroes.map(hero => hero.hp)).toEqual(first.result.heroes.map(hero => hero.hp));
  });
  it('SR-quest-provision saved exact Wild choices and pool replay with no RNG or duplicate grants', () => {
    const initial = reload(createCommunityCheckpoint()); const dice = [0, ...Array(8).fill(0.99)];
    const first = drawDarkestDungeonQuest(initial, { mode: 'community-reference', rng: () => dice.shift()!, chooseWildProvision: () => 'torch' });
    expect(first.ok).toBe(true);
    const restored = reload(first.campaign); setRandomSource(noRng);
    const replay = drawDarkestDungeonQuest(restored, { mode: 'community-reference', rng: noRng, chooseWildProvision: () => { throw new Error('Repeated Wild prompt'); } });
    expect(replay.alreadyDrawn).toBe(true); expect(replay.record).toEqual(first.record);
    expect(replay.campaign).toBe(restored); expect(replay.campaign.provisions).toEqual(first.campaign.provisions);
  });
  it('SR-final-skill save preserves the actual preparation receipt and no selected skill is fabricated', () => {
    const campaign = beginCommunityFinalEncounter(2);
    const form = communityFinalFormUnit(campaign.battle!, 'ancestor-first-form')!;
    const first = runCommunityFinalFormTurn(campaign, form.id);
    expect(first.ok).toBe(true);
    const restored = reload(first.campaign);
    setRandomSource(noRng);
    const replay = runCommunityFinalFormTurn(restored, form.id);
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.campaign.battle!.communityAttackEvents).toEqual(first.campaign.battle!.communityAttackEvents);
    expect(replay.campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-first-form']).toEqual(
      first.campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-first-form'],
    );
  });
  it('SR-final-transition no transition or initiative rebuild is invented after reload', () => {
    const started = beginCommunityFinalEncounter(2);
    const restored = reload(started);
    setRandomSource(noRng);
    expect(restored.battle!.battleId).toBe(started.battle!.battleId);
    expect(restored.battle!.sourceRoomId).toBe(started.battle!.sourceRoomId);
    expect(restored.actFourState.finalEncounterState?.activeFormId).toBe(started.actFourState.finalEncounterState?.activeFormId);
    const result = transitionToNextFinalForm(restored, { mode: 'community-reference', rng: noRng });
    expect(result.ok).toBe(false);
    expect(restored.actFourState.formTransitionHistory).toEqual([]);
  });
  it('SR-victory-templars first death survives reload and second death progresses exactly once', () => {
    const first = defeatWithHeroSkills(createCommunityGuardianScenario(1), 'templars-impaler');
    const partial = reload(first); expect(commitBattleVictory(partial).ok).toBe(false);
    expect(partial.actFourState.templarsEncounterState!.actorStates.filter(actor => actor.isAlive)).toHaveLength(1);
    const both = defeatWithHeroSkills(partial, 'templars-warlord');
    const victory = commitBattleVictory(both); expect(victory.ok).toBe(true);
    const restored = reload(victory.campaign); setRandomSource(noRng);
    expect(commitBattleVictory(restored)).toMatchObject({ ok: true, campaign: restored });
    expect(commitBattleVictory(restored).campaign.heroes.map(hero => hero.xp)).toEqual(victory.campaign.heroes.map(hero => hero.xp));
  });
  for (const [index, family] of [[2, 'mammoth'], [0, 'shuffling']] as const) it(`SR-victory-${family} reload preserves cleanup and never awards progression twice`, () => {
    const victory = win(index); const restored = reload(victory); setRandomSource(noRng);
    const result = commitBattleVictory(restored);
    expect(result.ok).toBe(true); expect(result.campaign.actFourState).toEqual(restored.actFourState);
    expect(result.campaign.heroes).toEqual(restored.heroes);
    expect(result.campaign.battle!.monsters.every(unit => !unit.isAlive)).toBe(true);
  });
  it('SR-shuffling-deployed-blocker save cannot bypass missing placement to fabricate linked cleanup proof', () => {
    const before = reload(deployShufflingSummons());
    const state = before.actFourState.shufflingHorrorEncounterState!;
    expect(state.actors.filter(actor => actor.role !== 'horror').every(actor => !actor.inReserve && actor.areaId)).toBe(true);
    expect(reload(before).actFourState.shufflingHorrorEncounterState).toEqual(state);
    expect(before.battle!.monsters.some(unit => unit.sourceId === 'community-dd-cultist-priest')).toBe(true);
  });
});
