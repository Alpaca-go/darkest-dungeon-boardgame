import { describe, expect, it } from 'vitest';
import { validateCommunityMammothDefinitions, validateCommunityShufflingDefinitions, validateCommunityTemplarsDefinitions } from './production-adapters';

describe('Community supplied-definition validators', () => {
  it('V01 validates supplied Templar definitions while naming known blockers', () => expect(validateCommunityTemplarsDefinitions()).toMatchObject({ isComplete: true, missing: [], issues: [] }));
  it('V02 validates supplied Mammoth definitions while naming engine blockers', () => expect(validateCommunityMammothDefinitions()).toMatchObject({ isComplete: true, missing: [], issues: [] }));
  it('V03 validates supplied Shuffling definitions while naming initial-area blocker', () => expect(validateCommunityShufflingDefinitions()).toMatchObject({ isComplete: true, missing: [], issues: [] }));
});
