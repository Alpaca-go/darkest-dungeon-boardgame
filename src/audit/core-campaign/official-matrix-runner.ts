export type GuardianFamily = 'templars' | 'mammoth-cyst' | 'shuffling-horror';
export type SkippedFormId = 'ancestor-first-form' | 'ancestor-second-form' | 'gestating-heart';
export type MatrixCombinationResult = { family: GuardianFamily; skippedFormId: SkippedFormId; status: 'NOT-RUN' | 'PASS' | 'FAIL'; note: string };

export interface OfficialMatrixRunner {
  runCombination(family: GuardianFamily, skippedFormId: SkippedFormId, mode: 'formal'): MatrixCombinationResult;
}
const formalProductionRunners = new WeakSet<object>();
/** Internal factory registration; callers cannot self-declare through the public runner shape. */
export function registerFormalProductionRunner<T extends OfficialMatrixRunner>(runner: T): T { formalProductionRunners.add(runner); return runner; }
export function isRegisteredFormalProductionRunner(runner: OfficialMatrixRunner | undefined): boolean { return !!runner && formalProductionRunners.has(runner); }

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
