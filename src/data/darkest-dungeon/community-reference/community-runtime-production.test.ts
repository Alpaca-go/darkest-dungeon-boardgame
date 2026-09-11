import { describe, expect, it } from 'vitest';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';

const families = ['shuffling-horror', 'templars', 'mammoth-cyst'] as const;
describe('Community production path matrix', () => {
  for (const questIndex of [0, 1, 2] as const) {
    for (const layoutIndex of [0, 1] as const) {
      it(`P${questIndex + 1}${layoutIndex + 1} enters ${families[questIndex]} through Guardian production routing`, () => {
        const campaign = createCommunityGuardianScenario(questIndex, layoutIndex);
        expect(campaign.actFourState.guardianDefinitionId).toBe(`community-dd-guardian-family-${families[questIndex]}`);
        expect(Boolean(campaign.actFourState.templarsEncounterState || campaign.actFourState.mammothCystEncounterState || campaign.actFourState.shufflingHorrorEncounterState)).toBe(true);
      });
    }
  }
});
