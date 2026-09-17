import { describe, expect, it } from 'vitest';
import { createCommunityCheckpoint, createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { activateDarkestDungeonContentSet, drawDarkestDungeonMonster } from '../../../game-engine/campaign/act-four/content-runtime';
import { drawDarkestDungeonQuest } from '../../../game-engine/campaign/act-four/draw-quest';
import { resolveExcavationSiteRoom } from '../../../game-engine/campaign/act-four/excavation-site';
import { prepareFinalEncounter } from '../../../game-engine/campaign/act-four/prepare-final-encounter';
import { returnCommunityPhysicalMonstersFromBattle } from '../../../game-engine/campaign/act-four/community-physical-monster-deck';
import { finalReady, reload, win } from './capability-test-support';

const chooseFood = () => 'food' as const;

describe('Community Act IV playable-closure save/replay', () => {
  it('SR-PC01 after Quest draw/provision reload does not reroll', () => {
    const first = drawDarkestDungeonQuest(createCommunityCheckpoint(), { mode: 'community-reference', rng: () => 0.2, chooseWildProvision: chooseFood });
    const restored = reload(first.campaign);
    const replay = drawDarkestDungeonQuest(restored, { mode: 'community-reference', rng: () => 0.99, chooseWildProvision: () => 'torch' });
    expect(replay.alreadyDrawn).toBe(true);
    expect(replay.record).toEqual(first.record);
    expect(replay.campaign.provisions).toEqual(first.campaign.provisions);
  });

  it('SR-PC02 after physical deck shuffle reload preserves identity order', () => {
    const quest = drawDarkestDungeonQuest(createCommunityCheckpoint(), { mode: 'community-reference', rng: () => 0.2, chooseWildProvision: chooseFood });
    const content = activateDarkestDungeonContentSet(quest.campaign, { mode: 'community-reference', seed: 44 });
    const restored = reload(content.campaign);
    expect(restored.actFourState.contentRuntime?.physicalMonsterDeck).toEqual(content.campaign.actFourState.contentRuntime?.physicalMonsterDeck);
  });

  it('SR-PC03 mid-dungeon excavation receipt survives reload', () => {
    const original = createCommunityGuardianScenario(2);
    const site = original.actFourState.excavationSiteStates[0];
    const campaign = { ...original, actFourState: { ...original.actFourState, excavationSiteStates: original.actFourState.excavationSiteStates.map((entry) => entry === site ? { ...entry, status: 'available' as const } : entry) } };
    const first = resolveExcavationSiteRoom(campaign, site.roomId, { mode: 'community-reference', rng: () => 0.4, chooseWild: chooseFood });
    const restored = reload(first.campaign);
    const replay = resolveExcavationSiteRoom(restored, site.roomId, { mode: 'community-reference', rng: () => 0.99, chooseWild: () => 'torch' });
    expect(replay.alreadyResolved).toBe(true);
    expect(replay.site?.communityProvision).toEqual(first.site?.communityProvision);
  });

  it('SR-PC04 before Guardian the physical deck order is unchanged by save', () => {
    const campaign = createCommunityGuardianScenario(1);
    expect(reload(campaign).actFourState.contentRuntime?.physicalMonsterDeck?.drawPile).toEqual(campaign.actFourState.contentRuntime?.physicalMonsterDeck?.drawPile);
  });

  it('SR-PC05 mid Guardian draw/return receipts survive reload', () => {
    const drawn = drawDarkestDungeonMonster(createCommunityGuardianScenario(0), () => 0);
    const restored = reload(drawn.campaign);
    expect(restored.actFourState.contentRuntime?.physicalMonsterDeck?.inBattle).toEqual(drawn.campaign.actFourState.contentRuntime?.physicalMonsterDeck?.inBattle);
    const returned = returnCommunityPhysicalMonstersFromBattle(restored, () => 0.11, 'sr-pc05');
    const replay = returnCommunityPhysicalMonstersFromBattle(reload(returned), () => { throw new Error('reshuffle'); }, 'sr-pc05');
    expect(replay.actFourState.contentRuntime?.physicalMonsterDeck).toEqual(returned.actFourState.contentRuntime?.physicalMonsterDeck);
  });

  it('SR-PC06 after Guardian victory reload preserves cleanup and deck return', () => {
    const victory = win(2);
    const restored = reload(victory);
    expect(restored.actFourState.stage).toBe(victory.actFourState.stage);
    expect(restored.actFourState.contentRuntime?.physicalMonsterDeck).toEqual(victory.actFourState.contentRuntime?.physicalMonsterDeck);
  });

  it('SR-PC07 after Final Provision reload does not reroll', () => {
    const prepared = prepareFinalEncounter(finalReady(), { mode: 'community-reference', rng: () => 0.3, chooseWild: chooseFood });
    const restored = reload(prepared.campaign);
    const replay = prepareFinalEncounter(restored, { mode: 'community-reference', rng: () => 0.99, chooseWild: () => 'torch' });
    expect(replay.alreadyPrepared).toBe(true);
    expect(replay.provisionRecord).toEqual(prepared.provisionRecord);
  });
});
