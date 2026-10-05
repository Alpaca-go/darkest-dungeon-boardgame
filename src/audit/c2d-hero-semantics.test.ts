import { describe,it,expect } from 'vitest';
import { heroRuntimeFixture,fixtureExecute,prepareHeroFixture } from '../testing/c2d-hero-runtime-fixture';
import { SeededRandom } from '../game-engine/runtime-sources';
import { resolveProductionHeroSkill } from '../data/heroes/runtime-registry';
import { printedValue } from '../game-engine/heroes/production-hero';
import { applyProductionHeroInput,productionTargetCandidates } from '../game-engine/heroes/production-runtime';
import { fixtureContinue } from '../testing/c2d-hero-runtime-fixture';
import { applyStatusEffectEvent,resolveStartOfTurnConditions,synchronizePrintedConditionTokens } from '../game-engine/status-effects';
import { validateHeroRuntime } from '../game-engine/heroes/save-contract';
const rollSeed=(roll:number)=>{for(let seed=1;seed<1000;seed++)if(1+Math.floor(new SeededRandom(seed).next()*10)===roll)return seed;throw new Error('Seed missing');};
const token=(type:string,turns:number,eventId=type,magnitude?:number)=>({eventId,type,turns,magnitude:magnitude===undefined?{presence:'PRINTED_ABSENT' as const}:{presence:'PRINTED_VALUE' as const,value:magnitude}});
describe('C2D source-clear semantic execution',()=>{
  it.each([1,2,3] as const)('applies exact ordinary/critical damage at Level %i, with no formula bonus',level=>{
    for(const roll of [1,5]) {
      const a=resolveProductionHeroSkill('crusader','crusader-smite',level).actions.front.attack!;
      const initial=heroRuntimeFixture('crusader','crusader-smite',level,rollSeed(roll));
      const c=fixtureExecute(initial,'crusader-smite'),p=c.heroProductionSession!.pendingAction!,target=p.frozenTargetIds[0];
      const expected=roll<=printedValue(a.crit,'crit')?printedValue(a.critDamage,'critical'):printedValue(a.damage,'damage');
      expect(c.battle!.monsters.find(m=>m.id===target)!.hp).toBe(100-expected);
      expect(p.storedRolls).toEqual([roll]);expect(c.heroProductionSession!.events.some(e=>e.deferredId==='C2C-DEFER-MODIFIER-PHASE')).toBe(true);
    }
  });
  it('multi-target rolls once and heals every target by its independently printed Critical Heal',()=>{
    let c=heroRuntimeFixture('vestal','vestal-divine-comfort',2,rollSeed(1));
    c=prepareHeroFixture(c,c=>{c.heroes.forEach(h=>h.wounds=10);c.battle!.heroes.forEach(u=>u.hp=u.maxHp-10);});
    const initial=structuredClone(c),a=resolveProductionHeroSkill('vestal','vestal-divine-comfort',2).actions.front;
    c=fixtureExecute(c,'vestal-divine-comfort');const p=c.heroProductionSession!.pendingAction!;
    expect(p.frozenTargetIds).toHaveLength(3);expect(p.storedRolls).toEqual([1]);expect(c.heroProductionSession!.rngCalls).toBe(1);
    for(const id of p.frozenTargetIds)expect(c.battle!.heroes.find(u=>u.id===id)!.hp-initial.battle!.heroes.find(u=>u.id===id)!.hp).toBe(printedValue(a.healing!.critWounds,'critical heal'));
    expect(c.battle!.heroes.find(u=>u.id===p.heroActorId)!.hp-initial.battle!.heroes.find(u=>u.id===p.heroActorId)!.hp).toBe(3);
  });
  it('ally Dodge changes healing hits independently with a single stored roll',()=>{
    const c=heroRuntimeFixture('vestal','vestal-divine-comfort',3,rollSeed(10));
    const done=fixtureExecute(c,'vestal-divine-comfort');
    const p=done.heroProductionSession!.pendingAction!,a=resolveProductionHeroSkill('vestal','vestal-divine-comfort',3).actions.front;
    for(const id of p.frozenTargetIds)expect(p.storedOutcomes[id].hit).toBe(10<=printedValue(a.roll.accuracy,'accuracy')-done.battle!.heroes.find(u=>u.id===id)!.bossCombatDodge!);
  });
  it('Self conditions ignore resistance/immunity and execute even after a missed attack',()=>{
    let c=heroRuntimeFixture('leper','leper-intimidate',1,rollSeed(10));
    c=prepareHeroFixture(c,c=>{const actor=c.battle!.heroes.find(u=>u.id===c.battle!.activeActorId)!;actor.immunities=['buff'];actor.categoricalResistances=['debuff'];});
    c=fixtureExecute(c,'leper-intimidate');const p=c.heroProductionSession!.pendingAction!;
    expect(Object.values(p.storedOutcomes).every(o=>!o.hit)).toBe(true);
    expect(c.heroProductionSession!.events.some(e=>e.field.startsWith('selfEffects')&&e.eventType==='HERO_EFFECT_RESOLVED')).toBe(true);
  });
  it('applies and removes all condition stacks through shared condition transactions',()=>{
    let c=heroRuntimeFixture('plague-doctor','plague-doctor-battlefield-medicine',1,rollSeed(1));
    c=prepareHeroFixture(c,c=>{c.battle!.heroes=c.battle!.heroes.map(u=>synchronizePrintedConditionTokens({...u,printedConditionTokens:[token('bleed',3,'bleed1',2),token('bleed',1,'bleed2',1),token('blight',2,'blight',1)]}));});
    c=fixtureExecute(c,'plague-doctor-battlefield-medicine');
    for(const id of c.heroProductionSession!.pendingAction!.frozenTargetIds){const u=c.battle!.heroes.find(u=>u.id===id)!;expect(u.bleed).toBe(0);expect(u.blight).toBe(0);expect(u.printedConditionTokens).toEqual([]);}
    const sample=synchronizePrintedConditionTokens({...c.battle!.heroes[0],hp:20,printedConditionTokens:[token('bleed',3,'b1',2),token('bleed',1,'b2',1)]});
    const next=resolveStartOfTurnConditions(sample).unit;expect(next.hp).toBe(17);expect(next.bleed).toBe(2);expect(next.printedConditionTokens).toHaveLength(1);
  });
  it('uses categorical resistance once and never rolls prototype d100 resistance',()=>{
    const c=heroRuntimeFixture('plague-doctor','plague-doctor-noxious-blast',1,rollSeed(1));
    const prepared=prepareHeroFixture(c,c=>{c.battle!.monsters.forEach(u=>u.categoricalResistances=['blight']);});
    const done=fixtureExecute(prepared,'plague-doctor-noxious-blast'),p=done.heroProductionSession!.pendingAction!;
    expect(done.heroProductionSession!.rngCalls).toBe(1);
    const target=done.battle!.monsters.find(u=>u.id===p.frozenTargetIds[0])!;
    const e=resolveProductionHeroSkill('plague-doctor','plague-doctor-noxious-blast',1).actions.front.targetEffects.find(e=>e.kind==='CONDITION')!;
    expect(target.printedConditionTokens![0].turns).toBe(e.kind==='CONDITION'?printedValue(e.duration,'duration')-1:NaN);
    const receipt=done.battle!.statusEffectEvents![0];expect(applyStatusEffectEvent(done.battle!,target.id,receipt.effects,receipt.eventId)).toBe(done.battle);
  });
  it('Push changes both Area and Stance while self timing remains deferred',()=>{
    const c=fixtureExecute(heroRuntimeFixture('highwayman','highwayman-point-blank-shot',1,rollSeed(1)),'highwayman-point-blank-shot'),p=c.heroProductionSession!.pendingAction!;
    const target=c.battle!.monsters.find(u=>u.id===p.frozenTargetIds[0])!;
    expect(c.battle!.largeMovementContract!.placements[target.id]).toBe('A1');expect(target.stance).toBe('defensive');
    expect(c.battle!.largeMovementContract!.placements[p.heroActorId]).toBe('A0');validateHeroRuntime(c);
  });
  it('requires explicit target choice even for a single candidate and preserves stable ordering',()=>{
    let c=heroRuntimeFixture('crusader','crusader-smite');c=applyProductionHeroInput(c,{type:'START',actorId:c.battle!.activeActorId!,skillId:'crusader-smite'});
    c=fixtureContinue(fixtureContinue(c));const p=c.heroProductionSession!.pendingAction!;
    expect(p.pendingChoice!.candidateIds).toEqual(productionTargetCandidates(c,p));expect(p.frozenTargetIds).toEqual([]);
    expect(()=>applyProductionHeroInput(c,{type:'ADVANCE'})).toThrow('Choice');
    expect(()=>applyProductionHeroInput(c,{type:'TARGETS',targetIds:['fixture-monster-1','fixture-monster-2']})).toThrow('count');
  });
});
