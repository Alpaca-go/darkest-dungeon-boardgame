import { expect, it } from 'vitest';
import { evaluatePhase11A3TerminalState } from './phase11a3-terminal-state';
const base: any = { verifierHealthy: true, engineeringRegressionPasses: true, sourceAuditPasses: true, allRequiredSourcesReady: false, officialImportReady: false, formalMatrix: null, currentIdentity: null, elevenQuestLoopClosed: false, campaignVictoryReachable: false, ruleTraceabilityP0Complete: false, prototypeReferencesInOfficialPath: 0, openP0: 1, openP1: 0, onlyOpenP0: 'ISSUE-P0-002' };
it('NOT-VERIFIED has priority over source blocked', () => expect(evaluatePhase11A3TerminalState({ ...base, verifierHealthy: false })).toBe('NOT-VERIFIED'));
it('source missing stays SOURCE-BLOCKED', () => expect(evaluatePhase11A3TerminalState(base)).toBe('SOURCE-BLOCKED'));
it('source ready/import pending transitions explicitly', () => expect(evaluatePhase11A3TerminalState({ ...base, allRequiredSourcesReady: true })).toBe('READY-FOR-OFFICIAL-IMPORT'));
