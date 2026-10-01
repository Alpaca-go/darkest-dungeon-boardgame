import reviewedJson from '../../../docs/data/complete-edition/c1c35r2-prophet-production-definitions.json?raw';
import tileJson from '../../../docs/data/complete-edition/c1c35-prophet-tile-contract.json?raw';
import gateJson from '../../../docs/data/complete-edition/c1c35r2-prophet-gate-a-acceptance.json?raw';
import capacityJson from '../../../docs/data/complete-edition/c1c35r2-prophet-area-c-capacity-ruling.json?raw';
import type {BossDefinitionContract} from '../../types/boss-runtime';

export const PROPHET_RULE_SET_VERSION = 'C1C35R2-PROPHET-DIGITAL-DEFAULT-v1';
export const PROPHET_ACTOR_CAPACITY_VERSION = 'C1C35R2-PROPHET-AREA-C-CAPACITY-v1';
export const PROPHET_HERO_ENTRY_BLOCKER = 'PROPHET_FOUNDATION_BLOCKED_ON_HERO_ENTRY_PLACEMENT';

/** Only accepted source-bound definitions can supply the Hero entry coordinate. */
export function assertProphetHeroEntryPlacement(level: 1 | 2 | 3): void {
  const definition = prophetProductionDefinition(level);
  if (!definition.heroStartArea || !definition.areas.some(area => area.id === definition.heroStartArea)) {
    throw new Error(`${PROPHET_HERO_ENTRY_BLOCKER}: production foundation acceptance requires a bound Room 11 Hero entry contract`);
  }
}
interface SourceDefinition {
  family: string; level: 1|2|3; ruleSetVersion: string; sourceContractVersion: string;
  battle: {cardId: number; physicalIdentity: string}; threat: {cardId: number; physicalIdentity: string};
  stats: {life: number; dodge: number; printedType: string; immunityGlyphs: string[]};
  skills: {stance: string};
  room: {value: {sourceCardId: number; roomNumber: number}};
  immunities: string[]; actionsPerRound: number;
}
const reviewed = JSON.parse(reviewedJson) as {definitions: SourceDefinition[]};
const tile = JSON.parse(tileJson) as {areas: Array<{id: string; capacity: {value?: number}; adjacent: string[]}>; prophetPlacement: {areaId: string}};
const gate = JSON.parse(gateJson) as {gateAPassed: boolean; ruleSetVersion: string; sourceContractVersion: string; rulingReferences: NonNullable<BossDefinitionContract['successorContract']>['rulingReferences']};
const capacity = JSON.parse(capacityJson) as {id: string; areaId: string; actorCapacity: number; canonical: boolean; authority: string};

/** Independently bound printed Level rows. Nullable fields are outside this phase's execution scope. */
export function prophetProductionDefinition(level: 1|2|3): BossDefinitionContract {
  const row = reviewed.definitions.find(d => d.level === level);
  if (!row || !gate.gateAPassed || gate.ruleSetVersion !== PROPHET_RULE_SET_VERSION || row.ruleSetVersion !== gate.ruleSetVersion
    || row.sourceContractVersion !== gate.sourceContractVersion || row.family !== 'prophet' || row.stats.printedType!=='Unholy - Front - Large'
    || capacity.id !== PROPHET_ACTOR_CAPACITY_VERSION || capacity.canonical || capacity.authority !== 'PROJECT_RULING') throw new Error('Prophet source/ruling contract inconsistent');
  return {
    family:'prophet',level,ruleSetVersion:PROPHET_RULE_SET_VERSION,ruleSourcePolicyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',
    battleCardId:row.battle.cardId,threatAbilityCardId:row.threat.cardId,bossIdentityCardId:null,
    roomCardId:row.room.value.sourceCardId,roomNumber:row.room.value.roomNumber,
    bossStartArea:tile.prophetPlacement.areaId,heroStartArea:null,initialStance:row.skills.stance,
    stats:{HP:row.stats.life,speed:null,dodge:row.stats.dodge,type:['Unholy','Front','Large'],glyphMeanings:{},immunityTokens:row.immunities.slice(),resistanceTokens:[]},
    actionsPerRound:row.actionsPerRound,skills:[],attackTable:[],
    areas:tile.areas.map(a => ({id:a.id,capacity:a.id===capacity.areaId?capacity.actorCapacity:a.capacity.value!,highGround:null})),
    adjacency:tile.areas.flatMap(a=>a.adjacent.filter(id=>a.id<id).map(id=>[a.id,id])),
    supply:[],reanimation:false,captainThreat:false,hamlet:null,alias:null,
    sourceFieldIds:[`level-${level}-battle`,`level-${level}-stats`,`level-${level}-skill-table`,`level-${level}-threat`,'room','tile','target-effect-glyph-binding'],
    successorContract:{runtimeRegistered:true,gameplayEnabled:false,sourceContractVersion:gate.sourceContractVersion,
      sourceDefinition:structuredClone(row),rulingReferences:structuredClone(gate.rulingReferences)},
  };
}
