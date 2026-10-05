import { HERO_PRODUCTION_PROFILES } from './production-profiles';
import { HERO_PRODUCTION_SKILLS } from './production-skills';
import type { HeroProductionLevel } from '../../types/hero-production';

/** Data-only candidate, intentionally absent from every live gameplay entrypoint. */
export const HERO_PRODUCTION_DEFINITION_REGISTRY = Object.freeze(Object.fromEntries(
  [...new Set(HERO_PRODUCTION_PROFILES.map(p => p.heroId))].map(heroId => [heroId, Object.freeze({
    heroId, profiles: Object.freeze(HERO_PRODUCTION_PROFILES.filter(p => p.heroId === heroId)),
    skillIds: Object.freeze([...new Set(HERO_PRODUCTION_SKILLS.filter(s => s.heroId === heroId).map(s => s.skillId))]),
  })]),
));
export const HERO_PRODUCTION_SKILL_REGISTRY = Object.freeze(Object.fromEntries(
  HERO_PRODUCTION_SKILLS.map(s => [`${s.heroId}:${s.skillId}:L${s.level}`, s]),
));
export function getProductionHeroProfile(heroId: string, level: HeroProductionLevel) {
  return HERO_PRODUCTION_DEFINITION_REGISTRY[heroId]?.profiles.find(p => p.level === level);
}
export function getProductionHeroSkill(skillId: string, level: HeroProductionLevel, heroId?: string) {
  return HERO_PRODUCTION_SKILLS.find(s => s.skillId === skillId && s.level === level && (!heroId || s.heroId === heroId));
}
export function getProductionSkillsByHero(heroId: string, level: HeroProductionLevel) {
  return HERO_PRODUCTION_SKILLS.filter(s => s.heroId === heroId && s.level === level);
}
