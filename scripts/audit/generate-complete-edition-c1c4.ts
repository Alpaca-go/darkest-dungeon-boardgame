import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_PRODUCTION_PROOFS,
  COMMUNITY_SOURCE_QUESTS,
  COMMUNITY_TRINKET_CAPABILITIES,
  implementedQuestPrimitives,
} from '../../src/data/community-reference/production-runtime';

const root = process.cwd();
const outputDir = resolve(root, 'docs/data/complete-edition');
mkdirSync(outputDir, { recursive: true });
const evidencePath = resolve(outputDir, 'c1c4-rest-semantic-source-closure-evidence.json');
const previousEvidence = existsSync(evidencePath)
  ? JSON.parse(readFileSync(evidencePath, 'utf8')) as { verifiedImplementationHead?: string; measuredAt?: string }
  : {};
const verifiedImplementationHead = process.env.C1C4_VERIFIED_HEAD ?? previousEvidence.verifiedImplementationHead
  ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const verifiedImplementationTree = execFileSync('git', ['rev-parse', `${verifiedImplementationHead}^{tree}`], { cwd: root, encoding: 'utf8' }).trim();
const generatedAt = process.env.C1C4_MEASURED_AT ?? previousEvidence.measuredAt ?? new Date().toISOString();
const baselineHead = '5ac8cc58efd73ae0bbc88074ea46dc29e405d899';

const counts = {
  questTotal: COMMUNITY_QUEST_CAPABILITIES.length,
  sourceSupported: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.sourceSupported).length,
  sourceSemanticComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.sourceSemanticComplete).length,
  runtimeSemanticComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.runtimeSemanticComplete).length,
  engineCapable: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.engineCapable).length,
  adapterComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.adapterComplete).length,
  productionUiProofComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionUiProofComplete).length,
  productionReady: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionReady).length,
};
const quests = COMMUNITY_QUEST_CAPABILITIES.map((entry) => ({
  ...entry,
  proofManifest: COMMUNITY_QUEST_PRODUCTION_PROOFS[entry.definitionId] ?? null,
}));

writeFileSync(resolve(outputDir, 'c1c4-quest-semantic-coverage.json'), `${JSON.stringify({
  schemaVersion: 1,
  phase: '11A.4-C1C-4',
  generatedAt,
  baselineHead,
  verifiedImplementationHead,
  definitions: COMMUNITY_SOURCE_QUESTS.map((source) => {
    const capability = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === source.id)!;
    return {
      definitionId: source.id,
      sourceSemanticComplete: capability.sourceSemanticComplete,
      runtimeSemanticComplete: capability.runtimeSemanticComplete,
      semanticObligationCount: capability.semanticObligationCount,
      obligations: capability.semanticObligations.map((obligation) => ({
        ...obligation,
        status: obligation.implementationStatus,
        effect: obligation.parameters,
      })),
    };
  }),
}, null, 2)}\n`);

writeFileSync(resolve(outputDir, 'c1c4-runtime-capability-matrix.json'), `${JSON.stringify({
  schemaVersion: 5,
  phase: '11A.4-C1C-4',
  generatedAt,
  baselineHead,
  verifiedImplementationHead,
  verifiedImplementationTree,
  restSemanticFreeze: {
    primitive: 'QUEST_REST_ALLOCATION_SEMANTICS',
    status: 'SOURCE_UNRESOLVED_FAIL_CLOSED',
    unresolvedField: 'insufficientRecoveryCapacity',
    sourceAuditOutcome: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED',
  },
  implementedPrimitives: [...implementedQuestPrimitives()].sort(),
  counts,
  quests,
  trinkets: COMMUNITY_TRINKET_CAPABILITIES,
}, null, 2)}\n`);

console.log(JSON.stringify({
  counts,
  readyQuestIds: quests.filter((entry) => entry.productionReady).map((entry) => entry.definitionId),
}, null, 2));
