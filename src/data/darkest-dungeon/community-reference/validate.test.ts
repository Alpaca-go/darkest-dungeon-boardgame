import { describe, expect, it } from 'vitest';
import { COMMUNITY_BINDINGS, COMMUNITY_MONSTER_DECK, COMMUNITY_QUESTS } from './data';
import { validateCommunityReference } from './validate';

describe('community reference binding', () => {
  it('accepts the audited community-only binding', () => expect(validateCommunityReference()).toEqual([]));
  it('rejects official authority', () => expect(validateCommunityReference({ authority: 'OFFICIAL_RETAIL_VERIFIED', records: [], bindings: [], monsterDeck: COMMUNITY_MONSTER_DECK } as never)).not.toEqual([]));
  it('rejects a guessed blocked value', () => { const deck = { ...COMMUNITY_MONSTER_DECK, drawPolicy: { ...COMMUNITY_MONSTER_DECK.drawPolicy, value: 'DeckIDs order' } }; expect(validateCommunityReference({ authority: 'COMMUNITY_RETAIL_REFERENCE', records: [], bindings: COMMUNITY_BINDINGS, monsterDeck: deck } as never)).not.toEqual([]); });
  it('uses title-bound quests, not ordinal-only bindings', () => expect(COMMUNITY_QUESTS.map(q => q.id)).not.toContain('quest-1'));
  it('rejects prototype target without a binding basis', () => expect(validateCommunityReference({ authority: 'COMMUNITY_RETAIL_REFERENCE', records: [], bindings: [{ sourceLocalId: 'x', repositoryId: 'prototype-x', bindingBasis: '', sourceReference: [] }], monsterDeck: COMMUNITY_MONSTER_DECK } as never)).not.toEqual([]));
});
