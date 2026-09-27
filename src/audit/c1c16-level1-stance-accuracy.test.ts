import { describe, expect, it } from 'vitest';
import { LEVEL_1_TRINKET_CENSUS, LEVEL_1_TRINKET_DECK_COVERAGE } from './level1-trinket-deck';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from './level2-trinket-deck';
import { LEVEL_3_TRINKET_DECK_COVERAGE } from './level3-trinket-deck';
import { LEVEL1_STANCE_ACCURACY_SPECS, LEVEL3_STANCE_RING_SPECS } from './production-proof-registry';
import { COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
  evaluateCommunityTrinketCapability } from '../data/community-reference/production-runtime';
import { trinketReadinessInvariantErrors } from './trinket-readiness-invariants';
import { liveTrinketMissingPrimitives } from './trinket-live-runtime-coverage';
import { drawSourceCompleteTrinket } from '../game-engine/trinkets/draw-trinket';
import { runtimeContentContext } from '../data/content-selector';
import { createNewCampaign } from '../game-engine/campaign';

const stones = ['community-trinket-core-accuracy-stone', 'community-trinket-core-critical-stone'];
describe('C1C16 Level 1 live foundation', () => {
  it('derives fourteen Core sources, recomputes baseline two and promotes exactly four', () => {
    const sources = COMMUNITY_SOURCE_TRINKETS.filter((source) => source.level === 1 && source.contentSet === 'core');
    expect(sources).toHaveLength(14);
    expect(sources.every((source) => source.sourceStatus === 'source-supported' && source.unresolvedFields.length === 0)).toBe(true);
    const added = new Set<string>(LEVEL1_STANCE_ACCURACY_SPECS.map((card) => card.definitionId));
    const baselineAdapters = Object.fromEntries(Object.entries(COMMUNITY_TRINKET_RUNTIME_ADAPTERS).filter(([id]) => !added.has(id)));
    expect(sources.filter((source) => evaluateCommunityTrinketCapability(source, baselineAdapters).productionReady).map((source) => source.id).sort()).toEqual([...stones].sort());
    expect(LEVEL_1_TRINKET_CENSUS).toHaveLength(14);
    expect([...LEVEL_1_TRINKET_DECK_COVERAGE.productionReadyIds].sort()).toEqual([...stones, ...added].sort());
    expect(LEVEL_1_TRINKET_DECK_COVERAGE).toMatchObject({ sourceDefinitionCount: 14, productionReadyCount: 6, completeForRandomDraw: false });
    expect(trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES)).toEqual([]);
  });
  it('preserves historical diagnosis and remaining eight blockers with all draw locks', () => {
    for (const card of LEVEL1_STANCE_ACCURACY_SPECS) {
      const source = COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === card.definitionId)!;
      expect(source.positiveSide.runtimeSupport.missingCapabilities.length).toBeGreaterThan(0);
      expect(liveTrinketMissingPrimitives(source)).toEqual([]);
      expect(source.negativeSide.conditions).toEqual([]);
    }
    expect(LEVEL_1_TRINKET_CENSUS.filter((card) => !card.productionReady)).toHaveLength(8);
    expect(LEVEL_2_TRINKET_DECK_COVERAGE).toMatchObject({ sourceDefinitionCount: 11, productionReadyCount: 4, completeForRandomDraw: false });
    expect(LEVEL_3_TRINKET_DECK_COVERAGE).toMatchObject({ sourceDefinitionCount: 12, productionReadyCount: 4, completeForRandomDraw: false });
    expect(new Set(LEVEL_3_TRINKET_DECK_COVERAGE.productionReadyIds)).toEqual(new Set(LEVEL3_STANCE_RING_SPECS.map((card) => card.definitionId)));
    for (const level of [1, 2, 3] as const) expect(drawSourceCompleteTrinket({ level,
      runtimeContext: runtimeContentContext(createNewCampaign('community-complete-edition')) })).toMatchObject({ definition: null, error: 'SOURCE_DECK_INCOMPLETE', candidateCount: 0 });
  });
});
