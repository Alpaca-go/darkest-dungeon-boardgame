import { describe, expect, it } from 'vitest';
import { validateEvidenceIdentity } from './verification-evidence';

describe('verification evidence identity', () => {
  it('accepts matching run id and input hash', () => {
    expect(validateEvidenceIdentity({ runId: 'r1', verificationInputHash: 'h1' }, 'r1', 'h1')).toEqual([]);
  });
  it('rejects stale or foreign evidence', () => {
    expect(validateEvidenceIdentity({ runId: 'old', verificationInputHash: 'h0' }, 'r1', 'h1')).toEqual([
      'runId mismatch', 'verificationInputHash mismatch',
    ]);
  });
});
