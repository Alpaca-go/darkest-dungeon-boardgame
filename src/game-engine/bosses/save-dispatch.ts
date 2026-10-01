import type {CampaignState, BattleState} from '../../types';
import type {BossEncounterState} from '../../types/boss-runtime';
import {encounterRuleDependencies, resolveBossDefinition} from './definitions';
import {validateThreatCheckpoint} from './threat-checkpoint';
import {validateProductionBossRoomStorage} from './room-storage';
import {assertBossEncounter} from './foundation';
import {validateLargeMovementContract} from '../rules/large-movement-contract';
import {validateActorOccupancy} from '../rules/actor-occupancy';
import {validateProphetProduction,validateProphetArchivedEncounter} from '../prophet/production-runtime';

export function validateSavedBossDefinition(e: BossEncounterState): void {
  encounterRuleDependencies(e);
  const expected=resolveBossDefinition(e.bossFamily,e.bossLevel,e.ruleSetVersion);
  if (JSON.stringify(e.definition)!==JSON.stringify(expected) || e.battleCardId!==expected.battleCardId
    || e.threatAbilityCardId!==expected.threatAbilityCardId || e.bossIdentityCardId!==expected.bossIdentityCardId) throw new Error('Boss executable definition differs from its pinned contract');
  if (e.events.some(event=>event.ruleSetVersion!==e.ruleSetVersion
    || ![expected.battleCardId,expected.threatAbilityCardId].includes(event.sourceCardId))) throw new Error('Boss event identity/version mismatch');
  if (e.bossFamily==='prophet' && !e.prophetProduction && (e.side!=='THREAT' || e.phase!=='THREAT_ACTIVE' || e.bossState.actorId
    || e.inputs.length || e.pendingChoice || e.activeSummons.length || Object.keys(e.spawnDefinitions).length
    || Object.keys(e.summonSupply).length)) throw new Error('Prophet gameplay save requires R2B foundation acceptance');
}
export function validateBossBattleContracts(b: BattleState): void {
  if (b.bossEncounter) {
    validateSavedBossDefinition(b.bossEncounter);
    assertBossEncounter(b);
    if(b.bossEncounter.bossFamily==='prophet'&&b.bossEncounter.prophetProduction)validateProphetProduction(b);
    if (b.bossEncounter.bossFamily==='prophet' && b.largeMovementContract) throw new Error('Prophet cannot inherit Necromancer overflow');
  }
  validateLargeMovementContract(b);
  validateActorOccupancy(b);
}
/** Shared save schema. Legacy Necromancer dependencies remain absent and resolve without rewriting bytes. */
export function validateBossSaveContracts(c: Partial<CampaignState>): void {
  if (c.bossEncounterCheckpoint) {
    validateSavedBossDefinition(c.bossEncounterCheckpoint);
    validateProphetArchivedEncounter(c.bossEncounterCheckpoint);
    if(c.bossEncounterCheckpoint.prophetProduction){const bindings=c.bossEncounterCheckpoint.prophetProduction.entryBindings;
      if(c.heroes?.filter(h=>!h.dead).some(h=>bindings[`u_${h.instanceId}`]?.stance!==h.stance))throw new Error('Reserved Prophet Hero Stance changed without transaction');}
    if (c.bossEncounterCheckpoint.checkpointContext) validateThreatCheckpoint(c as CampaignState,c.bossEncounterCheckpoint);
    else if (c.bossEncounterCheckpoint.bossFamily!=='necromancer') throw new Error('Successor checkpoint context missing');
  }
  for (const e of c.bossEncounterHistory ?? []) {validateSavedBossDefinition(e);validateProphetArchivedEncounter(e);}
  for (const receipt of c.bossRoomReturnHistory ?? []) {validateSavedBossDefinition(receipt.encounter);validateProphetArchivedEncounter(receipt.encounter);}
  if(c.battle?.bossEncounter?.prophetProduction){
    const e=c.battle.bossEncounter,ctx=e.checkpointContext;
    if(!ctx||ctx.campaignId!==c.id||ctx.questRunId!==c.dungeon?.questRunId||ctx.battleId!==c.battle.battleId
      ||ctx.campaignLevel!==c.campaignProgress?.campaignLevel||ctx.threatId!==c.campaignProgress.activeThreatId
      ||e.bossFamily!==c.campaignProgress.activeBossFamilyId)throw new Error('Live Prophet campaign identity mismatch');
    const receipts=e.events.filter(event=>event.eventType==='PROPHET_THREAT_APPLIED').map(event=>(event.result as {once:string}).once);
    if(JSON.stringify(receipts)!==JSON.stringify(ctx.consumedOnceKeys)||JSON.stringify(receipts)!==JSON.stringify(c.activeThreatRuntime?.consumedOnceKeys??[])
      ||receipts.some(id=>!c.processedCampaignTransactionIds?.includes(id)))throw new Error('Live Prophet Threat receipt mismatch');
  }
  if (c.battle) validateBossBattleContracts(c.battle);
  validateProductionBossRoomStorage(c);
}
