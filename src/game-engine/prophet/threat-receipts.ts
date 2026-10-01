import type { CampaignState } from '../../types';
import type { BossEncounterState } from '../../types/boss-runtime';
import { resolveBossDefinition, encounterRuleDependencies } from '../bosses/definitions';
import { assertBossEncounter } from '../bosses/foundation';
import { ruinsMonster } from '../ruins/source-registry';
import { validateRuinsDrawState } from '../ruins/encounter-draw';
import { resolveHeroDodge } from '../rules/hero-dodge';
import { validateProphetArchivedEncounter } from './production-runtime';

/** A checkpoint owns only its Quest receipts; the active Threat owns their disjoint lifetime union. */
export function validateProphetThreatReceipts(c: Partial<CampaignState>, current?: BossEncounterState): void {
  const histories=c.prophetQuestThreatHistory ?? [];
  if (!Array.isArray(histories) || new Set(histories.map(h=>h.questRunId)).size!==histories.length)
    throw new Error('Invalid Prophet Quest archive identities');
  const checkpoints: BossEncounterState[]=[];
  for (const h of histories) {
    const e=h.checkpoint,ctx=e?.checkpointContext;
    if (!ctx || ctx.questScope!=='STANDARD' || h.questRunId!==ctx.questRunId || h.activeThreatId!==ctx.threatId
      || !c.processedCampaignTransactionIds?.includes(`${ctx.encounterId}:standard-checkpoint-archive`)
      || h.drawState?.encounters.some(x=>!x.returned)) throw new Error('Invalid Prophet Quest archive linkage');
    checkpoints.push(e);
    encounterRuleDependencies(e);
    const definition=resolveBossDefinition('prophet',e.bossLevel,e.ruleSetVersion);
    if(e.battleCardId!==definition.battleCardId||e.threatAbilityCardId!==definition.threatAbilityCardId
      ||e.bossIdentityCardId!==definition.bossIdentityCardId||ctx.schemaVersion!==1||ctx.definitionVersion!==e.ruleSetVersion)
      throw new Error('Archived Prophet physical contract mismatch');
    const origin=e.prophetProduction?.replayOrigin;
    if(!origin)throw new Error('Archived Prophet source origin absent');
    assertBossEncounter({...origin,bossEncounter:e,heroes:[],monsters:[]});
    if(h.drawState) {
      validateRuinsDrawState(h.drawState);
      if(h.drawState.encounters.some(x=>!x.encounterId.startsWith(`${ctx.encounterId}:ordinary:`)))
        throw new Error('Archived Prophet draw belongs to another Quest');
    }
    if(e.side!=='THREAT' || e.phase!=='THREAT_ACTIVE' || e.bossState.actorId || e.pendingChoice || e.activeSummons.length)
      throw new Error('Archived Prophet Standard Quest must own a settled Threat');
    validateProphetArchivedEncounter(e);
  }
  for (const e of c.bossEncounterHistory ?? []) if (e.bossFamily==='prophet') checkpoints.push(e);
  for (const r of c.bossRoomReturnHistory ?? []) if (r.encounter.bossFamily==='prophet') checkpoints.push(r.encounter);
  const live=current ?? c.battle?.bossEncounter ?? c.bossEncounterCheckpoint;
  if (live?.bossFamily==='prophet') checkpoints.push(live);
  const encounterIds=new Set<string>(), all=new Map<string,string[]>();
  for (const e of checkpoints) {
    const ctx=e.checkpointContext;
    if (!ctx || e.bossFamily!=='prophet' || ctx.campaignId!==c.id || ctx.campaignLevel!==e.bossLevel
      || ctx.threatId!==`prophet-threat-level-${e.bossLevel}`
      || ctx.encounterId!==`${c.id}:${ctx.questRunId}:prophet:${e.bossLevel}` || ctx.battleId!==`${ctx.questRunId}:boss`
      || encounterIds.has(ctx.encounterId) || JSON.stringify(e.definition)!==JSON.stringify(resolveBossDefinition('prophet',e.bossLevel,e.ruleSetVersion)))
      throw new Error('Prophet Threat encounter identity mismatch');
    encounterIds.add(ctx.encounterId);
    for(const [id,binding] of Object.entries(ctx.heroDodgeBindings ?? {}))
      if(ctx.heroDodge[id]!==binding.value || JSON.stringify(binding)!==JSON.stringify(resolveHeroDodge(binding)))
        throw new Error('Archived Prophet Hero dependency binding mismatch');
    if(e.events.some(event=>event.ruleSetVersion!==e.ruleSetVersion || ![e.battleCardId,e.threatAbilityCardId].includes(event.sourceCardId)))
      throw new Error('Prophet Quest physical source identity mismatch');
    const receipts=e.events.filter(x=>x.eventType==='PROPHET_THREAT_APPLIED');
    const ids=receipts.map(x=>{
      const r=x.result as {once:string;transactionId:string;type:string;stress:number;
        spawn?:{definitionId:string;copyId:string;encounterId:string;actorId:string}};
      if (!r || r.once!==`${ctx.encounterId}:prophet-threat:${r.transactionId}` || !r.transactionId
        || x.ruleSetVersion!==e.ruleSetVersion || x.sourceCardId!==e.threatAbilityCardId
        || !c.processedCampaignTransactionIds?.includes(r.once)
        || (e.bossLevel===1 && (r.type!=='DUNGEON_ENTRY' || r.transactionId!==`${ctx.questRunId}:dungeon-entry` || r.stress!==2))
        || (e.bossLevel===2 && (r.type!=='SCOUTING' || r.stress!==1))
        || (e.bossLevel===3 && (r.type!=='MONSTER_SPAWN' || r.stress!==1)))
        throw new Error('Prophet Threat causal/physical receipt mismatch');
      if(ctx.playerRouteVersion){
        if(r.type==='SCOUTING' && (!r.transactionId.startsWith(`${ctx.questRunId}:scout:`)
          || !c.processedCampaignTransactionIds?.includes(r.transactionId))) throw new Error('Prophet Scout receipt provenance mismatch');
        if(r.type==='MONSTER_SPAWN'){
          const spawn=r.spawn;
          const draw=histories.find(h=>h.questRunId===ctx.questRunId)?.drawState
            ?? (c.dungeon?.questRunId===ctx.questRunId ? c.ruinsDrawState : undefined);
          const copy=draw?.encounters.find(a=>a.encounterId===spawn?.encounterId)?.monsters.find(m=>m.copyId===spawn?.copyId);
          if(!spawn || draw && (!copy || copy.definitionId!==spawn.definitionId) || !spawn.encounterId.startsWith(`${ctx.encounterId}:ordinary:`)
            || spawn.actorId!==`ruins:${spawn.encounterId}:${spawn.copyId}`
            || r.transactionId!==`ruins:${spawn.encounterId}:spawn:${spawn.actorId}`
            || !ruinsMonster(spawn.definitionId,'C1C32R2C-R-DIGITAL-DEFAULT-v6').tags.includes('Unholy')
            || !ruinsMonster(spawn.definitionId,'C1C32R2C-R-DIGITAL-DEFAULT-v6').physicalCopyIds.includes(spawn.copyId))
            throw new Error('Prophet physical spawn receipt provenance mismatch');
        }
      }
      return r.once;
    });
    if (new Set(ids).size!==ids.length || JSON.stringify(ids)!==JSON.stringify(ctx.consumedOnceKeys))
      throw new Error('Prophet Quest receipt/once-key mismatch');
    const previous=all.get(ctx.threatId) ?? [];
    if (ids.some(id=>previous.includes(id))) throw new Error('Duplicate lifetime Prophet receipt');
    all.set(ctx.threatId,[...previous,...ids]);
  }
  const rt=c.activeThreatRuntime;
  if (rt?.bossFamilyId==='prophet' && rt.bossDefinitionId.startsWith('prophet-source-level-')) {
    const union=all.get(rt.threatId) ?? [];
    if (rt.bossDefinitionId!==`prophet-source-level-${rt.campaignLevel}` || rt.threatId!==`prophet-threat-level-${rt.campaignLevel}`
      || new Set(rt.consumedOnceKeys).size!==rt.consumedOnceKeys.length
      || JSON.stringify(union.slice().sort())!==JSON.stringify(rt.consumedOnceKeys.slice().sort()))
      throw new Error('Prophet Threat global receipt union mismatch');
  }
}
