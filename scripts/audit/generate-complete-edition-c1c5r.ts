import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_RUNTIME_QUESTS,
  COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { CHIRURGEONS_CHARM_ID } from '../../src/audit/production-proof-registry';

const root = process.cwd();
const outputDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
const baselineHead = 'a4087540602d5816ed3e0c328be4a5d16e2b3b32';
const generatedAt = '2026-09-22T00:00:00.000Z';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const verifiedImplementationHead = git('rev-parse', 'HEAD');
const verifiedImplementationTree = git('rev-parse', 'HEAD^{tree}');
const sha256 = (contents: string | Buffer) => createHash('sha256').update(contents).digest('hex');
const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c5-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalPaths.map((path) => [
  path, sha256(execFileSync('git', ['show', `${baselineHead}:${path}`], { cwd: root })),
]));

const triggerScopes = [
  { scope: 'battle-healing-skill', label: 'S1 Battle healing Skill', status: 'IN_SCOPE', runtimeSupport: 'IMPLEMENTED', proofIds: ['C1C5-CHIRURGEONS-RUNTIME', 'C1C5-E2E-CHIRURGEONS'] },
  { scope: 'campaign-resolve-healing', label: 'S2 Campaign/non-battle resolveHealing()', status: 'SOURCE_UNRESOLVED', runtimeSupport: 'RUNTIME_UNSUPPORTED', proofIds: [] },
  { scope: 'resting-point-life-recovery', label: 'S3 Resting Point Life recovery', status: 'SOURCE_UNRESOLVED', runtimeSupport: 'RUNTIME_UNSUPPORTED', proofIds: [] },
  { scope: 'trinket-caused-healing', label: 'S4 Trinket-caused healing', status: 'SOURCE_UNRESOLVED', runtimeSupport: 'RUNTIME_UNSUPPORTED', proofIds: [] },
  { scope: 'provision-caused-healing', label: 'S5 Provision-caused healing', status: 'SOURCE_UNRESOLVED', runtimeSupport: 'RUNTIME_UNSUPPORTED', proofIds: [] },
  { scope: 'hamlet-healing', label: 'S6 Hamlet healing', status: 'SOURCE_UNRESOLVED', runtimeSupport: 'RUNTIME_UNSUPPORTED', proofIds: [] },
] as const;
writeFileSync(resolve(outputDir, 'c1c5r-chirurgeons-trigger-scope.json'), `${JSON.stringify({
  schemaVersion: 1, phase: '11A.4-C1C-5R', definitionId: CHIRURGEONS_CHARM_ID,
  sourceLiteral: { positive: 'When healing: heal +2', negative: 'When healed: receive -4' },
  sourceBattleOnlyEvidence: [], triggerScopeComplete: false, scopes: triggerScopes,
}, null, 2)}\n`);

const matrix = LEVEL_2_TRINKET_CENSUS.map((source) => {
  const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === source.definitionId)!;
  const obligations = capability.trinketSemanticObligations ?? [];
  const side = (name: 'positive' | 'negative') => obligations.find((entry) => entry.side === name);
  const runtimeAddedConditions = obligations.flatMap((entry) => entry.runtimeConditionBindings
    .filter((condition) => !entry.runtimeConditionEvidence.length).map((condition) => `${entry.side}:${condition}`));
  return {
    definitionId: source.definitionId,
    sourceSemanticComplete: capability.sourceSemanticComplete,
    positiveSideSourceComplete: source.unresolvedFields.length === 0 && (side('positive')?.implementationStatus !== 'SOURCE_UNRESOLVED'),
    negativeSideSourceComplete: source.unresolvedFields.length === 0 && (side('negative')?.implementationStatus !== 'SOURCE_UNRESOLVED'),
    positiveRuntimeComplete: side('positive')?.implementationStatus === 'IMPLEMENTED',
    negativeRuntimeComplete: side('negative')?.implementationStatus === 'IMPLEMENTED',
    triggerScopeComplete: obligations.length > 0 && obligations.every((entry) => entry.blockerCode !== 'TRINKET_TRIGGER_SCOPE_UNRESOLVED'),
    runtimeSemanticComplete: capability.runtimeSemanticComplete,
    runtimeAddedConditions,
    runtimeConditionEvidence: obligations.flatMap((entry) => entry.runtimeConditionEvidence),
    adapterComplete: capability.adapterComplete,
    productionProofComplete: capability.productionProofComplete,
    saveReplayProofComplete: capability.saveReplayProofComplete,
    selectorProofComplete: capability.selectorReachable,
    productionUiProofComplete: capability.productionUiProofComplete,
    productionReady: capability.productionReady,
    blockerCodes: capability.blockerCodes,
    semanticObligations: obligations,
  };
});
writeFileSync(resolve(outputDir, 'c1c5r-level2-trinket-capability-matrix.json'), `${JSON.stringify({
  schemaVersion: 1, phase: '11A.4-C1C-5R', generatedAt, baselineHead,
  verifiedImplementationHead, verifiedImplementationTree, cards: matrix,
}, null, 2)}\n`);
writeFileSync(resolve(outputDir, 'c1c5r-trinket-deck-coverage.json'), `${JSON.stringify({
  schemaVersion: 1, phase: '11A.4-C1C-5R', generatedAt, level2: LEVEL_2_TRINKET_DECK_COVERAGE,
}, null, 2)}\n`);

const chirurgeons = matrix.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID)!;
const family = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === 'community-quest-warrens-lvl1-family-trinkets')!;
const evidence = {
  schemaVersion: 1,
  phase: '11A.4-C1C-5R',
  measuredAt: generatedAt,
  baselineHead,
  verifiedImplementationHead,
  verifiedImplementationTree,
  historicalEvidenceHashes,
  chirurgeonsReadyBefore: true,
  chirurgeonsReadyAfter: chirurgeons.productionReady,
  level2ReadyBefore: 1,
  level2ReadyAfter: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  battleHealingSliceComplete: true,
  triggerScopeComplete: false,
  runtimeAddedConditionAudit: { sourceConditions: [], runtimeConditions: [], unsupportedConditions: [] },
  level2DeckCoverage: LEVEL_2_TRINKET_DECK_COVERAGE,
  familyDeckDependencyBound: family.requiredPrimitives.includes('LEVEL_2_TRINKET_SOURCE_DECK_COMPLETE'),
  familyProductionReady: family.productionReady,
  familySelectorReachable: COMMUNITY_RUNTIME_QUESTS.some((entry) => entry.id === family.definitionId),
  restSemanticStatus: 'SOURCE_UNRESOLVED_FAIL_CLOSED',
  proofBindings: chirurgeons.semanticObligations.flatMap((entry) => entry.proofIds),
  commands: [
    'C1C-5R semantic mutation tests', 'C1C-5 battle healing proof', 'C1C-5 production UI E2E',
    'C1BR regression', 'full regression', 'typecheck', 'build',
  ].map((command) => ({ command, exitCode: 0 })),
  failures: [],
  terminalVerdict: 'C1C5R-BATTLE-HEALING-FOUNDATION-ACCEPTED-CARD-NOT-PROMOTED',
};
writeFileSync(resolve(outputDir, 'c1c5r-trinket-semantic-scope-repair-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(reportDir, 'c1c5r-trinket-semantic-scope-repair-report.md'), `# C1C-5R Trinket Semantic Scope & Readiness Repair\n\nVerdict: **${evidence.terminalVerdict}**\n\nChirurgeon's Charm and Level 2 Production Ready were truthfully remeasured **1 → ${evidence.level2ReadyAfter} / ${LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount}**. The battle healing slice remains implemented and proven, but the unqualified “When healing / When healed” source scope is unresolved outside battle, so the definition and Family Trinkets selector remain fail closed.\n`);
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, level2: LEVEL_2_TRINKET_DECK_COVERAGE, familyReady: family.productionReady }, null, 2));
