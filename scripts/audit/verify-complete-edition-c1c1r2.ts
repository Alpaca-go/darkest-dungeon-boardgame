import { createHash } from 'node:crypto';
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
import {
  analyzeProductionProofBindings,
  evidencePublicationErrors,
  type ProofExecutionResult,
} from '../../src/audit/production-proof-verification';

const root = process.cwd();
const baselineHead = '8bf2ab674e1dec8fde67e11e180b66ccb0b8f34a';
const evidencePath = resolve(root, 'docs/data/complete-edition/c1c1r2-source-backed-rest-allocation-evidence.json');
const reportPath = resolve(root, 'docs/reports/complete-edition/c1c1r2-source-backed-rest-allocation-report.md');
const sourceEvidencePath = resolve(root, 'docs/data/complete-edition/c1c1r2-rest-rule-evidence.json');
const semanticContractPath = resolve(root, 'docs/data/complete-edition/rest-semantic-contract.json');
const rulebookPath = resolve(root, 'docs/DD_EN_COREBOX_RULES.pdf');
const expectedRulebookHash = '9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae';

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

const actualRulebookHash = createHash('sha256').update(readFileSync(rulebookPath)).digest('hex');
const sourceEvidence = JSON.parse(readFileSync(sourceEvidencePath, 'utf8')) as {
  sourceSha256: string;
  evidence: Array<{ evidenceId: string; facts: string[] }>;
};
const semanticContract = JSON.parse(readFileSync(semanticContractPath, 'utf8')) as {
  unresolvedSemantics: unknown[];
  restingPointAllocation: { status: string };
  pointConversion: { status: string };
};
if (actualRulebookHash !== expectedRulebookHash || sourceEvidence.sourceSha256 !== actualRulebookHash) {
  throw new Error('Rest rule evidence is not bound to the frozen Core Rulebook hash');
}
if (!sourceEvidence.evidence.some((entry) => entry.evidenceId === 'C1C1R2:S4:p15')
  || semanticContract.unresolvedSemantics.length > 0
  || semanticContract.restingPointAllocation.status !== 'SOURCE_EXPLICIT'
  || semanticContract.pointConversion.status !== 'SOURCE_EXPLICIT') {
  throw new Error('Rest source semantic contract is incomplete or unresolved');
}

const runtimeSource = readFileSync(resolve(root, 'src/game-engine/quests/quest-runtime.ts'), 'utf8');
const sourceGuardPatterns = [
  /round[- ]robin/i,
  /stress[- ]first/i,
  /for\s*\(let point[\s\S]*hero\.stress\s*>\s*0[\s\S]*hero\.wounds/,
  /export function restAtCamp\s*\(/,
];
const sourceGuardViolations = sourceGuardPatterns.filter((pattern) => pattern.test(runtimeSource)).map((pattern) => pattern.source);
if (sourceGuardViolations.length) throw new Error(`Rest source guard failed: ${sourceGuardViolations.join(', ')}`);

const restE2ePath = resolve(root, 'e2e/phase11a4-c1c1r2-rest-allocation.spec.ts');
const restE2eSource = readFileSync(restE2ePath, 'utf8');
const e2eGuardPatterns = [
  /store\.setState/,
  /recordQuestQualificationEvent/,
  /localStorage\.setItem\s*\([^)]*(questRuntimeState|firewoodTokensRemaining|restingPointsRemaining|stress|wounds)/s,
  /\.stress\s*=(?!=)/,
  /\.wounds\s*=(?!=)/,
];
const e2eGuardViolations = e2eGuardPatterns.filter((pattern) => pattern.test(restE2eSource)).map((pattern) => pattern.source);
if (e2eGuardViolations.length) throw new Error(`Rest E2E source guard failed: ${e2eGuardViolations.join(', ')}`);

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
const restProof = questRegistry['C1C1R2-E2E-REST-ALLOCATION'];
if (restProof?.scope !== 'primitive' || restProof.primitiveId !== 'QUEST_FIREWOOD_RESTING_POINT_SETUP' || restProof.definitionIds.length !== 0) {
  throw new Error('Rest E2E proof is not scoped to the shared Firewood/Resting Point primitive');
}

const proofTests = run(process.execPath, [
  resolve(root, 'node_modules/vitest/vitest.mjs'),
  'run',
  'src/game-engine/c1c1r2-rest-allocation.test.ts',
  'src/game-engine/c1c1r-firewood-real-flow.test.ts',
  'src/game-engine/c1c1-community-quest-production.test.ts',
  'src/audit/production-proof-verification.test.ts',
  '--reporter=json',
]);
let proofJson: { success?: boolean; numPendingTests?: number; numTodoTests?: number; testResults?: Array<{ assertionResults?: Array<{ title?: string; status?: string }> }> };
try { proofJson = JSON.parse(proofTests.stdout); } catch { throw new Error(`Rest proof output is not JSON: ${proofTests.stderr}`); }
const assertions = proofJson.testResults?.flatMap((suite) => suite.assertionResults ?? []) ?? [];
const e2e = run(process.execPath, [resolve(root, 'scripts/e2e/run-community-content-c1c1-e2e.mjs')]);
const commandShell = process.env.ComSpec ?? 'cmd.exe';
const regression = run(commandShell, ['/d', '/s', '/c', 'npm test']);
const build = run(commandShell, ['/d', '/s', '/c', 'npm run build']);
if (proofTests.exitCode !== 0 || proofJson.success !== true || (proofJson.numPendingTests ?? 0) > 0 || (proofJson.numTodoTests ?? 0) > 0) {
  throw new Error('Rest allocation proof suite failed or skipped');
}
if (e2e.exitCode !== 0) throw new Error(`Quest/Rest Playwright failed: ${e2e.stderr || e2e.stdout.slice(-2000)}`);
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
const trinketReady = COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY');
if (ready.length !== 7) throw new Error(`Quest readiness changed unexpectedly: ${ready.length}`);
if (trinketReady.length !== 2) throw new Error(`Trinket readiness changed: ${trinketReady.length}`);
const specialRuleIds = new Set(COMMUNITY_SOURCE_QUESTS.filter((entry) => entry.specialRules.length > 0).map((entry) => entry.id));
if (ready.some((entry) => specialRuleIds.has(entry.definitionId))) throw new Error('Special-rule Quest became Production Ready');

const adapters = Object.values(COMMUNITY_QUEST_RUNTIME_ADAPTERS);
const firewoodQuestIds = adapters.filter((adapter) => (adapter.definition.firewoodSetup?.tokens ?? 0) > 0).map((adapter) => adapter.definitionId);
const zeroFirewoodQuestIds = adapters.filter((adapter) => (adapter.definition.firewoodSetup?.tokens ?? 0) === 0).map((adapter) => adapter.definitionId);
const verifiedImplementationHead = git('rev-parse', 'HEAD');
const verifiedImplementationTree = git('write-tree');
const evidence = {
  schemaVersion: 1,
  phase: '11A.4-C1C-1R2',
  generatedAt: new Date().toISOString(),
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  baselineHead,
  verifiedImplementationHead,
  verifiedImplementationTree,
  evidencePublicationHead: null,
  evidencePublicationHeadReason: 'A commit cannot contain its own hash; the publication commit is reported by the handoff after these generated files are committed.',
  sourceRuleEvidence: {
    path: 'docs/data/complete-edition/c1c1r2-rest-rule-evidence.json',
    source: 'docs/DD_EN_COREBOX_RULES.pdf',
    sha256: actualRulebookHash,
    pages: [11, 15],
  },
  restAllocationSemanticStatus: 'SOURCE_BACKED',
  restPrimitiveStatus: 'IMPLEMENTED_AND_PRODUCTION_PROVEN',
  firewoodQuestIds,
  zeroFirewoodQuestIds,
  questReadyBefore: 7,
  questReadyAfter: ready.length,
  readyQuestIds: ready.map((entry) => entry.definitionId),
  restE2EProof: {
    proofId: restProof.proofId,
    scope: restProof.scope,
    primitiveId: restProof.primitiveId,
    questIdExecuted: 'community-quest-ruins-lvl1-scout-ahead',
    testFile: restProof.testFile,
  },
  questGameplayE2EProof: {
    proofId: 'C1C1R-E2E-SIMPLE-QUEST-ADAPTER',
    scope: 'adapter',
    questIdExecuted: 'community-quest-warrens-lvl1-explore-the-sewers',
  },
  proofBindings: binding.resolutions,
  proofExecutionResults: executions,
  actualExitCodes: {
    frozenSourceTruth: freeze.exitCode,
    sourceEvidenceContract: 0,
    restSourceGuard: sourceGuardViolations.length,
    restE2eSourceGuard: e2eGuardViolations.length,
    restAllocationAndQuestProofs: proofTests.exitCode,
    questAndRestPlaywright: e2e.exitCode,
    fullRegression: regression.exitCode,
    build: build.exitCode,
  },
  verificationCommands: [proofTests.command, e2e.command, regression.command, build.command],
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

const report = `# C1C-1R2 Source-backed Rest Allocation\n\n`
  + `Verification scope: **${evidence.verificationScope}**\n\n`
  + `The verifier measured implementation HEAD \`${verifiedImplementationHead}\` and Git index tree \`${verifiedImplementationTree}\`. The evidence publication commit is intentionally not self-recorded; use the branch HEAD in the handoff.\n\n`
  + `## Source rule\n\n`
  + `Core Rulebook pages 11 and 15 are bound by SHA-256 \`${actualRulebookHash}\`. The rules explicitly give the party the printed Resting Point amount, require a cleared Room and party agreement, let players distribute points, convert each spent point into 1 Life or 1 Stress, and discard Firewood after Rest.\n\n`
  + `## Outcome\n\n`
  + `Automatic target selection, stress-first recovery, and round-robin allocation are removed. Players edit an unpersisted draft, Cancel without mutation, or atomically commit a validated allocation. Invalid entries leave Heroes, Firewood, and Rest counters unchanged.\n\n`
  + `Quest Production Ready remains **${ready.length} / ${COMMUNITY_QUEST_CAPABILITIES.length}**; Trinket Production Ready remains **${trinketReady.length} / ${COMMUNITY_TRINKET_CAPABILITIES.length}**. No special-rule Quest became ready.\n\n`
  + `## Browser proof\n\n`
  + `\`C1C1R2-E2E-REST-ALLOCATION\` is primitive-scoped to \`QUEST_FIREWOOD_RESTING_POINT_SETUP\` and executes \`community-quest-ruins-lvl1-scout-ahead\` through production UI. It creates recoverable Stress through Scout, clears a real Room, proves Cancel unchanged, commits exactly one selected recovery, observes Firewood 1 → 0, and verifies save/reload. The existing Explore the Sewers Quest/XP E2E also remains green.\n\n`
  + `## Measured commands\n\n`
  + Object.entries(evidence.actualExitCodes).map(([name, code]) => `- ${name}: exit ${code}`).join('\n')
  + `\n\nC1C-2 is outside this verification scope.\n`;
writeFileSync(reportPath, report);

console.log(JSON.stringify({
  evidencePath,
  reportPath,
  verifiedImplementationHead,
  verifiedImplementationTree,
  questReadyAfter: ready.length,
  actualExitCodes: evidence.actualExitCodes,
}, null, 2));
