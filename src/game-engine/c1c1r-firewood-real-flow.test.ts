import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import { C1C1_CORE_QUEST_IDS, PRODUCTION_PROOF_REGISTRY } from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import questData from '../data/community-reference/quests/data.json' with { type: 'json' };
import {
  COMMUNITY_QUEST_PRODUCTION_PROOFS,
  COMMUNITY_QUEST_RUNTIME_ADAPTERS,
  evaluateCommunityQuestCapability,
  implementedQuestPrimitives,
  normalizePrimitives,
  questAdapterSourceSetupErrors,
} from '../data/community-reference/production-runtime';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { generateDungeon, moveToRoom, QUEST_ROOM_TOKEN_BEHAVIOR_MATRIX } from './dungeon';
import { commitRestAtCamp, createQuestRuntimeState } from './quests/quest-runtime';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { interactWithCurio } from './diseases/curio';
import { commitBattleVictory } from './commands/battle';
import { setRandomSource } from './random';

const PARTY = ['crusader', 'highwayman', 'vestal', 'plague-doctor'];
const source = (id: string) => questData.find((entry) => entry.id === id)!;
const registration = (id: string) => PRODUCTION_PROOF_REGISTRY[id];

function campaignFor(id: string): CampaignState {
  const base = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), PARTY));
  const quest = COMMUNITY_QUEST_RUNTIME_ADAPTERS[id].definition;
  return {
    ...base,
    currentQuestId: id,
    questStatus: 'active',
    gamePhase: 'dungeon-explore',
    dungeon: generateDungeon(id),
    questRuntimeState: createQuestRuntimeState(quest),
  };
}

describe('C1C-1R source setup production proof', () => {
  productionProofTest(registration('C1C1R-QUEST-SOURCE-SETUP'), () => {
    for (const id of C1C1_CORE_QUEST_IDS) {
      const adapter = COMMUNITY_QUEST_RUNTIME_ADAPTERS[id];
      expect(questAdapterSourceSetupErrors(source(id), adapter)).toEqual([]);
      expect(adapter.definition.firewoodSetup).toEqual(source(id).firewood);
      const campaign = campaignFor(id);
      expect(campaign.questRuntimeState).toMatchObject({
        firewoodTokensRemaining: source(id).firewood.tokens,
        restingPointsRemaining: source(id).firewood.restingPoints,
        restingPointsSpent: 0,
      });
    }
  });

  it('FR-01 splits a compound blocker into both capabilities', () => {
    expect(normalizePrimitives('Complete room-token composition and printed firewood/resting-point setup are not represented')).toEqual([
      'QUEST_ROOM_TOKEN_COMPOSITION',
      'QUEST_FIREWOOD_RESTING_POINT_SETUP',
    ]);
  });

  it('FR-02/FR-03 mismatched source setup closes the adapter', () => {
    const id = C1C1_CORE_QUEST_IDS[0];
    const badTokens = structuredClone(COMMUNITY_QUEST_RUNTIME_ADAPTERS);
    badTokens[id].definition.firewoodSetup!.tokens = 0;
    expect(evaluateCommunityQuestCapability(
      source(id), badTokens, COMMUNITY_QUEST_PRODUCTION_PROOFS, PRODUCTION_PROOF_REGISTRY, implementedQuestPrimitives(true),
    ).productionStatus).toBe('ADAPTER_REQUIRED');
    const badPoints = structuredClone(COMMUNITY_QUEST_RUNTIME_ADAPTERS);
    badPoints[id].definition.firewoodSetup!.restingPoints = 12;
    expect(evaluateCommunityQuestCapability(
      source(id), badPoints, COMMUNITY_QUEST_PRODUCTION_PROOFS, PRODUCTION_PROOF_REGISTRY, implementedQuestPrimitives(true),
    ).productionStatus).toBe('ADAPTER_REQUIRED');
  });

  it('FR-04 missing firewood runtime primitive fails closed', () => {
    const implemented = new Set(['QUEST_ROOM_TOKEN_COMPOSITION', 'QUEST_XP_UNIT_ACCOUNTING']);
    expect(evaluateCommunityQuestCapability(
      source(C1C1_CORE_QUEST_IDS[0]),
      COMMUNITY_QUEST_RUNTIME_ADAPTERS,
      COMMUNITY_QUEST_PRODUCTION_PROOFS,
      PRODUCTION_PROOF_REGISTRY,
      implemented,
    ).productionStatus).toBe('ENGINE_PRIMITIVE_MISSING');
  });

  it('FR-05/FR-06 setup and consumption survive repeated save/reload', () => {
    let campaign = campaignFor(C1C1_CORE_QUEST_IDS[0]);
    campaign = {
      ...campaign,
      heroes: campaign.heroes.map((hero, index) => index === 0 ? { ...hero, stress: 8 } : hero),
      dungeon: {
        ...campaign.dungeon!,
        rooms: campaign.dungeon!.rooms.map((room) => room.id === 'start' ? { ...room, status: 'cleared' as const } : room),
      },
    };
    const restored = restoreSaveSnapshot(createSaveSnapshot(campaign));
    expect(restored.questRuntimeState).toMatchObject({ firewoodTokensRemaining: 1, restingPointsRemaining: 8 });
    const rested = commitRestAtCamp(restored, {
      allocations: [{ heroId: restored.heroes[0].instanceId, resource: 'stress', points: 8 }],
    });
    expect(rested.ok).toBe(true);
    expect(rested.campaign.questRuntimeState).toMatchObject({ firewoodTokensRemaining: 0, restingPointsRemaining: 0, restingPointsSpent: 8 });
    const twice = restoreSaveSnapshot(createSaveSnapshot(restoreSaveSnapshot(createSaveSnapshot(rested.campaign))));
    expect(twice.questRuntimeState).toEqual(rested.campaign.questRuntimeState);
  });
});

describe('C1C-1R room-token behavior audit', () => {
  it('records all six source token behavior contracts', () => {
    expect(Object.keys(QUEST_ROOM_TOKEN_BEHAVIOR_MATRIX)).toEqual(['empty', 'dark', 'curio', 'treasure', 'lair', 'trap']);
    expect(QUEST_ROOM_TOKEN_BEHAVIOR_MATRIX.dark.runtimeBehavior).toBe('light-loss-and-visited');
    expect(QUEST_ROOM_TOKEN_BEHAVIOR_MATRIX.curio.runtimeBehavior).toBe('guard-roll-battle-or-interaction');
    expect(QUEST_ROOM_TOKEN_BEHAVIOR_MATRIX.lair.qualificationBehavior).toBe('records after victory');
  });

  it('Dark loses Light and never qualifies or clears', () => {
    let campaign = campaignFor('community-quest-warrens-lvl1-explore-the-sewers');
    campaign = {
      ...campaign,
      dungeon: {
        ...campaign.dungeon!, currentRoomId: 'E',
        rooms: campaign.dungeon!.rooms.map((room) => room.id === 'E' ? { ...room, status: 'current' as const } : room),
      },
    };
    setRandomSource(() => 0);
    try { campaign = moveToRoom(campaign, 'F'); } finally { setRandomSource(null); }
    expect(campaign.light).toBe(4);
    expect(campaign.dungeon?.rooms.find((room) => room.id === 'F')?.status).toBe('visited');
    expect(campaign.questRuntimeState?.qualifiedUnitCount).toBe(0);
  });

  it('Curio clears and qualifies only after the real interaction', () => {
    let campaign = campaignFor('community-quest-warrens-lvl1-explore-the-sewers');
    const rolls = [0, 0.9];
    setRandomSource(() => rolls.shift() ?? 0.9);
    try { campaign = moveToRoom(campaign, 'A'); } finally { setRandomSource(null); }
    expect(campaign.dungeon?.rooms.find((room) => room.id === 'A')).toMatchObject({ status: 'current', curioGuardResolved: true });
    campaign = interactWithCurio(campaign, campaign.heroes[0].instanceId).campaign;
    expect(campaign.dungeon?.rooms.find((room) => room.id === 'A')?.status).toBe('cleared');
    expect(campaign.questRuntimeState?.qualifiedUnitCount).toBe(1);
  });

  it('Lair enters battle and victory records lair qualification', () => {
    let campaign = campaignFor('community-quest-warrens-lvl1-pork-chop');
    setRandomSource(() => 0);
    try { campaign = moveToRoom(campaign, 'A'); } finally { setRandomSource(null); }
    expect(campaign.gamePhase).toBe('battle');
    campaign = { ...campaign, battle: { ...campaign.battle!, status: 'victory' } };
    const result = commitBattleVictory(campaign);
    expect(result.ok).toBe(true);
    expect(result.campaign.dungeon?.rooms.find((room) => room.id === 'A')?.status).toBe('cleared');
    expect(result.campaign.questRuntimeState).toMatchObject({ qualifiedUnitCount: 1, xpUnitsEarned: 1, xpEarned: 1 });
  });

  it('FR-07/FR-08 browser proof cannot import qualification helpers or inject progress', () => {
    const e2e = readFileSync('e2e/phase11a4-c1c1r-real-community-quest.spec.ts', 'utf8');
    expect(e2e).not.toContain('recordQuestQualificationEvent');
    expect(e2e).not.toContain('questRuntimeState:');
    expect(e2e).not.toMatch(/localStorage\.setItem\([^)]*(qualifiedUnitCount|xpEarned|questRuntimeState)/s);
  });

  it('FR-09 E2E proof is adapter-scoped rather than overclaimed definitions', () => {
    expect(registration('C1C1R-E2E-SIMPLE-QUEST-ADAPTER')).toMatchObject({
      scope: 'adapter', adapterId: 'c1c1-simple-community-quest-v1', definitionIds: [],
    });
  });
});
