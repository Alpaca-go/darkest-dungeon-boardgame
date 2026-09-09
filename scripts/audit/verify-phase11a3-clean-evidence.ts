/** Standalone rebuild check.  It intentionally is not a Vitest test: the verifier runs Vitest. */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const temp = mkdtempSync(join(root, '.phase11a3-clean-'));
const data = join(temp, 'docs/data/core-campaign');
const artifacts = ['verification-results.json', 'release-gate.json', 'phase11a3-pre-gate-evidence.json', 'issue-ledger.json'];
function remove(path: string) { if (existsSync(path)) unlinkSync(path); }
try {
  execFileSync('git', ['worktree', 'add', '--detach', temp, 'HEAD'], { cwd: root, stdio: 'inherit' });
  for (const name of artifacts) remove(join(data, name));
  remove(join(temp, 'docs/reports/phase-11a3/phase-11a3-source-gate-final-acceptance-report.md'));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'verify:phase11a3-source-gate'], { cwd: temp, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`clean verifier exited ${result.status}`);
  const verification = JSON.parse(readFileSync(join(data, 'verification-results.json'), 'utf8'));
  const gate = JSON.parse(readFileSync(join(data, 'release-gate.json'), 'utf8'));
  if (!verification.runId || verification.runId !== gate.runId || verification.sourceInputHash !== gate.sourceInputHash || verification.verificationInputHash !== gate.verificationInputHash) throw new Error('clean evidence identity mismatch');
  if (verification.phase11A3Status !== 'SOURCE-BLOCKED' || verification.verifierHealthy !== true || verification.engineeringRegressionPasses !== true || verification.unmeasuredGateBits.length || verification.consistencyErrors.length) throw new Error('clean evidence terminal state invalid');
  console.log('clean evidence rebuild: PASS');
} finally {
  try { execFileSync('git', ['worktree', 'remove', '--force', temp], { cwd: root, stdio: 'inherit' }); } catch { rmSync(temp, { recursive: true, force: true }); }
}
