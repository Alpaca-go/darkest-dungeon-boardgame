import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { BOOK_OF_HOLINESS_ID } from '../../src/audit/production-proof-registry';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from '../../src/audit/trinket-effect-consumer-coverage';
import { trinketReadinessInvariantErrors } from '../../src/audit/trinket-readiness-invariants';

const root = process.cwd();
const dataDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
const baselineHead = '350c7558f4831f238c8d4ab195ee90be528310d1';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const implementationHead = git('rev-parse', 'HEAD');
const implementationTree = git('rev-parse', 'HEAD^{tree}');
const implementationCommittedAt = git('show', '-s', '--format=%cI', implementationHead);
const sha256 = (contents: string | Buffer) => createHash('sha256').update(contents).digest('hex');
const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition')
  .split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9|10|11|12)-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(historicalPaths.map((path) => [
  path, sha256(execFileSync('git', ['show', `${baselineHead}:${path}`], { cwd: root })),
]));
const contract = JSON.parse(readFileSync(resolve(dataDir, 'c1c13-book-holiness-critical-contract.json'), 'utf8'));
const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[BOOK_OF_HOLINESS_ID];
const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === BOOK_OF_HOLINESS_ID)!;
const positive = capability.trinketSemanticObligations?.find((side) => side.side === 'positive');
const negative = capability.trinketSemanticObligations?.find((side) => side.side === 'negative');
const cards = LEVEL_2_TRINKET_CENSUS.map((entry) => {
  const card = COMMUNITY_TRINKET_CAPABILITIES.find((candidate) => candidate.definitionId === entry.definitionId)!;
  return {
    definitionId: entry.definitionId, productionReady: card.productionReady, blockerCodes: card.blockerCodes,
    sides: (card.trinketSemanticObligations ?? []).map((side) => ({
      side: side.side, triggerMatch: side.triggerMatch, windowMatch: side.windowMatch, targetMatch: side.targetMatch,
      effectMatch: side.effectMatch, effectConsumerMatch: side.effectConsumerMatch,
      runtimeSliceSemanticComplete: side.runtimeSliceSemanticComplete,
      implementationStatus: side.implementationStatus, blockerCode: side.blockerCode, proofIds: side.proofIds,
    })),
  };
});
writeFileSync(resolve(dataDir, 'c1c13-level2-trinket-capability-matrix.json'), `${JSON.stringify({
  schemaVersion: 1, phase: '11A.4-C1C-13', baselineHead, verifiedImplementationHead: implementationHead,
  verifiedImplementationTree: implementationTree, verifiedImplementationCommittedAt: implementationCommittedAt, cards,
}, null, 2)}\n`);
const evidence = {
  schemaVersion: 1, phase: '11A.4-C1C-13', baselineHead, verifiedImplementationHead: implementationHead,
  verifiedImplementationTree: implementationTree, verifiedImplementationCommittedAt: implementationCommittedAt,
  historicalEvidenceHashes, sourceContractStatus: contract.status,
  sourceClosure: contract.closure, alreadyCriticalPolicy: contract.semantics.alreadyCriticalPolicy,
  rngPolicy: contract.semantics.rngPolicy, damageOrder: contract.semantics.damageOrder,
  adapterId: adapter.adapterId, requiredPrimitives: adapter.requiredPrimitives,
  criticalConsumer: TRINKET_EFFECT_CONSUMER_COVERAGE['convert-incoming-hit-to-critical'],
  bookNegativeComplete: negative?.implementationStatus === 'IMPLEMENTED' && negative.runtimeSliceSemanticComplete,
  bookPositiveFailClosed: positive?.implementationStatus !== 'IMPLEMENTED'
    && adapter.definition.positiveSide.useWindows.length === 0 && adapter.definition.positiveSide.effects.length === 0,
  bookProductionReady: capability.productionReady,
  readinessInvariantErrors: trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES),
  level2ReadyAfter: LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount,
  completeForRandomDraw: LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw,
  verificationCommand: 'npm run verify:complete-edition-c1c13', verificationRequired: true,
  terminalVerdict: 'C1C13-BOOK-HOLINESS-CRITICAL-CONVERSION-SLICE-ACCEPTED-CARD-NOT-PROMOTED',
};
writeFileSync(resolve(dataDir, 'c1c13-book-holiness-runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(reportDir, 'c1c13-book-holiness-runtime-report.md'), `# C1C-13 Book of Holiness Runtime\n\nVerdict: **${evidence.terminalVerdict}**\n\nLocked card and rulebook evidence closes the negative side: an ordinary frozen Hit becomes a Critical, printed Critical Damage replaces the frozen standard damage without rerolling, and the normal Critical stress consequence is queued. Original attack facts remain auditable beside \`criticalOverride=force-critical\`. Target effects, movement, Disease, target selection, and all RNG remain unchanged.\n\nThe positive voluntary-declaration side remains fail-closed. The whole card is **not production ready**, Level 2 remains **${evidence.level2ReadyAfter} / ${LEVEL_2_TRINKET_DECK_COVERAGE.sourceDefinitionCount}**, and random draw remains locked. Evidence is bound to implementation commit \`${implementationHead}\` and tree \`${implementationTree}\`.\n`);
console.log(JSON.stringify(evidence, null, 2));
