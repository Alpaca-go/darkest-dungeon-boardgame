import { describe, expect, it } from 'vitest';
import { createCommunityCheckpoint, createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { activateDarkestDungeonContentSet, drawDarkestDungeonMonster } from '../../../game-engine/campaign/act-four/content-runtime';
import { drawDarkestDungeonQuest } from '../../../game-engine/campaign/act-four/draw-quest';
import { resolveExcavationSiteRoom } from '../../../game-engine/campaign/act-four/excavation-site';
import { prepareFinalEncounter } from '../../../game-engine/campaign/act-four/prepare-final-encounter';
import { finalReady, reload } from './capability-test-support';
import { COMMUNITY_ROOM10_STANCE_AREAS } from './community-source-geometry';
import { COMMUNITY_MONSTER_DRAW_SEMANTIC } from './source-supplement-runtime';
import { COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT } from './source-resolution';
import { COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';
import { setupFinalFormRuntime } from '../../../game-engine/campaign/act-four/final-forms/final-form-runtime';
import { rollFinalFormAncestorTeleport } from '../../../game-engine/campaign/act-four/final-forms/final-form-actions';
import { getAncestorSecondFormInitiativeActorCount, isAbsoluteNothingnessTargetable } from '../../../game-engine/campaign/act-four/final-forms/ancestor-second-form';
import { returnCommunityPhysicalMonstersFromBattle, COMMUNITY_PHYSICAL_MONSTER_DECK_SIZE, drawCommunityMonster } from '../../../game-engine/campaign/act-four/community-physical-monster-deck';

const chooseFood = () => 'food' as const;

describe('Community Act IV playable-closure production', () => {
  it('PC01 historical supplement remains unauthorized while adapter consumes it', () => {
    expect(COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT.runtimeConsumptionAuthorized).toBe(false);
    expect(COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT.historicalEvidenceMutation).toBe(false);
  });

  it('PC02 Final Provision commits two dice per living Hero with Wild choice and cap 16', () => {
    const prepared = prepareFinalEncounter(finalReady(), { mode: 'community-reference', rng: () => 0.99, chooseWild: () => 'torch' });
    expect(prepared.ok).toBe(true);
    expect(prepared.provisionRecord?.communityProvision?.dice).toHaveLength(8);
    expect(prepared.provisionRecord?.communityProvision?.dice.every((die) => die.rolledFace === 'wild' && die.selectedFace === 'torch')).toBe(true);
    expect(Object.values(prepared.campaign.provisions).reduce((sum, count) => sum + count, 0)).toBeLessThanOrEqual(16);
  });

  it('PC03 missing Wild chooser does not mutate Final Provision', () => {
    const campaign = finalReady();
    const before = structuredClone(campaign);
    const result = prepareFinalEncounter(campaign, { mode: 'community-reference', rng: () => 0 });
    expect(result.ok).toBe(false);
    expect(result.campaign).toEqual(before);
  });

  it('PC04 physical Monster deck shuffles 26 identities at Act IV setup', () => {
    const quest = drawDarkestDungeonQuest(createCommunityCheckpoint(), { mode: 'community-reference', rng: () => 0.1, chooseWildProvision: chooseFood });
    const content = activateDarkestDungeonContentSet(quest.campaign, { mode: 'community-reference', rng: () => 0.42 });
    const deck = content.campaign.actFourState.contentRuntime?.physicalMonsterDeck;
    expect(deck?.instanceIds).toHaveLength(COMMUNITY_PHYSICAL_MONSTER_DECK_SIZE);
    expect(new Set(deck?.instanceIds).size).toBe(26);
    expect(deck?.drawPile).toHaveLength(26);
    expect(deck?.shuffleReceipt.order).toEqual(deck?.drawPile);
    expect(COMMUNITY_MONSTER_DRAW_SEMANTIC.uniformLogicalIdentity).toBe(false);
  });

  it('PC05 top-card draw preserves physical identity and is not 9-logical uniform', () => {
    const campaign = createCommunityGuardianScenario(0);
    const deck = campaign.actFourState.contentRuntime!.physicalMonsterDeck!;
    const top = deck.drawPile[0];
    const result = drawDarkestDungeonMonster(campaign, () => 0.99);
    expect(result.ok).toBe(true);
    expect(result.campaign.actFourState.contentRuntime!.physicalMonsterDeck!.inBattle).toEqual([top]);
    expect(result.monsterDefinitionId).toBe(deck.instanceToDefinitionId[top]);
  });

  it('PC05b ordinary fill places four Front/Back monsters into distinct Stance slots', () => {
    const campaign = createCommunityGuardianScenario(0);
    const filled = drawCommunityMonster(campaign, 'pc05b-fill');
    expect(filled.ok).toBe(true);
    expect(filled.placements.map((item) => item.stance).sort()).toEqual(['aggressive', 'defensive', 'ranged', 'support']);
    expect(filled.placements.every((item) => item.placementSide === 'front' || item.placementSide === 'back')).toBe(true);
    const replay = drawCommunityMonster(filled.campaign, 'pc05b-fill');
    expect(replay.placements).toEqual(filled.placements);
    expect(replay.campaign.actFourState.contentRuntime!.physicalMonsterDeck!.drawPile).toEqual(
      filled.campaign.actFourState.contentRuntime!.physicalMonsterDeck!.drawPile,
    );
  });

  it('PC06 used cards shuffle back at Battle End', () => {
    const drawn = drawDarkestDungeonMonster(createCommunityGuardianScenario(0), () => 0);
    const returned = returnCommunityPhysicalMonstersFromBattle(drawn.campaign, () => 0.3, 'pc06-return');
    const deck = returned.actFourState.contentRuntime!.physicalMonsterDeck!;
    expect(deck.inBattle).toEqual([]);
    expect(deck.drawPile).toHaveLength(26);
    expect(deck.returnHistory[0]?.returnedInstanceIds).toHaveLength(1);
    const replay = returnCommunityPhysicalMonstersFromBattle(returned, () => { throw new Error('reshuffle'); }, 'pc06-return');
    expect(replay.actFourState.contentRuntime!.physicalMonsterDeck).toEqual(deck);
  });

  it('PC07 Horror deploys Aggressive r10-S with Priest and Growth in reserve', () => {
    const state = createCommunityGuardianScenario(0).actFourState.shufflingHorrorEncounterState!;
    const horror = state.actors.find((actor) => actor.role === 'horror')!;
    expect(horror.areaId).toBe(COMMUNITY_ROOM10_STANCE_AREAS.monster.aggressive);
    expect(horror.stances).toEqual(['aggressive']);
    expect(state.actors.filter((actor) => actor.role !== 'horror').every((actor) => actor.inReserve && actor.areaId === null)).toBe(true);
    expect(state.heroStanceAssignments.filter((hero) => hero.stance === 'aggressive').every((hero) => hero.areaId === COMMUNITY_ROOM10_STANCE_AREAS.hero.aggressive)).toBe(true);
  });

  it('PC08 Excavation uses a separate transaction and then opens free Rest', () => {
    const original = createCommunityGuardianScenario(2);
    const site = original.actFourState.excavationSiteStates[0];
    const campaign = { ...original, actFourState: { ...original.actFourState, excavationSiteStates: original.actFourState.excavationSiteStates.map((entry) => entry === site ? { ...entry, status: 'available' as const } : entry) } };
    const result = resolveExcavationSiteRoom(campaign, site.roomId, { mode: 'community-reference', rng: () => 0, chooseWild: chooseFood });
    expect(result.ok).toBe(true);
    expect(result.site?.provisionRollTransactionId).toContain('excavation-provision');
    expect(result.site?.provisionRollTransactionId).not.toContain('final-encounter-prepare');
    expect(result.site?.restSession?.consumeFirewood).toBe(false);
    expect(result.site?.restSession?.restingPoints).toBe(8);
    expect(result.site?.communityProvision?.dice).toHaveLength(campaign.heroes.filter((hero) => hero.isAlive !== false && !hero.dead).length);
  });

  it('PC09 Absolute Nothingness occupants are untargetable non-actors', () => {
    const setup = setupFinalFormRuntime(null, 'pc09', 'ancestor-second-form', { mode: 'community-reference', rng: () => 0 });
    expect(setup.ok).toBe(true);
    const runtime = setup.runtime;
    expect(runtime?.kind).toBe('ancestor-second-form');
    if (runtime?.kind === 'ancestor-second-form') {
      expect(runtime.nothingness).toHaveLength(3);
      expect(runtime.nothingness.every((item) => item.stanceTrackerStance === null && item.targetable === false && item.occupiesAreaSpace)).toBe(true);
    }
    expect(isAbsoluteNothingnessTargetable()).toBe(false);
    expect(getAncestorSecondFormInitiativeActorCount()).toBe(1);
    const campaign = { ...createCommunityCheckpoint(), actFourState: { ...createCommunityCheckpoint().actFourState, finalFormRuntimeState: setup.state } };
    expect(rollFinalFormAncestorTeleport(campaign, 1, { mode: 'community-reference', rng: () => 0 }).ok).toBe(true);
  });

  it('PC10 save/replay preserves physical deck order after Quest and shuffle', () => {
    const quest = drawDarkestDungeonQuest(createCommunityCheckpoint(), { mode: 'community-reference', rng: () => 0.2, chooseWildProvision: chooseFood });
    const content = activateDarkestDungeonContentSet(quest.campaign, { mode: 'community-reference', seed: 22 });
    const restored = reload(content.campaign);
    expect(restored.actFourState.contentRuntime?.physicalMonsterDeck).toEqual(content.campaign.actFourState.contentRuntime?.physicalMonsterDeck);
  });

  it('PC11 remaining source blockers stay explicit', () => {
    const remaining = ['TEMPLARS_PIT_EXIT_RULE_UNRESOLVED', 'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED', 'COME_UNTO_YOUR_MAKER_UNRESOLVED'];
    expect(remaining.every((code) => COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === code))).toBe(true);
    expect(COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === 'MONSTER_CARD_FRONT_BACK_SIZE_UNRESOLVED')).toBe(false);
  });
});
