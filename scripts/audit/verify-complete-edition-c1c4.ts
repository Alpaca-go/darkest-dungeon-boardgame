import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_PRODUCTION_PROOFS,
  COMMUNITY_SOURCE_QUESTS,
} from '../../src/data/community-reference/production-runtime';
import { PRODUCTION_PROOF_REGISTRY } from '../../src/audit/production-proof-registry';
import { definitionE2eHarnessViolations } from '../../src/audit/production-ui-proof-integrity';
import { deriveUnresolvedRestSemantics, semanticContractAcceptanceErrors } from '../../src/audit/rest-semantic-contract';
import { questReadinessInvariantErrors } from '../../src/audit/quest-readiness-invariants';

const root = process.cwd();
const baselineHead = '5ac8cc58efd73ae0bbc88074ea46dc29e405d899';
const dataDir = resolve(root, 'docs/data/complete-edition');
const sourceDir = resolve(root, 'docs/source/darkest-dungeon-designer-faq');
const evidencePath = resolve(dataDir, 'c1c4-rest-semantic-source-closure-evidence.json');
const reportPath = resolve(root, 'docs/reports/complete-edition/c1c4-rest-semantic-source-closure-report.md');
const commandShell = process.env.ComSpec ?? 'cmd.exe';

interface CommandResult { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000, env?: NodeJS.ProcessEnv): CommandResult {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', shell: false, timeout, maxBuffer: 100 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env },
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
function requirePass(label: string, result: CommandResult): void {
  if (result.exitCode !== 0) throw new Error(`${label} failed: ${result.stderr || result.stdout.slice(-5000)}`);
}

if (run('git', ['diff', '--quiet']).exitCode !== 0 || run('git', ['diff', '--cached', '--quiet']).exitCode !== 0) {
  throw new Error('C1C-4 verifier requires a clean tracked working tree');
}
if (git('rev-parse', baselineHead) !== baselineHead) throw new Error('C1C-4 baseline commit is unavailable');

const historicalChanges = git('diff', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/)
  .filter((path) => /\/c1c3r-|\/c1c3r\./.test(path));
if (historicalChanges.length) throw new Error(`C1C-3R historical evidence changed: ${historicalChanges.join(', ')}`);

const faqProvenance = JSON.parse(readFileSync(resolve(sourceDir, 'source-provenance.json'), 'utf8')) as {
  title: string; sourceUrl: string; retrievalDate: string; acquisitionStatus: string; productionUse: string;
  fileHash: string | null; pageCount: number | null;
};
if (faqProvenance.title !== 'Darkest Dungeon the Board Game FAQ by the Designers'
  || faqProvenance.acquisitionStatus !== 'LOCATED_ACCESS_UNAVAILABLE'
  || faqProvenance.productionUse !== 'NONE'
  || faqProvenance.fileHash !== null || faqProvenance.pageCount !== null) {
  throw new Error('Designer FAQ provenance or fail-closed acquisition status is invalid');
}

const exhaustion = JSON.parse(readFileSync(resolve(dataDir, 'c1c4-rest-source-exhaustion-evidence.json'), 'utf8')) as {
  sourceAuditOutcome: string;
  sourceHierarchyEnforced: boolean;
  sourcesChecked: Array<{ evidenceId: string; tier: string; status: string }>;
  documentsChecked: Array<{ reference: string; pagesChecked: string | unknown[]; status?: string }>;
  searchTerms: string[];
  rejectedStatements: Array<{ reference: string; reason: string }>;
  acceptedStatements: string[];
  unresolvedQuestions: string[];
  insufficientRecoveryCapacity: { status: string; rule: string; sourceEvidenceIds: string[] };
};
const requiredTerms = ['Rest', 'Resting', 'Resting Point', 'Resting Points', 'Firewood', 'recover', 'recovery', 'Life', 'Stress', 'heal', 'healing', 'full health', 'spend', 'all points', 'unused', 'remaining', 'excess'];
if (exhaustion.sourceAuditOutcome !== 'SOURCE_EXHAUSTED_STILL_UNRESOLVED' || !exhaustion.sourceHierarchyEnforced) {
  throw new Error('Source exhaustion verdict or hierarchy is invalid');
}
if (!requiredTerms.every((term) => exhaustion.searchTerms.includes(term))) throw new Error('Required Rest search term missing');
if (!exhaustion.documentsChecked.some((entry) => entry.reference === 'docs/DD_EN_COREBOX_RULES.pdf' && entry.pagesChecked === '1-44')) {
  throw new Error('Full 44-page rulebook audit is not recorded');
}
if (!exhaustion.sourcesChecked.some((entry) => entry.evidenceId === 'C1C4:S1:DESIGNER-FAQ-UNAVAILABLE'
  && entry.status === 'LOCATED_ACCESS_UNAVAILABLE')) throw new Error('Designer FAQ acquisition outcome missing');
if (exhaustion.insufficientRecoveryCapacity.status !== 'SOURCE_UNRESOLVED'
  || exhaustion.insufficientRecoveryCapacity.rule !== 'SOURCE_UNRESOLVED'
  || exhaustion.insufficientRecoveryCapacity.sourceEvidenceIds.length === 0) {
  throw new Error('Insufficient-capacity question was not kept fail-closed');
}

const questionMatrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c4-rest-source-question-matrix.json'), 'utf8')) as {
  sourceHierarchy: string[];
  questions: Array<{ id: string; status: string; sourceEvidenceIds: string[] }>;
};
const expectedHierarchy = [
  'S1_PUBLISHED_RULEBOOK_OFFICIAL_FAQ_ERRATA',
  'S2_ATTRIBUTED_DESIGNER_CLARIFICATION',
  'S3_ATTRIBUTED_PUBLISHER_DESIGNER_FORUM_OR_DISCORD',
  'S4_LOCKED_PROJECT_EVIDENCE',
  'S5_COMMUNITY_INTERPRETATION_SEARCH_LEAD_ONLY',
];
const allowedStatuses = new Set(['SOURCE_EXPLICIT', 'SOURCE_DERIVED', 'SOURCE_UNRESOLVED', 'MODEL_INVARIANT']);
if (questionMatrix.sourceHierarchy.join('|') !== expectedHierarchy.join('|')) throw new Error('Source hierarchy ordering changed');
if (questionMatrix.questions.map((entry) => entry.id).join(',') !== 'Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9') {
  throw new Error('Exact Rest question matrix is incomplete');
}
for (const question of questionMatrix.questions) {
  if (!allowedStatuses.has(question.status) || question.sourceEvidenceIds.length === 0) {
    throw new Error(`${question.id}: invalid status or missing source evidence`);
  }
}

if (deriveUnresolvedRestSemantics().join(',') !== 'insufficientRecoveryCapacity'
  || semanticContractAcceptanceErrors().join(',') !== 'insufficientRecoveryCapacity: SOURCE_UNRESOLVED is not accepted for Production') {
  throw new Error('Rest semantic fail-closed contract changed without an accepted source');
}

const readinessErrors = questReadinessInvariantErrors(COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS);
if (readinessErrors.length) throw new Error(`Quest readiness invariant failed: ${readinessErrors.join('; ')}`);

for (const proof of Object.values(PRODUCTION_PROOF_REGISTRY).filter((entry) => entry.proofType === 'e2e')) {
  if (!proof.proofSurface) throw new Error(`${proof.proofId}: e2e proofSurface missing`);
  if (proof.proofSurface === 'production-ui' && proof.scope === 'definition') {
    const violations = definitionE2eHarnessViolations(proof.testFile, readFileSync(resolve(root, proof.testFile), 'utf8'));
    if (violations.length) throw new Error(`${proof.proofId}: harness-as-production-ui proof: ${violations.map((entry) => entry.reason).join(', ')}`);
  }
}

const proofTests = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/audit/c1c4-rest-source-closure.test.ts',
  'src/audit/c1c3r-semantic-fidelity.test.ts',
  'src/audit/c1c1r3-rest-budget-semantics.test.ts',
  'src/game-engine/c1c1r2-rest-allocation.test.ts',
  'src/game-engine/c1c1r-firewood-real-flow.test.ts',
  'src/game-engine/c1c1-community-quest-production.test.ts',
  'src/audit/production-proof-verification.test.ts']);
requirePass('C1C-4 source/proof/readiness mutation tests', proofTests);
const e2e = run(commandShell, ['/d', '/s', '/c', 'npm run test:e2e:community-content-c1c2']);
requirePass('Production UI Playwright', e2e);
const regression = run(commandShell, ['/d', '/s', '/c', 'npm test']);
requirePass('Full regression', regression);
const typecheck = run(commandShell, ['/d', '/s', '/c', 'npm run typecheck']);
requirePass('Typecheck', typecheck);
const build = run(commandShell, ['/d', '/s', '/c', 'npm run build']);
requirePass('Build', build);

const previousEvidence = existsSync(evidencePath)
  ? JSON.parse(readFileSync(evidencePath, 'utf8')) as { verifiedImplementationHead?: string; measuredAt?: string }
  : {};
const verifiedImplementationHead = previousEvidence.verifiedImplementationHead ?? git('rev-parse', 'HEAD');
const measuredAt = previousEvidence.measuredAt ?? new Date().toISOString();
const generation = run(process.execPath, [resolve(root, 'node_modules/vite-node/vite-node.mjs'), 'scripts/audit/generate-complete-edition-c1c4.ts'], 900_000, {
  C1C4_VERIFIED_HEAD: verifiedImplementationHead,
  C1C4_MEASURED_AT: measuredAt,
});
requirePass('C1C-4 truth rebaseline generation', generation);

const baselineMatrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c3r-runtime-capability-matrix.json'), 'utf8')) as {
  counts: Record<string, number>;
  quests: Array<{ definitionId: string; productionReady: boolean }>;
};
const matrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c4-runtime-capability-matrix.json'), 'utf8')) as {
  schemaVersion: number;
  counts: Record<string, number>;
  restSemanticFreeze: { status: string; unresolvedField: string; sourceAuditOutcome: string };
  quests: Array<{ definitionId: string; productionReady: boolean }>;
};
const coverage = JSON.parse(readFileSync(resolve(dataDir, 'c1c4-quest-semantic-coverage.json'), 'utf8')) as {
  definitions: Array<{ definitionId: string; sourceSemanticComplete: boolean; runtimeSemanticComplete: boolean }>;
};
const measuredCounts: Record<string, number> = {
  questTotal: COMMUNITY_QUEST_CAPABILITIES.length,
  sourceSupported: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.sourceSupported).length,
  sourceSemanticComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.sourceSemanticComplete).length,
  runtimeSemanticComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.runtimeSemanticComplete).length,
  engineCapable: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.engineCapable).length,
  adapterComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.adapterComplete).length,
  productionUiProofComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionUiProofComplete).length,
  productionReady: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionReady).length,
};
if (matrix.schemaVersion !== 5 || coverage.definitions.length !== COMMUNITY_SOURCE_QUESTS.length) {
  throw new Error('C1C-4 capability matrix or semantic coverage shape is invalid');
}
for (const [key, value] of Object.entries(measuredCounts)) {
  if (matrix.counts[key] !== value) throw new Error(`${key}: matrix count is not a truthful measurement`);
}
if (matrix.restSemanticFreeze.status !== 'SOURCE_UNRESOLVED_FAIL_CLOSED'
  || matrix.restSemanticFreeze.unresolvedField !== 'insufficientRecoveryCapacity'
  || matrix.restSemanticFreeze.sourceAuditOutcome !== 'SOURCE_EXHAUSTED_STILL_UNRESOLVED') {
  throw new Error('C1C-4 matrix does not preserve the source-exhausted Rest freeze');
}

const beforeReady = new Set(baselineMatrix.quests.filter((entry) => entry.productionReady).map((entry) => entry.definitionId));
const afterReady = new Set(matrix.quests.filter((entry) => entry.productionReady).map((entry) => entry.definitionId));
const newlyReadyQuestIds = [...afterReady].filter((id) => !beforeReady.has(id));
const newlyBlockedQuestIds = [...beforeReady].filter((id) => !afterReady.has(id));
const remainingBlockedQuestIds = matrix.quests.filter((entry) => !entry.productionReady).map((entry) => entry.definitionId);
const productionUiProofs = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionReady).flatMap((capability) => {
  const manifest = COMMUNITY_QUEST_PRODUCTION_PROOFS[capability.definitionId];
  if (!manifest) throw new Error(`${capability.definitionId}: proof manifest missing`);
  return manifest.e2eTests.map((proofId) => {
    const proof = PRODUCTION_PROOF_REGISTRY[proofId];
    if (!proof || proof.proofSurface !== 'production-ui') throw new Error(`${proofId}: ready definition lacks production-ui proof`);
    return { definitionId: capability.definitionId, proofId, testFile: proof.testFile, proofSurface: proof.proofSurface };
  });
});
const historicalFiles = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c3r-|\/c1c3r\./.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalFiles.map((path) => [
  path,
  createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
]));
const commands = [proofTests, e2e, regression, typecheck, build, generation];
const evidence = {
  schemaVersion: 1,
  phase: '11A.4-C1C-4',
  measuredAt,
  baselineHead,
  verifiedImplementationHead,
  verifiedImplementationTree: git('rev-parse', `${verifiedImplementationHead}^{tree}`),
  historicalEvidenceHashes,
  sourceAuditOutcome: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED',
  sourcesChecked: exhaustion.sourcesChecked,
  acceptedSources: exhaustion.acceptedStatements,
  rejectedSources: exhaustion.rejectedStatements,
  restQuestionMatrix: 'docs/data/complete-edition/c1c4-rest-source-question-matrix.json',
  insufficientRecoveryCapacityBefore: 'SOURCE_UNRESOLVED',
  insufficientRecoveryCapacityAfter: 'SOURCE_UNRESOLVED',
  sourceSemanticCompleteBefore: baselineMatrix.counts.sourceSemanticComplete,
  sourceSemanticCompleteAfter: matrix.counts.sourceSemanticComplete,
  runtimeSemanticCompleteBefore: baselineMatrix.counts.runtimeSemanticComplete,
  runtimeSemanticCompleteAfter: matrix.counts.runtimeSemanticComplete,
  questReadyBefore: baselineMatrix.counts.productionReady,
  questReadyAfter: matrix.counts.productionReady,
  newlyReadyQuestIds,
  newlyBlockedQuestIds,
  remainingBlockedQuestIds,
  productionUiProofs,
  commands: commands.map((entry) => ({ command: entry.command, exitCode: entry.exitCode })),
  failures: [],
  terminalVerdict: 'C1C4-REST-SOURCE-EXHAUSTED-STILL-UNRESOLVED',
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(reportPath, `# C1C-4 Rest Semantic Source Closure & Truth Rebaseline\n\nVerdict: **${evidence.terminalVerdict}**\n\nThe 44-page Core Rulebook, attributable designer clarification, public FAQ locator, and discoverable forum corpus were audited under the declared source hierarchy. The designer FAQ was located but could not be acquired through the available public access paths, and no accessible reliable source resolves excess Resting Points when recovery capacity is insufficient. Rest therefore remains fail-closed; no runtime Rest policy was invented.\n\nQuest Production Ready was truthfully remeasured **${evidence.questReadyBefore} -> ${evidence.questReadyAfter} / ${COMMUNITY_QUEST_CAPABILITIES.length}**. Source-semantic complete: **${evidence.sourceSemanticCompleteBefore} -> ${evidence.sourceSemanticCompleteAfter}**. Runtime-semantic complete: **${evidence.runtimeSemanticCompleteBefore} -> ${evidence.runtimeSemanticCompleteAfter}**.\n\n${commands.map((entry) => `- ${entry.command}: exit ${entry.exitCode}`).join('\n')}\n`);

console.log(JSON.stringify({
  evidencePath,
  reportPath,
  questReadyBefore: evidence.questReadyBefore,
  questReadyAfter: evidence.questReadyAfter,
  terminalVerdict: evidence.terminalVerdict,
}, null, 2));
