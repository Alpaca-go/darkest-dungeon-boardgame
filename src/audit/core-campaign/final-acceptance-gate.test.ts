import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { evaluateReleaseGate, runAudit, type RunAuditOptions } from './run-audit';
import { runProductionCommandAudit } from './production-command-audit';
const measured: RunAuditOptions = {
  typecheckPasses: true, unitPasses: true, buildPasses: true, integrationPasses: true,
  criticalE2EPasses: true, criticalE2ELifecyclePasses: true, commandContractPasses: true, goldenTestPasses: true,
  replayDeterminismPasses: true, replayContinuationPasses: true, productionCommandLayerPasses: true,
  verificationFresh: true,
};
const measuredGateKeys = [
  'typecheckPasses', 'unitPasses', 'buildPasses', 'integrationPasses',
  'criticalE2EPasses', 'criticalE2ELifecyclePasses', 'commandContractPasses',
  'goldenTestPasses', 'replayDeterminismPasses', 'replayContinuationPasses',
  'productionCommandLayerPasses', 'verificationFresh',
] as const;
const root = process.cwd();
const fixtureRoot = mkdtempSync(join(tmpdir(), 'phase11a3-final-acceptance-'));
const externalRulebook = join(fixtureRoot, 'DD_EN_COREBOX_RULES.pdf');
writeFileSync(externalRulebook, Buffer.from('phase11a3-final-acceptance-rulebook-fixture'));
const auditOptions: RunAuditOptions = {
  ...measured,
  sourceAuditOptions: {
    repoRoot: root,
    officialSourceRoot: join(root, 'docs/data/darkest-dungeon/official'),
    rulebookPath: externalRulebook,
  },
};
const report = runAudit(auditOptions);
const input = { ...report, options: auditOptions, pcaResult: runProductionCommandAudit() };

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});
describe('Final acceptance rejects false green evidence', () => {
  // Phase 11A.3 dev doc §1 / §39：source-readiness 未 ready + 仅有 P0-002 缺口 → SOURCE-BLOCKED。
  // SOURCE-BLOCKED 也是 canEnterPhase11A3=true 的合法终态（dev doc §1）。
  it('Phase 11A.3 source-blocked: only P0-002 official data gap permits Phase 11A.3', () => {
    expect(report.gate.verdict).toBe('SOURCE-BLOCKED');
    expect(report.gate.canEnterPhase11A3).toBe(true);
    expect(report.gate.onlyOpenP0).toBe('ISSUE-P0-002');
    expect(report.gate.goldenCampaignPasses).toBe(false);
    expect(report.gate.goldenTestPasses).toBe(true);
    // Phase 11A.3 dev doc §12：Source Gate 0 真实信号
    expect(report.gate.sourceReadiness.allRequiredSourcesReady).toBe(false);
  });
  for (const key of measuredGateKeys) {
    for (const value of [false, undefined]) it(`${key}=${value} blocks acceptance`, () => {
      const gate = evaluateReleaseGate({ ...input, options: { ...auditOptions, [key]: value } });
      expect(gate.canEnterPhase11A3).toBe(false);
      // 缺 measured → NOT-VERIFIED；其他已有 fail 链路 → FAIL。
      // 11A.3 终态语义里 SOURCE-BLOCKED 不属于 blocked acceptance。
      expect(['FAIL', 'NOT-VERIFIED']).toContain(gate.verdict);
    });
  }
  it('A different open P0 cannot reuse the content exception', () => {
    const issues = report.issues.map(i => i.id === 'ISSUE-P0-002' ? { ...i, id: 'OTHER-P0' } : i);
    expect(evaluateReleaseGate({ ...input, issues }).verdict).toBe('FAIL');
  });
  it('NOT-VERIFIED terminal truth cannot retain SOURCE-BLOCKED phase or permissions', () => {
    const gate = evaluateReleaseGate({ ...input, options: { ...auditOptions, verificationFresh: false } });
    expect(gate.verdict).toBe('NOT-VERIFIED');
    expect(gate.phase11A3Status).toBe('NOT-VERIFIED');
    expect(gate.canBeginOfficialImport).toBe(false);
    expect(gate.canCloseP0_002).toBe(false);
    expect(gate.canEnterPhase11B).toBe(false);
  });
  it('uses a disposable rulebook fixture outside the repository', () => {
    expect(externalRulebook.startsWith(tmpdir())).toBe(true);
    expect(externalRulebook).not.toBe(join(root, 'docs/DD_EN_COREBOX_RULES.pdf'));
  });
});
