export interface Phase11A3PreGateEvidence {
  runId: string;
  verificationInputHash: string;
  sourceInputHash: string;
  typecheckPasses: boolean;
  unitPasses: boolean;
  commandContractPasses: boolean;
  integrationPasses: boolean;
  buildPasses: boolean;
  criticalE2EPasses: boolean;
  criticalE2ELifecyclePasses: boolean;
  goldenTestPasses: boolean;
  replayDeterminismPasses: boolean;
  replayContinuationPasses: boolean;
  productionCommandLayerPasses: boolean;
  verificationFresh: boolean;
  officialSourceAuditPasses: boolean;
  officialSourceManifestGenerated: boolean;
  sourceReadinessGenerated: boolean;
  fieldProvenanceValidated: boolean;
  contentAuditPasses: boolean;
  rulesAuditPasses: boolean;
}

export function evaluateVerificationCliExit(input: {
  verifierHealthy: boolean;
  phase11A3Status: 'NOT-VERIFIED' | 'SOURCE-BLOCKED' | 'READY-FOR-OFFICIAL-IMPORT' | 'IMPLEMENTATION-FAIL' | 'COMPLETE';
}): 0 | 1 {
  return input.verifierHealthy && ['SOURCE-BLOCKED', 'READY-FOR-OFFICIAL-IMPORT', 'COMPLETE'].includes(input.phase11A3Status) ? 0 : 1;
}

export function validateEvidenceIdentity(
  evidence: { runId?: unknown; verificationInputHash?: unknown } | null | undefined,
  runId: string,
  verificationInputHash: string,
): string[] {
  const errors: string[] = [];
  if (!evidence || evidence.runId !== runId) errors.push('runId mismatch');
  if (!evidence || evidence.verificationInputHash !== verificationInputHash) errors.push('verificationInputHash mismatch');
  return errors;
}
