import reviewedJson from '../../../docs/data/complete-edition/c1c35r2-prophet-production-definitions.json?raw';
import tileJson from '../../../docs/data/complete-edition/c1c35-prophet-tile-contract.json?raw';
import gateJson from '../../../docs/data/complete-edition/c1c35r2-prophet-gate-a-acceptance.json?raw';
import capacityJson from '../../../docs/data/complete-edition/c1c35r2-prophet-area-c-capacity-ruling.json?raw';
import glyphJson from '../../../docs/data/complete-edition/c1c35-prophet-glyph-semantic-contract.json?raw';
import type {BossDefinitionContract} from '../../types/boss-runtime';
import type {Stance} from '../../types';
import {BOSS_ENTRY_STANCES,resolveBossHeroStartingArea} from '../bosses/hero-entry';

export const PROPHET_RULE_SET_VERSION = 'C1C35R2-PROPHET-DIGITAL-DEFAULT-v1';
export const PROPHET_ACTOR_CAPACITY_VERSION = 'C1C35R2-PROPHET-AREA-C-CAPACITY-v1';
export const PROPHET_HERO_ENTRY_BLOCKER = 'PROPHET_FOUNDATION_BLOCKED_ON_HERO_ENTRY_PLACEMENT';

/** Null single-Area placement is valid when the accepted official stance map exists. */
export function assertProphetHeroEntryPlacement(level: 1 | 2 | 3): void {
  const definition = prophetProductionDefinition(level);
  for(const stance of BOSS_ENTRY_STANCES) resolveBossHeroStartingArea(definition,stance);
}
interface SourceDefinition {
  family: string; level: 1|2|3; ruleSetVersion: string; sourceContractVersion: string;
  battle: {cardId: number; physicalIdentity: string}; threat: {cardId: number; physicalIdentity: string};
  stats: {life: number; dodge: number; printedType: string; immunityGlyphs: string[]};
  skills: {stance: string;skills:Array<{name:string;crit:number;criticalDamage:number;accuracy:number;damage:number;printedRange:number|null;printedTargetGlyphCount:number|null}>};
  room: {value: {sourceCardId: number; roomNumber: number}};
  immunities: string[]; actionsPerRound: number;
}
const reviewed = JSON.parse(reviewedJson) as {definitions: SourceDefinition[]};
const tile = JSON.parse(tileJson) as {areas: Array<{id: string; capacity: {value?: number}; adjacent: string[]}>; prophetPlacement: {areaId: string}; stancePositions: {status:string;heroes:Record<Stance,string>}};
const gate = JSON.parse(gateJson) as {gateAPassed: boolean; ruleSetVersion: string; sourceContractVersion: string; rulingReferences: NonNullable<BossDefinitionContract['successorContract']>['rulingReferences']};
const capacity = JSON.parse(capacityJson) as {id: string; areaId: string; actorCapacity: number; canonical: boolean; authority: string};
const glyphs = JSON.parse(glyphJson) as {bindings:Array<{field:string;status:string;normalizedSemantic:{type?:string;turns?:number;amount?:number;levelAmounts?:number[]}}>};

/** Independently bound printed Level rows. Nullable fields are outside this phase's execution scope. */
export function prophetProductionDefinition(level: 1|2|3): BossDefinitionContract {
  if (tile.stancePositions.status!=='OFFICIAL_SOURCE' || Object.keys(tile.stancePositions.heroes).sort().join(',')!==[...BOSS_ENTRY_STANCES].sort().join(',')
    || BOSS_ENTRY_STANCES.some(s=>!tile.areas.some(a=>a.id===tile.stancePositions.heroes[s]))) throw new Error('Official Prophet Hero entry binding invalid');
  const row = reviewed.definitions.find(d => d.level === level);
  if (!row || !gate.gateAPassed || gate.ruleSetVersion !== PROPHET_RULE_SET_VERSION || row.ruleSetVersion !== gate.ruleSetVersion
    || row.sourceContractVersion !== gate.sourceContractVersion || row.family !== 'prophet' || row.stats.printedType!=='Unholy - Front - Large'
    || capacity.id !== PROPHET_ACTOR_CAPACITY_VERSION || capacity.canonical || capacity.authority !== 'PROJECT_RULING') throw new Error('Prophet source/ruling contract inconsistent');
  const semantic=(field:string)=>{const b=glyphs.bindings.find(b=>b.field===field);if(b?.status!=='OFFICIAL_SOURCE')throw new Error('Prophet glyph semantic unbound');return b.normalizedSemantic;};
  return {
    family:'prophet',level,ruleSetVersion:PROPHET_RULE_SET_VERSION,ruleSourcePolicyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',
    battleCardId:row.battle.cardId,threatAbilityCardId:row.threat.cardId,bossIdentityCardId:null,
    roomCardId:row.room.value.sourceCardId,roomNumber:row.room.value.roomNumber,
    bossStartArea:tile.prophetPlacement.areaId,heroStartArea:null,initialStance:row.skills.stance,
    heroStartingStanceAreas:{...tile.stancePositions.heroes},
    stats:{HP:row.stats.life,speed:null,dodge:row.stats.dodge,type:['Unholy','Front','Large'],glyphMeanings:{},immunityTokens:row.immunities.slice(),resistanceTokens:[]},
    actionsPerRound:row.actionsPerRound,skills:row.skills.skills.map((s,i)=>({number:i+1,name:s.name,range:s.printedRange??0,targetCount:s.printedTargetGlyphCount??0,
      accuracy:s.accuracy,crit:s.crit,critDamage:s.criticalDamage,damage:s.damage,
      stress:i===0?semantic('Stress').amount!:0,self:{direction:'NONE',count:0},targetEffect:{monster:''},
      ...(i===0?{applyEffects:[{type:'stun' as const,amount:1,durationTurns:semantic('Stun').turns!}]}:
        i===1?{applyEffects:[{type:'blight' as const,amount:semantic('Blight').levelAmounts![level-1],durationTurns:semantic('Blight').turns!}]}:{})})),
    attackTable:[{rollMin:1,rollMax:5,skill:1},{rollMin:6,rollMax:10,skill:2}],
    areas:tile.areas.map(a => ({id:a.id,capacity:a.id===capacity.areaId?capacity.actorCapacity:a.capacity.value!,highGround:null})),
    adjacency:tile.areas.flatMap(a=>a.adjacent.filter(id=>a.id<id).map(id=>[a.id,id])),
    supply:[],reanimation:false,captainThreat:false,hamlet:null,alias:null,
    sourceFieldIds:[`level-${level}-battle`,`level-${level}-stats`,`level-${level}-skill-table`,`level-${level}-threat`,'room','tile','target-effect-glyph-binding'],
    successorContract:{runtimeRegistered:true,gameplayEnabled:true,sourceContractVersion:gate.sourceContractVersion,
      sourceDefinition:structuredClone(row),rulingReferences:structuredClone(gate.rulingReferences)},
  };
}
