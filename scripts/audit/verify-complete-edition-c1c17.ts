import { requireProductionRuntimeDiff, requireVerificationReceipt, C1C17_VERIFICATION_COMMANDS, type C1C17VerificationReceipt } from './c1c17-implementation-gate';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from '../../src/audit/trinket-effect-consumer-coverage';
import { WIRED_WINDOWS } from '../../src/game-engine/trinkets/wired-trinket-windows';
import { PRODUCTION_PROOF_REGISTRY } from '../../src/audit/production-proof-registry';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_1_TRINKET_CENSUS, LEVEL_1_TRINKET_DECK_COVERAGE } from '../../src/audit/level1-trinket-deck';
import { LEVEL_3_TRINKET_DECK_COVERAGE } from '../../src/audit/level3-trinket-deck';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { SURVIVAL_GUIDE_ID, LEVEL1_STANCE_ACCURACY_SPECS } from '../../src/audit/production-proof-registry';
import { trinketReadinessInvariantErrors } from '../../src/audit/trinket-readiness-invariants';

import { getTrinketPoolByLevel, runtimeContentContext } from '../../src/data/content-selector';
import { createNewCampaign } from '../../src/game-engine/campaign';
const root = process.cwd();
const baselineHead = '69aa2185d221e2935b48383e4dbbdee8ba9d0d43';
const names = ['c1c17-survival-guide-contract.json', 'c1c17-exploration-runtime-surface.json', 'c1c17-level1-trinket-capability-matrix.json', 'c1c17-level1-trinket-deck-coverage.json', 'c1c17-survival-guide-runtime-evidence.json'];
const dataDir = resolve(root, 'docs/data/complete-edition');
const read = (name: string): any => JSON.parse(readFileSync(resolve(dataDir, name), 'utf8'));
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const equal = (a: unknown, b: unknown, message: string) => check(JSON.stringify(a) === JSON.stringify(b), message);
function run(program: string, args: string[], timeout = 900_000) {
  const result = spawnSync(program, args, { cwd: root, encoding: 'utf8', timeout, shell: false,
    maxBuffer: 100 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed:\n${`${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`.slice(-16000)}`);
  return result.stdout.trim();
}
const git = (...args: string[]) => run('git', args);
const clean = () => !spawnSync('git', ['diff', '--quiet'], { cwd: root }).status
  && !spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root }).status;
check(clean(), 'C1C17 requires a clean tracked tree');
function verifyLiveImplementation(anchor: string) {
  check(anchor !== baselineHead && git('rev-parse', anchor + '^') === baselineHead, 'implementation parent must be exact C1C16 HEAD');
  const changedPaths = git('diff', '--name-only', baselineHead, anchor).split(/\r?\n/).filter(Boolean);
  const productionRuntimeChanges = requireProductionRuntimeDiff(changedPaths);
  check(!changedPaths.some((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9|10|11|12|13|14|15|16)-/.test(path) && path.startsWith('docs/')), 'historical evidence changed');
  for (const path of ['src/data/community-reference/trinkets/data.json', 'docs/data/complete-edition/trinkets/community-trinket-normalized.json', 'docs/data/complete-edition/trinkets/community-trinket-source-evidence.json']) {
    check(!changedPaths.includes(path), 'normalized source/evidence changed: ' + path);
  }
  const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[SURVIVAL_GUIDE_ID];
  check(adapter?.adapterId === 'survival-guide-exploration-result-v1', 'Survival Guide adapter missing');
  check(WIRED_WINDOWS.includes('after-dungeon-roll'), 'exploration window unwired');
  for (const type of ['ignore-result', 'replace-result']) check(TRINKET_EFFECT_CONSUMER_COVERAGE[type]?.wired, type + ' consumer unwired');
  const card = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === SURVIVAL_GUIDE_ID);
  check(card?.productionReady && card.trinketSemanticObligations?.every((side) => side.implementationStatus === 'IMPLEMENTED' && side.runtimeSliceSemanticComplete), 'Survival Guide runtime incomplete');
  for (const id of ['C1C17-SURVIVAL-GUIDE-RUNTIME', 'C1C17-SURVIVAL-GUIDE-SAVE-REPLAY', 'C1C17-SURVIVAL-GUIDE-SELECTOR', 'C1C17-E2E-SURVIVAL-GUIDE-POSITIVE', 'C1C17-E2E-SURVIVAL-GUIDE-NEGATIVE']) {
    const proof = PRODUCTION_PROOF_REGISTRY[id];
    check(proof?.status === 'active' && proof.definitionIds.includes(SURVIVAL_GUIDE_ID), 'unbound proof: ' + id);
    check(readFileSync(proof.testFile, 'utf8').length > 0, 'missing proof file: ' + id);
  }
  check(LEVEL_1_TRINKET_DECK_COVERAGE.productionReadyCount === 7, 'Level 1 readiness drift');
  equal(trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES), [], 'readiness invariant errors');
  return productionRuntimeChanges;
}
function runRuntimeVerification(anchor: string): C1C17VerificationReceipt {
  const productionRuntimeChanges = verifyLiveImplementation(anchor);
  const outputHashes: Record<string, string> = {};
  const volatile = ['docs/data/core-campaign/official-source-manifest.json', 'docs/data/core-campaign/source-readiness.json'];
  const snapshots = new Map(volatile.map((path) => [path, readFileSync(path)]));
  const shell = process.env.ComSpec ?? 'cmd.exe';
  try {
    for (const command of C1C17_VERIFICATION_COMMANDS) {
      console.log('Running ' + command);
      const output = run(shell, ['/d', '/s', '/c', command === 'test' ? 'npm test' : 'npm run ' + command]);
      outputHashes[command] = sha(Buffer.from(output));
    }
  } finally { for (const [path, bytes] of snapshots) writeFileSync(path, bytes); }
  check(clean(), 'verification left tracked changes');
  return { status: 'IMPLEMENTATION_VERIFIED', anchor, tree: git('rev-parse', anchor + '^{tree}'), productionRuntimeChanges,
    commands: [...C1C17_VERIFICATION_COMMANDS], outputHashes };
}
if (process.argv.includes('--implementation')) {
  const receipt = runRuntimeVerification(git('rev-parse', 'HEAD'));
  mkdirSync('tmp', { recursive: true });
  writeFileSync('tmp/c1c17-implementation-verification.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
  process.exit(0);
}
const evidence = read('c1c17-survival-guide-runtime-evidence.json');
const anchor = evidence.verifiedImplementationHead;
check(evidence.baselineHead === baselineHead && anchor !== baselineHead, 'baseline or anchor mismatch');
git('cat-file', '-e', `${anchor}^{commit}`);
const runtimeChanges = verifyLiveImplementation(anchor);
equal(evidence.productionRuntimeChanges, runtimeChanges, 'implementation production diff evidence drift');
requireVerificationReceipt(evidence.implementationVerification, anchor, evidence.verifiedImplementationTree);
git('merge-base', '--is-ancestor', baselineHead, anchor);
check(git('rev-parse', `${anchor}^`) === baselineHead, 'implementation must start from exact C1C16 baseline');
git('merge-base', '--is-ancestor', anchor, 'HEAD');
check(git('rev-parse', `${anchor}^{tree}`) === evidence.verifiedImplementationTree, 'implementation tree mismatch');
check(git('show', '-s', '--format=%cI', anchor) === evidence.verifiedImplementationCommittedAt, 'implementation timestamp mismatch');
const allowed = new Set([...names.map((name) => `docs/data/complete-edition/${name}`),
  'docs/reports/complete-edition/c1c17-survival-guide-runtime-report.md']);
check(git('diff', '--name-only', `${anchor}..HEAD`).split(/\r?\n/).filter(Boolean).every((path) => allowed.has(path)),
  'non-evidence changes after implementation anchor');
const history = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9|10|11|12|13|14|15|16)-/.test(path));
equal(Object.keys(evidence.historicalEvidenceHashes), history, 'historical evidence inventory drift');
for (const path of history) {
  check(!spawnSync('git', ['diff', '--quiet', baselineHead, '--', path], { cwd: root }).status, `historical evidence changed: ${path}`);
  check(evidence.historicalEvidenceHashes[path] === sha(execFileSync('git', ['show', `${baselineHead}:${path}`],
    { cwd: root, maxBuffer: 32 * 1024 * 1024 })), `historical hash drift: ${path}`);
}
for (const name of names) {
  const artifact = read(name);
  check(artifact.baselineHead === baselineHead && artifact.verifiedImplementationHead === anchor
    && artifact.verifiedImplementationTree === evidence.verifiedImplementationTree
    && artifact.verifiedImplementationCommittedAt === evidence.verifiedImplementationCommittedAt, `artifact anchor drift: ${name}`);
}

check(evidence.baselineImplementationAnchor === '130f1cc868adc3e27eb3ac5a2087f8da4e2f4e86', 'C1C16 implementation anchor mismatch');
check(evidence.baselineImplementationTree === '7cb92fbdf5e8492dde6cdfa9f9869b89b8354f6b'
  && git('rev-parse', evidence.baselineImplementationAnchor + '^{tree}') === evidence.baselineImplementationTree, 'C1C16 implementation tree mismatch');
check(git('rev-parse', baselineHead + '^') === evidence.baselineImplementationAnchor, 'C1C16 evidence baseline mismatch');
check(git('rev-parse', 'HEAD^') === anchor, 'final commit must be evidence-only directly after implementation');
check(LEVEL_1_TRINKET_DECK_COVERAGE.sourceDefinitionCount === 14 && LEVEL_1_TRINKET_DECK_COVERAGE.productionReadyCount === 7
  && !LEVEL_1_TRINKET_DECK_COVERAGE.completeForRandomDraw, 'Level 1 readiness drift');
const readyIds = [...LEVEL1_STANCE_ACCURACY_SPECS.map((card) => card.definitionId), 'community-trinket-core-accuracy-stone', 'community-trinket-core-critical-stone', SURVIVAL_GUIDE_ID].sort();
equal([...LEVEL_1_TRINKET_DECK_COVERAGE.productionReadyIds].sort(), readyIds, 'Level 1 Ready subset drift');
const pool = getTrinketPoolByLevel(runtimeContentContext(createNewCampaign('community-complete-edition')), 1).map((card) => card.id).sort();
equal(pool, readyIds, 'production Ready-subset selector drift');
equal(evidence.productionReadySubsetIds, pool, 'production pool evidence drift');
const historical = JSON.parse(execFileSync('git', ['show', baselineHead + ':docs/data/complete-edition/c1c16-level1-runtime-evidence.json'], { encoding: 'utf8' }));
equal(evidence.level2Coverage, LEVEL_2_TRINKET_DECK_COVERAGE, 'Level 2 evidence drift');
equal(evidence.level3Coverage, LEVEL_3_TRINKET_DECK_COVERAGE, 'Level 3 evidence drift');
equal(LEVEL_2_TRINKET_DECK_COVERAGE, historical.level2Coverage, 'Level 2 Ready IDs/count drift');
equal(LEVEL_3_TRINKET_DECK_COVERAGE, historical.level3Coverage, 'Level 3 Ready IDs/count drift');
check(LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount === 4 && LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount === 11, 'Level 2 drift');
check(LEVEL_3_TRINKET_DECK_COVERAGE.productionReadyCount === 4 && LEVEL_3_TRINKET_DECK_COVERAGE.sourceDefinitionCount === 12, 'Level 3 drift');
equal(evidence.level1Coverage, LEVEL_1_TRINKET_DECK_COVERAGE, 'Level 1 evidence drift');
equal(read('c1c17-level1-trinket-capability-matrix.json').cards, LEVEL_1_TRINKET_CENSUS, 'live capability matrix drift');
equal(read('c1c17-level1-trinket-deck-coverage.json').coverage, LEVEL_1_TRINKET_DECK_COVERAGE, 'deck evidence drift');
equal(trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES), [], 'readiness invariant errors');
equal(evidence.readinessInvariantErrors, [], 'persisted readiness invariant errors');
const capability = COMMUNITY_TRINKET_CAPABILITIES.find((card) => card.definitionId === SURVIVAL_GUIDE_ID)!;
check(capability.productionReady && capability.trinketSemanticObligations?.length === 2
  && capability.trinketSemanticObligations.every((side) => side.implementationStatus === 'IMPLEMENTED' && side.runtimeSliceSemanticComplete), 'Survival Guide both-side runtime incomplete');
equal(evidence.survivalGuideCapability, capability, 'Survival Guide capability evidence drift');
const source = COMMUNITY_SOURCE_TRINKETS.find((card) => card.id === SURVIVAL_GUIDE_ID)!;
const contract = read('c1c17-survival-guide-contract.json');
equal(contract.positive, source.positiveSide, 'positive source drift');
equal(contract.negative, source.negativeSide, 'negative source drift');
equal(contract.adapter, COMMUNITY_TRINKET_RUNTIME_ADAPTERS[SURVIVAL_GUIDE_ID], 'adapter drift');
check(contract.sourceTrigger === 'exploration-die-result' && contract.runtimeWindow === 'after-dungeon-roll'
  && contract.target === 'exploration-die' && source.positiveSide.conditions.length === 0 && source.negativeSide.conditions.length === 0, 'timing/target/conditions drift');
equal(capability.requiredPrimitives, ['STAGED_EXPLORATION_MOVE', 'EXPLORATION_RESULT_TRINKET_WINDOW', 'TRINKET_EXPLORATION_RESULT_IGNORE_CONSUMER', 'TRINKET_EXPLORATION_RESULT_REPLACE_CONSUMER'], 'required primitives drift');
const surface = read('c1c17-exploration-runtime-surface.json');
check(surface.productionMovementEntry === 'commands/dungeon.ts::enterDungeonRoom'
  && surface.insertion === 'AFTER_RESULT_FROZEN_BEFORE_RESULT_APPLICATION'
  && surface.resultApplication === 'exploration.ts::applyExplorationResult'
  && surface.roomContinuation === 'commands/dungeon.ts::finalizeDungeonRoomEntry', 'exploration insertion surface drift');
const normalizedPath = 'src/data/community-reference/trinkets/data.json';
check(evidence.sourceNormalizedSha256 === sha(readFileSync(normalizedPath))
  && evidence.sourceNormalizedSha256 === sha(execFileSync('git', ['show', baselineHead + ':' + normalizedPath], { maxBuffer: 32 * 1024 * 1024 })), 'normalized source changed');
for (const [path, hash] of Object.entries(evidence.normalizedEvidenceHashes)) {
  check(hash === sha(readFileSync(path)) && hash === sha(execFileSync('git', ['show', baselineHead + ':' + path], { maxBuffer: 32 * 1024 * 1024 })), 'normalized evidence changed: ' + path);
}
check(evidence.readySubsetDraw === 'ENABLED' && evidence.fullDeckStatus === 'complete 14-card Level-1 deck is not runtime-complete', 'random draw terminology drift');
check(evidence.deferredConditionCharms.status === 'DEFERRED_FAIL_CLOSED'
  && evidence.deferredConditionCharms.requiredContract === 'hero-caused-condition-source-contract'
  && evidence.deferredConditionCharms.blockers.length === 2, 'condition family defer evidence incomplete');
const verdict = 'C1C17-SURVIVAL-GUIDE-EXPLORATION-RESULT-RUNTIME-ACCEPTED-READY-7-OF-14';
check(evidence.terminalVerdict === verdict && evidence.verificationCommand === 'npm run verify:complete-edition-c1c17', 'verdict drift');
check(readFileSync('docs/reports/complete-edition/c1c17-survival-guide-runtime-report.md', 'utf8').includes(verdict), 'report verdict drift');
const receipt = process.argv.includes('--evidence-only') ? evidence.implementationVerification : runRuntimeVerification(anchor);
check(clean(), 'verifier left tracked changes');
console.log(JSON.stringify({ verdict, anchor, productionRuntimeChanges: runtimeChanges, commands: receipt.commands }, null, 2));
