import { expect, it } from 'vitest';
import { verifyReplayDeterminism } from './run-audit';
it('Independent replay determinism: same seed has identical events, RNG and hashes', () => {
  const result = verifyReplayDeterminism('golden-normal-success-01', 'determinism-v1');
  expect(result.identical).toBe(true);
  expect(result.rngMatch).toBe(true);
  expect(result.firstDivergentEventIndex).toBe(-1);
  expect(result.hashA).toBe(result.hashB);
});
