import type { ActiveEffect, BattleState, BattleUnit, CampaignState } from '../../types';
import type { HeroProductionActionPlan, HeroRuntimeInput, RuntimeAction, RuntimeEffect } from '../../types/hero-runtime';
import { PRODUCTION_HERO_SELECTION, resolveProductionHeroSkill } from '../../data/heroes/runtime-registry';
import { compileHeroProductionActionPlan, deferredClauses, evaluateHeroPredicate } from './action-plan';
import { printedValue } from './production-hero';
import { applyBattleUnitDamage } from '../damage';
import { applyBattleUnitHealing } from '../healing';
import { applyEffects, applyStatusEffectEvent, resolveShuffleCount, synchronizePrintedConditionTokens } from '../status-effects';
import { ruinsMonster } from '../ruins/source-registry';
import { moveNormalCharacter } from '../ruins/movement-runtime';
import { shuffleStance } from '../ruins/printed-effect-runtime';
import { resolvePrintedAttackFromRoll } from '../combat-resolution';
import { applyStress, recoverStress } from '../stress';
import { killCampaignHero } from '../hero-death';
import { SeededRandom, DeterministicClock, DeterministicCounterIdSource, withRuntimeSources } from '../runtime-sources';

const units=(c:CampaignState)=>[...c.battle!.heroes,...c.battle!.monsters];
const unit=(c:CampaignState,id:string)=>{const u=units(c).find(u=>u.id===id);if(!u)throw new Error('Hero action actor/target absent');return u;};
const replace=(c:CampaignState,u:BattleUnit)=>{c.battle!.heroes=c.battle!.heroes.map(v=>v.id===u.id?u:v);c.battle!.monsters=c.battle!.monsters.map(v=>v.id===u.id?u:v);};
const hasToken=(u:BattleUnit,type:string)=>u.printedConditionTokens?.some(t=>t.type===type&&t.turns>0)??false;
function hasProtection(c:CampaignState,u:BattleUnit) {
  const context=c.battle!.ruinsContext;
  return hasToken(u,'protection')||!!(u.side==='monster'&&context&&ruinsMonster(context.definitionIds[u.id],context.ruleSetVersion).printedProtection);
}
function actionDefinition(plan:HeroProductionActionPlan): RuntimeAction {
  const a=resolveProductionHeroSkill(plan.heroId,plan.skillId,plan.skillLevel).actions[plan.face];
  if(!a)throw new Error('Absent production face');return a;
}
function event(c:CampaignState,plan:HeroProductionActionPlan,eventType:string,field:string,result?:unknown,deferredId?:string) {
  const session=c.heroProductionSession!,eventId=`${plan.actionId}:${field}:${deferredId??eventType}`;
  if(session.events.some(e=>e.eventId===eventId))return;
  session.events.push({eventId,eventType,field,actionId:plan.actionId,heroId:plan.heroId,skillId:plan.skillId,level:plan.skillLevel,
    ...PRODUCTION_HERO_SELECTION,...(deferredId?{deferredId}:{}),...(result===undefined?{}:{result})});
  if(deferredId)plan.deferredEventIds.push(eventId);
}
function rangeDistance(b:BattleState,actor:string,target:string):number {
  const contract=b.largeMovementContract;
  if(!contract)throw new Error('Production activation requires shared Area topology');
  const from=contract.placements[actor],to=contract.placements[target];
  if(!from||!to)throw new Error('Production Area placement absent');
  const queue:Array<[string,number]>=[[from,0]],seen=new Set<string>();
  while(queue.length){const [id,n]=queue.shift()!;if(id===to)return n;if(seen.has(id))continue;seen.add(id);for(const next of contract.areas.find(a=>a.id===id)?.adjacent??[])queue.push([next,n+1]);}
  return Infinity;
}
export function productionTargetCandidates(c:CampaignState,plan:HeroProductionActionPlan):string[] {
  const t=actionDefinition(plan).targeting;
  if(t.scope==='SELF')return [plan.heroActorId];
  return units(c).filter(u=>u.isAlive).filter(u=>{
    if(t.scope==='ALL_ALLIES')return u.side==='hero';
    if(t.scope==='ALL_ENEMIES')return u.side==='monster';
    if(!t.groups.some(g=>g.side===(u.side==='hero'?'HERO':'MONSTER')))return false;
    if(t.stanceFilter.presence==='PRINTED_VALUE'&&!t.stanceFilter.value.includes(u.stance))return false;
    const r=printedValue(t.range,'target range');
    const limits=r.split('-').map(Number);if(limits.some(n=>!Number.isFinite(n)))throw new Error('Unsupported range');
    const distance=rangeDistance(c.battle!,plan.heroActorId,u.id);
    return distance>=limits[0]&&distance<=limits[limits.length-1];
  }).map(u=>u.id).sort();
}
function validateTargets(c:CampaignState,p:HeroProductionActionPlan,ids:string[]) {
  const candidates=productionTargetCandidates(c,p),t=actionDefinition(p).targeting;
  if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!candidates.includes(id)))throw new Error('Invalid production target choice');
  if(t.targetCount?.kind!=='all'&&t.scope!=='SELF'&&new Set(ids.map(id=>c.battle!.largeMovementContract!.placements[id])).size!==1)throw new Error('Skill targets must share one Area');
  if(t.groups.some(g=>g.side==='MONSTER')) {
    const area=c.battle!.largeMovementContract!.placements[ids[0]];
    const guards=c.battle!.monsters.filter(u=>u.isAlive&&c.battle!.largeMovementContract!.placements[u.id]===area&&(hasToken(u,'guard')||(c.battle!.ruinsContext?.guardStacks[u.id]??0)>0));
    if(guards.length&&ids.some(id=>unit(c,id).side==='monster'&&!guards.some(u=>u.id===id)))throw new Error('Guard requires selecting guarded enemies');
  }
  for(const g of t.groups){const count=ids.filter(id=>unit(c,id).side===(g.side==='HERO'?'hero':'monster')).length;
    if(g.targetCount.kind==='exact'?count!==g.targetCount.value:count>g.targetCount.value)throw new Error('Production target count mismatch');}
  if(t.targetCount&&t.targetCount.kind!=='all'&&(t.targetCount.kind==='exact'?ids.length!==t.targetCount.value:ids.length>t.targetCount.value))throw new Error('Production target count mismatch');
}
function validateActivation(c:CampaignState,p:HeroProductionActionPlan) {
  const actor=unit(c,p.heroActorId),a=actionDefinition(p);
  if(actor.side!=='hero'||!actor.isAlive||actor.stunned>0||c.battle!.status!=='active'||c.battle!.activeActorId!==actor.id||c.battle!.currentActionPoints<1)throw new Error('Hero activation unavailable');
  if(!actor.equippedSkillIds?.includes(p.skillId)||actor.skillLevels?.[p.skillId]!==p.skillLevel)throw new Error('Skill loadout mismatch');
  if(a.activation.formRequirement!=='ANY'&&a.activation.formRequirement!==actor.productionIdentity?.form)throw new Error('Form-incompatible Skill');
  if(!printedValue(a.activation.usableFromStances,'activation Stance').includes(actor.stance))throw new Error('Production Stance restriction');
  if(c.battle!.pendingMonsterAttack||c.battle!.bossEncounter?.pendingChoice||c.battle!.ruinsContext?.pendingChoice||c.battle!.largeMovementContract?.pendingChoice)throw new Error('Reaction/choice already pending');
}
function choose(c:CampaignState,p:HeroProductionActionPlan,ids:string[]) {
  validateTargets(c,p,ids);p.selectedTargetIds=[...ids].sort();p.frozenTargetIds=[...p.selectedTargetIds];p.pendingChoice=null;p.phase='ROLL';
  p.frozenSelfTargetIds=c.battle!.heroes.filter(h=>h.isAlive).map(h=>h.id).sort();
  event(c,p,'HERO_TARGETS_FROZEN','targets',p.frozenTargetIds);
}
/** Source Push/Pull/Shuffle share the accepted Stance displacement and resistance executor. */
export function executeProductionHeroMovement(b:BattleState,id:string,e:Extract<RuntimeEffect,{kind:'MOVEMENT'}>,direction?:'PUSH'|'PULL',destinationId?:string):BattleState {
  if(deferredClauses(e).length)throw new Error('Deferred movement cannot execute');
  const u=[...b.heroes,...b.monsters].find(u=>u.id===id)!;
  if(!u)throw new Error('Movement target absent');
  const selected=direction??e.direction;
  if(!selected || (e.alternative&&!direction))throw new Error('Movement choice required');
  const distance=e.alternative?.direction===selected?e.alternative.distance:printedValue(e.distance,'movement');
  let next=b;
  if(destinationId) {
    next=moveNormalCharacter(b,id,destinationId);
    if(next.ruinsContext)next.ruinsContext.placements={...next.largeMovementContract!.placements};
    if(next.bossEncounter)next.bossEncounter.placements={...next.largeMovementContract!.placements};
  }
  return shuffleStance(next,id,selected==='PUSH'?'push':'pull',resolveShuffleCount(u,distance));
}
function movementOptions(c:CampaignState,p:HeroProductionActionPlan,targetId:string,e:Extract<RuntimeEffect,{kind:'MOVEMENT'}>):string[] {
  const contract=c.battle!.largeMovementContract!,target=unit(c,targetId);
  const from=contract.placements[targetId],directions=[e.direction!,...(e.alternative?[e.alternative.direction]:[])];
  const options:string[]=[];
  for(const direction of directions) {
    const raw=e.alternative?.direction===direction?e.alternative.distance:printedValue(e.distance,'movement');
    const steps=resolveShuffleCount(target,raw);let frontier=[from];
    for(let step=0;step<steps;step++) {
      const reachable=new Set<string>();
      for(const area of frontier) {
        const distanceTo=(to:string)=>{const shell=structuredClone(c.battle!);shell.largeMovementContract!.placements[targetId]=to;return rangeDistance(shell,p.heroActorId,targetId);};
        const candidates=contract.areas.find(a=>a.id===area)!.adjacent.filter(to=>{
          const d=distanceTo(to),here=distanceTo(area);
          if(direction==='PUSH'?d<=here:d>=here)return false;
          const entry=contract.areas.find(a=>a.id===to)!;
          const used=units(c).filter(u=>u.isAlive&&u.id!==targetId&&contract.placements[u.id]===to).reduce((n,u)=>n+contract.occupiedSpaces[u.id],0);
          return used+contract.occupiedSpaces[targetId]<=entry.capacity;
        });
        for(const to of candidates.length?candidates:[area])reachable.add(to);
      }
      frontier=[...reachable].sort();
    }
    options.push(...frontier.map(area=>`${direction}:${area}`));
  }
  return [...new Set(options)].sort();
}
function syncHero(c:CampaignState,id:string) {
  const u=unit(c,id);if(u.side!=='hero')return;
  c.heroes=c.heroes.map(h=>h.instanceId===u.sourceId?{...h,wounds:h.maxLife-u.hp,atDeathsDoor:u.atDeathsDoor,deathblowRollCount:u.deathblowRollCount,stance:u.stance}:h);
  if(!u.isAlive){const outcome=killCampaignHero(c,{heroInstanceId:u.sourceId,cause:'deathblow-attack',source:'battle',resumePhase:'dungeon-explore',battleId:c.battle!.battleId,sourceSkillId:c.heroProductionSession!.pendingAction!.skillId});Object.assign(c,outcome);}
}
function healing(c:CampaignState,id:string,amount:number) {replace(c,applyBattleUnitHealing(unit(c,id),amount).unit);syncHero(c,id);}
function damage(c:CampaignState,id:string,amount:number) {replace(c,applyBattleUnitDamage(unit(c,id),amount).unit);syncHero(c,id);}
function attackDamage(c:CampaignState,p:HeroProductionActionPlan,id:string,amount:number) {
  const actor=unit(c,p.heroActorId),target=unit(c,id);
  if(amount>0&&(hasToken(target,'riposte')||(c.battle!.ruinsContext?.riposteStacks[id]??0)>0)&&actor.isAlive) {
    const raw=Math.ceil(amount/2);damage(c,actor.id,hasProtection(c,actor)?Math.ceil(raw/2):raw);
    event(c,p,'HERO_RIPOSTE_DAMAGE',`riposte:${id}`,{raw});
  }
  const applied=hasProtection(c,target)?Math.ceil(amount/2):amount;
  damage(c,id,applied);event(c,p,'HERO_ATTACK_DAMAGE',`damage:${id}`,{printedDamage:amount,appliedDamage:applied,protection:hasProtection(c,target)});
}
function stress(c:CampaignState,id:string,amount:number,p:HeroProductionActionPlan) {
  const u=unit(c,id);if(u.side!=='hero')return;
  const args={heroId:u.sourceId,amount:Math.abs(amount),sourceType:'battle-skill' as const,sourceId:p.skillId,questId:c.currentQuestId??c.id};
  const next=amount<0?recoverStress(c,args).campaign:applyStress(c,{...args,batchId:p.actionId}).campaign;
  Object.assign(c,next);const h=c.heroes.find(h=>h.instanceId===u.sourceId)!;replace(c,{...unit(c,id),stress:h.stress});
}
function condition(c:CampaignState,id:string,e:Extract<RuntimeEffect,{kind:'CONDITION'}>,effectId:string) {
  let u=unit(c,id);const type=e.conditionType;
  if(e.operation==='REMOVE') {
    u={...u,printedConditionTokens:(u.printedConditionTokens??[]).filter(t=>t.type!==type),conditionDurations:{...u.conditionDurations}};
    if(type==='bleed')u.bleed=0;if(type==='blight')u.blight=0;if(type==='stun')u.stunned=0;if(type==='mark')u.marked=false;
    if(type==='buff')u.buffs=[];if(type==='debuff')u.debuffs=[];
    delete u.conditionDurations![type as keyof NonNullable<BattleUnit['conditionDurations']>];replace(c,synchronizePrintedConditionTokens(u));return;
  }
  // Duration-only tokens have no magnitude operand. The token's existence is not numeric damage.
  let turns=printedValue(e.duration,'condition duration');
  if(['bleed','blight','stun','mark','buff','debuff'].includes(type)) {
    const amount=e.magnitude.presence==='PRINTED_VALUE'?e.magnitude.value:1;
    const effects=[{type:type as ActiveEffect['type'],amount,durationTurns:turns}];
    if(e.actor==='SELF'){replace(c,applyEffects(u,effects));u=unit(c,id);}
    else {
      const next=applyStatusEffectEvent(c.battle!,id,effects,effectId);c.battle=next;u=unit(c,id);
      const blocked=next.statusEffectEvents!.find(x=>x.eventId===effectId)!.blocked;
      if(blocked.some(x=>x.reason==='immune'||x.durationReducedTo===0))return;
      turns=blocked.find(x=>x.durationReducedTo!==undefined)?.durationReducedTo??turns;
    }
  } else {
    if(!['guard','protection','riposte'].includes(type))throw new Error('Unsupported condition');
    if(e.actor!=='SELF'&&u.immunities?.includes(type))return;
    if(e.actor!=='SELF'&&u.categoricalResistances?.includes(type as 'debuff'))turns--;
    if(turns<=0)return;
  }
  replace(c,synchronizePrintedConditionTokens({...u,printedConditionTokens:[...(u.printedConditionTokens??[]),{eventId:effectId,type,magnitude:structuredClone(e.magnitude),turns}]}));
}
function executeEffect(c:CampaignState,p:HeroProductionActionPlan,e:RuntimeEffect,targetId:string,field:string,direction?:'PUSH'|'PULL',destinationId?:string):boolean {
  const effectId=`${p.actionId}:${field}:${targetId}`;
  if(p.resolvedEffectIds.includes(effectId))throw new Error('Duplicate effect resolution');
  const deferred=deferredClauses(e);
  if(e.kind==='TRANSFORM')p.pendingTransition={from:e.from,to:e.to};
  if(deferred.length) {
    for(const deferredId of deferred)event(c,p,'HERO_DEFERRED_CLAUSE_SKIPPED',`${field}:${targetId}`,{semanticStatus:'DEFERRED_MANUAL_VALIDATION',rngConsumption:0,
      ...(e.kind==='DAMAGE_MODIFIER'?{predicate:evaluateHeroPredicate(e,unit(c,p.heroActorId),unit(c,targetId))}:{}),...(e.kind==='IGNORE_DEFENSE'?{defense:e.defense}:{})},deferredId);
    p.resolvedEffectIds.push(effectId);return true;
  }
  if(!unit(c,targetId).isAlive){p.resolvedEffectIds.push(effectId);event(c,p,'HERO_EFFECT_TARGET_UNAVAILABLE',`${field}:${targetId}`);return true;}
  switch(e.kind) {
    case 'MOVEMENT':
      { const options=movementOptions(c,p,targetId,e);
        if(options.length>1&&!direction){p.pendingChoice={choiceId:effectId,choiceType:'CHOICE_TARGET_AREA',sourceEffectId:effectId,candidateIds:options,createdAtEventId:p.actionId,selectedId:null,status:'PENDING',ruleSetVersion:p.runtimeVersion,continuation:{kind:'hero-production',actionId:p.actionId,field}};return false;}
        const selected=direction?`${direction}:${destinationId}`:options[0];
        if(!options.includes(selected))throw new Error('Illegal movement destination');
        const split=selected.indexOf(':');
        c.battle=executeProductionHeroMovement(c.battle!,targetId,e,selected.slice(0,split) as 'PUSH'|'PULL',selected.slice(split+1));for(const h of c.battle.heroes)syncHero(c,h.id);break;
      }
    case 'CONDITION':condition(c,targetId,e,effectId);break;
    case 'HEALING':healing(c,targetId,e.amount);break;
    case 'STRESS':stress(c,targetId,e.amount,p);break;
    case 'WOUNDS':case 'DAMAGE':damage(c,targetId,e.amount);break;
    case 'LIGHT':c.light=Math.max(0,Math.min(5,c.light+e.amount));c.battle!.light=c.light;break;
    case 'DODGE':throw new Error('Dodge modifier requires explicit phase binding');
    default:throw new Error('Non-executable semantic clause');
  }
  p.resolvedEffectIds.push(effectId);event(c,p,'HERO_EFFECT_RESOLVED',`${field}:${targetId}`,{kind:e.kind,targetId});return true;
}
function rollOutcome(c:CampaignState,p:HeroProductionActionPlan,id:string) {
  const a=actionDefinition(p),roll=p.storedRolls[0];
  if(!a.roll.requiresRoll)return {hit:true,crit:false,damage:null};
  const accuracy=printedValue(a.roll.accuracy,'accuracy');
  const target=unit(c,id),actor=unit(c,p.heroActorId);
  const markBonus=target.marked?1:0,critBonus=actor.buffs.reduce((n,b)=>n+b.amount,0)+target.debuffs.reduce((n,b)=>n+b.amount,0);
  if(a.attack) {
    const t=unit(c,id);if(typeof t.bossCombatDodge!=='number')throw new Error('Target Dodge source binding absent');
    const damageValue=printedValue(a.attack.damage,'damage');
    const crit=a.attack.crit.presence==='PRINTED_VALUE'?a.attack.crit.value:null;
    if(crit===null)return {hit:roll<=accuracy+markBonus-t.bossCombatDodge,crit:false,damage:roll<=accuracy+markBonus-t.bossCombatDodge?damageValue:0};
    return resolvePrintedAttackFromRoll({accuracy,damage:damageValue,crit,critDamage:printedValue(a.attack.critDamage,'critDamage')},roll,t.bossCombatDodge,markBonus,critBonus);
  }
  const dodge=unit(c,id).bossCombatDodge;if(typeof dodge!=='number')throw new Error('Target Dodge source binding absent');
  return {hit:roll<=accuracy+markBonus-dodge,crit:a.roll.crit.presence==='PRINTED_VALUE'&&roll<=a.roll.crit.value+critBonus&&roll<=accuracy+markBonus-dodge,damage:null};
}
function recipients(c:CampaignState,p:HeroProductionActionPlan,e:RuntimeEffect,targetId:string):string[] {
  if(e.recipient==='ALL_ALLIES')return targetId===p.frozenTargetIds[0]?p.frozenSelfTargetIds:[];
  if(e.recipient==='SELF')return [p.heroActorId];
  if(e.recipient==='HERO'&&unit(c,targetId).side!=='hero'||e.recipient==='MONSTER'&&unit(c,targetId).side!=='monster')return [];
  return [targetId];
}
function advance(c:CampaignState,input:HeroRuntimeInput,random:()=>number) {
  const s=c.heroProductionSession!;
  if(input.type==='START') {
    if(s.pendingAction&&s.pendingAction.phase!=='COMPLETE')throw new Error('Production action already pending');
    const actor=unit(c,input.actorId),identity=actor.productionIdentity!;
    if(!identity)throw new Error('Legacy actor on production route');
    const level=actor.skillLevels?.[input.skillId];if(!level)throw new Error('Skill not equipped');
    const skill=resolveProductionHeroSkill(identity.heroId,input.skillId,level);
    const p=compileHeroProductionActionPlan(skill,actor,`${c.id}:hero-action:${s.completedActions.length+1}`,s.rngCursor,input.face);
    validateActivation(c,p);s.pendingAction=p;
    if(skill.deferredSemanticIds.includes('C2C-DEFER-SERIALIZATION'))event(c,p,'HERO_DEFERRED_CLAUSE_SKIPPED','serialization',{semanticStatus:'DEFERRED_MANUAL_VALIDATION',rngConsumption:0,projectContract:'C2D-HERO-CHECKPOINT-v1'},'C2C-DEFER-SERIALIZATION');
    return;
  }
  const p=s.pendingAction;if(!p||p.phase==='COMPLETE')throw new Error('No pending Hero action');
  const a=actionDefinition(p);
  if(input.type==='TARGETS') {if(p.phase!=='SELECT_TARGETS'||!p.pendingChoice)throw new Error('No target choice');choose(c,p,input.targetIds);return;}
  const direction=input.type==='MOVEMENT_CHOICE'?input.direction:undefined;
  if(direction&&(!p.pendingChoice||!p.pendingChoice.candidateIds.includes(`${direction}:${input.type==='MOVEMENT_CHOICE'?input.destinationId:undefined}`)))throw new Error('Invalid movement choice');
  if(p.pendingChoice&&!direction)throw new Error('Choice requires player input');
  if(direction)p.pendingChoice=null;
  switch(p.phase) {
    case 'VALIDATE_ACTIVATION':p.phase='SELECT_TARGETS';break;
    case 'SELECT_TARGETS': {
      const candidates=productionTargetCandidates(c,p);
      if(a.targeting.scope==='SELF'||a.targeting.targetCount?.kind==='all'){choose(c,p,candidates);break;}
      p.pendingChoice={choiceId:`${p.actionId}:targets`,choiceType:'CHOICE_TARGET_HERO',sourceEffectId:p.actionId,candidateIds:candidates,createdAtEventId:p.actionId,selectedId:null,status:'PENDING',ruleSetVersion:p.runtimeVersion,continuation:{kind:'hero-production',actionId:p.actionId,field:'targets'}};break;
    }
    case 'ROLL':if(a.roll.requiresRoll)p.storedRolls.push(1+Math.floor(random()*10));event(c,p,'HERO_SKILL_ROLLED','roll',p.storedRolls);p.phase='SELF_EFFECTS';p.pendingEffectIndex=0;break;
    case 'SELF_EFFECTS': {
      const i=p.pendingEffectIndex;
      if(i>=a.selfEffects.length){p.storedOutcomes=Object.fromEntries(p.frozenTargetIds.map(id=>[id,rollOutcome(c,p,id)]));p.phase='TARGET_EFFECTS';p.pendingEffectIndex=0;break;}
      const e=a.selfEffects[i];
      const ids=e.recipient==='ALL_ALLIES'?p.frozenSelfTargetIds:[p.heroActorId];
      for(const id of ids)if(!executeEffect(c,p,e,id,`selfEffects.${i}`,direction,input.type==='MOVEMENT_CHOICE'?input.destinationId:undefined))return;
      p.pendingEffectIndex++;break;
    }
    case 'TARGET_EFFECTS': {
      const width=1+a.targetEffects.length,total=p.frozenTargetIds.length*width,i=p.pendingEffectIndex;
      if(i>=total){p.phase='REACTION_WINDOWS';p.pendingEffectIndex=0;break;}
      const targetId=p.frozenTargetIds[Math.floor(i/width)],index=i%width,result=p.storedOutcomes[targetId];
      if(index===0) {
        if(result.hit&&unit(c,targetId).isAlive) {
          if(a.attack&&result.damage!==null)attackDamage(c,p,targetId,result.damage);
          if(a.healing){const amount=result.crit&&a.healing.critWounds.presence==='PRINTED_VALUE'?a.healing.critWounds.value:printedValue(a.healing.wounds,'wound healing');healing(c,targetId,amount);}
        }
        const id=`${p.actionId}:base:${targetId}`;p.resolvedEffectIds.push(id);event(c,p,'HERO_TARGET_BASE_RESOLVED',`base:${targetId}`,result);
      } else if(result.hit) {
        const e=a.targetEffects[index-1];
        for(const id of recipients(c,p,e,targetId))if(!executeEffect(c,p,e,id,`targetEffects.${index-1}`,direction,input.type==='MOVEMENT_CHOICE'?input.destinationId:undefined))return;
      }
      p.pendingEffectIndex++;break;
    }
    case 'REACTION_WINDOWS':
      for(const [targetId,result] of Object.entries(p.storedOutcomes))if(result.crit) {
        const area=c.battle!.largeMovementContract!.placements[p.heroActorId];
        for(const hero of c.battle!.heroes.filter(h=>h.isAlive&&c.battle!.largeMovementContract!.placements[h.id]===area))stress(c,hero.id,-1,p);
        event(c,p,'HERO_CRITICAL_STRESS_RECOVERED',`critical:${targetId}`);
      }
      event(c,p,'HERO_REACTION_WINDOWS_RESOLVED','reactions');p.phase='COMMIT';break;
    case 'COMMIT':c.battle!.currentActionPoints-=a.activation.actionCost.presence==='PRINTED_VALUE'?a.activation.actionCost.value:1;
      p.phase='COMPLETE';event(c,p,'HERO_ACTION_COMPLETE','complete');s.completedActions.push(structuredClone(p));break;
  }
}
/** Explicit controlled engine route. Normal campaign creation never calls this. */
export function beginProductionHeroSession(campaign:CampaignState,seed:number):CampaignState {
  if(campaign.heroProductionSession||!campaign.battle||!campaign.heroes.length||campaign.heroes.some(h=>!h.productionIdentity))throw new Error('Production session requires an explicitly constructed party');
  if(JSON.stringify(campaign.heroRuntimeSelection)!==JSON.stringify(PRODUCTION_HERO_SELECTION))throw new Error('Production campaign selection required');
  const origin=structuredClone(campaign),rng=new SeededRandom(seed);
  return {...campaign,heroProductionSession:{origin,seed,rngCursor:rng.snapshot(),rngCalls:0,clockCursor:0,idCursor:0,inputs:[],pendingAction:null,completedActions:[],events:[]}};
}
export function applyProductionHeroInput(campaign:CampaignState,input:HeroRuntimeInput):CampaignState {
  if(!campaign.heroProductionSession||JSON.stringify(campaign.heroRuntimeSelection)!==JSON.stringify(PRODUCTION_HERO_SELECTION))throw new Error('Production controlled route absent');
  const c=structuredClone(campaign),s=c.heroProductionSession!;
  const rng=new SeededRandom(s.seed);rng.restore(s.rngCursor);const clock=new DeterministicClock();clock.restore(s.clockCursor);const ids=new DeterministicCounterIdSource(s.seed);ids.restore(s.idCursor);
  const random=()=>{s.rngCalls++;return rng.next();};
  withRuntimeSources({random:{next:random},clock,ids},()=>advance(c,input,random));
  s.rngCursor=rng.snapshot();s.clockCursor=clock.snapshot();s.idCursor=ids.snapshot();s.inputs.push(structuredClone(input));
  return c;
}
export function replayProductionHeroSession(campaign:CampaignState):CampaignState {
  const s=campaign.heroProductionSession!;
  if(!s||s.origin.heroProductionSession)throw new Error('Invalid replay origin');
  let replay=beginProductionHeroSession(s.origin,s.seed);
  for(const input of s.inputs)replay=applyProductionHeroInput(replay,input);
  return replay;
}
