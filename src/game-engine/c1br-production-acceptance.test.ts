import { describe, expect, it } from 'vitest';
import type { CampaignState, HamletState, QuestDefinition } from '../types';
import type { TrinketDefinition } from '../types/trinkets';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import {
  COMMUNITY_RUNTIME_TRINKETS,
  COMMUNITY_SOURCE_TRINKETS,
  COMMUNITY_TRINKET_PRODUCTION_PROOFS,
  COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
  evaluateCommunityTrinketCapability,
} from '../data/community-reference/production-runtime';
import {
  filterCommunityQuestCandidates,
  filterCommunityTrinketCandidates,
  getQuestPool,
  getTrinketPool,
  runtimeContentContext,
} from '../data/content-selector';
import { STANDARD_QUESTS } from '../data/quests';
import { commitQuestSelection } from './commands/quest';
import { commitNomadWagonVisitError, ensureNomadWagonOffer } from './nomad-wagon';
import { createSaveSnapshot, migrateCampaignToV18, restoreSaveSnapshot } from './save';
import { officialTrinketPool } from '../data/trinkets/trinket-registry';
import { setRandomSource } from './random';

const ACCURACY = 'community-trinket-core-accuracy-stone';
const CRITICAL = 'community-trinket-core-critical-stone';
const PARTY = ['crusader', 'highwayman', 'vestal', 'plague-doctor'];

function source(id: string) {
  return COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === id)!;
}

function communityCampaign(): CampaignState {
  return applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), PARTY));
}

function candidateTrinket(contentSet: string): TrinketDefinition {
  return {
    ...COMMUNITY_RUNTIME_TRINKETS[0],
    id: `fixture-${contentSet}`,
    runtimeContentMetadata: {
      sourceDefinitionId: `source-${contentSet}`,
      contentSet: contentSet as 'core',
      region: null,
      sourceOrigin: 'community-complete-edition',
    },
  };
}

function candidateQuest(region: string, contentSet = 'core'): QuestDefinition {
  return {
    ...STANDARD_QUESTS[0],
    id: `fixture-${region}-${contentSet}`,
    runtimeContentMetadata: {
      sourceDefinitionId: `source-${region}-${contentSet}`,
      contentSet: contentSet as 'core',
      region: region as 'ruins',
      sourceOrigin: 'community-complete-edition',
    },
  };
}

function hamlet(): HamletState {
  return {
    visitId: 'c1br-hamlet', preparationDays: 2, currentDay: 1,
    caretakerBlockedBuildingId: null, occupiedBuildingIds: [], currentEventId: null,
    log: [], nextQuestProvisionBonus: 0,
  };
}

describe('C1B-R production promotion adversarial matrix', () => {
  it('PA-01 removing Accuracy adapter closes readiness', () => {
    const adapters = { ...COMMUNITY_TRINKET_RUNTIME_ADAPTERS };
    delete adapters[ACCURACY];
    expect(evaluateCommunityTrinketCapability(source(ACCURACY), adapters).productionStatus).toBe('ADAPTER_REQUIRED');
  });

  it('PA-02 removing Critical production proof closes readiness', () => {
    const proofs = { ...COMMUNITY_TRINKET_PRODUCTION_PROOFS };
    delete proofs[CRITICAL];
    expect(evaluateCommunityTrinketCapability(source(CRITICAL), COMMUNITY_TRINKET_RUNTIME_ADAPTERS, proofs).productionStatus).toBe('ADAPTER_REQUIRED');
  });

  it('PA-03 an arbitrary adapter without proof is not ready', () => {
    const damage = source('community-trinket-core-damage-stone');
    const adapters = {
      ...COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
      [damage.id]: { ...COMMUNITY_TRINKET_RUNTIME_ADAPTERS[ACCURACY], definitionId: damage.id },
    };
    expect(evaluateCommunityTrinketCapability(damage, adapters).productionStatus).not.toBe('PRODUCTION_READY');
  });

  it('PA-04 disabled contentSet is excluded', () => {
    expect(filterCommunityTrinketCandidates([candidateTrinket('color-of-madness')], {
      runtimeContentProfile: 'community-complete-edition', enabledContentSets: ['core'],
    })).toEqual([]);
  });

  it('PA-05 unknown contentSet fails closed', () => {
    expect(filterCommunityTrinketCandidates([candidateTrinket('unknown')], {
      runtimeContentProfile: 'community-complete-edition', enabledContentSets: ['core', 'color-of-madness'],
    })).toEqual([]);
  });

  it('PA-06 disabled and unknown quest regions fail closed', () => {
    const candidates = [candidateQuest('ruins'), candidateQuest('cove'), candidateQuest('unknown')];
    expect(filterCommunityQuestCandidates(candidates, {
      runtimeContentProfile: 'community-complete-edition', enabledContentSets: ['core'], enabledRegions: ['ruins'], campaignLevel: 1,
    }).map((entry) => entry.id)).toEqual(['fixture-ruins-core']);
  });

  it('PA-07 legacy profile keeps legacy pools', () => {
    const context = runtimeContentContext(createNewCampaign('legacy-prototype'));
    expect(getQuestPool(context)).toEqual(STANDARD_QUESTS);
    expect(getTrinketPool(context)).toEqual(officialTrinketPool());
  });

  it('PA-08 Community never falls back to legacy definitions', () => {
    const context = runtimeContentContext(communityCampaign());
    expect(getQuestPool(context)).toEqual([]);
    expect(getTrinketPool(context).map((entry) => entry.id).sort()).toEqual([ACCURACY, CRITICAL]);
    expect(getTrinketPool(context).some((entry) => entry.id === 'critical-stone')).toBe(false);
    expect(commitQuestSelection(communityCampaign(), STANDARD_QUESTS[0].id).error).toBe('quest-not-production-eligible');
  });

  it('PA-09 save/reload preserves Community selectors, quest state, and Trinket side', () => {
    const campaign = communityCampaign();
    const withState: CampaignState = {
      ...campaign,
      enabledContentSets: [], enabledRegions: ['ruins'],
      questRuntimeState: { definitionId: 'fixture-quest', counters: { cleared: 2 }, flags: { done: false }, selectedRoomIds: ['A'], setAsideRoomIds: ['B'] },
      heroes: campaign.heroes.map((hero, index) => index === 0 ? {
        ...hero,
        equippedTrinkets: [{ instanceId: 'c1br-critical', trinketId: CRITICAL, currentSide: 'negative', usedTurnId: 'turn-1', lastUsedEventId: 'event-1', acquiredAt: campaign.createdAt, acquiredQuestId: null, source: 'nomad-wagon', sourceEventId: 'c1br-buy' }],
      } : hero),
    };
    const restored = restoreSaveSnapshot(createSaveSnapshot(withState));
    expect(restored.runtimeContentProfile).toBe('community-complete-edition');
    expect(restored.enabledContentSets).toEqual([]);
    expect(restored.enabledRegions).toEqual(['ruins']);
    expect(restored.questRuntimeState).toEqual(withState.questRuntimeState);
    expect(restored.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
  });

  it('PA-10 generated Nomad offer survives snapshot replay without redraw', () => {
    let campaign = communityCampaign();
    campaign = { ...campaign, gamePhase: 'hamlet', hamlet: hamlet(), gold: 100 };
    setRandomSource(() => 0.9);
    try {
      const generated = ensureNomadWagonOffer(campaign);
      const restored = restoreSaveSnapshot(createSaveSnapshot(generated));
      const reopened = ensureNomadWagonOffer(restored);
      expect(reopened.nomadWagon.offeredTrinketIds).toEqual(generated.nomadWagon.offeredTrinketIds);
      expect(reopened.nomadWagon.offerTransactionId).toBe(generated.nomadWagon.offerTransactionId);
    } finally {
      setRandomSource(null);
    }
  });

  it('PA-11 Community IDs never alias to same-name legacy IDs and unknown offers fail closed', () => {
    const campaign = { ...communityCampaign(), gamePhase: 'hamlet' as const, hamlet: hamlet(), gold: 100 };
    const offered: CampaignState = { ...campaign, nomadWagon: { ...campaign.nomadWagon, offerGenerated: true, offeredTrinketIds: [CRITICAL, 'community-trinket-nonexistent'] } };
    expect(offered.nomadWagon.offeredTrinketIds[0]).toBe(CRITICAL);
    expect(commitNomadWagonVisitError(offered, { heroId: offered.heroes[0].instanceId, buyTrinketId: 'community-trinket-nonexistent' })).toBe('要购买的饰品定义缺失');
  });

  it('PA-12 deleting E2E or production metadata closes readiness', () => {
    for (const key of ['e2eTests', 'productionTests', 'saveReplayTests', 'selectorTests'] as const) {
      const proof = { ...COMMUNITY_TRINKET_PRODUCTION_PROOFS[ACCURACY], [key]: [] };
      const proofs = { ...COMMUNITY_TRINKET_PRODUCTION_PROOFS, [ACCURACY]: proof };
      expect(evaluateCommunityTrinketCapability(source(ACCURACY), COMMUNITY_TRINKET_RUNTIME_ADAPTERS, proofs).productionStatus).toBe('ADAPTER_REQUIRED');
    }
  });
});

describe('C1B-R save migration safety', () => {
  it('filters invalid values, fails unknown profile safe, preserves empty arrays, and rejects invalid quest state', () => {
    const raw = communityCampaign() as unknown as Record<string, unknown>;
    raw.runtimeContentProfile = 'future-profile';
    raw.enabledContentSets = ['core', 'fake-expansion'];
    raw.enabledRegions = ['ruins', 'fake-region'];
    raw.questRuntimeState = { definitionId: 'x', counters: { bad: 'not-number' }, flags: {}, selectedRoomIds: [], setAsideRoomIds: [] };
    const migrated = migrateCampaignToV18(raw as unknown as CampaignState);
    expect(migrated.runtimeContentProfile).toBe('legacy-prototype');
    expect(migrated.enabledContentSets).toEqual(['core']);
    expect(migrated.enabledRegions).toEqual(['ruins']);
    expect(migrated.questRuntimeState).toBeNull();
    expect(migrateCampaignToV18({ ...raw, enabledContentSets: [], enabledRegions: [] } as unknown as CampaignState).enabledContentSets).toEqual([]);
  });
});
