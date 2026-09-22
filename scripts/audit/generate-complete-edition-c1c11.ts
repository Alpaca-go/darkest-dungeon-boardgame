import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import trinketData from '../../src/data/community-reference/trinkets/data.json' with { type: 'json' };
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { BLOODTHIRST_RING_ID } from '../../src/audit/production-proof-registry';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from '../../src/audit/trinket-effect-consumer-coverage';

const root = process.cwd();
const dataDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
const baselineHead = '42855cff5a1e60c7f138d33cc94d97d1fb2c83cb';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const implementationHead = git('rev-parse', 'HEAD');
const implementationTree = git('rev-parse', 'HEAD^{tree}');
const implementationCommittedAt = git('show', '-s', '--format=%cI', implementationHead);
const sha256 = (contents: string | Buffer) => createHash('sha256').update(contents).digest('hex');
const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9|10)-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalPaths.map((path) => [
  path, sha256(execFileSync('git', ['show', `${baselineHead}:${path}`], { cwd: root })),
]));

const source = trinketData.find((entry) => entry.id === BLOODTHIRST_RING_ID)!;
const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[BLOODTHIRST_RING_ID];
const contract = {
  schemaVersion: 1, phase: '11A.4-C1C-11', sourceDefinitionId: source.id,
  sourceReferences: source.sourceReferences,
  scope: 'negative-side-only', positiveSidePolicy: 'fail-closed until voluntary-declaration timing is resolved',
  source: {
    positive: { trigger: source.positiveSide.trigger, useWindow: source.positiveSide.useWindow, target: source.positiveSide.target, effects: source.positiveSide.effects },
    negative: { trigger: source.negativeSide.trigger, useWindow: source.negativeSide.useWindow, target: source.negativeSide.target, effect: source.negativeSide.effects[0] },
  },
  runtime: {
    adapterId: adapter.adapterId, requiredPrimitives: adapter.requiredPrimitives,
    positive: { windows: adapter.definition.positiveSide.useWindows, effects: adapter.definition.positiveSide.effects },
    negative: { window: adapter.definition.negativeSide.useWindows[0], effect: adapter.definition.negativeSide.effects[0] },
    consumer: TRINKET_EFFECT_CONSUMER_COVERAGE['apply-condition-stack'].consumerPrimitive,
    timing: 'opens only after a staged incoming attack has resolved as a hit and before incoming damage commits',
    duration: 'bleed magnitude remains 3 while categorical duration counts 2 -> 1 -> 0',
    saveReplay: 'open opportunity, used trinket side, status-effect event idempotency, and condition duration persist',
  },
};
writeFileSync(resolve(dataDir, 'c1c11-bloodthirst-ring-contract.json'), `${JSON.stringify(contract, null, 2)}\n`);

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
const matrix = { schemaVersion: 1, phase: '11A.4-C1C-11', baselineHead,
  verifiedImplementationHead: implementationHead, verifiedImplementationTree: implementationTree,
  verifiedImplementationCommittedAt: implementationCommittedAt, cards };
writeFileSync(resolve(dataDir, 'c1c11-level2-trinket-capability-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);

const bloodthirst = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === BLOODTHIRST_RING_ID)!;
const positive = bloodthirst.trinketSemanticObligations?.find((side) => side.side === 'positive');
const negative = bloodthirst.trinketSemanticObligations?.find((side) => side.side === 'negative');
const evidence = {
  schemaVersion: 1, phase: '11A.4-C1C-11', baselineHead,
  verifiedImplementationHead: implementationHead, verifiedImplementationTree: implementationTree,
  verifiedImplementationCommittedAt: implementationCommittedAt, historicalEvidenceHashes,
  negativeSourceContractExact: negative?.runtimeSliceSemanticComplete === true,
  conditionConsumerWired: TRINKET_EFFECT_CONSUMER_COVERAGE['apply-condition-stack'].wired,
  conditionConsumerPrimitive: TRINKET_EFFECT_CONSUMER_COVERAGE['apply-condition-stack'].consumerPrimitive,
  bloodthirstNegativeComplete: negative?.implementationStatus === 'IMPLEMENTED',
  bloodthirstPositiveFailClosed: positive?.implementationStatus !== 'IMPLEMENTED'
    && adapter.definition.positiveSide.useWindows.length === 0 && adapter.definition.positiveSide.effects.length === 0,
  bloodthirstProductionReady: bloodthirst.productionReady,
  level2ReadyAfter: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  completeForRandomDraw: LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw,
  verificationCommand: 'npm run verify:complete-edition-c1c11', verificationRequired: true,
  terminalVerdict: 'C1C11-BLOODTHIRST-HIT-BLEED-SLICE-ACCEPTED-CARD-NOT-PROMOTED',
};
writeFileSync(resolve(dataDir, 'c1c11-bloodthirst-ring-runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(reportDir, 'c1c11-bloodthirst-ring-runtime-report.md'), `# C1C-11 Bloodthirst Ring Runtime\n\nVerdict: **${evidence.terminalVerdict}**\n\nThe negative side now opens only after a staged incoming monster attack is confirmed as a hit. Using it applies Bleed 3 for two turns to the equipped hero through the shared condition consumer, then flips the physical card. Resistance, save/replay idempotency, decline/resume, two-trinket coexistence, two periodic ticks, and Death's Door deathblow behavior are covered.\n\nThe positive Food/Heal side remains deliberately fail-closed because its exact voluntary-declaration timing is unresolved. Therefore the whole card is **not production ready**, Level 2 readiness remains **${evidence.level2ReadyAfter} / ${LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount}**, and random draw remains locked. Evidence is bound to implementation commit \`${implementationHead}\` and tree \`${implementationTree}\`.\n`);

console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, bloodthirstNegativeComplete: evidence.bloodthirstNegativeComplete,
  bloodthirstProductionReady: evidence.bloodthirstProductionReady, level2ReadyAfter: evidence.level2ReadyAfter,
  completeForRandomDraw: evidence.completeForRandomDraw }, null, 2));
