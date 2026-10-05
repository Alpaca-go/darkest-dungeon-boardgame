import assert from 'node:assert/strict';
import {explicitPlayerBattle} from './c3e-player-fixture';
import {createSaveSnapshot,restoreSaveSnapshot,validateSaveFile} from '../game-engine/save';
import {resolveProductionMonsterChoice,productionTimedProtectionTokens,tickProductionMonsterProtection} from '../game-engine/monsters/production-battle-runtime';
import {advancePendingMonsterAttack,resolveTrinketOpportunity} from '../game-engine/trinkets/battle-trinket-bridge';
import {acquireTrinket} from '../game-engine/trinkets/acquire-trinket';
import type {CampaignState} from '../types';
function restore(c:CampaignState){const save=JSON.parse(JSON.stringify(createSaveSnapshot(c)));assert.equal(validateSaveFile(save),null);return restoreSaveSnapshot(save);}
function state(c:CampaignState){const b=c.battle!;return JSON.parse(JSON.stringify({heroes:b.heroes,monsters:b.monsters,pending:b.pendingMonsterAttack,context:b.productionMonsterContext,ledger:b.largeMovementContract,status:b.status}));}
function drain(c:CampaignState){for(let n=0;n<30&&c.battle!.pendingMonsterAttack;n++){const opp=c.pendingTrinketUseOpportunities.find(o=>o.status==='open');c=opp?resolveTrinketOpportunity(c,opp.id,'decline').campaign:advancePendingMonsterAttack(c,false,true);}return c;}
export function proveSaveReplay(){
 const records:Array<{point:string;saveRoundTrip:boolean;continuationDeterministic:boolean;rngStable:boolean;duplicateMutationAbsent:boolean}>=[];
 const record=(point:string,c:CampaignState,continueState:(c:CampaignState)=>CampaignState)=>{
  const restored=restore(c);assert.deepEqual(state(restored),state(c));
  const left=continueState(restored),right=continueState(structuredClone(c));assert.deepEqual(state(left),state(right));
  assert.equal(left.battle!.productionMonsterContext!.rngCursor,right.battle!.productionMonsterContext!.rngCursor);
  records.push({point,saveRoundTrip:true,continuationDeterministic:true,rngStable:true,duplicateMutationAbsent:true});
 };
 const movement=explicitPlayerBattle('bone-soldier',0,true),choice=movement.battle!.productionMonsterContext!.pendingChoice!;
 record('movement-choice',movement,c=>{const b=resolveProductionMonsterChoice(c.battle!,choice.choiceId,choice.candidateIds[0]);assert.throws(()=>resolveProductionMonsterChoice(b,choice.choiceId,choice.candidateIds[0]));return drain({...c,battle:b});});
 for(const [point,trinketId] of [['incoming-hit-window','community-trinket-core-camouflage-cloak'],['incoming-damage-window','community-trinket-core-protective-padlock']]){
  let c=explicitPlayerBattle();const target=c.battle!.heroes.find(h=>h.id===c.battle!.pendingMonsterAttack!.targetHeroUnitId)!;
  c=acquireTrinket(c,{trinketId,heroId:target.sourceId,source:'debug',sourceEventId:'c3e-proof:'+point}).campaign;
  for(let n=0;n<3&&!c.pendingTrinketUseOpportunities.some(o=>o.status==='open');n++)c=advancePendingMonsterAttack(c,false,true);
  const opp=c.pendingTrinketUseOpportunities.find(o=>o.status==='open')!;assert.ok(opp);
  record(point,c,s=>{const resolved=resolveTrinketOpportunity(s,opp.id,'decline');assert.equal(resolved.error,null);const repeat=resolveTrinketOpportunity(resolved.campaign,opp.id,'decline');assert.ok(repeat.error);assert.deepEqual(state(repeat.campaign),state(resolved.campaign));return drain(resolved.campaign);});
 }
 let multi=explicitPlayerBattle('crystalline-aberration-level-1');multi=advancePendingMonsterAttack(multi,false,true);multi=advancePendingMonsterAttack(multi,false,true);
 record('multi-target-continuation',multi,c=>{const done=drain(c);assert.equal(done.battle!.productionMonsterContext!.events.filter(e=>e.type==='MONSTER_EFFECT_APPLIED'&&e.detail.primitiveId==='self-wound-sequencing').length,1);return done;});
 const protection=explicitPlayerBattle('manservant',2);assert.equal(productionTimedProtectionTokens(protection.battle!,'actor').length,1);
 record('timed-protection',protection,c=>{const b=tickProductionMonsterProtection(c.battle!,'actor');assert.equal(productionTimedProtectionTokens(b,'actor').length,0);return {...c,battle:b};});
 return records;
}
