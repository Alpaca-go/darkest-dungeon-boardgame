import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAudit, type RunAuditOptions } from './run-audit';

const measured: RunAuditOptions = {
  typecheckPasses: true,
  unitPasses: true,
  buildPasses: true,
  integrationPasses: true,
  criticalE2EPasses: true,
  criticalE2ELifecyclePasses: true,
  commandContractPasses: true,
  goldenTestPasses: true,
  replayDeterminismPasses: true,
  replayContinuationPasses: true,
  productionCommandLayerPasses: true,
  verificationFresh: true,
};

const root = process.cwd();
const externalRulebook = join(root, 'docs/DD_EN_COREBOX_RULES.pdf');
const officialSourceRoot = join(root, 'docs/data/darkest-dungeon/official');

describe('Phase 11A.3 source audit path parity', () => {
  it('uses an external rulebook override when the audit repo has no rulebook', () => {
    const report = runAudit({
      ...measured,
      sourceAuditOptions: {
        repoRoot: join(root, '.phase11a3-test-no-rulebook'),
        officialSourceRoot,
        rulebookPath: externalRulebook,
      },
    });

    expect(report.gate.verdict).toBe('SOURCE-BLOCKED');
    expect(report.gate.phase11A3Status).toBe('SOURCE-BLOCKED');
  });

  it('reports source-audit errors as NOT-VERIFIED when no override exists', () => {
    const report = runAudit({
      ...measured,
      sourceAuditOptions: {
        repoRoot: join(root, '.phase11a3-test-no-rulebook'),
        officialSourceRoot,
      },
    });

    expect(report.gate.verdict).toBe('NOT-VERIFIED');
    expect(report.gate.phase11A3Status).toBe('NOT-VERIFIED');
    expect(report.gate.canBeginOfficialImport).toBe(false);
    expect(report.gate.canCloseP0_002).toBe(false);
    expect(report.gate.canEnterPhase11B).toBe(false);
  });
});
