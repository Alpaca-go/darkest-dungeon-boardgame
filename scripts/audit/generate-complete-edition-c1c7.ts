import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_RUNTIME_QUESTS, COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import {
  BOOK_OF_RELAXATION_ID, CHIRURGEONS_CHARM_ID, FORTUNATE_ARMLET_ID,
} from '../../src/audit/production-proof-registry';
import { TRINKET_MODIFIER_CONSUMER_COVERAGE } from '../../src/audit/trinket-modifier-consumer-coverage';

const root = process.cwd();
const dataDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
const baselineHead = '373507c4a3e297371c0a989cf4ec570fb67e596b';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const verifiedImplementationHead = git('rev-parse', 'HEAD');
const verifiedImplementationTree = git('rev-parse', 'HEAD^{tree}');
const verifiedImplementationCommittedAt = git('show', '-s', '--format=%cI', verifiedImplementationHead);
const sha256 = (contents: string | Buffer) => createHash('sha256').update(contents).digest('hex');
const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6)-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalPaths.map((path) => [
  path, sha256(execFileSync('git', ['show', `${baselineHead}:${path}`], { cwd: root })),
]));

const cards = LEVEL_2_TRINKET_CENSUS.map((source) => {
  const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === source.definitionId)!;
  const sides = (capability.trinketSemanticObligations ?? []).map((obligation) => ({
    side: obligation.side,
    triggerMatch: obligation.triggerMatch,
    windowMatch: obligation.windowMatch,
    targetMatch: obligation.targetMatch,
    modifierMatch: obligation.modifierMatch,
    modifierConsumerMatch: obligation.modifierConsumerMatch,
    missingModifierConsumers: obligation.missingModifierConsumers,
    effectMatch: obligation.effectMatch,
    conditionMatch: obligation.conditionMatch,
    triggerScopeComplete: obligation.triggerScopeComplete,
    sourceTimingScopeStatus: obligation.sourceTimingScopeStatus,
    runtimeSliceSemanticComplete: obligation.runtimeSliceSemanticComplete,
    implementationStatus: obligation.implementationStatus,
    blockerCode: obligation.blockerCode,
    semanticMismatches: obligation.semanticMismatches,
    proofIds: obligation.proofIds,
  }));
  return {
    definitionId: source.definitionId,
    sourceSemanticComplete: capability.sourceSemanticComplete,
    runtimeSemanticComplete: capability.runtimeSemanticComplete,
    positiveSideComplete: sides.some((side) => side.side === 'positive' && side.implementationStatus === 'IMPLEMENTED'),
    negativeSideComplete: sides.some((side) => side.side === 'negative' && side.implementationStatus === 'IMPLEMENTED'),
    adapterComplete: capability.adapterComplete,
    productionReady: capability.productionReady,
    blockerCodes: capability.blockerCodes,
    sides,
  };
});
const matrix = {
  schemaVersion: 3, phase: '11A.4-C1C-7', baselineHead,
  verifiedImplementationHead, verifiedImplementationTree, verifiedImplementationCommittedAt,
  sourceTimingOutcome: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', cards,
};
writeFileSync(resolve(dataDir, 'c1c7-level2-trinket-capability-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);

const prior = JSON.parse(readFileSync(resolve(dataDir, 'c1c6-level2-trinket-capability-matrix.json'), 'utf8')) as {
  cards: Array<{ productionReady: boolean }>;
};
const fortunate = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === FORTUNATE_ARMLET_ID)!;
const book = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === BOOK_OF_RELAXATION_ID)!;
const chirurgeons = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID)!;
const family = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === 'community-quest-warrens-lvl1-family-trinkets')!;
const contract = JSON.parse(readFileSync(resolve(dataDir, 'c1c7-voluntary-declaration-timing-contract.json'), 'utf8')) as {
  outcome: string; scopeComplete: boolean; runtimeDecision: { manualDeclarationWindowWired: boolean };
};
const positive = fortunate.trinketSemanticObligations?.find((entry) => entry.side === 'positive')!;
const negative = fortunate.trinketSemanticObligations?.find((entry) => entry.side === 'negative')!;
const evidence = {
  schemaVersion: 3, phase: '11A.4-C1C-7', baselineHead,
  verifiedImplementationHead, verifiedImplementationTree, verifiedImplementationCommittedAt,
  historicalEvidenceHashes,
  voluntaryDeclarationSourceOutcome: contract.outcome,
  voluntaryDeclarationScopeComplete: contract.scopeComplete,
  voluntaryDeclarationRuntimeWired: contract.runtimeDecision.manualDeclarationWindowWired,
  modifierConsumerCoverage: TRINKET_MODIFIER_CONSUMER_COVERAGE,
  fortunatePositiveRuntimeComplete: positive.implementationStatus === 'IMPLEMENTED',
  fortunateNegativeRuntimeComplete: negative.implementationStatus === 'IMPLEMENTED',
  fortunateProductionReady: fortunate.productionReady,
  bookRelaxationProductionReady: book.productionReady,
  bookRelaxationMissingConsumers: book.trinketSemanticObligations?.find((entry) => entry.side === 'negative')?.missingModifierConsumers ?? [],
  level2ReadyBefore: prior.cards.filter((card) => card.productionReady).length,
  level2ReadyAfter: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  level2CompleteForRandomDraw: LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw,
  familyProductionReady: family.productionReady,
  familySelectorReachable: COMMUNITY_RUNTIME_QUESTS.some((entry) => entry.id === family.definitionId),
  chirurgeonsProductionReady: chirurgeons.productionReady,
  proofBindings: positive.proofIds,
  verificationCommand: 'npm run verify:complete-edition-c1c7',
  verificationRequired: true,
  terminalVerdict: 'C1C7-VOLUNTARY-DECLARATION-SOURCE-UNRESOLVED-FORTUNATE-NOT-PROMOTED',
};
writeFileSync(resolve(dataDir, 'c1c7-voluntary-declaration-fortunate-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(reportDir, 'c1c7-voluntary-declaration-fortunate-report.md'), `# C1C-7 Voluntary Declaration Timing & Fortunate Armlet\n\nVerdict contract: **${evidence.terminalVerdict}**\n\nThe Core Rulebook defines applicability, declaration, resolution, flipping, and a battle once-per-turn limit, but does not define a complete legal timing domain across battle, exploration, rest, and Hamlet contexts. The source search is exhausted and still unresolved, so no generic manual declaration runtime was added.\n\nFortunate Armlet's positive Accuracy +1 / Crit +1 post-roll slice is exact and proven through production UI, save/replay, and runtime tests. Its negative side remains blocked by \`TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED\`; the card is not promoted. Book of Relaxation additionally exposes \`TRINKET_MODIFIER_CONSUMER_MISSING\` for dodge. Level 2 readiness remains **${evidence.level2ReadyAfter} / ${LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount}**.\n\nEvidence is bound to implementation commit \`${verifiedImplementationHead}\` and tree \`${verifiedImplementationTree}\`. The independent verifier re-runs the commands; the committed evidence contains no synthetic PASS results.\n`);
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, readyIds: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyIds,
  fortunatePositive: evidence.fortunatePositiveRuntimeComplete, fortunateReady: evidence.fortunateProductionReady,
  completeForRandomDraw: evidence.level2CompleteForRandomDraw }, null, 2));
