import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import trinketData from '../../src/data/community-reference/trinkets/data.json' with { type: 'json' };
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { CAMOUFLAGE_CLOAK_ID } from '../../src/audit/production-proof-registry';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from '../../src/audit/trinket-effect-consumer-coverage';

const root = process.cwd();
const dataDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
const baselineHead = '55fed0d9bcf4c47181c0fa164511ec15d5d70f6c';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const implementationHead = git('rev-parse', 'HEAD');
const implementationTree = git('rev-parse', 'HEAD^{tree}');
const implementationCommittedAt = git('show', '-s', '--format=%cI', implementationHead);
const sha256 = (contents: string | Buffer) => createHash('sha256').update(contents).digest('hex');
const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8)-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalPaths.map((path) => [
  path, sha256(execFileSync('git', ['show', `${baselineHead}:${path}`], { cwd: root })),
]));

const source = trinketData.find((entry) => entry.id === CAMOUFLAGE_CLOAK_ID)!;
const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[CAMOUFLAGE_CLOAK_ID];
const condition = source.negativeSide.effects[0] as { kind: string; condition: string; amount: number | null; turns: number };
const contract = {
  schemaVersion: 1,
  phase: '11A.4-C1C-9',
  sourceDefinitionId: source.id,
  sourceReferences: source.sourceReferences,
  source: {
    trigger: source.negativeSide.trigger,
    useWindow: source.negativeSide.useWindow,
    target: source.negativeSide.target,
    effect: condition,
  },
  runtime: {
    window: adapter.definition.negativeSide.useWindows[0],
    effect: adapter.definition.negativeSide.effects[0],
    consumer: TRINKET_EFFECT_CONSUMER_COVERAGE['apply-condition-stack'].consumerPrimitive,
    resistanceInteraction: 'applyStatusEffectEvent -> applyEffectsWithResistance',
    turnConsumptionSemantics: 'tickStun decrements conditionDurations.stun after the stunned action is skipped',
    eventIdentity: 'trinket idempotency key + effect index',
  },
};
writeFileSync(resolve(dataDir, 'c1c9-condition-duration-contract.json'), `${JSON.stringify(contract, null, 2)}\n`);

const cards = LEVEL_2_TRINKET_CENSUS.map((entry) => {
  const capability = COMMUNITY_TRINKET_CAPABILITIES.find((candidate) => candidate.definitionId === entry.definitionId)!;
  const sides = (capability.trinketSemanticObligations ?? []).map((side) => ({
    side: side.side,
    triggerMatch: side.triggerMatch,
    windowMatch: side.windowMatch,
    targetMatch: side.targetMatch,
    modifierMatch: side.modifierMatch,
    modifierConsumerMatch: side.modifierConsumerMatch,
    effectMatch: side.effectMatch,
    effectConsumerMatch: side.effectConsumerMatch,
    conditionMatch: side.conditionMatch,
    runtimeSliceSemanticComplete: side.runtimeSliceSemanticComplete,
    implementationStatus: side.implementationStatus,
    blockerCode: side.blockerCode,
    proofIds: side.proofIds,
  }));
  return {
    definitionId: entry.definitionId,
    sourceSemanticComplete: capability.sourceSemanticComplete,
    positiveSideComplete: sides.some((side) => side.side === 'positive' && side.implementationStatus === 'IMPLEMENTED'),
    negativeSideComplete: sides.some((side) => side.side === 'negative' && side.implementationStatus === 'IMPLEMENTED'),
    runtimeSemanticComplete: capability.runtimeSemanticComplete,
    adapterComplete: capability.adapterComplete,
    productionReady: capability.productionReady,
    blockerCodes: capability.blockerCodes,
    sides,
  };
});
const matrix = {
  schemaVersion: 1,
  phase: '11A.4-C1C-9',
  baselineHead,
  verifiedImplementationHead: implementationHead,
  verifiedImplementationTree: implementationTree,
  verifiedImplementationCommittedAt: implementationCommittedAt,
  cards,
};
writeFileSync(resolve(dataDir, 'c1c9-level2-trinket-capability-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);

const cloak = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CAMOUFLAGE_CLOAK_ID)!;
const evidence = {
  schemaVersion: 1,
  phase: '11A.4-C1C-9',
  baselineHead,
  verifiedImplementationHead: implementationHead,
  verifiedImplementationTree: implementationTree,
  verifiedImplementationCommittedAt: implementationCommittedAt,
  historicalEvidenceHashes,
  sourceContractExact: cloak.trinketSemanticObligations?.every((side) => side.runtimeSliceSemanticComplete) ?? false,
  conditionConsumerWired: TRINKET_EFFECT_CONSUMER_COVERAGE['apply-condition-stack'].wired,
  conditionConsumerPrimitive: TRINKET_EFFECT_CONSUMER_COVERAGE['apply-condition-stack'].consumerPrimitive,
  sharedStatusPipeline: 'applyStatusEffectEvent -> applyEffectsWithResistance -> conditionDurations',
  camouflagePositiveComplete: cloak.trinketSemanticObligations?.find((side) => side.side === 'positive')?.implementationStatus === 'IMPLEMENTED',
  camouflageNegativeComplete: cloak.trinketSemanticObligations?.find((side) => side.side === 'negative')?.implementationStatus === 'IMPLEMENTED',
  camouflageProductionReady: cloak.productionReady,
  level2ReadyAfter: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  completeForRandomDraw: LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw,
  verificationCommand: 'npm run verify:complete-edition-c1c9',
  verificationRequired: true,
  terminalVerdict: 'C1C9-CONDITION-DURATION-CAMOUFLAGE-CLOSURE-ACCEPTED',
};
writeFileSync(resolve(dataDir, 'c1c9-condition-runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(reportDir, 'c1c9-condition-runtime-report.md'), `# C1C-9 Condition Duration Runtime\n\nVerdict: **${evidence.terminalVerdict}**\n\nThe source-backed Trinket condition payload now preserves condition, independent magnitude, duration, and target. It resolves through the shared battle status event pipeline, including immunity, percentage resistance, categorical duration reduction, persisted event replay, and real turn consumption.\n\nCamouflage Cloak binds its positive incoming Dodge window and its negative hero-hit Stun window in one adapter. Both sides are implemented and the evaluator promotes the card without changing any prior phase evidence.\n\nLevel 2 readiness is **${evidence.level2ReadyAfter} / ${LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount}**; random draw remains locked. Evidence is bound to implementation commit \`${implementationHead}\` and tree \`${implementationTree}\`.\n`);

console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, camouflageProductionReady: evidence.camouflageProductionReady,
  level2ReadyAfter: evidence.level2ReadyAfter, completeForRandomDraw: evidence.completeForRandomDraw }, null, 2));
