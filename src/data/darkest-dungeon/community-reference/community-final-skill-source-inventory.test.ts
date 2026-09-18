import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY,
  COMMUNITY_FINAL_SOURCE_BLOCKED_LEAVES,
  requiredCommunityFinalSourceLeaves,
} from './community-final-skill-source-inventory';

describe('Community Final skill source inventory', () => {
  it('records every required Final actor skill from vendored cards rather than Prototype numbers', () => {
    const keys = COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.map((leaf) => `${leaf.actorId}:${leaf.localSkillId}`);
    expect(keys).toEqual([
      'ancestor-first-form:perfect-replication',
      'ancestor-first-form:imperfect-reproduction',
      'ancestor-first-form:time-heals-all',
      'perfect-reflection:reunion',
      'perfect-reflection:we-are-the-same',
      'imperfect-reflection:it-chooses',
      'imperfect-reflection:we-are-the-same',
      'ancestor-second-form:refashion-them',
      'ancestor-second-form:unmake-them-all',
      'ancestor-second-form:embrace-futility',
      'gestating-heart:dispersion',
      'heart-of-darkness:know-this',
      'heart-of-darkness:puncture',
      'heart-of-darkness:dissolution',
    ]);
    expect(COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.every((leaf) => !/prototype/i.test(leaf.sourceReference))).toBe(true);
    expect(requiredCommunityFinalSourceLeaves()).toHaveLength(COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.length);
  });

  it('keeps lethal Ichor ordering and Come Unto Your Maker source-blocked', () => {
    expect(COMMUNITY_FINAL_SOURCE_BLOCKED_LEAVES.map((leaf) => leaf.code)).toEqual([
      'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED',
      'COME_UNTO_YOUR_MAKER_UNRESOLVED',
    ]);
  });
});
