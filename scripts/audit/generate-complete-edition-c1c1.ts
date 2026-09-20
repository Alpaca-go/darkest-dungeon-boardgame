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
const generatedAt = new Date().toISOString();
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();

const baseline = {
  schemaVersion: 1,
  generatedAt,
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  baselineHead: 'f30c866db41d81795d6ea7c6c4f459fee83da92c',
  censusDimensions: ['declaredMissingPrimitive', 'enginePrimitivePresent', 'adapterPresent', 'productionProofPresent', 'productionStatus'],
  enginePrimitives: {
    POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW: true,
    QUEST_ROOM_TOKEN_COMPOSITION: false,
    QUEST_XP_UNIT_ACCOUNTING: false,
    QUEST_SPECIAL_RULE_ADAPTER: false,
  },
  productionReady: { quests: 0, trinkets: 2 },
  note: 'Measured against the immutable C1B-R2 base before C1C-1 implementation; the stale C1B backlog is not used as engine truth.',
};
writeFileSync(resolve(dataDir, 'c1c1-runtime-capability-baseline.json'), `${JSON.stringify(baseline, null, 2)}\n`);

const summarize = (records: typeof COMMUNITY_QUEST_CAPABILITIES) => ({
  sourceSupported: records.filter((entry) => entry.sourceStatus === 'source-supported').length,
  productionReady: records.filter((entry) => entry.productionStatus === 'PRODUCTION_READY').length,
  adapterRequired: records.filter((entry) => entry.productionStatus === 'ADAPTER_REQUIRED').length,
  engineBlocked: records.filter((entry) => entry.productionStatus === 'ENGINE_PRIMITIVE_MISSING').length,
  sourceBlocked: records.filter((entry) => entry.productionStatus === 'SOURCE_BLOCKED').length,
});
const matrix = {
  schemaVersion: 1,
  generatedAt,
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  implementedPrimitives: ['QUEST_ROOM_TOKEN_COMPOSITION', 'QUEST_XP_UNIT_ACCOUNTING', 'POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW'],
  quests: COMMUNITY_QUEST_CAPABILITIES,
  trinkets: COMMUNITY_TRINKET_CAPABILITIES,
  summary: { quests: summarize(COMMUNITY_QUEST_CAPABILITIES), trinkets: summarize(COMMUNITY_TRINKET_CAPABILITIES) },
};
writeFileSync(resolve(dataDir, 'c1c1-runtime-capability-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);

const clusters = new Map<string, { questDefinitionIds: string[]; trinketDefinitionIds: string[] }>();
const add = (primitive: string, definitionId: string, key: 'questDefinitionIds' | 'trinketDefinitionIds') => {
  const entry = clusters.get(primitive) ?? { questDefinitionIds: [], trinketDefinitionIds: [] };
  entry[key].push(definitionId);
  clusters.set(primitive, entry);
};
for (const capability of COMMUNITY_QUEST_CAPABILITIES) {
  if (capability.productionStatus !== 'PRODUCTION_READY') for (const primitive of capability.missingPrimitives) add(primitive, capability.definitionId, 'questDefinitionIds');
}
for (const capability of COMMUNITY_TRINKET_CAPABILITIES) {
  if (capability.productionStatus !== 'PRODUCTION_READY') for (const primitive of capability.missingPrimitives) add(primitive, capability.definitionId, 'trinketDefinitionIds');
}
const backlog = [...clusters.entries()].map(([primitive, ids]) => ({
  primitive,
  unlockPotential: ids.questDefinitionIds.length + ids.trinketDefinitionIds.length,
  ...ids,
})).sort((a, b) => b.unlockPotential - a.unlockPotential || a.primitive.localeCompare(b.primitive));
writeFileSync(resolve(dataDir, 'c1c1-runtime-primitive-backlog.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt, backlog }, null, 2)}\n`);

const readyQuestDefinitionIds = COMMUNITY_QUEST_CAPABILITIES.filter((entry) => entry.productionStatus === 'PRODUCTION_READY').map((entry) => entry.definitionId);
const report = `# C1C-1 Core Quest Foundation Runtime Closure\n\n` +
  `Verification scope: **LOCAL MEASURED VERIFICATION**\n\n` +
  `Implementation HEAD at generation: \`${head}\` (tree \`${tree}\`).\n\n` +
  `## Outcome\n\nQuest Production Ready increased from **0 / 75** to **${readyQuestDefinitionIds.length} / 75**. ` +
  `Trinket Production Ready remains **2 / 48**. The shared room-token composition and XP-unit accounting primitives are implemented; this does not automatically promote definitions without adapters and executable proofs.\n\n` +
  `## Ready quests\n\n${readyQuestDefinitionIds.map((id) => `- \`${id}\``).join('\n')}\n\n` +
  `The three simple Crimson Court quests remain ADAPTER_REQUIRED. Quests with special rules remain engine-blocked. ` +
  `Community room composition preserves the exact source token multiset while using deterministic runtime placement; it does not claim source-authored topology.\n`;
writeFileSync(resolve(reportDir, 'c1c1-core-quest-foundation-report.md'), report);

console.log(JSON.stringify({ head, tree, summary: matrix.summary, readyQuestDefinitionIds, backlogEntries: backlog.length }, null, 2));
