// Phase 11A.3 Source-Gate Final Acceptance Closure dev doc §10-11：
// Official Source Audit 脚本。
//
// 单一入口：从 canonical requirements 派生所有 source 产物。
//   - official-source-manifest.json
//   - official-source-acquisition-checklist.md
//   - source-readiness.json
//   - official-source-summary.json
//
// Exit code 语义：
//   0 = audit valid, even if source-blocked
//   non-zero = malformed / contradictory source data (NOT-VERIFIED / SOURCE-AUDIT-ERROR)
//
// Phase 11A.3 SGIR Final Acceptance：所有 manifest / checklist / readiness / summary
// 全部从 runOfficialSourceAudit().readiness.resolvedRequirements 直接消费，
// 不再从 readiness.blockers 逆推状态（避免 partial 被错误写成 missing）。

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  OFFICIAL_SOURCE_REQUIREMENTS,
  runOfficialSourceAudit,
  readLegacySourceReadinessForDriftCheck,
  type OfficialSourceRequirement,
  type ResolvedRequirement,
} from '../../src/audit/core-campaign/official-source-audit';
import {
  summarizeRequirements,
  tierOf,
} from '../../src/audit/core-campaign/official-source-requirements';

const REPO_ROOT = process.env.PHASE11A3_REPO_ROOT ?? process.cwd();
const DATA_DIR = join(REPO_ROOT, 'docs/data/core-campaign');
const OFFICIAL_SOURCE_ROOT = process.env.PHASE11A3_OFFICIAL_SOURCE_ROOT
  ?? join(REPO_ROOT, 'docs/data/darkest-dungeon/official');
const RULEBOOK_PATH = process.env.PHASE11A3_RULEBOOK_PATH
  ?? join(REPO_ROOT, 'docs/DD_EN_COREBOX_RULES.pdf');

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function buildManifestEntry(
  req: OfficialSourceRequirement,
  resolved: ResolvedRequirement,
): Record<string, unknown> {
  // dev doc §11：expectedSourcePattern 与 sourceReferences 分离
  // 缺资料时 sourceReferences=[]，只写 expectedSourcePattern
  return {
    requirementId: req.requirementId,
    sourceId: `asset:${req.componentId}`,
    componentGroup: req.componentGroup,
    componentType: req.componentType,
    componentId: req.componentId,
    quantity: req.quantity,
    requiredForCompletion: req.requiredForCompletion,
    tier: tierOf(req),
    /** dev doc §11：expected file path（不是 authoritative source）。 */
    expectedSourcePattern: req.sourceFilePattern,
    /** dev doc §11：资料齐备时填真实 sourceReference；缺资料 = []。 */
    sourceReferences: resolved.sourceReferences,
    /** 实际解析到的 source document 数量。 */
    resolvedAssetCount: resolved.resolvedAssetCount,
    /** dev doc §10：直接从 resolvedRequirement.status 取，不再统一 missing。 */
    status: resolved.status,
    availability: resolved.status === 'available'
      ? 'available'
      : resolved.status === 'partial'
        ? 'partial'
        : 'missing',
    verifiedFields: req.rulebookBackedFields,
    missingFields: resolved.missingFields,
    reason: resolved.reason,
    notes: req.notes,
  };
}

function writeManifest(resolvedByReq: Map<string, ResolvedRequirement>): string {
  const tierA = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => tierOf(r) === 'A');
  const tierB = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => tierOf(r) === 'B');
  const tierC = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => tierOf(r) === 'C');

  const assets = OFFICIAL_SOURCE_REQUIREMENTS.map((req) => {
    const r = resolvedByReq.get(req.requirementId)!;
    return buildManifestEntry(req, r);
  });

  // Summary 机器计算（dev doc §12）
  const summary = summarizeRequirements();
  const allTierAReady = tierA.every(
    (r) => resolvedByReq.get(r.requirementId)?.status === 'available',
  );
  summary.availableRequirements = OFFICIAL_SOURCE_REQUIREMENTS.filter(
    (r) => resolvedByReq.get(r.requirementId)?.status === 'available',
  ).length;
  summary.partialRequirements = OFFICIAL_SOURCE_REQUIREMENTS.filter(
    (r) => resolvedByReq.get(r.requirementId)?.status === 'partial',
  ).length;
  summary.missingRequirements = OFFICIAL_SOURCE_REQUIREMENTS.filter(
    (r) => resolvedByReq.get(r.requirementId)?.status === 'missing' && r.componentGroup !== 'rulebook',
  ).length;
  // Never overwrite the audit result in the serializer. Missing source is valid
  // SOURCE-BLOCKED evidence; malformed source must remain auditPasses=false.
  summary.auditPasses = summary.auditPasses;

  const requiredResolved = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => r.requiredForCompletion);
  const optionalResolved = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => !r.requiredForCompletion);
  summary.requiredAvailableCount = requiredResolved.filter(
    (r) => resolvedByReq.get(r.requirementId)?.status === 'available',
  ).length;
  summary.requiredMissingCount = requiredResolved.filter(
    (r) => resolvedByReq.get(r.requirementId)?.status === 'missing',
  ).length;
  summary.requiredPartialCount = requiredResolved.filter(
    (r) => resolvedByReq.get(r.requirementId)?.status === 'partial',
  ).length;
  summary.optionalMissingCount = optionalResolved.filter(
    (r) => resolvedByReq.get(r.requirementId)?.status === 'missing',
  ).length;
  summary.optionalPartialCount = optionalResolved.filter(
    (r) => resolvedByReq.get(r.requirementId)?.status === 'partial',
  ).length;

  const manifest = {
    $schema: 'phase-11a3-source-gate-final-acceptance/official-source-manifest.v3',
    generatedAt: new Date().toISOString(),
    phase: '11A.3',
    purpose: '派生自 canonical official-source-requirements.ts；禁止手写 summary count。',
    tierAReference: 'docs/DD_EN_COREBOX_RULES.pdf',
    tierBExcluded: [
      '电子游戏 Wiki',
      'Fandom / Reddit / Steam 推断',
      'Prototype harness 数值',
      '视觉估算 / 相邻 Boss 数据 / 另一版桌游',
      'AI 推测',
    ],
    summary: {
      ...summary,
      // 语义区分（dev doc §13）：tierA 显式说明是否计入
      tierAReady: allTierAReady,
      tierARequirementsCount: tierA.length,
      tierBRequirementsCount: tierB.length,
      tierCRequirementsCount: tierC.length,
      // rulebook 是否计入 total：算入（rulebook 本身就是一个 requirement），但 tierB 才是 gap
      rulebookCountedInTotal: true,
    },
    assets,
  };

  const path = join(DATA_DIR, 'official-source-manifest.json');
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  return path;
}

function writeChecklist(resolvedByReq: Map<string, ResolvedRequirement>): string {
  const lines: string[] = [];
  lines.push('# Official Source Acquisition Checklist (Phase 11A.3 Source-Gate Final Acceptance)');
  lines.push('');
  lines.push('> 单一真值：`src/audit/core-campaign/official-source-requirements.ts`');
  lines.push('> 生成命令：`npm run audit:official-source`');
  lines.push('> 关联产物：');
  lines.push('> - `official-source-manifest.json`');
  lines.push('> - `source-readiness.json`');
  lines.push('> - `official-source-summary.json`');
  lines.push('> - `official-source-acquisition-checklist.md`（本文件）');
  lines.push('');
  lines.push('## 0. 原则');
  lines.push('');
  lines.push('Source-Gated：所有 Darkest Dungeon Act IV 官方数据必须来自下列 tier。');
  lines.push('');
  lines.push('| Tier | 来源 |');
  lines.push('| --- | --- |');
  lines.push('| A | `docs/DD_EN_COREBOX_RULES.pdf`（p35-41）|');
  lines.push('| B | 官方 Battle / Quest / Room Card / Dungeon Tile / Monster Card |');
  lines.push('| C | 官方勘误 / 数字资料 |');
  lines.push('');
  lines.push('**禁止**：电子游戏 Wiki / Fandom / Prototype harness / 视觉估算 / AI 推测。');
  lines.push('');

  // 按 group 分类
  const groupOrder: Array<{ group: string; title: string }> = [
    { group: 'quest', title: '1. Darkest Dungeon Quest (3 张 Quest Card)' },
    { group: 'dungeon-tile', title: '2. Darkest Dungeon Dungeon Tiles (2 张)' },
    { group: 'templars', title: '3. Templars (Battle Cards + Room Card + Tile)' },
    { group: 'mammoth-cyst', title: '4. Mammoth Cyst (Battle Cards + Room Card)' },
    { group: 'shuffling-horror', title: '5. Shuffling Horror (Battle Cards + Room Card)' },
    { group: 'final-encounter', title: '6. Final Encounter (Room + Tile + 4 Form + Reflections + Absolute Nothingness + Come Unto Your Maker)' },
    { group: 'monster-deck', title: '7. Darkest Dungeon Monster Deck' },
    { group: 'official-errata', title: '8. Official Errata (optional)' },
  ];

  for (const { group, title } of groupOrder) {
    const items = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => r.componentGroup === group);
    if (items.length === 0) continue;
    lines.push(`## ${title}`);
    lines.push('');
    lines.push('| requirementId | componentId | quantity | required | status | missing |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const req of items) {
      const r = resolvedByReq.get(req.requirementId)!;
      const missing = r.missingFields.length > 0 ? r.missingFields.join(', ') : '—';
      lines.push(`| ${req.requirementId} | ${req.componentId} | ${req.quantity} | ${req.requiredForCompletion ? 'Y' : 'N'} | ${r.status} | ${missing} |`);
    }
    lines.push('');
  }

  lines.push('## 收到资料后');
  lines.push('');
  lines.push('1. 把结构化 JSON 放到 `docs/data/darkest-dungeon/official/` 对应目录（schema 见 `src/audit/core-campaign/official-source-audit.ts:OfficialSourceDocument`）');
  lines.push('2. 跑 `npm run audit:official-source`');
  lines.push('3. 跑 `npm run verify:phase11a3-source-gate`');
  lines.push('4. 跑 `npm run audit:release-gate`');

  const path = join(DATA_DIR, 'official-source-acquisition-checklist.md');
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
  return path;
}

function writeSummary(summary: ReturnType<typeof summarizeRequirements>): string {
  const path = join(DATA_DIR, 'official-source-summary.json');
  const data = {
    ...summary,
    // semantic 区分
    rulebookCountedInTotal: true,
    tierACounted: true,
    notes: '由 official-source-audit.ts 派生；禁止手写 count 字段。',
  };
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  return path;
}

function writeReadiness(
  readiness: ReturnType<typeof runOfficialSourceAudit>['readiness'],
): string {
  const path = join(DATA_DIR, 'source-readiness.json');
  // 旧 schema 兼容字段（向后兼容 run-audit 读取的字段）
  const data = {
    $schema: 'phase-11a3-source-gate-final-acceptance/source-readiness.v3',
    generatedAt: readiness.generatedAt,
    phase: '11A.3',
    tierA: {
      rulebook: readiness.resolvedRequirements.find((r) => r.requirementId === 'tierA-rulebook')?.status ?? 'missing',
      reference: 'docs/DD_EN_COREBOX_RULES.pdf',
    },
    gates: readiness.gates,
    // dev doc §6：rationale 区分 required/optional
    rationale: Object.fromEntries(
      readiness.resolvedRequirements.map((r) => [
        r.requirementId,
        r.status === 'available' ? 'verified' : 'source-required',
      ]),
    ),
    // dev doc §17：canEnterPhase11B 不由 source readiness 决定
    // source readiness 只输出 canBeginOfficialImport
    impact: {
      canBeginOfficialImport: readiness.gates.allRequiredSourcesReady,
      canCloseP0_002: false, // 终态判定由 release-gate 在 Phase 11A.3 COMPLETE 后才输出
      canEnableOfficialGuardianPool: readiness.gates.templarsReady && readiness.gates.mammothCystReady && readiness.gates.shufflingHorrorReady,
      canEnableOfficialFinalEncounter: readiness.gates.finalEncounterReady,
      canEnableOfficialDarkestDungeonQuestPool: readiness.gates.questCardsReady,
      canEnableOfficialDarkestDungeonMonsterDeck: readiness.gates.darkestDungeonMonsterDeckReady,
      verdict: readiness.gates.allRequiredSourcesReady
        ? 'READY'
        : readiness.outcome.kind === 'source-audit-error'
          ? 'SOURCE-AUDIT-ERROR'
          : 'SOURCE-BLOCKED',
    },
    blockers: readiness.blockers, // 保留兼容（不再被 generator 消费）
    auditPasses: readiness.auditPasses,
    outcome: readiness.outcome,
    // dev doc §13：canonical Act IV scope
    officialActFourRequiredSourceCount: OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => r.requiredForCompletion).length,
    officialActFourMissingSourceRequirements: readiness.resolvedRequirements
      .filter((r) => {
        const req = OFFICIAL_SOURCE_REQUIREMENTS.find((x) => x.requirementId === r.requirementId);
        return req?.requiredForCompletion && r.status === 'missing';
      })
      .map((r) => r.requirementId),
    officialActFourPartialSourceRequirements: readiness.resolvedRequirements
      .filter((r) => {
        const req = OFFICIAL_SOURCE_REQUIREMENTS.find((x) => x.requirementId === r.requirementId);
        return req?.requiredForCompletion && r.status === 'partial';
      })
      .map((r) => r.requirementId),
    // dev doc §12：structured provenanceAudit
    provenanceAudit: readiness.provenanceAudit,
  };
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  return path;
}

function checkDrift(): string[] {
  const legacy = readLegacySourceReadinessForDriftCheck();
  if (!legacy) return [];
  const warnings: string[] = [];
  if (typeof (legacy as unknown as Record<string, unknown>).schemaVersion === 'undefined') {
    warnings.push('Legacy source-readiness.json detected (schema v1). Re-running audit:official-source regenerated it as v3.');
  }
  return warnings;
}

function main(): number {
  ensureDir(DATA_DIR);
  const { readiness, summary } = runOfficialSourceAudit({
    repoRoot: REPO_ROOT,
    officialSourceRoot: OFFICIAL_SOURCE_ROOT,
    rulebookPath: RULEBOOK_PATH,
  });

  // dev doc §10：直接消费 resolvedRequirements 构建 map；不通过 blockers 推
  const resolvedByReq = new Map<string, ResolvedRequirement>();
  for (const r of readiness.resolvedRequirements) {
    resolvedByReq.set(r.requirementId, r);
  }

  const manifestPath = writeManifest(resolvedByReq);
  const checklistPath = writeChecklist(resolvedByReq);
  const readinessPath = writeReadiness(readiness);
  const summaryPath = writeSummary(summary);

  console.log('====================');
  console.log('  audit:official-source');
  console.log('====================');
  console.log(`总 requirement     : ${readiness.requirementCount}`);
  console.log(`Tier A (rulebook)  : ${resolvedByReq.get('tierA-rulebook')?.status ?? 'unknown'}`);
  console.log(`Tier B (cards/tile): ${summary.tierBRequirements} requirements`);
  console.log(`Tier C (errata)    : ${summary.tierCRequirements} requirements`);
  console.log(`available          : ${summary.availableRequirements}`);
  console.log(`partial            : ${summary.partialRequirements}`);
  console.log(`missing            : ${summary.missingRequirements}`);
  console.log(`requiredMissingCount : ${summary.requiredMissingCount}`);
  console.log(`requiredPartialCount : ${summary.requiredPartialCount}`);
  console.log(`optionalMissingCount : ${summary.optionalMissingCount}`);
  console.log(`auditPasses        : ${readiness.auditPasses}`);
  console.log(`provenanceAudit.passes: ${readiness.provenanceAudit.passes}`);
  console.log(`outcome            : ${readiness.outcome.kind}`);
  console.log(`allRequiredSourcesReady: ${readiness.gates.allRequiredSourcesReady}`);
  console.log('');
  console.log('产物:');
  console.log(`  - ${manifestPath}`);
  console.log(`  - ${checklistPath}`);
  console.log(`  - ${readinessPath}`);
  console.log(`  - ${summaryPath}`);

  const driftWarnings = checkDrift();
  if (driftWarnings.length > 0) {
    console.log('');
    console.log('Drift warnings:');
    driftWarnings.forEach((w: string) => console.log(`  - ${w}`));
  }

  // Exit code：audit valid → 0；malformed → non-zero
  if (readiness.outcome.kind === 'source-audit-error') {
    console.error('SOURCE-AUDIT-ERROR:');
    for (const e of readiness.auditErrors) {
      console.error(`  [${e.code}] ${e.requirementId ?? '?'} / ${e.sourceAssetId ?? '?'} — ${e.message}`);
    }
    return 1;
  }
  return 0;
}

// Phase 11A.3 SGIR §39：vite-node 不设 `require.main === module`，所以直接执行。
// 同样适用于 npm run audit:official-source 显式调用入口。
//
// Phase 11A.3 Source-Gate Final Acceptance Closure §2（CLI Exit Truth）：
//   必须真实把 main() 的 return code 传给 shell（之前用 process.exitCode ?? 0 会吞掉 1）。
process.exit(main());
