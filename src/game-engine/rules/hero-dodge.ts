import {HERO_RUNTIME_VERSION,resolveProductionHeroProfile} from '../../data/heroes/runtime-registry';
import type {HeroInstance} from '../../types';
import finalTableJson from '../../../docs/data/complete-edition/c1c31r-hero-dodge-final-table.json?raw';
import rulingOverlayJson from '../../../docs/data/complete-edition/c1c31r-project-rulings-v2.json?raw';
import reviewedV1Json from '../../../docs/data/complete-edition/c1c30-reviewed-component-combat.json?raw';
import type { CombatSourceReference } from '../../types/component-combat';
import type { HeroDodgeRuleSetVersion, ResolvedHeroDodge } from '../../types/hero-dodge-rules';

export const HERO_DODGE_V1 = 'C1C28-DIGITAL-DEFAULT-v1';
export const HERO_DODGE_V2 = 'C1C31-DIGITAL-DEFAULT-v2';
type Row = Omit<ResolvedHeroDodge, 'value'> & { dodge: number; reason: string; riskMetadata?: { classification: string } };
const known = (JSON.parse(reviewedV1Json) as { heroDodge: Array<{ heroId: string; level: 1 | 2 | 3; dodge: number; sourceReferences: CombatSourceReference[] }> }).heroDodge;
const table = JSON.parse(finalTableJson) as { ruleSetVersion: string; inherits: string; rows: Row[] };
const overlay = JSON.parse(rulingOverlayJson) as { rulingSetVersion: string; inherits: string; overlayScope: string; rulings: Row[] };
const classes = ['crusader', 'vestal', 'highwayman', 'hellion', 'leper', 'occultist', 'plague-doctor', 'grave-robber'];
const key = (heroId: string, level: number) => `${heroId}:${level}`;

export function assertHeroDodgeRuleSetVersion(version: string): asserts version is HeroDodgeRuleSetVersion {
  if (version !== HERO_DODGE_V1 && version !== HERO_DODGE_V2) throw new Error(`Unsupported Hero Dodge ruleSetVersion: ${version}`);
}

/** Validate the complete explicit table before any resolved value can escape. */
function validateTable() {
  if (table.ruleSetVersion !== HERO_DODGE_V2 || table.inherits !== HERO_DODGE_V1
    || overlay.rulingSetVersion !== HERO_DODGE_V2 || overlay.inherits !== HERO_DODGE_V1 || overlay.overlayScope !== 'HERO_DODGE_ONLY') throw new Error('Invalid Hero Dodge v2 overlay');
  const expected = classes.flatMap(heroId => [1, 2, 3].map(level => key(heroId, level)));
  if (table.rows.length !== 24 || new Set(table.rows.map(r => key(r.heroId, r.level))).size !== 24
    || expected.some(pair => !table.rows.some(r => key(r.heroId, r.level) === pair))) throw new Error('Hero Dodge v2 table is incomplete or duplicated');
  if (overlay.rulings.length !== 21 || new Set(overlay.rulings.map(r => r.rulingId)).size !== 21) throw new Error('Hero Dodge v2 ruling coverage invalid');
  for (const row of table.rows) {
    if (!Number.isInteger(row.dodge) || row.dodge < 0 || row.dodge > 1 || row.ruleSetVersion !== HERO_DODGE_V2 || !row.reason) throw new Error('Invalid frozen Hero Dodge row');
    const official = known.find(r => r.heroId === row.heroId && r.level === row.level);
    if (official) {
      if (row.dodge !== official.dodge || row.authority !== 'OFFICIAL_SOURCE' || row.canonical !== true
        || row.canonicalSourceStatus !== 'OFFICIAL_SOURCE' || row.rulingId !== null
        || JSON.stringify(row.sourceReferences) !== JSON.stringify(official.sourceReferences)
        || overlay.rulings.some(r => r.heroId === row.heroId && r.level === row.level)) throw new Error('Official Hero Dodge override prohibited');
    } else {
      const ruling = overlay.rulings.find(r => r.heroId === row.heroId && r.level === row.level);
      if (row.authority !== 'PROJECT_RULING' || row.canonical !== false || row.canonicalSourceStatus !== 'SOURCE_UNRESOLVED'
        || row.rulingId !== `C1C31R-DODGE-${row.heroId.toUpperCase()}-L${row.level}` || !row.riskMetadata?.classification
        || !ruling || ruling.dodge !== row.dodge || ruling.rulingId !== row.rulingId || ruling.canonical !== false
        || ruling.authority !== row.authority || row.sourceReferences.length) throw new Error('Hero Dodge ruling provenance invalid');
    }
  }
}
validateTable();

/** Explicit version, explicit pair. No class formula, level inheritance, or zero fallback. */
export function resolveHeroDodge(input: { heroId: string; level: number; ruleSetVersion: string }): ResolvedHeroDodge {
  if(input.ruleSetVersion===HERO_RUNTIME_VERSION) {
    const p=resolveProductionHeroProfile(input.heroId,input.level,input.heroId==='abomination'?'HUMAN':null);
    if(p.dodge.presence!=='PRINTED_VALUE')throw new Error('Production Profile Dodge absent');
    return {heroId:input.heroId,level:input.level as 1|2|3,value:p.dodge.value,authority:'OFFICIAL_SOURCE',canonical:true,canonicalSourceStatus:'OFFICIAL_SOURCE',rulingId:null,sourceReferences:[],ruleSetVersion:HERO_RUNTIME_VERSION};
  }
  assertHeroDodgeRuleSetVersion(input.ruleSetVersion);
  if (!classes.includes(input.heroId) || ![1, 2, 3].includes(input.level)) throw new Error(`Unknown Hero Dodge pair: ${key(input.heroId, input.level)}`);
  if (input.ruleSetVersion === HERO_DODGE_V1) {
    const row = known.find(r => r.heroId === input.heroId && r.level === input.level);
    if (!row) throw new Error(`SOURCE_UNRESOLVED Hero Dodge pair in v1: ${key(input.heroId, input.level)}`);
    return { heroId: row.heroId, level: row.level, value: row.dodge, authority: 'OFFICIAL_SOURCE', canonical: true,
      canonicalSourceStatus: 'OFFICIAL_SOURCE', rulingId: null, sourceReferences: structuredClone(row.sourceReferences), ruleSetVersion: HERO_DODGE_V1 };
  }
  const row = table.rows.find(r => r.heroId === input.heroId && r.level === input.level);
  if (!row) throw new Error(`Missing frozen Hero Dodge pair: ${key(input.heroId, input.level)}`);
  return { heroId: row.heroId, level: row.level, value: row.dodge, authority: row.authority, canonical: row.canonical,
    canonicalSourceStatus: row.canonicalSourceStatus, rulingId: row.rulingId,
    sourceReferences: structuredClone(row.sourceReferences), ruleSetVersion: HERO_DODGE_V2 };
}

/** Production actor identity takes precedence over the legacy encounter dependency pin. */
export function resolveHeroDodgeForHero(hero:HeroInstance,legacyVersion:string):ResolvedHeroDodge {
 if(hero.productionIdentity) {
  const id=hero.productionIdentity,p=resolveProductionHeroProfile(hero.heroId,hero.level,id.form);
  if(id.runtimeVersion!==HERO_RUNTIME_VERSION||id.heroId!==hero.heroId||id.level!==hero.level||id.sourceBindingId!==p.sourceBindingId)throw new Error('Invalid production Hero Dodge identity');
  const result=resolveHeroDodge({heroId:hero.heroId,level:hero.level,ruleSetVersion:HERO_RUNTIME_VERSION});
  if(p.dodge.presence!=='PRINTED_VALUE'||result.value!==p.dodge.value)throw new Error('Production form Dodge differs');
  return result;
 }
 return resolveHeroDodge({heroId:hero.heroId,level:hero.level,ruleSetVersion:legacyVersion});
}
