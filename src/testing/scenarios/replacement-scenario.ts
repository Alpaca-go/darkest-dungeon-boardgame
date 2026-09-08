import { resolveAllPendingTrinketAllocations } from '../../game-engine/commands';
import { runCampaignUntilMilestone } from '../../audit/core-campaign/checkpointable-campaign-runner';
import { killCampaignHero } from '../../game-engine/hero-death';
import { evaluateReplacementFlow } from '../../game-engine/stagecoach';
import { createSaveSnapshot, validateSaveFile, type SaveFile } from '../../game-engine/save';
import { seededRuntimeSources, withRuntimeSources } from '../../game-engine/runtime-sources';

/** Reach Hamlet first; apply the production death command and validate the scenario envelope. */
export function buildReplacementScenario(): SaveFile {
  const checkpoint = runCampaignUntilMilestone('golden-normal-success-01', 'M01');
  return withRuntimeSources(seededRuntimeSources(9182), () => {
    const c = checkpoint.campaignState;
    const dead = killCampaignHero(c, {
      heroInstanceId: c.heroes[0].instanceId, cause: 'deathblow-exploration',
      source: 'exploration', resumePhase: 'hamlet',
    });
    const replacement = evaluateReplacementFlow(resolveAllPendingTrinketAllocations(dead));
    if (replacement.gamePhase !== 'replacement') throw new Error('Scenario did not reach replacement');
    const save = JSON.parse(JSON.stringify(createSaveSnapshot(replacement))) as SaveFile;
    const error = validateSaveFile(save);
    if (error) throw new Error(error);
    return save;
  });
}
