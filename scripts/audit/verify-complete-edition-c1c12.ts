import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { BOOK_OF_CONSTITUTION_ID } from '../../src/audit/production-proof-registry';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from '../../src/audit/trinket-effect-consumer-coverage';

const root = process.cwd(); const baselineHead = '5abd51df2ae2a229e090b9bf8d9c08a1d96d0be6';
const dataDir = resolve(root, 'docs/data/complete-edition'); const shell = process.env.ComSpec ?? 'cmd.exe';
const allowed = new Set([
  'docs/data/complete-edition/c1c12-book-constitution-contract.json',
  'docs/data/complete-edition/c1c12-disease-acquisition-runtime-surface.json',
  'docs/data/complete-edition/c1c12-book-constitution-runtime-evidence.json',
  'docs/data/complete-edition/c1c12-level2-trinket-capability-matrix.json',
  'docs/reports/complete-edition/c1c12-book-constitution-runtime-report.md',
]);
interface Result { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000): Result {
  const value = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false, timeout, maxBuffer: 100 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  return { command: [command, ...args].join(' '), exitCode: value.status ?? 1, stdout: value.stdout ?? '', stderr: `${value.stderr ?? ''}${value.error ? `\n${value.error.message}` : ''}` };
}
function pass(label: string, result: Result) { if (result.exitCode !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout.slice(-12000)}`); }
function git(...args: string[]) { const value = run('git', args); pass(`git ${args.join(' ')}`, value); return value.stdout.trim(); }
const sha256 = (contents: Buffer) => createHash('sha256').update(contents).digest('hex');
const show = (ref: string, path: string) => { const value = spawnSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'buffer' }); if (value.status !== 0) throw new Error(`cannot read ${ref}:${path}`); return value.stdout; };

if (run('git', ['diff', '--quiet']).exitCode || run('git', ['diff', '--cached', '--quiet']).exitCode) throw new Error('C1C-12 verifier requires a clean tracked tree');
const evidence = JSON.parse(readFileSync(resolve(dataDir, 'c1c12-book-constitution-runtime-evidence.json'), 'utf8')) as any;
if (evidence.baselineHead !== baselineHead || evidence.verificationCommand !== 'npm run verify:complete-edition-c1c12') throw new Error('evidence contract stale');
pass('implementation commit', run('git', ['cat-file', '-e', `${evidence.verifiedImplementationHead}^{commit}`]));
if (git('rev-parse', `${evidence.verifiedImplementationHead}^{tree}`) !== evidence.verifiedImplementationTree) throw new Error('implementation tree mismatch');
pass('anchor ancestry', run('git', ['merge-base', '--is-ancestor', evidence.verifiedImplementationHead, 'HEAD']));
const forbidden = git('diff', '--name-only', `${evidence.verifiedImplementationHead}..HEAD`).split(/\r?\n/).filter(Boolean)
  .filter((path) => !allowed.has(path.replace(/\\/g, '/')));
if (forbidden.length) throw new Error(`implementation changed after anchor: ${forbidden.join(', ')}`);
const historical = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9|10|11)-/.test(path));
for (const path of historical) {
  pass(`historical freeze ${path}`, run('git', ['diff', '--quiet', baselineHead, '--', path]));
  if (evidence.historicalEvidenceHashes[path] !== sha256(show(baselineHead, path))) throw new Error(`historical hash mismatch: ${path}`);
}
const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[BOOK_OF_CONSTITUTION_ID];
if (adapter.adapterId !== 'book-of-constitution-disease-discard-positive-v1') throw new Error('adapter drifted');
if (!TRINKET_EFFECT_CONSUMER_COVERAGE['discard-disease'].wired) throw new Error('discard consumer not wired');
const book = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === BOOK_OF_CONSTITUTION_ID)!;
const positive = book.trinketSemanticObligations?.find((side) => side.side === 'positive');
const negative = book.trinketSemanticObligations?.find((side) => side.side === 'negative');
if (positive?.implementationStatus !== 'IMPLEMENTED' || !positive.runtimeSliceSemanticComplete) throw new Error('positive slice not implemented');
if (negative?.implementationStatus === 'IMPLEMENTED' || book.productionReady) throw new Error('whole Book incorrectly promoted');
if (LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount !== 4 || LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw) throw new Error('Level 2 invariant failed');
const productionBypasses = git('grep', '-n', 'acquireDisease(', '--', 'src', ':(exclude)**/*.test.ts').split(/\r?\n/).filter(Boolean)
  .filter((line) => !line.startsWith('src/game-engine/trinkets/disease-trinket-bridge.ts:') && !line.startsWith('src/game-engine/diseases/acquire-disease.ts:'));
if (productionBypasses.length) throw new Error(`raw Disease commit bypasses: ${productionBypasses.join(', ')}`);
const focused = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', '--no-file-parallelism',
  'src/game-engine/c1c12-book-constitution.test.ts', 'src/audit/c1c12-book-constitution-semantics.test.ts',
  'src/game-engine/c1c11-bloodthirst-ring.test.ts', 'src/audit/c1c11-bloodthirst-semantics.test.ts',
  'src/game-engine/c1c10-campers-helmet.test.ts', 'src/audit/c1c10-campers-helmet-semantics.test.ts']);
pass('focused runtime and historical proofs', focused);
const e2e = run(shell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1c12']); pass('C1C-12 production E2E', e2e);
for (const script of ['typecheck', 'build']) pass(script, run(shell, ['/d', '/s', '/c', `npm run ${script}`]));
if (!evidence.positiveSourceContractExact || !evidence.discardDiseaseConsumerWired || !evidence.bookPositiveComplete
  || !evidence.bookNegativeFailClosed || evidence.bookProductionReady || !evidence.productionDiseaseSurfacesStaged
  || evidence.level2ReadyAfter !== 4 || evidence.completeForRandomDraw
  || evidence.terminalVerdict !== 'C1C12-BOOK-CONSTITUTION-DISEASE-DISCARD-SLICE-ACCEPTED-CARD-NOT-PROMOTED') throw new Error('evidence truth stale');
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, verifiedImplementationHead: evidence.verifiedImplementationHead,
  level2ReadyCount: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount }, null, 2));
