import { describe, expect, it } from 'vitest';
import { LEVEL_3_TRINKET_CENSUS, LEVEL_3_TRINKET_DECK_COVERAGE } from './level3-trinket-deck';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from './level2-trinket-deck';
import { LEVEL3_STANCE_RING_SPECS } from './production-proof-registry';
import { COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_CAPABILITIES } from '../data/community-reference/production-runtime';
import { trinketReadinessInvariantErrors } from './trinket-readiness-invariants';
import { drawSourceCompleteTrinket } from '../game-engine/trinkets/draw-trinket';
import { runtimeContentContext } from '../data/content-selector';
import { createNewCampaign } from '../game-engine/campaign';
import { liveTrinketMissingPrimitives } from './trinket-live-runtime-coverage';

describe('C1C15 Level 3 deck foundation', () => {
  it('accounts for 12 source-supported core cards and exactly four ready Rings', () => {
    expect(LEVEL_3_TRINKET_CENSUS).toHaveLength(12);
    expect(LEVEL_3_TRINKET_CENSUS.every((card) => card.contentSet === 'core' && card.sourceStatus === 'source-supported'
      && card.unresolvedFields.length === 0)).toBe(true);
    expect(LEVEL_3_TRINKET_DECK_COVERAGE.productionReadyCount).toBe(4);
    expect(new Set(LEVEL_3_TRINKET_DECK_COVERAGE.productionReadyIds)).toEqual(new Set(LEVEL3_STANCE_RING_SPECS.map((ring) => ring.definitionId)));
    expect(LEVEL_3_TRINKET_DECK_COVERAGE.completeForRandomDraw).toBe(false);
    expect(trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES)).toEqual([]);
    expect(LEVEL_2_TRINKET_DECK_COVERAGE).toMatchObject({ productionReadyCount: 4, completeForRandomDraw: false });
  });
  it('uses live registries while retaining the historical normalization diagnosis', () => {
    for (const ring of LEVEL3_STANCE_RING_SPECS) {
      const source = COMMUNITY_SOURCE_TRINKETS.find((card) => card.id === ring.definitionId)!;
      expect(source.positiveSide.runtimeSupport.missingCapabilities.length).toBeGreaterThan(0);
      expect(liveTrinketMissingPrimitives(source)).toEqual([]);
    }
    for (const card of LEVEL_3_TRINKET_CENSUS.filter((entry) => !entry.productionReady)) {
      expect(card.blockerCodes).toContain('TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED');
      expect(card.sides.every((side) => side.implementationStatus !== 'IMPLEMENTED')).toBe(true);
    }
  });
  it('rejects full Level 3 source-deck draw while only four cards are ready', () => {
    expect(drawSourceCompleteTrinket({ level: 3, runtimeContext: runtimeContentContext(createNewCampaign('community-complete-edition')) }))
      .toMatchObject({ definition: null, error: 'SOURCE_DECK_INCOMPLETE', candidateCount: 0 });
  });
});
