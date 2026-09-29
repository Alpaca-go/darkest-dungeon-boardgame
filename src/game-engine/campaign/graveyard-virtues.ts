import dataJson from '../../../docs/data/complete-edition/c1c32r2-graveyard-virtue-definitions.json?raw';
import type { ResolveEffectDefinition } from '../../types';
import { pick } from '../random';
const cards = (JSON.parse(dataJson) as { cards: ResolveEffectDefinition[] }).cards;
export function resolveGraveyardVirtue(id: string): ResolveEffectDefinition | undefined {
  const card = cards.find(c => c.id === id);
  return card ? structuredClone(card) : undefined;
}
export function drawGraveyardVirtue(): ResolveEffectDefinition {
  if (cards.length !== 5 || cards.some(c => c.sourceAccuracy !== 'verified-card')) throw new Error('Unbound Graveyard Virtue pool');
  return structuredClone(pick(cards));
}
