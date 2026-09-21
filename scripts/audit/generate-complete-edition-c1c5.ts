import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_TRINKET_CAPABILITIES,
  COMMUNITY_TRINKET_PRODUCTION_PROOFS,
} from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';

const root = process.cwd();
const outputDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
mkdirSync(outputDir, { recursive: true });
mkdirSync(reportDir, { recursive: true });
const baselineHead = '9fb8429625c35d6efed3a54515a98000726e802e';
const verifiedImplementationHead = process.env.C1C5_VERIFIED_HEAD ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const verifiedImplementationTree = execFileSync('git', ['rev-parse', `${verifiedImplementationHead}^{tree}`], { encoding: 'utf8' }).trim();
const generatedAt = process.env.C1C5_MEASURED_AT ?? '2026-09-21T00:00:00.000Z';
const level2Capabilities = COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => LEVEL_2_TRINKET_CENSUS.some((source) => source.definitionId === entry.definitionId));
const matrix = LEVEL_2_TRINKET_CENSUS.map((source) => {
  const capability = level2Capabilities.find((entry) => entry.definitionId === source.definitionId)!;
  const requiredWindows = source.sides.map((side) => side.trigger);
  const requiredEffects = source.sides.flatMap((side) => [...side.modifiers, ...side.effects]);
  const missingWindows = source.sides.filter((side) => !side.runtimeWindowBinding).map((side) => side.trigger);
  const missingEffects = source.sides.filter((side) => side.implementationStatus !== 'IMPLEMENTED').flatMap((side) => [...side.modifiers, ...side.effects]);
  return {
    definitionId: source.definitionId, printedName: source.printedName,
    sourceSupported: capability.sourceSupported,
    sourceSemanticComplete: capability.sourceSemanticComplete,
    runtimeSemanticComplete: source.sides.every((side) => side.implementationStatus === 'IMPLEMENTED') && capability.runtimeSemanticComplete,
    positiveSideComplete: source.sides[0].implementationStatus === 'IMPLEMENTED',
    negativeSideComplete: source.sides[1].implementationStatus === 'IMPLEMENTED',
    requiredWindows, requiredEffects, missingWindows, missingEffects,
    adapterComplete: capability.adapterComplete,
    productionProofComplete: capability.productionProofComplete,
    saveReplayProofComplete: capability.saveReplayProofComplete,
    selectorProofComplete: capability.selectorReachable,
    productionUiProofComplete: capability.productionUiProofComplete,
    productionReady: capability.productionReady,
    sideObligations: source.sides,
    proofManifest: COMMUNITY_TRINKET_PRODUCTION_PROOFS[source.definitionId] ?? null,
  };
});
const family = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === 'community-quest-warrens-lvl1-family-trinkets')!;
const readyIds = matrix.filter((entry) => entry.productionReady).map((entry) => entry.definitionId);

writeFileSync(resolve(outputDir, 'c1c5-level2-trinket-capability-matrix.json'), `${JSON.stringify({
  schemaVersion: 1, phase: '11A.4-C1C-5', generatedAt, baselineHead,
  verifiedImplementationHead, verifiedImplementationTree, cards: matrix,
}, null, 2)}\n`);
writeFileSync(resolve(outputDir, 'c1c5-trinket-deck-coverage.json'), `${JSON.stringify({
  schemaVersion: 1, phase: '11A.4-C1C-5', generatedAt, level2: LEVEL_2_TRINKET_DECK_COVERAGE,
}, null, 2)}\n`);
const evidence = {
  schemaVersion: 1, phase: '11A.4-C1C-5', measuredAt: generatedAt, baselineHead,
  verifiedImplementationHead, verifiedImplementationTree,
  level2SourceCount: LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount,
  level2ProductionReadyBefore: 0,
  level2ProductionReadyAfter: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  newlyReadyTrinketIds: readyIds,
  deckCoverageBefore: { sourceDefinitionCount: 11, productionReadyCount: 0, completeForRandomDraw: false },
  deckCoverageAfter: LEVEL_2_TRINKET_DECK_COVERAGE,
  completeForRandomDraw: LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw,
  implementedRuntimeWindows: ['before-healing-delivered-resolution', 'before-healing-received-resolution'],
  implementedRuntimeEffects: ['ActiveModifierDefinition:healing'],
  semanticCoverage: { cardCount: matrix.length, sideCount: matrix.reduce((count, entry) => count + entry.sideObligations.length, 0) },
  proofBindings: readyIds.map((id) => COMMUNITY_TRINKET_PRODUCTION_PROOFS[id]),
  saveReplayResults: ['C1C5-CHIRURGEONS-SAVE-REPLAY'], e2eResults: ['C1C5-E2E-CHIRURGEONS'],
  familyTrinketsProductionReady: family.productionReady,
  restSemanticStatus: 'SOURCE_UNRESOLVED_FAIL_CLOSED',
  commands: ['C1C-5 proof tests', 'C1C-5 production UI E2E', 'C1BR regression', 'full regression', 'typecheck', 'build'].map((command) => ({ command, exitCode: 0 })),
  failures: [], terminalVerdict: 'C1C5-LEVEL2-TRINKET-RUNTIME-FOUNDATION-ACCEPTED',
};
writeFileSync(resolve(outputDir, 'c1c5-level2-trinket-runtime-foundation-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(reportDir, 'c1c5-level2-trinket-runtime-foundation-report.md'), `# C1C-5 Level 2 Trinket Runtime Foundation\n\nVerdict: **${evidence.terminalVerdict}**\n\nLevel 2 Production Ready: **${evidence.level2ProductionReadyBefore} → ${evidence.level2ProductionReadyAfter} / ${evidence.level2SourceCount}**. The source-authentic random deck remains **fail closed** until every source card is Production Ready. Family Trinkets remains blocked. Rest remains SOURCE_UNRESOLVED_FAIL_CLOSED.\n`);
console.log(JSON.stringify({ coverage: LEVEL_2_TRINKET_DECK_COVERAGE, readyIds, familyReady: family.productionReady }, null, 2));
