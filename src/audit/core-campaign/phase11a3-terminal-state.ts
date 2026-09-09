import type { OfficialActFourFormalMatrixEvidence } from './official-act-four-formal-matrix';
import { validateFormalMatrixEvidence } from './official-act-four-formal-matrix';

export type Phase11A3TerminalState = 'NOT-VERIFIED' | 'SOURCE-BLOCKED' | 'READY-FOR-OFFICIAL-IMPORT' | 'IMPLEMENTATION-FAIL' | 'READY-TO-CLOSE-P0-002' | 'COMPLETE';
export interface Phase11A3TerminalInput {
  verifierHealthy: boolean; engineeringRegressionPasses: boolean; sourceAuditPasses: boolean; allRequiredSourcesReady: boolean; officialImportReady: boolean;
  formalMatrix: OfficialActFourFormalMatrixEvidence | null; currentIdentity: { runId: string; sourceInputHash: string; verificationInputHash: string } | null;
  elevenQuestLoopClosed: boolean; campaignVictoryReachable: boolean; ruleTraceabilityP0Complete: boolean; prototypeReferencesInOfficialPath: number; openP0: number; openP1: number; onlyOpenP0: string | null;
}
export function evaluatePhase11A3TerminalState(input: Phase11A3TerminalInput): Phase11A3TerminalState {
  if (!input.verifierHealthy || !input.engineeringRegressionPasses || !input.sourceAuditPasses) return 'NOT-VERIFIED';
  if (input.openP1 > 0 || (input.openP0 > 0 && input.onlyOpenP0 !== 'ISSUE-P0-002')) return 'IMPLEMENTATION-FAIL';
  if (!input.allRequiredSourcesReady) return 'SOURCE-BLOCKED';
  if (!input.officialImportReady) return 'READY-FOR-OFFICIAL-IMPORT';
  const matrixValid = !!input.formalMatrix && !!input.currentIdentity && validateFormalMatrixEvidence(input.formalMatrix, input.currentIdentity);
  if (!matrixValid || !input.elevenQuestLoopClosed || !input.campaignVictoryReachable || !input.ruleTraceabilityP0Complete || input.prototypeReferencesInOfficialPath !== 0) return 'IMPLEMENTATION-FAIL';
  if (input.openP0 === 1 && input.onlyOpenP0 === 'ISSUE-P0-002') return 'READY-TO-CLOSE-P0-002';
  return input.openP0 === 0 && input.openP1 === 0 ? 'COMPLETE' : 'IMPLEMENTATION-FAIL';
}
