import { describe, expect, it, vi } from 'vitest';
import { C4C_SIMPLE_QUEST_IDS } from './c4c-quest-batch';
import { PRODUCTION_PROOF_REGISTRY } from './production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_RUNTIME_QUESTS, COMMUNITY_QUEST_RUNTIME_ADAPTERS,
  COMMUNITY_QUEST_PRODUCTION_PROOFS, evaluateCommunityQuestCapability, implementedQuestPrimitives } from '../data/community-reference/production-runtime';
import sources from '../data/community-reference/quests/data.json';
import { getQuestPool, runtimeContentContext } from '../data/content-selector';
import { commitRestAtCamp, recordQuestQualificationEvent } from '../game-engine/quests/quest-runtime';
import { createSaveSnapshot, restoreSaveSnapshot } from '../game-engine/save';
import { generateDungeon } from '../game-engine/dungeon';
import { gameplay, restCampaign, selectedCampaign } from './c4c-quest-test-support';
import { C4C_REST_RULING_ID } from './c4c-rest-effective-contract';
import * as effective from './c4c-rest-effective-contract';

const previous = ['community-quest-warrens-lvl1-explore-the-sewers',
  'community-quest-warrens-lvl2-mapping-the-sewers', 'community-quest-warrens-lvl3-deep-in-the-warrens'];

describe('C4C shared simple Quest activation', () => {
  productionProofTest(PRODUCTION_PROOF_REGISTRY['C4C-SIMPLE-RUNTIME'], () => {
    for (const id of C4C_SIMPLE_QUEST_IDS) {
      const source = sources.find(s => s.id === id)!;
      const adapter = COMMUNITY_QUEST_RUNTIME_ADAPTERS[id];
      expect(adapter.adapterId).toBe('c1c1-simple-community-quest-v1');
      const c = restCampaign(id);
      expect(c.currentQuestId).toBe(id);
      expect(c.questRuntimeState).toMatchObject({ definitionId: id, firewoodTokensRemaining: source.firewood.tokens,
        restingPointsRemaining: source.firewood.restingPoints, restRuleVersion: C4C_REST_RULING_ID });
      expect(adapter.definition.name).toBe(source.printedName);
      const counts: Record<string, number> = {};
      c.dungeon!.rooms.forEach(r => { if (r.sourceRoomToken) counts[r.sourceRoomToken] = (counts[r.sourceRoomToken] ?? 0) + 1; });
      expect(counts).toEqual(source.dungeonStructure.roomTokens);
      expect(generateDungeon(id, 'c4c').rooms).toEqual(generateDungeon(id, 'c4c').rooms);
      for (const points of [0, 5]) {
        const result = commitRestAtCamp(c, { allocations: points ? [{ heroId: c.heroes[0].instanceId, resource: 'stress', points }] : [] });
        expect(result.ok).toBe(true);
        expect(result.campaign.heroes[0].stress).toBe(10 - points);
        expect(result.campaign.questRuntimeState).toMatchObject({ firewoodTokensRemaining: source.firewood.tokens - 1,
          restingPointsRemaining: 0, restingPointsSpent: points, restRuleVersion: C4C_REST_RULING_ID });
        expect(commitRestAtCamp(result.campaign, { allocations: [] }).ok).toBe(false);
      }
      expect(commitRestAtCamp(c, { allocations: [{ heroId: c.heroes[0].instanceId, resource: 'stress', points: source.firewood.restingPoints + 1 }] }).error)
        .toBe('REST_ALLOCATION_EXCEEDS_BUDGET');
      expect(commitRestAtCamp(c, { allocations: [{ heroId: c.heroes[0].instanceId, resource: 'life', points: 1 }] }).error)
        .toBe('REST_ALLOCATION_EXCEEDS_RECOVERY_CAP');
      let progress = c;
      const rooms = c.dungeon!.rooms.filter(r => r.id !== 'start' && (adapter.definition.xpUnit!.targetEntity === 'room' || r.sourceRoomToken === 'lair'));
      rooms.forEach(r => { progress = recordQuestQualificationEvent(progress, { ...r, status: 'cleared' }); });
      expect(progress.questRuntimeState!.qualifiedUnitCount).toBe(rooms.length);
      expect(progress.questRuntimeState!.xpEarned).toBe(Math.min(3, Math.floor(rooms.length / adapter.definition.xpUnit!.unitSize) * adapter.definition.xpUnit!.xpPerUnit));
      expect(recordQuestQualificationEvent(progress, { ...rooms[0], status: 'cleared' })).toBe(progress);
    }
  });

  productionProofTest(PRODUCTION_PROOF_REGISTRY['C4C-SIMPLE-SAVE-REPLAY'], () => {
    for (const id of C4C_SIMPLE_QUEST_IDS) {
      const c = restCampaign(id);
      const partial = commitRestAtCamp(c, { allocations: [{ heroId: c.heroes[0].instanceId, resource: 'stress', points: 5 }] }).campaign;
      const zero = commitRestAtCamp(c, { allocations: [] }).campaign;
      const room = c.dungeon!.rooms.find(r => r.id !== 'start' && (COMMUNITY_QUEST_RUNTIME_ADAPTERS[id].definition.xpUnit!.targetEntity === 'room' || r.sourceRoomToken === 'lair'))!;
      const progressed = recordQuestQualificationEvent(partial, { ...room, status: 'cleared' });
      for (const checkpoint of [c, partial, zero, progressed]) {
        const restored = restoreSaveSnapshot(createSaveSnapshot(checkpoint));
        expect(gameplay(restored)).toEqual(gameplay(checkpoint));
        expect(gameplay(recordQuestQualificationEvent(restored, { ...room, status: 'cleared' })))
          .toEqual(gameplay(recordQuestQualificationEvent(checkpoint, { ...room, status: 'cleared' })));
      }
      const resumed = commitRestAtCamp(restoreSaveSnapshot(createSaveSnapshot(c)), { allocations: [] });
      expect(gameplay(resumed.campaign)).toEqual(gameplay(zero));
    }
  });

  productionProofTest(PRODUCTION_PROOF_REGISTRY['C4C-SIMPLE-SELECTOR'], () => {
    expect(COMMUNITY_RUNTIME_QUESTS.map(q => q.id).sort()).toEqual([...previous, ...C4C_SIMPLE_QUEST_IDS].sort());
    for (const id of [...previous, ...C4C_SIMPLE_QUEST_IDS]) {
      const selected = selectedCampaign(id);
      expect(selected.currentQuestId).toBe(id);
      expect(getQuestPool(runtimeContentContext(selected)).some(q => q.id === id)).toBe(true);
      expect(selected.dungeon?.questId).toBe(id);
    }
    for (const id of C4C_SIMPLE_QUEST_IDS) {
      const c = selectedCampaign(id);
      expect(getQuestPool({ ...runtimeContentContext(c), enabledRegions: [] }).some(q => q.id === id)).toBe(false);
      expect(getQuestPool({ ...runtimeContentContext(c), enabledContentSets: [] }).some(q => q.id === id)).toBe(false);
    }
  });

  it('requires current bound proofs and authorized Rest primitives without claiming UI acceptance', () => {
    for (const id of C4C_SIMPLE_QUEST_IDS) {
      const c = COMMUNITY_QUEST_CAPABILITIES.find(c => c.definitionId === id)!;
      expect(c.productionRuntimeReady).toBe(true);
      expect(c.sourceSemanticComplete).toBe(false);
      expect(c.restSemanticAuthority).toBe('PROJECT_RULING');
      expect(c.productionUiProofComplete).toBe(false);
      const source = sources.find(s => s.id === id)!;
      expect(evaluateCommunityQuestCapability(source, undefined, undefined, undefined, implementedQuestPrimitives(false)).productionRuntimeReady).toBe(false);
      const registry = { ...PRODUCTION_PROOF_REGISTRY, 'C4C-SIMPLE-RUNTIME': { ...PRODUCTION_PROOF_REGISTRY['C4C-SIMPLE-RUNTIME'], status: 'skip' as const } };
      expect(evaluateCommunityQuestCapability(source, undefined, COMMUNITY_QUEST_PRODUCTION_PROOFS, registry).productionRuntimeReady).toBe(false);
      const disabledRuling = vi.spyOn(effective, 'effectiveRestSemanticsAuthorized').mockReturnValue(false);
      try { expect(evaluateCommunityQuestCapability(source).productionRuntimeReady).toBe(false); }
      finally { disabledRuling.mockRestore(); }
    }
  });
});
