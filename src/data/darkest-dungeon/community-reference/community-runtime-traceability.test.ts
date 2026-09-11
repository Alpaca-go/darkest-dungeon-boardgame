import { describe, expect, it } from 'vitest';
import { communityRequirement, COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';
import { COMMUNITY_RUNTIME_FIELD_COVERAGE, runtimeFieldCoverageTotals, validateCommunityRuntimeFieldCoverage } from './runtime-field-coverage';

const runtimeEntries = COMMUNITY_RUNTIME_FIELD_COVERAGE.filter((entry) => entry.runtimeClassification === 'consumed' || entry.runtimeClassification.endsWith('blocker'));

describe('Community runtime field coverage', () => {
  it('FC01 classifies every normalized field with no unclassified entries', () => { expect(COMMUNITY_RUNTIME_FIELD_COVERAGE).toHaveLength(131); expect(validateCommunityRuntimeFieldCoverage()).toEqual([]); expect(runtimeFieldCoverageTotals().unclassified).toBe(0); });
  it('FC02 derives totals from the ledger', () => expect(Object.values(runtimeFieldCoverageTotals()).filter((value): value is number => typeof value === 'number').slice(1, 6).reduce((sum, value) => sum + value, 0)).toBe(131));
});

describe('Community semantic traceability matrix', () => {
  it.each(runtimeEntries.map((entry) => [entry.requirementId, entry.field] as const))('TRACE %s.%s normalized value reaches classified runtime target', (requirementId, field) => {
    const entry = COMMUNITY_RUNTIME_FIELD_COVERAGE.find((candidate) => candidate.requirementId === requirementId && candidate.field === field)!;
    const source = communityRequirement(requirementId).fields[field];
    expect(entry.sourceReference).toEqual(source.sourceReference);
    expect(entry.runtimeTarget).not.toBe('UNCLASSIFIED_SOURCE_BLOCKER');
    if (entry.runtimeClassification === 'consumed') expect(entry.runtimeValueHash).toBe(entry.sourceValueHash);
    else expect(COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === entry.blockerCode)).toBe(true);
  });
});
