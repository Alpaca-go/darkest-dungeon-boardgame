import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { verifyContractGate } from './c1c20-contract-gate';
import { git, sha, verdict } from './c1c20-contract';
import { C1C17_VERIFICATION_COMMANDS } from './c1c17-implementation-gate';

verifyContractGate();
const shell = process.env.ComSpec ?? 'cmd.exe';
const reloadRetries: Array<{ command: string; reason: string; failedOutputSha256: string; failedLog: string }> = [];
const run = (command: string, retry = false): string => {
  const result = spawnSync(shell, ['/d', '/s', '/c', command], { encoding: 'utf8', shell: false,
    maxBuffer: 100 * 1024 * 1024, timeout: 900000, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) {
    const oneReloadTimeout = command.startsWith('npm run test:e2e:') && !retry
      && /Error: page\.reload: Test timeout of 60000ms exceeded\./.test(output)
      && /(?:^|\n)\s*1 failed\s*(?:\r?\n|$)/.test(output)
      && !/Error: expect\(/.test(output);
    if (oneReloadTimeout) {
      const failedLog = `tmp/c1c20-verification/${command.replace(/[^a-z0-9-]/gi, '-')}-reload-timeout-attempt-1.log`;
      writeFileSync(failedLog, output);
      reloadRetries.push({ command, reason: 'Single page.reload infrastructure timeout before fixture import; one retry only', failedOutputSha256: sha(output), failedLog });
      console.log('Recorded page.reload timeout; retrying once: ' + command);
      return run(command, true);
    }
    throw new Error(`${command} failed:\n${output.slice(-16000)}\n${result.error ?? ''}`);
  }
  return output;
};
console.log('Running C1C20 terminal graph and adversarial mutations');
run('npx vitest run src/audit/c1c20-core-terminal-blockers.test.ts');
if (!process.argv.includes('--contract-only')) {
  const head = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
  if (git('diff', '--name-only') || git('diff', '--cached', '--name-only')) throw new Error('Full verification requires clean tracked contract commit');
  mkdirSync('tmp/c1c20-verification', { recursive: true });
  rmSync('tmp/c1c20-verification/receipt.json', { force: true });
  const volatile = ['docs/data/core-campaign/official-source-manifest.json', 'docs/data/core-campaign/source-readiness.json'];
  const snapshots = volatile.map(path => [path, readFileSync(path)] as const);
  const outputHashes: Record<string, string> = {};
  try {
    for (const command of C1C17_VERIFICATION_COMMANDS) {
      console.log('Running ' + command);
      const output = run(command === 'test' ? 'npm test' : 'npm run ' + command);
      writeFileSync(`tmp/c1c20-verification/${command.replace(/:/g, '-')}.log`, output);
      outputHashes[command] = sha(output);
      console.log('Passed ' + command);
    }
  } finally { for (const [path, bytes] of snapshots) writeFileSync(path, bytes); }
  verifyContractGate();
  if (git('rev-parse', 'HEAD') !== head || git('rev-parse', 'HEAD^{tree}') !== tree || git('diff', '--name-only') || git('diff', '--cached', '--name-only')) throw new Error('Commit/tracked tree changed during verification');
  writeFileSync('tmp/c1c20-verification/receipt.json', JSON.stringify({ status: 'CONTRACT_AND_REGRESSIONS_VERIFIED', head, tree,
    priorContractGates: ['C1C18_LIVE_SOURCE_SEMANTIC_GATE', 'C1C19_LIVE_SOURCE_SEMANTIC_GATE'],
    commands: C1C17_VERIFICATION_COMMANDS, outputHashes, reloadRetries, verdict }, null, 2) + '\n');
}
console.log(verdict);
