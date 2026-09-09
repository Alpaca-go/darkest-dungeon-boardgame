export type CompletionMatrixStatus = 'SOURCE-BLOCKED' | 'NOT-RUN' | 'FAIL' | 'READY';

export interface Phase11A3CompletionGateInput {
  sourceReady: boolean;
  importReady: boolean;
  matrixStatus: CompletionMatrixStatus;
  combinationsExpected: number;
  combinationsRun: number;
  combinationsPassed: number;
  evidenceKind: 'SOURCE-BLOCKED' | 'SYNTHETIC-CONTRACT' | 'FORMAL-PRODUCTION';
  prototypeReferenceCount: number;
  campaignVictoryReached: boolean;
}

/** The only grammar permitted to promote Phase 11A.3 to COMPLETE. */
export function evaluatePhase11A3CompletionGate(input: Phase11A3CompletionGateInput):
  'SOURCE-BLOCKED' | 'READY-FOR-OFFICIAL-IMPORT' | 'IMPLEMENTATION-FAIL' | 'COMPLETE' {
  if (!input.sourceReady) return 'SOURCE-BLOCKED';
  if (!input.importReady) return 'READY-FOR-OFFICIAL-IMPORT';
  const formalPass = input.matrixStatus === 'READY' && input.combinationsExpected === 9 &&
    input.combinationsRun === 9 && input.combinationsPassed === 9 &&
    input.evidenceKind === 'FORMAL-PRODUCTION' && input.prototypeReferenceCount === 0 && input.campaignVictoryReached;
  return formalPass ? 'COMPLETE' : 'IMPLEMENTATION-FAIL';
}
