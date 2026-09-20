import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_PRODUCTION_PROOFS,
  COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';
import { C1C1_CORE_QUEST_IDS, PRODUCTION_PROOF_REGISTRY } from '../../src/audit/production-proof-registry';
import { analyzeProductionProofBindings, evidencePublicationErrors, type ProofExecutionResult } from '../../src/audit/production-proof-verification';

const root = process.cwd();
const baselineHead = 'f30c866db41d81795d6ea7c6c4f459fee83da92c';
const evidencePath = resolve(root, 'docs/data/complete-edition/c1c1-core-quest-foundation-evidence.json');
const run = (command: string, args: string[], timeout = 600_000) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false, timeout, maxBuffer: 40 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  return { command: [command, ...args].join(' '), exitCode: result.status ?? 1, stdout: result.stdout ?? '', stderr: `${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}` };
};
const git = (...args: string[]) => {
  const result = run('git', args);
  if (result.exitCode !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};

const protectedPaths = [
  'src/data/community-reference/quests/data.json',
  'src/data/community-reference/trinkets/data.json',
  'docs/data/complete-edition/c1a-asset-manifest.json',
  'docs/data/complete-edition/c1a-literal-review.json',
  'docs/data/complete-edition/c1a-logical-identities.json',
  'docs/data/complete-edition/c1a-rulebook-evidence.json',
  'docs/data/complete-edition/c1a-source-review-lock.json',
  'docs/data/complete-edition/c1ar-semantic-review-lock.json',
];
const freeze = run('git', ['diff', '--quiet', baselineHead, '--', ...protectedPaths]);
if (freeze.exitCode !== 0) throw new Error('Source / semantic freeze changed');

const questRegistry = Object.fromEntries(Object.entries(PRODUCTION_PROOF_REGISTRY).filter(([, proof]) => proof.definitionIds.some((id) => C1C1_CORE_QUEST_IDS.includes(id as typeof C1C1_CORE_QUEST_IDS[number]))));
const binding = analyzeProductionProofBindings(COMMUNITY_QUEST_PRODUCTION_PROOFS, questRegistry);
const bindingErrors = evidencePublicationErrors(binding, []).filter((error) => !error.includes(' execution missing'));
if (bindingErrors.length) throw new Error(`Quest proof binding failed: ${bindingErrors.join('; ')}`);

const vitest = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', 'src/game-engine/c1c1-community-quest-production.test.ts', 'src/audit/production-proof-verification.test.ts', '--reporter=json']);
let vitestJson: { success?: boolean; numPendingTests?: number; numTodoTests?: number; testResults?: Array<{ assertionResults?: Array<{ title?: string; status?: string }> }> };
try { vitestJson = JSON.parse(vitest.stdout); } catch { throw new Error(`Quest proof output is not JSON: ${vitest.stderr}`); }
const assertions = vitestJson.testResults?.flatMap((suite) => suite.assertionResults ?? []) ?? [];
const e2e = run(process.execPath, [resolve(root, 'scripts/e2e/run-community-content-c1c1-e2e.mjs')]);
const regression = run('npm.cmd', ['test']);
const build = run('npm.cmd', ['run', 'build']);
if (vitest.exitCode !== 0 || vitestJson.success !== true || (vitestJson.numPendingTests ?? 0) || (vitestJson.numTodoTests ?? 0)) throw new Error('Quest Vitest proof suite failed or skipped');
if (e2e.exitCode !== 0) throw new Error(`Quest Playwright suite failed: ${e2e.stderr || e2e.stdout.slice(-2000)}`);
if (regression.exitCode !== 0) throw new Error(`Regression suite failed: ${regression.stderr || regression.stdout.slice(-2000)}`);
if (build.exitCode !== 0) throw new Error(`Build failed: ${build.stderr || build.stdout.slice(-2000)}`);

const e2eOutput = `${e2e.stdout}\n${e2e.stderr}`;
const executions: ProofExecutionResult[] = Object.values(questRegistry).map((proof) => ({
  proofId: proof.proofId,
  runner: proof.runner,
  testFile: proof.testFile,
  status: proof.runner === 'vitest'
    ? assertions.some((entry) => entry.title === proof.proofId && entry.status === 'passed') ? 'passed' : 'failed'
    : new RegExp(`ok\\s+\\d+[^\\n]*${proof.proofId}`).test(e2eOutput) ? 'passed' : 'failed',
}));
const publicationErrors = evidencePublicationErrors(binding, executions);
if (publicationErrors.length) throw new Error(`Evidence publication refused: ${publicationErrors.join('; ')}`);

const readyQuests = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY');
const readyTrinkets = COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY');
if (readyQuests.length !== 7 || readyTrinkets.length !== 2) throw new Error(`Coverage mismatch: Quest ${readyQuests.length}, Trinket ${readyTrinkets.length}`);
const backlog = JSON.parse(readFileSync(resolve(root, 'docs/data/complete-edition/c1c1-runtime-primitive-backlog.json'), 'utf8')) as { backlog: unknown[] };
const proofIds = (type: string) => executions.filter((entry) => questRegistry[entry.proofId].proofType === type && entry.status === 'passed').map((entry) => entry.proofId);
const evidence = {
  schemaVersion: 1,
  phase: '11A.4-C1C-1',
  generatedAt: new Date().toISOString(),
  baselineHead,
  verifiedImplementationHead: git('rev-parse', 'HEAD'),
  verifiedTreeHash: git('rev-parse', 'HEAD^{tree}'),
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  implementedPrimitives: ['QUEST_ROOM_TOKEN_COMPOSITION', 'QUEST_XP_UNIT_ACCOUNTING'],
  questProductionReadyBefore: 0,
  questProductionReadyAfter: readyQuests.length,
  trinketProductionReadyAfter: readyTrinkets.length,
  readyQuestDefinitionIds: readyQuests.map((entry) => entry.definitionId),
  roomCompositionProofs: ['C1C1-QUEST-RUNTIME'],
  xpAccountingProofs: ['C1C1-QUEST-RUNTIME'],
  saveReplayProofs: proofIds('save-replay'),
  selectorProofs: proofIds('selector'),
  e2eProofs: proofIds('e2e'),
  proofBindings: binding.resolutions,
  proofExecutions: executions,
  remainingRuntimeBacklog: backlog.backlog,
  verificationCommands: [vitest.command, e2e.command, regression.command, build.command],
  actualExitCodes: { sourceSemanticFreeze: freeze.exitCode, questVitest: vitest.exitCode, questPlaywright: e2e.exitCode, regression: regression.exitCode, build: build.exitCode },
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ evidencePath, verifiedImplementationHead: evidence.verifiedImplementationHead, readyQuests: readyQuests.length, readyTrinkets: readyTrinkets.length, actualExitCodes: evidence.actualExitCodes }, null, 2));
