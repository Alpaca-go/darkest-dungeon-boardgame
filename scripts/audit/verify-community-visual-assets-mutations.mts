/**
 * Phase 11A.3 — File-System Mutation Verification
 *
 * Runs A03 (delete local image) and A04 (corrupt local image) as real
 * filesystem mutations, with strict cleanup to restore the original state
 * after each test. Every mutation is expected to make the verify command
 * fail when re-run.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');

const MANIFEST_PATH = join(repoRoot, 'docs', 'data', 'darkest-dungeon', 'community-reference', 'community-visual-asset-manifest.json');
const ARTIFACTS_DIR = join(repoRoot, '.artifacts', 'phase-11a3-visual-assets');
const TTS_PATH = process.env.PHASE_11A3_TTS_PATH ?? '';

let failures = 0;
const fail = (id: string, msg: string) => { console.error(`FAIL ${id}: ${msg}`); failures++; };
const pass = (id: string) => console.log(`PASS ${id}`);

async function main() {
  const m = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { assets: Array<{ status: string; localPath?: string; localSha256?: string; assetId: string }> };
  const target = m.assets.find((a) => a.status === 'ready' && a.localPath && a.localPath.includes('templars-impaler'));
  if (!target || !target.localPath) { fail('SETUP', 'no templars-impaler entry'); process.exit(1); }
  const absPath = join(repoRoot, target.localPath.replace(/\//g, sep));
  const backupPath = join(ARTIFACTS_DIR, 'a03-a04-backup', target.localPath.replace(/\//g, '_'));
  await mkdir(dirname(backupPath), { recursive: true });
  await copyFile(absPath, backupPath);
  const origSha = await sha256File(absPath);
  console.log(`Target: ${target.assetId}`);
  console.log(`Local path: ${absPath}`);
  console.log(`Backup: ${backupPath}`);
  console.log(`Original SHA: ${origSha}`);
  console.log('');

  // ---------- A03: delete local image ----------
  try {
    await unlink(absPath);
    if (await exists(absPath)) { fail('A03-setup', 'expected file to be deleted'); }
    else { pass('A03-setup: file deleted'); }
    // Re-run verify and expect V03 to fail
    const r = await runVerify();
    if (r.failed) { pass('A03 delete local image -> verify FAILS as expected'); }
    else { fail('A03', 'verify did NOT fail after deletion'); }
  } finally {
    // Restore
    await copyFile(backupPath, absPath);
    const restored = await sha256File(absPath);
    if (restored !== origSha) { fail('A03-cleanup', `restored SHA mismatch: ${restored} != ${origSha}`); }
    else { pass('A03-cleanup: file restored from backup'); }
  }

  // ---------- A04: corrupt local image ----------
  try {
    const buf = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
    await writeFile(absPath, buf);
    const corruptedSha = await sha256File(absPath);
    if (corruptedSha === origSha) { fail('A04-setup', 'corruption did not change SHA'); }
    else { pass(`A04-setup: file corrupted, new SHA ${corruptedSha.slice(0, 12)}...`); }
    const r = await runVerify();
    if (r.failed) { pass('A04 corrupt local image -> verify FAILS as expected'); }
    else { fail('A04', 'verify did NOT fail after corruption'); }
  } finally {
    await copyFile(backupPath, absPath);
    const restored = await sha256File(absPath);
    if (restored !== origSha) { fail('A04-cleanup', `restored SHA mismatch: ${restored} != ${origSha}`); }
    else { pass('A04-cleanup: file restored from backup'); }
  }

  console.log('');
  console.log(`=== ${failures === 0 ? 'PASS' : 'FAIL'} : ${failures} failure(s) ===`);
  process.exit(failures === 0 ? 0 : 1);
}

async function runVerify(): Promise<{ failed: boolean; output: string }> {
  // Use the verify script directly via node strip-types
  const r = spawnSync(process.execPath, [
    resolve(repoRoot, 'scripts/audit/verify-community-visual-assets.mjs'),
    '--skip-vitest',
  ], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, PHASE_11A3_TTS_PATH: TTS_PATH } });
  const failed = (r.status ?? 0) !== 0;
  return { failed, output: (r.stdout || '') + '\n' + (r.stderr || '') };
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function sha256File(p: string): Promise<string> {
  const h = createHash('sha256');
  await pipeline(createReadStream(p), h);
  return h.digest('hex');
}

main().catch((err) => { console.error('FATAL:', err.stack || err.message); process.exit(1); });
