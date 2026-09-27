import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyContractGate } from './c1c18-contract-gate';
import { git, sha, verdict } from './c1c18-contract';
import { C1C17_VERIFICATION_COMMANDS } from './c1c17-implementation-gate';

verifyContractGate();
const run = (program: string, args: string[]) => {
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, timeout: 900000, shell: false,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed:\n${output.slice(-16000)}\n${result.error ?? ''}`);
  return output;
};
const shell = process.env.ComSpec ?? 'cmd.exe';
console.log('Running C1C18 adversarial contract checks');
run(shell, ['/d', '/s', '/c', 'npx vite-node scripts/audit/test-c1c18-contract.ts']);
if (!process.argv.includes('--contract-only')) {
  const bundledPython = join(process.env.USERPROFILE ?? '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  console.log('Re-extracting all official PDF pages to verify page/region/fact evidence');
  run(process.env.C1C18_PYTHON ?? (existsSync(bundledPython) ? bundledPython : 'python'), ['scripts/audit/extract-c1c18-rulebook.py', '--verify']);
  const volatile = ['docs/data/core-campaign/official-source-manifest.json', 'docs/data/core-campaign/source-readiness.json'];
  const snapshots = volatile.map(p => [p, readFileSync(p)] as const);
  const outputHashes: Record<string, string> = {};
  mkdirSync('tmp/c1c18-verification', { recursive: true });
  try {
    for (const command of C1C17_VERIFICATION_COMMANDS) {
      console.log('Running ' + command);
      const output = run(shell, ['/d', '/s', '/c', command === 'test' ? 'npm test' : 'npm run ' + command]);
      writeFileSync(`tmp/c1c18-verification/${command.replace(/:/g, '-')}.log`, output);
      outputHashes[command] = sha(output);
      console.log('Passed ' + command);
    }
  } finally { for (const [path, bytes] of snapshots) writeFileSync(path, bytes); }
  verifyContractGate();
  writeFileSync('tmp/c1c18-verification/receipt.json', JSON.stringify({ status: 'CONTRACT_AND_REGRESSIONS_VERIFIED',
    head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), commands: C1C17_VERIFICATION_COMMANDS, outputHashes, verdict }, null, 2) + '\n');
}
console.log(verdict);
