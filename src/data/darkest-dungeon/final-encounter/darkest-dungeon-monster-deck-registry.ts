/** Runtime gate for the official DD monster deck.  No cards are invented here. */
export interface OfficialDarkestDungeonMonsterCard { id: string; sourceReference: string; enabledInOfficialPool: boolean }
export const OFFICIAL_DARKEST_DUNGEON_MONSTER_DECK: OfficialDarkestDungeonMonsterCard[] = [];

export function getDarkestDungeonOfficialMonsterDeckDataGaps(): string[] {
  return OFFICIAL_DARKEST_DUNGEON_MONSTER_DECK.length > 0 ? [] : ['darkest-dungeon-monster-deck（official deck cards not imported）'];
}
export function isDarkestDungeonOfficialMonsterDeckEnabled(): boolean {
  return OFFICIAL_DARKEST_DUNGEON_MONSTER_DECK.length > 0 && OFFICIAL_DARKEST_DUNGEON_MONSTER_DECK.every((card) => card.enabledInOfficialPool && !!card.sourceReference && !card.id.startsWith('prototype-'));
}
