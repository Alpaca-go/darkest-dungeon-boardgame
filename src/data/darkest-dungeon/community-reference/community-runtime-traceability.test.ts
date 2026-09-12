import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT,
  COMMUNITY_RUNTIME_PROJECTION_PROOFS,
  COMMUNITY_SOURCE_PROJECTION_ENVIRONMENT,
  runtimeFieldCoverageTotals,
  validateCommunityRuntimeProjectionProofs,
} from './runtime-field-coverage';

const consumed = COMMUNITY_RUNTIME_PROJECTION_PROOFS.filter(proof => proof.classification === 'consumed');

describe('Community semantic projection truth gate', () => {
  it('FC01 classifies every source field and resolves every consumed selector', () => {
    expect(validateCommunityRuntimeProjectionProofs()).toEqual([]);
    expect(runtimeFieldCoverageTotals()).toMatchObject({ unclassified: 0, runtimeSelectorMissing: 0 });
  });
  it('FC02 derives semantic-leaf totals from executable proofs', () => {
    const totals = runtimeFieldCoverageTotals();
    expect(totals.total).toBe(COMMUNITY_RUNTIME_PROJECTION_PROOFS.length);
    expect(totals.runtimeSelectorExpected).toBe(consumed.length);
  });
});

describe('independent source-to-runtime semantic comparisons', () => {
  it.each(consumed.map(proof => [proof.requirementId, proof.sourcePath, proof] as const))('TRACE %s.%s', (_requirementId, _sourcePath, proof) => {
    const source = proof.normalizeSource(proof.sourceSelector(COMMUNITY_SOURCE_PROJECTION_ENVIRONMENT));
    const runtime = proof.normalizeRuntime(proof.runtimeSelector!(COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT));
    expect(runtime).toEqual(source);
  });
});
