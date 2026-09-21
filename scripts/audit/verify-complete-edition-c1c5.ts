import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS,
  COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { questReadinessInvariantErrors } from '../../src/audit/quest-readiness-invariants';

const root = process.cwd();
const baselineHead = '9fb8429625c35d6efed3a54515a98000726e802e';
const commandShell = process.env.ComSpec ?? 'cmd.exe';
const dataDir = resolve(root, 'docs/data/complete-edition');

interface Result { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000): Result {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', shell: false, timeout, maxBuffer: 100 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  return { command: [command, ...args].join(' '), exitCode: result.status ?? 1, stdout: result.stdout ?? '', stderr: `${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}` };
}
function requirePass(label: string, result: Result) {
  if (result.exitCode !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout.slice(-8000)}`);
}
function git(...args: string[]) {
  const result = run('git', args);
  requirePass(`git ${args.join(' ')}`, result);
  return result.stdout.trim();
}

if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) {
  throw new Error('C1C-5 verifier requires a clean tracked working tree');
}
if (git('rev-parse', baselineHead) !== baselineHead) throw new Error('C1C-5 baseline commit is unavailable');
const historical = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c4-/.test(path));
for (const path of historical) {
  const baseline = git('show', `${baselineHead}:${path}`);
  const current = readFileSync(resolve(root, path), 'utf8').trimEnd();
  if (createHash('sha256').update(baseline).digest('hex') !== createHash('sha256').update(current).digest('hex')) {
    throw new Error(`C1C-4 historical evidence changed: ${path}`);
  }
}
const c1c4 = JSON.parse(readFileSync(resolve(dataDir, 'c1c4-rest-semantic-source-closure-evidence.json'), 'utf8')) as { terminalVerdict: string; insufficientRecoveryCapacityAfter: string };
if (c1c4.insufficientRecoveryCapacityAfter !== 'SOURCE_UNRESOLVED' || c1c4.terminalVerdict !== 'C1C4-REST-SOURCE-EXHAUSTED-STILL-UNRESOLVED') {
  throw new Error('Rest no longer preserves the C1C-4 fail-closed truth');
}
if (LEVEL_2_TRINKET_CENSUS.length !== LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount || LEVEL_2_TRINKET_CENSUS.some((entry) => entry.sides.length !== 2)) {
  throw new Error('Level 2 per-side census does not match measured source definitions');
}
const readinessErrors = questReadinessInvariantErrors(COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS, LEVEL_2_TRINKET_DECK_COVERAGE);
if (readinessErrors.length) throw new Error(readinessErrors.join('; '));
for (const capability of COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => entry.productionReady && LEVEL_2_TRINKET_CENSUS.some((source) => source.definitionId === entry.definitionId))) {
  if (!capability.sourceSemanticComplete || !capability.runtimeSemanticComplete || !capability.adapterComplete
    || !capability.productionProofComplete || !capability.saveReplayProofComplete
    || !capability.selectorReachable || !capability.productionUiProofComplete) {
    throw new Error(`${capability.definitionId}: Production Ready without every promotion gate`);
  }
}

const proofTests = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/audit/c1c5-level2-trinket-deck.test.ts',
  'src/game-engine/c1c5-chirurgeons-charm.test.ts',
  'src/game-engine/c1br-production-proof.test.ts',
  'src/audit/production-proof-verification.test.ts']);
requirePass('C1C-5 proof and mutation tests', proofTests);
const e2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1c5']);
requirePass('C1C-5 production UI E2E', e2e);
const c1brE2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1br']);
requirePass('C1BR production UI regression', c1brE2e);
const regression = run(commandShell, ['/d', '/s', '/c', 'npm test']);
requirePass('Full regression', regression);
const typecheck = run(commandShell, ['/d', '/s', '/c', 'npm run typecheck']);
requirePass('Typecheck', typecheck);
const build = run(commandShell, ['/d', '/s', '/c', 'npm run build']);
requirePass('Build', build);

const coverageArtifact = JSON.parse(readFileSync(resolve(dataDir, 'c1c5-trinket-deck-coverage.json'), 'utf8')) as { level2: typeof LEVEL_2_TRINKET_DECK_COVERAGE };
const matrixArtifact = JSON.parse(readFileSync(resolve(dataDir, 'c1c5-level2-trinket-capability-matrix.json'), 'utf8')) as { cards: Array<{ definitionId: string; productionReady: boolean; positiveSideComplete: boolean; negativeSideComplete: boolean }> };
const evidence = JSON.parse(readFileSync(resolve(dataDir, 'c1c5-level2-trinket-runtime-foundation-evidence.json'), 'utf8')) as { terminalVerdict: string; familyTrinketsProductionReady: boolean; restSemanticStatus: string };
if (JSON.stringify(coverageArtifact.level2) !== JSON.stringify(LEVEL_2_TRINKET_DECK_COVERAGE)) throw new Error('Deck coverage artifact is stale');
if (matrixArtifact.cards.length !== LEVEL_2_TRINKET_CENSUS.length) throw new Error('Level 2 capability matrix is incomplete');
for (const card of matrixArtifact.cards.filter((entry) => entry.productionReady)) {
  if (!card.positiveSideComplete || !card.negativeSideComplete) throw new Error(`${card.definitionId}: ready with an incomplete side`);
}
if (evidence.familyTrinketsProductionReady || evidence.restSemanticStatus !== 'SOURCE_UNRESOLVED_FAIL_CLOSED'
  || evidence.terminalVerdict !== 'C1C5-LEVEL2-TRINKET-RUNTIME-FOUNDATION-ACCEPTED') {
  throw new Error('C1C-5 terminal evidence is not fail-closed');
}
console.log(JSON.stringify({
  terminalVerdict: evidence.terminalVerdict,
  level2: LEVEL_2_TRINKET_DECK_COVERAGE,
  commands: [proofTests, e2e, c1brE2e, regression, typecheck, build].map((entry) => ({ command: entry.command, exitCode: entry.exitCode })),
}, null, 2));
