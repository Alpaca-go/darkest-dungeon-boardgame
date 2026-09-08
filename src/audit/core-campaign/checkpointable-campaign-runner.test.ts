import { expect, it } from 'vitest';
import { runCampaignUntilMilestone, resumeCampaignFromCheckpoint } from './checkpointable-campaign-runner';
import { getRuntimeSources } from '../../game-engine/runtime-sources';
it('Rejects damaged checkpoint and unknown milestone; preserves enclosing runtime', () => {
  const runtime = getRuntimeSources();
  const cp = runCampaignUntilMilestone('golden-normal-success-01', 'M03');
  expect(getRuntimeSources()).toBe(runtime);
  expect(() => resumeCampaignFromCheckpoint({ ...cp, stateHash: 'broken' }, 'M09')).toThrow('Invalid replay checkpoint');
  expect(() => runCampaignUntilMilestone(cp.seedId, 'M99')).toThrow('Unknown milestone');
});
