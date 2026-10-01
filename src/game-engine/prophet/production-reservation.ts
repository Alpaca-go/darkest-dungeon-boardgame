import type { CampaignState } from '../../types';
import { startBossFoundation } from '../commands/boss-foundation';
import { prophetProductionDefinition } from './production-definition';
import { prophetProductionDependencyGate } from './production-dependency-gate';
import { HERO_DODGE_V2, resolveHeroDodge } from '../rules/hero-dodge';
import { validateThreatCheckpoint } from '../bosses/threat-checkpoint';
import { applyProphetThreatEvent } from './production-threat';

/** Player entry derives its seed from authoritative Quest/family/level identity. Reload never rebinds. */
export function reserveProphetProductionEncounter(campaign: CampaignState): CampaignState {
  if (campaign.bossEncounterCheckpoint) { validateThreatCheckpoint(campaign,campaign.bossEncounterCheckpoint); return campaign; }
  const level=campaign.campaignProgress.campaignLevel;
  if (!prophetProductionDependencyGate(campaign,level).enabled) throw new Error('Prophet production dependencies unavailable');
  if (!campaign.activeThreatRuntime?.active || campaign.activeThreatRuntime.bossFamilyId!=='prophet'
    || campaign.activeThreatRuntime.threatId!==campaign.campaignProgress.activeThreatId) throw new Error('Active production Prophet Threat required');
  if (campaign.ruinsDrawState?.encounters.some(e=>!e.returned)) throw new Error('Previous Quest owns ordinary encounter cards');
  if (campaign.ruinsDrawState) campaign={...campaign,ruinsDrawState:undefined};
  const face=campaign.currentQuestId==='face-the-threat';
  const room=campaign.dungeon?.rooms.find(r=>face?r.type==='objective':r.id===campaign.dungeon?.currentRoomId);
  if (!room) throw new Error('Production Quest Room required');
  const definition=prophetProductionDefinition(level);
  const bindings=Object.fromEntries(campaign.heroes.filter(h=>!h.dead).map(h=>[`u_${h.instanceId}`,resolveHeroDodge({heroId:h.heroId,level:h.level,ruleSetVersion:HERO_DODGE_V2})]));
  const seed=Array.from(`${campaign.dungeon!.questRunId}:prophet:${level}`).reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);
  const bound=startBossFoundation(campaign,definition,seed,room.id,Object.fromEntries(campaign.heroes.filter(h=>!h.dead).map(h=>[h.instanceId,bindings[`u_${h.instanceId}`].value])),[]);
  const e=bound.battle!.bossEncounter!;
  e.checkpointContext!.heroDodgeBindings=bindings;e.checkpointContext!.dependencyAuthority='OFFICIAL_SOURCE';
  e.checkpointContext!.questScope=face?'FACE_THE_THREAT':'STANDARD';e.checkpointContext!.consumedOnceKeys=[];
  e.checkpointContext!.playerRouteVersion='C1C36-PROPHET-PLAYER-ROUTE-v1';
  return applyProphetThreatEvent({...campaign,bossEncounterCheckpoint:e,...(face?{bossRoomStorage:{roomId:room.id,roomCardId:definition.roomCardId,tileId:'ruins-tile-11',encounterId:e.checkpointContext!.encounterId,lifecycle:'RESERVED' as const}}:{})},
    {type:'DUNGEON_ENTRY',transactionId:`${campaign.dungeon!.questRunId}:dungeon-entry`});
}
