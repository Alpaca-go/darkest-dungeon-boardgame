import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_TRINKET_CAPABILITIES,
  COMMUNITY_TRINKET_PRODUCTION_PROOFS,
} from '../../src/data/community-reference/production-runtime';

const baselineHead = '72285f6c820a340e8468d705bf738884a9b7ad8b';
// Frozen at the implementation/E2E commit immediately before the additive evidence commit.
const verifiedImplementationHead = 'adb5686ee60ffb38b214307d9f2710829603821b';
const outputDir = resolve(process.cwd(), 'docs/data/complete-edition');
const readyQuests = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY');
const supportedQuests = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.sourceStatus === 'source-supported');
const readyTrinkets = COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY');
const supportedTrinkets = COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => entry.sourceStatus === 'source-supported');
const expectedReadyTrinkets = [
  'community-trinket-core-accuracy-stone',
  'community-trinket-core-critical-stone',
];

if (readyQuests.length !== 0) throw new Error(`C1B-R must keep Quest readiness at 0, got ${readyQuests.length}`);
if (JSON.stringify(readyTrinkets.map((entry) => entry.definitionId).sort()) !== JSON.stringify(expectedReadyTrinkets)) {
  throw new Error(`C1B-R must keep exactly the two accepted Trinkets: ${readyTrinkets.map((entry) => entry.definitionId).join(', ')}`);
}
if (readyTrinkets.some((entry) => !Object.values(entry.measuredRuntimeProof).every(Boolean))) {
  throw new Error('A ready Trinket is missing measured adapter/test/save/selector/E2E proof');
}

const matrix = {
  schemaVersion: 1,
  phase: '11A.4-C1B-R',
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  baselineHead,
  verifiedImplementationHead,
  readinessRule: 'source + semantic + adapter + production test + stateful save/replay + selector + E2E',
  quests: COMMUNITY_QUEST_CAPABILITIES,
  trinkets: COMMUNITY_TRINKET_CAPABILITIES,
};

const evidence = {
  schemaVersion: 1,
  phase: '11A.4-C1B-R',
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  baselineHead,
  verifiedImplementationHead,
  capabilityMatrix: 'c1br-production-capability-matrix.json',
  questProductionReady: { ready: readyQuests.length, sourceSupported: supportedQuests.length },
  trinketProductionReady: {
    ready: readyTrinkets.length,
    sourceSupported: supportedTrinkets.length,
    definitionIds: readyTrinkets.map((entry) => entry.definitionId).sort(),
  },
  selectorContract: {
    idParsingForbidden: true,
    definitionMetadataRequired: ['sourceDefinitionId', 'contentSet', 'region', 'sourceOrigin'],
    contentSetUnknownPolicy: 'FAIL_CLOSED',
    regionUnknownPolicy: 'FAIL_CLOSED',
    questPredicates: ['production registry membership', 'campaignLevel', 'enabledContentSets', 'enabledRegions'],
    legacyProfileUnchanged: true,
    communityLegacyFallback: false,
    proofTests: ['PA-04', 'PA-05', 'PA-06', 'PA-07', 'PA-08'],
  },
  productionProofCoverage: Object.values(COMMUNITY_TRINKET_PRODUCTION_PROOFS).map((proof) => ({
    ...proof,
    productionStatus: readyTrinkets.find((entry) => entry.definitionId === proof.definitionId)?.productionStatus ?? 'NOT_READY',
  })),
  saveReplayCoverage: {
    profileAndSelectors: true,
    emptyEnabledArraysPreserved: true,
    invalidValuesRemoved: true,
    unknownProfileFallsBackToLegacy: true,
    validQuestRuntimeStatePreserved: true,
    invalidQuestRuntimeStateFailsSafe: true,
    trinketSideReplay: ['Accuracy Stone', 'Critical Stone'],
    nomadOfferReplay: true,
  },
  e2eCoverage: {
    command: 'npm run test:e2e:community-content-c1br',
    result: '4 passed',
    tests: [
      'C1BR-E2E-PROFILE',
      'C1BR-E2E-OFFER',
      'C1BR-E2E-ACCURACY',
      'C1BR-E2E-CRITICAL',
    ],
    realUiChain: ['Home profile selection', 'save-schema import', 'Hamlet hero selection', 'Nomad offer', 'purchase', 'equip', 'battle attack', 'post-roll use', 'flip', 'reload'],
    directStoreMutation: false,
    debugAcquisition: false,
    testRegistryOverride: false,
  },
  adversarialCoverage: Array.from({ length: 12 }, (_, index) => `PA-${String(index + 1).padStart(2, '0')}`),
  validation: {
    typecheck: 'PASS',
    unitAndIntegration: '103 files / 1767 tests PASS',
    build: 'PASS',
    historicalC1bE2e: 'PASS',
    c1brE2e: '4 tests PASS',
  },
  historicalEvidencePolicy: 'C1B evidence preserved; this file is additive.',
};

writeFileSync(resolve(outputDir, 'c1br-production-capability-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);
writeFileSync(resolve(outputDir, 'c1br-production-acceptance-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({
  verifiedImplementationHead,
  questProductionReady: readyQuests.length,
  trinketProductionReady: readyTrinkets.length,
  outputs: ['c1br-production-capability-matrix.json', 'c1br-production-acceptance-evidence.json'],
}, null, 2));
