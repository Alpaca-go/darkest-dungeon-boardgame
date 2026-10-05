import { playerOrdinaryFixture } from '../testing/c2e-player-fixtures';
import { checkEnd, advanceTurn } from '../game-engine/battle';
import { commitBattleVictory } from '../game-engine/commands/battle';
import { commitProductionHeroInput } from '../game-engine/heroes/player-commands';
import { moveNormalCharacter } from '../game-engine/ruins/movement-runtime';
import { describe, expect, it } from 'vitest';
import { explicitPlayerBattle, dungeonPlayerPrerequisite } from './c3e-player-fixture';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { advancePendingMonsterAttack, resolveTrinketOpportunity } from '../game-engine/trinkets/battle-trinket-bridge';
import { acquireTrinket } from '../game-engine/trinkets/acquire-trinket';
import { resolveProductionMonsterChoice, productionTimedProtectionTokens, grantProductionMonsterProtection,
  tickProductionMonsterProtection, applyProductionMonsterEnemyDamage } from '../game-engine/monsters/production-battle-runtime';
import { enterProductionMonsterRoom, hasProductionMonsterPlayerRoute } from '../game-engine/commands/ordinary-monsters';
import { commitBattleRetreat } from '../game-engine/commands/battle';
import { productionRuinsBindings } from '../game-engine/monsters/production-encounter';
import type { CampaignState } from '../types';

export function roundTrip(c:CampaignState):CampaignState {
  const save=JSON.parse(JSON.stringify(createSaveSnapshot(c)));
  expect(validateSaveFile(save)).toBeNull();return restoreSaveSnapshot(save);
}
export function stable(c:CampaignState) {
  const b=c.battle!;
  return {heroes:b.heroes,monsters:b.monsters,context:b.productionMonsterContext,ledger:b.largeMovementContract,
    pending:b.pendingMonsterAttack,stage:b.status,heroRng:c.heroProductionSession?.rngCursor};
}
function drain(c:CampaignState) {
  for(let n=0;n<30&&(c.battle!.pendingMonsterAttack||c.battle!.productionMonsterContext!.pendingChoice);n++) {
    const choice=c.battle!.productionMonsterContext!.pendingChoice;
    if(choice){c={...c,battle:resolveProductionMonsterChoice(c.battle!,choice.choiceId,choice.candidateIds[0])};continue;}
    const opp=c.pendingTrinketUseOpportunities.find(o=>o.status==='open');
    c=opp?resolveTrinketOpportunity(c,opp.id,'decline').campaign:advancePendingMonsterAttack(c,false,true);
  }return c;
}

describe('C3E player save and replay boundaries',()=>{
 it('accepts a pinned staged production attack through real save APIs',()=>{
  const c=explicitPlayerBattle();const restored=roundTrip(c);
  expect(restored.battle!.pendingMonsterAttack).toEqual(c.battle!.pendingMonsterAttack);
  expect(stable(drain(restored))).toEqual(stable(drain(structuredClone(c))));
 });
 it.each([
  ['community-trinket-core-camouflage-cloak','before-incoming-hit-resolution'],
  ['community-trinket-core-protective-padlock','before-incoming-damage-applied']
 ])('persists %s reaction and rejects repeated decision', (trinketId,window)=>{
  let c=explicitPlayerBattle();const target=c.battle!.heroes.find(h=>h.id===c.battle!.pendingMonsterAttack!.targetHeroUnitId)!;
  c=acquireTrinket(c,{trinketId,heroId:target.sourceId,source:'debug',sourceEventId:'c3e:'+trinketId}).campaign;
  for(let n=0;n<3&&!c.pendingTrinketUseOpportunities.some(o=>o.status==='open');n++)c=advancePendingMonsterAttack(c,false,true);
  const opp=c.pendingTrinketUseOpportunities.find(o=>o.status==='open')!;expect(opp.useWindow).toBe(window);
  const restored=roundTrip(c);const result=resolveTrinketOpportunity(restored,opp.id,'decline');expect(result.error).toBeNull();
  const repeat=resolveTrinketOpportunity(result.campaign,opp.id,'decline');expect(repeat.error).not.toBeNull();
  expect(stable(repeat.campaign)).toEqual(stable(result.campaign));
  expect(stable(drain(result.campaign))).toEqual(stable(drain(resolveTrinketOpportunity(structuredClone(c),opp.id,'decline').campaign)));
 });
 it('persists movement candidates and resumes the same action exactly once',()=>{
  const c=explicitPlayerBattle('bone-soldier',0,true),choice=c.battle!.productionMonsterContext!.pendingChoice!;
  expect(choice.candidateIds).toEqual(['a1','a3']);const restored=roundTrip(c);
  const resumed=resolveProductionMonsterChoice(restored.battle!,choice.choiceId,'a3');
  expect(resumed.pendingMonsterAttack!.attackRoll).toBe(2);
  expect(()=>resolveProductionMonsterChoice(resumed,choice.choiceId,'a3')).toThrow();
  expect(resumed).toEqual(resolveProductionMonsterChoice(structuredClone(c.battle!),choice.choiceId,'a3'));
 });
 it('resumes later ALL_HEROES targets and applies AFTER self-wound once',()=>{
  let c=explicitPlayerBattle('crystalline-aberration-level-1');
  c.battle!.heroes[3].isAlive=false;c.battle!.heroes[3].hp=0;
  // The selected targets are pinned; a subsequently dead target is skipped rather than rerolled.
  c=advancePendingMonsterAttack(c,false,true);c=advancePendingMonsterAttack(c,false,true);
  expect(c.battle!.productionMonsterContext!.pendingExecution!.operationIndex).toBeGreaterThan(0);
  const restored=roundTrip(c),a=drain(restored),b=drain(structuredClone(c));expect(stable(a)).toEqual(stable(b));
  expect(a.battle!.productionMonsterContext!.events.filter(e=>e.type==='MONSTER_EFFECT_APPLIED'&&e.detail.primitiveId==='self-wound-sequencing')).toHaveLength(1);
  expect(a.battle!.productionMonsterContext!.pendingExecution).toBeNull();
 });
 it('preserves independent Manservant grants and expiry and damage reduction',()=>{
  let c=drain(explicitPlayerBattle('manservant',2));
  expect(productionTimedProtectionTokens(c.battle!,'actor')).toHaveLength(1);
  c.battle=grantProductionMonsterProtection(c.battle!,'actor','second-grant',2);const restored=roundTrip(c);
  const before=restored.battle!.monsters[0].hp;
  const protectedBattle=applyProductionMonsterEnemyDamage(structuredClone(restored.battle!),restored.battle!.heroes[0].id,'actor',4).battle;
  expect(before-protectedBattle.monsters[0].hp).toBe(2);
  restored.battle=tickProductionMonsterProtection(restored.battle!,'actor');expect(productionTimedProtectionTokens(restored.battle,'actor')).toHaveLength(1);
  restored.battle=tickProductionMonsterProtection(restored.battle,'actor');expect(productionTimedProtectionTokens(restored.battle,'actor')).toHaveLength(0);
 });
 it('retains atomic deferred blocker in save and never promotes source eligibility',()=>{
  const c=explicitPlayerBattle('supplicant');const before=structuredClone(c.battle!);
  expect(before.productionMonsterContext!.blocker?.status).toBe('DEFERRED_SEMANTIC');
  expect(roundTrip(c).battle).toEqual(before);expect(before.productionMonsterContext!.pendingExecution).toBeNull();
  expect(productionRuinsBindings()).toHaveLength(24);expect(new Set(productionRuinsBindings().flatMap(b=>b.physicalCopyIds)).size).toBe(62);
 });
 it('uses accepted physical draw entry and returns every copy on retreat',()=>{
  let c=dungeonPlayerPrerequisite();const room=c.dungeon!.rooms.find(r=>r.sourceRoomToken==='lair'||r.type==='battle')!;
  c.dungeon!.currentRoomId=room.id;expect(hasProductionMonsterPlayerRoute(c)).toBe(true);
  c=enterProductionMonsterRoom(c,room.id);expect(c.battle!.productionMonsterContext).toBeDefined();expect(c.battle!.bossEncounter).toBeUndefined();
  c=roundTrip(c);const result=commitBattleRetreat(c);expect(result.ok).toBe(true);expect(result.campaign.battle).toBeNull();
  expect(result.campaign.ruinsDrawState!.encounters.every(e=>e.returned)).toBe(true);
  expect(Object.values(result.campaign.ruinsDrawState!.ownership).some(o=>o.location==='ENCOUNTER')).toBe(false);
 });
 it('keeps real Hero movement synchronized with the saved production ledger',()=>{
  const c=explicitPlayerBattle();c.battle=moveNormalCharacter(c.battle!,c.battle!.heroes[0].id,'a0');
  expect(roundTrip(c).battle!.productionMonsterContext!.placements).toEqual(c.battle!.largeMovementContract!.placements);
 });
 it('executes a real production Hero skill against a non-Ruins Monster and settles victory',()=>{
  let c=drain(explicitPlayerBattle('swine-slasher',0,true));
  for(let n=0;n<30;n++){c.battle=advanceTurn(c.battle!);c=drain(c);if(c.battle!.heroes.some(h=>h.id===c.battle!.activeActorId&&h.productionIdentity?.heroId==='crusader'))break;}
  const actor=c.battle!.heroes.find(h=>h.id===c.battle!.activeActorId)!;
  c.battle=moveNormalCharacter(c.battle!,actor.id,c.battle!.productionMonsterContext!.placements.actor);c.battle.currentActionPoints--;
  c=commitProductionHeroInput(c,{type:'START',actorId:actor.id,skillId:'crusader-smite',face:'front'});
  for(let n=0;n<20&&c.heroProductionSession?.pendingAction;n++){
   const p=c.heroProductionSession.pendingAction;
   c=commitProductionHeroInput(c,p.pendingChoice?{type:'TARGETS',targetIds:['actor']}:{type:'ADVANCE'});
   c=roundTrip(c);
  }
  expect(c.heroProductionSession!.completedActions.length).toBeGreaterThan(0);
  for(const m of c.battle!.monsters.filter(m=>m.isAlive)) c.battle=applyProductionMonsterEnemyDamage(c.battle!,actor.id,m.id,m.hp*2).battle;
  c.battle=checkEnd(c.battle!);expect(c.battle.status).toBe('victory');
  const result=commitBattleVictory(c);expect(result.ok).toBe(true);expect(result.campaign.battle).toBeNull();
 });
 it('settles physical Ruins victory without lost cards or figures',()=>{
  let c=dungeonPlayerPrerequisite();const room=c.dungeon!.rooms.find(r=>r.sourceRoomToken==='lair'||r.type==='battle')!;
  c.dungeon!.currentRoomId=room.id;c=enterProductionMonsterRoom(c,room.id);
  for(let n=0;n<30&&(c.battle!.pendingMonsterAttack||c.battle!.productionMonsterContext!.pendingChoice);n++){
   const p=c.battle!.productionMonsterContext!.pendingChoice;
   c=p?{...c,battle:resolveProductionMonsterChoice(c.battle!,p.choiceId,p.candidateIds[0])}:advancePendingMonsterAttack(c,false,true);
  }
  const ownerIds=Object.keys(c.ruinsDrawState!.ownership).sort();
  for(const m of c.battle!.monsters.filter(m=>m.isAlive))c.battle=applyProductionMonsterEnemyDamage(c.battle!,c.battle!.heroes[0].id,m.id,m.hp*2).battle;
  c.battle=checkEnd(c.battle!);const result=commitBattleVictory(c);expect(result.ok).toBe(true);
  expect(Object.keys(result.campaign.ruinsDrawState!.ownership).sort()).toEqual(ownerIds);
  expect(Object.values(result.campaign.ruinsDrawState!.ownership).some(o=>o.location==='ENCOUNTER')).toBe(false);
 });
 it('preserves a later-target reaction and its original RNG after reload',()=>{
  let c=explicitPlayerBattle('crystalline-aberration-level-1');const ids=c.battle!.productionMonsterContext!.pendingExecution!.targetIds;
  const second=c.battle!.heroes.find(h=>h.id===ids[1])!;
  c=acquireTrinket(c,{trinketId:'community-trinket-core-protective-padlock',heroId:second.sourceId,source:'debug',sourceEventId:'c3e:later-target'}).campaign;
  for(let n=0;n<8&&!c.pendingTrinketUseOpportunities.some(o=>o.status==='open');n++)c=advancePendingMonsterAttack(c,false,true);
  expect(c.battle!.pendingMonsterAttack!.targetHeroUnitId).toBe(second.id);const restored=roundTrip(c);
  expect(stable(drain(restored))).toEqual(stable(drain(structuredClone(c))));
 });
 it('preserves pinned disease draws and shuffle continuation without reroll',()=>{
  const disease=explicitPlayerBattle('swine-wretch');expect(Object.keys(disease.battle!.productionMonsterContext!.pendingExecution!.diseaseDraws).length).toBeGreaterThan(0);
  expect(stable(drain(roundTrip(disease)))).toEqual(stable(drain(structuredClone(disease))));
  const shuffle=explicitPlayerBattle('swine-slasher',0,true);expect(shuffle.battle!.productionMonsterContext!.pendingChoice!.kind).toBe('SHUFFLE');
  expect(stable(drain(roundTrip(shuffle)))).toEqual(stable(drain(structuredClone(shuffle))));
 });
 it('keeps historical Necromancer Threat saves on their accepted executor',()=>{
  const c=playerOrdinaryFixture();expect(c.battle!.ruinsContext!.executionSchemaVersion).toBe(2);
  expect(roundTrip(c).battle!.productionMonsterContext).toBeUndefined();
 });
 it('rejects an orphaned or forged production cursor without silently clearing it',()=>{
  const c=explicitPlayerBattle();c.battle!.productionMonsterContext!.pendingExecution!.attackRoll=9;
  expect(validateSaveFile(createSaveSnapshot(c))).not.toBeNull();
 });
});
