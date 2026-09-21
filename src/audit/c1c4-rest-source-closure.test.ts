import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import questionMatrix from '../../docs/data/complete-edition/c1c4-rest-source-question-matrix.json' with { type: 'json' };
import exhaustionEvidence from '../../docs/data/complete-edition/c1c4-rest-source-exhaustion-evidence.json' with { type: 'json' };
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_SOURCE_QUESTS,
  type RuntimeCapabilityRecord,
} from '../data/community-reference/production-runtime';
import { deriveUnresolvedRestSemantics } from './rest-semantic-contract';
import { questReadinessInvariantErrors } from './quest-readiness-invariants';
import {
  PRODUCTION_PROOF_REGISTRY,
  proof,
  type RegisteredProductionProof,
} from './production-proof-registry';
import { definitionE2eHarnessViolations } from './production-ui-proof-integrity';

describe('C1C-4 Rest source closure and proof hardening', () => {
  it('preserves the sole Rest blocker after source exhaustion', () => {
    expect(deriveUnresolvedRestSemantics()).toEqual(['insufficientRecoveryCapacity']);
    expect(exhaustionEvidence.sourceAuditOutcome).toBe('SOURCE_EXHAUSTED_STILL_UNRESOLVED');
    expect(exhaustionEvidence.insufficientRecoveryCapacity).toMatchObject({
      status: 'SOURCE_UNRESOLVED',
      rule: 'SOURCE_UNRESOLVED',
    });
  });

  it('records all nine exact questions with allowed statuses and evidence links', () => {
    expect(questionMatrix.questions.map((entry) => entry.id)).toEqual([
      'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9',
    ]);
    const allowed = new Set(['SOURCE_EXPLICIT', 'SOURCE_DERIVED', 'SOURCE_UNRESOLVED', 'MODEL_INVARIANT']);
    for (const entry of questionMatrix.questions) {
      expect(allowed.has(entry.status)).toBe(true);
      expect(entry.sourceEvidenceIds.length).toBeGreaterThan(0);
    }
  });

  it('requires every E2E registration to declare a proof surface explicitly', () => {
    const e2eProofs = Object.values(PRODUCTION_PROOF_REGISTRY).filter((entry) => entry.proofType === 'e2e');
    expect(e2eProofs.length).toBeGreaterThan(0);
    expect(e2eProofs.every((entry) => entry.proofSurface !== undefined)).toBe(true);

    const missingSurface: RegisteredProductionProof = {
      proofId: 'MUTANT-MISSING-SURFACE',
      definitionIds: ['mutant'],
      proofType: 'e2e',
      testFile: 'e2e/mutant.spec.ts',
      runner: 'playwright',
      status: 'active',
      scope: 'definition',
    };
    expect(() => proof(missingSurface)).toThrow('e2e proofSurface must be declared explicitly');
  });

  it('rejects a harness test relabeled as production UI', () => {
    const disguised = proof({
      proofId: 'MUTANT-HARNESS-AS-UI',
      definitionIds: ['mutant'],
      proofType: 'e2e',
      testFile: 'e2e/mutant.spec.ts',
      runner: 'playwright',
      status: 'active',
      scope: 'definition',
      proofSurface: 'production-ui',
    });
    expect(disguised.proofSurface).toBe('production-ui');
    expect(definitionE2eHarnessViolations(disguised.testFile, "await page.getByTestId('e2e-complete-quest').click()"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ reason: expect.stringContaining('test-only command') })]));
  });

  it('checks every explicit readiness gate instead of the semanticComplete compatibility alias', () => {
    const ready = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.productionReady);
    expect(ready).toBeDefined();
    const mutations: Array<[keyof RuntimeCapabilityRecord, string]> = [
      ['sourceSupported', 'ready without source support'],
      ['sourceSemanticComplete', 'ready without source semantic completion'],
      ['runtimeSemanticComplete', 'ready without runtime semantic completion'],
      ['engineCapable', 'ready without engine capability'],
      ['adapterComplete', 'ready without adapter'],
      ['selectorReachable', 'ready without selector reachability'],
      ['productionProofComplete', 'ready without production proof'],
      ['saveReplayProofComplete', 'ready without save/replay proof'],
      ['e2eProofComplete', 'ready without e2e proof'],
      ['productionUiProofComplete', 'ready without production UI proof'],
    ];
    for (const [field, expected] of mutations) {
      const mutant = structuredClone(ready!) as RuntimeCapabilityRecord;
      (mutant[field] as boolean) = false;
      expect(questReadinessInvariantErrors([mutant], COMMUNITY_SOURCE_QUESTS))
        .toContain(`${mutant.definitionId}: ${expected}`);
    }

    const compatibilityOnly = structuredClone(ready!) as RuntimeCapabilityRecord;
    compatibilityOnly.semanticComplete = false;
    expect(questReadinessInvariantErrors([compatibilityOnly], COMMUNITY_SOURCE_QUESTS)).toEqual([]);
  });

  it('keeps every registered production UI definition proof free of harness patterns', () => {
    for (const entry of Object.values(PRODUCTION_PROOF_REGISTRY)) {
      if (entry.proofType !== 'e2e' || entry.proofSurface !== 'production-ui' || entry.scope !== 'definition') continue;
      const text = readFileSync(resolve(entry.testFile), 'utf8');
      expect(definitionE2eHarnessViolations(entry.testFile, text)).toEqual([]);
    }
  });
});
