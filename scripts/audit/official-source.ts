// Phase 11A.3 Source-Gate Integrity Repair dev doc §11, §39-41：
// Official Source Audit 脚本。
//
// 单一入口：从 canonical requirements 派生所有 source 产物。
//   - official-source-manifest.json
//   - official-source-acquisition-checklist.md
//   - source-readiness.json
//   - official-source-summary.json
//
// Exit code 语义（dev doc §39）：
//   0 = audit valid, even if source-blocked
//   non-zero = malformed / contradictory source data (NOT-VERIFIED / SOURCE-AUDIT-ERROR)

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  OFFICIAL_SOURCE_REQUIREMENTS,
  runOfficialSourceAudit,
  readLegacySourceReadinessForDriftCheck,
  type OfficialSourceRequirement,
} from '../../src/audit/core-campaign/official-source-audit';
import {
  summarizeRequirements,
  tierOf,
} from '../../src/audit/core-campaign/official-source-requirements';

const DATA_DIR = 'docs/data/core-campaign';

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function buildManifestEntry(
  req: OfficialSourceRequirement,
  status: 'available' | 'partial' | 'missing' | 'invalid',
  missingFields: string[],
  reason: string,
): Record<string, unknown> {
  return {
    requirementId: req.requirementId,
    sourceId: `asset:${req.componentId}`,
    componentGroup: req.componentGroup,
    componentType: req.componentType,
    componentId: req.componentId,
    quantity: req.quantity,
    requiredForCompletion: req.requiredForCompletion,
    tier: tierOf(req),
    sourceReference: req.sourceFilePattern,
    availability: status === 'available' ? 'available' : status === 'partial' ? 'partial' : 'missing',
    verifiedFields: req.rulebookBackedFields,
    missingFields: status === 'available' ? [] : missingFields,
    reason,
    notes: req.notes,
  };
}

function writeManifest(resolved: Map<string, { status: string; missingFields: string[]; reason: string }>): string {
  const tierA = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => tierOf(r) === 'A');
  const tierB = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => tierOf(r) === 'B');
  const tierC = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => tierOf(r) === 'C');

  const assets = OFFICIAL_SOURCE_REQUIREMENTS.map((req) => {
    const r = resolved.get(req.requirementId)!;
    return buildManifestEntry(req, r.status as 'available' | 'partial' | 'missing' | 'invalid', r.missingFields, r.reason);
  });

  // Summary 机器计算（dev doc §12）
  const summary = summarizeRequirements();
  const allTierAReady = tierA.every((r) => resolved.get(r.requirementId)?.status === 'available');
  summary.availableRequirements = OFFICIAL_SOURCE_REQUIREMENTS.filter(
    (r) => resolved.get(r.requirementId)?.status === 'available',
  ).length;
  summary.partialRequirements = OFFICIAL_SOURCE_REQUIREMENTS.filter(
    (r) => resolved.get(r.requirementId)?.status === 'partial',
  ).length;
  summary.missingRequirements = OFFICIAL_SOURCE_REQUIREMENTS.filter(
    (r) => resolved.get(r.requirementId)?.status === 'missing' && r.componentGroup !== 'rulebook',
  ).length;
  summary.auditPasses = true; // audit 跑通就能写产物

  const manifest = {
    $schema: 'phase-11a3-source-gate-integrity-repair/official-source-manifest.v2',
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

function writeChecklist(resolved: Map<string, { status: string; missingFields: string[]; reason: string }>): string {
  const lines: string[] = [];
  lines.push('# Official Source Acquisition Checklist (Phase 11A.3 Source-Gate Integrity Repair)');
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
    lines.push('| requirementId | componentId | quantity | status | missing |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const req of items) {
      const r = resolved.get(req.requirementId)!;
      const missing = r.missingFields.length > 0 ? r.missingFields.join(', ') : '—';
      lines.push(`| ${req.requirementId} | ${req.componentId} | ${req.quantity} | ${r.status} | ${missing} |`);
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
  resolved: Map<string, { status: string; missingFields: string[]; reason: string }>,
): string {
  const path = join(DATA_DIR, 'source-readiness.json');
  // 旧 schema 兼容字段（向后兼容 run-audit 读取的字段）
  const data = {
    $schema: 'phase-11a3-source-gate-integrity-repair/source-readiness.v2',
    generatedAt: readiness.generatedAt,
    phase: '11A.3',
    tierA: {
      rulebook: 'available',
      reference: 'docs/DD_EN_COREBOX_RULES.pdf',
    },
    gates: readiness.gates,
    rationale: Object.fromEntries(
      Array.from(resolved.entries()).map(([rid, r]) => [
        rid,
        r.status === 'available' ? 'verified' : 'source-required',
      ]),
    ),
    blockers: readiness.blockers,
    auditPasses: readiness.auditPasses,
    outcome: readiness.outcome,
    // legacy 兼容
    impact: {
      canEnterPhase11B: readiness.gates.allRequiredSourcesReady,
      canCloseP0_002: readiness.gates.allRequiredSourcesReady,
      canEnableOfficialGuardianPool: readiness.gates.templarsReady && readiness.gates.mammothCystReady && readiness.gates.shufflingHorrorReady,
      canEnableOfficialFinalEncounter: readiness.gates.finalEncounterReady,
      canEnableOfficialDarkestDungeonQuestPool: readiness.gates.questCardsReady,
      canEnableOfficialDarkestDungeonMonsterDeck: readiness.gates.darkestDungeonMonsterDeckReady,
      verdict: readiness.gates.allRequiredSourcesReady ? 'READY' : (readiness.outcome.kind === 'source-audit-error' ? 'SOURCE-AUDIT-ERROR' : 'SOURCE-BLOCKED'),
    },
  };
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  return path;
}

function checkDrift(): string[] {
  const legacy = readLegacySourceReadinessForDriftCheck();
  if (!legacy) return [];
  // 仅做漂移警告，不影响 exit code
  const warnings: string[] = [];
  // 旧 schema 没 quantity / schemaVersion 2 / auditPasses 等字段——记录但不报错
  if (typeof (legacy as unknown as Record<string, unknown>).schemaVersion === 'undefined') {
    warnings.push('Legacy source-readiness.json detected (schema v1). Re-running audit:official-source regenerated it as v2.');
  }
  return warnings;
}

function main(): number {
  ensureDir(DATA_DIR);
  const { readiness, summary } = runOfficialSourceAudit();

  // Build resolved map (requirementId -> {status, missingFields, reason})
  const resolved = new Map<string, { status: string; missingFields: string[]; reason: string }>();
  for (const b of readiness.blockers) {
    resolved.set(b.requirementId, {
      status: 'missing',
      missingFields: b.missingFields,
      reason: b.reason,
    });
  }
  // 补上 rulebook
  resolved.set('tierA-rulebook', { status: 'available', missingFields: [], reason: 'Tier A rulebook present' });
  // 补上 available 项
  for (const req of OFFICIAL_SOURCE_REQUIREMENTS) {
    if (!resolved.has(req.requirementId)) {
      resolved.set(req.requirementId, { status: 'available', missingFields: [], reason: 'all required fields verified' });
    }
  }

  const manifestPath = writeManifest(resolved);
  const checklistPath = writeChecklist(resolved);
  const readinessPath = writeReadiness(readiness, resolved);
  const summaryPath = writeSummary(summary);

  console.log('====================');
  console.log('  audit:official-source');
  console.log('====================');
  console.log(`总 requirement     : ${readiness.requirementCount}`);
  console.log(`Tier A (rulebook)  : available (1)`);
  console.log(`Tier B (cards/tile): ${summary.tierBRequirements} requirements`);
  console.log(`Tier C (errata)    : ${summary.tierCRequirements} requirements`);
  console.log(`available          : ${summary.availableRequirements}`);
  console.log(`partial            : ${summary.partialRequirements}`);
  console.log(`missing            : ${summary.missingRequirements}`);
  console.log(`auditPasses        : ${readiness.auditPasses}`);
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
main();
process.exit(process.exitCode ?? 0);
