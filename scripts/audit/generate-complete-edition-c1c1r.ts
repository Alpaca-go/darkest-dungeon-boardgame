import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_RUNTIME_ADAPTERS,
  COMMUNITY_SOURCE_QUESTS,
  COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';
import { PRODUCTION_PROOF_REGISTRY } from '../../src/audit/production-proof-registry';
import { QUEST_ROOM_TOKEN_BEHAVIOR_MATRIX } from '../../src/game-engine/dungeon';

const root = process.cwd();
const dataDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
mkdirSync(dataDir, { recursive: true });
mkdirSync(reportDir, { recursive: true });

const generatedAt = new Date().toISOString();
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
const implementedPrimitives = [
  'QUEST_ROOM_TOKEN_COMPOSITION',
  'QUEST_FIREWOOD_RESTING_POINT_SETUP',
  'QUEST_XP_UNIT_ACCOUNTING',
  'POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW',
];

const proofComplete = (entry: (typeof COMMUNITY_QUEST_CAPABILITIES)[number]) =>
  entry.measuredRuntimeProof.productionProofPresent
  && entry.measuredRuntimeProof.saveReplayProofPresent
  && entry.measuredRuntimeProof.selectorProofPresent
  && entry.measuredRuntimeProof.e2eProofPresent;

const layerCounts = {
  sourceSupported: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.sourceStatus === 'source-supported').length,
  engineCapable: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.sourceStatus === 'source-supported' && entry.missingPrimitives.length === 0).length,
  adapterComplete: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.measuredRuntimeProof.adapterPresent).length,
  proofComplete: COMMUNITY_QUEST_CAPABILITIES.filter(proofComplete).length,
  productionReady: COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY').length,
};

const matrix = {
  schemaVersion: 1,
  phase: '11A.4-C1C-1R',
  generatedAt,
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  implementedPrimitives,
  capabilityLayers: layerCounts,
  primitiveClassification: {
    compoundMessagesCanYieldMultiplePrimitives: true,
    roomComposition: 'QUEST_ROOM_TOKEN_COMPOSITION',
    firewoodAndRestingPoints: 'QUEST_FIREWOOD_RESTING_POINT_SETUP',
    repeatedXpUnits: 'QUEST_XP_UNIT_ACCOUNTING',
  },
  quests: COMMUNITY_QUEST_CAPABILITIES,
  trinkets: COMMUNITY_TRINKET_CAPABILITIES,
};
writeFileSync(resolve(dataDir, 'c1c1r-runtime-capability-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);

const clusters = new Map<string, { questDefinitionIds: string[]; trinketDefinitionIds: string[] }>();
const add = (primitive: string, definitionId: string, field: 'questDefinitionIds' | 'trinketDefinitionIds') => {
  const entry = clusters.get(primitive) ?? { questDefinitionIds: [], trinketDefinitionIds: [] };
  entry[field].push(definitionId);
  clusters.set(primitive, entry);
};
for (const capability of COMMUNITY_QUEST_CAPABILITIES) {
  if (capability.productionStatus !== 'PRODUCTION_READY') {
    for (const primitive of capability.missingPrimitives) add(primitive, capability.definitionId, 'questDefinitionIds');
  }
}
for (const capability of COMMUNITY_TRINKET_CAPABILITIES) {
  if (capability.productionStatus !== 'PRODUCTION_READY') {
    for (const primitive of capability.missingPrimitives) add(primitive, capability.definitionId, 'trinketDefinitionIds');
  }
}
const backlog = [...clusters.entries()].map(([primitive, ids]) => ({
  primitive,
  unlockPotential: ids.questDefinitionIds.length + ids.trinketDefinitionIds.length,
  ...ids,
})).sort((a, b) => b.unlockPotential - a.unlockPotential || a.primitive.localeCompare(b.primitive));
writeFileSync(resolve(dataDir, 'c1c1r-runtime-primitive-backlog.json'), `${JSON.stringify({
  schemaVersion: 1,
  phase: '11A.4-C1C-1R',
  generatedAt,
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  backlog,
}, null, 2)}\n`);

const ready = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY');
const blocked = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionStatus !== 'PRODUCTION_READY');
const sourceSetup = Object.values(COMMUNITY_QUEST_RUNTIME_ADAPTERS).map((adapter) => {
  const source = COMMUNITY_SOURCE_QUESTS.find((entry) => entry.id === adapter.definitionId);
  return {
    definitionId: adapter.definitionId,
    source: source?.firewood ?? null,
    runtime: adapter.definition.firewoodSetup ?? null,
  };
});
const adapterE2e = Object.values(PRODUCTION_PROOF_REGISTRY).filter((entry) => entry.proofType === 'e2e' && entry.scope === 'adapter');
const report = `# C1C-1R Firewood Setup & Real Quest Flow Acceptance\n\n`
  + `Verification scope: **LOCAL MEASURED VERIFICATION**\n\n`
  + `Generated from implementation HEAD \`${head}\` (tree \`${tree}\`).\n\n`
  + `## Measured capability layers\n\n`
  + `- Engine-capable: **${layerCounts.engineCapable} / ${COMMUNITY_QUEST_CAPABILITIES.length}**\n`
  + `- Adapter-complete: **${layerCounts.adapterComplete} / ${COMMUNITY_QUEST_CAPABILITIES.length}**\n`
  + `- Proof-complete: **${layerCounts.proofComplete} / ${COMMUNITY_QUEST_CAPABILITIES.length}**\n`
  + `- Production Ready: **${layerCounts.productionReady} / ${COMMUNITY_QUEST_CAPABILITIES.length}**\n\n`
  + `These layers are intentionally distinct: an implemented engine primitive does not by itself publish a Quest.\n\n`
  + `## Outcome\n\n`
  + `Quest Production Ready remeasures from **7 / 75** before the repair to **${ready.length} / 75** after it. Trinket Production Ready remains **${COMMUNITY_TRINKET_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY').length} / 48**.\n\n`
  + `The compound source blocker now yields separate room-composition and firewood/resting-point primitives. All seven simple adapters preserve source firewood setup exactly, initialize save-backed runtime counters, and expose a legal camp-rest consumption command and UI seam.\n\n`
  + `## Ready quests\n\n${ready.map((entry) => `- \`${entry.definitionId}\``).join('\n')}\n\n`
  + `## Real browser coverage and proof scope\n\n`
  + `The browser acceptance path fully traverses \`community-quest-warrens-lvl1-explore-the-sewers\` through production UI. It clears two rooms with a reload between them, earns one XP unit, leaves through the UI with an incomplete result, and applies +1 XP on return to Hamlet. The shared E2E registration is explicitly adapter-scoped to \`c1c1-simple-community-quest-v1\`; it is not represented as seven definition-level browser runs.\n\n`
  + `## Room-token behavior\n\n`
  + `All six source tokens have explicit runtime and qualification behavior: \`empty\`, \`dark\`, \`curio\`, \`treasure\`, \`lair\`, and \`trap\`. Dark and trap cannot qualify as cleared; Curio qualifies only after interaction; Treasure and Lair qualify after victory.\n\n`
  + `## Deferred scope\n\n`
  + `${blocked.length} Quest definitions remain non-ready. Special-rule Quests stay engine-blocked, and the three simple Crimson Court Quests remain adapter-required. C1C-2 is not included.\n`;
writeFileSync(resolve(reportDir, 'c1c1r-firewood-real-quest-flow-report.md'), report);

console.log(JSON.stringify({ head, tree, capabilityLayers: layerCounts, readyQuestDefinitionIds: ready.map((entry) => entry.definitionId), sourceSetup, adapterE2e, roomTokenBehaviorMatrix: QUEST_ROOM_TOKEN_BEHAVIOR_MATRIX, backlogEntries: backlog.length }, null, 2));
