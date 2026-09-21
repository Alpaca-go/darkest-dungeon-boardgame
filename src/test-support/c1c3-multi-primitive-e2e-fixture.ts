import { applyDefaultLoadout, createNewCampaign, selectParty } from '../game-engine/campaign';
import { initializeCampaignAct } from '../game-engine/campaign/campaign-orchestrator';
import { proceedCampaignToLoadout, proceedCampaignToQuestSelect } from '../game-engine/commands';
import { createSaveSnapshot, type SaveFile } from '../game-engine/save';
import { createC1C2SpecialRuleE2ESave } from './c1c2-special-rule-e2e-fixture';

/** Production-command checkpoints; no campaign/dungeon/runtime object-spread mutation. */
export function createC1C3QuestSelectE2ESave(level: 1 | 3): SaveFile {
  if (level === 3) return createC1C2SpecialRuleE2ESave();
  let campaign = applyDefaultLoadout(selectParty(
    createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'hellion'],
  ));
  campaign = proceedCampaignToLoadout(campaign);
  campaign = proceedCampaignToQuestSelect(campaign);
  campaign = initializeCampaignAct(campaign, { now: '2026-09-21T00:00:00.000Z' }).campaign;
  if (campaign.campaignLevel !== 1 || campaign.gamePhase !== 'quest-select') {
    throw new Error('Production setup did not reach Act I Quest Select');
  }
  return createSaveSnapshot(campaign);
}
