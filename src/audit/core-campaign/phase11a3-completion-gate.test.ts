import { describe, expect, it } from 'vitest';
import { evaluatePhase11A3CompletionGate } from './phase11a3-completion-gate';

const base = { sourceReady: true, importReady: true, matrixStatus: 'READY' as const, combinationsExpected: 9, combinationsRun: 9, combinationsPassed: 9, evidenceKind: 'FORMAL-PRODUCTION' as const, prototypeReferenceCount: 0, campaignVictoryReached: true };
describe('Phase 11A.3 completion grammar', () => {
  it.each([
    ['SOURCE-BLOCKED', { sourceReady: false }],
    ['READY-FOR-OFFICIAL-IMPORT', { importReady: false }],
    ['IMPLEMENTATION-FAIL', { matrixStatus: 'NOT-RUN' as const }],
    ['IMPLEMENTATION-FAIL', { matrixStatus: 'FAIL' as const }],
    ['IMPLEMENTATION-FAIL', { combinationsPassed: 8 }],
    ['IMPLEMENTATION-FAIL', { combinationsRun: 0, combinationsPassed: 0 }],
    ['IMPLEMENTATION-FAIL', { prototypeReferenceCount: 1 }],
    ['IMPLEMENTATION-FAIL', { campaignVictoryReached: false }],
    ['COMPLETE', {}],
  ] as const)('%s', (expected, override) => expect(evaluatePhase11A3CompletionGate({ ...base, ...override })).toBe(expected));
});
