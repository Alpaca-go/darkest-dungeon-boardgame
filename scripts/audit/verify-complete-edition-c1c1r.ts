import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_PRODUCTION_PROOFS,
  COMMUNITY_QUEST_RUNTIME_ADAPTERS,
  COMMUNITY_SOURCE_QUESTS,
  COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';
import { PRODUCTION_PROOF_REGISTRY } from '../../src/audit/production-proof-registry';
import { QUEST_ROOM_TOKEN_BEHAVIOR_MATRIX } from '../../src/game-engine/dungeon';
import {
  analyzeProductionProofBindings,
  evidencePublicationErrors,
  type ProofExecutionResult,
} from '../../src/audit/production-proof-verification';

const root = process.cwd();
const baselineHead = '89a419d5c1eb178a5e2aa80d7231bfaca99d90d5';
const evidencePath = resolve(root, 'docs/data/complete-edition/c1c1r-firewood-real-quest-flow-evidence.json');
const e2ePath = resolve(root, 'e2e/phase11a4-c1c1r-real-community-quest.spec.ts');

interface CommandResult { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000): CommandResult {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    timeout,
    maxBuffer: 50 * 1024 * 1024,
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
if (freeze.exitCode !== 0) throw new Error('Source / C1A / C1A-R semantic freeze changed');

const e2eSource = readFileSync(e2ePath, 'utf8');
const sourceGuardViolations = [
  /recordQuestQualificationEvent/,
  /store\.setState/,
  /localStorage\.setItem\s*\([\s\S]{0,500}(questRuntimeState|qualifiedUnitCount|xpEarned)/,
].filter((pattern) => pattern.test(e2eSource)).map((pattern) => pattern.source);
if (sourceGuardViolations.length) throw new Error(`E2E source guard failed: ${sourceGuardViolations.join(', ')}`);

const referencedProofIds = new Set(Object.values(COMMUNITY_QUEST_PRODUCTION_PROOFS).flatMap((manifest) => [
  ...manifest.productionTests,
  ...manifest.saveReplayTests,
  ...manifest.selectorTests,
  ...manifest.e2eTests,
]));
const questRegistry = Object.fromEntries(Object.entries(PRODUCTION_PROOF_REGISTRY).filter(([proofId]) => referencedProofIds.has(proofId)));
const binding = analyzeProductionProofBindings(COMMUNITY_QUEST_PRODUCTION_PROOFS, questRegistry);
const bindingErrors = evidencePublicationErrors(binding, []).filter((error) => !error.includes(' execution missing'));
if (bindingErrors.length) throw new Error(`Quest proof binding failed: ${bindingErrors.join('; ')}`);

for (const adapter of Object.values(COMMUNITY_QUEST_RUNTIME_ADAPTERS)) {
  const source = COMMUNITY_SOURCE_QUESTS.find((entry) => entry.id === adapter.definitionId);
  if (!source || JSON.stringify(adapter.definition.firewoodSetup) !== JSON.stringify(source.firewood)) {
    throw new Error(`Firewood source setup mismatch: ${adapter.definitionId}`);
  }
}

const proofTests = run(process.execPath, [
  resolve(root, 'node_modules/vitest/vitest.mjs'),
  'run',
  'src/game-engine/c1c1r-firewood-real-flow.test.ts',
  'src/game-engine/c1c1-community-quest-production.test.ts',
  'src/audit/production-proof-verification.test.ts',
  '--reporter=json',
]);
let proofJson: { success?: boolean; numPendingTests?: number; numTodoTests?: number; testResults?: Array<{ assertionResults?: Array<{ title?: string; status?: string }> }> };
try { proofJson = JSON.parse(proofTests.stdout); } catch { throw new Error(`Quest proof output is not JSON: ${proofTests.stderr}`); }
const assertions = proofJson.testResults?.flatMap((suite) => suite.assertionResults ?? []) ?? [];
const e2e = run(process.execPath, [resolve(root, 'scripts/e2e/run-community-content-c1c1-e2e.mjs')]);
const commandShell = process.env.ComSpec ?? 'cmd.exe';
const regression = run(commandShell, ['/d', '/s', '/c', 'npm test']);
const build = run(commandShell, ['/d', '/s', '/c', 'npm run build']);
if (proofTests.exitCode !== 0 || proofJson.success !== true || (proofJson.numPendingTests ?? 0) > 0 || (proofJson.numTodoTests ?? 0) > 0) throw new Error('Quest proof suite failed or skipped');
if (e2e.exitCode !== 0) throw new Error(`Real Quest Playwright failed: ${e2e.stderr || e2e.stdout.slice(-2000)}`);
if (regression.exitCode !== 0) throw new Error(`Regression failed: ${regression.stderr || regression.stdout.slice(-2000)}`);
if (build.exitCode !== 0) throw new Error(`Build failed: ${build.stderr || build.stdout.slice(-2000)}`);

const e2eOutput = `${e2e.stdout}\n${e2e.stderr}`;
const executions: ProofExecutionResult[] = Object.values(questRegistry).map((proof) => ({
  proofId: proof.proofId,
  runner: proof.runner,
  testFile: proof.testFile,
  status: proof.runner === 'vitest'
    ? assertions.some((entry) => entry.title === proof.proofId && entry.status === 'passed') ? 'passed' : 'failed'
    : new RegExp(`ok\\s+\\d+[^\\n]*${proof.proofId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(e2eOutput) ? 'passed' : 'failed',
}));
const publicationErrors = evidencePublicationErrors(binding, executions);
if (publicationErrors.length) throw new Error(`Evidence publication refused: ${publicationErrors.join('; ')}`);

const ready = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY');
const blocked = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionStatus !== 'PRODUCTION_READY');
const trinketReady = COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY');
if (trinketReady.length !== 2) throw new Error(`Trinket readiness changed: ${trinketReady.length}`);
const specialRuleIds = new Set(COMMUNITY_SOURCE_QUESTS.filter((entry) => entry.specialRules.length > 0).map((entry) => entry.id));
if (ready.some((entry) => specialRuleIds.has(entry.definitionId))) throw new Error('Special-rule Quest became Production Ready');
const crimsonSimple = COMMUNITY_SOURCE_QUESTS.filter((entry) => entry.contentSet === 'crimson-court' && entry.specialRules.length === 0);
if (crimsonSimple.some((source) => COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === source.id)?.productionStatus !== 'ADAPTER_REQUIRED')) {
  throw new Error('Simple Crimson Court Quest status changed');
}

const previousEvidence = JSON.parse(readFileSync(resolve(root, 'docs/data/complete-edition/c1c1-core-quest-foundation-evidence.json'), 'utf8')) as { questProductionReadyAfter: number };
const backlogDocument = JSON.parse(readFileSync(resolve(root, 'docs/data/complete-edition/c1c1r-runtime-primitive-backlog.json'), 'utf8')) as { backlog: unknown[] };
const adapterLevelE2EProofs = Object.values(questRegistry).filter((proof) => proof.proofType === 'e2e' && proof.scope === 'adapter').map((proof) => ({ proofId: proof.proofId, adapterId: proof.adapterId }));
const definitionLevelE2EProofs = Object.values(questRegistry).filter((proof) => proof.proofType === 'e2e' && proof.scope !== 'adapter').map((proof) => ({ proofId: proof.proofId, definitionIds: proof.definitionIds }));
const evidence = {
  schemaVersion: 1,
  phase: '11A.4-C1C-1R',
  generatedAt: new Date().toISOString(),
  baselineHead,
  verifiedImplementationHead: git('rev-parse', 'HEAD'),
  verifiedTreeHash: git('rev-parse', 'HEAD^{tree}'),
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  primitiveClassification: {
    compoundNormalization: ['QUEST_ROOM_TOKEN_COMPOSITION', 'QUEST_FIREWOOD_RESTING_POINT_SETUP'],
    implemented: ['QUEST_ROOM_TOKEN_COMPOSITION', 'QUEST_FIREWOOD_RESTING_POINT_SETUP', 'QUEST_XP_UNIT_ACCOUNTING'],
  },
  firewoodRuntimeSupport: {
    sourceBackedDefinitionSetup: true,
    initializedInQuestRuntimeState: true,
    saveReloadStable: true,
    legalConsumptionCommand: 'restAtCamp',
    productionUiSeam: 'rest-at-camp',
    setups: Object.values(COMMUNITY_QUEST_RUNTIME_ADAPTERS).map((adapter) => ({ definitionId: adapter.definitionId, ...adapter.definition.firewoodSetup })),
  },
  roomTokenBehaviorMatrix: QUEST_ROOM_TOKEN_BEHAVIOR_MATRIX,
  questReadyBefore: previousEvidence.questProductionReadyAfter,
  questReadyAfter: ready.length,
  readyQuestDefinitionIds: ready.map((entry) => entry.definitionId),
  blockedQuestDefinitionIds: blocked.map((entry) => entry.definitionId),
  realE2EQuestIds: ['community-quest-warrens-lvl1-explore-the-sewers'],
  adapterLevelE2EProofs,
  definitionLevelE2EProofs,
  proofBindings: binding.resolutions,
  proofExecutions: executions,
  actualExitCodes: {
    sourceSemanticFreeze: freeze.exitCode,
    e2eSourceGuard: sourceGuardViolations.length,
    capabilityAndRuntimeProofs: proofTests.exitCode,
    realQuestPlaywright: e2e.exitCode,
    fullRegression: regression.exitCode,
    build: build.exitCode,
  },
  verificationCommands: [proofTests.command, e2e.command, regression.command, build.command],
  remainingRuntimeBacklog: backlogDocument.backlog,
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ evidencePath, verifiedImplementationHead: evidence.verifiedImplementationHead, questReadyAfter: evidence.questReadyAfter, actualExitCodes: evidence.actualExitCodes }, null, 2));
