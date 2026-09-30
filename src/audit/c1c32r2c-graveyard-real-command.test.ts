import { describe, expect, it } from 'vitest';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../game-engine/campaign';
import { commitLeaveDungeon, commitQuestSelection } from '../game-engine/commands/quest';
import { applyBossThreatCheckpointInput } from '../game-engine/commands/boss-foundation';
import { applyNecromancerPreparationDayGraveyard } from '../game-engine/campaign/necromancer-graveyard';
import { explicitlyMigrateHeroDodgeToV2 } from '../game-engine/rules/hero-dodge-versioning';
import { seededRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { applyStress } from '../game-engine/stress';
import type { CampaignState } from '../types';

function pendingNextQuest(): CampaignState {
  return withRuntimeSources(seededRuntimeSources(32322), () => {
    let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
      ['crusader', 'highwayman', 'vestal', 'hellion']));
    campaign.gamePhase = 'quest-select';
    Object.assign(campaign.campaignProgress, { campaignLevel: 2, act: 2, activeBossFamilyId: 'necromancer',
      activeThreatId: 'necromancer-threat-level-2', pendingThreatInitialization: false,
      completedStandardQuestsThisAct: 2, bossQuestRequired: true });
    campaign = explicitlyMigrateHeroDodgeToV2(campaign, 'C1C32R2C-real-command-proof');
    const selected = commitQuestSelection(campaign, 'face-the-threat');
    if (!selected.ok) throw new Error(selected.error!);
    campaign = applyBossThreatCheckpointInput(selected.campaign, { type: 'PREPARATION_DAY',
      rolls: Object.fromEntries(selected.campaign.heroes.map((hero, index) => [`u_${hero.instanceId}`, index + 1])) });
    // Isolate the already accepted Preparation Day domain command. Full route belongs to R3.
    campaign = { ...campaign, gamePhase: 'hamlet', hamlet: { ...campaign.hamlet, currentDay: 1 } };
    const receiptSource = applyNecromancerPreparationDayGraveyard(campaign, true);
    const nextQuest = selectParty(createNewCampaign(), ['crusader', 'highwayman', 'vestal', 'hellion']);
    return { ...nextQuest, id: receiptSource.id, heroes: receiptSource.heroes,
      necromancerGraveyardReceipts: receiptSource.necromancerGraveyardReceipts,
      processedCampaignTransactionIds: receiptSource.processedCampaignTransactionIds, gamePhase: 'quest-select' };
  });
}

function reload(campaign: CampaignState): CampaignState {
  const snapshot = JSON.parse(JSON.stringify(createSaveSnapshot(campaign)));
  expect(validateSaveFile(snapshot)).toBeNull();
  const restored = restoreSaveSnapshot(snapshot);
  expect(restored).toEqual(campaign);
  return restored;
}

describe('C1C32R2C Graveyard real Quest command lifecycle', () => {
  it('uses actual Quest selection, then a legal Standard Quest end command, preserving both saves', () => {
    const pending = reload(pendingNextQuest());
    expect(pending.necromancerGraveyardReceipts![0].lifecycle).toBe('PENDING_NEXT_QUEST');
    const result = withRuntimeSources(seededRuntimeSources(99), () => commitQuestSelection(pending, 'scout-ahead'));
    expect(result.ok).toBe(true);
    const active = reload(result.campaign);
    expect(active.necromancerGraveyardReceipts![0]).toMatchObject({ lifecycle: 'ACTIVE_QUEST',
      targetQuestRunId: active.dungeon!.questRunId });
    const ended = commitLeaveDungeon(active);
    expect(ended.ok).toBe(true);
    expect(reload(ended.campaign).necromancerGraveyardReceipts![0].lifecycle).toBe('EXPIRED');
  });

  it('kills at Stress 10 after reload through the Stress/death pipeline without another Resolve Test', () => {
    const selected = withRuntimeSources(seededRuntimeSources(99), () => commitQuestSelection(pendingNextQuest(), 'scout-ahead'));
    expect(selected.ok).toBe(true);
    const heroId = selected.campaign.necromancerGraveyardReceipts![0].heroInstanceId;
    const nine = applyStress(selected.campaign, { heroId, amount: 9, sourceType: 'battle-skill',
      sourceId: 'printed-stress-proof', questId: selected.campaign.currentQuestId! }).campaign;
    const beforeFatal = reload(nine);
    expect(beforeFatal.heroes.find(hero => hero.instanceId === heroId)?.stress).toBe(9);
    const killed = applyStress(beforeFatal, { heroId, amount: 1, sourceType: 'battle-skill',
      sourceId: 'printed-stress-proof', questId: beforeFatal.currentQuestId! });
    expect(killed.campaign.heroes.find(hero => hero.instanceId === heroId)?.dead).toBe(true);
    expect(killed.result.resolveTest).toBeUndefined();
    expect(killed.campaign.deathRecords.at(-1)?.sourceSkillId).toBe('official-graveyard-stress-10');
    reload(killed.campaign);
  });
});
