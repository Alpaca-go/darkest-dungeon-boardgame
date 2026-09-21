import { describe, expect, it } from 'vitest';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE, measureTrinketDeckCoverage } from './level2-trinket-deck';
import { COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_CAPABILITIES } from '../data/community-reference/production-runtime';
import { COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS } from '../data/community-reference/production-runtime';
import { questReadinessInvariantErrors } from './quest-readiness-invariants';
import { drawTrinket } from '../game-engine/trinkets/draw-trinket';
import { runtimeContentContext } from '../data/content-selector';
import { createNewCampaign } from '../game-engine/campaign';

describe('C1C-5 Level 2 Trinket source truth', () => {
  it('measures all source cards and keeps the random deck closed', () => {
    expect(LEVEL_2_TRINKET_CENSUS).toHaveLength(11);
    expect(LEVEL_2_TRINKET_CENSUS.every((entry) => entry.sides.length === 2)).toBe(true);
    expect(LEVEL_2_TRINKET_DECK_COVERAGE).toMatchObject({
      sourceDefinitionCount: 11, productionReadyCount: 0, completeForRandomDraw: false,
    });
  });

  it('fails closed at 1/11 and 10/11 production-ready', () => {
    const level2Ids = new Set(COMMUNITY_SOURCE_TRINKETS.filter((source) => source.level === 2).map((source) => source.id));
    const forceReady = (count: number) => COMMUNITY_TRINKET_CAPABILITIES.map((capability) => level2Ids.has(capability.definitionId)
      ? { ...capability, productionReady: [...level2Ids].slice(0, count).includes(capability.definitionId), sourceSemanticComplete: true }
      : capability);
    expect(measureTrinketDeckCoverage(2, COMMUNITY_SOURCE_TRINKETS, forceReady(1)).completeForRandomDraw).toBe(false);
    expect(measureTrinketDeckCoverage(2, COMMUNITY_SOURCE_TRINKETS, forceReady(10)).completeForRandomDraw).toBe(false);
  });

  it('fails closed at 11/11 when one source definition has a semantic gap', () => {
    const sources = COMMUNITY_SOURCE_TRINKETS.map((source) => source.level === 2 && source.id === LEVEL_2_TRINKET_CENSUS[0].definitionId
      ? { ...source, unresolvedFields: ['mutation-gap'] }
      : source);
    const capabilities = COMMUNITY_TRINKET_CAPABILITIES.map((capability) => ({
      ...capability, productionReady: true, sourceSemanticComplete: true,
    }));
    const coverage = measureTrinketDeckCoverage(2, sources, capabilities);
    expect(coverage.productionReadyCount).toBe(11);
    expect(coverage.completeForRandomDraw).toBe(false);
    expect(coverage.semanticallyIncompleteDefinitionIds).toContain(LEVEL_2_TRINKET_CENSUS[0].definitionId);
  });

  it('keeps Family Trinkets blocked while the Level 2 deck is incomplete', () => {
    const family = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === 'community-quest-warrens-lvl1-family-trinkets')!;
    expect(family.productionReady).toBe(false);
    expect(family.blockerCodes).toContain('LEVEL_2_TRINKET_SOURCE_DECK_COMPLETE');
    expect(COMMUNITY_QUEST_CAPABILITIES.some((entry) => entry.definitionId === family.definitionId && entry.productionReady)).toBe(false);
    expect(questReadinessInvariantErrors(COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS, LEVEL_2_TRINKET_DECK_COVERAGE)).toEqual([]);
    const promoted = COMMUNITY_QUEST_CAPABILITIES.map((entry) => entry.definitionId === family.definitionId
      ? { ...entry, productionReady: true, productionStatus: 'PRODUCTION_READY' as const }
      : entry);
    expect(questReadinessInvariantErrors(promoted, COMMUNITY_SOURCE_QUESTS, LEVEL_2_TRINKET_DECK_COVERAGE)).toContain(
      `${family.definitionId}: ready while Level 2 source deck is incomplete`,
    );
  });

  it('does not draw from the production-ready subset of an incomplete source deck', () => {
    const result = drawTrinket({
      level: 2, pool: 'official',
      runtimeContext: runtimeContentContext(createNewCampaign('community-complete-edition')),
      rng: () => 0,
    });
    expect(result).toEqual({ definition: null, candidateCount: 0 });
  });
});
