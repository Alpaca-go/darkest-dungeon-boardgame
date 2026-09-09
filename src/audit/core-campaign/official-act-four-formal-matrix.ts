import { createHash } from 'node:crypto';
import type { GuardianFamily, SkippedFormId } from './official-matrix-runner';

export interface FormalMatrixIdentity { runId: string; verificationInputHash: string; sourceInputHash: string; matrixRunHash: string }
export interface FormalMatrixScenarioEvidence {
  guardianFamily: GuardianFamily; skippedFormId: SkippedFormId; questId: string; guardianDefinitionId: string;
  guardianEncounterStarted: boolean; guardianActorIdsSeen: string[]; guardianVictoryReached: boolean;
  finalEncounterStarted: boolean; enteredFinalFormIds: string[]; skippedFormActuallyAbsent: boolean;
  heartOfDarknessActuallyPresent: boolean; campaignVictoryReached: boolean;
  prototypeReferenceCount: number; debugMutationCount: number; directStateInjectionCount: number;
  initialStateHash: string; finalStateHash: string; eventSequenceHash: string;
  runId: string; verificationInputHash: string; sourceInputHash: string; passed: boolean; failureReason: string | null;
}
export interface OfficialActFourFormalMatrixEvidence {
  status: 'SOURCE-BLOCKED' | 'NOT-RUN' | 'FAIL' | 'READY'; evidenceKind: 'SOURCE-BLOCKED' | 'FORMAL-PRODUCTION';
  combinationsExpected: 9; combinationsRun: number; combinationsPassed: number; details: FormalMatrixScenarioEvidence[];
  guardianCoverage: Record<GuardianFamily, boolean>; skippedFormCoverage: Record<'ancestorFirstForm' | 'ancestorSecondForm' | 'gestatingHeart', boolean>;
  heartOfDarknessAlwaysPresent: boolean; prototypeReferenceCount: number; debugMutationCount: number; directStateInjectionCount: number; identity: FormalMatrixIdentity;
}
const canonical = (input: Omit<FormalMatrixIdentity, 'matrixRunHash'>, details: FormalMatrixScenarioEvidence[]) => JSON.stringify({ ...input, details: details.map(({ runId, verificationInputHash, sourceInputHash, ...detail }) => detail).sort((a,b) => `${a.guardianFamily}/${a.skippedFormId}`.localeCompare(`${b.guardianFamily}/${b.skippedFormId}`)) });
export function computeMatrixRunHash(input: Omit<FormalMatrixIdentity, 'matrixRunHash'>, details: FormalMatrixScenarioEvidence[]): string { return createHash('sha256').update(canonical(input, details)).digest('hex'); }
export function validateFormalMatrixEvidence(matrix: OfficialActFourFormalMatrixEvidence, identity: Omit<FormalMatrixIdentity, 'matrixRunHash'>): boolean {
  if (matrix.identity.runId !== identity.runId || matrix.identity.sourceInputHash !== identity.sourceInputHash || matrix.identity.verificationInputHash !== identity.verificationInputHash) return false;
  if (matrix.identity.matrixRunHash !== computeMatrixRunHash(identity, matrix.details)) return false;
  return matrix.evidenceKind === 'FORMAL-PRODUCTION' && matrix.status === 'READY' && matrix.combinationsRun === 9 && matrix.combinationsPassed === 9 && matrix.details.length === 9 && matrix.details.every((detail) => detail.passed && detail.guardianVictoryReached && detail.finalEncounterStarted && detail.skippedFormActuallyAbsent && detail.heartOfDarknessActuallyPresent && detail.campaignVictoryReached && detail.prototypeReferenceCount === 0 && detail.debugMutationCount === 0 && detail.directStateInjectionCount === 0);
}
