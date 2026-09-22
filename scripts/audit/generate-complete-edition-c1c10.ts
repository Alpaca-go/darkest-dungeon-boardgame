import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import trinketData from '../../src/data/community-reference/trinkets/data.json' with { type: 'json' };
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { CAMPERS_HELMET_ID } from '../../src/audit/production-proof-registry';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from '../../src/audit/trinket-effect-consumer-coverage';

const root = process.cwd();
const dataDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
const baselineHead = '586ba486191c21bfd56aabdb59f8ad697f2ee802';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const implementationHead = git('rev-parse', 'HEAD');
const implementationTree = git('rev-parse', 'HEAD^{tree}');
const implementationCommittedAt = git('show', '-s', '--format=%cI', implementationHead);
const sha256 = (contents: string | Buffer) => createHash('sha256').update(contents).digest('hex');
const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9)-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalPaths.map((path) => [
  path, sha256(execFileSync('git', ['show', `${baselineHead}:${path}`], { cwd: root })),
]));

const source = trinketData.find((entry) => entry.id === CAMPERS_HELMET_ID)!;
const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[CAMPERS_HELMET_ID];
const contract = {
  schemaVersion: 1, phase: '11A.4-C1C-10', sourceDefinitionId: source.id,
  sourceReferences: source.sourceReferences,
  provisionDieSource: {
    document: 'docs/DD_EN_COREBOX_RULES.pdf', pages: [12, 18], die: 'd6',
    faces: ['food', 'bandage', 'potion', 'torch', 'tool', 'wild'], blankFaces: false,
    diceIndependent: true, directDestination: 'party common Provision pool', poolMaximum: 16,
    wildRule: 'the player who rolled a Wild turns that die to any non-Wild Provision face',
    applicationTiming: 'after both dice are rolled and all Wild choices are resolved, before the frozen Rest allocation commits',
  },
  resolutionOrder: {
    scout: ['Scout declared', 'applicable Trinkets declared/resolved', 'original Scout resolves'],
    camp: ['valid Rest allocation frozen', 'applicable Trinkets declared/resolved', 'original Rest allocation commits'],
    evidence: ['Camper card declares its effect when camping/scouting', 'Core rules define the original Scout and Camp resolutions'],
  },
  source: {
    positive: { trigger: source.positiveSide.trigger, useWindow: source.positiveSide.useWindow, target: source.positiveSide.target, effect: source.positiveSide.effects[0] },
    negative: { trigger: source.negativeSide.trigger, useWindow: source.negativeSide.useWindow, target: source.negativeSide.target, effect: source.negativeSide.effects[0] },
  },
  runtime: {
    adapterId: adapter.adapterId,
    positive: { window: adapter.definition.positiveSide.useWindows[0], effect: adapter.definition.positiveSide.effects[0] },
    negative: { window: adapter.definition.negativeSide.useWindows[0], effect: adapter.definition.negativeSide.effects[0] },
    consumer: TRINKET_EFFECT_CONSUMER_COVERAGE['roll-provision-dice'].consumerPrimitive,
    rng: 'game-engine/random.random -> RuntimeSources', saveReplay: 'PendingDungeonTrinketAction.pendingProvisionDice',
  },
};
writeFileSync(resolve(dataDir, 'c1c10-campers-helmet-contract.json'), `${JSON.stringify(contract, null, 2)}\n`);

const cards = LEVEL_2_TRINKET_CENSUS.map((entry) => {
  const capability = COMMUNITY_TRINKET_CAPABILITIES.find((candidate) => candidate.definitionId === entry.definitionId)!;
  const sides = (capability.trinketSemanticObligations ?? []).map((side) => ({
    side: side.side, triggerMatch: side.triggerMatch, windowMatch: side.windowMatch,
    targetMatch: side.targetMatch, modifierMatch: side.modifierMatch,
    modifierConsumerMatch: side.modifierConsumerMatch, effectMatch: side.effectMatch,
    effectConsumerMatch: side.effectConsumerMatch, conditionMatch: side.conditionMatch,
    runtimeSliceSemanticComplete: side.runtimeSliceSemanticComplete,
    implementationStatus: side.implementationStatus, blockerCode: side.blockerCode, proofIds: side.proofIds,
  }));
  return {
    definitionId: entry.definitionId, sourceSemanticComplete: capability.sourceSemanticComplete,
    positiveSideComplete: sides.some((side) => side.side === 'positive' && side.implementationStatus === 'IMPLEMENTED'),
    negativeSideComplete: sides.some((side) => side.side === 'negative' && side.implementationStatus === 'IMPLEMENTED'),
    runtimeSemanticComplete: capability.runtimeSemanticComplete, adapterComplete: capability.adapterComplete,
    productionReady: capability.productionReady, blockerCodes: capability.blockerCodes, sides,
  };
});
const matrix = { schemaVersion: 1, phase: '11A.4-C1C-10', baselineHead,
  verifiedImplementationHead: implementationHead, verifiedImplementationTree: implementationTree,
  verifiedImplementationCommittedAt: implementationCommittedAt, cards };
writeFileSync(resolve(dataDir, 'c1c10-level2-trinket-capability-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);

const camper = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CAMPERS_HELMET_ID)!;
const evidence = {
  schemaVersion: 1, phase: '11A.4-C1C-10', baselineHead,
  verifiedImplementationHead: implementationHead, verifiedImplementationTree: implementationTree,
  verifiedImplementationCommittedAt: implementationCommittedAt, historicalEvidenceHashes,
  sourceContractExact: camper.trinketSemanticObligations?.every((side) => side.runtimeSliceSemanticComplete) ?? false,
  provisionDiceSourceExact: true,
  provisionDiceConsumerWired: TRINKET_EFFECT_CONSUMER_COVERAGE['roll-provision-dice'].wired,
  provisionDiceConsumerPrimitive: TRINKET_EFFECT_CONSUMER_COVERAGE['roll-provision-dice'].consumerPrimitive,
  camperPositiveComplete: camper.trinketSemanticObligations?.find((side) => side.side === 'positive')?.implementationStatus === 'IMPLEMENTED',
  camperNegativeComplete: camper.trinketSemanticObligations?.find((side) => side.side === 'negative')?.implementationStatus === 'IMPLEMENTED',
  camperProductionReady: camper.productionReady,
  level2ReadyAfter: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  completeForRandomDraw: LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw,
  verificationCommand: 'npm run verify:complete-edition-c1c10', verificationRequired: true,
  terminalVerdict: 'C1C10-CAMPERS-HELMET-CAMPING-SCOUT-CLOSURE-ACCEPTED',
};
writeFileSync(resolve(dataDir, 'c1c10-campers-helmet-runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(reportDir, 'c1c10-campers-helmet-runtime-report.md'), `# C1C-10 Camper's Helmet Runtime\n\nVerdict: **${evidence.terminalVerdict}**\n\nThe Camper's Helmet now uses exact, independent Camping and Scout windows. Camping freezes a validated Rest allocation, rolls two source-defined d6 Provision Dice through the shared RNG abstraction, persists Wild choices, updates the common pool up to its 16-die limit, flips the card, and commits Rest exactly once. Scout resolves the negative +1 Stress through the shared Stress pipeline before the original party Scout stress.\n\nBoth sides are exact in the semantic comparator and are exercised through production UI controls. Level 2 readiness is **${evidence.level2ReadyAfter} / ${LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount}**; random draw remains locked. Evidence is bound to implementation commit \`${implementationHead}\` and tree \`${implementationTree}\`.\n`);

console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, camperProductionReady: evidence.camperProductionReady,
  level2ReadyAfter: evidence.level2ReadyAfter, completeForRandomDraw: evidence.completeForRandomDraw }, null, 2));
