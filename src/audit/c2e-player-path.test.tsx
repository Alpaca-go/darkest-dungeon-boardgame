import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {HERO_PLAYER_REGISTRY,playerSkills,playerHero} from '../data/heroes/player-registry';
import {createNewCampaign,selectParty,applyDefaultLoadout,equipSkill} from '../game-engine/campaign';
import {createProductionHero,makeProductionHeroUnit} from '../game-engine/heroes/production-hero';
import {validateHeroRuntime} from '../game-engine/heroes/save-contract';
import {createSaveSnapshot,restoreSaveSnapshot,validateSaveFile,migrateSaveFile} from '../game-engine/save';
import {resolveProductionHeroSkill,PRODUCTION_HERO_SELECTION,LEGACY_HERO_SELECTION} from '../data/heroes/runtime-registry';
import {killCampaignHero} from '../game-engine/hero-death';
import {startGuildVisit,addGuildUpgrade,commitGuildVisit} from '../game-engine/hamlet/guild';
import {getReplacementCandidates} from '../game-engine/stagecoach';
import {selectReplacementHero,confirmReplacement,addReplacementUpgrade} from '../game-engine/replacement';
import {playerGuildFixture,playerReplacementFixture,playerPrerequisite,playerOrdinaryFixture,playerBossFixture} from '../testing/c2e-player-fixtures';
import {commitProductionHeroInput,pendingProductionAction,rebaseProductionCheckpoint,productionActionAvailable} from '../game-engine/heroes/player-commands';
import {heroRuntimeFixture} from '../testing/c2d-hero-runtime-fixture';
import ProductionHeroCard from '../components/hero/ProductionHeroCard';
import ProductionSkillCard from '../components/skill/ProductionSkillCard';
import {commitOrdinaryRuinsAreaMove} from '../game-engine/commands/ordinary-ruins';
import {getTrinketCapacity} from '../game-engine/trinkets/capacity';
import {getHeroTrinketCapacity} from '../game-engine/progression/upgrade-core';
import {productionTargetSelectionError,productionLegalTargetSelection} from '../game-engine/heroes/production-runtime';
function trip(c:ReturnType<typeof createNewCampaign>) {const s=JSON.parse(JSON.stringify(createSaveSnapshot({...c,updatedAt:new Date(Date.parse(c.updatedAt)+1000).toISOString()})));expect(validateSaveFile(s)).toBeNull();const restored=restoreSaveSnapshot(s);expect({...restored,updatedAt:c.updatedAt}).toEqual(c);return restored;}
describe('C2E production player path',()=>{
 it.each(HERO_PLAYER_REGISTRY)('$heroId renders source Profile and all seven exact Skills',h=>{
  const hero=createProductionHero({heroId:h.heroId,level:1,instanceId:'render',stance:'aggressive',partySlot:1,skills:[],skillLevels:Object.fromEntries(h.skillIds.map(id=>[id,1]))});
  expect(renderToStaticMarkup(<ProductionHeroCard hero={hero}/>)).toContain(h.printedName);
  const skills=playerSkills(hero);expect(skills).toHaveLength(7);
  for(const skill of skills) {expect(skill.heroId).toBe(h.heroId);expect(skill.level).toBe(1);expect(renderToStaticMarkup(<ProductionSkillCard skill={skill}/>)).toContain(skill.printedName.replace(/&/g,'&amp;'));}
 });
 it('creates exactly four production Heroes with explicit selection and only owned Skills',()=>{
  const c=applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),HERO_PLAYER_REGISTRY.slice(0,4).map(h=>h.heroId)));
  expect(c.heroRuntimeSelection).toEqual(PRODUCTION_HERO_SELECTION);expect(c.heroes).toHaveLength(4);validateHeroRuntime(c);
  const h=c.heroes[0];expect(equipSkill(c,h.heroId,'crusader-holy-lance').heroes[0].equippedSkillIds).toEqual(h.equippedSkillIds);trip(c);
 });
 it('Guild resolves I / II / III Profiles, preserves wounds, and upgrades exact Skill Level',()=>{
  let c=playerGuildFixture();const id=c.heroes[0].instanceId;
  c=startGuildVisit(c,id);c=addGuildUpgrade(c,{type:'hero-level'});c=addGuildUpgrade(c,{type:'hero-level'});const result=commitGuildVisit(c);expect(result.ok,result.error??'').toBe(true);c=trip(result.campaign);
  const h=c.heroes[0];expect(h.level).toBe(3);expect(h.wounds).toBe(3);const life=playerHero(h.heroId,3).profile.life;expect(h.maxLife).toBe(life.presence==='PRINTED_VALUE'?life.value:0);
  const u=makeProductionHeroUnit(h);expect(u.bossCombatDodge).toBe(2);expect(u.categoricalResistances).toEqual(['stun','debuff']);
  c.hamlet.currentDay=2;c.hamlet.occupiedBuildingIds=[];c.heroes[0].hasActedToday=false;c.guildVisitSession=null;
  c=startGuildVisit(c,id);c=addGuildUpgrade(c,{type:'skill-level',skillId:h.equippedSkillIds[0]});c=addGuildUpgrade(c,{type:'skill-level',skillId:h.equippedSkillIds[0]});const upgraded=commitGuildVisit(c);expect(upgraded.ok,upgraded.error??'').toBe(true);c=trip(upgraded.campaign);
  expect(c.heroes[0].skillLevels[h.equippedSkillIds[0]]).toBe(3);expect(playerSkills(c.heroes[0])[0]).toEqual(resolveProductionHeroSkill(h.heroId,h.equippedSkillIds[0],3));
 });
 it('Stagecoach accepts an expansion Hero and only production Skills',()=>{
  let c=playerReplacementFixture();expect(getReplacementCandidates(c)).toHaveLength(18);expect(getReplacementCandidates(c).find(v=>v.hero.id==='crusader')!.selectable).toBe(false);
  const slot=c.stagecoach.pendingReplacement!.slots[0];c=selectReplacementHero(c,slot.deadCampaignHeroId,'musketeer');expect(c.stagecoach.pendingReplacement!.slots[0].draftHero!.productionIdentity).toBeTruthy();
  c=trip(confirmReplacement(c,slot.deadCampaignHeroId));expect(c.heroes[0].heroId).toBe('musketeer');expect(c.heroes[0].equippedSkillIds).toEqual(playerHero('musketeer').skillIds.slice(0,3));expect(c.stagecoach.waitingTokens).toBe(1);
 });
 it('Stagecoach uses source Level III and retains the explicitly deployed Stance of the replaced slot',()=>{
  let c=playerGuildFixture();c=killCampaignHero(c,{heroInstanceId:c.heroes[2].instanceId,cause:'deathblow-attack',source:'battle',resumePhase:'hamlet'});c.gamePhase='replacement';c.stagecoach.accumulatedXp=20;const id=c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;c=selectReplacementHero(c,id,'musketeer');c=addReplacementUpgrade(addReplacementUpgrade(c,id,{type:'hero-level'}),id,{type:'hero-level'});c=trip(confirmReplacement(c,id));const hero=c.heroes.find(h=>h.heroId==='musketeer')!;expect(hero.level).toBe(3);expect(hero.stance).toBe('support');expect(hero.maxLife).toBe(playerHero('musketeer',3).profile.life.presence==='PRINTED_VALUE'?(playerHero('musketeer',3).profile.life as {value:number}).value:0);expect(c.stagecoach.accumulatedXp).toBe(20);
 });
 it('real ordinary Monster entry uses production units and Profile Dodge for all four Heroes',()=>{const c=playerOrdinaryFixture();expect(c.battle!.ruinsContext).toBeTruthy();expect(c.battle!.heroes.every(h=>h.productionIdentity)).toBe(true);trip(c);});
 it('production attack consumes ordinary Monster source Dodge without a Boss-only field',()=>{
  let c=playerOrdinaryFixture();const actor=c.battle!.heroes.find(h=>h.productionIdentity!.heroId==='highwayman')!;
  // Controlled turn prerequisite; Monster definitions and placements remain the real source encounter.
  c.battle!.activeActorId=actor.id;c.battle!.currentActionPoints=2;c.battle!.pendingMonsterAttack=null;
  const skill=actor.equippedSkillIds!.find(id=>!!resolveProductionHeroSkill('highwayman',id,1).actions.front.attack&&productionActionAvailable(c,actor,id));expect(skill).toBeTruthy();
  expect(c.battle!.monsters.every(m=>m.bossCombatDodge===undefined)).toBe(true);
  c=trip(commitProductionHeroInput(c,{type:'START',actorId:actor.id,skillId:skill!}));
  if(pendingProductionAction(c)!.pendingChoice)c=trip(commitProductionHeroInput(c,{type:'TARGETS',targetIds:productionLegalTargetSelection(c)!}));
  for(let n=0;n<45&&pendingProductionAction(c);n++)c=trip(commitProductionHeroInput(c,{type:'ADVANCE'}));
  expect(pendingProductionAction(c)).toBeNull();expect(c.heroProductionSession!.completedActions).toHaveLength(1);
 });
 it('preserves legacy v22 identities and executor selection',()=>{
  let c=applyDefaultLoadout(selectParty(createNewCampaign(),['crusader','vestal','highwayman','hellion']));delete c.heroRuntimeSelection;c.saveVersion=22;const s={...createSaveSnapshot(c),version:22};const migrated=migrateSaveFile(s)!;expect(migrated.campaign.heroRuntimeSelection).toEqual(LEGACY_HERO_SELECTION);expect(migrated.campaign.heroes).toEqual(c.heroes);expect(validateSaveFile(migrated)).toBeNull();
 });
 it('keeps active action checkpoints strict and completed receipts stable across future campaign changes',()=>{
  let c=heroRuntimeFixture('crusader','crusader-smite');delete c.heroProductionSession;c=commitProductionHeroInput(c,{type:'START',actorId:c.battle!.activeActorId!,skillId:'crusader-smite'});trip(c);
  const p=pendingProductionAction(c)!;const target=p.pendingChoice!.candidateIds.find(id=>productionTargetSelectionError(c,[id])===null)!;
  c=commitProductionHeroInput(c,{type:'TARGETS',targetIds:[target]});for(let n=0;n<40&&pendingProductionAction(c);n++)c=trip(commitProductionHeroInput(c,{type:'ADVANCE'}));
  expect(pendingProductionAction(c)).toBeNull();const events=structuredClone(c.heroProductionSession!.events);c={...c,gold:c.gold+2};c=trip(rebaseProductionCheckpoint(c));expect(c.heroProductionSession!.events).toEqual(events);
  const forged=structuredClone(c);forged.heroRuntimeSelection=LEGACY_HERO_SELECTION;expect(()=>validateHeroRuntime(forged)).toThrow();
 });
 it.each(['necromancer','prophet'] as const)('real %s Boss uses the production executor with valid reload at each phase',family=>{
  let c=trip(playerBossFixture(family));const actor=c.battle!.heroes.find(h=>h.id===c.battle!.activeActorId)!;
  const skill=actor.equippedSkillIds!.find(id=>productionActionAvailable(c,actor,id));expect(skill).toBeTruthy();c=trip(commitProductionHeroInput(c,{type:'START',actorId:actor.id,skillId:skill!}));
  for(let n=0;n<45&&pendingProductionAction(c);n++) {const p=pendingProductionAction(c)!;const input=p.pendingChoice? p.pendingChoice.continuation.kind==='hero-production'&&p.pendingChoice.continuation.field==='targets'?{type:'TARGETS' as const,targetIds:[p.pendingChoice.candidateIds.find(id=>productionTargetSelectionError(c,[id])===null)!]}:{type:'MOVEMENT_CHOICE' as const,direction:p.pendingChoice.candidateIds[0].split(':')[0] as 'PUSH'|'PULL',destinationId:p.pendingChoice.candidateIds[0].split(':').slice(1).join(':')}:{type:'ADVANCE' as const};c=trip(commitProductionHeroInput(c,input));}
  expect(pendingProductionAction(c)).toBeNull();expect(c.heroProductionSession!.completedActions).toHaveLength(1);
 });
 it('exposes a legal mixed two-Hero / two-Monster selection without requiring every candidate',()=>{
  const c=heroRuntimeFixture('musketeer','musketeer-skeet-shot');const actor=c.battle!.heroes.find(h=>h.id===c.battle!.activeActorId)!;expect(productionActionAvailable(c,actor,'musketeer-skeet-shot')).toBe(true);
 });
 it('rejects unrelated commands during a pending action and malformed archived receipts',()=>{
  let c=heroRuntimeFixture('crusader','crusader-smite');delete c.heroProductionSession;c=commitProductionHeroInput(c,{type:'START',actorId:c.battle!.activeActorId!,skillId:'crusader-smite'});const before=structuredClone(c);expect(()=>commitOrdinaryRuinsAreaMove(c,'invalid')).toThrow('Finish the pending Hero action');expect(c).toEqual(before);
  let completed=heroRuntimeFixture('crusader','crusader-smite');delete completed.heroProductionSession;completed=commitProductionHeroInput(completed,{type:'START',actorId:completed.battle!.activeActorId!,skillId:'crusader-smite'});completed=commitProductionHeroInput(completed,{type:'TARGETS',targetIds:[completed.heroProductionSession!.pendingAction!.pendingChoice!.candidateIds[0]]});for(let n=0;n<40&&pendingProductionAction(completed);n++)completed=commitProductionHeroInput(completed,{type:'ADVANCE'});completed.heroProductionSession!.completedActions[0].runtimeVersion='forged';expect(()=>validateHeroRuntime(completed)).toThrow();
 });
 it('does not promote any of the provisional product policies to canonical rules',()=>{const c=playerPrerequisite();expect(c.saveVersion).toBe(23);const upgraded={...c.heroes[0],level:3 as const};expect(getTrinketCapacity(upgraded)).toBe(getHeroTrinketCapacity(upgraded));expect(getTrinketCapacity({level:3})).toBe(3);expect(HERO_PLAYER_REGISTRY).toHaveLength(18);expect(HERO_PLAYER_REGISTRY.flatMap(h=>h.skillIds)).toHaveLength(126);});
});
