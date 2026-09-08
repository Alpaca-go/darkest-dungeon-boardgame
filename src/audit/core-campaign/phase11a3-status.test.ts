import { describe, expect, it } from 'vitest';
import { evaluatePhase11A3Status, type Phase11A3StatusInput } from './phase11a3-status';

const base: Phase11A3StatusInput = {
  verifierHealthy: true, implementationPasses: true, sourceAuditPasses: true,
  allRequiredSourcesReady: false, elevenQuestLoopClosed: false,
  openP0: 1, openP1: 0, onlyOpenP0: 'ISSUE-P0-002',
};
describe('Phase 11A.3 pure status evaluator', () => {
  it.each([
    ['NOT-VERIFIED', { verifierHealthy: false }],
    ['NOT-VERIFIED', { sourceAuditPasses: false }],
    ['IMPLEMENTATION-FAIL', { implementationPasses: false }],
    ['IMPLEMENTATION-FAIL', { openP1: 1 }],
    ['IMPLEMENTATION-FAIL', { openP0: 1, onlyOpenP0: 'OTHER-P0' }],
    ['SOURCE-BLOCKED', {}],
    ['READY-FOR-OFFICIAL-IMPORT', { allRequiredSourcesReady: true }],
    ['COMPLETE', { allRequiredSourcesReady: true, elevenQuestLoopClosed: true, openP0: 0 }],
  ] as const)('%s is directly evaluated', (expected, override) => {
    expect(evaluatePhase11A3Status({ ...base, ...override })).toBe(expected);
  });
});
