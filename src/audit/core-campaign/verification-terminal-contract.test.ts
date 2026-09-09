import { describe, expect, it } from 'vitest';
import { evaluateVerificationCliExit } from './verification-evidence';

describe('verification terminal contract', () => {
  it.each(['SOURCE-BLOCKED', 'READY-FOR-OFFICIAL-IMPORT', 'COMPLETE'] as const)('allows healthy %s', (phase11A3Status) => {
    expect(evaluateVerificationCliExit({ verifierHealthy: true, phase11A3Status })).toBe(0);
  });

  it.each(['NOT-VERIFIED', 'IMPLEMENTATION-FAIL'] as const)('rejects %s', (phase11A3Status) => {
    expect(evaluateVerificationCliExit({ verifierHealthy: true, phase11A3Status })).toBe(1);
  });

  it('rejects every unhealthy artifact regardless of business state', () => {
    expect(evaluateVerificationCliExit({ verifierHealthy: false, phase11A3Status: 'SOURCE-BLOCKED' })).toBe(1);
  });
});
