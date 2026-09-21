import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const previousEvidencePath = resolve(outputDir, 'c1c3-multi-primitive-quest-rule-closure-evidence.json');
const previousEvidence = (() => { try { return JSON.parse(readFileSync(previousEvidencePath, 'utf8')) as { verifiedImplementationHead?: string; measuredAt?: string }; } catch { return {}; } })();
const verifiedImplementationHead = process.env.C1C3_VERIFIED_HEAD ?? previousEvidence.verifiedImplementationHead
  ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const verifiedImplementationTree = execFileSync('git', ['rev-parse', `${verifiedImplementationHead}^{tree}`], { cwd: root, encoding: 'utf8' }).trim();
const generatedAt = process.env.C1C3_MEASURED_AT ?? previousEvidence.measuredAt ?? new Date().toISOString();

const counts = {
  questTotal: COMMUNITY_QUEST_CAPABILITIES.length,
  sourceSupported: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.sourceSupported).length,
  semanticComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.semanticComplete).length,
  engineCapable: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.engineCapable).length,
  adapterComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.adapterComplete).length,
  proofComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionProofComplete && entry.saveReplayProofComplete && entry.selectorReachable && entry.e2eProofComplete).length,
  productionReady: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionReady).length,
};
const quests = COMMUNITY_QUEST_CAPABILITIES.map((entry) => ({ ...entry, proofManifest: COMMUNITY_QUEST_PRODUCTION_PROOFS[entry.definitionId] ?? null }));
writeFileSync(resolve(outputDir, 'c1c3-runtime-capability-matrix.json'), `${JSON.stringify({
  schemaVersion: 3,
  phase: '11A.4-C1C-3',
  generatedAt,
  baselineHead: 'ba31e00cbf00a193881bafaa732e627a469d04ee',
  verifiedImplementationHead,
  verifiedImplementationTree,
  restSemanticFreeze: { primitive: 'QUEST_REST_ALLOCATION_SEMANTICS', status: 'SOURCE_UNRESOLVED_FAIL_CLOSED', unresolvedField: 'insufficientRecoveryCapacity' },
  implementedPrimitives: [...implementedQuestPrimitives()].sort(),
  counts,
  quests,
  trinkets: COMMUNITY_TRINKET_CAPABILITIES,
}, null, 2)}\n`);

const baseline = JSON.parse(readFileSync(resolve(outputDir, 'c1c2-runtime-capability-matrix.json'), 'utf8')) as {
  quests: Array<{ definitionId: string; productionReady: boolean; semanticComplete: boolean; missingPrimitives: string[] }>;
};
const blocked = baseline.quests.filter((entry) => !entry.productionReady);
const allPrimitives = [...new Set(blocked.flatMap((entry) => entry.missingPrimitives))].sort();
const singlePrimitiveUnlocks = allPrimitives.map((primitive) => {
  const definitions = blocked.filter((entry) => entry.missingPrimitives.includes(primitive));
  const semanticReady = definitions.filter((entry) => entry.semanticComplete);
  const potential = semanticReady.filter((entry) => entry.missingPrimitives.length === 1);
  return {
    primitive,
    blockedDefinitions: definitions.length,
    semanticReadyDefinitions: semanticReady.length,
    potentialUnlock: potential.length,
    blockedDefinitionIds: definitions.map((entry) => entry.definitionId),
    potentialUnlockDefinitionIds: potential.map((entry) => entry.definitionId),
  };
}).sort((a, b) => b.blockedDefinitions - a.blockedDefinitions || a.primitive.localeCompare(b.primitive));

const bundleMap = new Map<string, string[]>();
for (const entry of blocked.filter((candidate) => candidate.semanticComplete)) {
  const primitiveIds = [...new Set(entry.missingPrimitives)].sort();
  if (primitiveIds.length < 1 || primitiveIds.length > 3) continue;
  const key = primitiveIds.join('|');
  bundleMap.set(key, [...(bundleMap.get(key) ?? []), entry.definitionId]);
}
const primitiveBundleUnlocks = [...bundleMap.entries()].map(([key, definitionIds]) => ({
  primitiveIds: key.split('|'),
  definitionIds,
  potentialUnlock: definitionIds.length,
})).sort((a, b) => a.primitiveIds.length - b.primitiveIds.length || a.primitiveIds.join().localeCompare(b.primitiveIds.join()));

writeFileSync(resolve(outputDir, 'c1c3-runtime-primitive-backlog.json'), `${JSON.stringify({
  schemaVersion: 3,
  phase: '11A.4-C1C-3',
  generatedAt,
  baselineHead: 'ba31e00cbf00a193881bafaa732e627a469d04ee',
  verifiedImplementationHead,
  measurementRule: 'Bundles are bounded to sizes 1-3 and count semantic-ready C1C-2 definitions whose complete missing-primitive set equals the bundle.',
  singlePrimitiveUnlocks,
  primitiveBundleUnlocks,
}, null, 2)}\n`);

console.log(JSON.stringify({ counts, primitiveBundleUnlocks, readyQuestIds: quests.filter((entry) => entry.productionReady).map((entry) => entry.definitionId) }, null, 2));
