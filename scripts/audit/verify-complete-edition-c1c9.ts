import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { trinketReadinessInvariantErrors } from '../../src/audit/trinket-readiness-invariants';
import { CAMOUFLAGE_CLOAK_ID } from '../../src/audit/production-proof-registry';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from '../../src/audit/trinket-effect-consumer-coverage';

const root = process.cwd();
const baselineHead = '55fed0d9bcf4c47181c0fa164511ec15d5d70f6c';
const dataDir = resolve(root, 'docs/data/complete-edition');
const shell = process.env.ComSpec ?? 'cmd.exe';
const allowed = new Set([
  'docs/data/complete-edition/c1c9-condition-duration-contract.json',
  'docs/data/complete-edition/c1c9-level2-trinket-capability-matrix.json',
  'docs/data/complete-edition/c1c9-condition-runtime-evidence.json',
  'docs/reports/complete-edition/c1c9-condition-runtime-report.md',
]);
interface Result { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000): Result {
  const value = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false, timeout,
    maxBuffer: 100 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  return { command: [command, ...args].join(' '), exitCode: value.status ?? 1, stdout: value.stdout ?? '',
    stderr: `${value.stderr ?? ''}${value.error ? `\n${value.error.message}` : ''}` };
}
function pass(label: string, result: Result) { if (result.exitCode !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout.slice(-12000)}`); }
function git(...args: string[]) { const value = run('git', args); pass(`git ${args.join(' ')}`, value); return value.stdout.trim(); }
const sha256 = (contents: string | Buffer) => createHash('sha256').update(contents).digest('hex');

if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) throw new Error('C1C-9 verifier requires a clean tracked tree');
const evidence = JSON.parse(readFileSync(resolve(dataDir, 'c1c9-condition-runtime-evidence.json'), 'utf8')) as any;
if (evidence.schemaVersion !== 1 || evidence.baselineHead !== baselineHead || evidence.verificationCommand !== 'npm run verify:complete-edition-c1c9') throw new Error('C1C-9 evidence contract stale');
pass('implementation commit', run('git', ['cat-file', '-e', `${evidence.verifiedImplementationHead}^{commit}`]));
if (git('rev-parse', `${evidence.verifiedImplementationHead}^{tree}`) !== evidence.verifiedImplementationTree) throw new Error('implementation tree mismatch');
pass('anchor ancestry', run('git', ['merge-base', '--is-ancestor', evidence.verifiedImplementationHead, 'HEAD']));
const post = git('diff', '--name-only', `${evidence.verifiedImplementationHead}..HEAD`).split(/\r?\n/).filter(Boolean);
const forbidden = post.filter((path) => !allowed.has(path.replace(/\\/g, '/')));
if (forbidden.length) throw new Error(`implementation changed after anchor: ${forbidden.join(', ')}`);
const historical = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8)-/.test(path));
for (const path of historical) {
  pass(`historical freeze ${path}`, run('git', ['diff', '--quiet', baselineHead, '--', path]));
  if (evidence.historicalEvidenceHashes[path] !== sha256(execFileAt(baselineHead, path))) throw new Error(`historical hash mismatch: ${path}`);
}
function execFileAt(ref: string, path: string): Buffer {
  const value = spawnSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'buffer', shell: false });
  if (value.status !== 0) throw new Error(`cannot read ${ref}:${path}`);
  return value.stdout;
}
const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[CAMOUFLAGE_CLOAK_ID];
if (adapter.adapterId !== 'camouflage-cloak-condition-runtime-v2') throw new Error('Camouflage adapter is stale');
if (!TRINKET_EFFECT_CONSUMER_COVERAGE['apply-condition-stack'].wired) throw new Error('condition consumer is not wired');
const cloak = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CAMOUFLAGE_CLOAK_ID)!;
if (!cloak.productionReady || !cloak.runtimeSemanticComplete || cloak.trinketSemanticObligations?.some((side) => side.implementationStatus !== 'IMPLEMENTED')) throw new Error('Camouflage was not evaluator-promoted');
if (LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount !== 3 || LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw) throw new Error('Level 2 readiness invariant failed');
if (trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES).length) throw new Error('readiness invariant failure');

const focused = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/game-engine/c1c9-condition-duration.test.ts', 'src/audit/c1c9-condition-semantics.test.ts',
  'src/game-engine/c1c8-incoming-attack.test.ts', 'src/audit/c1c8-incoming-semantics.test.ts',
  'src/game-engine/c1c7-fortunate-armlet.test.ts', 'src/game-engine/c1c6-dark-solar-bracer.test.ts',
  'src/audit/c1c5r2-trinket-payload-mutations.test.ts', 'src/audit/production-proof-verification.test.ts']);
pass('C1C-9 and historical focused proofs', focused);
const commands: Result[] = [focused];
for (const script of ['test:e2e:community-content-c1c9', 'test:e2e:community-content-c1c8', 'test:e2e:community-content-c1c7', 'test:e2e:community-content-c1c6', 'test:e2e:community-content-c1c5']) {
  const result = run(shell, ['/d', '/s', '/c', `npm run ${script}`]); pass(script, result); commands.push(result);
}
const volatile = ['docs/data/core-campaign/official-source-manifest.json', 'docs/data/core-campaign/source-readiness.json'];
const snapshots = new Map(volatile.map((path) => [path, readFileSync(resolve(root, path))]));
const regression = run(shell, ['/d', '/s', '/c', 'npm test']);
for (const [path, contents] of snapshots) writeFileSync(resolve(root, path), contents);
pass('full regression', regression); commands.push(regression);
for (const script of ['typecheck', 'build']) {
  const result = run(shell, ['/d', '/s', '/c', `npm run ${script}`]); pass(script, result); commands.push(result);
}
const matrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c9-level2-trinket-capability-matrix.json'), 'utf8')) as any;
if (matrix.schemaVersion !== 1 || matrix.cards.length !== 11 || matrix.verifiedImplementationHead !== evidence.verifiedImplementationHead) throw new Error('matrix binding stale');
if (!evidence.sourceContractExact || !evidence.conditionConsumerWired || !evidence.camouflagePositiveComplete || !evidence.camouflageNegativeComplete || !evidence.camouflageProductionReady || evidence.level2ReadyAfter !== 3 || evidence.completeForRandomDraw || evidence.terminalVerdict !== 'C1C9-CONDITION-DURATION-CAMOUFLAGE-CLOSURE-ACCEPTED') throw new Error('evidence truth stale');
if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) throw new Error('verifier left tracked changes');
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, verifiedImplementationHead: evidence.verifiedImplementationHead,
  level2ReadyCount: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  commands: commands.map((entry) => ({ command: entry.command, exitCode: entry.exitCode })) }, null, 2));
