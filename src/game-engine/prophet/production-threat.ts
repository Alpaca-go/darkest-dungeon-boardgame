import type {BattleState,CampaignState} from '../../types';
import contract from '../../../docs/data/complete-edition/c1c35r2-prophet-threat-contract.json';
import {applyStressBatch} from '../stress';
import {recordBossRuntimeEvent,withBossEncounterSources} from '../bosses/foundation';
import {withTransactionRecorded} from '../campaign/campaign-orchestrator';
import {validateThreatCheckpoint} from '../bosses/threat-checkpoint';
import {ruinsMonster} from '../ruins/source-registry';

export type ProphetThreatEvent={type:'DUNGEON_ENTRY'|'SCOUTING';transactionId:string}
  |{type:'MONSTER_SPAWN';transactionId:string;actorId:string;tags:string[]};
/** Only authoritative campaign/spawn commits call this hook. UI/array observation never does. */
export function applyProphetThreatEvent(campaign:CampaignState,event:ProphetThreatEvent):CampaignState {
  const saved=campaign.bossEncounterCheckpoint,rt=campaign.activeThreatRuntime;
  if(saved?.bossFamily!=='prophet'||!rt?.active||rt.bossDefinitionId!==`prophet-source-level-${saved.bossLevel}`)return campaign;
  validateThreatCheckpoint(campaign,saved);
  if(!event.transactionId||event.type==='MONSTER_SPAWN'&&!campaign.battle?.monsters.some(m=>m.id===event.actorId&&m.isAlive))throw new Error('Threat requires committed causal transaction');
  if(event.type==='DUNGEON_ENTRY'&&event.transactionId!==`${campaign.dungeon!.questRunId}:dungeon-entry`
    ||event.type==='MONSTER_SPAWN'&&event.transactionId!==`${campaign.battle!.battleId}:spawn:${event.actorId}`)
    throw new Error('Prophet Threat causal transaction identity mismatch');
  const hook=contract.requiredHooks.find(h=>h.level===saved.bossLevel)!;
  const tags=event.type==='MONSTER_SPAWN'?ruinsMonster(campaign.battle!.monsters.find(m=>m.id===event.actorId)!.sourceId,
    campaign.battle!.ruinsContext!.ruleSetVersion).tags:[];
  const eligible=event.type===hook.trigger||event.type==='MONSTER_SPAWN'&&hook.trigger==='UNHOLY_MONSTER_SPAWN_IN_BATTLE'&&tags.includes('Unholy');
  if(!eligible)return campaign;
  const once=`${saved.checkpointContext!.encounterId}:prophet-threat:${event.transactionId}`;
  if(rt.consumedOnceKeys.includes(once))return campaign;
  let result=structuredClone(campaign),e=result.bossEncounterCheckpoint!;
  const shell:BattleState={battleId:e.checkpointContext!.battleId,sourceRoomId:e.roomId,status:'active',round:e.round,maxRounds:4,
    heroes:[],monsters:[],initiativeOrder:[],initiativeIndex:-1,activeActorId:null,currentActionPoints:0,selectedSkillId:null,selectedTargetId:null,battleLog:[],rewards:{gold:0},bossEncounter:e};
  const updated=withBossEncounterSources(shell,b=>{
    result=applyStressBatch(result,result.heroes.filter(h=>!h.dead).map(h=>({heroId:h.instanceId,amount:hook.stress,
      sourceType:'exploration' as const,sourceId:String(e.threatAbilityCardId),questId:result.currentQuestId??'',batchId:once}))).campaign;
    recordBossRuntimeEvent(b,'PROPHET_THREAT_APPLIED',{transactionId:event.transactionId,once,type:event.type,stress:hook.stress},
      result.heroes.filter(h=>!h.dead).map(h=>`u_${h.instanceId}`));return b;});
  e=updated.bossEncounter!;e.checkpointContext!.consumedOnceKeys.push(once);
  return withTransactionRecorded({...result,bossEncounterCheckpoint:e,activeThreatRuntime:{...result.activeThreatRuntime!,
    consumedOnceKeys:[...result.activeThreatRuntime!.consumedOnceKeys,once]}},once);
}
export function prophetTavernRecoveryModifier(level:1|2|3):number {return contract.requiredHooks.find(h=>h.level===level)!.tavernRecoveryModifier;}
