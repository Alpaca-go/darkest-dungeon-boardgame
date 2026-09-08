import { describe, expect, it } from 'vitest';
import { runCampaignUntilMilestone } from '../../audit/core-campaign/checkpointable-campaign-runner';
import { canSelectStandardQuest, canSelectBossQuest } from '../../game-engine/campaign/campaign-progress';
const seed = 'golden-normal-success-01';
describe('Real Vertical Integration', () => {
  it('V-01 New Campaign → Quest Select', () => {
    const s = runCampaignUntilMilestone(seed, 'M00').campaignState;
    expect(s.gamePhase).toBe('quest-select');
    expect(s.heroes).toHaveLength(4);
  });
  it('V-02 Completed Standard → Hamlet', () => {
    const s = runCampaignUntilMilestone(seed, 'M01').campaignState;
    expect(s.gamePhase).toBe('hamlet');
    expect(s.completedQuestCount).toBe(1);
    expect(s.campaignProgress.completedStandardQuestsThisAct).toBe(1);
  });
  it('V-03 exact M02 → Boss Gate', () => {
    const s = runCampaignUntilMilestone(seed, 'M02').campaignState;
    expect(s.act).toBe(1);
    expect(s.campaignProgress.completedStandardQuestsThisAct).toBe(2);
    expect(s.campaignProgress.bossQuestRequired).toBe(true);
    expect(canSelectStandardQuest(s.campaignProgress)).toBe(false);
    expect(canSelectBossQuest(s.campaignProgress)).toBe(true);
  });
  it('V-04 exact M03 → Act II', () => {
    const s = runCampaignUntilMilestone(seed, 'M03').campaignState;
    expect(s.act).toBe(2);
    expect(s.campaignLevel).toBe(2);
    expect(s.campaignProgress.defeatedBossFamilyIds).toHaveLength(1);
  });
  it('V-05 exact M09 → Act IV', () => {
    const s = runCampaignUntilMilestone(seed, 'M09').campaignState;
    expect(s.act).toBe(4);
    expect(s.campaignLevel).toBe(3);
    expect(s.campaignProgress.darkestDungeonUnlocked).toBe(true);
    expect(s.campaignProgress.defeatedBossFamilyIds).toHaveLength(3);
    expect(s.completedQuestCount).toBe(9);
  });
});
