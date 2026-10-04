/** Successor-safe C3A verification: compare frozen accepted inputs, never rerun transcription. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
export const C3B_BASELINE = '4743ea6ec2a37b58ca72bc0655d0c9b895397c43';
export function verifyC3AFrozen() {
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', C3B_BASELINE], { encoding: 'utf8' })
    .trim().split(/\r?\n/).filter(p => /^(docs\/data\/complete-edition\/c3a-|scripts\/audit\/c3a-|src\/audit\/c3a-)/.test(p)
      || ['src/data/monsters/production-monster-types.ts', 'src/data/monsters/production-monster-registry.ts'].includes(p));
  for (const path of paths) {
    const original = execFileSync('git', ['show', `${C3B_BASELINE}:${path}`], { maxBuffer: 16 * 1024 * 1024 }).toString('utf8').replace(/\r\n/g, '\n');
    if (original !== readFileSync(path, 'utf8').replace(/\r\n/g, '\n')) throw new Error(`C3A: frozen input changed ${path}`);
  }
  return paths.length;
}
if (process.argv.includes('--verify-c3a')) console.log(`C3A frozen accepted inputs PASS (${verifyC3AFrozen()} files)`);
