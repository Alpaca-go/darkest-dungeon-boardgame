import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Include new, untracked implementation files; generated evidence is deliberately excluded. */
export function computeVerificationInputHash(extraExcludePatterns: string[] = []): string {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split(/\r?\n/).filter(f => /^(src\/|e2e\/|scripts\/|docs\/data\/darkest-dungeon\/official\/|docs\/DD_EN_COREBOX_RULES\.pdf$|package(-lock)?\.json$|playwright.*\.ts$|vite\.config\.ts$|tsconfig\.json$)/.test(f))
    .filter(f => !extraExcludePatterns.some(p => f.includes(p)));
  const hash = createHash('sha256');
  for (const f of [...new Set(files)].sort()) if (existsSync(f)) hash.update(f).update('\0').update(readFileSync(f)).update('\0');
  return hash.digest('hex');
}
