import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const historicalBaselines = {
  c1c27: { commit: 'aaedb2d30b1e5d90bf8d41e7dbced9f93288f73a', script: 'scripts/audit/verify-complete-edition-c1c27.ts' },
  c1c28: { commit: 'b6fa9180b44cd4a33f9fd4ceed97f179e64fbd0f', script: 'scripts/audit/verify-complete-edition-c1c28.ts' },
  c1c33: { commit: 'e1fcfac0692eb91c5710552ac93e3bacb25f0240', script: 'scripts/audit/c1c33-production-freeze.ts' },
  c1c34: { commit: '051c2c400d391543f5c436cbaa141a54bdf19ac1', script: 'scripts/audit/c1c34-rebaseline.ts' },
  c1c35: { commit: '7b99c36c19159923799b3bda0180af9d8020ef82', script: 'scripts/audit/c1c35-prophet-contract.ts' },
  c1c35r1: { commit: '7a3a483cba0dca0eb537e744980eecd4c55fef24', script: 'scripts/audit/c1c35r1-prophet-contract.ts' },
  c1c35r2: { commit: '101c27c8c15fcb93802f956f399c37ed9c38a2e9', script: 'scripts/audit/c1c35r2-foundation-review.ts' },
  c1c35r2ar: { phase: 'C1C35R2A-R', commit: '007712ab6aec2c814fa31e06cf5fe05b21a30879', script: 'scripts/audit/c1c35r2a-shared-dispatch.ts', artifactPrefixes: ['c1c35r2a-', 'c1c35r2a-r-'] },
} as const;

// Historical scope is evaluated by the original, unchanged verifier in its own checkout.
// The successor still verifies current frozen evidence; a baseline PASS cannot hide drift.
export function verifyHistoricalBaseline(phase: keyof typeof historicalBaselines, testFiles: string[] = [], probe?: (checkout: string)=>void) {
  // Frozen infrastructure-only rejection is exercised with its original executor, not successor gameplay.
  if(phase==='c1c35r2ar'&&!testFiles.length)testFiles=['src/audit/c1c35r2a-shared-dispatch.test.ts'];
  const { commit, script } = historicalBaselines[phase];
  const git = (args: string[]) => execFileSync('git', args, { maxBuffer: 128 * 1024 * 1024 });
  git(['merge-base', '--is-ancestor', commit, 'HEAD']);
  verifyHistoricalArtifacts(phase);
  const scratch = mkdtempSync(join(tmpdir(), `dd-${phase}-baseline-`));
  const checkout = join(scratch, 'repo');
  if (!resolve(scratch).startsWith(resolve(tmpdir()) + '\\') && !resolve(scratch).startsWith(resolve(tmpdir()) + '/')) throw new Error('Unsafe scratch cleanup');
  if (!resolve(checkout).startsWith(resolve(scratch) + '\\') && !resolve(checkout).startsWith(resolve(scratch) + '/')) throw new Error('Unsafe checkout cleanup');
  let added = false;
  try {
    git(['-c', 'core.autocrlf=false', 'worktree', 'add', '--quiet', '--detach', checkout, commit]);
    added = true;
    // These phases used an ignored rulebook. Supply only the exact, now vendored locked bytes.
    if (!existsSync(join(checkout, 'docs/DD_EN_COREBOX_RULES.pdf'))) {
      const locked = JSON.parse(readFileSync('docs/data/complete-edition/c1a-rulebook-evidence.json', 'utf8'));
      const pdf = readFileSync('docs/DD_EN_COREBOX_RULES.pdf');
      if (createHash('sha256').update(pdf).digest('hex') !== locked.sha256) throw new Error('Locked rulebook mismatch');
      copyFileSync('docs/DD_EN_COREBOX_RULES.pdf', join(checkout, 'docs/DD_EN_COREBOX_RULES.pdf'));
    }
    symlinkSync(resolve('node_modules'), join(checkout, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const flags = phase === 'c1c35r2ar' ? ['--verify-dispatch'] : phase === 'c1c35r1' ? ['--verify-r1'] : phase === 'c1c35r2' ? ['--verify-r2'] : phase.startsWith('c1c3') ? ['--verify'] : [];
    execFileSync(process.execPath, ['--import', pathToFileURL(resolve('scripts/audit/legacy-transport-preload.mjs')).href, resolve('node_modules/vite-node/vite-node.mjs'), script, ...flags],
      { cwd: checkout, stdio: 'pipe', maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, DDBG_LEGACY_TRANSPORT_ARCHIVE: resolve('docs/data/complete-edition/source-assets/c1c34/legacy-transport.json.gz') } });
    if (testFiles.length) {
      const report=join(scratch,'historical-tests.json');
      execFileSync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', ...testFiles, '--maxWorkers=1', '--minWorkers=1', '--reporter=json', '--outputFile', report], {cwd: checkout, stdio: 'pipe', maxBuffer: 16 * 1024 * 1024});
      const tests=JSON.parse(readFileSync(report,'utf8'));
      if (tests.numFailedTests || tests.numFailedTestSuites || tests.numPendingTests || tests.numTodoTests) throw new Error('Historical suites require zero failed/pending/todo');
      console.log(`${phase} unchanged historical suites: ${tests.numPassedTests} passed; 0 failed / pending / todo`);
    }
    probe?.(checkout);
  } finally {
    // Only remove the junction itself; never recurse through the shared dependency directory.
    if (existsSync(join(checkout, 'node_modules'))) unlinkSync(join(checkout, 'node_modules'));
    if (added) git(['worktree', 'remove', '--force', checkout]);
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(`${phase} immutable baseline ${commit}: PASS; current frozen evidence: PASS`);
}

export function verifyHistoricalArtifacts(phase: keyof typeof historicalBaselines) {
  const checkpoint = historicalBaselines[phase];
  const {commit} = checkpoint;
  const prefixes = 'artifactPrefixes' in checkpoint ? checkpoint.artifactPrefixes : [`${phase}-`];
  const git = (args: string[]) => execFileSync('git', args, {maxBuffer: 128 * 1024 * 1024});
  const entries = git(['ls-tree', '-r', '--name-only', commit]).toString().trim().split(/\r?\n/)
    .filter(p => p.split('/').some(part=>prefixes.some(prefix=>part.startsWith(prefix))));
  for (const path of entries) if (!git(['show', `${commit}:${path}`]).equals(readFileSync(path))) throw new Error(`Frozen ${phase} evidence changed: ${path}`);
  return entries.length;
}

/** Compatibility alias for evidence consumers. Exact runtime verification belongs in the accepted checkout. */
export function verifyCurrentFreeze() {
  verifyHistoricalArtifacts('c1c33');
  const manifest = JSON.parse(readFileSync('docs/data/complete-edition/c1c33-necromancer-production-freeze-manifest.json', 'utf8'));
  for (const [path, expected] of Object.entries({ ...manifest.evidenceHashes, ...manifest.acceptanceHashes })) {
    if (createHash('sha256').update(readFileSync(path)).digest('hex') !== expected) throw new Error(`Frozen production evidence changed: ${path}`);
  }
}
