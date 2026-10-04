import { RUNTIME_PROFILES } from './runtime-profiles';
import { RUNTIME_SKILLS } from './runtime-skills';
import type { HeroForm } from '../../types/hero-runtime';

export const HERO_DEFINITION_VERSION = 'C2C-HERO-PRODUCTION-DEFINITION-v1';
export const HERO_RUNTIME_VERSION = 'C2D-HERO-PRODUCTION-RUNTIME-v1';
export const LEGACY_HERO_RUNTIME = 'LEGACY_HERO_RUNTIME_V1';
export const LEGACY_HERO_SELECTION = Object.freeze({ runtimeVersion: LEGACY_HERO_RUNTIME, definitionVersion: 'LEGACY_HERO_DEFINITION_V1' });
export const PRODUCTION_HERO_SELECTION = Object.freeze({ runtimeVersion: HERO_RUNTIME_VERSION, definitionVersion: HERO_DEFINITION_VERSION });
export const PRODUCTION_HERO_IDS = Object.freeze([...new Set(RUNTIME_PROFILES.map(p => p.heroId))]);
export function resolveProductionHeroProfile(heroId: string, level: number, form?: HeroForm | null) {
  const p = RUNTIME_PROFILES.find(p => p.heroId === heroId && p.level === level);
  if (!p) throw new Error('Unknown production Hero/Level');
  if ('default' in p.variants) {
    if (form != null) throw new Error('Forged Hero form');
    return p.variants.default;
  }
  if (form !== 'HUMAN' && form !== 'BEAST') throw new Error('Abomination form required');
  return form === 'HUMAN' ? p.variants.human : p.variants.beast;
}
export function resolveProductionHeroSkill(heroId: string, skillId: string, level: number) {
  const s = RUNTIME_SKILLS.find(s => s.heroId === heroId && s.skillId === skillId && s.level === level);
  if (!s) throw new Error('Unknown production Skill/ownership/Level');
  return s;
}
export function productionHeroSkillIds(heroId: string) {
  if (!PRODUCTION_HERO_IDS.includes(heroId)) throw new Error('Unknown production Hero');
  return RUNTIME_SKILLS.filter(s => s.heroId === heroId && s.level === 1).map(s => s.skillId);
}
