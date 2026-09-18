import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCommunityCheckpoint, createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { activateDarkestDungeonContentSet, drawDarkestDungeonMonster } from '../../../game-engine/campaign/act-four/content-runtime';
import { drawDarkestDungeonQuest } from '../../../game-engine/campaign/act-four/draw-quest';
import { resolveExcavationSiteRoom } from '../../../game-engine/campaign/act-four/excavation-site';
import { prepareFinalEncounter } from '../../../game-engine/campaign/act-four/prepare-final-encounter';
import { returnCommunityPhysicalMonstersFromBattle } from '../../../game-engine/campaign/act-four/community-physical-monster-deck';
import { resolveEchoingDisassembly } from '../../../game-engine/bosses/shuffling-horror/echoing-disassembly-summon';
import { getMissingSummonRoles } from '../../../game-engine/bosses/shuffling-horror/shuffling-horror-runtime';
import { setupFinalFormRuntime } from '../../../game-engine/campaign/act-four/final-forms/final-form-runtime';
import { isAbsoluteNothingnessTargetable, getAncestorSecondFormInitiativeActorCount } from '../../../game-engine/campaign/act-four/final-forms/ancestor-second-form';
import { performFinalFormComeUntoYourMaker } from '../../../game-engine/campaign/act-four/final-forms/final-form-actions';
import { win, finalReady, reload } from './capability-test-support';
import { COMMUNITY_REFERENCE_RUNTIME_PROFILE, COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';
import { COMMUNITY_MONSTER_DRAW_SEMANTIC } from './source-supplement-runtime';
import { COMMUNITY_SOURCE_BLOCKER_RESOLUTION, COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT } from './source-resolution';

const chooseFood = () => 'food' as const;
const routeFile = readFileSync('src/data/darkest-dungeon/community-reference/community-act4-route-matrix.test.ts', 'utf8');
const productionFile = readFileSync('src/data/darkest-dungeon/community-reference/community-act4-playable-closure.test.ts', 'utf8');

describe('Community Act IV playable-closure adversarial', () => {
  it('P01 Final Provision rerolls after reload -> FAIL', () => {
    const first = prepareFinalEncounter(finalReady(), { mode: 'community-reference', rng: () => 0, chooseWild: chooseFood });
    const restored = reload(first.campaign);
    const replay = prepareFinalEncounter(restored, { mode: 'community-reference', rng: () => 0.99, chooseWild: () => 'torch' });
    expect(replay.alreadyPrepared).toBe(true);
    expect(replay.provisionRecord).toEqual(first.provisionRecord);
  });

  it('P02 Final Provision pool >16 -> FAIL', () => {
    const prepared = prepareFinalEncounter(finalReady(), { mode: 'community-reference', rng: () => 0, chooseWild: chooseFood });
    expect(Object.values(prepared.campaign.provisions).reduce((sum, count) => sum + count, 0)).toBeLessThanOrEqual(16);
    expect(prepared.provisionRecord?.communityProvision?.poolMaximum).toBe(16);
  });

  it('P03 DD Monster deck selects uniformly among 9 logical IDs -> FAIL', () => {
    const campaign = createCommunityGuardianScenario(0);
    const first = drawDarkestDungeonMonster(campaign, () => 0);
    const second = drawDarkestDungeonMonster(first.campaign, () => 0);
    expect(first.campaign.actFourState.contentRuntime!.physicalMonsterDeck!.inBattle).toHaveLength(1);
    expect(second.campaign.actFourState.contentRuntime!.physicalMonsterDeck!.inBattle).toHaveLength(2);
    expect(COMMUNITY_MONSTER_DRAW_SEMANTIC.uniformLogicalIdentity).toBe(false);
    expect(new Set(COMMUNITY_REFERENCE_RUNTIME_PROFILE.monsterComposition.map((item) => item.id)).size).toBe(9);
  });

  it('P04 DeckIDs order used as runtime draw order -> FAIL', () => {
    expect(COMMUNITY_MONSTER_DRAW_SEMANTIC.savedDeckIdsArePolicy).toBe(false);
  });

  it('P05 duplicate physical Monster identity lost -> FAIL', () => {
    const ids = createCommunityGuardianScenario(0).actFourState.contentRuntime!.physicalMonsterDeck!.instanceIds;
    expect(ids).toHaveLength(26);
    expect(new Set(ids).size).toBe(26);
  });

  it('P06 used Monster cards not returned/shuffled -> FAIL', () => {
    const drawn = drawDarkestDungeonMonster(createCommunityGuardianScenario(0), () => 0);
    const returned = returnCommunityPhysicalMonstersFromBattle(drawn.campaign, () => 0.2, 'p06');
    expect(returned.actFourState.contentRuntime!.physicalMonsterDeck!.drawPile).toHaveLength(26);
    expect(returned.actFourState.contentRuntime!.physicalMonsterDeck!.inBattle).toEqual([]);
  });

  it('P07 Excavation entry grants twice -> FAIL', () => {
    const original = createCommunityGuardianScenario(0);
    const site = original.actFourState.excavationSiteStates[0];
    const campaign = { ...original, actFourState: { ...original.actFourState, excavationSiteStates: original.actFourState.excavationSiteStates.map((entry) => entry === site ? { ...entry, status: 'available' as const } : entry) } };
    const first = resolveExcavationSiteRoom(campaign, site.roomId, { mode: 'community-reference', rng: () => 0, chooseWild: chooseFood });
    const second = resolveExcavationSiteRoom(first.campaign, site.roomId, { mode: 'community-reference', rng: () => 0.99, chooseWild: () => 'torch' });
    expect(second.alreadyResolved).toBe(true);
    expect(second.campaign.provisions).toEqual(first.campaign.provisions);
  });

  it('P08 Priest/Growth pre-spawned during Shuffling setup -> FAIL', () => {
    const actors = createCommunityGuardianScenario(0).actFourState.shufflingHorrorEncounterState!.actors;
    expect(actors.filter((actor) => actor.role !== 'horror').every((actor) => actor.inReserve && actor.areaId === null)).toBe(true);
  });

  it('P09 Echoing Disassembly deploys Growth before Priest -> FAIL', () => {
    const state = createCommunityGuardianScenario(0).actFourState.shufflingHorrorEncounterState!;
    expect(getMissingSummonRoles(state)).toEqual(['cultist-priest', 'malignant-growth']);
    const echoing = resolveEchoingDisassembly(state, 'p09');
    expect(echoing.ok).toBe(true);
    expect(echoing.summonedRoles).toEqual(['cultist-priest', 'malignant-growth']);
    expect(echoing.state.actors.find((actor) => actor.role === 'cultist-priest')?.inReserve).toBe(false);
  });

  it('P10 deployed Shuffling linked actor survives victory cleanup -> FAIL', () => {
    const victory = win(0);
    expect(victory.actFourState.shufflingHorrorEncounterState!.actors.every((actor) => !actor.alive)).toBe(true);
    expect(victory.battle!.monsters.filter((unit) => unit.sourceId.startsWith('community-dd-')).every((unit) => !unit.isAlive)).toBe(true);
    expect(COMMUNITY_RUNTIME_BLOCKERS.map((blocker) => blocker.code)).not.toContain('SHUFFLING_LINKED_VICTORY_CLEANUP_ENGINE_UNSUPPORTED');
  });

  it('P11 Nothingness receives Initiative/turn -> FAIL', () => {
    const setup = setupFinalFormRuntime(null, 'p11', 'ancestor-second-form', { mode: 'community-reference', rng: () => 0 });
    expect(setup.runtime?.kind).toBe('ancestor-second-form');
    expect(getAncestorSecondFormInitiativeActorCount()).toBe(1);
    if (setup.runtime?.kind === 'ancestor-second-form') {
      expect(setup.runtime.nothingness.every((item) => item.stanceTrackerStance === null)).toBe(true);
      expect(setup.runtime.initiativeCardCount).toBe(2);
    }
  });

  it('P12 Nothingness becomes targetable -> FAIL', () => {
    const setup = setupFinalFormRuntime(null, 'p12', 'ancestor-second-form', { mode: 'community-reference', rng: () => 0 });
    expect(isAbsoluteNothingnessTargetable()).toBe(false);
    if (setup.runtime?.kind === 'ancestor-second-form') {
      expect(setup.runtime.nothingness.every((item) => item.targetable === false)).toBe(true);
    }
  });

  it('P13 Final state injected to prove transition -> FAIL', () => {
    expect(routeFile).not.toContain('FinalScenario');
    expect(productionFile).not.toContain('FinalScenario');
    expect(prepareFinalEncounter(createCommunityCheckpoint(), { mode: 'community-reference', rng: () => 0, chooseWild: chooseFood }).ok).toBe(false);
  });

  it('P14 Gestating lethal ordering guessed -> FAIL', () => {
    const semantic = COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT.semantics.find((item) => item.blockerCode === 'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED');
    expect(semantic?.resolvedValue).toMatchObject({ lethalOrdering: null });
  });

  it('P15 Templar Pit exit guessed -> FAIL', () => {
    expect(COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED')).toBe(true);
    expect(JSON.stringify(COMMUNITY_SOURCE_BLOCKER_RESOLUTION.targets.find((item) => item.blockerCode === 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED')?.resolvedValue)).not.toMatch(/generic movement/i);
  });

  it('P16 Room 9 adjacency traced from artwork and promoted -> FAIL', () => {
    expect(COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === 'TEMPLARS_AREA_ADJACENCY_UNRESOLVED')).toBe(true);
    expect(COMMUNITY_SOURCE_BLOCKER_RESOLUTION.targets.find((item) => item.blockerCode === 'TEMPLARS_AREA_ADJACENCY_UNRESOLVED')?.resolvedValue).toMatchObject({ adjacencyGraph: null });
  });

  it('P17 Come Unto Your Maker videogame behavior used -> FAIL', () => {
    const campaign = createCommunityCheckpoint();
    const setup = setupFinalFormRuntime(null, 'p17', 'heart-of-darkness', { mode: 'community-reference', rng: () => 0 });
    const withForm = { ...campaign, actFourState: { ...campaign.actFourState, finalFormRuntimeState: setup.state } };
    expect(performFinalFormComeUntoYourMaker(withForm, { mode: 'community-reference' })).toMatchObject({ blocker: { code: 'COME_UNTO_YOUR_MAKER_UNRESOLVED' } });
    expect(COMMUNITY_SOURCE_BLOCKER_RESOLUTION.targets.find((item) => item.blockerCode === 'COME_UNTO_YOUR_MAKER_UNRESOLVED')?.resolvedValue).toBeNull();
  });

  it('P18 one golden route sets FULL playable true -> FAIL', () => {
    expect(COMMUNITY_REFERENCE_RUNTIME_PROFILE.capabilities.fullActFourPlayable).toBe(false);
  });

  it('P19 save/reload changes physical Monster deck order -> FAIL', () => {
    const quest = drawDarkestDungeonQuest(createCommunityCheckpoint(), { mode: 'community-reference', rng: () => 0.2, chooseWildProvision: chooseFood });
    const content = activateDarkestDungeonContentSet(quest.campaign, { mode: 'community-reference', seed: 19 });
    expect(reload(content.campaign).actFourState.contentRuntime?.physicalMonsterDeck?.drawPile).toEqual(content.campaign.actFourState.contentRuntime?.physicalMonsterDeck?.drawPile);
  });

  it('P20 route matrix hides a reachable blocker -> FAIL', () => {
    expect(COMMUNITY_REFERENCE_RUNTIME_PROFILE.runtimeBlockers.length).toBeGreaterThan(0);
    expect(routeFile).toContain('TEMPLARS_PIT_EXIT_RULE_UNRESOLVED');
    expect(routeFile).toContain('TEMPLARS_AREA_ADJACENCY_UNRESOLVED');
  });
});
