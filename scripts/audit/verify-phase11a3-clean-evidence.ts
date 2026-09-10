/** Standalone rebuild check.  It intentionally is not a Vitest test: the verifier runs Vitest. */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { formatCleanFailureDiagnostic, preserveCleanFailureDiagnostics } from './clean-evidence-diagnostics';

const root = process.cwd();
const temp = mkdtempSync(join(root, '.phase11a3-clean-'));
const tierARulebook = join(root, 'docs/DD_EN_COREBOX_RULES.pdf');
const rootNodeModules = join(root, 'node_modules');
const tempNodeModules = join(temp, 'node_modules');
const data = join(temp, 'docs/data/core-campaign');
const artifacts = ['verification-results.json', 'release-gate.json', 'phase11a3-pre-gate-evidence.json', 'issue-ledger.json'];
function remove(path: string) { if (existsSync(path)) unlinkSync(path); }
try {
  execFileSync('git', ['worktree', 'add', '--detach', temp, 'HEAD'], { cwd: root, stdio: 'inherit' });
  if (!existsSync(rootNodeModules)) throw new Error(`Root node_modules missing: ${rootNodeModules}`);
  // E2E tooling resolves dependencies from process.cwd().  Share the already
  // installed root dependencies without copying or installing them.
  symlinkSync(rootNodeModules, tempNodeModules, process.platform === 'win32' ? 'junction' : 'dir');
  for (const name of artifacts) remove(join(data, name));
  remove(join(temp, 'docs/reports/phase-11a3/phase-11a3-source-gate-final-acceptance-report.md'));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  // The Tier-A rulebook is an intentionally ignored, user-supplied source asset.
  // A detached worktree contains committed code only, so pass its immutable input
  // path explicitly rather than misclassifying a valid SOURCE-BLOCKED rebuild as
  // a source-audit error simply because Git does not version the PDF.
  if (!existsSync(tierARulebook)) throw new Error(`Tier A rulebook missing: ${tierARulebook}`);
  // On Windows, invoking npm.cmd with `shell: true` may return before npm's
  // child process exits. Use cmd.exe as the executable instead, so spawnSync
  // owns the complete process and cannot report a premature clean-check pass.
  const command = process.platform === 'win32'
    ? process.env.ComSpec ?? 'cmd.exe'
    : npm;
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `${npm} run verify:phase11a3-source-gate`]
    : ['run', 'verify:phase11a3-source-gate'];
  const result = spawnSync(command, args, {
    cwd: temp,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, PHASE11A3_RULEBOOK_PATH: tierARulebook },
  });
  if (result.status !== 0) {
    const diagnostic = preserveCleanFailureDiagnostics({
      root,
      temp,
      childExitCode: result.status ?? -1,
    });
    console.error(formatCleanFailureDiagnostic(diagnostic));
    throw new Error(`clean verifier exited ${result.status}`);
  }
  const verification = JSON.parse(readFileSync(join(data, 'verification-results.json'), 'utf8'));
  const gate = JSON.parse(readFileSync(join(data, 'release-gate.json'), 'utf8'));
  if (!verification.runId || verification.runId !== gate.runId || verification.sourceInputHash !== gate.sourceInputHash || verification.verificationInputHash !== gate.verificationInputHash) throw new Error('clean evidence identity mismatch');
  if (verification.phase11A3Status !== 'SOURCE-BLOCKED' || verification.verifierHealthy !== true || verification.engineeringRegressionPasses !== true || verification.unmeasuredGateBits.length || verification.consistencyErrors.length) throw new Error('clean evidence terminal state invalid');
  console.log('clean evidence rebuild: PASS');
} finally {
  // This removes only the temporary junction/symlink, never root/node_modules.
  rmSync(tempNodeModules, { recursive: true, force: true });
  try { execFileSync('git', ['worktree', 'remove', '--force', temp], { cwd: root, stdio: 'inherit' }); } catch { rmSync(temp, { recursive: true, force: true }); }
}
