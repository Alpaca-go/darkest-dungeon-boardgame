import { describe, it, expect } from 'vitest';
import { RUNTIME_PROFILES } from '../data/heroes/runtime-profiles';
import { RUNTIME_SKILLS } from '../data/heroes/runtime-skills';
import { HERO_PRODUCTION_PROFILES } from '../data/heroes/production-profiles';
import { HERO_PRODUCTION_SKILLS } from '../data/heroes/production-skills';
import { project, verifyProjection } from '../../scripts/audit/c2d-projection';
import { PRODUCTION_HERO_IDS, resolveProductionHeroProfile, resolveProductionHeroSkill, LEGACY_HERO_SELECTION } from '../data/heroes/runtime-registry';
import { createProductionHero, makeProductionHeroUnit, printedValue } from '../game-engine/heroes/production-hero';
import { compileHeroProductionActionPlan, deferredClauses } from '../game-engine/heroes/action-plan';
import { applyProductionHeroInput } from '../game-engine/heroes/production-runtime';
import { heroRuntimeFixture, fixtureExecute } from '../testing/c2d-hero-runtime-fixture';
import { createSaveSnapshot, migrateSaveFile, restoreSaveSnapshot, validateSaveFile, SAVE_VERSION } from '../game-engine/save';
import { validateHeroRuntime } from '../game-engine/heroes/save-contract';
import { createHeroInstance, createNewCampaign } from '../game-engine/campaign';
import { verifyHistoricalBaseline } from '../../scripts/audit/historical-baseline';
import { getSkillsByHero } from '../data/skills';
import { resolveSourceAttackDodge } from '../game-engine/component-monster-runtime';
import { startSourceMonsterAttack } from '../game-engine/component-monster-runtime';
import { freezePendingMonsterAttack } from '../game-engine/battle';
import { bindBossEncounter } from '../game-engine/bosses/foundation';
import { resolveBossDefinition } from '../game-engine/bosses/definitions';

describe('C2D production Hero foundation',()=>{
  it('preserves the original C2C acceptance and unchanged tests at its accepted checkpoint',()=>verifyHistoricalBaseline('c2c',['src/audit/c2c-hero-production.test.ts']),600000);
  it('mechanically projects all 432 source forms without losing executable operands',()=>{
    expect(RUNTIME_PROFILES).toEqual(project(HERO_PRODUCTION_PROFILES));expect(RUNTIME_SKILLS).toEqual(project(HERO_PRODUCTION_SKILLS));
    expect(verifyProjection()).toMatchObject({profiles:54,skills:378,sourceForms:432,prototypeSubstitution:false});
  });
  it.each(PRODUCTION_HERO_IDS)('resolves %s at all three exact source Levels',heroId=>{
    for(const level of [1,2,3] as const) {
      const forms=heroId==='abomination'?['HUMAN','BEAST'] as const:[undefined];
      for(const form of forms) {
        const p=resolveProductionHeroProfile(heroId,level,form);
        const h=createProductionHero({heroId,level,form,instanceId:'test',stance:'aggressive',partySlot:1,skills:[]});
        const u=makeProductionHeroUnit(h);expect(h.maxLife).toBe(printedValue(p.life,'life'));expect(u.bossCombatDodge).toBe(printedValue(p.dodge,'dodge'));expect(u.productionMovement).toEqual(p.movement);
      }
    }
  });
  it.each(RUNTIME_SKILLS.map(s=>[s.skillId,s.level,s.heroId] as const))('compiles %s L%i', (skillId,level,heroId)=>{
    const c=heroRuntimeFixture(heroId,skillId,level),u=c.battle!.heroes.find(u=>u.id===c.battle!.activeActorId)!;
    const plan=compileHeroProductionActionPlan(resolveProductionHeroSkill(heroId,skillId,level),u,'compile',1);
    const a=resolveProductionHeroSkill(heroId,skillId,level).actions.front;
    expect(plan.nodes.length).toBe(a.selfEffects.length+a.targetEffects.length);
    expect(plan.nodes.flatMap(n=>n.deferredIds)).toEqual([...a.selfEffects,...a.targetEffects].flatMap(deferredClauses));
  });
  it.each(PRODUCTION_HERO_IDS)('executes a source attack end-to-end for %s',heroId=>{
    const s=RUNTIME_SKILLS.find(s=>s.heroId===heroId&&s.level===1&&s.actions.front.attack&&s.actions.front.targeting.scope==='ONE_ENEMY')!;
    const c=fixtureExecute(heroRuntimeFixture(heroId,s.skillId),s.skillId);
    expect(c.heroProductionSession!.pendingAction!.phase).toBe('COMPLETE');validateHeroRuntime(c);
    expect(c.heroProductionSession!.events.some(e=>e.eventType==='HERO_TARGET_BASE_RESOLVED')).toBe(true);
  });
  it.each(RUNTIME_SKILLS.filter(s=>s.level===1).map(s=>[s.skillId,s.heroId] as const))('executes every logical Skill independently, including deferred clauses: %s',(skillId,heroId)=>{
    const c=fixtureExecute(heroRuntimeFixture(heroId,skillId),skillId);expect(c.heroProductionSession!.pendingAction!.phase).toBe('COMPLETE');validateHeroRuntime(c);
  });
  it.each(['crusader-smite','vestal-divine-grace','shieldbreaker-puncture'])('uses independently printed I/II/III fields for %s',skillId=>{
    const samples=[1,2,3].map(level=>{const s=RUNTIME_SKILLS.find(s=>s.skillId===skillId&&s.level===level)!;const c=fixtureExecute(heroRuntimeFixture(s.heroId,s.skillId,s.level),skillId);return {a:s.actions.front,c};});
    expect(new Set(samples.map(s=>JSON.stringify(s.a))).size).toBe(3);
    samples.forEach(s=>expect(s.c.heroProductionSession!.pendingAction!.storedRolls.length).toBe(1));
  });
  it.each(['highwayman-point-blank-shot','vestal-divine-comfort','flagellant-suffer','abomination-transform-to-beast','plague-doctor-emboldening-vapours'])('save/reloads every engine step without rerolls/repeated effects: %s',skillId=>{
    const s=RUNTIME_SKILLS.find(s=>s.skillId===skillId&&s.level===1)!;
    const initial=heroRuntimeFixture(s.heroId,s.skillId);
    const continuous=fixtureExecute(initial,skillId),restored=fixtureExecute(initial,skillId,'front',c=>{
      const file=JSON.parse(JSON.stringify(createSaveSnapshot(c)));expect(validateSaveFile(file)).toBeNull();const migrated=migrateSaveFile(file)!;expect(migrated).not.toBeNull();return restoreSaveSnapshot(migrated);
    });
    expect(restored).toEqual(continuous);
    const receipts=restored.heroProductionSession!.events.filter(e=>e.deferredId);expect(new Set(receipts.map(e=>e.eventId)).size).toBe(receipts.length);
  });
  it('keeps both Abomination faces/forms and stages the deferred transition without committing it',()=>{
    for(const face of ['front','back'] as const) {
      const c=fixtureExecute(heroRuntimeFixture('abomination','abomination-transform-to-beast',1,31,face),'abomination-transform-to-beast',face);
      const p=c.heroProductionSession!.pendingAction!;expect(p.pendingTransition).toEqual(face==='front'?{from:'HUMAN',to:'BEAST'}:{from:'BEAST',to:'HUMAN'});
      expect(c.heroes[0].productionIdentity!.form).toBe(p.pendingTransition!.from);
      expect(c.heroProductionSession!.events.some(e=>e.deferredId==='C2C-DEFER-TRANSFORM-ATOMIC-ORDER')).toBe(true);
    }
    const c=heroRuntimeFixture('abomination','abomination-rake');c.battle!.heroes.find(u=>u.id===c.battle!.activeActorId)!.productionIdentity!.form='HUMAN';
    expect(()=>applyProductionHeroInput(c,{type:'START',actorId:c.battle!.activeActorId!,skillId:'abomination-rake'})).toThrow('Form');
  });
  it('preserves v22 legacy IDs, including prototype-only Skills, HP and RNG',()=>{
    const c=createNewCampaign();c.heroes=['crusader','vestal','highwayman','hellion','leper','occultist','plague-doctor','grave-robber'].map(id=>createHeroInstance(id)!);
    c.heroes.forEach(h=>{h.equippedSkillIds=getSkillsByHero(h.heroId).map(s=>s.id);h.skillLevels=Object.fromEntries(h.equippedSkillIds.map(id=>[id,1]));h.wounds=3;});
    delete c.heroRuntimeSelection;c.saveVersion=22;const file={...createSaveSnapshot(c),version:22};
    const migrated=migrateSaveFile(file)!;expect(migrated.version).toBe(23);expect(SAVE_VERSION).toBe(23);expect(migrated.campaign.heroRuntimeSelection).toEqual(LEGACY_HERO_SELECTION);expect(migrated.campaign.heroes).toEqual(c.heroes);expect(validateSaveFile(migrated)).toBeNull();
  });
  it.each(['necromancer','prophet'])('shared %s incoming attack uses production Profile Dodge',family=>{
    const c=heroRuntimeFixture('crusader','crusader-smite',3);
    const definition=resolveBossDefinition(family,1,family==='necromancer'?'C1C31-DIGITAL-DEFAULT-v2':'C1C35R2-PROPHET-DIGITAL-DEFAULT-v1');
    const battle=bindBossEncounter(c.battle!,definition,31);
    battle.pendingMonsterAttack={targetHeroUnitId:battle.heroes[0].id} as NonNullable<typeof battle.pendingMonsterAttack>;
    expect(resolveSourceAttackDodge(battle)).toBe(2);
    const printed=definition.skills[0];
    if(typeof printed.damage!=='number'||typeof printed.critDamage!=='number'||typeof printed.crit!=='number')throw new Error('Printed Boss attack not bound');
    const skill={id:`${family}-printed-attack`,monsterId:family,name:printed.name,usableFromPositions:[1,2,3,4],validTargetPositions:[1,2,3,4],targetSide:'enemy' as const,accuracy:printed.accuracy,minDamage:printed.damage,maxDamage:printed.critDamage,description:'Locked Boss contract'};
    const pending=startSourceMonsterAttack(battle,battle.monsters[0].id,[battle.heroes[0].id],Math.min(10,printed.accuracy),{
      skill,criticalEnabled:true,criticalThreshold:printed.crit,criticalDamage:printed.critDamage,targetPush:0,remainingHeroes:[],alreadyResolvedHeroes:[],successfulHits:[],parentEventId:'controlled-source-boss',targetAreaId:'A0',summonDefinitionId:null,skillNumber:printed.number});
    // Exercise the shared source attack stage independently of each Boss's room/command controller.
    expect(freezePendingMonsterAttack({...pending,bossEncounter:undefined}).pendingMonsterAttack!.hit).toBe(false);
  });
});
