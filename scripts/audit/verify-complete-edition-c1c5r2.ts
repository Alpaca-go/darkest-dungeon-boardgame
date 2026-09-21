import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_RUNTIME_QUESTS, COMMUNITY_SOURCE_QUESTS,
  COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { questReadinessInvariantErrors } from '../../src/audit/quest-readiness-invariants';
import { trinketReadinessInvariantErrors } from '../../src/audit/trinket-readiness-invariants';
import { CHIRURGEONS_CHARM_ID } from '../../src/audit/production-proof-registry';

const root = process.cwd();
const baselineHead = 'd5f01d9319d9d0e051327c439b0f4d1c9296db14';
const commandShell = process.env.ComSpec ?? 'cmd.exe';
const dataDir = resolve(root, 'docs/data/complete-edition');
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

if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) throw new Error('C1C-5R2 verifier requires a clean tracked working tree');
if (git('rev-parse', baselineHead) !== baselineHead) throw new Error('C1C-5R2 baseline commit is unavailable');
const historical = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c5(?:r)?-/.test(path));
for (const path of historical) {
  if (hash(git('show', `${baselineHead}:${path}`)) !== hash(readFileSync(resolve(root, path), 'utf8').trimEnd())) throw new Error(`C1C-5/C1C-5R historical evidence changed: ${path}`);
}
const c1c4 = JSON.parse(readFileSync(resolve(dataDir, 'c1c4-rest-semantic-source-closure-evidence.json'), 'utf8')) as { insufficientRecoveryCapacityAfter: string };
if (c1c4.insufficientRecoveryCapacityAfter !== 'SOURCE_UNRESOLVED') throw new Error('Rest freeze changed');
if (LEVEL_2_TRINKET_CENSUS.length !== 11 || LEVEL_2_TRINKET_CENSUS.some((entry) => entry.sides.length !== 2)) throw new Error('Level 2 source census changed');

const semanticSource = readFileSync(resolve(root, 'src/audit/trinket-semantic-coverage.ts'), 'utf8');
if (/modifiers\.length\s*>?=|effects\.length\s*>=/.test(semanticSource)) throw new Error('Length-based semantic completion returned');
if (/community-trinket-core-(accuracy-stone|critical-stone|chirurgeons-charm)/.test(semanticSource)) throw new Error('Card-id semantic whitelist detected');
for (const token of ['compareTrinketSemanticPayload', 'canonicalSourceModifier', 'canonicalRuntimeModifier', 'runtimeTargetBinding', 'runtimeTriggerBinding']) {
  if (!semanticSource.includes(token)) throw new Error(`Exact comparator missing ${token}`);
}

const readyLevel1 = COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => ['community-trinket-core-accuracy-stone', 'community-trinket-core-critical-stone'].includes(entry.definitionId));
if (readyLevel1.length !== 2 || readyLevel1.some((entry) => !entry.productionReady || !entry.runtimeSemanticComplete
  || entry.trinketSemanticObligations?.some((side) => !side.runtimeSliceSemanticComplete || side.semanticMismatches.length > 0))) {
  throw new Error('Accuracy/Critical no longer pass exact generic comparison');
}
const chirurgeons = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID)!;
if (!chirurgeons.sourceSemanticComplete || chirurgeons.runtimeSemanticComplete || chirurgeons.productionReady
  || chirurgeons.trinketSemanticObligations?.length !== 2
  || chirurgeons.trinketSemanticObligations.some((entry) => !entry.runtimeSliceSemanticComplete
    || entry.implementationStatus !== 'PARTIAL' || entry.blockerCode !== 'TRINKET_TRIGGER_SCOPE_UNRESOLVED')) {
  throw new Error('Chirurgeon battle slice/definition split is not truthful');
}
const trinketErrors = trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES);
if (trinketErrors.length) throw new Error(trinketErrors.join('; '));
if (LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount !== 0 || LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw) throw new Error('Level 2 deck no longer fails closed');
const questErrors = questReadinessInvariantErrors(COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS, LEVEL_2_TRINKET_DECK_COVERAGE);
if (questErrors.length) throw new Error(questErrors.join('; '));
const family = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === 'community-quest-warrens-lvl1-family-trinkets')!;
if (!family.requiredPrimitives.includes('LEVEL_2_TRINKET_SOURCE_DECK_COMPLETE') || family.productionReady
  || COMMUNITY_RUNTIME_QUESTS.some((entry) => entry.id === family.definitionId)) throw new Error('Family dependency/selector gate regressed');

const proofTests = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/audit/c1c5r2-trinket-payload-mutations.test.ts', 'src/audit/c1c5r-trinket-semantic-scope.test.ts',
  'src/audit/c1c5-level2-trinket-deck.test.ts', 'src/game-engine/c1c5-chirurgeons-charm.test.ts',
  'src/game-engine/c1br-production-proof.test.ts', 'src/audit/production-proof-verification.test.ts']);
requirePass('C1C-5R2 payload mutation and proof tests', proofTests);
const c1brE2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1br']); requirePass('C1BR E2E', c1brE2e);
const c1c5E2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1c5']); requirePass('C1C5 battle E2E', c1c5E2e);
const snapshots = new Map(volatileRegressionArtifacts.map((path) => [path, readFileSync(resolve(root, path))]));
const regression = run(commandShell, ['/d', '/s', '/c', 'npm test']);
for (const [path, contents] of snapshots) writeFileSync(resolve(root, path), contents);
requirePass('Full regression', regression);
const typecheck = run(commandShell, ['/d', '/s', '/c', 'npm run typecheck']); requirePass('Typecheck', typecheck);
const build = run(commandShell, ['/d', '/s', '/c', 'npm run build']); requirePass('Build', build);

const matrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c5r2-level2-trinket-capability-matrix.json'), 'utf8')) as {
  cards: Array<{ definitionId: string; productionReady: boolean; sides: Array<{ triggerMatch: boolean; windowMatch: boolean; targetMatch: boolean; modifierMatch: boolean; effectMatch: boolean; conditionMatch: boolean; runtimeSliceSemanticComplete: boolean; semanticMismatches: unknown[] }> }>;
};
const evidence = JSON.parse(readFileSync(resolve(dataDir, 'c1c5r2-trinket-semantic-payload-hardening-evidence.json'), 'utf8')) as {
  exactPayloadComparatorEnabled: boolean; level1ReadyIds: string[]; chirurgeonsBattleSliceComplete: boolean;
  chirurgeonsDefinitionReady: boolean; level2ProductionReadyCount: number; level2CompleteForRandomDraw: boolean;
  familyDeckDependencyBound: boolean; familyProductionReady: boolean; familySelectorReachable: boolean;
  proofBindings: string[]; terminalVerdict: string;
};
const matrixChirurgeons = matrix.cards.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID);
if (matrix.cards.length !== 11 || !matrixChirurgeons || matrixChirurgeons.productionReady
  || matrixChirurgeons.sides.length !== 2 || matrixChirurgeons.sides.some((side) => !side.triggerMatch || !side.windowMatch
    || !side.targetMatch || !side.modifierMatch || !side.effectMatch || !side.conditionMatch || !side.runtimeSliceSemanticComplete
    || side.semanticMismatches.length > 0)) throw new Error('R2 capability matrix is stale or false');
if (!evidence.exactPayloadComparatorEnabled || evidence.level1ReadyIds.length !== 2 || !evidence.chirurgeonsBattleSliceComplete
  || evidence.chirurgeonsDefinitionReady || evidence.level2ProductionReadyCount !== 0 || evidence.level2CompleteForRandomDraw
  || !evidence.familyDeckDependencyBound || evidence.familyProductionReady || evidence.familySelectorReachable
  || new Set(evidence.proofBindings).size !== evidence.proofBindings.length
  || evidence.terminalVerdict !== 'C1C5R2-TRINKET-SEMANTIC-PAYLOAD-HARDENING-ACCEPTED') throw new Error('R2 evidence is stale or not fail closed');
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, level1ReadyIds: evidence.level1ReadyIds,
  chirurgeonsBattleSliceComplete: evidence.chirurgeonsBattleSliceComplete, level2: LEVEL_2_TRINKET_DECK_COVERAGE,
  commands: [proofTests, c1brE2e, c1c5E2e, regression, typecheck, build].map((entry) => ({ command: entry.command, exitCode: entry.exitCode })) }, null, 2));
