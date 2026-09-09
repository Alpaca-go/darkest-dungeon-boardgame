export type GuardianFamily = 'templars' | 'mammoth-cyst' | 'shuffling-horror';
export type SkippedFormId = 'ancestor-first-form' | 'ancestor-second-form' | 'gestating-heart';
export type MatrixCombinationResult = { family: GuardianFamily; skippedFormId: SkippedFormId; status: 'NOT-RUN' | 'PASS' | 'FAIL'; note: string };

export interface OfficialMatrixRunner {
  runCombination(family: GuardianFamily, skippedFormId: SkippedFormId, mode: 'formal'): MatrixCombinationResult;
}

export function createOfficialMatrixRunner(sourceReady: boolean, execute?: OfficialMatrixRunner): OfficialMatrixRunner {
  return {
    runCombination(family, skippedFormId, mode) {
      if (mode !== 'formal') throw new Error('Official matrix only accepts formal mode');
      if (!sourceReady) return { family, skippedFormId, status: 'NOT-RUN', note: 'SOURCE-BLOCKED: official source not ready' };
      if (!execute) return { family, skippedFormId, status: 'NOT-RUN', note: 'official import not complete' };
      return execute.runCombination(family, skippedFormId, mode);
    },
  };
}
