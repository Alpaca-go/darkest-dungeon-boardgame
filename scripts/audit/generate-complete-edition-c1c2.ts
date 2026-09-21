import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_PRODUCTION_PROOFS,
  COMMUNITY_TRINKET_CAPABILITIES,
  implementedQuestPrimitives,
} from '../../src/data/community-reference/production-runtime';

const root = process.cwd();
const outputDir = resolve(root, 'docs/data/complete-edition');
mkdirSync(outputDir, { recursive: true });
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const tree = execFileSync('git', ['write-tree'], { cwd: root, encoding: 'utf8' }).trim();
const generatedAt = new Date().toISOString();

const counts = {
  questTotal: COMMUNITY_QUEST_CAPABILITIES.length,
  sourceSupported: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.sourceSupported).length,
  semanticComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.semanticComplete).length,
  engineCapable: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.engineCapable).length,
  adapterComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.adapterComplete).length,
  proofComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) =>
    entry.productionProofComplete && entry.saveReplayProofComplete
    && entry.selectorReachable && entry.e2eProofComplete).length,
  productionReady: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionReady).length,
};

const quests = COMMUNITY_QUEST_CAPABILITIES.map((entry) => ({
  ...entry,
  productionProof: entry.productionProofComplete,
  saveReplayProof: entry.saveReplayProofComplete,
  selectorProof: entry.selectorReachable,
  e2eProof: entry.e2eProofComplete,
  proofManifest: COMMUNITY_QUEST_PRODUCTION_PROOFS[entry.definitionId] ?? null,
}));

const matrix = {
  schemaVersion: 2,
  phase: '11A.4-C1C-2',
  generatedAt,
  baselineHead: 'a51bfeaf30c5be187ffc7d54e1dd978b0d9b8be4',
  verifiedImplementationHead: head,
  verifiedImplementationTree: tree,
  restSemanticFreeze: {
    primitive: 'QUEST_REST_ALLOCATION_SEMANTICS',
    status: 'SOURCE_UNRESOLVED_FAIL_CLOSED',
    unresolvedField: 'insufficientRecoveryCapacity',
  },
  implementedPrimitives: [...implementedQuestPrimitives()].sort(),
  counts,
  quests,
  trinkets: COMMUNITY_TRINKET_CAPABILITIES,
};
writeFileSync(resolve(outputDir, 'c1c2-runtime-capability-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);

const allPrimitives = [...new Set(COMMUNITY_QUEST_CAPABILITIES.flatMap((entry) => [
  ...entry.missingPrimitives,
  ...entry.blockerCodes.filter((code) => code.startsWith('SOURCE_')),
]))];
const backlog = allPrimitives.map((primitive) => {
  const blocked = COMMUNITY_QUEST_CAPABILITIES.filter((entry) =>
    !entry.productionReady && (entry.missingPrimitives.includes(primitive) || entry.blockerCodes.includes(primitive)));
  const semanticReady = blocked.filter((entry) => entry.semanticComplete);
  const potential = semanticReady.filter((entry) =>
    entry.missingPrimitives.length === 1
    && entry.adapterComplete
    && entry.productionProofComplete
    && entry.saveReplayProofComplete
    && entry.selectorReachable
    && entry.e2eProofComplete);
  return {
    primitive,
    blockedDefinitions: blocked.length,
    semanticReadyDefinitions: semanticReady.length,
    potentialUnlock: potential.length,
    blockedDefinitionIds: blocked.map((entry) => entry.definitionId),
    potentialUnlockDefinitionIds: potential.map((entry) => entry.definitionId),
  };
}).sort((a, b) => b.blockedDefinitions - a.blockedDefinitions || a.primitive.localeCompare(b.primitive));

writeFileSync(resolve(outputDir, 'c1c2-runtime-primitive-backlog.json'), `${JSON.stringify({
  schemaVersion: 2,
  phase: '11A.4-C1C-2',
  generatedAt,
  baselineHead: matrix.baselineHead,
  verifiedImplementationHead: head,
  measurementRule: 'potentialUnlock counts only semantic-ready definitions whose sole missing primitive would complete every remaining gate.',
  backlog,
}, null, 2)}\n`);

console.log(JSON.stringify({ counts, readyQuestIds: quests.filter((entry) => entry.productionReady).map((entry) => entry.definitionId), backlogEntries: backlog.length }, null, 2));
