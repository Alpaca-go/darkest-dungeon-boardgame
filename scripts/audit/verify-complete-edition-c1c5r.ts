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
const baselineHead = 'a4087540602d5816ed3e0c328be4a5d16e2b3b32';
const commandShell = process.env.ComSpec ?? 'cmd.exe';
const dataDir = resolve(root, 'docs/data/complete-edition');
const volatileRegressionArtifacts = ['docs/data/core-campaign/official-source-manifest.json', 'docs/data/core-campaign/source-readiness.json'] as const;
interface Result { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000): Result {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false, timeout, maxBuffer: 100 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  return { command: [command, ...args].join(' '), exitCode: result.status ?? 1, stdout: result.stdout ?? '', stderr: `${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}` };
}
function requirePass(label: string, result: Result) { if (result.exitCode !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout.slice(-10000)}`); }
function git(...args: string[]) { const result = run('git', args); requirePass(`git ${args.join(' ')}`, result); return result.stdout.trim(); }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) throw new Error('C1C-5R verifier requires a clean tracked working tree');
if (git('rev-parse', baselineHead) !== baselineHead) throw new Error('C1C-5R baseline commit is unavailable');
const historical = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c5-/.test(path));
for (const path of historical) {
  if (hash(git('show', `${baselineHead}:${path}`)) !== hash(readFileSync(resolve(root, path), 'utf8').trimEnd())) throw new Error(`C1C-5 historical evidence changed: ${path}`);
}
const c1c4 = JSON.parse(readFileSync(resolve(dataDir, 'c1c4-rest-semantic-source-closure-evidence.json'), 'utf8')) as { insufficientRecoveryCapacityAfter: string };
if (c1c4.insufficientRecoveryCapacityAfter !== 'SOURCE_UNRESOLVED') throw new Error('Rest freeze changed');
if (LEVEL_2_TRINKET_CENSUS.length !== 11 || LEVEL_2_TRINKET_CENSUS.some((entry) => entry.sides.length !== 2)) throw new Error('Level 2 source census mismatch');
const chirurgeons = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID)!;
if (!chirurgeons.sourceSemanticComplete || chirurgeons.runtimeSemanticComplete || chirurgeons.productionReady
  || chirurgeons.trinketSemanticObligations?.length !== 2
  || chirurgeons.trinketSemanticObligations.some((entry) => entry.implementationStatus !== 'PARTIAL')) throw new Error('Chirurgeon semantic demotion is not truthful');
if (trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES).length) throw new Error(trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES).join('; '));
if (LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount !== 0 || LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw) throw new Error('Level 2 deck did not fail closed at 0/11');
const questErrors = questReadinessInvariantErrors(COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS, LEVEL_2_TRINKET_DECK_COVERAGE);
if (questErrors.length) throw new Error(questErrors.join('; '));
const family = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === 'community-quest-warrens-lvl1-family-trinkets')!;
if (!family.requiredPrimitives.includes('LEVEL_2_TRINKET_SOURCE_DECK_COMPLETE') || family.productionReady
  || COMMUNITY_RUNTIME_QUESTS.some((entry) => entry.id === family.definitionId)) throw new Error('Family dependency is not bound into production capability and selector');

const proofTests = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/audit/c1c5r-trinket-semantic-scope.test.ts', 'src/audit/c1c5-level2-trinket-deck.test.ts',
  'src/game-engine/c1c5-chirurgeons-charm.test.ts', 'src/game-engine/c1br-production-proof.test.ts',
  'src/audit/production-proof-verification.test.ts']);
requirePass('C1C-5R proof and mutation tests', proofTests);
const e2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1c5']); requirePass('C1C-5 battle UI proof', e2e);
const c1brE2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1br']); requirePass('C1BR regression', c1brE2e);
const snapshots = new Map(volatileRegressionArtifacts.map((path) => [path, readFileSync(resolve(root, path))]));
const regression = run(commandShell, ['/d', '/s', '/c', 'npm test']);
for (const [path, contents] of snapshots) writeFileSync(resolve(root, path), contents);
requirePass('Full regression', regression);
const typecheck = run(commandShell, ['/d', '/s', '/c', 'npm run typecheck']); requirePass('Typecheck', typecheck);
const build = run(commandShell, ['/d', '/s', '/c', 'npm run build']); requirePass('Build', build);

const scope = JSON.parse(readFileSync(resolve(dataDir, 'c1c5r-chirurgeons-trigger-scope.json'), 'utf8')) as { triggerScopeComplete: boolean; scopes: unknown[] };
const matrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c5r-level2-trinket-capability-matrix.json'), 'utf8')) as { cards: Array<{ definitionId: string; productionReady: boolean; blockerCodes: string[] }> };
const coverage = JSON.parse(readFileSync(resolve(dataDir, 'c1c5r-trinket-deck-coverage.json'), 'utf8')) as { level2: typeof LEVEL_2_TRINKET_DECK_COVERAGE };
const evidence = JSON.parse(readFileSync(resolve(dataDir, 'c1c5r-trinket-semantic-scope-repair-evidence.json'), 'utf8')) as { terminalVerdict: string; familyDeckDependencyBound: boolean; familyProductionReady: boolean; battleHealingSliceComplete: boolean };
if (scope.triggerScopeComplete || scope.scopes.length < 6) throw new Error('Trigger scope audit is stale');
if (matrix.cards.length !== 11 || !matrix.cards.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID)?.blockerCodes.includes('TRINKET_TRIGGER_SCOPE_UNRESOLVED')) throw new Error('Capability matrix is stale');
if (JSON.stringify(coverage.level2) !== JSON.stringify(LEVEL_2_TRINKET_DECK_COVERAGE)) throw new Error('Deck coverage artifact is stale');
if (!evidence.familyDeckDependencyBound || evidence.familyProductionReady || !evidence.battleHealingSliceComplete
  || evidence.terminalVerdict !== 'C1C5R-BATTLE-HEALING-FOUNDATION-ACCEPTED-CARD-NOT-PROMOTED') throw new Error('Terminal evidence is not fail closed');
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, level2: LEVEL_2_TRINKET_DECK_COVERAGE, commands: [proofTests, e2e, c1brE2e, regression, typecheck, build].map((entry) => ({ command: entry.command, exitCode: entry.exitCode })) }, null, 2));
