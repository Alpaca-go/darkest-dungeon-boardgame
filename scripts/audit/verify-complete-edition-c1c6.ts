import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_RUNTIME_QUESTS, COMMUNITY_SOURCE_QUESTS, COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { questReadinessInvariantErrors } from '../../src/audit/quest-readiness-invariants';
import { trinketReadinessInvariantErrors } from '../../src/audit/trinket-readiness-invariants';
import { CHIRURGEONS_CHARM_ID, DARK_BRACER_ID, SOLAR_BRACER_ID } from '../../src/audit/production-proof-registry';
import { WIRED_WINDOWS } from '../../src/game-engine/trinkets/trinket-opportunities';

const root = process.cwd();
const baselineHead = 'eca0a293f4126d8b7e31934303ed0fcfd1ae1c61';
const commandShell = process.env.ComSpec ?? 'cmd.exe';
const dataDir = resolve(root, 'docs/data/complete-edition');
const allowedPostVerificationFiles = new Set([
  'docs/data/complete-edition/c1c6-dark-solar-attack-resolution-evidence.json',
  'docs/data/complete-edition/c1c6-level2-trinket-capability-matrix.json',
  'docs/reports/complete-edition/c1c6-dark-solar-attack-resolution-report.md',
]);
const volatileRegressionArtifacts = ['docs/data/core-campaign/official-source-manifest.json', 'docs/data/core-campaign/source-readiness.json'] as const;
interface Result { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000): Result {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false, timeout, maxBuffer: 100 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  return { command: [command, ...args].join(' '), exitCode: result.status ?? 1, stdout: result.stdout ?? '',
    stderr: `${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}` };
}
function requirePass(label: string, result: Result) { if (result.exitCode !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout.slice(-10000)}`); }
function git(...args: string[]) { const result = run('git', args); requirePass(`git ${args.join(' ')}`, result); return result.stdout.trim(); }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) throw new Error('C1C-6 verifier requires a clean tracked working tree');
if (git('rev-parse', baselineHead) !== baselineHead) throw new Error('C1C-6 baseline commit is unavailable');
const evidence = JSON.parse(readFileSync(resolve(dataDir, 'c1c6-dark-solar-attack-resolution-evidence.json'), 'utf8')) as {
  schemaVersion: number; baselineHead: string; verifiedImplementationHead: string; verifiedImplementationTree: string;
  verifiedImplementationCommittedAt: string; historicalEvidenceHashes: Record<string, string>;
  darkBracerReadyAfter: boolean; solarBracerReadyAfter: boolean; level2ReadyAfter: number;
  level2CompleteForRandomDraw: boolean; familyProductionReady: boolean; familySelectorReachable: boolean;
  chirurgeonsProductionReady: boolean; damageRandomnessFrozen: boolean; unknownSourceCanonicalizationFailsClosed: boolean;
  proofBindings: string[]; verificationCommand: string; verificationRequired: boolean; terminalVerdict: string;
};
if (evidence.schemaVersion !== 2 || evidence.baselineHead !== baselineHead
  || evidence.verificationCommand !== 'npm run verify:complete-edition-c1c6' || !evidence.verificationRequired) {
  throw new Error('C1C-6 evidence contract is stale');
}
const anchorExists = run('git', ['cat-file', '-e', `${evidence.verifiedImplementationHead}^{commit}`]);
requirePass('Evidence implementation commit existence', anchorExists);
const resolvedAnchorTree = git('rev-parse', `${evidence.verifiedImplementationHead}^{tree}`);
if (resolvedAnchorTree !== evidence.verifiedImplementationTree) throw new Error('Evidence implementation tree does not match its commit');
const committedAt = git('show', '-s', '--format=%cI', evidence.verifiedImplementationHead);
if (committedAt !== evidence.verifiedImplementationCommittedAt) throw new Error('Evidence implementation commit timestamp mismatch');
requirePass('Evidence anchor ancestry', run('git', ['merge-base', '--is-ancestor', evidence.verifiedImplementationHead, 'HEAD']));
const postAnchorFiles = git('diff', '--name-only', `${evidence.verifiedImplementationHead}..HEAD`).split(/\r?\n/).filter(Boolean);
const forbiddenPostAnchorFiles = postAnchorFiles.filter((path) => !allowedPostVerificationFiles.has(path.replace(/\\/g, '/')));
if (forbiddenPostAnchorFiles.length) throw new Error(`Implementation changed after evidence anchor: ${forbiddenPostAnchorFiles.join(', ')}`);
const historical = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c5(?:r|r2)?-/.test(path));
for (const path of historical) {
  const baselineBytes = run('git', ['show', `${baselineHead}:${path}`]).stdout;
  const baselineHash = hash(baselineBytes);
  requirePass(`Historical evidence freeze ${path}`, run('git', ['diff', '--quiet', baselineHead, '--', path]));
  if (evidence.historicalEvidenceHashes[path] !== baselineHash) throw new Error(`C1C-5 historical evidence hash binding changed: ${path}`);
}
if (Object.keys(evidence.historicalEvidenceHashes).length !== historical.length) throw new Error('Historical evidence hash set is not exact');
const c1c4 = JSON.parse(readFileSync(resolve(dataDir, 'c1c4-rest-semantic-source-closure-evidence.json'), 'utf8')) as { insufficientRecoveryCapacityAfter: string };
if (c1c4.insufficientRecoveryCapacityAfter !== 'SOURCE_UNRESOLVED') throw new Error('Rest freeze changed');
if (LEVEL_2_TRINKET_CENSUS.length !== 11 || LEVEL_2_TRINKET_CENSUS.some((entry) => entry.sides.length !== 2)) throw new Error('Level 2 source census changed');
if (!WIRED_WINDOWS.includes('before-damage-applied')) throw new Error('before-damage-applied is not wired');

const semanticSource = readFileSync(resolve(root, 'src/audit/trinket-semantic-coverage.ts'), 'utf8');
for (const token of ['TRINKET_SOURCE_PAYLOAD_CANONICALIZATION_UNSUPPORTED', "'before-damage-applied': { trigger: 'hero-skill-hits', target: 'skill' }"]) {
  if (!semanticSource.includes(token)) throw new Error(`C1C-6 semantic safeguard missing ${token}`);
}
if (/community-trinket-core-(dark-bracer|solar-bracer)/.test(semanticSource)) throw new Error('Card-id semantic whitelist detected');
const generatorSource = readFileSync(resolve(root, 'scripts/audit/generate-complete-edition-c1c6.ts'), 'utf8');
for (const forbidden of ['exitCode: 0', 'saveReplayResults:', 'e2eResults:', 'measuredAt:']) {
  if (generatorSource.includes(forbidden)) throw new Error(`C1C-6 generator contains synthetic verification claim: ${forbidden}`);
}

for (const id of [DARK_BRACER_ID, SOLAR_BRACER_ID]) {
  const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === id);
  if (!capability?.productionReady || !capability.runtimeSemanticComplete || !capability.sourceSemanticComplete
    || capability.trinketSemanticObligations?.length !== 2
    || capability.trinketSemanticObligations.some((side) => !side.triggerMatch || !side.windowMatch || !side.targetMatch
      || !side.modifierMatch || !side.effectMatch || !side.conditionMatch || !side.runtimeSliceSemanticComplete
      || side.semanticMismatches.length > 0)) throw new Error(`${id} is not exact and Ready`);
}
const readinessErrors = trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES);
if (readinessErrors.length) throw new Error(readinessErrors.join('; '));
if (LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw) throw new Error('Level 2 deck no longer fails closed');
const questErrors = questReadinessInvariantErrors(COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS, LEVEL_2_TRINKET_DECK_COVERAGE);
if (questErrors.length) throw new Error(questErrors.join('; '));
const family = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === 'community-quest-warrens-lvl1-family-trinkets')!;
if (family.productionReady || COMMUNITY_RUNTIME_QUESTS.some((entry) => entry.id === family.definitionId)) throw new Error('Family Trinkets gate regressed');
const chirurgeons = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID)!;
if (!chirurgeons.sourceSemanticComplete || chirurgeons.productionReady || chirurgeons.runtimeSemanticComplete
  || chirurgeons.trinketSemanticObligations?.some((side) => side.blockerCode !== 'TRINKET_TRIGGER_SCOPE_UNRESOLVED')) throw new Error('Chirurgeon partial status regressed');
const measuredProofBindings = [...new Set(COMMUNITY_TRINKET_CAPABILITIES
  .filter((entry) => [DARK_BRACER_ID, SOLAR_BRACER_ID].includes(entry.definitionId))
  .flatMap((entry) => entry.trinketSemanticObligations?.flatMap((side) => side.proofIds) ?? []))].sort();
if (JSON.stringify([...evidence.proofBindings].sort()) !== JSON.stringify(measuredProofBindings)) throw new Error('C1C-6 proof binding snapshot is stale');

const proofTests = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/game-engine/c1c6-dark-solar-bracer.test.ts', 'src/audit/c1c5r2-trinket-payload-mutations.test.ts',
  'src/audit/c1c5-level2-trinket-deck.test.ts', 'src/audit/production-proof-verification.test.ts',
  'src/game-engine/c1br-production-proof.test.ts', 'src/game-engine/c1c5-chirurgeons-charm.test.ts']);
requirePass('C1C-6 runtime, mutation, save/replay, selector, C1BR and C1C5 proofs', proofTests);
const e2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1c6']); requirePass('C1C-6 production UI E2E', e2e);
const c1brE2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1br']); requirePass('C1BR E2E regression', c1brE2e);
const c1c5E2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1c5']); requirePass('C1C5 E2E regression', c1c5E2e);
const snapshots = new Map(volatileRegressionArtifacts.map((path) => [path, readFileSync(resolve(root, path))]));
const regression = run(commandShell, ['/d', '/s', '/c', 'npm test']);
for (const [path, contents] of snapshots) writeFileSync(resolve(root, path), contents);
requirePass('Full regression', regression);
const typecheck = run(commandShell, ['/d', '/s', '/c', 'npm run typecheck']); requirePass('Typecheck', typecheck);
const build = run(commandShell, ['/d', '/s', '/c', 'npm run build']); requirePass('Build', build);

const matrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c6-level2-trinket-capability-matrix.json'), 'utf8')) as typeof import('../../docs/data/complete-edition/c1c6-level2-trinket-capability-matrix.json');
if (matrix.cards.length !== 11 || matrix.cards.filter((card) => [DARK_BRACER_ID, SOLAR_BRACER_ID].includes(card.definitionId))
  .some((card) => !card.productionReady || !card.positiveSideComplete || !card.negativeSideComplete)) throw new Error('C1C-6 matrix is stale or false');
if (matrix.schemaVersion !== 2 || matrix.verifiedImplementationHead !== evidence.verifiedImplementationHead
  || matrix.verifiedImplementationTree !== evidence.verifiedImplementationTree) throw new Error('C1C-6 matrix is not bound to the evidence anchor');
if (!evidence.darkBracerReadyAfter || !evidence.solarBracerReadyAfter || evidence.level2ReadyAfter !== LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount
  || evidence.level2CompleteForRandomDraw || evidence.familyProductionReady || evidence.familySelectorReachable || evidence.chirurgeonsProductionReady
  || !evidence.damageRandomnessFrozen || !evidence.unknownSourceCanonicalizationFailsClosed
  || evidence.terminalVerdict !== 'C1C6-DARK-SOLAR-ATTACK-RESOLUTION-ACCEPTED') throw new Error('C1C-6 evidence is stale or false');
if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) throw new Error('C1C-6 verifier left tracked changes');
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict,
  verifiedImplementationHead: evidence.verifiedImplementationHead, verifiedImplementationTree: evidence.verifiedImplementationTree,
  readyIds: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyIds, level2ReadyCount: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  level2CompleteForRandomDraw: LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw,
  commands: [proofTests, e2e, c1brE2e, c1c5E2e, regression, typecheck, build].map((entry) => ({ command: entry.command, exitCode: entry.exitCode })) }, null, 2));
