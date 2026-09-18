import { describe, expect, it } from 'vitest';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { drawDarkestDungeonMonster } from '../../../game-engine/campaign/act-four/content-runtime';
import {
  communityMonsterCardAttribute,
  firstEmptyStanceForPlacement,
} from './community-source-geometry';
import { COMMUNITY_MONSTER_DRAW_SEMANTIC } from './source-supplement-runtime';

describe('Community physical Monster placement production (WP-4)', () => {
  it('ordinary DD room encounter setup fills exactly four Stance slots via drawDarkestDungeonMonster', () => {
    const campaign = createCommunityGuardianScenario(0);
    const before = campaign.actFourState.contentRuntime!.physicalMonsterDeck!;
    const expectedOrder = before.drawPile.slice(0, 4);
    const expectedDefs = expectedOrder.map((id) => before.instanceToDefinitionId[id]);

    const result = drawDarkestDungeonMonster(campaign, () => {
      throw new Error('ordinary encounter fill must not consume extra RNG');
    });
    expect(result.ok, result.reason ?? '').toBe(true);

    const deck = result.campaign.actFourState.contentRuntime!.physicalMonsterDeck!;
    expect(deck.activePlacements).toHaveLength(4);
    expect(deck.inBattle).toEqual(expectedOrder);
    expect(new Set(deck.inBattle).size).toBe(4);
    expect(new Set(deck.activePlacements.map((item) => item.instanceId)).size).toBe(4);
    expect(new Set(deck.activePlacements.map((item) => item.stance)).size).toBe(4);
    expect(deck.fillHistory).toHaveLength(1);
    expect(deck.drawHistory).toHaveLength(4);

    // Reconstruct Front/Back placement order from the established deck top without extra RNG.
    const occupied = new Set<string>();
    const expectedStances = expectedDefs.map((definitionId) => {
      const attr = communityMonsterCardAttribute(definitionId)!;
      const stance = firstEmptyStanceForPlacement(occupied, attr.placementSide)!;
      occupied.add(stance);
      return { definitionId, stance, placementSide: attr.placementSide };
    });
    expect(deck.activePlacements.map((item) => ({
      definitionId: item.definitionId,
      stance: item.stance,
      placementSide: item.placementSide,
    }))).toEqual(expectedStances);

    expect(deck.activePlacements.every((item) => item.large === false && item.slotCount === 1)).toBe(true);
    expect(COMMUNITY_MONSTER_DRAW_SEMANTIC.uniformLogicalIdentity).toBe(false);
    expect(COMMUNITY_MONSTER_DRAW_SEMANTIC.savedDeckIdsArePolicy).toBe(false);
    expect(JSON.stringify(deck)).not.toContain('prototype-');
  });

  it('idempotent product draw does not redraw after four slots are filled', () => {
    const first = drawDarkestDungeonMonster(createCommunityGuardianScenario(0), () => 0);
    const second = drawDarkestDungeonMonster(first.campaign, () => {
      throw new Error('filled encounter must not redraw');
    });
    expect(second.campaign.actFourState.contentRuntime!.physicalMonsterDeck!.activePlacements).toEqual(
      first.campaign.actFourState.contentRuntime!.physicalMonsterDeck!.activePlacements,
    );
    expect(second.campaign.actFourState.contentRuntime!.physicalMonsterDeck!.drawPile).toEqual(
      first.campaign.actFourState.contentRuntime!.physicalMonsterDeck!.drawPile,
    );
  });
});
