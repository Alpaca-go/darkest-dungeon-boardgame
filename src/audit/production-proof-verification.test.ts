import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_SOURCE_TRINKETS,
  COMMUNITY_QUEST_PRODUCTION_PROOFS,
  COMMUNITY_TRINKET_PRODUCTION_PROOFS,
  COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
  evaluateCommunityTrinketCapability,
  type CommunityProductionProof,
} from '../data/community-reference/production-runtime';
import {
  ACCURACY_STONE_ID,
  CRITICAL_STONE_ID,
  PRODUCTION_PROOF_REGISTRY,
  type RegisteredProductionProof,
} from './production-proof-registry';
import {
  analyzeProductionProofBindings,
  evidencePublicationErrors,
  type ProofExecutionResult,
} from './production-proof-verification';

const source = (id: string) => COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === id)!;
const manifests = () => structuredClone(COMMUNITY_TRINKET_PRODUCTION_PROOFS) as Record<string, CommunityProductionProof>;
const registry = () => structuredClone(PRODUCTION_PROOF_REGISTRY) as Record<string, RegisteredProductionProof>;
const status = (id: string, proof: Record<string, CommunityProductionProof>, registered: Record<string, RegisteredProductionProof>) =>
  evaluateCommunityTrinketCapability(source(id), COMMUNITY_TRINKET_RUNTIME_ADAPTERS, proof, registered).productionStatus;
const passedExecutions = (): ProofExecutionResult[] => Object.values(PRODUCTION_PROOF_REGISTRY).map((entry) => ({
  proofId: entry.proofId, runner: entry.runner, testFile: entry.testFile, status: 'passed',
}));

describe('C1B-R2 production proof mutation gate', () => {
  it('MP-01 fake production test ID closes readiness', () => {
    const proof = manifests();
    proof[ACCURACY_STONE_ID].productionTests = ['NON_EXISTENT_TEST'];
    expect(status(ACCURACY_STONE_ID, proof, registry())).toBe('ADAPTER_REQUIRED');
  });

  it('MP-02 fake save proof closes readiness', () => {
    const proof = manifests();
    proof[ACCURACY_STONE_ID].saveReplayTests = ['FAKE_SAVE_PROOF'];
    expect(status(ACCURACY_STONE_ID, proof, registry())).toBe('ADAPTER_REQUIRED');
  });

  it('MP-03 fake selector proof closes readiness', () => {
    const proof = manifests();
    proof[ACCURACY_STONE_ID].selectorTests = ['FAKE_SELECTOR_PROOF'];
    expect(status(ACCURACY_STONE_ID, proof, registry())).toBe('ADAPTER_REQUIRED');
  });

  it('MP-04 fake E2E proof closes readiness', () => {
    const proof = manifests();
    proof[ACCURACY_STONE_ID].e2eTests = ['FAKE_E2E_PROOF'];
    expect(status(ACCURACY_STONE_ID, proof, registry())).toBe('ADAPTER_REQUIRED');
  });

  it('MP-05 cross-definition runtime proof closes Accuracy readiness', () => {
    const proof = manifests();
    proof[ACCURACY_STONE_ID].productionTests = ['C1BR-PA-CRITICAL-RUNTIME'];
    expect(status(ACCURACY_STONE_ID, proof, registry())).toBe('ADAPTER_REQUIRED');
  });

  it('MP-06 cross-definition E2E proof closes Critical readiness', () => {
    const proof = manifests();
    proof[CRITICAL_STONE_ID].e2eTests = ['C1BR-E2E-ACCURACY'];
    expect(status(CRITICAL_STONE_ID, proof, registry())).toBe('ADAPTER_REQUIRED');
  });

  it('MP-07 wrong proof type closes readiness', () => {
    const proof = manifests();
    proof[ACCURACY_STONE_ID].productionTests = ['C1BR-E2E-ACCURACY'];
    expect(status(ACCURACY_STONE_ID, proof, registry())).toBe('ADAPTER_REQUIRED');
  });

  it('MP-08 deleting a real registration closes readiness', () => {
    const registered = registry();
    delete registered['C1BR-PA-ACCURACY-RUNTIME'];
    expect(status(ACCURACY_STONE_ID, manifests(), registered)).toBe('ADAPTER_REQUIRED');
  });

  it('MP-09 renaming only the registration closes readiness', () => {
    const registered = registry();
    const entry = registered['C1BR-PA-ACCURACY-RUNTIME'];
    delete registered[entry.proofId];
    registered['RENAMED-RUNTIME-PROOF'] = { ...entry, proofId: 'RENAMED-RUNTIME-PROOF' };
    expect(status(ACCURACY_STONE_ID, manifests(), registered)).toBe('ADAPTER_REQUIRED');
  });

  it('MP-10 skipped or todo proof is invalid', () => {
    for (const disabled of ['skip', 'todo'] as const) {
      const registered = registry();
      registered['C1BR-PA-ACCURACY-RUNTIME'].status = disabled;
      expect(status(ACCURACY_STONE_ID, manifests(), registered)).toBe('ADAPTER_REQUIRED');
    }
  });

  it('MP-11 proof bound to wrong definition closes readiness', () => {
    const registered = registry();
    registered['C1BR-PA-ACCURACY-RUNTIME'].definitionIds = [CRITICAL_STONE_ID];
    expect(status(ACCURACY_STONE_ID, manifests(), registered)).toBe('ADAPTER_REQUIRED');
  });

  it('MP-12 evidence publication rejects a failed required command', () => {
    const analysis = analyzeProductionProofBindings(COMMUNITY_TRINKET_PRODUCTION_PROOFS, PRODUCTION_PROOF_REGISTRY);
    const executions = passedExecutions();
    executions.find((entry) => entry.proofId === 'C1BR-E2E-ACCURACY')!.status = 'failed';
    expect(evidencePublicationErrors(analysis, executions)).toContain('C1BR-E2E-ACCURACY execution failed');
  });

  it('accepts the real bidirectional registry without unresolved, mismatched, or orphan proofs', () => {
    const allManifests = { ...COMMUNITY_TRINKET_PRODUCTION_PROOFS, ...COMMUNITY_QUEST_PRODUCTION_PROOFS };
    const analysis = analyzeProductionProofBindings(allManifests, PRODUCTION_PROOF_REGISTRY);
    const requiredProofCount = Object.values(allManifests).reduce((sum, manifest) => sum
      + manifest.productionTests.length + manifest.saveReplayTests.length
      + manifest.selectorTests.length + manifest.e2eTests.length, 0);
    expect(analysis).toMatchObject({
      registeredProofCount: Object.keys(PRODUCTION_PROOF_REGISTRY).length,
      requiredProofCount,
      resolvedProofCount: requiredProofCount,
      unresolvedProofCount: 0,
      crossDefinitionMismatchCount: 0,
      wrongTypeCount: 0,
      disabledProofCount: 0,
      orphanProofIds: [],
    });
    expect(evidencePublicationErrors(analysis, passedExecutions())).toEqual([]);
  });
});
