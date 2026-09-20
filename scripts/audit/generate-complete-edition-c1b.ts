import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_TRINKET_CAPABILITIES,
} from '../../src/data/community-reference/production-runtime';

const root = process.cwd();
const dataDir = resolve(root, 'docs/data/complete-edition');
const reportDir = resolve(root, 'docs/reports/complete-edition');
mkdirSync(dataDir, { recursive: true });
mkdirSync(reportDir, { recursive: true });

const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const generatedAt = new Date().toISOString();

const count = (records: typeof COMMUNITY_QUEST_CAPABILITIES, status: string) =>
  records.filter((record) => record.productionStatus === status).length;

const questSummary = {
  sourceSupported: COMMUNITY_QUEST_CAPABILITIES.length,
  runtimeReady: count(COMMUNITY_QUEST_CAPABILITIES, 'PRODUCTION_READY'),
  productionEnabled: count(COMMUNITY_QUEST_CAPABILITIES, 'PRODUCTION_READY'),
  adapterRequired: count(COMMUNITY_QUEST_CAPABILITIES, 'ADAPTER_REQUIRED'),
  engineBlocked: count(COMMUNITY_QUEST_CAPABILITIES, 'ENGINE_PRIMITIVE_MISSING'),
  sourceBlockedPhysicalOutsideRegistry: 1,
};
const trinketSummary = {
  sourcePhysical: 49,
  sourceSupported: COMMUNITY_TRINKET_CAPABILITIES.length,
  runtimeReady: count(COMMUNITY_TRINKET_CAPABILITIES, 'PRODUCTION_READY'),
  productionEnabled: count(COMMUNITY_TRINKET_CAPABILITIES, 'PRODUCTION_READY'),
  adapterRequired: count(COMMUNITY_TRINKET_CAPABILITIES, 'ADAPTER_REQUIRED'),
  engineBlocked: count(COMMUNITY_TRINKET_CAPABILITIES, 'ENGINE_PRIMITIVE_MISSING'),
  sourceBlocked: 1,
};

const matrix = {
  schemaVersion: 1,
  generatedAt,
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  quests: COMMUNITY_QUEST_CAPABILITIES,
  trinkets: COMMUNITY_TRINKET_CAPABILITIES,
  summary: { quests: questSummary, trinkets: trinketSummary },
};
writeFileSync(resolve(dataDir, 'c1b-runtime-capability-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);

const clusters = new Map<string, { questDefinitionIds: string[]; trinketDefinitionIds: string[] }>();
const add = (primitive: string, definitionId: string, kind: 'quest' | 'trinket') => {
  const current = clusters.get(primitive) ?? { questDefinitionIds: [], trinketDefinitionIds: [] };
  current[kind === 'quest' ? 'questDefinitionIds' : 'trinketDefinitionIds'].push(definitionId);
  clusters.set(primitive, current);
};
for (const record of COMMUNITY_QUEST_CAPABILITIES) {
  if (record.productionStatus !== 'PRODUCTION_READY') {
    for (const primitive of record.missingPrimitives) add(primitive, record.definitionId, 'quest');
  }
}
for (const record of COMMUNITY_TRINKET_CAPABILITIES) {
  if (record.productionStatus !== 'PRODUCTION_READY') {
    for (const primitive of record.missingPrimitives) add(primitive, record.definitionId, 'trinket');
  }
}
const backlog = [...clusters.entries()]
  .map(([primitive, definitions]) => ({
    primitive,
    unlockPotential: definitions.questDefinitionIds.length + definitions.trinketDefinitionIds.length,
    ...definitions,
  }))
  .sort((a, b) => b.unlockPotential - a.unlockPotential || a.primitive.localeCompare(b.primitive));
writeFileSync(resolve(dataDir, 'c1b-runtime-primitive-backlog.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt, backlog }, null, 2)}\n`);

const evidence = {
  schemaVersion: 1,
  generatedAt,
  verifiedImplementationHead: head,
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  baselineHead: '1a42e312284c69ced025a20f0f5030dd820057fb',
  branch: 'phase-11a4-c1b-trinket-quest-production-integration',
  measuredCoverage: { quests: questSummary, trinkets: trinketSummary },
  productionClaims: {
    questIntegrationComplete: false,
    trinketIntegrationComplete: false,
    blocker: 'BROAD_CONTENT_RUNTIME_CAPABILITY_INSUFFICIENT',
  },
  verificationCommands: [
    'npm run typecheck',
    'npx vitest run src/game-engine/c1b-production.test.ts src/game-engine/phase8c.test.ts',
    'npm test',
    'npm run build',
    'npm run test:e2e:community-content-c1b',
  ],
};
writeFileSync(resolve(dataDir, 'c1b-production-integration-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);

const matrixReport = `# C1B Runtime Capability Matrix\n\n` +
  `Generated: ${generatedAt}\n\n` +
  `Verification scope: **LOCAL MEASURED VERIFICATION**\n\n` +
  `## Quest coverage\n\n` +
  `| Status | Count |\n| --- | ---: |\n` +
  `| Production ready | ${questSummary.runtimeReady} |\n` +
  `| Adapter required | ${questSummary.adapterRequired} |\n` +
  `| Engine primitive missing | ${questSummary.engineBlocked} |\n\n` +
  `All ${questSummary.sourceSupported} Community Quest registry definitions were measured individually. ` +
  `The separate physical source-blocked ordinary Quest is not inserted into the registry or production pool.\n\n` +
  `## Trinket coverage\n\n` +
  `| Status | Count |\n| --- | ---: |\n` +
  `| Production ready | ${trinketSummary.runtimeReady} |\n` +
  `| Adapter required | ${trinketSummary.adapterRequired} |\n` +
  `| Engine primitive missing | ${trinketSummary.engineBlocked} |\n\n` +
  `Both sides are independently gated. The two enabled definitions are Accuracy Stone and Critical Stone.\n`;
writeFileSync(resolve(reportDir, 'c1b-runtime-capability-matrix.md'), matrixReport);

const integrationReport = `# C1B Quest & Trinket Production Integration Report\n\n` +
  `Verified implementation head: \`${head}\`\n\n` +
  `Verification scope: **LOCAL MEASURED VERIFICATION**\n\n` +
  `## Outcome\n\n` +
  `C1B installed the persisted runtime content profile, central fail-closed selectors, shared UI/command Quest eligibility, ` +
  `profile-aware Nomad Wagon/loot/reward Trinket draws, and the source-correct post-roll Critical Stone reaction window.\n\n` +
  `The measured result does **not** satisfy broad content acceptance: ` +
  `\`BROAD_CONTENT_RUNTIME_CAPABILITY_INSUFFICIENT\`. Community Quest production remains blocked because the ordinary dungeon engine cannot yet represent printed room-token composition, per-unit XP, and Quest-specific rules exactly. No prototype fallback is used.\n\n` +
  `## Quest coverage\n\n| Metric | Count |\n| --- | ---: |\n` +
  `| Source-supported | ${questSummary.sourceSupported} |\n| Runtime-ready | ${questSummary.runtimeReady} |\n` +
  `| Production-enabled | ${questSummary.productionEnabled} |\n| Adapter-required | ${questSummary.adapterRequired} |\n` +
  `| Engine-blocked | ${questSummary.engineBlocked} |\n| Source-blocked physical | 1 |\n\n` +
  `## Trinket coverage\n\n| Metric | Count |\n| --- | ---: |\n` +
  `| Source physical | ${trinketSummary.sourcePhysical} |\n| Source-supported | ${trinketSummary.sourceSupported} |\n` +
  `| Runtime-ready | ${trinketSummary.runtimeReady} |\n| Production-enabled | ${trinketSummary.productionEnabled} |\n` +
  `| Engine-blocked | ${trinketSummary.engineBlocked} |\n| Source-blocked | ${trinketSummary.sourceBlocked} |\n\n` +
  `## Compatibility and persistence\n\n` +
  `Old saves migrate to \`legacy-prototype\`. New Community campaigns persist profile, content sets, regions, Quest runtime state, ` +
  `Trinket definition IDs, current side, the visible attack roll, and pending reaction state. Unknown or ineligible content fails closed.\n\n` +
  `## STOP gate\n\n` +
  `Stop after C1B. The next justified route is C1C shared content runtime primitive closure, prioritized by ` +
  `\`c1b-runtime-primitive-backlog.json\`; do not proceed to C2/R2B/R3 from this result.\n`;
writeFileSync(resolve(reportDir, 'c1b-trinket-quest-production-integration-report.md'), integrationReport);

console.log(JSON.stringify({ head, questSummary, trinketSummary, backlogEntries: backlog.length }, null, 2));
