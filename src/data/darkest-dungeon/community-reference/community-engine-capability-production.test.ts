import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { actors, attack, defeatWithHeroSkills, finalReady, noRng, scenario, summon, targetId, win } from './capability-test-support';
import { applyStatusEffectEvent } from '../../../game-engine/status-effects';
import { advanceTurn, endHeroTurn, heroUseSkill, runMonsterTurn } from '../../../game-engine/battle';
import { commitBattleVictory } from '../../../game-engine/commands/battle';
import { createCommunityCheckpoint, createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { drawDarkestDungeonQuest } from '../../../game-engine/campaign/act-four/draw-quest';
import { prepareFinalEncounter } from '../../../game-engine/campaign/act-four/prepare-final-encounter';
import { transitionToNextFinalForm } from '../../../game-engine/campaign/act-four/transition-final-form';
import { performFinalFormSispersion } from '../../../game-engine/campaign/act-four/final-forms/final-form-actions';
import { COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';
import { COMMUNITY_RUNTIME_FIELD_COVERAGE } from './runtime-field-coverage';
import { requirement } from './normalized';
import { seededRuntimeSources, setRuntimeSources, setRandomSource } from '../../../game-engine/random';
import { killCampaignHero } from '../../../game-engine/hero-death';
beforeEach(() => { setRuntimeSources(seededRuntimeSources(1203)); setRandomSource(() => 0.49); });
afterEach(() => setRandomSource(null));

describe('Community capability production acceptance', () => {
  for (const actor of actors) for (const category of ['bleed', 'blight', 'stun'] as const) {
    it(`P-resistance-${actor}-${category} applies actual BattleUnit effects through the shared skill pipeline`, () => {
      const campaign = scenario(actor);
      const unit = campaign.battle!.monsters.find(unit => unit.id === targetId(campaign, actor))!;
      const policy = requirement(`tierB-${actor}`).fields.resistances.value as { resistantTo: string[]; immuneTo: string[] };
      expect(unit.categoricalResistances).toEqual(policy.resistantTo.filter(value => value !== 'shuffle'));
      const result = applyStatusEffectEvent(campaign.battle!, unit.id, [{ type: category, amount: 3, durationTurns: 2 }], 'effect-1');
      const after = result.monsters.find(candidate => candidate.id === unit.id)!;
      const counter = category === 'stun' ? 'stunned' : category;
      expect(after[counter]).toBe(policy.immuneTo.includes(category) ? 0 : 3);
      expect(after.conditionDurations?.[category]).toBe(policy.immuneTo.includes(category) ? undefined : policy.resistantTo.includes(category) ? 1 : 2);
      expect(result.statusEffectEvents).toHaveLength(1);
      expect(result.statusEffectEvents![0].blocked).toEqual(policy.immuneTo.includes(category) ? [{ type: category, reason: 'immune' }] : policy.resistantTo.includes(category) ? [{ type: category, reason: 'resisted', durationReducedFrom: 2, durationReducedTo: 1 }] : []);
    });
  }
  for (const index of [0, 1, 2] as const) it(`P-skill-resistance-${index} registered Hero skill reaches the effect transaction`, () => {
    const campaign = createCommunityGuardianScenario(index);
    let battle = advanceTurn(campaign.battle!);
    for (let step = 0; step < 4 && battle.heroes.find(unit => unit.id === battle.activeActorId)!.position > 3; step++) battle = endHeroTurn(battle, battle.activeActorId!);
    const actor = battle.heroes.find(unit => unit.id === battle.activeActorId)!;
    expect(actor.position).toBeLessThan(4);
    const next = heroUseSkill(battle, actor.id, 'crusader-holy-lance', battle.monsters[0].id);
    expect(next.statusEffectEvents).toHaveLength(1);
    expect(next.statusEffectEvents![0]).toMatchObject({ targetId: battle.monsters[0].id, effects: [{ type: 'bleed', amount: 1 }] });
  });
  for (const [actor, skillRoll, printedDamage] of [['mammoth-cyst', 1, 11], ['mammoth-cyst', 6, 19], ['white-cell-stalk', 5, 2]] as const) {
    it(`P-critical-${actor}-${skillRoll} printed attack outcome reaches the campaign damage pipeline`, () => {
      const { before, result, heroId } = attack(actor, skillRoll, 1);
      expect(result.skillRoll).toMatchObject({ attackRoll: 1, critical: skillRoll === 6, resolvedDamage: printedDamage, targetHeroId: heroId, executionCompleted: true });
      const previous = before.heroes.find(hero => hero.instanceId === heroId)!;
      expect(result.campaign.heroes.find(hero => hero.instanceId === heroId)!.wounds).toBe(Math.min(previous.maxLife, previous.wounds + printedDamage));
      expect(result.campaign.processedDamageEventIds).toHaveLength(before.processedDamageEventIds.length + 1);
    });
  }
  for (const actor of ['templars-impaler', 'templars-warlord', 'shuffling-horror'] as const) it(`P-critical-blocked-${actor} unsupported production attack fails before RNG`, () => {
    const campaign = scenario(actor); setRandomSource(noRng);
    const next = runMonsterTurn(campaign.battle!, targetId(campaign, actor));
    expect(next.monsters).toEqual(campaign.battle!.monsters);
    expect(next.heroes).toEqual(campaign.battle!.heroes);
    expect(next.battleLog.at(-1)?.message).toContain(actor.startsWith('templars') ? 'TEMPLARS_CRIT_ENGINE_UNSUPPORTED' : 'SHUFFLING_CRIT_ENGINE_UNSUPPORTED');
  });
  it('P-quest-provision exact per-Hero die records are committed with the pool', () => {
    const campaign = createCommunityCheckpoint(); const rolls = [0, ...Array(8).fill(0.99)];
    const result = drawDarkestDungeonQuest(campaign, { mode: 'community-reference', rng: () => rolls.shift()!, chooseWildProvision: () => 'torch' });
    expect(result.ok).toBe(true); expect(rolls).toEqual([]);
    expect(result.record!.provisionRoll!.dice).toEqual(campaign.heroes.flatMap((hero, heroIndex) => [0, 1].map(dieIndex => ({ heroId: hero.instanceId, dieIndex, roll: 6, rolledFace: 'wild', selectedFace: 'torch', acceptedIntoPool: heroIndex === 0 }))));
    expect(result.campaign.provisions.torch).toBe(campaign.provisions.torch + 2);
    expect(Object.values(result.campaign.provisions).reduce((sum, count) => sum + count, 0)).toBe(16);
    expect(result.campaign.actFourState.processedTransactionIds).toContain(result.record!.transactionId);
  });
  it('P-final-skill all normalized Final selection leaves remain blocked without a production encounter', () => {
    const campaign = finalReady();
    expect(prepareFinalEncounter(campaign, { mode: 'community-reference', rng: noRng }).blocker?.code).toBe('FINAL_PROVISION_POLICY_UNRESOLVED');
    const result = performFinalFormSispersion(campaign, 1, { mode: 'community-reference', rng: noRng });
    expect(result.ok).toBe(false); expect(result.campaign).toEqual(campaign);
    const leaves = COMMUNITY_RUNTIME_FIELD_COVERAGE.filter(leaf => leaf.blockerCode === 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED');
    expect(leaves.length).toBeGreaterThan(1);
    expect(leaves.every(leaf => leaf.classification === 'engine-unsupported-blocker')).toBe(true);
  });
  it('P-quest-isolation Prototype and Formal do not receive Community provisions', () => {
    const base = createCommunityCheckpoint();
    const prototype = drawDarkestDungeonQuest(base, { mode: 'prototype', rng: () => 0 });
    expect(prototype.ok).toBe(true); expect(prototype.record?.provisionRoll).toBeUndefined(); expect(prototype.campaign.provisions).toEqual(base.provisions);
    const formal = drawDarkestDungeonQuest(base, { mode: 'formal', rng: noRng });
    expect(formal.ok).toBe(false); expect(formal.campaign).toBe(base);
  });
  it('P-quest-living dead Heroes receive no provision dice', () => {
    const base = createCommunityCheckpoint(); const deadId = base.heroes[0].instanceId;
    const afterDeath = killCampaignHero(base, { heroInstanceId: deadId, cause: 'deathblow-attack', source: 'battle', resumePhase: 'dungeon-explore' });
    const result = drawDarkestDungeonQuest(afterDeath, { mode: 'community-reference', rng: () => 0 });
    expect(result.ok).toBe(true); expect(result.record!.provisionRoll!.dice).toHaveLength(6);
    expect(result.record!.provisionRoll!.dice.some(die => die.heroId === deadId)).toBe(false);
  });
  for (const index of [0, 1, 2] as const) it(`P-round-limit-${index} Guardian battle remains active beyond the ordinary round timeout`, () => {
    let battle = advanceTurn(createCommunityGuardianScenario(index).battle!);
    for (let step = 0; step < 80 && battle.round <= battle.maxRounds; step++) {
      expect(battle.status).toBe('active');
      battle = endHeroTurn(battle, battle.activeActorId!);
    }
    expect(battle.round).toBeGreaterThan(battle.maxRounds); expect(battle.status).toBe('active');
  });
  it('P-final-transition real transition cannot be accepted by bypassing the preparation blocker', () => {
    const campaign = finalReady();
    const prepared = prepareFinalEncounter(campaign, { mode: 'community-reference', rng: noRng });
    expect(prepared).toMatchObject({ ok: false, blocker: { code: 'FINAL_PROVISION_POLICY_UNRESOLVED' }, campaign });
    const transition = transitionToNextFinalForm(prepared.campaign, { mode: 'community-reference', rng: noRng });
    expect(transition.ok).toBe(false); expect(transition.campaign).toEqual(campaign);
    expect(COMMUNITY_RUNTIME_BLOCKERS.some(blocker => blocker.code === 'FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED')).toBe(true);
  });
  it('P-victory-templars first defeat stays incomplete and both real defeats progress once', () => {
    const base = createCommunityGuardianScenario(1);
    const first = defeatWithHeroSkills(base, 'templars-impaler');
    expect(first.actFourState.templarsEncounterState!.actorStates.filter(actor => actor.isAlive)).toHaveLength(1);
    expect(commitBattleVictory(first).ok).toBe(false);
    const both = defeatWithHeroSkills(first, 'templars-warlord');
    const victory = commitBattleVictory(both);
    expect(victory.ok).toBe(true);
    expect(victory.campaign.actFourState.stage).toBe('guardian-victory');
    expect(victory.campaign.heroes.map(hero => hero.xp)).toEqual(base.heroes.map(hero => hero.xp + 3));
  });
  it('P-victory-mammoth Cyst defeat cleans linked Stalk and reaches Guardian progression', () => {
    const base = summon(); const stalk = targetId(base, 'white-cell-stalk');
    const dead = defeatWithHeroSkills(base, 'mammoth-cyst');
    expect(dead.battle!.monsters.find(unit => unit.id === stalk)).toMatchObject({ hp: 0, isAlive: false });
    expect(dead.actFourState.mammothCystEncounterState!.summonHistory[0].status).toBe('removed');
    expect(commitBattleVictory(dead).campaign.actFourState.stage).toBe('guardian-victory');
  });
  it('P-victory-shuffling Horror defeat clears reserves while deployed cleanup remains unproven', () => {
    const victory = win(0);
    expect(victory.actFourState.shufflingHorrorEncounterState!.actors.every(actor => !actor.alive)).toBe(true);
    expect(victory.actFourState.shufflingHorrorEncounterState!.initiativeDrawPile).toEqual([]);
    expect(COMMUNITY_RUNTIME_FIELD_COVERAGE.find(leaf => leaf.requirementId === 'tierB-shuffling-horror-room' && leaf.sourcePath === 'victoryCondition.remainingMonsters')?.blockerCode).toBe('SHUFFLING_LINKED_VICTORY_CLEANUP_ENGINE_UNSUPPORTED');
  });
});
