import { isOfficialActFourImportReady } from './official-act-four-import-readiness';
import { computeMatrixRunHash, type FormalMatrixIdentity, type FormalMatrixScenarioEvidence, type OfficialActFourFormalMatrixEvidence } from './official-act-four-formal-matrix';

/**
 * Sole formal API. It has no runner/executor injection seam.  Before official
 * runtime data exists, it emits only source/import-blocked evidence; it never
 * promotes static registry validation to FORMAL-PRODUCTION.
 */
export function runFormalProductionMatrix(identity: Omit<FormalMatrixIdentity, 'matrixRunHash'>): OfficialActFourFormalMatrixEvidence {
  const details: FormalMatrixScenarioEvidence[] = [];
  const matrixRunHash = computeMatrixRunHash(identity, details);
  const sourceBlocked = !isOfficialActFourImportReady();
  return {
    status: sourceBlocked ? 'SOURCE-BLOCKED' : 'NOT-RUN',
    evidenceKind: 'SOURCE-BLOCKED', combinationsExpected: 9, combinationsRun: 0, combinationsPassed: 0, details,
    guardianCoverage: { templars: false, 'mammoth-cyst': false, 'shuffling-horror': false },
    skippedFormCoverage: { ancestorFirstForm: false, ancestorSecondForm: false, gestatingHeart: false },
    heartOfDarknessAlwaysPresent: false, prototypeReferenceCount: 0, debugMutationCount: 0, directStateInjectionCount: 0,
    identity: { ...identity, matrixRunHash },
  };
}
