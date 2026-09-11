import { describe, expect, it } from 'vitest';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { drawDarkestDungeonMonster } from '../../../game-engine/campaign/act-four/content-runtime';
import { COMMUNITY_REFERENCE_RUNTIME_PROFILE } from './runtime-profile';
import { communityRequirement } from './runtime-profile';

describe('Community Monster acceptance', () => {
  it('M01 has 26 physical and 9 logical definitions', () => { expect(COMMUNITY_REFERENCE_RUNTIME_PROFILE.monsterComposition).toHaveLength(9); expect(COMMUNITY_REFERENCE_RUNTIME_PROFILE.monsterComposition.flatMap((monster) => monster.physicalInstances)).toHaveLength(26); });
  it('M02 traces every GUID and CardID membership', () => { const source = communityRequirement('tierB-darkest-dungeon-monster-deck').fields.deckComposition.value as { composition: Array<{ members: Array<{ guid: string; cardId: number }> }> }; const expected = source.composition.flatMap((entry) => entry.members).map((member) => `${member.guid}:${member.cardId}`).sort(); const actual = COMMUNITY_REFERENCE_RUNTIME_PROFILE.monsterComposition.flatMap((entry) => entry.physicalInstances).map((member) => `${member.guid}:${member.cardId}`).sort(); expect(actual).toEqual(expected); });
  it('M03 production draw reaches drawPolicy blocker', () => expect(drawDarkestDungeonMonster(createCommunityGuardianScenario(0), () => 0).blocker?.code).toBe('MONSTER_DECK_DRAW_POLICY_UNRESOLVED'));
  it('M04 does not consume RNG before blocker', () => expect(() => drawDarkestDungeonMonster(createCommunityGuardianScenario(0), () => { throw new Error('RNG consumed'); })).not.toThrow());
  it('M05 does not mutate before blocker', () => { const campaign = createCommunityGuardianScenario(0); const before = structuredClone(campaign); expect(drawDarkestDungeonMonster(campaign, () => 0).campaign).toEqual(before); });
  it('M06 does not use DeckID order fallback', () => expect(JSON.stringify(COMMUNITY_REFERENCE_RUNTIME_PROFILE.unresolvedRules.MONSTER_DECK_DRAW_POLICY_UNRESOLVED)).not.toContain('savedDeckIds'));
  it('M07 does not use Prototype draw fallback', () => expect(JSON.stringify(COMMUNITY_REFERENCE_RUNTIME_PROFILE.monsterComposition)).not.toContain('prototype-'));
});
