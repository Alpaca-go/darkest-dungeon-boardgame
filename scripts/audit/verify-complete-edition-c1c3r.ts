import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_PRODUCTION_PROOFS,
  COMMUNITY_QUEST_RUNTIME_ADAPTERS,
  COMMUNITY_SOURCE_QUESTS,
  FAMILY_TRINKETS_ID,
  TAINTED_TRINKETS_ID,
} from '../../src/data/community-reference/production-runtime';
import { C1C3_MULTI_PRIMITIVE_QUEST_IDS, PRODUCTION_PROOF_REGISTRY } from '../../src/audit/production-proof-registry';
import { definitionE2eHarnessViolations } from '../../src/audit/production-ui-proof-integrity';
import { expectedSemanticObligationIds, semanticCoverageErrors } from '../../src/audit/quest-semantic-coverage';
import { deriveUnresolvedRestSemantics, semanticContractAcceptanceErrors } from '../../src/audit/rest-semantic-contract';
import { questReadinessInvariantErrors } from '../../src/audit/quest-readiness-invariants';

const root = process.cwd();
const baselineHead = '82fb21fe87c584c59e0f0dc0116492d191bc7e07';
const dataDir = resolve(root, 'docs/data/complete-edition');
const evidencePath = resolve(dataDir, 'c1c3r-semantic-fidelity-repair-evidence.json');
const reportPath = resolve(root, 'docs/reports/complete-edition/c1c3r-semantic-fidelity-repair-report.md');
const commandShell = process.env.ComSpec ?? 'cmd.exe';

interface CommandResult { command: string; exitCode: number; stdout: string; stderr: string }
function run(command: string, args: string[], timeout = 900_000, env?: NodeJS.ProcessEnv): CommandResult {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', shell: false, timeout, maxBuffer: 100 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env },
  });
  return {
    command: [command, ...args].join(' '), exitCode: result.status ?? 1,
    stdout: result.stdout ?? '', stderr: `${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`,
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
  throw new Error('C1C-3R verifier requires a clean tracked working tree');
}
const historicalChanges = git('diff', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c3-(?!r)/.test(path));
if (historicalChanges.length) throw new Error(`C1C-3 historical evidence changed: ${historicalChanges.join(', ')}`);
if (deriveUnresolvedRestSemantics().join(',') !== 'insufficientRecoveryCapacity'
  || semanticContractAcceptanceErrors().join(',') !== 'insufficientRecoveryCapacity: SOURCE_UNRESOLVED is not accepted for Production') {
  throw new Error('Rest semantic freeze changed');
}
const readinessErrors = questReadinessInvariantErrors(COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS);
if (readinessErrors.length) throw new Error(`Quest readiness invariant failed: ${readinessErrors.join('; ')}`);

for (const definitionId of C1C3_MULTI_PRIMITIVE_QUEST_IDS) {
  const capability = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === definitionId)!;
  const expectedIds = expectedSemanticObligationIds(definitionId)!;
  if (capability.sourceSemanticComplete !== true || capability.runtimeSemanticComplete !== false || capability.productionReady !== false) {
    throw new Error(`${definitionId}: false-ready definition was not truthfully demoted`);
  }
  if (capability.semanticObligationCount !== expectedIds.length || semanticCoverageErrors(definitionId, capability.semanticObligations).length) {
    throw new Error(`${definitionId}: semantic obligation census failed`);
  }
  const adapter = COMMUNITY_QUEST_RUNTIME_ADAPTERS[definitionId];
  if (!adapter) throw new Error(`${definitionId}: useful partial adapter was removed`);
  for (const obligation of capability.semanticObligations.filter((entry) => entry.implementationStatus === 'IMPLEMENTED' || entry.implementationStatus === 'PARTIAL')) {
    if (!obligation.runtimeBindingId || !obligation.runtimePrimitive || obligation.proofIds.length === 0) {
      throw new Error(`${definitionId}/${obligation.obligationId}: typed effect binding incomplete`);
    }
    if (!adapter.specialRules.some((rule) => rule.id === obligation.runtimeBindingId)) {
      throw new Error(`${definitionId}/${obligation.obligationId}: runtime binding does not resolve to a typed effect`);
    }
  }
}
if (COMMUNITY_QUEST_CAPABILITIES.some((entry) => entry.productionReady && !(
  entry.sourceSupported && entry.sourceSemanticComplete && entry.runtimeSemanticComplete && entry.engineCapable
  && entry.adapterComplete && entry.selectorReachable && entry.productionProofComplete
  && entry.saveReplayProofComplete && entry.e2eProofComplete && entry.productionUiProofComplete
))) throw new Error('Partial adapter promotion detected');

const productionUiProofs = [] as Array<{ definitionId: string; proofId: string; testFile: string; proofSurface: string }>;
for (const capability of COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionReady)) {
  const manifest = COMMUNITY_QUEST_PRODUCTION_PROOFS[capability.definitionId];
  if (!manifest) throw new Error(`${capability.definitionId}: proof manifest missing`);
  for (const proofId of manifest.e2eTests) {
    const proof = PRODUCTION_PROOF_REGISTRY[proofId];
    if (!proof || proof.proofSurface !== 'production-ui') throw new Error(`${proofId}: production-ui proof surface missing`);
    if (proof.scope === 'definition') {
      const violations = definitionE2eHarnessViolations(proof.testFile, readFileSync(resolve(root, proof.testFile), 'utf8'));
      if (violations.length) throw new Error(`${proofId}: harness-as-definition-proof: ${violations.map((entry) => entry.reason).join(', ')}`);
    }
    productionUiProofs.push({ definitionId: capability.definitionId, proofId, testFile: proof.testFile, proofSurface: proof.proofSurface });
  }
}

const proofTests = run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/audit/c1c3r-semantic-fidelity.test.ts',
  'src/game-engine/c1c3-multi-primitive-quest-rule.test.ts',
  'src/game-engine/c1c2-quest-runtime-expansion.test.ts',
  'src/game-engine/c1c1-community-quest-production.test.ts',
  'src/game-engine/c1c1r-firewood-real-flow.test.ts',
  'src/audit/production-proof-verification.test.ts']);
requirePass('C1C-3R obligation/save/selector proofs', proofTests);
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
const generation = run(process.execPath, [resolve(root, 'node_modules/vite-node/vite-node.mjs'), 'scripts/audit/generate-complete-edition-c1c3r.ts'], 900_000, {
  C1C3R_VERIFIED_HEAD: verifiedImplementationHead,
  C1C3R_MEASURED_AT: measuredAt,
});
requirePass('C1C-3R artifact generation', generation);

const matrix = JSON.parse(readFileSync(resolve(dataDir, 'c1c3r-runtime-capability-matrix.json'), 'utf8')) as {
  schemaVersion: number;
  counts: { sourceSemanticComplete: number; runtimeSemanticComplete: number; productionReady: number };
  quests: Array<{ definitionId: string; productionReady: boolean; runtimeSemanticComplete: boolean }>;
};
const coverage = JSON.parse(readFileSync(resolve(dataDir, 'c1c3r-quest-semantic-coverage.json'), 'utf8')) as {
  definitions: Array<{ definitionId: string; obligations: unknown[] }>;
};
if (matrix.schemaVersion !== 4 || matrix.counts.productionReady !== 3) throw new Error('Capability matrix V4 truth measurement failed');
if (coverage.definitions.length !== COMMUNITY_SOURCE_QUESTS.length) throw new Error('Semantic coverage manifest is incomplete');
const readyIds = matrix.quests.filter((entry) => entry.productionReady).map((entry) => entry.definitionId);
const falseReadyDefinitionsDetected = [TAINTED_TRINKETS_ID, FAMILY_TRINKETS_ID];
const historicalFiles = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c3-(?!r)/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalFiles.map((path) => [
  path,
  createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
]));
const commands = [proofTests, e2e, regression, typecheck, build, generation];
const evidence = {
  schemaVersion: 1,
  phase: '11A.4-C1C-3R',
  measuredAt,
  baselineHead,
  verifiedImplementationHead,
  verifiedImplementationTree: git('rev-parse', `${verifiedImplementationHead}^{tree}`),
  historicalEvidenceHashes,
  questReadyBefore: 5,
  questReadyAfter: matrix.counts.productionReady,
  readyQuestIds: readyIds,
  falseReadyDefinitionsDetected,
  falseReadyDefinitionsDemoted: falseReadyDefinitionsDetected,
  falseReadyDefinitionsRePromoted: [],
  sourceSemanticCompleteCount: matrix.counts.sourceSemanticComplete,
  runtimeSemanticCompleteCount: matrix.counts.runtimeSemanticComplete,
  semanticCoverage: {
    manifest: 'docs/data/complete-edition/c1c3r-quest-semantic-coverage.json',
    definitionCount: coverage.definitions.length,
    taintedObligations: expectedSemanticObligationIds(TAINTED_TRINKETS_ID)?.length,
    familyObligations: expectedSemanticObligationIds(FAMILY_TRINKETS_ID)?.length,
  },
  productionUiProofs,
  restSemanticStatus: {
    unresolvedField: 'insufficientRecoveryCapacity',
    status: 'SOURCE_UNRESOLVED_FAIL_CLOSED',
  },
  commands: commands.map((entry) => ({ command: entry.command, exitCode: entry.exitCode })),
  failures: [],
  terminalVerdict: 'C1C3R-SEMANTIC-FIDELITY-REPAIR-ACCEPTED',
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(reportPath, `# C1C-3R Semantic Fidelity & False-Green Repair\n\nVerdict: **${evidence.terminalVerdict}**\n\nQuest Production Ready was truthfully remeasured **${evidence.questReadyBefore} → ${evidence.questReadyAfter} / ${COMMUNITY_QUEST_CAPABILITIES.length}**. Tainted Trinkets and Family Trinkets remain useful partial engine foundations, but are excluded from production selectors until every source semantic obligation has a typed runtime binding and production-UI proof.\n\nSource-semantic complete: **${evidence.sourceSemanticCompleteCount}**. Runtime-semantic complete: **${evidence.runtimeSemanticCompleteCount}**. Rest remains fail-closed on \`insufficientRecoveryCapacity\`.\n\n${commands.map((entry) => `- ${entry.command}: exit ${entry.exitCode}`).join('\n')}\n`);
console.log(JSON.stringify({ evidencePath, reportPath, questReadyAfter: evidence.questReadyAfter, terminalVerdict: evidence.terminalVerdict }, null, 2));
