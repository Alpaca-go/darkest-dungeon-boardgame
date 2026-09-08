import { expect, it } from 'vitest';
import { runCampaignUntilMilestone } from './checkpointable-campaign-runner';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../../game-engine/save';
import { CampaignSimulationDriver } from './simulation-driver';
const seed = 'golden-normal-success-01';
  it('Product Save Round Trip and subsequent production action', () => {
    const cp = runCampaignUntilMilestone(seed, 'M01');
    const save = JSON.parse(JSON.stringify(createSaveSnapshot(cp.campaignState)));
    expect(validateSaveFile(save)).toBeNull();
    expect(restoreSaveSnapshot(save)).toEqual(cp.campaignState);
    expect(save).not.toHaveProperty('runtimeSnapshot');
    const driver = new CampaignSimulationDriver(seed);
    try {
      expect(driver.load(save).ok).toBe(true);
      const before = driver.getState();
      expect(driver.dispatch({ type: 'skipAllHeroActions' }).ok).toBe(true);
      expect(driver.getState()).not.toEqual(before);
    } finally { driver.dispose(); }
  });
