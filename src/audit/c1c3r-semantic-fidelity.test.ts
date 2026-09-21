import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_SOURCE_QUESTS,
  FAMILY_TRINKETS_ID,
  TAINTED_TRINKETS_ID,
} from '../data/community-reference/production-runtime';
import { PRODUCTION_PROOF_REGISTRY } from './production-proof-registry';
import { definitionE2eHarnessViolations } from './production-ui-proof-integrity';
import {
  expectedSemanticObligationIds,
  runtimeSemanticComplete,
  semanticObligationsForQuest,
  type QuestSemanticObligation,
} from './quest-semantic-coverage';

const targets = [TAINTED_TRINKETS_ID, FAMILY_TRINKETS_ID] as const;

function obligations(definitionId: string): QuestSemanticObligation[] {
  const source = COMMUNITY_SOURCE_QUESTS.find((entry) => entry.id === definitionId);
  if (!source) throw new Error(`missing source ${definitionId}`);
  return structuredClone(semanticObligationsForQuest(source));
}

function fullyBound(definitionId: string): QuestSemanticObligation[] {
  return obligations(definitionId).map((entry) => ({
    ...entry,
    implementationStatus: 'IMPLEMENTED',
    runtimeBindingId: entry.runtimeBindingId ?? `fixture:${entry.obligationId}`,
    proofIds: entry.proofIds.length > 0 ? entry.proofIds : [`FIXTURE-${entry.obligationId}`],
    blockerCode: undefined,
  }));
}

describe('C1C-3R semantic fidelity gate', () => {
  it('demotes both partial definitions while preserving source understanding', () => {
    for (const definitionId of targets) {
      const capability = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === definitionId);
      expect(capability).toMatchObject({
        sourceSemanticComplete: true,
        runtimeSemanticComplete: false,
        productionUiProofComplete: false,
        productionReady: false,
      });
      expect(capability?.blockerCodes).toEqual(expect.arrayContaining(['RUNTIME_SEMANTIC_PARTIAL', 'PRODUCTION_UI_E2E_MISSING']));
    }
    expect(COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionReady).map((entry) => entry.definitionId).sort()).toEqual([
      'community-quest-warrens-lvl1-explore-the-sewers',
      'community-quest-warrens-lvl2-mapping-the-sewers',
      'community-quest-warrens-lvl3-deep-in-the-warrens',
    ]);
  });

  it('enumerates every required Tainted and Family obligation', () => {
    expect(obligations(TAINTED_TRINKETS_ID).map((entry) => entry.obligationId)).toEqual(expectedSemanticObligationIds(TAINTED_TRINKETS_ID));
    expect(obligations(FAMILY_TRINKETS_ID).map((entry) => entry.obligationId)).toEqual(expectedSemanticObligationIds(FAMILY_TRINKETS_ID));
    expect(obligations(TAINTED_TRINKETS_ID)).toHaveLength(9);
    expect(obligations(FAMILY_TRINKETS_ID)).toHaveLength(6);
  });

  it('Mutation A: removing TT-08 return-to-Hamlet resolution prevents promotion', () => {
    const mutant = fullyBound(TAINTED_TRINKETS_ID).filter((entry) => entry.obligationId !== 'TT-08');
    expect(runtimeSemanticComplete(TAINTED_TRINKETS_ID, mutant)).toBe(false);
  });

  it('Mutation B: removing TT-02 Level 3 Trinket acquisition prevents promotion', () => {
    const mutant = fullyBound(TAINTED_TRINKETS_ID).filter((entry) => entry.obligationId !== 'TT-02');
    expect(runtimeSemanticComplete(TAINTED_TRINKETS_ID, mutant)).toBe(false);
  });

  it('Mutation C: claiming FT-03 without a real runtime binding prevents promotion', () => {
    const mutant = fullyBound(FAMILY_TRINKETS_ID);
    mutant.find((entry) => entry.obligationId === 'FT-03')!.runtimeBindingId = null;
    expect(runtimeSemanticComplete(FAMILY_TRINKETS_ID, mutant)).toBe(false);
  });

  it('Mutation D: allowing old inventory to satisfy FT-04 provenance prevents promotion', () => {
    const mutant = fullyBound(FAMILY_TRINKETS_ID);
    mutant.find((entry) => entry.obligationId === 'FT-04')!.parameters = { acquiredThisDungeon: false };
    expect(runtimeSemanticComplete(FAMILY_TRINKETS_ID, mutant)).toBe(false);
  });

  it('Mutation E: test-only quest completion is rejected as production UI proof', () => {
    expect(definitionE2eHarnessViolations('mutant.spec.ts', "await page.getByTestId('e2e-complete-quest').click()"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ reason: expect.stringContaining('test-only command') })]));
  });

  it('classifies the historical C1C-3 definition proofs as test harnesses', () => {
    for (const proofId of ['C1C3-E2E-TAINTED-TRINKETS', 'C1C3-E2E-FAMILY-TRINKETS']) {
      const proof = PRODUCTION_PROOF_REGISTRY[proofId];
      expect(proof.proofSurface).toBe('test-harness');
      const text = readFileSync(resolve(proof.testFile), 'utf8');
      expect(definitionE2eHarnessViolations(proof.testFile, text).length).toBeGreaterThan(0);
    }
  });
});
