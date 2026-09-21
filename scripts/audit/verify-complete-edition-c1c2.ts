import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_PRODUCTION_PROOFS,
  COMMUNITY_QUEST_RUNTIME_ADAPTERS,
  COMMUNITY_SOURCE_QUESTS,
  COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';
import { PRODUCTION_PROOF_REGISTRY } from '../../src/audit/production-proof-registry';
import { analyzeProductionProofBindings, evidencePublicationErrors, type ProofExecutionResult } from '../../src/audit/production-proof-verification';
import { deriveUnresolvedRestSemantics, semanticContractAcceptanceErrors } from '../../src/audit/rest-semantic-contract';
import { questReadinessInvariantErrors } from '../../src/audit/quest-readiness-invariants';

const root = process.cwd();
const baselineHead = 'a51bfeaf30c5be187ffc7d54e1dd978b0d9b8be4';
const dataDir = resolve(root, 'docs/data/complete-edition');
const reportPath = resolve(root, 'docs/reports/complete-edition/c1c2-quest-runtime-expansion-report.md');
const evidencePath = resolve(dataDir, 'c1c2-quest-runtime-expansion-evidence.json');
const commandShell = process.env.ComSpec ?? 'cmd.exe';

interface CommandResult { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000): CommandResult {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', shell: false, timeout, maxBuffer: 80 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  return {
    command: [command, ...args].join(' '),
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: `${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`,
  };
}
function git(...args: string[]): string {
  const result = run('git', args);
  if (result.exitCode !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

// STOP precondition: tracked implementation state must be committed. User-owned untracked scratch files are ignored.
if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) {
  throw new Error('C1C-2 verifier requires a clean tracked working tree');
}

const historicalChanges = git('diff', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter(Boolean)
  .filter((path) => !path.includes('/c1c2-'));
if (historicalChanges.length) throw new Error(`Historical evidence changed: ${historicalChanges.join(', ')}`);

const unresolvedRest = deriveUnresolvedRestSemantics();
const restErrors = semanticContractAcceptanceErrors();
if (unresolvedRest.join(',') !== 'insufficientRecoveryCapacity'
  || restErrors.join(',') !== 'insufficientRecoveryCapacity: SOURCE_UNRESOLVED is not accepted for Production') {
  throw new Error('Rest semantic freeze changed');
}

const readyBefore = 2;
const ready = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionReady);
const trinketReady = COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => entry.productionReady);
const newlyReady = ready.map((entry) => entry.definitionId).filter((id) => ![
  'community-quest-warrens-lvl1-explore-the-sewers',
  'community-quest-warrens-lvl2-mapping-the-sewers',
].includes(id));
if (trinketReady.length !== 2) throw new Error(`Trinket readiness regressed: ${trinketReady.length}`);
const readinessErrors = questReadinessInvariantErrors(COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS);
if (readinessErrors.length) throw new Error(`Quest readiness invariant failed: ${readinessErrors.join('; ')}`);

for (const [definitionId, adapter] of Object.entries(COMMUNITY_QUEST_RUNTIME_ADAPTERS)) {
  if (adapter.definitionId !== definitionId || adapter.questDefinitionId !== definitionId) throw new Error(`${definitionId}: adapter identity mismatch`);
  for (const method of ['setup', 'evaluateObjective', 'evaluateCompletion', 'applyRewards'] as const) {
    if (typeof adapter[method] !== 'function') throw new Error(`${definitionId}: adapter ${method} missing`);
  }
  for (const rule of adapter.specialRules) {
    if (!rule.id || !rule.trigger || rule.sourceReferences.length === 0 || rule.effects.length === 0) throw new Error(`${definitionId}: invalid typed special rule`);
    if (rule.effects.some((effect) => typeof effect === 'string')) throw new Error(`${definitionId}: string effect is forbidden`);
  }
}

const readyManifests = Object.fromEntries(ready.map((entry) => [entry.definitionId, COMMUNITY_QUEST_PRODUCTION_PROOFS[entry.definitionId]]));
if (Object.values(readyManifests).some((manifest) => !manifest)) throw new Error('Ready Quest proof manifest missing');
const referencedProofIds = new Set(Object.values(readyManifests).flatMap((manifest) => [
  ...manifest.productionTests, ...manifest.saveReplayTests, ...manifest.selectorTests, ...manifest.e2eTests,
]));
const readyRegistry = Object.fromEntries(Object.entries(PRODUCTION_PROOF_REGISTRY).filter(([id]) => referencedProofIds.has(id)));
for (const proof of Object.values(readyRegistry)) {
  if (proof.status !== 'active') throw new Error(`${proof.proofId}: proof is not active`);
  if (!existsSync(resolve(root, proof.testFile))) throw new Error(`${proof.proofId}: test file missing`);
}
const binding = analyzeProductionProofBindings(readyManifests, readyRegistry);
const bindingErrors = evidencePublicationErrors(binding, []).filter((error) => !error.includes(' execution missing'));
if (bindingErrors.length) throw new Error(`Proof binding failed: ${bindingErrors.join('; ')}`);

const proofTests = run(process.execPath, [
  resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/game-engine/c1c2-quest-runtime-expansion.test.ts',
  'src/game-engine/c1c1-community-quest-production.test.ts',
  'src/game-engine/c1c1r-firewood-real-flow.test.ts',
  'src/audit/c1c1r3-rest-budget-semantics.test.ts',
  'src/audit/production-proof-verification.test.ts', '--reporter=json',
]);
let proofJson: { success?: boolean; numPendingTests?: number; numTodoTests?: number; testResults?: Array<{ assertionResults?: Array<{ title?: string; status?: string }> }> };
try { proofJson = JSON.parse(proofTests.stdout); } catch { throw new Error(`Proof output is not JSON: ${proofTests.stderr}`); }
const assertions = proofJson.testResults?.flatMap((suite) => suite.assertionResults ?? []) ?? [];
if (proofTests.exitCode !== 0 || proofJson.success !== true || (proofJson.numPendingTests ?? 0) || (proofJson.numTodoTests ?? 0)) {
  throw new Error('C1C-2 proof suite failed, skipped, or has todo tests');
}

const e2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1c2']);
if (e2e.exitCode !== 0) throw new Error(`C1C-2 Playwright failed: ${e2e.stderr || e2e.stdout.slice(-3000)}`);
const e2eOutput = `${e2e.stdout}\n${e2e.stderr}`;
const executions: ProofExecutionResult[] = Object.values(readyRegistry).map((proof) => ({
  proofId: proof.proofId,
  runner: proof.runner,
  testFile: proof.testFile,
  status: proof.runner === 'vitest'
    ? assertions.some((entry) => entry.title === proof.proofId && entry.status === 'passed') ? 'passed' : 'failed'
    : new RegExp(`ok\\s+\\d+[^\\n]*${proof.proofId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(e2eOutput) ? 'passed' : 'failed',
}));
const publicationErrors = evidencePublicationErrors(binding, executions);
if (publicationErrors.length) throw new Error(`Evidence publication refused: ${publicationErrors.join('; ')}`);

const regression = run(commandShell, ['/d', '/s', '/c', 'npm test']);
if (regression.exitCode !== 0) throw new Error(`Full regression failed: ${regression.stderr || regression.stdout.slice(-3000)}`);
const typecheck = run(commandShell, ['/d', '/s', '/c', 'npm run typecheck']);
if (typecheck.exitCode !== 0) throw new Error(`Typecheck failed: ${typecheck.stderr || typecheck.stdout.slice(-3000)}`);
const build = run(commandShell, ['/d', '/s', '/c', 'npm run build']);
if (build.exitCode !== 0) throw new Error(`Build failed: ${build.stderr || build.stdout.slice(-3000)}`);
const generation = run(process.execPath, [resolve(root, 'node_modules/vite-node/vite-node.mjs'), 'scripts/audit/generate-complete-edition-c1c2.ts']);
if (generation.exitCode !== 0) throw new Error(`C1C-2 matrix generation failed: ${generation.stderr}`);

const matrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c2-runtime-capability-matrix.json'), 'utf8')) as { counts: Record<string, number> };
const backlog = JSON.parse(readFileSync(resolve(dataDir, 'c1c2-runtime-primitive-backlog.json'), 'utf8')) as { backlog: Array<{ primitive: string; blockedDefinitions: number; semanticReadyDefinitions: number; potentialUnlock: number }> };
if (backlog.backlog.some((entry) => entry.potentialUnlock > entry.semanticReadyDefinitions || entry.semanticReadyDefinitions > entry.blockedDefinitions)) {
  throw new Error('Backlog potentialUnlock accounting is invalid');
}

const verifiedImplementationHead = git('rev-parse', 'HEAD');
const verifiedImplementationTree = git('rev-parse', 'HEAD^{tree}');
const historicalFiles = git('ls-files', 'docs/data/complete-edition/c1a-*', 'docs/data/complete-edition/c1ar-*', 'docs/data/complete-edition/c1b-*', 'docs/data/complete-edition/c1br*', 'docs/data/complete-edition/c1c1*')
  .split(/\r?\n/).filter(Boolean);
const historicalEvidenceHashes = Object.fromEntries(historicalFiles.map((path) => [
  path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
]));
const commands = [proofTests, e2e, regression, typecheck, build, generation];
const evidence = {
  schemaVersion: 2,
  phase: '11A.4-C1C-2',
  measuredAt: new Date().toISOString(),
  baselineHead,
  verifiedImplementationHead,
  verifiedImplementationTree,
  historicalEvidenceHashes,
  questReadyBefore: readyBefore,
  questReadyAfter: ready.length,
  trinketReadyBefore: 2,
  trinketReadyAfter: trinketReady.length,
  sourceSupportedCount: matrix.counts.sourceSupported,
  semanticCompleteCount: matrix.counts.semanticComplete,
  engineCapableCount: matrix.counts.engineCapable,
  adapterCompleteCount: matrix.counts.adapterComplete,
  proofCompleteCount: matrix.counts.proofComplete,
  newlyReadyQuestIds: newlyReady,
  remainingSemanticBlockers: [{ code: 'QUEST_REST_ALLOCATION_SEMANTICS', unresolved: unresolvedRest }],
  remainingPrimitiveBlockers: backlog.backlog,
  proofBindings: binding.resolutions,
  saveReplayResults: executions.filter((entry) => readyRegistry[entry.proofId]?.proofType === 'save-replay'),
  e2eResults: executions.filter((entry) => entry.runner === 'playwright'),
  commands: commands.map((entry) => ({ command: entry.command, exitCode: entry.exitCode })),
  failures: [],
  terminalVerdict: 'C1C2-QUEST-RUNTIME-EXPANSION-ACCEPTED',
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(reportPath, `# C1C-2 Quest Runtime Expansion\n\n`
  + `Verdict: **${evidence.terminalVerdict}**\n\n`
  + `Quest Production Ready measured **${readyBefore} → ${ready.length} / ${COMMUNITY_QUEST_CAPABILITIES.length}**. Trinkets remain **${trinketReady.length} / ${COMMUNITY_TRINKET_CAPABILITIES.length}**.\n\n`
  + `Newly Ready: ${newlyReady.map((id) => `\`${id}\``).join(', ')}.\n\n`
  + `The first typed special-rule family is provision interaction. Deep in the Warrens opens a save-backed mandatory choice after leaving a Room and uses a deterministic transaction ID to prevent duplicate effects. Positive-Firewood Quests remain fail-closed because insufficient recovery capacity is still source-unresolved.\n\n`
  + commands.map((entry) => `- ${entry.command}: exit ${entry.exitCode}`).join('\n') + '\n');

console.log(JSON.stringify({ evidencePath, reportPath, questReadyAfter: ready.length, newlyReady, terminalVerdict: evidence.terminalVerdict }, null, 2));
