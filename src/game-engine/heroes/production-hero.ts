import type { BattleUnit, HeroInstance, Stance } from '../../types';
import type { HeroForm, HeroProductionIdentity } from '../../types/hero-runtime';
import type { PrintedField } from '../../types/hero-production';
import { resolveProductionHeroProfile, resolveProductionHeroSkill, PRODUCTION_HERO_SELECTION, productionHeroSkillIds } from '../../data/heroes/runtime-registry';
import { createInitialXpState } from '../progression/xp-ledger';

export function printedValue<T>(field: PrintedField<T>, name: string): T {
  if (field.presence !== 'PRINTED_VALUE') throw new Error('Non-applicable printed field: '+name);
  return field.value;
}
/** Stance and identity are explicit deployment inputs, never inferred from prototype Profiles. */
export function createProductionHero(input: { heroId: string; level: 1 | 2 | 3; instanceId: string; stance: Stance; partySlot: number; form?: HeroForm; skills: string[]; skillLevels?: Record<string,1|2|3> }): HeroInstance {
  const form = input.form ?? (input.heroId === 'abomination' ? 'HUMAN' : null);
  const p = resolveProductionHeroProfile(input.heroId,input.level,form);
  if (!input.instanceId || !['support','ranged','defensive','aggressive'].includes(input.stance) || !Number.isInteger(input.partySlot) || input.partySlot < 1 || input.partySlot > 4) throw new Error('Invalid production deployment');
  if (new Set(input.skills).size !== input.skills.length || input.skills.length > 7) throw new Error('Invalid production loadout');
  const levels = input.skillLevels ?? Object.fromEntries(input.skills.map(id => [id,input.level]));
  for (const [id,l] of Object.entries(levels)) {
    resolveProductionHeroSkill(input.heroId,id,l);
    if (l > input.level) throw new Error('Skill Level exceeds Hero Level');
  }
  for (const id of input.skills) if (!levels[id] || !productionHeroSkillIds(input.heroId).includes(id)) throw new Error('Production Skill level/ownership missing');
  const identity: HeroProductionIdentity = { ...PRODUCTION_HERO_SELECTION, heroId: input.heroId, level: input.level, form, sourceBindingId: p.sourceBindingId };
  return { instanceId:input.instanceId, heroId:input.heroId, name:input.heroId, level:input.level, productionIdentity:identity,
    maxLife:printedValue(p.life,'life'), wounds:0, stress:0,
    // Speed is not used by the card-based controlled initiative. This adapter slot is non-applicable.
    speed:p.speed.presence === 'PRINTED_VALUE' ? p.speed.value : 0, stance:input.stance, partySlot:input.partySlot,
    equippedSkillIds:[...input.skills], skillLevels:{...levels}, xp:0,xpState:createInitialXpState(0),isAlive:true,dead:false,atDeathsDoor:false,
    hasActedToday:false,temporaryDamageBonus:0,deathblowRollCount:0,resolveTestedThisQuest:false,resolveState:'normal',virtueId:null,afflictionId:null,
    heartAttackCount:0,positiveQuirkIds:[],negativeQuirkIds:[],lastResolveQuestId:null,lastMentalEventId:null,disease:null,pendingBleed:0,pendingBlight:0,equippedTrinkets:[] };
}
export function makeProductionHeroUnit(hero: HeroInstance): BattleUnit {
  const identity=hero.productionIdentity;
  if (!identity) throw new Error('Production Hero identity absent');
  const p=resolveProductionHeroProfile(identity.heroId,identity.level,identity.form);
  return { id:`u_${hero.instanceId}`,sourceId:hero.instanceId,name:hero.name,side:'hero',productionIdentity:{...identity},
    maxHp:printedValue(p.life,'life'),hp:Math.max(0,hero.maxLife-hero.wounds),stress:hero.stress,position:hero.partySlot,
    stance:hero.stance,speed:hero.speed,isAlive:hero.isAlive,atDeathsDoor:hero.atDeathsDoor,deathblowRollCount:hero.deathblowRollCount,
    bossCombatDodge:printedValue(p.dodge,'dodge'),productionMovement:structuredClone(p.movement),
    ...(p.tags.presence==='PRINTED_VALUE'?{actorTypeTags:{tags:[...p.tags.value],sourceBindingId:p.sourceBindingId}}:{}),
    categoricalResistances:p.categoricalResistances.presence==='PRINTED_VALUE'?[...p.categoricalResistances.value] as BattleUnit['categoricalResistances']:[],
    immunities:p.immunities.presence==='PRINTED_VALUE'?[...p.immunities.value]:[],equippedSkillIds:[...hero.equippedSkillIds],skillLevels:{...hero.skillLevels},
    heroLevel:hero.level,quirkIds:[...hero.positiveQuirkIds,...hero.negativeQuirkIds],diseaseId:hero.disease?.diseaseId??null,diseaseInstanceId:hero.disease?.instanceId??null,
    stunned:0,bleed:hero.pendingBleed,blight:hero.pendingBlight,marked:false,buffs:[],debuffs:[],actionPoints:0,
    resolveTestedThisQuest:hero.resolveTestedThisQuest,resolveState:hero.resolveState,virtueId:hero.virtueId,afflictionId:hero.afflictionId,mentalEffectResolvedTurnId:null };
}
export function resolveProductionUnitDodge(hero: BattleUnit) {
  const id=hero.productionIdentity;
  if (!id || id.runtimeVersion!==PRODUCTION_HERO_SELECTION.runtimeVersion || id.definitionVersion!==PRODUCTION_HERO_SELECTION.definitionVersion) throw new Error('Production Dodge identity invalid');
  const p=resolveProductionHeroProfile(id.heroId,id.level,id.form);
  if (p.sourceBindingId!==id.sourceBindingId || hero.maxHp!==printedValue(p.life,'life') || hero.bossCombatDodge!==printedValue(p.dodge,'dodge')) throw new Error('Production Dodge Profile mismatch');
  return printedValue(p.dodge,'dodge');
}
