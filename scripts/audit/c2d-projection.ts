import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { HERO_PRODUCTION_PROFILES } from '../../src/data/heroes/production-profiles';
import { HERO_PRODUCTION_SKILLS } from '../../src/data/heroes/production-skills';
import type { Compact } from '../../src/types/hero-runtime';

const auditKeys = new Set(['literal','literalVariants','printedFields','printedGlyphs','printedNotation','printedBack','contentSet','hamletAbility','physicalCardId','runtimeSupport','schemaVersion']);
/** Mechanical projection: only audit/hamlet material is removed. Printed absence is retained. */
export function project<T>(value: T): Compact<T> {
  if (Array.isArray(value)) return value.map(project) as Compact<T>;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !auditKeys.has(k)).map(([k,v]) => [k,project(v)])) as Compact<T>;
  return value as Compact<T>;
}
export const projection = () => ({ profiles: project(HERO_PRODUCTION_PROFILES), skills: project(HERO_PRODUCTION_SKILLS) });
export function projectionModules() {
  const p = projection();
  return Object.entries(p).map(([kind,rows]) => ({ path: `src/data/heroes/runtime-${kind}.ts`, text:
    `// Generated mechanically by audit:complete-edition-c2d. Do not edit.\nimport type { Runtime${kind === 'profiles' ? 'Profile' : 'Skill'} } from '../../types/hero-runtime';\nimport { freezeProduction } from './production-freeze';\nexport const RUNTIME_${kind.toUpperCase()} = freezeProduction<Runtime${kind === 'profiles' ? 'Profile' : 'Skill'}[]>(${JSON.stringify(rows)});\n` }));
}
export function writeProjection() { for (const m of projectionModules()) writeFileSync(m.path,m.text); }
export function verifyProjection() {
  for (const m of projectionModules()) if (readFileSync(m.path,'utf8').replace(/\r\n/g,'\n') !== m.text) throw new Error('C2D projection mismatch: '+m.path);
  const p = projection();
  return { profiles: p.profiles.length, skills: p.skills.length, sourceForms: p.profiles.length+p.skills.length,
    sourceBindingIds: [...p.profiles,...p.skills].map(r => r.sourceBindingId), digest: createHash('sha256').update(JSON.stringify(p)).digest('hex'), prototypeSubstitution: false };
}
if (process.argv.includes('--write-projection')) writeProjection();
