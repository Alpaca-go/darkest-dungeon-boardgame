import { describe, expect, it } from 'vitest';
import { createNewCampaign } from '../game-engine/campaign';
import { SAVE_VERSION } from '../game-engine/save';
import { LEGACY_HERO_SELECTION } from '../data/heroes/runtime-registry';
import { withHistoricalHeroCampaignMetadata } from '../game-engine/heroes/legacy-campaign-metadata';

describe('C2D historical campaign metadata isolation', () => {
  it('restores normal v23 creation after a nested historical verifier throws', () => {
    const failure = new Error('historical verifier failure');
    expect(() => withHistoricalHeroCampaignMetadata(() => {
      const historical = createNewCampaign();
      expect(historical.saveVersion).toBe(22);
      expect(historical.heroRuntimeSelection).toBeUndefined();
      expect(() => withHistoricalHeroCampaignMetadata(() => { throw failure; })).toThrow(failure);
      expect(createNewCampaign().saveVersion).toBe(22);
      throw failure;
    })).toThrow(failure);
    const normal = createNewCampaign();
    expect(normal.saveVersion).toBe(SAVE_VERSION);
    expect(normal.heroRuntimeSelection).toEqual(LEGACY_HERO_SELECTION);
    expect(normal.heroProductionSession).toBeUndefined();
  });
});
