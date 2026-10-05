import type {CampaignState} from '../../types';
import {startBossFoundation,resumeBossFoundation} from '../commands/boss-foundation';
import {prophetProductionDefinition} from './production-definition';
import {resolveHeroDodgeForHero,HERO_DODGE_V2} from '../rules/hero-dodge';
import {validateThreatCheckpoint} from '../bosses/threat-checkpoint';
import {applyProphetThreatEvent} from './production-threat';
import {nowIso} from '../random';

/** Explicit controlled foundation route; the unrestricted selector remains gated. */
export function reserveProphetFoundationEncounter(campaign:CampaignState,seed:number):CampaignState {
  if(campaign.runtimeContentProfile!=='community-complete-edition'||campaign.campaignProgress.activeBossFamilyId!=='prophet'
    ||campaign.currentQuestId!=='face-the-threat'||!campaign.dungeon||campaign.battle)throw new Error('Controlled Prophet foundation context required');
  if(campaign.bossEncounterCheckpoint){validateThreatCheckpoint(campaign,campaign.bossEncounterCheckpoint);return campaign;}
  const level=campaign.campaignProgress.campaignLevel,definition=prophetProductionDefinition(level);
  if(campaign.campaignProgress.activeThreatId!==`prophet-threat-level-${level}`)throw new Error('Prophet Threat level mismatch');
  const room=campaign.dungeon.rooms.find(r=>r.type==='objective');if(!room)throw new Error('Boss objective Room required');
  const bindings=Object.fromEntries(campaign.heroes.filter(h=>!h.dead).map(h=>[`u_${h.instanceId}`,
    resolveHeroDodgeForHero(h,HERO_DODGE_V2)]));
  let next=startBossFoundation(campaign,definition,seed,room.id,
    Object.fromEntries(campaign.heroes.filter(h=>!h.dead).map(h=>[h.instanceId,bindings[`u_${h.instanceId}`].value])),[]);
  const e=next.battle!.bossEncounter!;
  e.checkpointContext!.heroDodgeBindings=bindings;e.checkpointContext!.dependencyAuthority='OFFICIAL_SOURCE';e.checkpointContext!.questScope='FACE_THE_THREAT';
  next={...next,battle:null,gamePhase:'dungeon-explore',bossEncounterCheckpoint:e,
    activeThreatRuntime:{threatId:`prophet-threat-level-${level}`,bossFamilyId:'prophet',bossDefinitionId:`prophet-source-level-${level}`,
      campaignLevel:level,drawTransactionId:`${e.checkpointContext!.encounterId}:controlled-threat`,drawnAt:nowIso(),active:true,
      deactivatedAt:null,deactivationTransactionId:null,consumedOnceKeys:[]},
    bossRoomStorage:{roomId:room.id,roomCardId:44710,tileId:'ruins-tile-11',encounterId:e.checkpointContext!.encounterId,lifecycle:'RESERVED'}};
  return applyProphetThreatEvent(next,{type:'DUNGEON_ENTRY',transactionId:`${campaign.dungeon.questRunId}:dungeon-entry`});
}
export function enterProphetFoundationRoom(campaign:CampaignState):CampaignState {
  if(campaign.bossRoomStorage?.lifecycle!=='RESERVED'||campaign.bossEncounterCheckpoint?.bossFamily!=='prophet')throw new Error('Prophet Room reservation required');
  return resumeBossFoundation(campaign,campaign.bossRoomStorage.roomId);
}
