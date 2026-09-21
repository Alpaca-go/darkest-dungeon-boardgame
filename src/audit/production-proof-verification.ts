import type { CommunityProductionProof } from '../data/community-reference/production-runtime';
import {
  resolveRegisteredProof,
  type ProductionProofType,
  type RegisteredProductionProof,
} from './production-proof-registry';

export interface ProofBindingResolution {
  definitionId: string;
  manifestField: 'productionTests' | 'saveReplayTests' | 'selectorTests' | 'e2eTests';
  expectedType: ProductionProofType;
  proofId: string;
  resolved: boolean;
  reason: 'RESOLVED' | 'UNRESOLVED' | 'WRONG_TYPE' | 'WRONG_DEFINITION' | 'DISABLED';
  registration: RegisteredProductionProof | null;
}

export interface ProductionProofBindingAnalysis {
  registeredProofCount: number;
  requiredProofCount: number;
  resolvedProofCount: number;
  unresolvedProofCount: number;
  crossDefinitionMismatchCount: number;
  wrongTypeCount: number;
  disabledProofCount: number;
  orphanProofIds: string[];
  resolutions: ProofBindingResolution[];
}

const FIELDS: ReadonlyArray<{
  field: ProofBindingResolution['manifestField'];
  type: ProductionProofType;
}> = [
  { field: 'productionTests', type: 'production-runtime' },
  { field: 'saveReplayTests', type: 'save-replay' },
  { field: 'selectorTests', type: 'selector' },
  { field: 'e2eTests', type: 'e2e' },
];

export function analyzeProductionProofBindings(
  manifests: Readonly<Record<string, CommunityProductionProof>>,
  registry: Readonly<Record<string, RegisteredProductionProof>>,
): ProductionProofBindingAnalysis {
  const resolutions: ProofBindingResolution[] = [];
  const referenced = new Set<string>();
  for (const manifest of Object.values(manifests)) {
    for (const { field, type } of FIELDS) {
      for (const proofId of manifest[field]) {
        referenced.add(proofId);
        const result = resolveRegisteredProof(
          proofId,
          type,
          manifest.definitionId,
          registry,
          manifest.runtimeAdapterId,
          manifest.requiredPrimitives ?? [],
        );
        resolutions.push({
          definitionId: manifest.definitionId,
          manifestField: field,
          expectedType: type,
          proofId,
          resolved: result.resolved,
          reason: result.reason,
          registration: registry[proofId] ?? null,
        });
      }
    }
  }
  return {
    registeredProofCount: Object.keys(registry).length,
    requiredProofCount: resolutions.length,
    resolvedProofCount: resolutions.filter((entry) => entry.resolved).length,
    unresolvedProofCount: resolutions.filter((entry) => entry.reason === 'UNRESOLVED').length,
    crossDefinitionMismatchCount: resolutions.filter((entry) => entry.reason === 'WRONG_DEFINITION').length,
    wrongTypeCount: resolutions.filter((entry) => entry.reason === 'WRONG_TYPE').length,
    disabledProofCount: resolutions.filter((entry) => entry.reason === 'DISABLED').length,
    orphanProofIds: Object.keys(registry).filter((proofId) => !referenced.has(proofId)),
    resolutions,
  };
}

export interface ProofExecutionResult {
  proofId: string;
  runner: 'vitest' | 'playwright';
  testFile: string;
  status: 'passed' | 'failed' | 'skipped' | 'not-run';
}

export function evidencePublicationErrors(
  analysis: ProductionProofBindingAnalysis,
  executions: readonly ProofExecutionResult[],
): string[] {
  const errors: string[] = [];
  if (analysis.unresolvedProofCount) errors.push(`${analysis.unresolvedProofCount} unresolved proof(s)`);
  if (analysis.crossDefinitionMismatchCount) errors.push(`${analysis.crossDefinitionMismatchCount} cross-definition mismatch(es)`);
  if (analysis.wrongTypeCount) errors.push(`${analysis.wrongTypeCount} wrong proof type(s)`);
  if (analysis.disabledProofCount) errors.push(`${analysis.disabledProofCount} disabled proof(s)`);
  if (analysis.orphanProofIds.length) errors.push(`orphan proofs: ${analysis.orphanProofIds.join(', ')}`);
  const executed = new Map(executions.map((entry) => [entry.proofId, entry]));
  for (const resolution of analysis.resolutions) {
    const result = executed.get(resolution.proofId);
    if (!result || result.status !== 'passed') {
      errors.push(`${resolution.proofId} execution ${result?.status ?? 'missing'}`);
    }
  }
  return [...new Set(errors)];
}
