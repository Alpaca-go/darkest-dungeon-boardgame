import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, symlinkSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const baseline = 'b01a3380aa1f9c24d7c6bafb32be99220ac10421';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const matrix = JSON.parse(readFileSync('docs/data/complete-edition/c1c32r3r-runtime-capability-matrix.json', 'utf8'));
const review = JSON.parse(readFileSync('docs/data/complete-edition/c1c33-runtime-review.json', 'utf8'));
// Validate immutable evidence and baseline fingerprints independently, then permit only exact reviewed successor bytes.
for (const [path, expected] of Object.entries({...matrix.runtimeHashes, ...matrix.observationHashes})) {
  if (hash(execFileSync('git', ['show', `${baseline}:${path}`], {maxBuffer: 64 * 1024 * 1024})) !== expected) throw new Error(`Corrupt R3R baseline: ${path}`);
  const current = hash(readFileSync(path));
  if (current !== expected && review.successorHashes[path] !== current) throw new Error(`Unreviewed successor: ${path}`);
  if (path.startsWith('docs/') && current !== expected) throw new Error(`Historical evidence changed: ${path}`);
}
const scratch = mkdtempSync(join(tmpdir(), 'dd-c1c33-r3r-'));
const checkout = join(scratch, 'baseline');
try {
  execFileSync('git', ['-c', 'core.autocrlf=false', 'worktree', 'add', '--detach', checkout, baseline], {stdio: 'pipe'});
  symlinkSync(resolve('node_modules'), join(checkout, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  execFileSync(process.execPath, [resolve('node_modules/vite-node/vite-node.mjs'), 'scripts/audit/c1c32r3r-full-path.ts', '--verify'], {cwd: checkout, stdio: 'inherit'});
  console.log('R3R immutable proof PASS; current successor deltas independently hash-bound by C1C33');
} finally {
  if (existsSync(join(checkout, 'node_modules'))) unlinkSync(join(checkout, 'node_modules'));
  execFileSync('git', ['worktree', 'remove', '--force', checkout], {stdio: 'pipe'});
  rmSync(scratch, {recursive: true, force: true});
}
