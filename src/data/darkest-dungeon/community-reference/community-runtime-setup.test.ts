import { describe, expect, it } from 'vitest';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { validateCommunitySetupSnapshot } from './runtime-profile';

describe('Community runtime setup matrix', () => {
  for (const questIndex of [0, 1, 2] as const) {
    for (const layoutIndex of [0, 1] as const) {
      it(`S${questIndex + 1}${layoutIndex + 1} Quest ${questIndex + 1} Layout ${layoutIndex + 1} uses production commands`, () => {
        const campaign = createCommunityGuardianScenario(questIndex, layoutIndex);
        expect(validateCommunitySetupSnapshot(campaign.actFourState)).toEqual([]);
        expect(campaign.actFourState.guardianQuestState?.guardianBattleId).toBeTruthy();
        expect(campaign.actFourState.contentRuntime?.runtimeProfileId).toBe('community-reference');
      });
    }
  }
});
