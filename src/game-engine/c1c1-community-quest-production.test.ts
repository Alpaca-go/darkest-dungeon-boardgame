import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import { C1C1_CORE_QUEST_IDS, PRODUCTION_PROOF_REGISTRY } from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_PRODUCTION_PROOFS,
  COMMUNITY_QUEST_RUNTIME_ADAPTERS,
  COMMUNITY_RUNTIME_QUESTS,
  evaluateCommunityQuestCapability,
  type CommunityProductionProof,
} from '../data/community-reference/production-runtime';
import questData from '../data/community-reference/quests/data.json' with { type: 'json' };
import { filterCommunityQuestCandidates, getQuestPool, runtimeContentContext } from '../data/content-selector';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { generateDungeon } from './dungeon';
import { createQuestRuntimeState, recordQuestQualificationEvent } from './quests/quest-runtime';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { finishQuest } from './quest-result';

function registration(proofId: string) {
  const found = PRODUCTION_PROOF_REGISTRY[proofId];
  if (!found) throw new Error(`Missing proof registration: ${proofId}`);
  return found;
}

function source(id: string) {
  const found = questData.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing source Quest: ${id}`);
  return found;
}

function tokenCounts(questId: string) {
  const counts: Record<string, number> = {};
  for (const room of generateDungeon(questId, 'proof-seed').rooms) {
    if (room.sourceRoomToken) counts[room.sourceRoomToken] = (counts[room.sourceRoomToken] ?? 0) + 1;
  }
  return counts;
}

function campaignFor(questId: string): CampaignState {
  let campaign = applyDefaultLoadout(selectParty(
    createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor'],
  ));
  const quest = COMMUNITY_QUEST_RUNTIME_ADAPTERS[questId].definition;
  return {
    ...campaign,
    currentQuestId: questId,
    questStatus: 'active' as const,
    gamePhase: 'dungeon-explore' as const,
    dungeon: generateDungeon(questId, 'proof-seed'),
    questRuntimeState: createQuestRuntimeState(quest),
  };
}

describe('C1C-1 executable Community Quest production proofs', () => {
  productionProofTest(registration('C1C1-QUEST-RUNTIME'), () => {
    expect(COMMUNITY_RUNTIME_QUESTS.map((quest) => quest.id)).toEqual([
      'community-quest-warrens-lvl1-explore-the-sewers',
      'community-quest-warrens-lvl2-mapping-the-sewers',
    ]);
    for (const definitionId of C1C1_CORE_QUEST_IDS) {
      const adapter = COMMUNITY_QUEST_RUNTIME_ADAPTERS[definitionId];
      const semantic = source(definitionId);
      expect(adapter.definition.id).toBe(definitionId);
      expect(adapter.definition.runtimeContentMetadata?.sourceDefinitionId).toBe(definitionId);
      expect(adapter.definition.xpUnit?.minimumQuestGoal).toBeNull();
      expect(tokenCounts(definitionId)).toEqual(semantic.dungeonStructure.roomTokens);
      const first = generateDungeon(definitionId, 'same-seed').rooms.map((room) => room.sourceRoomToken);
      const replay = generateDungeon(definitionId, 'same-seed').rooms.map((room) => room.sourceRoomToken);
      expect(replay).toEqual(first);
    }

    let roomCampaign = campaignFor('community-quest-ruins-lvl1-scout-ahead');
    const qualifying = roomCampaign.dungeon!.rooms.filter((room) => room.id !== 'start').slice(0, 2);
    roomCampaign = recordQuestQualificationEvent(roomCampaign, { ...qualifying[0], status: 'cleared' });
    expect(roomCampaign.questRuntimeState).toMatchObject({ qualifiedUnitCount: 1, xpUnitsEarned: 0, xpEarned: 0 });
    expect(roomCampaign.dungeon?.objectiveComplete).toBe(false);
    roomCampaign = recordQuestQualificationEvent(roomCampaign, { ...qualifying[1], status: 'cleared' });
    expect(roomCampaign.questRuntimeState).toMatchObject({ qualifiedUnitCount: 2, xpUnitsEarned: 1, xpEarned: 1 });

    let lairCampaign = campaignFor('community-quest-ruins-lvl1-wipe-em-out');
    const lair = lairCampaign.dungeon!.rooms.find((room) => room.sourceRoomToken === 'lair')!;
    lairCampaign = recordQuestQualificationEvent(lairCampaign, { ...lair, status: 'cleared' });
    expect(lairCampaign.questRuntimeState).toMatchObject({ qualifiedUnitCount: 1, xpUnitsEarned: 1, xpEarned: 1 });
  });

  productionProofTest(registration('C1C1-QUEST-SAVE-REPLAY'), () => {
    let continuous = campaignFor('community-quest-ruins-lvl1-scout-ahead');
    const rooms = continuous.dungeon!.rooms.filter((room) => room.id !== 'start').slice(0, 2);
    continuous = recordQuestQualificationEvent(continuous, { ...rooms[0], status: 'cleared' });
    const restored = restoreSaveSnapshot(createSaveSnapshot(continuous));
    expect(restored.questRuntimeState).toMatchObject({ qualifiedUnitCount: 1, xpEarned: 0 });
    const resumed = recordQuestQualificationEvent(restored, { ...rooms[1], status: 'cleared' });
    const uninterrupted = recordQuestQualificationEvent(continuous, { ...rooms[1], status: 'cleared' });
    expect(resumed.questRuntimeState).toMatchObject({ qualifiedUnitCount: 2, xpUnitsEarned: 1, xpEarned: 1 });
    expect(resumed.questRuntimeState).toEqual(uninterrupted.questRuntimeState);

    const resolvedOnce = finishQuest(resumed, 'left');
    const resolvedTwice = finishQuest(resolvedOnce, 'left');
    expect(resolvedOnce.pendingQuestXp?.xpPerHero).toBe(1);
    expect(resolvedTwice).toBe(resolvedOnce);
  });

  productionProofTest(registration('C1C1-QUEST-SELECTOR'), () => {
    const base = runtimeContentContext(createNewCampaign('community-complete-edition'));
    expect(getQuestPool({ ...base, campaignLevel: 1 }).map((quest) => quest.name)).toEqual(['Explore the Sewers']);
    expect(getQuestPool({ ...base, campaignLevel: 2 }).map((quest) => quest.name)).toEqual(['Mapping the Sewers']);
    expect(filterCommunityQuestCandidates(COMMUNITY_RUNTIME_QUESTS, {
      ...base, campaignLevel: 1, enabledRegions: ['ruins'],
    }).map((quest) => quest.id)).toEqual([]);
    expect(filterCommunityQuestCandidates(COMMUNITY_RUNTIME_QUESTS, {
      ...base, campaignLevel: 1, enabledContentSets: [],
    })).toEqual([]);
  });
});

describe('C1C-1 Quest mutation closure', () => {
  it('QC-01/QC-02/QC-03 rejects legacy aliases, composition drift, and quest-name switches', () => {
    for (const id of C1C1_CORE_QUEST_IDS) expect(generateDungeon(id).questId).toBe(id);
    expect(tokenCounts(C1C1_CORE_QUEST_IDS[0])).toEqual(source(C1C1_CORE_QUEST_IDS[0]).dungeonStructure.roomTokens);
    const implementation = readFileSync('src/game-engine/dungeon.ts', 'utf8');
    expect(implementation).not.toMatch(/case\s+['"]community-quest-|if\s*\([^\n]*Scout Ahead/);
  });

  it('QC-04/QC-05/QC-06 keeps unit rates separate, persisted, and idempotent', () => {
    const quest = COMMUNITY_QUEST_RUNTIME_ADAPTERS[C1C1_CORE_QUEST_IDS[0]].definition;
    expect(quest.xpUnit).toMatchObject({ unitSize: 2, minimumQuestGoal: null });
    expect(quest.objectives).toEqual([]);
  });

  it('QC-07/QC-08 special rules and deferred Crimson Court definitions fail closed', () => {
    expect(Object.keys(COMMUNITY_QUEST_RUNTIME_ADAPTERS)).toEqual([...C1C1_CORE_QUEST_IDS]);
    for (const id of [
      'community-quest-crimson-court-lvl1-deep-in-the-swamp',
      'community-quest-crimson-court-lvl2-deeper-into-the-swamp',
      'community-quest-crimson-court-lvl2-pest-control',
    ]) expect(COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === id)?.productionStatus).toBe('ADAPTER_REQUIRED');
    expect(COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY')).toHaveLength(2);
  });

  it('QC-11/QC-12 fake or wrong-definition proofs close readiness', () => {
    const id = 'community-quest-warrens-lvl1-explore-the-sewers';
    const manifests = structuredClone(COMMUNITY_QUEST_PRODUCTION_PROOFS) as Record<string, CommunityProductionProof>;
    manifests[id].productionTests = ['FAKE-QUEST-PROOF'];
    expect(evaluateCommunityQuestCapability(source(id), COMMUNITY_QUEST_RUNTIME_ADAPTERS, manifests).productionStatus).toBe('ADAPTER_REQUIRED');
    const registry = structuredClone(PRODUCTION_PROOF_REGISTRY);
    registry['C1C1-QUEST-RUNTIME'].definitionIds = [C1C1_CORE_QUEST_IDS[1]];
    expect(evaluateCommunityQuestCapability(source(id), COMMUNITY_QUEST_RUNTIME_ADAPTERS, COMMUNITY_QUEST_PRODUCTION_PROOFS, registry).productionStatus).toBe('ADAPTER_REQUIRED');
  });
});
