import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { verifyContractGate } from './c1c19-contract-gate';
import { git, sha, verdict } from './c1c19-contract';
import { C1C17_VERIFICATION_COMMANDS } from './c1c17-implementation-gate';

verifyContractGate();
const run = (program: string, args: string[]) => {
  const result = spawnSync(program, args, { encoding: 'utf8', shell: false, maxBuffer: 100 * 1024 * 1024, timeout: 900000,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed:\n${output.slice(-16000)}\n${result.error ?? ''}`);
  return output;
};
const shell = process.env.ComSpec ?? 'cmd.exe';
console.log('Running C1C19 source-bound adversarial mutations');
run(shell, ['/d', '/s', '/c', 'npx vite-node scripts/audit/test-c1c19-contract.ts']);
if (!process.argv.includes('--contract-only')) {
  const head = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
  if (git('diff', '--name-only') || git('diff', '--cached', '--name-only')) throw new Error('C1C19 full verification requires clean tracked contract commit');
  mkdirSync('tmp/c1c19-verification', { recursive: true });
  rmSync('tmp/c1c19-verification/receipt.json', { force: true });
  const bundledPython = join(process.env.USERPROFILE ?? '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  console.log('Verifying fresh extraction of all official PDF pages');
  run(process.env.C1C19_PYTHON ?? (existsSync(bundledPython) ? bundledPython : 'python'), ['scripts/audit/extract-c1c19-rulebook.py', '--verify']);
  const volatile = ['docs/data/core-campaign/official-source-manifest.json', 'docs/data/core-campaign/source-readiness.json'];
  const snapshots = volatile.map(path => [path, readFileSync(path)] as const);
  const outputHashes: Record<string, string> = {};
  try {
    for (const command of C1C17_VERIFICATION_COMMANDS) {
      console.log('Running ' + command);
      const output = run(shell, ['/d', '/s', '/c', command === 'test' ? 'npm test' : 'npm run ' + command]);
      writeFileSync(`tmp/c1c19-verification/${command.replace(/:/g, '-')}.log`, output);
      outputHashes[command] = sha(output);
      console.log('Passed ' + command);
    }
  } finally { for (const [path, bytes] of snapshots) writeFileSync(path, bytes); }
  verifyContractGate();
  if (git('rev-parse', 'HEAD') !== head || git('rev-parse', 'HEAD^{tree}') !== tree || git('diff', '--name-only') || git('diff', '--cached', '--name-only')) {
    throw new Error('C1C19 commit/tracked tree changed during full verification');
  }
  writeFileSync('tmp/c1c19-verification/receipt.json', JSON.stringify({ status: 'CONTRACT_AND_REGRESSIONS_VERIFIED', head, tree,
    commands: C1C17_VERIFICATION_COMMANDS, outputHashes, verdict }, null, 2) + '\n');
}
console.log(verdict);
