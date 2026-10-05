import type { CampaignState } from '../../types';
import { RUINS_V6 } from '../../types/ruins-executable';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter } from '../ruins/encounter-draw';
import { beginOrdinaryRuinsBattle } from '../ruins/battle-runtime';
import { validateThreatCheckpoint } from '../bosses/threat-checkpoint';
import { advanceTurn } from '../battle';

/** Prophet observes the accepted Ruins spawn commits; Necromancer reanimation is never installed. */
export function enterProphetProductionOrdinary(campaign: CampaignState, roomId: string): CampaignState {
  const e=campaign.bossEncounterCheckpoint;
  if (!e || e.bossFamily!=='prophet' || campaign.battle || !campaign.dungeon
    || campaign.dungeon.currentRoomId!==roomId || campaign.ruinsRuleSetSelection?.ruleSetVersion!==RUINS_V6)
    throw new Error('Production Prophet ordinary Room unavailable');
  validateThreatCheckpoint(campaign,e);
  const ctx=e.checkpointContext!;
  const seed=Array.from(`${campaign.id}:${ctx.questRunId}:${ctx.threatId}:ruins-v6`)
    .reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);
  const encounterId=`${ctx.encounterId}:ordinary:${roomId}`;
  const draw=campaign.ruinsDrawState ?? createRuinsDrawState(e.bossLevel,seed,RUINS_V6);
  const entered=beginOrdinaryRuinsBattle({...campaign,ruinsDrawState:drawOrdinaryRuinsEncounter(draw,encounterId,
    Object.fromEntries(campaign.heroes.filter(h=>!h.dead).map(h=>[h.instanceId,h.stance])))},encounterId);
  const battle=entered.battle!;
  Object.assign(battle,{boss:null,roundLimitEnabled:true,initiativeCards:[],initiativeDrawPile:[],resolvedInitiativeCardIds:[],
    pendingAction:null,pendingRuleEvents:[],pendingDiseaseInfections:[]});
  battle.heroes=battle.heroes.map(h=>({...h,equippedTrinketInstanceIds:entered.heroes.find(hero=>hero.instanceId===h.sourceId)!.equippedTrinkets.map(t=>t.instanceId)}));
  battle.monsters=battle.monsters.map(m=>({...m,quirkIds:[],equippedTrinketInstanceIds:[],diseaseId:null,diseaseInstanceId:null}));
  return {...entered,battle:advanceTurn(battle)};
}
