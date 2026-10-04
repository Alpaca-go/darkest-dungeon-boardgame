import type { CampaignState } from '../../types';
import { HERO_RUNTIME_VERSION, LEGACY_HERO_SELECTION, LEGACY_HERO_RUNTIME, PRODUCTION_HERO_SELECTION, resolveProductionHeroProfile, resolveProductionHeroSkill } from '../../data/heroes/runtime-registry';
import { getHeroById } from '../../data/heroes';
import { getSkillById } from '../../data/skills';
import { resolveProductionUnitDodge, printedValue } from './production-hero';
import { replayProductionHeroSession } from './production-runtime';

export function stableHeroState(v:unknown):string {
  return JSON.stringify(v,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
}
export function validateHeroRuntime(c:CampaignState,checkReplay=true):void {
  const selection=c.heroRuntimeSelection??LEGACY_HERO_SELECTION;
  if(selection.runtimeVersion===LEGACY_HERO_RUNTIME) {
    if(stableHeroState(selection)!==stableHeroState(LEGACY_HERO_SELECTION)||c.heroProductionSession)throw new Error('Invalid legacy Hero selection');
    for(const h of c.heroes??[]) {
      if(h.productionIdentity||!getHeroById(h.heroId))throw new Error('Mixed legacy Hero identity');
      for(const id of [...h.equippedSkillIds,...Object.keys(h.skillLevels??{})]) {
        const historical=getSkillById(id);
        if(historical&&historical.heroId!==h.heroId)throw new Error('Invalid legacy Hero Skill ownership');
      }
    }
    if(c.battle?.heroes.some(h=>h.productionIdentity))throw new Error('Production BattleUnit on legacy route');
    return;
  }
  if(selection.runtimeVersion!==HERO_RUNTIME_VERSION||stableHeroState(selection)!==stableHeroState(PRODUCTION_HERO_SELECTION))throw new Error('Unknown Hero runtime/definition version');
  for(const h of c.heroes) {
    const identity=h.productionIdentity;
    if(!identity||identity.heroId!==h.heroId||identity.level!==h.level||identity.definitionVersion!==selection.definitionVersion||identity.runtimeVersion!==selection.runtimeVersion)throw new Error('Production Hero identity mismatch');
    const p=resolveProductionHeroProfile(h.heroId,h.level,identity.form);
    if(identity.sourceBindingId!==p.sourceBindingId||h.maxLife!==printedValue(p.life,'life'))throw new Error('Production Profile mismatch');
    if(!Array.isArray(h.equippedSkillIds)||new Set(h.equippedSkillIds).size!==h.equippedSkillIds.length||h.equippedSkillIds.length>7)throw new Error('Production loadout invalid');
    for(const id of h.equippedSkillIds)if(!h.skillLevels[id])throw new Error('Production Skill Level missing');
    for(const [id,level] of Object.entries(h.skillLevels)) {resolveProductionHeroSkill(h.heroId,id,level);if(level>h.level)throw new Error('Production Skill Level mismatch');}
  }
  for(const u of c.battle?.heroes??[]) {
    resolveProductionUnitDodge(u);const h=c.heroes.find(h=>h.instanceId===u.sourceId);
    if(!h||stableHeroState(u.productionIdentity)!==stableHeroState(h.productionIdentity)||stableHeroState(u.skillLevels)!==stableHeroState(h.skillLevels)||stableHeroState(u.equippedSkillIds)!==stableHeroState(h.equippedSkillIds))throw new Error('Production battle identity/loadout mismatch');
  }
  const s=c.heroProductionSession;
  if(s&&checkReplay) {
    if(!Array.isArray(s.inputs)||s.inputs.length>10000||s.origin.heroProductionSession)throw new Error('Invalid Hero replay envelope');
    validateHeroRuntime(s.origin,false);
    const replay=replayProductionHeroSession(c);
    const normalized=(v:CampaignState)=>{const {updatedAt,saveVersion,...gameplay}=v;void updatedAt;void saveVersion;return gameplay;};
    if(stableHeroState(normalized(replay))!==stableHeroState(normalized(c)))throw new Error('Hero replay checkpoint tampered: state/roll/target/phase/effect/RNG mismatch');
  }
}
/** v22 -> v23 is metadata-only; no RNG, HP, levels or identity conversion. */
export function migrateHeroRuntimeV23(c:CampaignState):CampaignState {
  if(c.heroRuntimeSelection){validateHeroRuntime(c);return {...c,saveVersion:23};}
  if(c.heroProductionSession||c.heroes?.some(h=>h.productionIdentity)||c.battle?.heroes.some(h=>h.productionIdentity))throw new Error('Unselected production save');
  return {...c,saveVersion:23,heroRuntimeSelection:{...LEGACY_HERO_SELECTION}};
}
