import { playerPrerequisite } from '../testing/c2e-player-fixtures';
import { makeHeroUnit, advanceTurn } from '../game-engine/battle';
import { getProductionMonsterDefinition } from '../data/monsters/production-monster-definition-registry';
import { beginExplicitProductionMonsterEncounter, selectProductionMonsterPlayerRoute } from '../game-engine/commands/ordinary-monsters';
import { beginProductionMonsterTurn } from '../game-engine/monsters/production-battle-runtime';
import { getQuestPool, runtimeContentContext } from '../data/content-selector';
import { commitQuestSelection } from '../game-engine/commands/quest';
import { seededRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';
import type { CampaignState } from '../types';

/** Controlled explicit entry uses real Hero and C3B Monster definitions, never prototype fixtures. */
export function explicitPlayerBattle(definitionId='bone-soldier', actionIndex=0, movement=false):CampaignState {
  const campaign=dungeonPlayerPrerequisite(333);
  campaign.heroes[0].equippedSkillIds=['crusader-smite',...campaign.heroes[0].equippedSkillIds.filter(id=>id!=='crusader-smite').slice(0,2)];
  const d=getProductionMonsterDefinition(definitionId)!,a=d.actions[actionIndex];
  const heroes=campaign.heroes.map((h,i)=>({unit:makeHeroUnit(h,i,campaign),areaId:movement?'a2':(a.range?.kind==='EXACT'?'a'+a.range.distance:'a0')}));
  const areas=movement ? [
    {id:'a0',adjacent:['a1','a3'],capacity:8}, {id:'a1',adjacent:['a0','a2'],capacity:8},
    {id:'a3',adjacent:['a0','a2'],capacity:8}, {id:'a2',adjacent:['a1','a3'],capacity:8}
  ] : Array.from({length:6},(_,i)=>({id:'a'+i,capacity:8,adjacent:[i-1,i+1].filter(n=>n>=0&&n<6).map(n=>'a'+n)}));
  let c=beginExplicitProductionMonsterEncounter(campaign,{encounterId:'c3e-controlled:'+a.actionId,seed:333,areas,heroes,
    monsters:[{instanceId:'actor',definitionId,stance:'aggressive',areaId:'a0'}],initiative:[...heroes.map(h=>h.unit.id),'actor']});
  // Caller pins a source action to exercise a controlled acceptance boundary, not automatic eligibility.
  c.battle!.activeActorId='actor';c.battle!.initiativeIndex=4;c.battle!.currentActionPoints=0;
  c.battle=beginProductionMonsterTurn(c.battle!,'actor',{actionId:a.actionId,skillRoll:4,attackRoll:2});
  return c;
}
export function dungeonPlayerPrerequisite(seed=205):CampaignState {
  return withRuntimeSources(seededRuntimeSources(seed),()=>{
    const c=selectProductionMonsterPlayerRoute(playerPrerequisite(seed));
    const result=commitQuestSelection(c,getQuestPool(runtimeContentContext(c))[0].id);
    if(!result.ok)throw new Error(String(result.error));return result.campaign;
  });
}
export function continuePlayerBattle(c:CampaignState):CampaignState {
  return {...c,battle:advanceTurn(c.battle!)};
}
