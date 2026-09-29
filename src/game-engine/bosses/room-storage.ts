import type { CampaignState } from '../../types';
import { resolveBossDefinition } from './definitions';
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
    if (!history?.cleanupState.completed || !history.cleanupState.roomCleaned || !history.cleanupState.campaignTransactionId)
      throw new Error('Returned Room lacks committed cleanup provenance');
    return;
  }
  if (!encounter || storage.encounterId!==encounter.checkpointContext?.encounterId
    || storage.roomId!==campaign.dungeon?.rooms.find(r=>r.type==='objective')?.id) throw new Error('Production Room ownership mismatch');
  const definition=resolveBossDefinition(encounter.bossFamily,encounter.bossLevel,encounter.ruleSetVersion);
  if (storage.roomCardId!==definition.roomCardId || definition.roomNumber!==10) throw new Error('Production Room card mismatch');
  if (storage.lifecycle==='RESERVED' && (encounter.side!=='THREAT' || campaign.battle?.bossEncounter)
    || storage.lifecycle==='IN_PLAY' && (!campaign.battle?.bossEncounter || encounter.side!=='ABILITY' || encounter.roomId!==storage.roomId)) throw new Error('Production Room lifecycle mismatch');
}
