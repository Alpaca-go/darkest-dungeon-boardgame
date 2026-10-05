/** Synthetic targets/topology are fixtures, never production Monster acceptance. */
import type { BattleState, CampaignState, Stance } from '../types';
import type { HeroForm, HeroProductionActionPlan } from '../types/hero-runtime';
import { createNewCampaign } from '../game-engine/campaign';
import { generateDungeonForQuest } from '../game-engine/dungeon';
import { QUESTS } from '../data/quests';
import { createProductionHero, makeProductionHeroUnit, printedValue } from '../game-engine/heroes/production-hero';
import { applyProductionHeroInput, beginProductionHeroSession, productionTargetCandidates } from '../game-engine/heroes/production-runtime';
import { PRODUCTION_HERO_SELECTION, resolveProductionHeroSkill } from '../data/heroes/runtime-registry';
import { seededRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';
import { THREAT_DEPENDENCY_V3 } from '../types/necromancer-dependencies';

export function heroRuntimeFixture(heroId:string,skillId:string,level:1|2|3=1,seed=31,face:'front'|'back'='front'):CampaignState {
  return withRuntimeSources(seededRuntimeSources(seed),()=>{
    const skill=resolveProductionHeroSkill(heroId,skillId,level),a=skill.actions[face]!;
    const form:HeroForm|undefined=heroId==='abomination'?(a.activation.formRequirement==='ANY'?(face==='back'?'BEAST':'HUMAN'):a.activation.formRequirement):undefined;
    const stance=printedValue(a.activation.usableFromStances,'stance')[0] as Stance;
    const stances:Stance[]=['aggressive','defensive','ranged','support'];
    const actorPosition=stances.indexOf(stance)+1;
    const heroes=stances.map((s,i)=>createProductionHero({heroId,level,instanceId:`production-${i+1}`,stance:s,partySlot:i+1,form,skills:[skillId]}));
    const actor=heroes[actorPosition-1];
    let c=createNewCampaign();c={...c,heroes,heroRuntimeSelection:{...PRODUCTION_HERO_SELECTION},gamePhase:'battle',currentQuestId:'controlled-c2d',light:3};
    const heroUnits=heroes.map(makeProductionHeroUnit);
    const monsters=heroUnits.map((h,i)=>{
      const {productionIdentity,productionMovement,skillLevels,equippedSkillIds,...shell}=h;void productionIdentity;void productionMovement;void skillLevels;void equippedSkillIds;
      return {...shell,id:`fixture-monster-${i+1}`,sourceId:'SYNTHETIC_COMBAT_TARGET',name:'Synthetic target',side:'monster' as const,maxHp:100,hp:100,stress:0,
        bossCombatDodge:0,immunities:[],categoricalResistances:[],actorTypeTags:{tags:['Unholy','Eldritch'],sourceBindingId:'SYNTHETIC_FIXTURE_ONLY'}};
    });
    const range=a.targeting.range.presence==='PRINTED_VALUE'&&/^\d/.test(a.targeting.range.value)?Number(a.targeting.range.value.split('-')[0]):0;
    const placements=Object.fromEntries([...heroUnits,...monsters].map(u=>[u.id,u.id===`u_${actor.instanceId}`?'A0':`A${range}`]));
    const battle:BattleState={battleId:'controlled-c2d-battle',status:'active',round:1,maxRounds:4,heroes:heroUnits,monsters,
      initiativeOrder:heroUnits.map(h=>h.id),initiativeIndex:actorPosition-1,activeActorId:`u_${actor.instanceId}`,currentActionPoints:4,
      selectedSkillId:null,selectedTargetId:null,battleLog:[],sourceRoomId:'SYNTHETIC_CONTROLLED_ROOM',rewards:{gold:0},light:3,
      largeMovementContract:{ruleSetVersion:THREAT_DEPENDENCY_V3,rulingId:'C1C32R2-LARGE-SINGLE-DISPLACEMENT-OVERFLOW-v1',
        areas:[0,1,2,3,4].map(i=>({id:`A${i}`,capacity:8,adjacent:[i-1,i+1].filter(n=>n>=0&&n<=4).map(n=>`A${n}`)})),
        placements,occupiedSpaces:Object.fromEntries(Object.keys(placements).map(id=>[id,1])),sequence:0,overflow:[],pendingChoice:null,events:[]}};
    c.dungeon=generateDungeonForQuest(QUESTS[0]);c.battle=battle;return beginProductionHeroSession(c,seed);
  });
}
export function fixtureTargets(c:CampaignState,p:HeroProductionActionPlan):string[] {
  const t=resolveProductionHeroSkill(p.heroId,p.skillId,p.skillLevel).actions[p.face]!.targeting;
  const candidates=productionTargetCandidates(c,p);
  if(!t.groups.length)return candidates;
  return t.groups.flatMap(g=>candidates.filter(id=>[...c.battle!.heroes,...c.battle!.monsters].find(u=>u.id===id)!.side===(g.side==='HERO'?'hero':'monster')).slice(0,g.targetCount.value));
}
export function fixtureContinue(c:CampaignState):CampaignState {
  const p=c.heroProductionSession!.pendingAction!;
  if(p.pendingChoice?.continuation.kind==='hero-production'&&p.pendingChoice.continuation.field==='targets')return applyProductionHeroInput(c,{type:'TARGETS',targetIds:fixtureTargets(c,p)});
  if(p.pendingChoice) {
    const option=p.pendingChoice.candidateIds[0],split=option.indexOf(':');
    return applyProductionHeroInput(c,{type:'MOVEMENT_CHOICE',direction:option.slice(0,split) as 'PUSH'|'PULL',destinationId:option.slice(split+1)});
  }
  return applyProductionHeroInput(c,{type:'ADVANCE'});
}
export function prepareHeroFixture(campaign:CampaignState,prepare:(c:CampaignState)=>void):CampaignState {
  const c=structuredClone(campaign),seed=c.heroProductionSession!.seed;delete c.heroProductionSession;prepare(c);return beginProductionHeroSession(c,seed);
}
export function fixtureExecute(c:CampaignState,skillId:string,face:'front'|'back'='front',atCheckpoint?:(c:CampaignState)=>CampaignState):CampaignState {
  c=applyProductionHeroInput(c,{type:'START',actorId:c.battle!.activeActorId!,skillId,face});
  for(let step=0;step<100;step++) {
    if(atCheckpoint)c=atCheckpoint(c);
    if(c.heroProductionSession!.pendingAction!.phase==='COMPLETE')return c;
    c=fixtureContinue(c);
  }
  throw new Error('Controlled action did not complete');
}
