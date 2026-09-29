import type { CampaignState } from '../../types';
import { resolveBossDefinition } from './definitions';
import { withTransactionRecorded } from '../campaign/campaign-orchestrator';

export function hasUnfinishedProductionBossQuest(campaign: CampaignState): boolean {
  return campaign.currentQuestId === 'face-the-threat' && !!campaign.bossRoomStorage
    && campaign.bossRoomStorage.lifecycle !== 'RETURNED';
}

/** Return physical ownership at Quest termination; preserve the encounter without claiming victory. */
export function returnProductionBossRoomOnTermination(campaign: CampaignState, reason: 'incomplete' | 'failed'): CampaignState {
  const storage = campaign.bossRoomStorage;
  if (!storage || storage.lifecycle === 'RETURNED') return campaign;
  validateProductionBossRoomStorage(campaign);
  const encounter = campaign.battle?.bossEncounter ?? campaign.bossEncounterCheckpoint;
  const context = encounter?.checkpointContext;
  if (!encounter || !context) throw new Error('Room termination requires encounter ownership');
  const transactionId = `${context.encounterId}:room-return:${reason}`;
  const receipt: NonNullable<CampaignState['bossRoomReturnHistory']>[number] = {
    transactionId, campaignId: campaign.id, questRunId: context.questRunId, encounterId: context.encounterId,
    roomId: storage.roomId, roomCardId: storage.roomCardId, tileId: storage.tileId,
    ruleSetVersion: encounter.ruleSetVersion, previousLifecycle: storage.lifecycle, reason,
    encounter: structuredClone(encounter),
  };
  return withTransactionRecorded({ ...campaign, battle: null, bossEncounterCheckpoint: null,
    bossRoomStorage: { ...storage, lifecycle: 'RETURNED' },
    bossRoomReturnHistory: [...(campaign.bossRoomReturnHistory ?? []), receipt],
  }, transactionId);
}
/** Campaign storage owns the physical card/tile; encounter state holds only its Room reference. */
export function validateProductionBossRoomStorage(campaign: Partial<CampaignState>): void {
  const storage=campaign.bossRoomStorage;
  const encounter=campaign.battle?.bossEncounter ?? campaign.bossEncounterCheckpoint;
  if (!storage) {
    if (encounter?.checkpointContext?.heroDodgeBindings) throw new Error('Production Room storage absent');
    return;
  }
  if (!['RESERVED','IN_PLAY','RETURNED'].includes(storage.lifecycle) || storage.tileId!=='tile-10'
    || !storage.roomId || !storage.encounterId) throw new Error('Production Room storage invalid');
  if (storage.lifecycle==='RETURNED') {
    const history=campaign.bossEncounterHistory?.find(e=>e.checkpointContext?.encounterId===storage.encounterId);
    const receipt=campaign.bossRoomReturnHistory?.find(r=>r.encounterId===storage.encounterId);
    const owner=history ?? receipt?.encounter;
    if (!owner || owner.checkpointContext?.campaignId!==campaign.id
      || owner.checkpointContext?.encounterId!==storage.encounterId || owner.roomId!==storage.roomId
      || storage.roomCardId!==resolveBossDefinition(owner.bossFamily,owner.bossLevel,owner.ruleSetVersion).roomCardId)
      throw new Error('Returned Room ownership mismatch');
    if (JSON.stringify(owner.definition)!==JSON.stringify(resolveBossDefinition(owner.bossFamily,owner.bossLevel,owner.ruleSetVersion))
      || owner.events.some(event=>event.ruleSetVersion!==owner.ruleSetVersion)) throw new Error('Returned Room contract mismatch');
    if (history?.cleanupState.completed && history.cleanupState.roomCleaned && history.cleanupState.campaignTransactionId) return;
    if (!receipt || !['incomplete','failed'].includes(receipt.reason)
      || !['RESERVED','IN_PLAY'].includes(receipt.previousLifecycle)
      || receipt.campaignId!==campaign.id || receipt.roomId!==storage.roomId || receipt.roomCardId!==storage.roomCardId
      || receipt.tileId!==storage.tileId || receipt.ruleSetVersion!==owner.ruleSetVersion
      || receipt.previousLifecycle==='RESERVED' && owner.side!=='THREAT'
      || receipt.previousLifecycle==='IN_PLAY' && owner.side!=='ABILITY'
      || receipt.questRunId!==owner.checkpointContext?.questRunId
      || receipt.transactionId!==`${receipt.encounterId}:room-return:${receipt.reason}`
      || !campaign.processedCampaignTransactionIds?.includes(receipt.transactionId)
      || campaign.bossEncounterCheckpoint?.checkpointContext?.encounterId===storage.encounterId
      || campaign.battle?.bossEncounter?.checkpointContext?.encounterId===storage.encounterId)
      throw new Error('Returned Room lacks committed termination provenance');
    return;
  }
  if (!encounter || storage.encounterId!==encounter.checkpointContext?.encounterId
    || storage.roomId!==campaign.dungeon?.rooms.find(r=>r.type==='objective')?.id) throw new Error('Production Room ownership mismatch');
  const definition=resolveBossDefinition(encounter.bossFamily,encounter.bossLevel,encounter.ruleSetVersion);
  if (storage.roomCardId!==definition.roomCardId || definition.roomNumber!==10) throw new Error('Production Room card mismatch');
  if (storage.lifecycle==='RESERVED' && (encounter.side!=='THREAT' || campaign.battle?.bossEncounter)
    || storage.lifecycle==='IN_PLAY' && (!campaign.battle?.bossEncounter || encounter.side!=='ABILITY' || encounter.roomId!==storage.roomId)) throw new Error('Production Room lifecycle mismatch');
}
