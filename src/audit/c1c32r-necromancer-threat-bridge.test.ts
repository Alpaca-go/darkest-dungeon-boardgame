import { describe, expect, it } from 'vitest';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../game-engine/campaign';
import { commitQuestSelection, commitLeaveDungeon, commitQuestFailureFromDefeat } from '../game-engine/commands/quest';
import { commitBattleRetreat } from '../game-engine/commands/battle';
import { enterProductionBossRoom, applyBossThreatCheckpointInput } from '../game-engine/commands/boss-foundation';
import { explicitlyMigrateHeroDodgeToV2 } from '../game-engine/rules/hero-dodge-versioning';
import { seededRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { failCampaign } from '../game-engine/stagecoach';
import { finishQuest } from '../game-engine/quest-result';
import { returnProductionBossRoomOnTermination } from '../game-engine/bosses/room-storage';
import type { CampaignState } from '../types';

function selected(level: 1 | 2 | 3 = 1): CampaignState {
  return withRuntimeSources(seededRuntimeSources(3232), () => {
    let c = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), ['crusader','highwayman','vestal','hellion']));
    c.gamePhase = 'quest-select';
    Object.assign(c.campaignProgress, { campaignLevel: level, act: level, activeBossFamilyId: 'necromancer',
      activeThreatId: `necromancer-threat-level-${level}`, pendingThreatInitialization: false,
      completedStandardQuestsThisAct: 2, bossQuestRequired: true });
    c = explicitlyMigrateHeroDodgeToV2(c, 'C1C32R-storage-review');
    const chosen = commitQuestSelection(c, 'face-the-threat');
    if (!chosen.ok) throw new Error(chosen.error!);
    return chosen.campaign;
  });
}
function roundtrip(c: CampaignState): CampaignState {
  const save = createSaveSnapshot(c);
  expect(validateSaveFile(save)).toBeNull();
  const reloaded = restoreSaveSnapshot(JSON.parse(JSON.stringify(save)));
  expect(reloaded).toEqual(c);
  return reloaded;
}

describe('C1C32R physical Room termination transactions (scoped command coverage)', () => {
  for (const level of [1, 2, 3] as const) {
    it(`Level ${level}: rejects voluntary exit without changing reserved identity/RNG`, () => {
      const c = roundtrip(selected(level));
      const rejected = commitLeaveDungeon(c);
      expect(rejected).toMatchObject({ ok: false, error: 'boss-quest-cannot-leave' });
      expect(rejected.campaign).toBe(c);
      expect(commitQuestSelection(c, 'face-the-threat').campaign).toBe(c);
    });
    it(`Level ${level}: preserves RESERVED/RETURNED saves when the campaign terminates`, () => {
      const c = roundtrip(selected(level));
      const ended = failCampaign(c, 'storage termination test');
      expect(ended.bossRoomStorage).toEqual({ ...c.bossRoomStorage, lifecycle: 'RETURNED' });
      expect(ended.bossEncounterCheckpoint).toBeNull();
      expect(ended.bossRoomReturnHistory![0].encounter).toEqual(c.bossEncounterCheckpoint);
      expect(ended.bossRoomReturnHistory![0].previousLifecycle).toBe('RESERVED');
      expect(ended.bossEncounterHistory ?? []).toHaveLength(0);
      expect(failCampaign(ended, 'again')).toBe(ended);
      roundtrip(ended);
    });
    it(`Level ${level}: production failure returns IN_PLAY ownership without claiming Boss victory`, () => {
      const c = selected(level);
      const entered = roundtrip(enterProductionBossRoom(c, c.bossRoomStorage!.roomId));
      expect(commitBattleRetreat(entered)).toMatchObject({ ok: false, error: 'boss-quest-cannot-retreat' });
      // Explicit defeat fault injection verifies the termination boundary only, never acceptance combat.
      const defeated = { ...entered, battle: { ...entered.battle!, status: 'defeat' as const } };
      const failed = commitQuestFailureFromDefeat(defeated);
      expect(failed.ok).toBe(true);
      expect(failed.campaign.gamePhase).toBe('campaign-over');
      expect(failed.campaign.bossRoomReturnHistory![0].previousLifecycle).toBe('IN_PLAY');
      expect(failed.campaign.bossRoomStorage!.encounterId).toBe(c.bossRoomStorage!.encounterId);
      expect(failed.campaign.campaignProgress.campaignLevel).toBe(level);
      expect(failed.campaign.bossEncounterHistory ?? []).toHaveLength(0);
      roundtrip(failed.campaign);
      expect(commitBattleRetreat(defeated).campaign).toEqual(failed.campaign);
    });
  }
  it('returns a cancelled reservation once, before the shared Quest result clears state', () => {
    const c = selected();
    const ended = withRuntimeSources(seededRuntimeSources(42), () => finishQuest(c, 'left'));
    expect(ended.bossRoomStorage!.lifecycle).toBe('RETURNED');
    expect(ended.bossRoomReturnHistory![0].reason).toBe('incomplete');
    expect(finishQuest(ended, 'left')).toBe(ended);
    expect(returnProductionBossRoomOnTermination(ended, 'failed')).toBe(ended);
    roundtrip(ended);
  });
  it('archives pending Preparation Day candidates and causal events without resolving them on failure', () => {
    let c=selected(2);
    const rolls=Object.fromEntries(Object.keys(c.bossEncounterCheckpoint!.checkpointContext!.heroDodge).map(id=>[id,1]));
    c=applyBossThreatCheckpointInput(c,{type:'PREPARATION_DAY',rolls});
    const ended=failCampaign(roundtrip(c),'terminal failure');
    const archived=ended.bossRoomReturnHistory![0].encounter;
    expect(archived.pendingChoice).toEqual(c.bossEncounterCheckpoint!.pendingChoice);
    expect(archived.events).toEqual(c.bossEncounterCheckpoint!.events);
    expect(archived.rngState).toBe(c.bossEncounterCheckpoint!.rngState);
    roundtrip(ended);
  });
  for (const mutation of ['card', 'campaign', 'transaction', 'rule', 'receipt'] as const) {
    it(`rejects forged RETURNED ${mutation} provenance`, () => {
      const ended = failCampaign(selected(), 'termination');
      const save = createSaveSnapshot(ended);
      const c = save.campaign;
      if (mutation === 'card') c.bossRoomStorage!.roomCardId++;
      if (mutation === 'campaign') c.bossRoomReturnHistory![0].campaignId = 'another-campaign';
      if (mutation === 'transaction') c.processedCampaignTransactionIds = [];
      if (mutation === 'rule') c.bossRoomReturnHistory![0].encounter.definition.stats.HP++;
      if (mutation === 'receipt') c.bossRoomReturnHistory = [];
      expect(validateSaveFile(save)).not.toBeNull();
      expect(() => restoreSaveSnapshot(save)).toThrow();
    });
  }
});
