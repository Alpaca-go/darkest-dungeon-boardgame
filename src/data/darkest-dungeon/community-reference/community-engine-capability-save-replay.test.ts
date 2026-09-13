import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { actors, attack, defeatWithHeroSkills, finalReady, noRng, reload, scenario, targetId, win } from './capability-test-support';
import { applyStatusEffectEvent, resolveStartOfTurnConditions, tickStun } from '../../../game-engine/status-effects';
import { runMonsterTurn } from '../../../game-engine/battle';
import { executeMammothCystAction } from '../../../game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action';
import { createCommunityCheckpoint, createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { drawDarkestDungeonQuest } from '../../../game-engine/campaign/act-four/draw-quest';
import { prepareFinalEncounter } from '../../../game-engine/campaign/act-four/prepare-final-encounter';
import { transitionToNextFinalForm } from '../../../game-engine/campaign/act-four/transition-final-form';
import { performFinalFormSispersion } from '../../../game-engine/campaign/act-four/final-forms/final-form-actions';
import { commitBattleVictory } from '../../../game-engine/commands/battle';
import { seededRuntimeSources, setRuntimeSources, setRandomSource } from '../../../game-engine/random';
import { resolveEchoingDisassembly } from '../../../game-engine/bosses/shuffling-horror/echoing-disassembly-summon';
beforeEach(() => { setRuntimeSources(seededRuntimeSources(1203)); setRandomSource(() => 0.49); });
afterEach(() => setRandomSource(null));

describe('Community capability whole SaveFile replay acceptance', () => {
  for (const actor of actors) it(`SR-resistance-${actor} effect events survive migration and replay without duplicate stacks`, () => {
    const before = reload(scenario(actor)); const id = targetId(before, actor);
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
  for (const actor of ['templars-impaler', 'templars-warlord', 'shuffling-horror'] as const) it(`SR-critical-blocked-${actor} reload cannot manufacture an unsupported attack`, () => {
    const before = scenario(actor); const restored = reload(before); setRandomSource(noRng);
    const result = runMonsterTurn(restored.battle!, targetId(restored, actor));
    expect(result.heroes).toEqual(restored.battle!.heroes);
    expect(result.battleLog.at(-1)?.message).toContain('CRIT_ENGINE_UNSUPPORTED');
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
  it('SR-final-skill save preserves the actual preparation blocker and no selected skill is fabricated', () => {
    const before = finalReady(); const restored = reload(before); setRandomSource(noRng);
    expect(prepareFinalEncounter(restored, { mode: 'community-reference', rng: noRng })).toMatchObject({ ok: false, blocker: { code: 'FINAL_PROVISION_POLICY_UNRESOLVED' }, campaign: restored });
    const result = performFinalFormSispersion(restored, 1, { mode: 'community-reference', rng: noRng });
    expect(result.ok).toBe(false); expect(result.campaign).toBe(restored);
    expect(restored.actFourState.finalFormRuntimeState).toBeNull();
  });
  it('SR-final-transition no transition or initiative rebuild is invented after reload', () => {
    const before = finalReady(); const first = prepareFinalEncounter(before, { mode: 'community-reference', rng: noRng });
    expect(first.ok).toBe(false); const restored = reload(first.campaign); setRandomSource(noRng);
    const result = transitionToNextFinalForm(restored, { mode: 'community-reference', rng: noRng });
    expect(result.ok).toBe(false); expect(result.campaign).toBe(restored); expect(result.record).toBeNull();
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
    const before = reload(createCommunityGuardianScenario(0)); setRandomSource(noRng);
    const state = before.actFourState.shufflingHorrorEncounterState!;
    expect(resolveEchoingDisassembly(state, 'deployed-cleanup-proof')).toMatchObject({ ok: false, reason: 'SHUFFLING_INITIAL_AREA_UNRESOLVED', state });
    expect(reload(before).actFourState.shufflingHorrorEncounterState).toEqual(state);
  });
});
