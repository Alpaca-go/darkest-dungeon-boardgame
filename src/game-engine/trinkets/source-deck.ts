import { COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_CAPABILITIES } from '../../data/community-reference/production-runtime';
import type { CampaignState } from '../../types';

export interface SourceTrinketCard {
  id: string; name: string; level: 1 | 2 | 3; sourceSupported: true; sourceSemanticComplete: true;
  physicalCardIds: string[]; runtimeEffectReady: boolean;
}
export interface PendingSourceTrinketReward {
  sourceTrinketId: string; printedName: string; level: 1 | 2 | 3; sourceEventId: string;
  questId: string | null; acquiredAt: string; runtimeEffectReady: false;
  status: 'SOURCE_BOUND_EFFECT_RUNTIME_PENDING';
}

/** Source identity and physical membership only. Storage provenance supplies no rules. */
export function sourceTrinketDeck(): SourceTrinketCard[] {
  const cards = COMMUNITY_SOURCE_TRINKETS.filter(s => s.contentSet === 'core').map(s => {
    const capability = COMMUNITY_TRINKET_CAPABILITIES.find(c => c.definitionId === s.id);
    if (s.sourceStatus !== 'source-supported' || ![1, 2, 3].includes(s.level ?? 0)
      || s.unresolvedFields.length || s.positiveSide.unresolvedFields.length || s.negativeSide.unresolvedFields.length
      || !capability?.sourceSemanticComplete || !s.physicalCardIds.length)
      throw new Error('TRINKET_PHYSICAL_SOURCE_DECK_INCOMPLETE');
    return { id: s.id, name: s.printedName, level: s.level as 1 | 2 | 3,
      sourceSupported: true as const, sourceSemanticComplete: true as const,
      physicalCardIds: [...s.physicalCardIds], runtimeEffectReady: capability.productionReady };
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (cards.length !== 37 || new Set(cards.map(c => c.id)).size !== 37
    || [1, 2, 3].some((level, i) => cards.filter(c => c.level === level).length !== [14, 11, 12][i]))
    throw new Error('TRINKET_PHYSICAL_SOURCE_DECK_INCOMPLETE');
  return cards;
}

export function drawSourceBoundTrinketCard(level: 1 | 2 | 3, rng: () => number): SourceTrinketCard {
  const candidates = sourceTrinketDeck().filter(c => c.level === level);
  if (!candidates.length) throw new Error('TRINKET_PHYSICAL_SOURCE_DECK_INCOMPLETE');
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid source Trinket RNG');
  return candidates[Math.floor(value * candidates.length)];
}

export function assertSourceTrinketEffectAvailable(campaign: CampaignState, sourceTrinketId: string): void {
  if (campaign.pendingSourceTrinketRewards?.some(r => r.sourceTrinketId === sourceTrinketId))
    throw new Error('TRINKET_EFFECT_RUNTIME_UNAVAILABLE');
}

export function validateSourceTrinketRewards(campaign: Partial<CampaignState>): void {
  const rewards = campaign.pendingSourceTrinketRewards;
  if (rewards === undefined) return;
  if (!Array.isArray(rewards) || new Set(rewards.map(r => r.sourceEventId)).size !== rewards.length)
    throw new Error('Invalid source Trinket reward ledger');
  const deck = sourceTrinketDeck();
  for (const r of rewards) {
    const card = deck.find(c => c.id === r.sourceTrinketId);
    if (!card || card.runtimeEffectReady || r.runtimeEffectReady !== false || r.printedName !== card.name
      || r.level !== card.level || !r.sourceEventId?.trim() || !Number.isFinite(Date.parse(r.acquiredAt))
      || r.questId !== null && typeof r.questId !== 'string' || r.status !== 'SOURCE_BOUND_EFFECT_RUNTIME_PENDING')
      throw new Error('Invalid source Trinket reward identity');
  }
}
