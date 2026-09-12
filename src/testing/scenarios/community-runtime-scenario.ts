import type { CampaignState } from '../../types';
import { createNewCampaign, selectParty } from '../../game-engine/campaign';
import { completePostThirdThreatHamlet, unlockDarkestDungeonAct } from '../../game-engine/campaign/act-four/unlock-act-four';
import { drawDarkestDungeonQuest } from '../../game-engine/campaign/act-four/draw-quest';
import { activateDarkestDungeonContentSet } from '../../game-engine/campaign/act-four/content-runtime';
import { buildDarkestDungeonMap, drawDarkestDungeonLayout } from '../../game-engine/campaign/act-four/dungeon-map';
import { createGuardianQuest, startGuardianBattle } from '../../game-engine/campaign/act-four/guardian-quest';
import { setupFinalFormRuntime } from '../../game-engine/campaign/act-four/final-forms/final-form-runtime';
import type { FinalFormId } from '../../types/final-encounter';

const HERO_IDS = ['crusader', 'vestal', 'highwayman', 'hellion'];

export function createCommunityCheckpoint(): CampaignState {
  let campaign = selectParty(createNewCampaign(), HERO_IDS);
  campaign = { ...campaign, campaignProgress: { ...campaign.campaignProgress, defeatedBossFamilyIds: ['necromancer', 'prophet', 'collector'] } };
  campaign = unlockDarkestDungeonAct(campaign, { now: '2026-09-11T00:00:00.000Z' }).campaign;
  return completePostThirdThreatHamlet(campaign, { now: '2026-09-11T00:00:01.000Z' }).campaign;
}

export function createCommunityGuardianScenario(questIndex: 0 | 1 | 2, layoutIndex: 0 | 1 = 0): CampaignState {
  const quest = drawDarkestDungeonQuest(createCommunityCheckpoint(), { mode: 'community-reference', rng: () => (questIndex + 0.1) / 3, now: '2026-09-11T00:00:02.000Z' });
  if (!quest.ok) throw new Error(quest.reason ?? 'Community Quest failed');
  const content = activateDarkestDungeonContentSet(quest.campaign, { mode: 'community-reference', now: '2026-09-11T00:00:03.000Z' });
  if (!content.ok) throw new Error(content.reason ?? 'Community content failed');
  const layout = drawDarkestDungeonLayout(content.campaign, { mode: 'community-reference', rng: () => (layoutIndex + 0.1) / 2, now: '2026-09-11T00:00:04.000Z' });
  if (!layout.ok) throw new Error(layout.reason ?? 'Community layout failed');
  const map = buildDarkestDungeonMap(layout.campaign, { mode: 'community-reference', rng: () => 0.25, now: '2026-09-11T00:00:05.000Z' });
  if (!map.ok) throw new Error(map.reason ?? 'Community map failed');
  const created = createGuardianQuest(map.campaign, { mode: 'community-reference', now: '2026-09-11T00:00:06.000Z' });
  if (!created.ok || !created.quest) throw new Error(created.reason ?? 'Community Guardian Quest failed');
  const started = startGuardianBattle(created.campaign, created.quest.objectiveRoomId, { mode: 'community-reference', rng: () => 0.25, now: '2026-09-11T00:00:07.000Z' });
  if (!started.ok) throw new Error(started.reason ?? 'Community Guardian setup failed');
  return started.campaign;
}

export function createCommunityFinalScenario(): CampaignState {
  const campaign = createCommunityCheckpoint();
  let state = null;
  for (const formId of ['ancestor-first-form', 'ancestor-second-form', 'gestating-heart', 'heart-of-darkness'] as FinalFormId[]) {
    const result = setupFinalFormRuntime(state, 'e2e-community-final', formId, { mode: 'community-reference', seed: 11 });
    if (!result.ok || !result.state) throw new Error(result.reason ?? `Community Final setup failed: ${formId}`);
    state = result.state;
  }
  return {
    ...campaign,
    actFourState: {
      ...campaign.actFourState,
      stage: 'final-encounter-active',
      finalFormRuntimeState: state,
    },
  };
}
