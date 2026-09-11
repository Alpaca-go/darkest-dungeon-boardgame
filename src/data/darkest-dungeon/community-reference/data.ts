import { BINDING_MANIFEST, NORMALIZED_CORPUS, SOURCE_REFERENCE_INDEX, requirement, type NormalizedRequirement } from './normalized';
export interface CommunityProjection { id: string; requirementId: string; sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE'; sourceEdition: 'antha-complete-edition'; enabledInOfficialPool: false; fields: NormalizedRequirement['fields']; assets: NormalizedRequirement['assets'] }
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const project = (r: NormalizedRequirement): CommunityProjection => ({ id: r.componentGroup === 'quest' ? `community-dd-quest-${slug(String(r.fields.name.value))}` : `community-dd-${r.requirementId.replace(/^tierB-/, '')}`, requirementId: r.requirementId, sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE', sourceEdition: 'antha-complete-edition', enabledInOfficialPool: false, fields: r.fields, assets: r.assets });
const byGroup = (group: string) => NORMALIZED_CORPUS.requirements.filter(r => r.componentGroup === group).map(project);
export const COMMUNITY_QUESTS = byGroup('quest');
export const COMMUNITY_GUARDIANS = NORMALIZED_CORPUS.requirements.filter(r => ['templars', 'mammoth-cyst', 'shuffling-horror'].includes(r.componentGroup) && r.componentType === 'battle-card').map(project);
export const COMMUNITY_ROOMS = NORMALIZED_CORPUS.requirements.filter(r => r.componentType === 'room-card').map(project);
export const COMMUNITY_DUNGEON_TILES = byGroup('dungeon-tile');
export const COMMUNITY_FINAL_ENCOUNTER = byGroup('final-encounter');
export const COMMUNITY_MONSTER_DECK = project(requirement('tierB-darkest-dungeon-monster-deck'));
export const COMMUNITY_BINDINGS = BINDING_MANIFEST.bindings;
export const COMMUNITY_SOURCE_INDEX = SOURCE_REFERENCE_INDEX;
export const COMMUNITY_DATASET = { corpus: NORMALIZED_CORPUS, sourceIndex: SOURCE_REFERENCE_INDEX, bindings: COMMUNITY_BINDINGS, quests: COMMUNITY_QUESTS, guardians: COMMUNITY_GUARDIANS, rooms: COMMUNITY_ROOMS, dungeonTiles: COMMUNITY_DUNGEON_TILES, finalEncounter: COMMUNITY_FINAL_ENCOUNTER, monsterDeck: COMMUNITY_MONSTER_DECK };
export const duplicatePhysicalDefinitions = ['tierB-cultist-priest', 'tierB-malignant-growth', 'tierB-perfect-reflection', 'tierB-imperfect-reflection'].map(id => { const r = requirement(id); return { logicalDefinition: project(r), physicalInstances: r.assets.map(a => ({ guid: a.guid, cardId: a.cardId, sourceReference: a.sourceObjectReference })), encounterQuantity: r.quantity }; });
export const monsterComposition = (COMMUNITY_MONSTER_DECK.fields.deckComposition.value as { totalCards: number; composition: Array<{ printedName: string; sourceLocalMonsterDefinitionId: string; count: number; members: Array<{ guid: string; cardId: number }> }> }).composition;
