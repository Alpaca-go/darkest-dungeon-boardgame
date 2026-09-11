import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore, routeForPhase } from '../../store/useGameStore';
import { playUntil, runCommunityReferenceSetup } from './e2e-player-harness';
import { canSelectBossQuest, canSelectStandardQuest } from '../../game-engine/campaign/campaign-progress';
import { stableHashState } from '../../audit/core-campaign/types';

export default function E2ETestControls() {
  const campaign = useGameStore(s => s.campaign);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  if (import.meta.env.VITE_E2E_MODE !== '1') return null;
  const run = (target: 'quest-result' | 'quest-select') => {
    try {
      playUntil(target);
      const c = useGameStore.getState().campaign;
      if (c) navigate(routeForPhase(c.gamePhase));
    } catch (e) { setError(String(e)); }
  };
  return <aside data-testid="e2e-controls" style={{ position: 'relative', zIndex: 10000, background: '#171717' }}>
    <button data-testid="e2e-complete-quest" onClick={() => run('quest-result')}>E2E: Play quest</button>
    <button data-testid="e2e-finish-hamlet" onClick={() => run('quest-select')}>E2E: Finish preparation</button>
    <button data-testid="e2e-community-reference" onClick={() => { try { useGameStore.getState().replaceCampaign(runCommunityReferenceSetup()); } catch (e) { setError(String(e)); } }}>E2E: Community Reference</button>
    <output data-testid="e2e-error">{error}</output>
    <output data-testid="e2e-state">{JSON.stringify(campaign ? {
      hash: stableHashState({ ...campaign, updatedAt: undefined }), phase: campaign.gamePhase,
      act: campaign.act, campaignLevel: campaign.campaignLevel,
      completedQuestCount: campaign.completedQuestCount,
      standardCount: campaign.campaignProgress.completedStandardQuestsThisAct,
      bossQuestRequired: campaign.campaignProgress.bossQuestRequired,
      defeatedBossFamilyIds: campaign.campaignProgress.defeatedBossFamilyIds,
      darkestDungeonUnlocked: campaign.campaignProgress.darkestDungeonUnlocked,
      standardSelectable: canSelectStandardQuest(campaign.campaignProgress),
      bossSelectable: canSelectBossQuest(campaign.campaignProgress),
      outcome: campaign.lastQuestResult?.outcome,
      livingHeroes: campaign.heroes.filter(h => h.isAlive).length,
      waitingTokens: campaign.stagecoach.waitingTokens,
      runtimeProfileId: campaign.actFourState.contentRuntime?.runtimeProfileId,
      shufflingActorIds: campaign.actFourState.shufflingHorrorEncounterState?.actors.map(actor => actor.actorId),
    } : null)}</output>
  </aside>;
}
