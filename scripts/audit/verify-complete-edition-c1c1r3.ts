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
import {
  REST_SEMANTIC_CONTRACT,
  deriveUnresolvedRestSemantics,
  semanticContractAcceptanceErrors,
} from '../../src/audit/rest-semantic-contract';
import { questReadinessInvariantErrors } from '../../src/audit/quest-readiness-invariants';

const root = process.cwd();
const baselineHead = 'a74ce9ef5664c532af16e26e7b8f8815671631e1';
const evidencePath = resolve(root, 'docs/data/complete-edition/c1c1r3-rest-budget-semantic-closure-evidence.json');
const reportPath = resolve(root, 'docs/reports/complete-edition/c1c1r3-rest-budget-semantic-closure-report.md');
const budgetEvidencePath = resolve(root, 'docs/data/complete-edition/c1c1r3-rest-budget-rule-evidence.json');
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
  'docs/data/complete-edition/c1c1-core-quest-foundation-evidence.json',
  'docs/data/complete-edition/c1c1r-firewood-real-quest-flow-evidence.json',
  'docs/data/complete-edition/c1c1r2-source-backed-rest-allocation-evidence.json',
  'docs/reports/complete-edition/c1c1r2-source-backed-rest-allocation-report.md',
];
const freeze = run('git', ['diff', '--quiet', baselineHead, '--', ...protectedPaths]);
if (freeze.exitCode !== 0) throw new Error('Historical source/evidence freeze changed');

const actualRulebookHash = createHash('sha256').update(readFileSync(rulebookPath)).digest('hex');
const budgetEvidence = JSON.parse(readFileSync(budgetEvidencePath, 'utf8')) as {
  sources: Array<{ sourceId: string; tier: string; author?: string; originalReference?: string; locatorReference?: string; limitations?: string }>;
  questions: Record<string, { status: string; answer: string }>;
  productionConclusion: string;
};
const requiredEvidenceIds = ['C1C1R3:S1:p11,p15,p43', 'C1C1R3:S2:ARGYRIS-ALL-POINTS'];
const presentEvidenceIds = new Set(budgetEvidence.sources.map((source) => source.sourceId));
if (actualRulebookHash !== expectedRulebookHash || requiredEvidenceIds.some((id) => !presentEvidenceIds.has(id))) {
  throw new Error('Rest budget evidence is not bound to the required S1/S2 sources');
}
const designerEvidence = budgetEvidence.sources.find((source) => source.sourceId === 'C1C1R3:S2:ARGYRIS-ALL-POINTS');
if (designerEvidence?.tier !== 'S2_DESIGNER_CLARIFICATION'
  || designerEvidence.author !== 'Argyris Poungouras'
  || !designerEvidence.originalReference
  || !designerEvidence.locatorReference
  || !designerEvidence.limitations) {
  throw new Error('Designer clarification attribution is incomplete');
}
const budgetStatus = (REST_SEMANTIC_CONTRACT.budgetConsumption as { status: string }).status;
const zeroPointStatus = (REST_SEMANTIC_CONTRACT.zeroPointRest as { status: string }).status;
const insufficientStatus = (REST_SEMANTIC_CONTRACT.insufficientRecoveryCapacity as { status: string }).status;
const unresolvedSemantics = deriveUnresolvedRestSemantics();
const semanticErrors = semanticContractAcceptanceErrors();
if (budgetStatus !== 'SOURCE_EXPLICIT'
  || zeroPointStatus !== 'SOURCE_DERIVED'
  || insufficientStatus !== 'SOURCE_UNRESOLVED'
  || unresolvedSemantics.join(',') !== 'insufficientRecoveryCapacity'
  || semanticErrors.length !== 1
  || budgetEvidence.productionConclusion !== 'FAIL_CLOSE_FIREWOOD_QUESTS_UNTIL_INSUFFICIENT_CAPACITY_SEMANTICS_ARE_RESOLVED') {
  throw new Error('Rest semantic fail-close contract is inconsistent');
}

const runtimeSource = readFileSync(resolve(root, 'src/game-engine/quests/quest-runtime.ts'), 'utf8');
const sourceGuardPatterns = [/round[- ]robin/i, /stress[- ]first/i, /export function restAtCamp\s*\(/];
const sourceGuardViolations = sourceGuardPatterns.filter((pattern) => pattern.test(runtimeSource)).map((pattern) => pattern.source);
if (!runtimeSource.includes('REST_ALLOCATION_INCOMPLETE_BUDGET') || sourceGuardViolations.length) {
  throw new Error(`Rest runtime source guard failed: ${sourceGuardViolations.join(', ')}`);
}

const restE2eSource = readFileSync(resolve(root, 'e2e/phase11a4-c1c1r2-rest-allocation.spec.ts'), 'utf8');
const fixtureSource = readFileSync(resolve(root, 'src/test-support/c1c1r3-rest-e2e-fixture.ts'), 'utf8');
const e2eGuardPatterns = [
  /store\.setState/,
  /recordQuestQualificationEvent/,
  /localStorage\.setItem\s*\([^)]*(questRuntimeState|firewoodTokensRemaining|restingPointsRemaining|stress|wounds)/s,
  /\.stress\s*=(?!=)/,
  /\.wounds\s*=(?!=)/,
];
const e2eGuardViolations = e2eGuardPatterns.filter((pattern) => pattern.test(restE2eSource)).map((pattern) => pattern.source);
if (e2eGuardViolations.length
  || !fixtureSource.includes('scoutDungeon(campaign)')
  || !fixtureSource.includes("moveToRoom(campaign, 'A')")
  || /firewoodTokensRemaining\s*:|restingPointsRemaining\s*:|heroes\s*:\s*[^\n]*map/.test(fixtureSource)) {
  throw new Error(`Rest E2E injection guard failed: ${e2eGuardViolations.join(', ')}`);
}

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
if (restProof?.scope !== 'primitive'
  || restProof.primitiveId !== 'QUEST_REST_ALLOCATION_SEMANTICS'
  || restProof.definitionIds.length !== 0) {
  throw new Error('Rest E2E proof has the wrong primitive scope');
}

const proofTests = run(process.execPath, [
  resolve(root, 'node_modules/vitest/vitest.mjs'),
  'run',
  'src/audit/c1c1r3-rest-budget-semantics.test.ts',
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
  throw new Error('Rest budget proof suite failed or skipped');
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
const blocked = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionStatus !== 'PRODUCTION_READY');
const readinessErrors = questReadinessInvariantErrors(COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS);
if (readinessErrors.length) throw new Error(`Quest readiness invariant failed: ${readinessErrors.join('; ')}`);
const trinketReady = COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY');
if (trinketReady.length !== 2) throw new Error(`Trinket readiness changed: ${trinketReady.length}`);
const crimsonSimple = COMMUNITY_SOURCE_QUESTS.filter((entry) => entry.contentSet === 'crimson-court' && entry.specialRules.length === 0);
if (crimsonSimple.some((source) => COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === source.id)?.productionStatus !== 'ADAPTER_REQUIRED')) {
  throw new Error('Simple Crimson Court Quest status changed');
}

const adapters = Object.values(COMMUNITY_QUEST_RUNTIME_ADAPTERS);
const firewoodQuestIds = adapters.filter((adapter) => (adapter.definition.firewoodSetup?.tokens ?? 0) > 0).map((adapter) => adapter.definitionId);
const zeroFirewoodQuestIds = adapters.filter((adapter) => (adapter.definition.firewoodSetup?.tokens ?? 0) === 0).map((adapter) => adapter.definitionId);
if (firewoodQuestIds.some((id) => ready.some((entry) => entry.definitionId === id))) throw new Error('Unresolved Firewood Quest became Ready');
if (zeroFirewoodQuestIds.some((id) => !ready.some((entry) => entry.definitionId === id))) throw new Error('Zero-Firewood Quest was over-blocked');

const verifiedImplementationHead = git('rev-parse', 'HEAD');
const verifiedImplementationTree = git('write-tree');
const evidence = {
  schemaVersion: 1,
  phase: '11A.4-C1C-1R3',
  generatedAt: new Date().toISOString(),
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  baselineHead,
  verifiedImplementationHead,
  verifiedImplementationTree,
  evidencePublicationHead: null,
  evidencePublicationHeadReason: 'A commit cannot contain its own hash; the publication commit is reported by the handoff.',
  sourceRuleEvidence: {
    path: 'docs/data/complete-edition/c1c1r3-rest-budget-rule-evidence.json',
    rulebookSha256: actualRulebookHash,
    designerClarification: designerEvidence,
  },
  budgetConsumptionSemanticStatus: budgetStatus,
  zeroPointRestSemanticStatus: zeroPointStatus,
  insufficientCapacitySemanticStatus: insufficientStatus,
  unresolvedProductionSemantics: unresolvedSemantics,
  restAllocationSemanticStatus: 'SOURCE_UNRESOLVED_FAIL_CLOSED',
  implementedRestPrimitives: ['QUEST_FIREWOOD_RESTING_POINT_SETUP'],
  blockedRestPrimitives: ['QUEST_REST_ALLOCATION_SEMANTICS'],
  firewoodQuestIds,
  zeroFirewoodQuestIds,
  questReadyBefore: 7,
  questReadyAfter: ready.length,
  readyCountIsMeasured: true,
  readyQuestIds: ready.map((entry) => entry.definitionId),
  blockedQuestIds: blocked.map((entry) => entry.definitionId),
  restE2EProof: {
    proofId: restProof.proofId,
    scope: restProof.scope,
    primitiveId: restProof.primitiveId,
    status: executions.find((entry) => entry.proofId === restProof.proofId)?.status,
    semanticClosureEffect: 'Does not override SOURCE_UNRESOLVED insufficient-capacity semantics',
    fixture: 'Schema-restored save generated by production Scout and move commands',
  },
  proofBindings: binding.resolutions,
  proofExecutionResults: executions,
  actualExitCodes: {
    historicalSemanticFreeze: freeze.exitCode,
    restBudgetSourceEvidence: 0,
    semanticContractValidation: 0,
    restRuntimeSourceGuard: sourceGuardViolations.length,
    restE2eInjectionGuard: e2eGuardViolations.length,
    restBudgetAndQuestProofs: proofTests.exitCode,
    questAndRestPlaywright: e2e.exitCode,
    fullRegression: regression.exitCode,
    build: build.exitCode,
  },
  verificationCommands: [proofTests.command, e2e.command, regression.command, build.command],
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

const report = `# C1C-1R3 Rest Budget Semantic Closure\n\n`
  + `Verification scope: **${evidence.verificationScope}**\n\n`
  + `Measured implementation HEAD \`${verifiedImplementationHead}\` and tree \`${verifiedImplementationTree}\`.\n\n`
  + `## Source outcome\n\n`
  + `Core rules plus the attributed designer clarification explicitly require spending all supplied Resting Points. Voluntary partial and zero-point Rest are rejected. The sources do not define what happens when total recoverable Life plus Stress is below the printed budget, so \`QUEST_REST_ALLOCATION_SEMANTICS\` remains fail-closed.\n\n`
  + `## Measured readiness\n\n`
  + `Quest Production Ready is **${ready.length} / ${COMMUNITY_QUEST_CAPABILITIES.length}**, measured without a target-count assertion. The five Firewood Quests are blocked by the unresolved interaction primitive; the two 0/0 Quests remain Ready. Trinket Production Ready remains **${trinketReady.length} / ${COMMUNITY_TRINKET_CAPABILITIES.length}**.\n\n`
  + `Ready Quest IDs:\n\n${ready.map((entry) => `- \`${entry.definitionId}\``).join('\n')}\n\n`
  + `## Browser proof\n\n`
  + `The Rest E2E allocates the complete 8-point budget through eight player clicks, rejects a partial draft, consumes Firewood, and verifies reload. It proves the implemented UI/command path but does not override the unresolved insufficient-capacity rule. The existing Explore the Sewers gameplay/XP E2E remains green.\n\n`
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
  readyCountIsMeasured: true,
  actualExitCodes: evidence.actualExitCodes,
}, null, 2));
