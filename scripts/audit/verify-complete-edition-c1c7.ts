import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_RUNTIME_QUESTS, COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { trinketReadinessInvariantErrors } from '../../src/audit/trinket-readiness-invariants';
import { BOOK_OF_RELAXATION_ID, CHIRURGEONS_CHARM_ID, FORTUNATE_ARMLET_ID, PRODUCTION_PROOF_REGISTRY } from '../../src/audit/production-proof-registry';
import { TRINKET_MODIFIER_CONSUMER_COVERAGE } from '../../src/audit/trinket-modifier-consumer-coverage';
import { WIRED_WINDOWS } from '../../src/game-engine/trinkets/trinket-opportunities';

const root = process.cwd();
const baselineHead = '373507c4a3e297371c0a989cf4ec570fb67e596b';
const dataDir = resolve(root, 'docs/data/complete-edition');
const commandShell = process.env.ComSpec ?? 'cmd.exe';
const allowedPostVerificationFiles = new Set([
  'docs/data/complete-edition/c1c7-level2-trinket-capability-matrix.json',
  'docs/data/complete-edition/c1c7-voluntary-declaration-fortunate-evidence.json',
  'docs/reports/complete-edition/c1c7-voluntary-declaration-fortunate-report.md',
]);
const volatileRegressionArtifacts = ['docs/data/core-campaign/official-source-manifest.json', 'docs/data/core-campaign/source-readiness.json'] as const;
interface Result { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000): Result {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false, timeout,
    maxBuffer: 100 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  return { command: [command, ...args].join(' '), exitCode: result.status ?? 1, stdout: result.stdout ?? '',
    stderr: `${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}` };
}
function requirePass(label: string, result: Result) { if (result.exitCode !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout.slice(-10000)}`); }
function git(...args: string[]) { const result = run('git', args); requirePass(`git ${args.join(' ')}`, result); return result.stdout.trim(); }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) throw new Error('C1C-7 verifier requires a clean tracked working tree');
const evidence = JSON.parse(readFileSync(resolve(dataDir, 'c1c7-voluntary-declaration-fortunate-evidence.json'), 'utf8')) as any;
if (evidence.schemaVersion !== 3 || evidence.baselineHead !== baselineHead || evidence.verificationCommand !== 'npm run verify:complete-edition-c1c7' || !evidence.verificationRequired) throw new Error('C1C-7 evidence contract is stale');
requirePass('Evidence implementation commit existence', run('git', ['cat-file', '-e', `${evidence.verifiedImplementationHead}^{commit}`]));
if (git('rev-parse', `${evidence.verifiedImplementationHead}^{tree}`) !== evidence.verifiedImplementationTree) throw new Error('Evidence implementation tree mismatch');
if (git('show', '-s', '--format=%cI', evidence.verifiedImplementationHead) !== evidence.verifiedImplementationCommittedAt) throw new Error('Evidence timestamp mismatch');
requirePass('Evidence anchor ancestry', run('git', ['merge-base', '--is-ancestor', evidence.verifiedImplementationHead, 'HEAD']));
const postAnchorFiles = git('diff', '--name-only', `${evidence.verifiedImplementationHead}..HEAD`).split(/\r?\n/).filter(Boolean);
const forbidden = postAnchorFiles.filter((path) => !allowedPostVerificationFiles.has(path.replace(/\\/g, '/')));
if (forbidden.length) throw new Error(`Implementation changed after evidence anchor: ${forbidden.join(', ')}`);

const historical = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6)-/.test(path));
for (const path of historical) {
  requirePass(`Historical freeze ${path}`, run('git', ['diff', '--quiet', baselineHead, '--', path]));
  if (evidence.historicalEvidenceHashes[path] !== hash(run('git', ['show', `${baselineHead}:${path}`]).stdout)) throw new Error(`Historical hash changed: ${path}`);
}
if (Object.keys(evidence.historicalEvidenceHashes).length !== historical.length) throw new Error('Historical hash set is not exact');

const contract = JSON.parse(readFileSync(resolve(dataDir, 'c1c7-voluntary-declaration-timing-contract.json'), 'utf8')) as any;
if (contract.outcome !== 'SOURCE_EXHAUSTED_STILL_UNRESOLVED' || contract.scopeComplete || contract.runtimeDecision.manualDeclarationWindowWired
  || Object.values(contract.scope).some((value) => value !== 'SOURCE_UNRESOLVED')) throw new Error('Voluntary source contract guessed a timing scope');
if ((WIRED_WINDOWS as readonly string[]).includes('voluntary-declaration')) throw new Error('Unproven voluntary runtime window is wired');
const trinketTypes = readFileSync(resolve(root, 'src/types/trinkets.ts'), 'utf8');
if (trinketTypes.includes("| 'voluntary-declaration'")) throw new Error('Unproven voluntary window was added to the type model');

if (LEVEL_2_TRINKET_CENSUS.length !== 11) throw new Error('Level 2 census changed');
if (!TRINKET_MODIFIER_CONSUMER_COVERAGE.accuracy.wired || !TRINKET_MODIFIER_CONSUMER_COVERAGE.crit.wired
  || !TRINKET_MODIFIER_CONSUMER_COVERAGE.damage.wired || !TRINKET_MODIFIER_CONSUMER_COVERAGE.healing.wired
  || TRINKET_MODIFIER_CONSUMER_COVERAGE.dodge.wired) throw new Error('Modifier consumer registry is stale');
const fortunate = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === FORTUNATE_ARMLET_ID)!;
const fortunatePositive = fortunate.trinketSemanticObligations?.find((entry) => entry.side === 'positive')!;
const fortunateNegative = fortunate.trinketSemanticObligations?.find((entry) => entry.side === 'negative')!;
if (fortunate.productionReady || fortunate.runtimeSemanticComplete || fortunatePositive.implementationStatus !== 'IMPLEMENTED'
  || !fortunatePositive.runtimeSliceSemanticComplete || !fortunatePositive.modifierConsumerMatch
  || fortunateNegative.blockerCode !== 'TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED'
  || fortunateNegative.sourceTimingScopeStatus !== 'SOURCE_UNRESOLVED') throw new Error('Fortunate Outcome B truth regressed');
const book = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === BOOK_OF_RELAXATION_ID)!;
const bookNegative = book.trinketSemanticObligations?.find((entry) => entry.side === 'negative')!;
if (book.productionReady || bookNegative.modifierConsumerMatch || bookNegative.blockerCode !== 'TRINKET_MODIFIER_CONSUMER_MISSING'
  || JSON.stringify(bookNegative.missingModifierConsumers) !== '["dodge"]') throw new Error('Book dodge false-green returned');
for (const id of ['C1C7-FORTUNATE-POSITIVE-RUNTIME', 'C1C7-FORTUNATE-POSITIVE-SAVE-REPLAY', 'C1C7-FORTUNATE-POSITIVE-SELECTOR', 'C1C7-E2E-FORTUNATE-POSITIVE']) {
  const proof = PRODUCTION_PROOF_REGISTRY[id];
  if (proof?.scope !== 'primitive' || proof.primitiveId !== 'FORTUNATE_POST_ROLL_ATTACK_SLICE') throw new Error(`${id} is not primitive-scoped`);
}
if (trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES).length) throw new Error('Trinket readiness invariants failed');
if (LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount !== 2 || LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw) throw new Error('Level 2 readiness changed');
const family = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === 'community-quest-warrens-lvl1-family-trinkets')!;
if (family.productionReady || COMMUNITY_RUNTIME_QUESTS.some((entry) => entry.id === family.definitionId)) throw new Error('Family gate regressed');
const chirurgeons = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID)!;
if (chirurgeons.productionReady || chirurgeons.runtimeSemanticComplete) throw new Error('Chirurgeon partial status regressed');
const rest = JSON.parse(readFileSync(resolve(dataDir, 'c1c4-rest-semantic-source-closure-evidence.json'), 'utf8')) as any;
if (rest.insufficientRecoveryCapacityAfter !== 'SOURCE_UNRESOLVED') throw new Error('Rest freeze changed');

const proofTests = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/game-engine/c1c7-fortunate-armlet.test.ts', 'src/audit/c1c7-voluntary-consumer-semantics.test.ts',
  'src/game-engine/c1c6-dark-solar-bracer.test.ts', 'src/audit/c1c5r2-trinket-payload-mutations.test.ts',
  'src/audit/c1c5-level2-trinket-deck.test.ts', 'src/audit/production-proof-verification.test.ts',
  'src/game-engine/c1br-production-proof.test.ts', 'src/game-engine/c1c5-chirurgeons-charm.test.ts']);
requirePass('C1C-7 and historical runtime proofs', proofTests);
const c1c7E2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1c7']); requirePass('C1C-7 production UI E2E', c1c7E2e);
const c1c6E2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1c6']); requirePass('C1C-6 E2E regression', c1c6E2e);
const c1brE2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1br']); requirePass('C1BR E2E regression', c1brE2e);
const c1c5E2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1c5']); requirePass('C1C5 E2E regression', c1c5E2e);
const snapshots = new Map(volatileRegressionArtifacts.map((path) => [path, readFileSync(resolve(root, path))]));
const regression = run(commandShell, ['/d', '/s', '/c', 'npm test']);
for (const [path, contents] of snapshots) writeFileSync(resolve(root, path), contents);
requirePass('Full regression', regression);
const typecheck = run(commandShell, ['/d', '/s', '/c', 'npm run typecheck']); requirePass('Typecheck', typecheck);
const build = run(commandShell, ['/d', '/s', '/c', 'npm run build']); requirePass('Build', build);

const matrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c7-level2-trinket-capability-matrix.json'), 'utf8')) as any;
if (matrix.schemaVersion !== 3 || matrix.cards.length !== 11 || matrix.verifiedImplementationHead !== evidence.verifiedImplementationHead
  || matrix.verifiedImplementationTree !== evidence.verifiedImplementationTree) throw new Error('C1C-7 matrix binding is stale');
if (evidence.voluntaryDeclarationSourceOutcome !== contract.outcome || evidence.voluntaryDeclarationScopeComplete
  || evidence.voluntaryDeclarationRuntimeWired || !evidence.fortunatePositiveRuntimeComplete || evidence.fortunateNegativeRuntimeComplete
  || evidence.fortunateProductionReady || evidence.bookRelaxationProductionReady
  || JSON.stringify(evidence.bookRelaxationMissingConsumers) !== '["dodge"]'
  || evidence.level2ReadyBefore !== 2 || evidence.level2ReadyAfter !== 2 || evidence.level2CompleteForRandomDraw
  || evidence.familyProductionReady || evidence.familySelectorReachable || evidence.chirurgeonsProductionReady
  || evidence.terminalVerdict !== 'C1C7-VOLUNTARY-DECLARATION-SOURCE-UNRESOLVED-FORTUNATE-NOT-PROMOTED') throw new Error('C1C-7 evidence is stale or false');
if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) throw new Error('C1C-7 verifier left tracked changes');
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, verifiedImplementationHead: evidence.verifiedImplementationHead,
  verifiedImplementationTree: evidence.verifiedImplementationTree, level2ReadyCount: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  commands: [proofTests, c1c7E2e, c1c6E2e, c1brE2e, c1c5E2e, regression, typecheck, build]
    .map((entry) => ({ command: entry.command, exitCode: entry.exitCode })) }, null, 2));
