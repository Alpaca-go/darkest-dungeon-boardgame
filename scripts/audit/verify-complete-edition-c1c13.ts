import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { trinketReadinessInvariantErrors } from '../../src/audit/trinket-readiness-invariants';
import { BOOK_OF_HOLINESS_ID } from '../../src/audit/production-proof-registry';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from '../../src/audit/trinket-effect-consumer-coverage';

const root = process.cwd(); const baselineHead = '350c7558f4831f238c8d4ab195ee90be528310d1';
const dataDir = resolve(root, 'docs/data/complete-edition'); const shell = process.env.ComSpec ?? 'cmd.exe';
const allowed = new Set([
  'docs/data/complete-edition/c1c13-book-holiness-runtime-evidence.json',
  'docs/data/complete-edition/c1c13-level2-trinket-capability-matrix.json',
  'docs/reports/complete-edition/c1c13-book-holiness-runtime-report.md',
]);
interface Result { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000): Result {
  const value = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false, timeout,
    maxBuffer: 100 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  return { command: [command, ...args].join(' '), exitCode: value.status ?? 1, stdout: value.stdout ?? '',
    stderr: `${value.stderr ?? ''}${value.error ? `\n${value.error.message}` : ''}` };
}
function pass(label: string, result: Result) { if (result.exitCode !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout.slice(-16000)}`); }
function git(...args: string[]) { const value = run('git', args); pass(`git ${args.join(' ')}`, value); return value.stdout.trim(); }
const sha256 = (contents: Buffer) => createHash('sha256').update(contents).digest('hex');
const show = (ref: string, path: string) => { const value = spawnSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'buffer' }); if (value.status !== 0) throw new Error(`cannot read ${ref}:${path}`); return value.stdout; };

if (run('git', ['diff', '--quiet']).exitCode || run('git', ['diff', '--cached', '--quiet']).exitCode) throw new Error('C1C-13 verifier requires a clean tracked tree');
const evidence = JSON.parse(readFileSync(resolve(dataDir, 'c1c13-book-holiness-runtime-evidence.json'), 'utf8')) as any;
const contract = JSON.parse(readFileSync(resolve(dataDir, 'c1c13-book-holiness-critical-contract.json'), 'utf8')) as any;
if (evidence.baselineHead !== baselineHead || evidence.verificationCommand !== 'npm run verify:complete-edition-c1c13') throw new Error('evidence contract stale');
pass('implementation commit', run('git', ['cat-file', '-e', `${evidence.verifiedImplementationHead}^{commit}`]));
if (git('rev-parse', `${evidence.verifiedImplementationHead}^{tree}`) !== evidence.verifiedImplementationTree) throw new Error('implementation tree mismatch');
pass('anchor ancestry', run('git', ['merge-base', '--is-ancestor', evidence.verifiedImplementationHead, 'HEAD']));
const forbidden = git('diff', '--name-only', `${evidence.verifiedImplementationHead}..HEAD`).split(/\r?\n/).filter(Boolean)
  .filter((path) => !allowed.has(path.replace(/\\/g, '/')));
if (forbidden.length) throw new Error(`implementation changed after anchor: ${forbidden.join(', ')}`);
const historical = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9|10|11|12)-/.test(path));
for (const path of historical) {
  pass(`historical freeze ${path}`, run('git', ['diff', '--quiet', baselineHead, '--', path]));
  if (evidence.historicalEvidenceHashes[path] !== sha256(show(baselineHead, path))) throw new Error(`historical hash mismatch: ${path}`);
}
if (contract.status !== 'SOURCE_CLOSED' || Object.values(contract.closure).some((value) => value !== true)) throw new Error('source contract not closed');
if (contract.semantics.alreadyCriticalPolicy !== 'NOT_APPLICABLE' || contract.semantics.rngPolicy !== 'NO_REROLL_OR_RESELECTION') throw new Error('source policy drifted');
const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[BOOK_OF_HOLINESS_ID];
if (adapter.adapterId !== 'book-of-holiness-critical-negative-v1') throw new Error('adapter drifted');
if (adapter.definition.positiveSide.useWindows.length || adapter.definition.positiveSide.effects.length) throw new Error('positive side must remain fail-closed');
const consumer = TRINKET_EFFECT_CONSUMER_COVERAGE['convert-incoming-hit-to-critical'];
if (!consumer.wired || consumer.consumerPrimitive !== 'INCOMING_CRITICAL_CONVERSION_CONSUMER') throw new Error('critical consumer not wired');
const book = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === BOOK_OF_HOLINESS_ID)!;
const negative = book.trinketSemanticObligations?.find((side) => side.side === 'negative');
const positive = book.trinketSemanticObligations?.find((side) => side.side === 'positive');
if (negative?.implementationStatus !== 'IMPLEMENTED' || !negative.runtimeSliceSemanticComplete) throw new Error('negative slice not implemented');
if (positive?.implementationStatus === 'IMPLEMENTED' || book.productionReady) throw new Error('whole Book incorrectly promoted');
if (LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount !== 4 || LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw) throw new Error('Level 2 invariant failed');
if (trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES).length) throw new Error('readiness invariant failure');

const commands: Result[] = [];
const focused = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', '--no-file-parallelism',
  'src/game-engine/c1c13-book-holiness.test.ts', 'src/audit/c1c13-book-holiness-semantics.test.ts',
  'src/game-engine/c1c12-book-constitution.test.ts', 'src/audit/c1c12-book-constitution-semantics.test.ts',
  'src/game-engine/c1c11-bloodthirst-ring.test.ts', 'src/audit/c1c11-bloodthirst-semantics.test.ts',
  'src/game-engine/c1c10-campers-helmet.test.ts', 'src/audit/c1c10-campers-helmet-semantics.test.ts',
  'src/game-engine/c1c9-condition-duration.test.ts', 'src/audit/c1c9-condition-semantics.test.ts',
  'src/game-engine/c1c8-incoming-attack.test.ts', 'src/audit/c1c8-incoming-semantics.test.ts',
  'src/game-engine/c1c7-fortunate-armlet.test.ts', 'src/game-engine/c1c6-dark-solar-bracer.test.ts',
  'src/game-engine/c1c5-chirurgeons-charm.test.ts', 'src/audit/c1c5r-trinket-semantic-scope.test.ts',
  'src/audit/c1c5r2-trinket-payload-mutations.test.ts', 'src/audit/production-proof-verification.test.ts']);
pass('C1C-13 and historical focused proofs', focused); commands.push(focused);
for (const script of ['test:e2e:community-content-c1c13', 'test:e2e:community-content-c1c12', 'test:e2e:community-content-c1c11',
  'test:e2e:community-content-c1c10', 'test:e2e:community-content-c1c9', 'test:e2e:community-content-c1c8',
  'test:e2e:community-content-c1c7', 'test:e2e:community-content-c1c6', 'test:e2e:community-content-c1c5']) {
  const result = run(shell, ['/d', '/s', '/c', `npm run ${script}`]); pass(script, result); commands.push(result);
}
const volatile = ['docs/data/core-campaign/official-source-manifest.json', 'docs/data/core-campaign/source-readiness.json'];
const snapshots = new Map(volatile.map((path) => [path, readFileSync(resolve(root, path))]));
const regression = run(shell, ['/d', '/s', '/c', 'npm test']);
for (const [path, contents] of snapshots) writeFileSync(resolve(root, path), contents);
pass('full regression', regression); commands.push(regression);
for (const script of ['typecheck', 'build']) { const result = run(shell, ['/d', '/s', '/c', `npm run ${script}`]); pass(script, result); commands.push(result); }
const matrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c13-level2-trinket-capability-matrix.json'), 'utf8')) as any;
if (matrix.cards.length !== 11 || matrix.verifiedImplementationHead !== evidence.verifiedImplementationHead) throw new Error('matrix binding stale');
if (evidence.sourceContractStatus !== 'SOURCE_CLOSED' || !evidence.bookNegativeComplete || !evidence.bookPositiveFailClosed
  || evidence.bookProductionReady || evidence.readinessInvariantErrors.length || evidence.level2ReadyAfter !== 4
  || evidence.completeForRandomDraw || evidence.terminalVerdict !== 'C1C13-BOOK-HOLINESS-CRITICAL-CONVERSION-SLICE-ACCEPTED-CARD-NOT-PROMOTED') throw new Error('evidence truth stale');
if (run('git', ['diff', '--quiet']).exitCode || run('git', ['diff', '--cached', '--quiet']).exitCode) throw new Error('verifier left tracked changes');
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, verifiedImplementationHead: evidence.verifiedImplementationHead,
  level2ReadyCount: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  commands: commands.map((entry) => ({ command: entry.command, exitCode: entry.exitCode })) }, null, 2));
