export type Phase11A3Status =
  | 'NOT-VERIFIED'
  | 'SOURCE-BLOCKED'
  | 'READY-FOR-OFFICIAL-IMPORT'
  | 'IMPLEMENTATION-FAIL'
  | 'COMPLETE';

export interface Phase11A3StatusInput {
  verifierHealthy: boolean;
  implementationPasses: boolean;
  sourceAuditPasses: boolean;
  allRequiredSourcesReady: boolean;
  elevenQuestLoopClosed: boolean;
  openP0: number;
  openP1: number;
  onlyOpenP0: string | null;
}

/** Pure terminal-state evaluator. It never reads artifacts or infers missing data. */
export function evaluatePhase11A3Status(input: Phase11A3StatusInput): Phase11A3Status {
  if (!input.verifierHealthy || !input.sourceAuditPasses) return 'NOT-VERIFIED';
  if (!input.implementationPasses || input.openP1 > 0 || (input.openP0 > 0 && input.onlyOpenP0 !== 'ISSUE-P0-002')) {
    return 'IMPLEMENTATION-FAIL';
  }
  if (!input.allRequiredSourcesReady) return 'SOURCE-BLOCKED';
  if (!input.elevenQuestLoopClosed) return 'READY-FOR-OFFICIAL-IMPORT';
  return 'COMPLETE';
}
