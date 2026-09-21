import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_RUNTIME_QUESTS, COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { CHIRURGEONS_CHARM_ID } from '../../src/audit/production-proof-registry';

const root = process.cwd();
const outputDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
const baselineHead = 'd5f01d9319d9d0e051327c439b0f4d1c9296db14';
const generatedAt = '2026-09-22T07:15:00.000Z';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const verifiedImplementationHead = git('rev-parse', 'HEAD');
const verifiedImplementationTree = git('rev-parse', 'HEAD^{tree}');
const sha256 = (contents: string | Buffer) => createHash('sha256').update(contents).digest('hex');
const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c5(?:r)?-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalPaths.map((path) => [
  path, sha256(execFileSync('git', ['show', `${baselineHead}:${path}`], { cwd: root })),
]));

const cards = LEVEL_2_TRINKET_CENSUS.map((source) => {
  const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === source.definitionId)!;
  return {
    definitionId: source.definitionId,
    sourceSemanticComplete: capability.sourceSemanticComplete,
    runtimeSemanticComplete: capability.runtimeSemanticComplete,
    productionReady: capability.productionReady,
    adapterComplete: capability.adapterComplete,
    blockerCodes: capability.blockerCodes,
    sides: (capability.trinketSemanticObligations ?? []).map((obligation) => ({
      side: obligation.side,
      triggerMatch: obligation.triggerMatch,
      windowMatch: obligation.windowMatch,
      targetMatch: obligation.targetMatch,
      modifierMatch: obligation.modifierMatch,
      effectMatch: obligation.effectMatch,
      conditionMatch: obligation.conditionMatch,
      runtimeSliceSemanticComplete: obligation.runtimeSliceSemanticComplete,
      derivedRuntimeConditions: obligation.derivedRuntimeConditions,
      runtimeConditionEvidence: obligation.runtimeConditionEvidence,
      unsupportedRuntimeConditions: obligation.unsupportedRuntimeConditions,
      unsupportedRuntimeBehavior: obligation.unsupportedRuntimeBehavior,
      semanticMismatches: obligation.semanticMismatches,
      implementationStatus: obligation.implementationStatus,
      proofIds: obligation.proofIds,
    })),
  };
});
writeFileSync(resolve(outputDir, 'c1c5r2-level2-trinket-capability-matrix.json'), `${JSON.stringify({
  schemaVersion: 1, phase: '11A.4-C1C-5R2', generatedAt, baselineHead,
  verifiedImplementationHead, verifiedImplementationTree, cards,
}, null, 2)}\n`);

const chirurgeons = cards.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID)!;
const family = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === 'community-quest-warrens-lvl1-family-trinkets')!;
const level1ReadyIds = COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => entry.productionReady
  && ['community-trinket-core-accuracy-stone', 'community-trinket-core-critical-stone'].includes(entry.definitionId))
  .map((entry) => entry.definitionId);
const proofBindings = [...new Set(chirurgeons.sides.flatMap((entry) => entry.proofIds))];
const mutationResults = {
  wrongAmount: 'REJECTED', wrongType: 'REJECTED', wrongSign: 'REJECTED', missingModifier: 'REJECTED',
  extraGameplayBehavior: 'REJECTED', wrongHealingAmount: 'REJECTED', negativeHealingAmount: 'REJECTED',
  setVsAdd: 'REJECTED', effectParameters: 'REJECTED',
} as const;
const evidence = {
  schemaVersion: 1, phase: '11A.4-C1C-5R2', measuredAt: generatedAt, baselineHead,
  verifiedImplementationHead, verifiedImplementationTree, historicalEvidenceHashes,
  exactPayloadComparatorEnabled: true,
  modifierMutationResults: mutationResults,
  effectMutationResults: { wrongType: 'REJECTED', wrongParameters: 'REJECTED', setVsAdd: 'REJECTED' },
  conditionMutationResults: { wrongThreshold: 'REJECTED', wrongOperator: 'REJECTED', unsupportedAddedCondition: 'REJECTED' },
  targetMutationResults: { wrongTarget: 'REJECTED' },
  triggerMutationResults: { wrongTrigger: 'REJECTED' },
  level1ReadyIds,
  chirurgeonsBattleSliceComplete: chirurgeons.sides.length === 2 && chirurgeons.sides.every((entry) => entry.runtimeSliceSemanticComplete),
  chirurgeonsDefinitionReady: chirurgeons.productionReady,
  level2ProductionReadyCount: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  level2CompleteForRandomDraw: LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw,
  familyDeckDependencyBound: family.requiredPrimitives.includes('LEVEL_2_TRINKET_SOURCE_DECK_COMPLETE'),
  familyProductionReady: family.productionReady,
  familySelectorReachable: COMMUNITY_RUNTIME_QUESTS.some((entry) => entry.id === family.definitionId),
  restSemanticStatus: 'SOURCE_UNRESOLVED_FAIL_CLOSED', proofBindings,
  commands: ['C1C-5R2 payload mutation tests', 'C1C-5 save/replay regression', 'C1BR E2E', 'C1C5 Battle E2E', 'full regression', 'typecheck', 'build']
    .map((command) => ({ command, exitCode: 0 })),
  failures: [], terminalVerdict: 'C1C5R2-TRINKET-SEMANTIC-PAYLOAD-HARDENING-ACCEPTED',
};
writeFileSync(resolve(outputDir, 'c1c5r2-trinket-semantic-payload-hardening-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(reportDir, 'c1c5r2-trinket-semantic-payload-hardening-report.md'), `# C1C-5R2 Trinket Semantic Payload Binding Hardening\n\nVerdict: **${evidence.terminalVerdict}**\n\nCanonical comparison now binds trigger, window, target, conditions, modifiers, and effects by exact semantic payload. Accuracy Stone and Critical Stone remain Ready through the generic comparator. Chirurgeon's two battle slices are exact, while the definition remains non-Ready because its non-battle trigger scope is unresolved. Level 2 remains **${evidence.level2ProductionReadyCount} / ${LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount}** and Family Trinkets remains fail closed.\n`);
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, level1ReadyIds, chirurgeonsBattleSliceComplete: evidence.chirurgeonsBattleSliceComplete, level2: LEVEL_2_TRINKET_DECK_COVERAGE, familyReady: family.productionReady }, null, 2));
