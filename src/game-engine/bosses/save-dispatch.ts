import type {CampaignState, BattleState} from '../../types';
import type {BossEncounterState} from '../../types/boss-runtime';
import {encounterRuleDependencies, resolveBossDefinition} from './definitions';
import {validateThreatCheckpoint} from './threat-checkpoint';
import {validateProductionBossRoomStorage} from './room-storage';
import {assertBossEncounter} from './foundation';
import {validateLargeMovementContract} from '../rules/large-movement-contract';
import {validateActorOccupancy} from '../rules/actor-occupancy';

export function validateSavedBossDefinition(e: BossEncounterState): void {
  encounterRuleDependencies(e);
  const expected=resolveBossDefinition(e.bossFamily,e.bossLevel,e.ruleSetVersion);
  if (JSON.stringify(e.definition)!==JSON.stringify(expected) || e.battleCardId!==expected.battleCardId
    || e.threatAbilityCardId!==expected.threatAbilityCardId || e.bossIdentityCardId!==expected.bossIdentityCardId) throw new Error('Boss executable definition differs from its pinned contract');
  if (e.events.some(event=>event.ruleSetVersion!==e.ruleSetVersion
    || ![expected.battleCardId,expected.threatAbilityCardId].includes(event.sourceCardId))) throw new Error('Boss event identity/version mismatch');
  if (e.bossFamily==='prophet' && (e.side!=='THREAT' || e.phase!=='THREAT_ACTIVE' || e.bossState.actorId
    || e.inputs.length || e.pendingChoice || e.activeSummons.length || Object.keys(e.spawnDefinitions).length
    || Object.keys(e.summonSupply).length)) throw new Error('Prophet gameplay save requires R2B foundation acceptance');
}
export function validateBossBattleContracts(b: BattleState): void {
  if (b.bossEncounter) {
    validateSavedBossDefinition(b.bossEncounter);
    assertBossEncounter(b);
    if (b.bossEncounter.bossFamily==='prophet' && b.largeMovementContract) throw new Error('Prophet cannot inherit Necromancer overflow');
  }
  validateLargeMovementContract(b);
  validateActorOccupancy(b);
}
/** Shared save schema. Legacy Necromancer dependencies remain absent and resolve without rewriting bytes. */
export function validateBossSaveContracts(c: Partial<CampaignState>): void {
  if (c.bossEncounterCheckpoint) {
    validateSavedBossDefinition(c.bossEncounterCheckpoint);
    if (c.bossEncounterCheckpoint.checkpointContext) validateThreatCheckpoint(c as CampaignState,c.bossEncounterCheckpoint);
    else if (c.bossEncounterCheckpoint.bossFamily!=='necromancer') throw new Error('Successor checkpoint context missing');
  }
  for (const e of c.bossEncounterHistory ?? []) validateSavedBossDefinition(e);
  for (const receipt of c.bossRoomReturnHistory ?? []) validateSavedBossDefinition(receipt.encounter);
  if (c.battle) validateBossBattleContracts(c.battle);
  validateProductionBossRoomStorage(c);
}
