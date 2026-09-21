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
import { C1C3_MULTI_PRIMITIVE_QUEST_IDS, PRODUCTION_PROOF_REGISTRY } from '../../src/audit/production-proof-registry';
import { analyzeProductionProofBindings, evidencePublicationErrors, type ProofExecutionResult } from '../../src/audit/production-proof-verification';
import { deriveUnresolvedRestSemantics, semanticContractAcceptanceErrors } from '../../src/audit/rest-semantic-contract';
import { questReadinessInvariantErrors } from '../../src/audit/quest-readiness-invariants';

const root = process.cwd();
const baselineHead = 'ba31e00cbf00a193881bafaa732e627a469d04ee';
const dataDir = resolve(root, 'docs/data/complete-edition');
const evidencePath = resolve(dataDir, 'c1c3-multi-primitive-quest-rule-closure-evidence.json');
const reportPath = resolve(root, 'docs/reports/complete-edition/c1c3-multi-primitive-quest-rule-closure-report.md');
const commandShell = process.env.ComSpec ?? 'cmd.exe';
interface CommandResult { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000, env?: NodeJS.ProcessEnv): CommandResult {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false, timeout, maxBuffer: 80 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env } });
  return { command: [command, ...args].join(' '), exitCode: result.status ?? 1, stdout: result.stdout ?? '', stderr: `${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}` };
}
function git(...args: string[]): string {
  const result = run('git', args);
  if (result.exitCode !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) {
  throw new Error('C1C-3 verifier requires a clean tracked working tree');
}
const historicalChanges = git('diff', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter(Boolean).filter((path) => !path.includes('/c1c3-'));
if (historicalChanges.length) throw new Error(`Historical evidence changed: ${historicalChanges.join(', ')}`);
if (deriveUnresolvedRestSemantics().join(',') !== 'insufficientRecoveryCapacity'
  || semanticContractAcceptanceErrors().join(',') !== 'insufficientRecoveryCapacity: SOURCE_UNRESOLVED is not accepted for Production') {
  throw new Error('Rest semantic freeze changed');
}
const readinessErrors = questReadinessInvariantErrors(COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS);
if (readinessErrors.length) throw new Error(`Quest readiness invariant failed: ${readinessErrors.join('; ')}`);
for (const definitionId of C1C3_MULTI_PRIMITIVE_QUEST_IDS) {
  const adapter = COMMUNITY_QUEST_RUNTIME_ADAPTERS[definitionId];
  if (!adapter) throw new Error(`${definitionId}: adapter missing`);
  for (const rule of adapter.specialRules) {
    if (!rule.id || !rule.trigger || !rule.effects.length || !rule.sourceReferences.length || rule.sourceReferences.includes('manual')) throw new Error(`${definitionId}: invalid source-bound typed rule`);
    if (!Number.isInteger(rule.printedSpecialRuleIndex)) throw new Error(`${definitionId}: printed rule index missing`);
  }
}

const proofTests = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/game-engine/c1c3-multi-primitive-quest-rule.test.ts',
  'src/game-engine/c1c2-quest-runtime-expansion.test.ts',
  'src/game-engine/c1c1-community-quest-production.test.ts',
  'src/game-engine/c1c1r-firewood-real-flow.test.ts',
  'src/audit/c1c1r3-rest-budget-semantics.test.ts',
  'src/audit/production-proof-verification.test.ts', '--reporter=json']);
let proofJson: { success?: boolean; numPendingTests?: number; numTodoTests?: number; testResults?: Array<{ assertionResults?: Array<{ title?: string; status?: string }> }> };
try { proofJson = JSON.parse(proofTests.stdout); } catch { throw new Error(`Proof output is not JSON: ${proofTests.stderr}`); }
const assertions = proofJson.testResults?.flatMap((suite) => suite.assertionResults ?? []) ?? [];
if (proofTests.exitCode !== 0 || proofJson.success !== true || (proofJson.numPendingTests ?? 0) || (proofJson.numTodoTests ?? 0)) throw new Error('C1C-3 proof suite failed, skipped, or has todo tests');
const e2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1c3']);
if (e2e.exitCode !== 0) throw new Error(`C1C-3 Playwright failed: ${e2e.stderr || e2e.stdout.slice(-3000)}`);
const regression = run(commandShell, ['/d', '/s', '/c', 'npm test']);
if (regression.exitCode !== 0) throw new Error(`Full regression failed: ${regression.stderr || regression.stdout.slice(-3000)}`);
const typecheck = run(commandShell, ['/d', '/s', '/c', 'npm run typecheck']);
if (typecheck.exitCode !== 0) throw new Error(`Typecheck failed: ${typecheck.stderr || typecheck.stdout.slice(-3000)}`);
const build = run(commandShell, ['/d', '/s', '/c', 'npm run build']);
if (build.exitCode !== 0) throw new Error(`Build failed: ${build.stderr || build.stdout.slice(-3000)}`);

const oldMatrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c2-runtime-capability-matrix.json'), 'utf8')) as { quests: Array<{ definitionId: string; productionReady: boolean }>; counts: Record<string, number> };
const previousEvidence = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, 'utf8')) as { verifiedImplementationHead?: string; measuredAt?: string } : {};
const verifiedImplementationHead = previousEvidence.verifiedImplementationHead ?? git('rev-parse', 'HEAD');
const measuredAt = previousEvidence.measuredAt ?? new Date().toISOString();
const generation = run(process.execPath, [resolve(root, 'node_modules/vite-node/vite-node.mjs'), 'scripts/audit/generate-complete-edition-c1c3.ts'], 900_000, { C1C3_VERIFIED_HEAD: verifiedImplementationHead, C1C3_MEASURED_AT: measuredAt });
if (generation.exitCode !== 0) throw new Error(`C1C-3 generation failed: ${generation.stderr}`);
const matrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c3-runtime-capability-matrix.json'), 'utf8')) as { counts: Record<string, number> };
const backlog = JSON.parse(readFileSync(resolve(dataDir, 'c1c3-runtime-primitive-backlog.json'), 'utf8')) as { singlePrimitiveUnlocks: Array<{ blockedDefinitions: number; semanticReadyDefinitions: number; potentialUnlock: number }>; primitiveBundleUnlocks: Array<{ primitiveIds: string[]; definitionIds: string[]; potentialUnlock: number }> };
if (backlog.singlePrimitiveUnlocks.some((entry) => entry.potentialUnlock > entry.semanticReadyDefinitions || entry.semanticReadyDefinitions > entry.blockedDefinitions)) throw new Error('Single-primitive accounting invalid');
if (backlog.primitiveBundleUnlocks.some((entry) => entry.primitiveIds.length < 1 || entry.primitiveIds.length > 3 || entry.potentialUnlock !== entry.definitionIds.length)) throw new Error('Bundle accounting invalid');

const oldReadyIds = new Set(oldMatrix.quests.filter((entry) => entry.productionReady).map((entry) => entry.definitionId));
const ready = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionReady);
const newlyReady = ready.filter((entry) => !oldReadyIds.has(entry.definitionId)).map((entry) => entry.definitionId);
if (!C1C3_MULTI_PRIMITIVE_QUEST_IDS.some((id) => newlyReady.includes(id))) throw new Error('No multi-primitive Quest was promoted');
if (COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => entry.productionReady).length !== 2) throw new Error('Trinket readiness regressed');

const manifests = Object.fromEntries(C1C3_MULTI_PRIMITIVE_QUEST_IDS.map((id) => [id, COMMUNITY_QUEST_PRODUCTION_PROOFS[id]]));
const proofIds = new Set(Object.values(manifests).flatMap((manifest) => [...manifest.productionTests, ...manifest.saveReplayTests, ...manifest.selectorTests, ...manifest.e2eTests]));
const registry = Object.fromEntries(Object.entries(PRODUCTION_PROOF_REGISTRY).filter(([id]) => proofIds.has(id)));
const binding = analyzeProductionProofBindings(manifests, registry);
const e2eOutput = `${e2e.stdout}\n${e2e.stderr}`;
const executions: ProofExecutionResult[] = Object.values(registry).map((proof) => ({
  proofId: proof.proofId, runner: proof.runner, testFile: proof.testFile,
  status: proof.runner === 'vitest'
    ? assertions.some((entry) => entry.title === proof.proofId && entry.status === 'passed') ? 'passed' : 'failed'
    : new RegExp(`ok\\s+\\d+[^\\n]*${proof.proofId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(e2eOutput) ? 'passed' : 'failed',
}));
const publicationErrors = evidencePublicationErrors(binding, executions);
if (publicationErrors.length) throw new Error(`Evidence publication refused: ${publicationErrors.join('; ')}`);

const historicalFiles = git('ls-files', 'docs/data/complete-edition/c1c2-*', 'docs/reports/complete-edition/c1c2-*').split(/\r?\n/).filter(Boolean);
const historicalEvidenceHashes = Object.fromEntries(historicalFiles.map((path) => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]));
const commands = [proofTests, e2e, regression, typecheck, build, generation];
const evidence = {
  schemaVersion: 3, phase: '11A.4-C1C-3', measuredAt, baselineHead,
  verifiedImplementationHead, verifiedImplementationTree: git('rev-parse', `${verifiedImplementationHead}^{tree}`),
  historicalEvidenceHashes,
  questReadyBefore: oldMatrix.counts.productionReady, questReadyAfter: ready.length,
  semanticCompleteBefore: oldMatrix.counts.semanticComplete, semanticCompleteAfter: matrix.counts.semanticComplete,
  newlyImplementedPrimitives: ['QUEST_RULE_ROOM_SETUP', 'QUEST_RULE_TOKEN_INTERACTION', 'QUEST_RULE_QUEST_COMPLETION'],
  newlyReadyQuestIds: newlyReady,
  singlePrimitiveBacklog: backlog.singlePrimitiveUnlocks,
  primitiveBundleBacklog: backlog.primitiveBundleUnlocks,
  proofBindings: binding.resolutions,
  saveReplayResults: executions.filter((entry) => registry[entry.proofId]?.proofType === 'save-replay'),
  e2eResults: executions.filter((entry) => entry.runner === 'playwright'),
  fullCampaignUiPathProven: false,
  checkpointPolicy: 'production-generated checkpoint + UI continuation',
  commands: commands.map((entry) => ({ command: entry.command, exitCode: entry.exitCode })),
  failures: [],
  terminalVerdict: 'C1C3-MULTI-PRIMITIVE-QUEST-RULE-CLOSURE-ACCEPTED',
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(reportPath, `# C1C-3 Multi-Primitive Quest Rule Closure\n\nVerdict: **${evidence.terminalVerdict}**\n\nQuest Production Ready measured **${evidence.questReadyBefore} → ${evidence.questReadyAfter} / ${COMMUNITY_QUEST_CAPABILITIES.length}**.\n\nNewly Ready: ${newlyReady.map((id) => `\`${id}\``).join(', ')}.\n\nTyped room setup, quest-token interaction, and quest-completion predicates now execute through persisted engine transactions. Browser proof uses production-generated checkpoints plus UI continuation; fullCampaignUiPathProven remains false. Remote CI was not claimed; this is LOCAL MEASURED VERIFICATION.\n\n${commands.map((entry) => `- ${entry.command}: exit ${entry.exitCode}`).join('\n')}\n`);
console.log(JSON.stringify({ evidencePath, reportPath, questReadyAfter: ready.length, newlyReady, terminalVerdict: evidence.terminalVerdict }, null, 2));
