import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../../../types';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { resolveExcavationSiteRoom } from '../../../game-engine/campaign/act-four/excavation-site';
import { EXCAVATION_RESTING_POINTS } from '../room-registry';
import { sanitizeActFourState } from '../../../game-engine/campaign/act-four/act-four-state';

function availableExcavation(): { campaign: CampaignState; roomId: string } {
  const original = createCommunityGuardianScenario(0);
  const first = original.actFourState.excavationSiteStates[0];
  return { roomId: first.roomId, campaign: { ...original, actFourState: { ...original.actFourState, excavationSiteStates: original.actFourState.excavationSiteStates.map((site) => site === first ? { ...site, status: 'available' as const } : site) } } };
}

describe('Community Excavation acceptance', () => {
  it('E01 has no Formal map fallback', () => { const { campaign, roomId } = availableExcavation(); const result = resolveExcavationSiteRoom(campaign, roomId, { mode: 'community-reference', rng: () => 0, chooseWild: () => 'food' }); expect(result.ok).toBe(true); expect(result.site?.communityProvision?.dice.every((die) => (die.selectedFace as string) !== 'wild')).toBe(true); });
  it('E02 has no Prototype map fallback', () => { const { campaign, roomId } = availableExcavation(); expect(JSON.stringify(resolveExcavationSiteRoom(campaign, roomId, { mode: 'community-reference', rng: () => 0.99, chooseWild: () => 'torch' }).site?.communityProvision)).not.toContain('prototype-'); });
  it('E03 blocks before RNG', () => { const { campaign, roomId } = availableExcavation(); expect(() => resolveExcavationSiteRoom(campaign, roomId, { mode: 'community-reference', rng: () => { throw new Error('RNG consumed'); } })).not.toThrow(); });
  it('E04 blocks before state mutation', () => { const { campaign, roomId } = availableExcavation(); const before = structuredClone(campaign); expect(resolveExcavationSiteRoom(campaign, roomId, { mode: 'community-reference', rng: () => 0 }).campaign).toEqual(before); });
  it('E05 save reload is stable before blocker', () => { const { campaign, roomId } = availableExcavation(); const first = resolveExcavationSiteRoom(campaign, roomId, { mode: 'community-reference', rng: () => 0, chooseWild: () => 'food' }); expect(first.ok).toBe(true); const restored = { ...first.campaign, actFourState: sanitizeActFourState(JSON.parse(JSON.stringify(first.campaign.actFourState))) }; const replay = resolveExcavationSiteRoom(restored, roomId, { mode: 'community-reference', rng: () => { throw new Error('reroll'); }, chooseWild: () => { throw new Error('rechoose'); } }); expect(replay.alreadyResolved).toBe(true); expect(replay.rolls).toEqual(first.rolls); });
  it('E06 retains 8 Rest and no Firewood structural contract', () => { expect(EXCAVATION_RESTING_POINTS).toBe(8); const source = resolveExcavationSiteRoom.toString(); expect(source).toContain('consumeFirewood: false'); });
});
