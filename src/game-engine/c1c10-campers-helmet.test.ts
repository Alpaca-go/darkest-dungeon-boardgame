import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import { CAMPERS_HELMET_ID, PRODUCTION_PROOF_REGISTRY } from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { COMMUNITY_QUEST_RUNTIME_ADAPTERS } from '../data/community-reference/production-runtime';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { generateDungeon } from './dungeon';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { createQuestRuntimeState, type RestAllocation } from './quests/quest-runtime';
import {
  beginCampTrinketAction,
  beginScoutTrinketAction,
  chooseDungeonProvisionWild,
  resolveDungeonTrinketOpportunity,
} from './trinkets/dungeon-trinket-bridge';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';

const QUEST_ID = 'community-quest-ruins-lvl1-scout-ahead';
const proof = (id: string) => {
  const entry = PRODUCTION_PROOF_REGISTRY[id];
  if (!entry) throw new Error(`Missing proof ${id}`);
  return entry;
};

function fixture(side: 'positive' | 'negative'): CampaignState {
  const base = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  const quest = COMMUNITY_QUEST_RUNTIME_ADAPTERS[QUEST_ID].definition;
  const dungeon = generateDungeon(QUEST_ID);
  let campaign: CampaignState = {
    ...base, currentQuestId: QUEST_ID, questStatus: 'active', gamePhase: 'dungeon-explore',
    dungeon: { ...dungeon, rooms: dungeon.rooms.map((room) => room.id === dungeon.currentRoomId
      ? { ...room, status: 'cleared' as const } : room) },
    questRuntimeState: createQuestRuntimeState(quest),
    heroes: base.heroes.map((hero, index) => index < 2 ? { ...hero, wounds: 4, stress: 4 } : hero),
  };
  campaign = acquireTrinket(campaign, {
    trinketId: CAMPERS_HELMET_ID, source: 'debug', sourceEventId: `campers-${side}`,
    heroId: campaign.heroes[0].instanceId,
  }).campaign;
  if (side === 'negative') campaign = {
    ...campaign,
    heroes: campaign.heroes.map((hero, index) => index === 0 ? {
      ...hero, equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: side })),
    } : hero),
  };
  return campaign;
}

function restAllocation(campaign: CampaignState): RestAllocation {
  return { allocations: [
    { heroId: campaign.heroes[0].instanceId, resource: 'life', points: 4 },
    { heroId: campaign.heroes[1].instanceId, resource: 'stress', points: 4 },
  ] };
}

describe("C1C-10 Camper's Helmet dungeon runtime", () => {
  productionProofTest(proof('C1C10-CAMPERS-CAMPING-RUNTIME'), () => {
    const campaign = fixture('positive');
    const begun = beginCampTrinketAction(campaign, restAllocation(campaign));
    expect(begun.paused).toBe(true);
    expect(begun.campaign.pendingDungeonTrinketAction).toMatchObject({ kind: 'camp', stage: 'trinket-window' });
    const opportunity = begun.campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    const rolled = resolveDungeonTrinketOpportunity(begun.campaign, opportunity.id, 'use', () => 0.99).campaign;
    expect(rolled.pendingDungeonTrinketAction).toMatchObject({ kind: 'camp', stage: 'provision-choice' });
    expect(rolled.pendingDungeonTrinketAction?.pendingProvisionDice).toEqual([
      { index: 0, roll: 6, rolledFace: 'wild', selectedFace: null },
      { index: 1, roll: 6, rolledFace: 'wild', selectedFace: null },
    ]);
    expect(rolled.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
    const one = chooseDungeonProvisionWild(rolled, 0, 'food').campaign;
    const completed = chooseDungeonProvisionWild(one, 1, 'torch').campaign;
    expect(completed.pendingDungeonTrinketAction).toBeNull();
    expect(completed.provisions.food).toBe(campaign.provisions.food + 1);
    expect(completed.provisions.torch).toBe(campaign.provisions.torch + 1);
    expect(completed.questRuntimeState).toMatchObject({ firewoodTokensRemaining: 0, restingPointsRemaining: 0 });
    expect(completed.heroes[0].wounds).toBe(0);
    expect(completed.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
  });

  productionProofTest(proof('C1C10-CAMPERS-SCOUT-RUNTIME'), () => {
    const campaign = fixture('negative');
    const begun = beginScoutTrinketAction(campaign);
    const opportunity = begun.campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    const completed = resolveDungeonTrinketOpportunity(begun.campaign, opportunity.id, 'use').campaign;
    expect(completed.pendingDungeonTrinketAction).toBeNull();
    expect(completed.heroes[0].stress).toBe(campaign.heroes[0].stress + 2);
    expect(completed.heroes[1].stress).toBe(campaign.heroes[1].stress + 1);
    expect(completed.dungeon?.scoutedNextMove).toBe(true);
    expect(completed.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
  });

  productionProofTest(proof('C1C10-CAMPERS-SAVE-REPLAY'), () => {
    const campaign = fixture('positive');
    const begun = beginCampTrinketAction(campaign, restAllocation(campaign)).campaign;
    const frozen = restoreSaveSnapshot(createSaveSnapshot(begun));
    expect(frozen.pendingDungeonTrinketAction).toEqual(begun.pendingDungeonTrinketAction);
    expect(frozen.questRuntimeState?.firewoodTokensRemaining).toBe(1);
    const opportunity = begun.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    const rolled = resolveDungeonTrinketOpportunity(begun, opportunity.id, 'use', () => 0.99).campaign;
    const replay = restoreSaveSnapshot(createSaveSnapshot(rolled));
    expect(replay.pendingDungeonTrinketAction).toEqual(rolled.pendingDungeonTrinketAction);
    const one = chooseDungeonProvisionWild(replay, 0, 'bandage').campaign;
    const completed = chooseDungeonProvisionWild(one, 1, 'potion').campaign;
    const stale = chooseDungeonProvisionWild(completed, 1, 'tool');
    expect(stale.error).toBeTruthy();
    expect(stale.campaign).toBe(completed);
    expect(completed.provisions.bandage).toBe(campaign.provisions.bandage + 1);
    expect(completed.provisions.potion).toBe(campaign.provisions.potion + 1);

    const scoutBase = fixture('negative');
    const scoutOpen = beginScoutTrinketAction(scoutBase).campaign;
    const scoutReplay = restoreSaveSnapshot(createSaveSnapshot(scoutOpen));
    expect(scoutReplay.pendingDungeonTrinketAction?.rootEventId).toBe(scoutOpen.pendingDungeonTrinketAction?.rootEventId);
    expect(scoutReplay.dungeon?.scoutedNextMove).toBe(false);
    expect(scoutReplay.heroes.map((hero) => hero.stress)).toEqual(scoutBase.heroes.map((hero) => hero.stress));
    const scoutOpportunity = scoutReplay.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    const scouted = resolveDungeonTrinketOpportunity(scoutReplay, scoutOpportunity.id, 'use').campaign;
    const scoutedReplay = restoreSaveSnapshot(createSaveSnapshot(scouted));
    expect(scoutedReplay).toEqual(scouted);
    expect(scoutedReplay.pendingDungeonTrinketAction).toBeNull();
  });

  it('opens one Scout opportunity per alive equipped owner under one root event', () => {
    let campaign = fixture('negative');
    campaign = acquireTrinket(campaign, {
      trinketId: CAMPERS_HELMET_ID, source: 'debug', sourceEventId: 'campers-second',
      heroId: campaign.heroes[1].instanceId,
    }).campaign;
    campaign = { ...campaign, heroes: campaign.heroes.map((hero, index) => index === 1 ? {
      ...hero, equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: 'negative' as const })),
    } : hero) };
    const opened = beginScoutTrinketAction(campaign).campaign;
    const opportunities = opened.pendingTrinketUseOpportunities.filter((entry) => entry.status === 'open');
    expect(opportunities).toHaveLength(2);
    expect(new Set(opportunities.map((entry) => entry.rootEventId)).size).toBe(1);
    const one = resolveDungeonTrinketOpportunity(opened, opportunities[0].id, 'decline').campaign;
    expect(one.dungeon?.scoutedNextMove).toBe(false);
    const done = resolveDungeonTrinketOpportunity(one, opportunities[1].id, 'decline').campaign;
    expect(done.dungeon?.scoutedNextMove).toBe(true);
  });

  it('drops a restored pending action whose original Scout is no longer legal', () => {
    const opened = beginScoutTrinketAction(fixture('negative')).campaign;
    const invalid = { ...opened, dungeon: { ...opened.dungeon!, rooms: opened.dungeon!.rooms.map((room) => ({ ...room, status: 'revealed' as const })) } };
    const restored = restoreSaveSnapshot(createSaveSnapshot(invalid));
    expect(restored.pendingDungeonTrinketAction).toBeNull();
    expect(restored.pendingTrinketUseOpportunities).toHaveLength(0);

    const changedQuest = restoreSaveSnapshot(createSaveSnapshot({ ...opened, currentQuestId: 'different-quest' }));
    expect(changedQuest.pendingDungeonTrinketAction).toBeNull();
    expect(changedQuest.pendingTrinketUseOpportunities).toHaveLength(0);
  });
});
