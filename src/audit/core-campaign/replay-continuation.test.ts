import { describe, expect, it } from 'vitest';
import { runCampaignUntilMilestone, resumeCampaignFromCheckpoint } from './checkpointable-campaign-runner';
import { collectCommittedTransactionIds } from './simulation-driver';
const seed = 'golden-normal-success-01';
describe('Replay Continuation', () => {
  for (const milestone of ['M03', 'M06']) {
    it(milestone + ' serialized checkpoint → restore → M09 equals continuous', () => {
      const continuous = runCampaignUntilMilestone(seed, 'M09');
      const cp = runCampaignUntilMilestone(seed, milestone);
      const resumed = resumeCampaignFromCheckpoint(JSON.parse(JSON.stringify(cp)), 'M09');
      expect(resumed.stateHash).toBe(continuous.stateHash);
      expect(resumed.campaignState).toEqual(continuous.campaignState);
      expect(collectCommittedTransactionIds(resumed.campaignState)).toEqual(collectCommittedTransactionIds(continuous.campaignState));
      expect(resumed.events.slice(cp.eventIndex)).toEqual(continuous.events.slice(cp.eventIndex));
      expect(resumed.rngSnapshots.slice(cp.rngDrawIndex)).toEqual(continuous.rngSnapshots.slice(cp.rngDrawIndex));
      expect(resumed.milestones.slice(cp.milestones.length)).toEqual(continuous.milestones.slice(cp.milestones.length));
      expect(resumed.runtimeSnapshot).toEqual(continuous.runtimeSnapshot);
      expect(resumed.eventIndex).toBeGreaterThan(cp.eventIndex);
    });
  }
});
