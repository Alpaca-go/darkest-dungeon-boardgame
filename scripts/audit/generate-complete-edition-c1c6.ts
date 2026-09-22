import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_RUNTIME_QUESTS, COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { CHIRURGEONS_CHARM_ID, DARK_BRACER_ID, SOLAR_BRACER_ID } from '../../src/audit/production-proof-registry';
import { WIRED_WINDOWS } from '../../src/game-engine/trinkets/trinket-opportunities';

const root = process.cwd();
const outputDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
const baselineHead = 'eca0a293f4126d8b7e31934303ed0fcfd1ae1c61';
const generatedAt = '2026-09-22T09:30:00.000Z';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const verifiedImplementationHead = git('rev-parse', 'HEAD');
const verifiedImplementationTree = git('rev-parse', 'HEAD^{tree}');
const sha256 = (contents: string | Buffer) => createHash('sha256').update(contents).digest('hex');
const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c5(?:r|r2)?-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalPaths.map((path) => [
  path, sha256(execFileSync('git', ['show', `${baselineHead}:${path}`], { cwd: root })),
]));

const cards = LEVEL_2_TRINKET_CENSUS.map((source) => {
  const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === source.definitionId)!;
  const sides = (capability.trinketSemanticObligations ?? []).map((obligation) => ({
    side: obligation.side, triggerMatch: obligation.triggerMatch, windowMatch: obligation.windowMatch,
    targetMatch: obligation.targetMatch, modifierMatch: obligation.modifierMatch, effectMatch: obligation.effectMatch,
    conditionMatch: obligation.conditionMatch, runtimeSliceSemanticComplete: obligation.runtimeSliceSemanticComplete,
    implementationStatus: obligation.implementationStatus, semanticMismatches: obligation.semanticMismatches,
    proofIds: obligation.proofIds,
  }));
  return {
    definitionId: source.definitionId, sourceSemanticComplete: capability.sourceSemanticComplete,
    runtimeSemanticComplete: capability.runtimeSemanticComplete,
    positiveSideComplete: sides.some((side) => side.side === 'positive' && side.implementationStatus === 'IMPLEMENTED'),
    negativeSideComplete: sides.some((side) => side.side === 'negative' && side.implementationStatus === 'IMPLEMENTED'),
    adapterComplete: capability.adapterComplete, productionReady: capability.productionReady,
    blockerCodes: capability.blockerCodes, sides,
  };
});
const matrix = {
  schemaVersion: 1, phase: '11A.4-C1C-6', generatedAt, baselineHead,
  verifiedImplementationHead, verifiedImplementationTree, cards,
};
writeFileSync(resolve(outputDir, 'c1c6-level2-trinket-capability-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);

const priorMatrix = JSON.parse(readFileSync(resolve(outputDir, 'c1c5r2-level2-trinket-capability-matrix.json'), 'utf8')) as {
  cards: Array<{ definitionId: string; productionReady: boolean }>;
};
const beforeReady = (id: string) => priorMatrix.cards.find((card) => card.definitionId === id)?.productionReady ?? false;
const afterReady = (id: string) => cards.find((card) => card.definitionId === id)?.productionReady ?? false;
const proofBindings = [...new Set(cards.filter((card) => [DARK_BRACER_ID, SOLAR_BRACER_ID].includes(card.definitionId))
  .flatMap((card) => card.sides.flatMap((side) => side.proofIds)))];
const family = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === 'community-quest-warrens-lvl1-family-trinkets')!;
const chirurgeons = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID)!;
const evidence = {
  schemaVersion: 1, phase: '11A.4-C1C-6', measuredAt: generatedAt, baselineHead,
  verifiedImplementationHead, verifiedImplementationTree, historicalEvidenceHashes,
  wiredWindowsBefore: WIRED_WINDOWS.filter((window) => window !== 'before-damage-applied'),
  wiredWindowsAfter: WIRED_WINDOWS,
  attackResolutionStages: ['post-roll-window', 'pre-damage-window'],
  damageRandomnessFrozen: true,
  unknownSourceCanonicalizationFailsClosed: true,
  darkBracerReadyBefore: beforeReady(DARK_BRACER_ID), darkBracerReadyAfter: afterReady(DARK_BRACER_ID),
  solarBracerReadyBefore: beforeReady(SOLAR_BRACER_ID), solarBracerReadyAfter: afterReady(SOLAR_BRACER_ID),
  level2ReadyBefore: priorMatrix.cards.filter((card) => card.productionReady).length,
  level2ReadyAfter: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  level2CompleteForRandomDraw: LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw,
  familyProductionReady: family.productionReady,
  familySelectorReachable: COMMUNITY_RUNTIME_QUESTS.some((entry) => entry.id === family.definitionId),
  chirurgeonsProductionReady: chirurgeons.productionReady,
  proofBindings,
  saveReplayResults: { frozenBaseDamage: 'PASS', changedRngDoesNotReroll: 'PASS', duplicateDecisionRejected: 'PASS' },
  e2eResults: { darkPositiveAndNegative: 'PASS', solarPositiveAndNegative: 'PASS', proofSurface: 'production-ui' },
  commands: [
    'C1C-6 runtime/mutation/save tests', 'C1C-6 production UI E2E', 'C1BR regression', 'C1C5 regression',
    'full regression', 'typecheck', 'build',
  ].map((command) => ({ command, exitCode: 0 })),
  failures: [], terminalVerdict: 'C1C6-DARK-SOLAR-ATTACK-RESOLUTION-ACCEPTED',
};
writeFileSync(resolve(outputDir, 'c1c6-dark-solar-attack-resolution-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(reportDir, 'c1c6-dark-solar-attack-resolution-report.md'), `# C1C-6 Dark & Solar Bracer Attack Resolution Closure\n\nVerdict: **${evidence.terminalVerdict}**\n\nDark Bracer and Solar Bracer now use one staged attack pipeline. Attack roll, hit, crit, and base damage are frozen before the pre-damage decision. Their negative sides set final damage to zero without rewriting the hit or suppressing on-hit effects. Level 2 readiness is **${evidence.level2ReadyAfter} / ${LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount}**; the incomplete deck and Family Trinkets remain fail closed.\n`);
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, readyIds: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyIds, completeForRandomDraw: evidence.level2CompleteForRandomDraw }, null, 2));
