import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { COMMUNITY_TRINKET_CAPABILITIES } from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { trinketReadinessInvariantErrors } from '../../src/audit/trinket-readiness-invariants';
import { CAMOUFLAGE_CLOAK_ID, PROTECTIVE_PADLOCK_ID, PRODUCTION_PROOF_REGISTRY } from '../../src/audit/production-proof-registry';
import { TRINKET_MODIFIER_CONSUMER_COVERAGE } from '../../src/audit/trinket-modifier-consumer-coverage';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from '../../src/audit/trinket-effect-consumer-coverage';
import { WIRED_WINDOWS } from '../../src/game-engine/trinkets/trinket-opportunities';

const root = process.cwd();
const baselineHead = '007291e4cfdf666c7cdf801db7db8d3ee14d0072';
const dataDir = resolve(root, 'docs/data/complete-edition');
const shell = process.env.ComSpec ?? 'cmd.exe';
const allowed = new Set(['docs/data/complete-edition/c1c8-level2-trinket-capability-matrix.json',
  'docs/data/complete-edition/c1c8-incoming-attack-runtime-evidence.json',
  'docs/reports/complete-edition/c1c8-incoming-attack-runtime-report.md']);
interface Result { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000): Result {
  const value = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false, timeout,
    maxBuffer: 100 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  return { command: [command, ...args].join(' '), exitCode: value.status ?? 1, stdout: value.stdout ?? '',
    stderr: `${value.stderr ?? ''}${value.error ? `\n${value.error.message}` : ''}` };
}
function pass(label: string, result: Result) { if (result.exitCode !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout.slice(-12000)}`); }
function git(...args: string[]) { const value = run('git', args); pass(`git ${args.join(' ')}`, value); return value.stdout.trim(); }
if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) throw new Error('C1C-8 verifier requires a clean tracked tree');
const evidence = JSON.parse(readFileSync(resolve(dataDir, 'c1c8-incoming-attack-runtime-evidence.json'), 'utf8')) as any;
if (evidence.schemaVersion !== 4 || evidence.baselineHead !== baselineHead || evidence.verificationCommand !== 'npm run verify:complete-edition-c1c8') throw new Error('C1C-8 evidence contract stale');
pass('implementation commit', run('git', ['cat-file', '-e', `${evidence.verifiedImplementationHead}^{commit}`]));
if (git('rev-parse', `${evidence.verifiedImplementationHead}^{tree}`) !== evidence.verifiedImplementationTree) throw new Error('implementation tree mismatch');
pass('anchor ancestry', run('git', ['merge-base', '--is-ancestor', evidence.verifiedImplementationHead, 'HEAD']));
const post = git('diff', '--name-only', `${evidence.verifiedImplementationHead}..HEAD`).split(/\r?\n/).filter(Boolean);
const forbidden = post.filter((path) => !allowed.has(path.replace(/\\/g, '/')));
if (forbidden.length) throw new Error(`implementation changed after anchor: ${forbidden.join(', ')}`);
const historical = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7)-/.test(path));
for (const path of historical) pass(`historical freeze ${path}`, run('git', ['diff', '--quiet', baselineHead, '--', path]));
if (!(WIRED_WINDOWS as readonly string[]).includes('before-incoming-hit-resolution') || !(WIRED_WINDOWS as readonly string[]).includes('before-incoming-damage-applied')) throw new Error('incoming windows not wired');
if (!TRINKET_MODIFIER_CONSUMER_COVERAGE.dodge.wired || !TRINKET_EFFECT_CONSUMER_COVERAGE['scale-incoming-damage'].wired) throw new Error('C1C-8 consumers not wired');
if (TRINKET_EFFECT_CONSUMER_COVERAGE['convert-incoming-hit-to-critical'].wired || TRINKET_EFFECT_CONSUMER_COVERAGE['apply-condition-stack'].wired) throw new Error('unsupported consumers false-green');
for (const id of [PROTECTIVE_PADLOCK_ID, CAMOUFLAGE_CLOAK_ID]) {
  const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === id)!;
  const positive = capability.trinketSemanticObligations?.find((entry) => entry.side === 'positive')!;
  if (capability.productionReady || positive.implementationStatus !== 'IMPLEMENTED' || !positive.runtimeSliceSemanticComplete) throw new Error(`${id} slice truth regressed`);
}
for (const id of ['C1C8-PROTECTIVE-POSITIVE-RUNTIME', 'C1C8-PROTECTIVE-POSITIVE-SAVE', 'C1C8-PROTECTIVE-POSITIVE-SELECTOR', 'C1C8-E2E-PROTECTIVE-POSITIVE', 'C1C8-CAMOUFLAGE-POSITIVE-RUNTIME', 'C1C8-CAMOUFLAGE-POSITIVE-SAVE', 'C1C8-CAMOUFLAGE-POSITIVE-SELECTOR', 'C1C8-E2E-CAMOUFLAGE-POSITIVE']) {
  if (PRODUCTION_PROOF_REGISTRY[id]?.scope !== 'primitive') throw new Error(`${id} is not primitive-scoped`);
}
if (trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES).length) throw new Error('readiness invariant failure');
if (LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount !== 2 || LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw) throw new Error('Level 2 readiness false-green');
const proofTests = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/game-engine/c1c8-incoming-attack.test.ts', 'src/audit/c1c8-incoming-semantics.test.ts',
  'src/game-engine/c1c7-fortunate-armlet.test.ts', 'src/audit/c1c7-voluntary-consumer-semantics.test.ts',
  'src/game-engine/c1c6-dark-solar-bracer.test.ts', 'src/audit/c1c5r2-trinket-payload-mutations.test.ts',
  'src/audit/c1c5-level2-trinket-deck.test.ts', 'src/audit/production-proof-verification.test.ts',
  'src/game-engine/c1br-production-proof.test.ts', 'src/game-engine/c1c5-chirurgeons-charm.test.ts']);
pass('C1C-8 and historical runtime proofs', proofTests);
const commands: Result[] = [proofTests];
for (const script of ['test:e2e:community-content-c1c8', 'test:e2e:community-content-c1c7', 'test:e2e:community-content-c1c6', 'test:e2e:community-content-c1c5', 'test:e2e:community-content-c1br']) {
  const result = run(shell, ['/d', '/s', '/c', `npm run ${script}`]); pass(script, result); commands.push(result);
}
const volatile = ['docs/data/core-campaign/official-source-manifest.json', 'docs/data/core-campaign/source-readiness.json'];
const snapshots = new Map(volatile.map((path) => [path, readFileSync(resolve(root, path))]));
const regression = run(shell, ['/d', '/s', '/c', 'npm test']);
for (const [path, contents] of snapshots) writeFileSync(resolve(root, path), contents);
pass('full regression', regression); commands.push(regression);
for (const script of ['typecheck', 'build']) { const result = run(shell, ['/d', '/s', '/c', `npm run ${script}`]); pass(script, result); commands.push(result); }
const matrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c8-level2-trinket-capability-matrix.json'), 'utf8')) as any;
if (matrix.schemaVersion !== 4 || matrix.cards.length !== 11 || matrix.verifiedImplementationHead !== evidence.verifiedImplementationHead) throw new Error('matrix binding stale');
if (!evidence.protectivePositiveRuntimeComplete || !evidence.camouflagePositiveRuntimeComplete || evidence.protectiveProductionReady || evidence.camouflageProductionReady || evidence.level2ReadyBefore !== 2 || evidence.level2ReadyAfter !== 2 || evidence.completeForRandomDraw || evidence.terminalVerdict !== 'C1C8-INCOMING-ATTACK-PROTECTIVE-AND-CAMOUFLAGE-SLICES-ACCEPTED-CARDS-NOT-PROMOTED') throw new Error('evidence truth stale');
if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) throw new Error('verifier left tracked changes');
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, verifiedImplementationHead: evidence.verifiedImplementationHead,
  level2ReadyCount: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  commands: commands.map((entry) => ({ command: entry.command, exitCode: entry.exitCode })) }, null, 2));
