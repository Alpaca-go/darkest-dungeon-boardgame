import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_TRINKET_CAPABILITIES,
  COMMUNITY_TRINKET_PRODUCTION_PROOFS,
} from '../../src/data/community-reference/production-runtime';
import {
  ACCURACY_STONE_ID,
  CRITICAL_STONE_ID,
  PRODUCTION_PROOF_REGISTRY,
} from '../../src/audit/production-proof-registry';
import {
  analyzeProductionProofBindings,
  evidencePublicationErrors,
  type ProofExecutionResult,
} from '../../src/audit/production-proof-verification';

const baselineHead = '63793e9eb54a894958a96bc61d3f595bd81de259';
const evidencePath = resolve(process.cwd(), 'docs/data/complete-edition/c1br2-machine-verifiable-production-proof-evidence.json');

interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(command: string, args: string[], timeoutMs = 240_000): CommandResult {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  return {
    command: [command, ...args].join(' '),
    exitCode,
    stdout: result.stdout ?? '',
    stderr: `${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`,
  };
}

function measuredHead(): string {
  const result = run('git', ['rev-parse', 'HEAD']);
  if (result.exitCode !== 0) throw new Error(`Cannot resolve HEAD: ${result.stderr}`);
  return result.stdout.trim();
}

function measuredTree(): string {
  const result = run('git', ['rev-parse', 'HEAD^{tree}']);
  if (result.exitCode !== 0) throw new Error(`Cannot resolve tree: ${result.stderr}`);
  return result.stdout.trim();
}

const protectedPaths = [
  'src/data/community-reference/quests/data.json',
  'src/data/community-reference/trinkets/data.json',
  'docs/data/complete-edition/c1a-asset-manifest.json',
  'docs/data/complete-edition/c1a-literal-review.json',
  'docs/data/complete-edition/c1a-logical-identities.json',
  'docs/data/complete-edition/c1a-rulebook-evidence.json',
  'docs/data/complete-edition/c1a-source-review-lock.json',
  'docs/data/complete-edition/c1ar-semantic-review-lock.json',
  'docs/data/complete-edition/c1b-production-integration-evidence.json',
  'docs/data/complete-edition/c1b-runtime-capability-matrix.json',
  'docs/data/complete-edition/c1b-runtime-primitive-backlog.json',
  'docs/data/complete-edition/c1br-production-acceptance-evidence.json',
  'docs/data/complete-edition/c1br-production-capability-matrix.json',
];

const baseline = run('git', ['diff', '--quiet', baselineHead, '--', ...protectedPaths]);
if (baseline.exitCode !== 0) {
  throw new Error(`Source/semantic/historical baseline changed (exit ${baseline.exitCode})`);
}

const binding = analyzeProductionProofBindings(
  COMMUNITY_TRINKET_PRODUCTION_PROOFS,
  PRODUCTION_PROOF_REGISTRY,
);
const bindingErrors = evidencePublicationErrors(binding, [] as ProofExecutionResult[])
  .filter((error) => !error.includes(' execution missing'));
if (bindingErrors.length) throw new Error(`Proof binding failed: ${bindingErrors.join('; ')}`);

const vitest = run(process.execPath, [
  resolve(process.cwd(), 'node_modules/vitest/vitest.mjs'),
  'run',
  'src/game-engine/c1br-production-proof.test.ts',
  '--reporter=json',
]);
let vitestJson: {
  success?: boolean;
  numPendingTests?: number;
  numTodoTests?: number;
  testResults?: Array<{ assertionResults?: Array<{ title?: string; status?: string }> }>;
} = {};
try {
  vitestJson = JSON.parse(vitest.stdout);
} catch {
  throw new Error(`Vitest proof output is not machine-readable JSON (exit ${vitest.exitCode}): ${vitest.stderr}`);
}
const vitestAssertions = vitestJson.testResults?.flatMap((suite) => suite.assertionResults ?? []) ?? [];

const playwright = run(process.execPath, [resolve(process.cwd(), 'scripts/e2e/run-community-content-c1br-e2e.mjs')]);
const playwrightOutput = `${playwright.stdout}\n${playwright.stderr}`;

const executions: ProofExecutionResult[] = Object.values(PRODUCTION_PROOF_REGISTRY).map((registered) => {
  if (registered.runner === 'vitest') {
    const assertion = vitestAssertions.find((entry) => entry.title === registered.proofId);
    return {
      proofId: registered.proofId,
      runner: registered.runner,
      testFile: registered.testFile,
      status: assertion?.status === 'passed' && vitest.exitCode === 0 ? 'passed'
        : assertion?.status === 'pending' || assertion?.status === 'todo' ? 'skipped'
          : assertion ? 'failed' : 'not-run',
    };
  }
  const escaped = registered.proofId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const executedAndPassed = playwright.exitCode === 0
    && new RegExp(`ok\\s+\\d+[^\\n]*${escaped}`).test(playwrightOutput);
  return {
    proofId: registered.proofId,
    runner: registered.runner,
    testFile: registered.testFile,
    status: executedAndPassed ? 'passed' : playwrightOutput.includes(registered.proofId) ? 'failed' : 'not-run',
  };
});

if (vitest.exitCode !== 0 || vitestJson.success !== true || (vitestJson.numPendingTests ?? 0) > 0 || (vitestJson.numTodoTests ?? 0) > 0) {
  throw new Error(`Required Vitest proofs failed or were skipped (exit ${vitest.exitCode})`);
}
if (playwright.exitCode !== 0) {
  throw new Error(`Required Playwright proofs failed (exit ${playwright.exitCode}): ${playwright.stderr || playwright.stdout.slice(-2000)}`);
}
const publicationErrors = evidencePublicationErrors(binding, executions);
if (publicationErrors.length) throw new Error(`Evidence publication refused: ${publicationErrors.join('; ')}`);

const questReady = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY');
const trinketReady = COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY');
if (questReady.length !== 0) throw new Error(`Quest readiness changed: ${questReady.length}`);
if (JSON.stringify(trinketReady.map((entry) => entry.definitionId).sort()) !== JSON.stringify([ACCURACY_STONE_ID, CRITICAL_STONE_ID])) {
  throw new Error(`Trinket readiness changed: ${trinketReady.map((entry) => entry.definitionId).join(', ')}`);
}

const proofCommand = {
  command: vitest.command,
  exitCode: vitest.exitCode,
  measuredTestCount: vitestAssertions.length,
};
const e2eCommand = {
  command: playwright.command,
  exitCode: playwright.exitCode,
  measuredProofIds: executions.filter((entry) => entry.runner === 'playwright' && entry.status === 'passed').map((entry) => entry.proofId),
};
const verifiedImplementationHead = measuredHead();
const evidence = {
  schemaVersion: 1,
  phase: '11A.4-C1B-R2',
  baselineHead,
  verifiedImplementationHead,
  verifiedTreeHash: measuredTree(),
  evidencePublicationHead: null,
  evidencePublicationNote: 'The evidence commit is intentionally later than verifiedImplementationHead.',
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  registeredProofCount: binding.registeredProofCount,
  requiredProofCount: binding.requiredProofCount,
  resolvedProofCount: binding.resolvedProofCount,
  unresolvedProofCount: binding.unresolvedProofCount,
  crossDefinitionMismatchCount: binding.crossDefinitionMismatchCount,
  wrongTypeCount: binding.wrongTypeCount,
  disabledProofCount: binding.disabledProofCount,
  orphanProofCount: binding.orphanProofIds.length,
  runtimeProofCommands: [proofCommand],
  saveReplayProofCommands: [proofCommand],
  selectorProofCommands: [proofCommand],
  e2eProofCommands: [e2eCommand],
  actualExitCodes: {
    sourceSemanticHistoricalBaseline: baseline.exitCode,
    vitestProofSuite: vitest.exitCode,
    playwrightProofSuite: playwright.exitCode,
  },
  proofExecutions: executions,
  proofBindings: binding.resolutions,
  readyDefinitions: trinketReady.map((capability) => ({
    definitionId: capability.definitionId,
    adapter: capability.measuredRuntimeProof.adapterPresent ? 'RESOLVED' : 'UNRESOLVED',
    productionRuntimeProof: capability.measuredRuntimeProof.productionProofPresent ? 'RESOLVED + PASS' : 'UNRESOLVED',
    saveReplayProof: capability.measuredRuntimeProof.saveReplayProofPresent ? 'RESOLVED + PASS' : 'UNRESOLVED',
    selectorProof: capability.measuredRuntimeProof.selectorProofPresent ? 'RESOLVED + PASS' : 'UNRESOLVED',
    e2eProof: capability.measuredRuntimeProof.e2eProofPresent ? 'RESOLVED + PASS' : 'UNRESOLVED',
  })),
  questProductionReady: questReady.length,
  trinketProductionReady: trinketReady.length,
};

writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({
  evidencePath,
  verifiedImplementationHead,
  registeredProofCount: binding.registeredProofCount,
  requiredProofCount: binding.requiredProofCount,
  resolvedProofCount: binding.resolvedProofCount,
  actualExitCodes: evidence.actualExitCodes,
  questProductionReady: questReady.length,
  trinketProductionReady: trinketReady.length,
}, null, 2));
