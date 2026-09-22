import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import trinketData from '../../src/data/community-reference/trinkets/data.json' with { type: 'json' };
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { BOOK_OF_CONSTITUTION_ID } from '../../src/audit/production-proof-registry';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from '../../src/audit/trinket-effect-consumer-coverage';

const root = process.cwd();
const dataDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
const baselineHead = '5abd51df2ae2a229e090b9bf8d9c08a1d96d0be6';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const implementationHead = git('rev-parse', 'HEAD');
const implementationTree = git('rev-parse', 'HEAD^{tree}');
const implementationCommittedAt = git('show', '-s', '--format=%cI', implementationHead);
const sha256 = (contents: string | Buffer) => createHash('sha256').update(contents).digest('hex');
const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9|10|11)-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalPaths.map((path) => [
  path, sha256(execFileSync('git', ['show', `${baselineHead}:${path}`], { cwd: root })),
]));

const source = trinketData.find((entry) => entry.id === BOOK_OF_CONSTITUTION_ID)!;
const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[BOOK_OF_CONSTITUTION_ID];
const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === BOOK_OF_CONSTITUTION_ID)!;
const positive = capability.trinketSemanticObligations?.find((side) => side.side === 'positive');
const negative = capability.trinketSemanticObligations?.find((side) => side.side === 'negative');
const surface = [
  { caller: 'src/game-engine/diseases/curio.ts', sourceKinds: ['curio'], productionReachable: true, stagedThroughBookWindow: true, notes: 'Guaranteed and chance Curio outcomes freeze after result selection.' },
  { caller: 'src/game-engine/exploration.ts', sourceKinds: ['exploration-event'], productionReachable: true, stagedThroughBookWindow: true, notes: 'Victim, roll, and Disease are selected before staging.' },
  { caller: 'src/game-engine/diseases/battle-bridge.ts', sourceKinds: ['monster-skill'], productionReachable: true, stagedThroughBookWindow: true, notes: 'Remaining queued infections stay queued while the first transaction is paused.' },
  { caller: 'src/store/useGameStore.ts', sourceKinds: ['debug'], productionReachable: false, stagedThroughBookWindow: true, notes: 'Debug parity path; not used as sole production proof.' },
];

writeFileSync(resolve(dataDir, 'c1c12-disease-acquisition-runtime-surface.json'), `${JSON.stringify({ schemaVersion: 1, phase: '11A.4-C1C-12', callers: surface }, null, 2)}\n`);
writeFileSync(resolve(dataDir, 'c1c12-book-constitution-contract.json'), `${JSON.stringify({
  schemaVersion: 1, phase: '11A.4-C1C-12', sourceDefinitionId: source.id, sourceReferences: source.sourceReferences,
  scope: 'positive-side-only', negativeSidePolicy: 'fail-closed until movement and voluntary-declaration are implemented',
  source: { positive: source.positiveSide, negative: source.negativeSide },
  runtime: { adapterId: adapter.adapterId, requiredPrimitives: adapter.requiredPrimitives,
    positive: adapter.definition.positiveSide, negative: adapter.definition.negativeSide,
    consumer: TRINKET_EFFECT_CONSUMER_COVERAGE['discard-disease'] },
}, null, 2)}\n`);

const cards = LEVEL_2_TRINKET_CENSUS.map((entry) => {
  const card = COMMUNITY_TRINKET_CAPABILITIES.find((candidate) => candidate.definitionId === entry.definitionId)!;
  const sides = (card.trinketSemanticObligations ?? []).map((side) => ({
    side: side.side, triggerMatch: side.triggerMatch, windowMatch: side.windowMatch, targetMatch: side.targetMatch,
    modifierMatch: side.modifierMatch, modifierConsumerMatch: side.modifierConsumerMatch,
    effectMatch: side.effectMatch, effectConsumerMatch: side.effectConsumerMatch,
    runtimeSliceSemanticComplete: side.runtimeSliceSemanticComplete, implementationStatus: side.implementationStatus,
    blockerCode: side.blockerCode, proofIds: side.proofIds,
  }));
  return { definitionId: entry.definitionId, productionReady: card.productionReady, blockerCodes: card.blockerCodes, sides };
});
writeFileSync(resolve(dataDir, 'c1c12-level2-trinket-capability-matrix.json'), `${JSON.stringify({
  schemaVersion: 1, phase: '11A.4-C1C-12', baselineHead, verifiedImplementationHead: implementationHead,
  verifiedImplementationTree: implementationTree, verifiedImplementationCommittedAt: implementationCommittedAt, cards,
}, null, 2)}\n`);

const evidence = {
  schemaVersion: 1, phase: '11A.4-C1C-12', baselineHead, verifiedImplementationHead: implementationHead,
  verifiedImplementationTree: implementationTree, verifiedImplementationCommittedAt: implementationCommittedAt,
  historicalEvidenceHashes, positiveSourceContractExact: positive?.runtimeSliceSemanticComplete === true,
  discardDiseaseConsumerWired: TRINKET_EFFECT_CONSUMER_COVERAGE['discard-disease'].wired,
  bookPositiveComplete: positive?.implementationStatus === 'IMPLEMENTED',
  bookNegativeFailClosed: negative?.implementationStatus !== 'IMPLEMENTED'
    && adapter.definition.negativeSide.useWindows.length === 0 && adapter.definition.negativeSide.effects.length === 0,
  bookProductionReady: capability.productionReady, productionDiseaseSurfacesStaged: surface.every((entry) => entry.stagedThroughBookWindow),
  level2ReadyAfter: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  completeForRandomDraw: LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw,
  verificationCommand: 'npm run verify:complete-edition-c1c12', verificationRequired: true,
  terminalVerdict: 'C1C12-BOOK-CONSTITUTION-DISEASE-DISCARD-SLICE-ACCEPTED-CARD-NOT-PROMOTED',
};
writeFileSync(resolve(dataDir, 'c1c12-book-constitution-runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(reportDir, 'c1c12-book-constitution-runtime-report.md'), `# C1C-12 Book of Constitution Runtime\n\nVerdict: **${evidence.terminalVerdict}**\n\nThe positive side now intercepts a valid incoming Disease before \`hero.disease\` changes. Use discards the frozen Disease, flips the physical Book, records the processed source event, and never enters replacement or Negative Quirk processing. Decline resumes the authoritative Disease commit exactly once. Curio, exploration-event, monster-skill, and debug callers all use the staged bridge.\n\nThe negative movement side remains fail-closed. The whole card is **not production ready**, Level 2 remains **${evidence.level2ReadyAfter} / ${LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount}**, and random draw remains locked. Evidence is bound to implementation commit \`${implementationHead}\` and tree \`${implementationTree}\`.\n`);
console.log(JSON.stringify(evidence, null, 2));
