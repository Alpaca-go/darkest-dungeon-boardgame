import type { BattleUnit } from '../../types';
import type { HeroProductionActionPlan, RuntimeEffect, RuntimeSkill } from '../../types/hero-runtime';
import { HERO_DEFINITION_VERSION, HERO_RUNTIME_VERSION } from '../../data/heroes/runtime-registry';
import { printedValue } from './production-hero';

export const HERO_DEFERRED_IDS = Object.freeze(['C2C-DEFER-CRUSADER-PREPARATION-DAYS','C2C-DEFER-SELF-MOVEMENT-ORDER','C2C-DEFER-CONDITION-TRANSFER-STACKS','C2C-DEFER-TRANSFORM-ATOMIC-ORDER','C2C-DEFER-CONDITIONAL-CONNECTIVE','C2C-DEFER-MODIFIER-PHASE','C2C-DEFER-SERIALIZATION','C2C-DEFER-LEGACY-SAVE-IDENTITIES']);
export function deferredClauses(value: unknown): string[] {
  const ids=new Set<string>();
  function visit(v: unknown) {
    if (!v || typeof v!=='object') return;
    const row=v as Record<string,unknown>;
    if (row.semanticStatus==='DEFERRED_MANUAL_VALIDATION') {
      if (row.canonical!==false || row.executionBinding!==null || !HERO_DEFERRED_IDS.includes(String(row.deferredId))) throw new Error('Invalid deferred clause');
      ids.add(String(row.deferredId));
    }
    Object.values(row).forEach(visit);
  }
  visit(value); return [...ids].sort();
}
/** No schema feature is silently dropped; every source effect gets a plan node. */
export function compileHeroProductionActionPlan(skill: RuntimeSkill, actor: BattleUnit, actionId: string, rngCheckpoint: number, face: 'front'|'back'='front'): HeroProductionActionPlan {
  const identity=actor.productionIdentity;
  if (!identity || identity.heroId!==skill.heroId || skill.definitionVersion!==HERO_DEFINITION_VERSION || identity.runtimeVersion!==HERO_RUNTIME_VERSION) throw new Error('Unbound Hero action');
  const action=skill.actions[face];
  if (!action) throw new Error('Absent Skill face');
  const supported=new Set(['CONDITION','CONDITION_TRANSFER','MOVEMENT','TRANSFORM','DAMAGE_MODIFIER','IGNORE_DEFENSE','STRESS','HEALING','WOUNDS','LIGHT','DODGE','DAMAGE']);
  for (const effect of [...action.selfEffects,...action.targetEffects]) if (!supported.has(effect.kind)) throw new Error('Unsupported combat effect: '+effect.kind);
  if (action.attack) { printedValue(action.attack.accuracy,'accuracy'); printedValue(action.attack.damage,'damage'); }
  const nodes=(effects:RuntimeEffect[],field:string)=>effects.map((effect,i)=>({effectId:`${actionId}:${field}:${i}`,field:`${field}.${i}`,kind:effect.kind,deferredIds:deferredClauses(effect)}));
  return { ...identity,sourceBindingId:skill.sourceBindingId,actionId,heroActorId:actor.id,skillId:skill.skillId,skillLevel:skill.level,face,
    definitionVersion:HERO_DEFINITION_VERSION,runtimeVersion:HERO_RUNTIME_VERSION,phase:'VALIDATE_ACTIVATION',
    selectedTargetIds:[],frozenTargetIds:[],frozenSelfTargetIds:[],storedRolls:[],storedOutcomes:{},resolvedEffectIds:[],pendingEffectIndex:0,deferredEventIds:[],rngCheckpoint,
    pendingChoice:null,pendingTransition:null,nodes:[...nodes(action.selfEffects,'selfEffects'),...nodes(action.targetEffects,'targetEffects')] };
}
export function evaluateHeroPredicate(effect: Extract<RuntimeEffect,{kind:'DAMAGE_MODIFIER'}>, actor: BattleUnit, target: BattleUnit): boolean | null {
  const predicate=effect.predicate;
  if (predicate.connective!=='SINGLE') return null;
  const subject=predicate.subject==='SELF'?actor:target;
  if (predicate.kind==='TYPE') return !!subject.actorTypeTags?.sourceBindingId && predicate.values.some(tag=>subject.actorTypeTags!.tags.includes(tag));
  return predicate.values.some(v => v==='bleed'?subject.bleed>0:v==='blight'?subject.blight>0:v==='mark'?subject.marked:false);
}
