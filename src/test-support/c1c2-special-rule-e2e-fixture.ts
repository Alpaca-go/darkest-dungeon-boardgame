import { applyDefaultLoadout, createNewCampaign, selectParty } from '../game-engine/campaign';
import { proceedCampaignToLoadout, proceedCampaignToQuestSelect } from '../game-engine/commands';
import {
  advanceCampaignAfterBoss,
  finalizeBossVictory,
  initializeCampaignAct,
} from '../game-engine/campaign/campaign-orchestrator';
import { FACE_THE_THREAT_QUEST_ID } from '../data/quests/face-the-threat';
import { createSaveSnapshot, type SaveFile } from '../game-engine/save';

/** Builds an Act III Quest Select checkpoint exclusively through production campaign commands. */
export function createC1C2SpecialRuleE2ESave(): SaveFile {
  let campaign = applyDefaultLoadout(selectParty(
    createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'hellion'],
  ));
  campaign = proceedCampaignToLoadout(campaign);
  campaign = proceedCampaignToQuestSelect(campaign);
  campaign = initializeCampaignAct(campaign, { now: '2026-09-21T00:00:00.000Z' }).campaign;
  for (let act = 1; act <= 2; act += 1) {
    const threatId = campaign.campaignProgress.activeThreatId;
    const bossFamilyId = campaign.campaignProgress.activeBossFamilyId;
    if (!threatId || !bossFamilyId) throw new Error(`Missing production Threat for Act ${act}`);
    const victory = finalizeBossVictory(campaign, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: `c1c2-e2e-boss-run-${act}`,
      threatId,
      bossFamilyId,
      now: `2026-09-21T0${act}:00:00.000Z`,
    });
    if (!victory.ok) throw new Error(`Boss progression failed: ${victory.error}`);
    const advanced = advanceCampaignAfterBoss(victory.campaign, { now: `2026-09-21T0${act}:30:00.000Z` });
    if (!advanced.ok) throw new Error(`Act progression failed: ${advanced.error}`);
    campaign = advanced.campaign;
  }
  if (campaign.campaignLevel !== 3 || campaign.gamePhase !== 'quest-select') {
    throw new Error('Production setup did not reach Act III Quest Select');
  }
  return createSaveSnapshot(campaign);
}
