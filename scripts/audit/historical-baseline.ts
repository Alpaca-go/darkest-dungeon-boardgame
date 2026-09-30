import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const historicalBaselines = {
  c1c27: { commit: 'aaedb2d30b1e5d90bf8d41e7dbced9f93288f73a', script: 'scripts/audit/verify-complete-edition-c1c27.ts' },
  c1c28: { commit: 'b6fa9180b44cd4a33f9fd4ceed97f179e64fbd0f', script: 'scripts/audit/verify-complete-edition-c1c28.ts' },
  c1c33: { commit: 'e1fcfac0692eb91c5710552ac93e3bacb25f0240', script: 'scripts/audit/c1c33-production-freeze.ts' },
} as const;

// Historical scope is evaluated by the original, unchanged verifier in its own checkout.
// The successor still verifies current frozen evidence; a baseline PASS cannot hide drift.
export function verifyHistoricalBaseline(phase: keyof typeof historicalBaselines) {
  const { commit, script } = historicalBaselines[phase];
  const git = (args: string[]) => execFileSync('git', args, { maxBuffer: 128 * 1024 * 1024 });
  git(['merge-base', '--is-ancestor', commit, 'HEAD']);
  const entries = git(['ls-tree', '-r', '--name-only', commit, 'docs/data', 'docs/reports']).toString().trim().split(/\r?\n/)
    .filter(p => p.split('/').at(-1)!.startsWith(`${phase}-`));
  for (const path of entries) {
    if (!git(['show', `${commit}:${path}`]).equals(readFileSync(path))) throw new Error(`Frozen ${phase} evidence changed: ${path}`);
  }
  if (phase === 'c1c33') verifyCurrentFreeze();
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
    execFileSync(process.execPath, [resolve('node_modules/vite-node/vite-node.mjs'), script, ...(phase === 'c1c33' ? ['--verify'] : [])],
      { cwd: checkout, stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
  } finally {
    // Only remove the junction itself; never recurse through the shared dependency directory.
    if (existsSync(join(checkout, 'node_modules'))) unlinkSync(join(checkout, 'node_modules'));
    if (added) git(['worktree', 'remove', '--force', checkout]);
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(`${phase} immutable baseline ${commit}: PASS; current frozen evidence: PASS`);
}

export function verifyCurrentFreeze() {
  const manifest = JSON.parse(readFileSync('docs/data/complete-edition/c1c33-necromancer-production-freeze-manifest.json', 'utf8'));
  for (const [path, expected] of Object.entries(manifest.runtimeHashes)) {
    const actual = createHash('sha256').update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
    if (actual !== expected) throw new Error(`Frozen production runtime changed: ${path}`);
  }
  for (const [path, expected] of Object.entries({ ...manifest.evidenceHashes, ...manifest.acceptanceHashes })) {
    if (createHash('sha256').update(readFileSync(path)).digest('hex') !== expected) throw new Error(`Frozen production evidence changed: ${path}`);
  }
}
