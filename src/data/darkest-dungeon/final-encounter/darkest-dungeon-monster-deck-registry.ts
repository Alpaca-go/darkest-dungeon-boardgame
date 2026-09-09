/** Runtime gate for the official DD monster deck.  No cards are invented here. */
export interface OfficialDarkestDungeonMonsterDeck {
  id: string; sourceReference: string; monsterDefinitionIds: string[];
  deckComposition: Array<{ monsterDefinitionId: string; count: number }>;
  drawPolicy: 'shuffle-draw-discard'; officialDataStatus: 'verified' | 'unavailable'; enabledInOfficialPool: boolean;
}
export const OFFICIAL_DARKEST_DUNGEON_MONSTER_DECK: OfficialDarkestDungeonMonsterDeck | null = null;

export function getDarkestDungeonOfficialMonsterDeckDataGaps(): string[] {
  const deck = OFFICIAL_DARKEST_DUNGEON_MONSTER_DECK;
  if (!deck) return ['darkest-dungeon-monster-deck（official deck cards not imported）'];
  const gaps: string[] = [];
  if (!deck.sourceReference) gaps.push('sourceReference');
  if (!deck.monsterDefinitionIds.length) gaps.push('monsterDefinitionIds');
  if (!deck.deckComposition.length) gaps.push('deckComposition');
  if (!deck.drawPolicy) gaps.push('drawPolicy');
  if (deck.monsterDefinitionIds.some((id) => id.startsWith('prototype-')) || deck.deckComposition.some((card) => card.monsterDefinitionId.startsWith('prototype-') || !Number.isSafeInteger(card.count) || card.count <= 0 || !deck.monsterDefinitionIds.includes(card.monsterDefinitionId))) gaps.push('invalid composition');
  return gaps;
}
export function isDarkestDungeonOfficialMonsterDeckEnabled(): boolean {
  const deck = OFFICIAL_DARKEST_DUNGEON_MONSTER_DECK;
  return !!deck && deck.enabledInOfficialPool && deck.officialDataStatus === 'verified' && !deck.id.startsWith('prototype-') && getDarkestDungeonOfficialMonsterDeckDataGaps().length === 0;
}
