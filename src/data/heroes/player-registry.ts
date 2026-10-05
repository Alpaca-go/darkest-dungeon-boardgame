import {HERO_CONTENT_SETS} from './player-content-sets';
import { RUNTIME_PROFILES } from './runtime-profiles';
import { PRODUCTION_HERO_IDS, HERO_RUNTIME_VERSION, resolveProductionHeroProfile, resolveProductionHeroSkill, productionHeroSkillIds } from './runtime-registry';
import type { CampaignState, HeroInstance } from '../../types';
import type { HeroForm } from '../../types/hero-runtime';
export const HERO_PLAYER_POLICY = Object.freeze({version:'C2E-HERO-PLAYER-POLICY-v1',canonical:false,semanticStatus:'DEFERRED_MANUAL_VALIDATION',skillSlots:3,trinketSlots:1,completeEditionPool:18});
export function isProductionCampaign(c:CampaignState) {return c.heroRuntimeSelection?.runtimeVersion===HERO_RUNTIME_VERSION;}
export function playerHero(heroId:string,level:1|2|3=1,form:HeroForm|null=heroId==='abomination'?'HUMAN':null) {
 const definition=RUNTIME_PROFILES.find(p=>p.heroId===heroId&&p.level===level); if(!definition) throw new Error('Unknown player Hero');
 return {heroId,contentSet:HERO_CONTENT_SETS[heroId],printedName:definition.printedName,levels:[1,2,3] as const,skillIds:productionHeroSkillIds(heroId),profile:resolveProductionHeroProfile(heroId,level,form),form};
}
export const HERO_PLAYER_REGISTRY=PRODUCTION_HERO_IDS.map(id=>playerHero(id));
export function playerSkills(hero:HeroInstance) {return productionHeroSkillIds(hero.heroId).map(id=>resolveProductionHeroSkill(hero.heroId,id,hero.skillLevels[id]??1));}
export function playerSkillName(hero:HeroInstance,id:string) {return resolveProductionHeroSkill(hero.heroId,id,hero.skillLevels[id]??1).printedName;}
export function productionMaxHeroLevel(heroId:string) {return Math.max(...RUNTIME_PROFILES.filter(p=>p.heroId===heroId).map(p=>p.level));}
export function productionMaxSkillLevel(heroId:string,skillId:string) {for(const level of [3,2,1]) {try {resolveProductionHeroSkill(heroId,skillId,level);return level;} catch {}} return 0;}
