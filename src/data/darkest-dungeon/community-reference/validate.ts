import { COMMUNITY_REFERENCE_AUTHORITY } from './authority';
import { COMMUNITY_BINDINGS, COMMUNITY_DUNGEON_TILES, COMMUNITY_FINAL_ENCOUNTER, COMMUNITY_MONSTER_DECK, COMMUNITY_QUESTS, COMMUNITY_ROOMS } from './data';
import type { CommunityField, CommunityRecord, SourceIdBinding } from './types';

export const COMMUNITY_COUNTS = { requirements: 26, requiredFields: 131, eligibleFields: 126, unresolvedFields: 5 } as const;
export function validateCommunityReference(input = { authority: COMMUNITY_REFERENCE_AUTHORITY, records: [...COMMUNITY_QUESTS, ...COMMUNITY_ROOMS, ...COMMUNITY_DUNGEON_TILES, ...COMMUNITY_FINAL_ENCOUNTER], bindings: COMMUNITY_BINDINGS, monsterDeck: COMMUNITY_MONSTER_DECK }): string[] {
  const errors: string[] = [];
  if (input.authority !== 'COMMUNITY_RETAIL_REFERENCE') errors.push('community authority must be COMMUNITY_RETAIL_REFERENCE');
  const records = input.records as readonly CommunityRecord[];
  if (records.some(r => r.sourceAuthority !== 'COMMUNITY_RETAIL_REFERENCE' || r.enabledInOfficialPool !== false)) errors.push('community records cannot be official or enabled in the official pool');
  if (new Set(COMMUNITY_QUESTS.map(q => q.title)).size !== 3) errors.push('quest titles must be unique');
  if (COMMUNITY_ROOMS.map(r => r.roomNumber).join(',') !== '9,10,11,12') errors.push('Room 9–12 identities must be complete');
  if (COMMUNITY_DUNGEON_TILES.length !== 2 || COMMUNITY_DUNGEON_TILES.some(t => t.roomSlotCount !== 16 || t.bossCandidateSlotCount !== 3)) errors.push('dungeon-tile source graph is incomplete');
  if (input.monsterDeck.physicalCardCount !== 26 || input.monsterDeck.drawPolicy.value !== null || input.monsterDeck.deckIdsAreDrawPolicy) errors.push('monster deck must preserve 26 physical cards and unresolved draw policy');
  const blockedFields: CommunityField[] = [COMMUNITY_ROOMS[0].pitExitRule, ...COMMUNITY_FINAL_ENCOUNTER.map(r => Object.values(r).find(v => typeof v === 'object' && v !== null && 'evidenceType' in v) as CommunityField), input.monsterDeck.drawPolicy];
  if (blockedFields.length !== 5 || blockedFields.some(f => f.value !== null || f.evidenceType !== 'unresolved')) errors.push('all five blocked fields must be null/unresolved');
  if ((input.bindings as readonly SourceIdBinding[]).some(b => !b.bindingBasis || b.repositoryId.includes('prototype') || b.sourceReference.length === 0)) errors.push('source-local binding must have non-prototype target, basis, and source reference');
  return errors;
}
