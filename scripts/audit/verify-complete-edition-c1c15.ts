import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_3_TRINKET_CENSUS, LEVEL_3_TRINKET_DECK_COVERAGE } from '../../src/audit/level3-trinket-deck';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { LEVEL3_STANCE_RING_SPECS } from '../../src/audit/production-proof-registry';
import { canonicalSourceCondition } from '../../src/audit/trinket-semantic-coverage';
import { TRINKET_CONDITION_CONSUMER_COVERAGE } from '../../src/audit/trinket-condition-consumer-coverage';
import { TRINKET_MODIFIER_CONSUMER_COVERAGE } from '../../src/audit/trinket-modifier-consumer-coverage';
import { trinketReadinessInvariantErrors } from '../../src/audit/trinket-readiness-invariants';

const root = process.cwd();
const baselineHead = '5c9caecfb66ff7fb05c3946347e3c3f4b6633ddb';
const names = ['c1c15-level3-source-census.json', 'c1c15-level3-stance-ring-contract.json',
  'c1c15-level3-runtime-capability-matrix.json', 'c1c15-level3-trinket-capability-matrix.json',
  'c1c15-level3-trinket-deck-coverage.json', 'c1c15-level3-runtime-evidence.json'];
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
check(clean(), 'C1C15 requires a clean tracked tree');
const evidence = read('c1c15-level3-runtime-evidence.json');
const anchor = evidence.verifiedImplementationHead;
check(evidence.baselineHead === baselineHead && anchor !== baselineHead, 'baseline or anchor mismatch');
git('cat-file', '-e', `${anchor}^{commit}`);
git('merge-base', '--is-ancestor', baselineHead, anchor);
git('merge-base', '--is-ancestor', anchor, 'HEAD');
check(git('rev-parse', `${anchor}^{tree}`) === evidence.verifiedImplementationTree, 'implementation tree mismatch');
const allowed = new Set([...names.map((name) => `docs/data/complete-edition/${name}`),
  'docs/reports/complete-edition/c1c15-level3-stance-ring-runtime-report.md']);
check(git('diff', '--name-only', `${anchor}..HEAD`).split(/\r?\n/).filter(Boolean).every((path) => allowed.has(path)),
  'non-evidence changes after implementation anchor');
const history = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9|10|11|12|13|14)-/.test(path));
equal(Object.keys(evidence.historicalEvidenceHashes), history, 'historical evidence inventory drift');
for (const path of history) {
  check(!spawnSync('git', ['diff', '--quiet', baselineHead, '--', path], { cwd: root }).status, `historical evidence changed: ${path}`);
  check(evidence.historicalEvidenceHashes[path] === sha(execFileSync('git', ['show', `${baselineHead}:${path}`],
    { cwd: root, maxBuffer: 32 * 1024 * 1024 })), `historical hash drift: ${path}`);
}
for (const name of names) {
  const artifact = read(name);
  check(artifact.baselineHead === baselineHead && artifact.verifiedImplementationHead === anchor
    && artifact.verifiedImplementationTree === evidence.verifiedImplementationTree, `artifact anchor drift: ${name}`);
}
check(LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount === 4 && !LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw, 'Level 2 drift');
check(LEVEL_3_TRINKET_CENSUS.length === 12 && LEVEL_3_TRINKET_DECK_COVERAGE.productionReadyCount === 4
  && !LEVEL_3_TRINKET_DECK_COVERAGE.completeForRandomDraw, 'Level 3 readiness drift');
equal([...LEVEL_3_TRINKET_DECK_COVERAGE.productionReadyIds].sort(), LEVEL3_STANCE_RING_SPECS.map((ring) => ring.definitionId).sort(), 'ready IDs drift');
check(TRINKET_CONDITION_CONSUMER_COVERAGE.stance.wired, 'stance consumer unwired');
equal(evidence.stanceConsumer, TRINKET_CONDITION_CONSUMER_COVERAGE.stance, 'stance consumer evidence drift');
equal(evidence.modifierConsumers, { accuracy: TRINKET_MODIFIER_CONSUMER_COVERAGE.accuracy,
  crit: TRINKET_MODIFIER_CONSUMER_COVERAGE.crit }, 'modifier consumer evidence drift');
equal(trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES), [], 'readiness invariant failure');
for (const name of ['c1c15-level3-runtime-capability-matrix.json', 'c1c15-level3-trinket-capability-matrix.json'])
  equal(read(name).cards, LEVEL_3_TRINKET_CENSUS, `${name} not bound to live truth`);
equal(read('c1c15-level3-trinket-deck-coverage.json').coverage, LEVEL_3_TRINKET_DECK_COVERAGE, 'deck coverage drift');
equal(evidence.level2Coverage, LEVEL_2_TRINKET_DECK_COVERAGE, 'Level 2 evidence drift');
equal(evidence.level3Coverage, LEVEL_3_TRINKET_DECK_COVERAGE, 'Level 3 evidence drift');
equal(evidence.readyRingIds, LEVEL_3_TRINKET_DECK_COVERAGE.productionReadyIds, 'ready ID evidence drift');
equal(evidence.readinessInvariantErrors, [], 'persisted readiness errors');
check(evidence.sourceNormalizedSha256 === sha(readFileSync(resolve(root, 'src/data/community-reference/trinkets/data.json'))), 'normalized source drift');
check(evidence.sourceNormalizedSha256 === sha(execFileSync('git', ['show', `${baselineHead}:src/data/community-reference/trinkets/data.json`],
  { cwd: root, maxBuffer: 32 * 1024 * 1024 })), 'normalized source changed from locked baseline');
const sources = COMMUNITY_SOURCE_TRINKETS.filter((source) => source.level === 3 && source.contentSet === 'core');
equal(read('c1c15-level3-source-census.json').cards, sources.map((source) => ({ definitionId: source.id, printedName: source.printedName,
  level: source.level, contentSet: source.contentSet, sourceStatus: source.sourceStatus,
  unresolvedFields: source.unresolvedFields, sourceReferences: source.sourceReferences })), 'source census drift');
check(read('c1c15-level3-source-census.json').exactCount === sources.length, 'source census count drift');
const contract = read('c1c15-level3-stance-ring-contract.json');
check(contract.sourceTrigger === 'hero-skill-resolution' && contract.runtimeWindow === 'after-attack-roll-before-hit-resolution'
  && contract.newTimingPrimitiveRequired === false && contract.attackRollPolicy === 'FROZEN_NO_REROLL'
  && contract.declarationPolicy === 'PLAYER_USE_OR_SKIP', 'timing contract drift');
equal(contract.rings, LEVEL3_STANCE_RING_SPECS.map((ring) => {
  const source = sources.find((entry) => entry.id === ring.definitionId)!;
  const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === ring.definitionId)!;
  check(capability.productionReady && capability.trinketSemanticObligations?.every((side) => side.runtimeSliceSemanticComplete
    && side.implementationStatus === 'IMPLEMENTED'), `Ring semantic failure: ${ring.definitionId}`);
  return { definitionId: source.id, sourceReferences: source.sourceReferences,
    positive: { conditions: source.positiveSide.conditions.map(canonicalSourceCondition), modifiers: source.positiveSide.modifiers },
    negative: { conditions: source.negativeSide.conditions.map(canonicalSourceCondition), modifiers: source.negativeSide.modifiers },
    adapterId: COMMUNITY_TRINKET_RUNTIME_ADAPTERS[ring.definitionId].adapterId };
}), 'Ring contract payload drift');
const remaining = LEVEL_3_TRINKET_CENSUS.filter((card) => !card.productionReady);
check(remaining.length === 8 && remaining.every((card) => card.blockerCodes.includes('TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED')), 'remaining source gate drift');
equal(evidence.remainingBlockerCensus, remaining.map((card) => ({ definitionId: card.definitionId, blockerCodes: card.blockerCodes,
  voluntarySourceGate: 'c1c14-source-gap-freeze.json', independentFutureSlice: card.printedName.endsWith('Crown')
    ? 'resolve-test-result-determined / virtue-chance -2' : null, readyGainOfIndependentSliceAlone: 0 })), 'remaining blocker evidence drift');
const verdict = 'C1C15-LEVEL3-STANCE-RING-RUNTIME-ACCEPTED-READY-4-OF-12';
check(evidence.terminalVerdict === verdict && evidence.verificationCommand === 'npm run verify:complete-edition-c1c15', 'verdict drift');
check(readFileSync(resolve(root, 'docs/reports/complete-edition/c1c15-level3-stance-ring-runtime-report.md'), 'utf8').includes(verdict), 'report verdict drift');

const commands: string[] = [];
const shell = process.env.ComSpec ?? 'cmd.exe';
for (const phase of ['c1c15', 'c1c13', 'c1c12', 'c1c11', 'c1c10', 'c1c9', 'c1c8', 'c1c7', 'c1c6', 'c1c5']) {
  const command = `test:e2e:community-content-${phase}`;
  console.log(`Running ${command}`);
  run(shell, ['/d', '/s', '/c', `npm run ${command}`]); commands.push(command);
}
const volatile = ['docs/data/core-campaign/official-source-manifest.json', 'docs/data/core-campaign/source-readiness.json'];
const snapshots = new Map(volatile.map((path) => [path, readFileSync(resolve(root, path))]));
console.log('Running npm test');
try { run(shell, ['/d', '/s', '/c', 'npm test']); } finally {
  for (const [path, bytes] of snapshots) writeFileSync(resolve(root, path), bytes);
}
commands.push('test');
for (const command of ['typecheck', 'build']) {
  console.log(`Running ${command}`); run(shell, ['/d', '/s', '/c', `npm run ${command}`]); commands.push(command);
}
check(clean(), 'verifier left tracked changes');
console.log(JSON.stringify({ verdict, anchor, commands }, null, 2));
