import { describe, expect, it } from 'vitest';
import { evaluateReleaseGate, runAudit, type RunAuditOptions } from './run-audit';
import { runProductionCommandAudit } from './production-command-audit';
const measured: RunAuditOptions = {
  typecheckPasses: true, unitPasses: true, buildPasses: true, integrationPasses: true,
  criticalE2EPasses: true, commandContractPasses: true, goldenTestPasses: true,
  replayDeterminismPasses: true, replayContinuationPasses: true, productionCommandLayerPasses: true,
  verificationFresh: true,
};
const report = runAudit(measured);
const input = { ...report, options: measured, pcaResult: runProductionCommandAudit() };
describe('Final acceptance rejects false green evidence', () => {
  it('Only measured acceptance with the official data gap permits Phase 11A.3', () => {
    expect(report.gate.verdict).toBe('CONDITIONAL');
    expect(report.gate.canEnterPhase11A3).toBe(true);
    expect(report.gate.onlyOpenP0).toBe('ISSUE-P0-002');
    expect(report.gate.goldenCampaignPasses).toBe(false);
    expect(report.gate.goldenTestPasses).toBe(true);
  });
  for (const key of Object.keys(measured)) {
    for (const value of [false, undefined]) it(`${key}=${value} blocks acceptance`, () => {
      const gate = evaluateReleaseGate({ ...input, options: { ...measured, [key]: value } });
      expect(gate.canEnterPhase11A3).toBe(false);
      expect(['FAIL', 'NOT-VERIFIED']).toContain(gate.verdict);
    });
  }
  it('A different open P0 cannot reuse the content exception', () => {
    const issues = report.issues.map(i => i.id === 'ISSUE-P0-002' ? { ...i, id: 'OTHER-P0' } : i);
    expect(evaluateReleaseGate({ ...input, issues }).verdict).toBe('FAIL');
  });
});
