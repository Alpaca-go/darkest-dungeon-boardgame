import { describe,it,expect } from 'vitest';
import { heroTamperCases } from '../testing/c2d-tamper-cases';
import { heroRuntimeFixture,fixtureExecute } from '../testing/c2d-hero-runtime-fixture';
import { validateHeroRuntime } from '../game-engine/heroes/save-contract';
import { createSaveSnapshot,migrateSaveFile,validateSaveFile,importSaveString } from '../game-engine/save';
import { resolveProductionHeroSkill } from '../data/heroes/runtime-registry';
import { readFileSync } from 'node:fs';
import { RUNTIME_SKILLS } from '../data/heroes/runtime-skills';
import { RUNTIME_PROFILES } from '../data/heroes/runtime-profiles';
import { applyProductionHeroInput } from '../game-engine/heroes/production-runtime';
import { assertHeroRuntimeModules } from '../../scripts/audit/c2d-hero-runtime';

describe('C2D hostile saved actions and isolation',()=>{
  const completed=fixtureExecute(heroRuntimeFixture('highwayman','highwayman-point-blank-shot'),'highwayman-point-blank-shot');
  it.each(Object.keys(heroTamperCases))('rejects %s before repair or RNG',name=>{
    const c=structuredClone(completed);heroTamperCases[name](c);const unchanged=JSON.stringify(c);
    expect(()=>validateHeroRuntime(c)).toThrow();const file=createSaveSnapshot(c);expect(validateSaveFile(file)).not.toBeNull();expect(migrateSaveFile(file)).toBeNull();expect(importSaveString(JSON.stringify(file)).error).not.toBeNull();expect(JSON.stringify(c)).toBe(unchanged);
  });
  it('rejects wrong ownership, prototype identities and non-I–III levels without resolver fallback',()=>{
    for(const args of [['vestal','crusader-smite',1],['crusader','vestal-sanctuary',1],['crusader','crusader-smite',0],['crusader','crusader-smite',4]] as const)expect(()=>resolveProductionHeroSkill(args[0],args[1],args[2])).toThrow();
  });
  it('rejects form-incompatible pending activations after save reload',()=>{
    const c=heroRuntimeFixture('abomination','abomination-rake');const u=c.battle!.heroes.find(u=>u.id===c.battle!.activeActorId)!;
    u.productionIdentity!.form='HUMAN';expect(()=>applyProductionHeroInput(c,{type:'START',actorId:u.id,skillId:'abomination-rake'})).toThrow('Form');
  });
  it('never imports prototype progression, fallback attacks or audit source modules in the executor',()=>{
    for(const path of ['src/game-engine/heroes/production-runtime.ts','src/game-engine/heroes/production-hero.ts','src/game-engine/heroes/action-plan.ts','src/data/heroes/runtime-registry.ts']) {
      expect(readFileSync(path,'utf8')).not.toMatch(/SKILL_LEVEL_BONUS|normalizeHeroSkill|Math\.random|HERO_LEVEL_PROFILES|HERO_LEVEL_REGISTRY|production-(skills|profiles|source-bindings)|docs\/data/);
    }
    const visit=(v:unknown)=>{if(!v||typeof v!=='object')return;const r=v as Record<string,unknown>;if(r.presence==='PRINTED_ABSENT')expect(r).not.toHaveProperty('value');Object.values(r).forEach(visit);};visit(RUNTIME_SKILLS);visit(RUNTIME_PROFILES);
  });
  it('localized deferred clauses execute zero RNG and retain independent effects',()=>{
    let c=heroRuntimeFixture('highwayman','highwayman-point-blank-shot');const original=structuredClone(c);
    c=fixtureExecute(c,'highwayman-point-blank-shot');
    expect(c.heroProductionSession!.rngCalls-original.heroProductionSession!.rngCalls).toBe(1);
    expect(c.heroProductionSession!.events.some(e=>e.deferredId==='C2C-DEFER-SELF-MOVEMENT-ORDER')).toBe(true);
    expect(c.heroProductionSession!.events.some(e=>e.eventType==='HERO_TARGET_BASE_RESOLVED')).toBe(true);
    expect(c.heroProductionSession!.pendingAction!.storedOutcomes).not.toEqual({});
  });
  it.each(['/repo/src/data/heroes/production-skills.ts','/repo/src/data/heroes/production-profiles.ts','/repo/src/data/heroes/production-source-bindings.ts','/repo/docs/data/complete-edition/c2c-hero-production-skill-definitions.json','/repo/docs/data/complete-edition/source-assets/c2b/skill.pdf'])('rejects forbidden player-bundle dependency %s',path=>{
    expect(()=>assertHeroRuntimeModules(['/repo/src/data/heroes/runtime-skills.ts',path])).toThrow('source corpus');
  });
});
