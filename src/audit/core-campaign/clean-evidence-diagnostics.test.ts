import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatCleanFailureDiagnostic, preserveCleanFailureDiagnostics } from '../../../scripts/audit/clean-evidence-diagnostics';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('clean evidence diagnostics', () => {
  it('preserves a failed child release-gate conclusion without invoking a verifier', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase11a3-clean-root-'));
    roots.push(root);
    const temp = join(root, 'worktree');
    const data = join(temp, 'docs/data/core-campaign');
    const runId = 'diagnostic-run';
    mkdirSync(join(data, 'verification-runs', runId, 'logs'), { recursive: true });
    writeFileSync(join(data, 'verification-results.json'), JSON.stringify({ runId, verifierHealthy: false, unitPasses: false }));
    writeFileSync(join(data, 'release-gate.json'), JSON.stringify({ verdict: 'NOT-VERIFIED', phase11A3Status: 'NOT-VERIFIED', conclusion: 'first measured gate failed' }));
    writeFileSync(join(data, 'verification-runs', runId, 'logs', 'unit.log'), 'unit failure');

    const diagnostic = preserveCleanFailureDiagnostics({ root, temp, childExitCode: 1 });
    const output = formatCleanFailureDiagnostic(diagnostic);

    expect(output).toContain('releaseGate.conclusion=first measured gate failed');
    expect(readFileSync(join(diagnostic.diagnosticPath, 'release-gate.json'), 'utf8')).toContain('NOT-VERIFIED');
    expect(readFileSync(join(diagnostic.diagnosticPath, 'verification-runs', runId, 'logs', 'unit.log'), 'utf8')).toBe('unit failure');
  });
});
