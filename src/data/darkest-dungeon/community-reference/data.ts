import { COMMUNITY_REFERENCE_AUTHORITY } from './authority';
import type { CommunityField, CommunityRecord, SourceIdBinding } from './types';

const visual = (value: unknown, sourceReference: string[]): CommunityField => ({ value, sourceReference, evidenceType: 'confirmed_from_visual', status: 'confirmed' });
const blocked = (sourceReference: string[]): CommunityField => ({ value: null, sourceReference, evidenceType: 'unresolved', status: 'unresolved' });
const record = (id: string, refs: string[], status: CommunityRecord['status'] = 'confirmed'): CommunityRecord => ({ id, sourceAuthority: COMMUNITY_REFERENCE_AUTHORITY, sourceEdition: 'antha-complete-edition', enabledInOfficialPool: false, status, sourceReference: refs });

export const COMMUNITY_QUESTS = [
  { ...record('community-dd-quest-we-are-the-flame', ['asset:735bc3:face']), title: 'We Are The Flame', guardians: ['community-dd-guardian-shuffling-horror'], skippedFinalForm: 'community-dd-final-ancestor-second-form', firewoodCount: 1 },
  { ...record('community-dd-quest-light-the-way', ['asset:083199:face']), title: 'Light the Way', guardians: ['community-dd-guardian-templar-impaler', 'community-dd-guardian-templar-warlord'], skippedFinalForm: 'community-dd-final-ancestor-first-form', firewoodCount: 1 },
  { ...record('community-dd-quest-belly-of-the-beast', ['asset:6555d3:face']), title: 'Belly of the Beast', guardians: ['community-dd-guardian-mammoth-cyst', 'community-dd-guardian-white-cell-stalk'], skippedFinalForm: 'community-dd-final-gestating-heart', firewoodCount: 1 },
] as const;

export const COMMUNITY_ROOMS = [
  { ...record('community-dd-room-09-templars', ['asset:templars-room']), roomNumber: 9, printedName: 'Templars Room', pitExitRule: blocked(['asset:templars-room:face']) },
  { ...record('community-dd-room-10-shuffling-horror', ['asset:shuffling-horror-room']), roomNumber: 10, printedName: 'Shuffling Horror Room' },
  { ...record('community-dd-room-11-mammoth-cyst', ['asset:mammoth-cyst-room']), roomNumber: 11, printedName: 'Mammoth Cyst Room' },
  { ...record('community-dd-room-12-ancestor', ['asset:ancestor-room']), roomNumber: 12, printedName: 'Ancestor Room' },
] as const;

export const COMMUNITY_GUARDIANS = ['templar-impaler', 'templar-warlord', 'mammoth-cyst', 'white-cell-stalk', 'shuffling-horror', 'cultist-priest', 'malignant-growth'].map(name => ({ ...record(`community-dd-guardian-${name}`, [`printed:${name}`]), logicalDefinition: name, physicalInstancesPreserved: ['cultist-priest', 'malignant-growth'].includes(name) }));
export const COMMUNITY_DUNGEON_TILES = ['4ced96', 'd10a24'].map(sourceTileGuid => ({ ...record(`community-dd-tile-${sourceTileGuid}`, [`asset:${sourceTileGuid}:imageUrl`]), sourceTileGuid, sourceCoordinateSystem: 'schematic; not runtime coordinates', roomSlotCount: 16, bossCandidateSlotCount: 3 }));
export const COMMUNITY_FINAL_ENCOUNTER = [
  { ...record('community-dd-final-absolute-nothingness', ['asset:absolute-nothingness'], 'partial'), stance: blocked(['asset:absolute-nothingness:face']) },
  { ...record('community-dd-final-gestating-heart', ['asset:gestating-heart'], 'partial'), lethalWoundTimingRuling: blocked(['asset:gestating-heart:face']) },
  { ...record('community-dd-final-come-unto-your-maker', ['asset:come-unto-your-maker'], 'unresolved'), definition: blocked(['asset:come-unto-your-maker:face']) },
] as const;
export const COMMUNITY_MONSTER_DECK = { ...record('community-dd-darkest-dungeon-monster-deck', ['tts:monster-deck'], 'partial'), physicalCardCount: 26, logicalMonsterCompositionCount: 9, drawPolicy: blocked(['tts:DeckIDs']), deckIdsAreDrawPolicy: false } as const;

export const COMMUNITY_BINDINGS: readonly SourceIdBinding[] = [
  ...COMMUNITY_QUESTS.flatMap(q => q.guardians.map(repositoryId => ({ sourceLocalId: repositoryId.replace('community-dd-guardian-', ''), repositoryId, bindingBasis: 'exact printed guardian name on title-bound quest card', sourceReference: q.sourceReference }))),
  ...COMMUNITY_ROOMS.map(room => ({ sourceLocalId: `room-${room.roomNumber}`, repositoryId: room.id, bindingBasis: 'exact confirmed printed room identity', sourceReference: room.sourceReference })),
  ...COMMUNITY_DUNGEON_TILES.map(tile => ({ sourceLocalId: tile.sourceTileGuid, repositoryId: tile.id, bindingBasis: 'exact TTS GUID; source-local geometry only', sourceReference: tile.sourceReference })),
];
export const COMMUNITY_VISIBLE_FIELDS = [visual('community source field coverage is retained in the audited intake snapshot', ['intake:requirements'])];
