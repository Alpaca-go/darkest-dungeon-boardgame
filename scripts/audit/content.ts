// Phase 11A — `npm run audit:content`
// 生成 Content Manifest / Prototype Scan / Reference Validation / Golden Seed 矩阵产物。

import {
  generateContentManifest,
  summarizeManifest,
  scanOfficialRuntimeForPrototypeContent,
  validateCoreContentReferences,
  GOLDEN_SEEDS,
  CAMPAIGN_MILESTONES,
  stableHashState,
} from '../../src/audit/core-campaign/index';
import { banner, mdTable, rel, writeJson, writeReport } from './io';

const manifest = generateContentManifest();
const summary = summarizeManifest(manifest);
const manifestHash = stableHashState(manifest);
const prototypeFindings = scanOfficialRuntimeForPrototypeContent(manifest);
const referenceIssues = validateCoreContentReferences();
const refErrors = referenceIssues.filter((i) => i.severity === 'error');
const refWarnings = referenceIssues.filter((i) => i.severity === 'warning');

const written: string[] = [];

written.push(writeJson('manifest.json', { manifestHash, summary, ...manifest }));
written.push(
  writeJson('prototype-scan.json', {
    manifestHash,
    findingCount: prototypeFindings.length,
    findings: prototypeFindings,
  }),
);
written.push(
  writeJson('reference-validation.json', {
    manifestHash,
    errorCount: refErrors.length,
    warningCount: refWarnings.length,
    issues: referenceIssues,
  }),
);
written.push(
  writeJson('golden-seeds.json', {
    milestones: CAMPAIGN_MILESTONES,
    seeds: GOLDEN_SEEDS,
    runnable: GOLDEN_SEEDS.filter((s) => s.runnable).length,
    blocked: GOLDEN_SEEDS.filter((s) => !s.runnable).length,
  }),
);

// ---------------------------------------------------------------------------
// Markdown 报告
// ---------------------------------------------------------------------------

const categoryRows = Object.entries(summary.byCategory)
  .sort((a, b) => b[1] - a[1])
  .map(([cat, n]) => {
    const list = (manifest as unknown as Record<string, Array<{ officialDataStatus: string; runtimeReadiness: string }>>)[cat] ?? [];
    const verified = list.filter((e) => e.officialDataStatus === 'verified').length;
    const partial = list.filter((e) => e.officialDataStatus === 'partial').length;
    const proto = list.filter((e) => e.officialDataStatus === 'prototype').length;
    const unav = list.filter((e) => e.officialDataStatus === 'unavailable').length;
    const ready = list.filter((e) => e.runtimeReadiness === 'official-ready').length;
    const fw = list.filter((e) => e.runtimeReadiness === 'framework-only').length;
    const blocked = list.filter((e) => e.runtimeReadiness === 'blocked').length;
    return [cat, n, verified, partial, proto, unav, ready, fw, blocked];
  });

const emptyCategories = Object.keys(manifest)
  .filter((k) => Array.isArray((manifest as unknown as Record<string, unknown[]>)[k]))
  .filter((k) => ((manifest as unknown as Record<string, unknown[]>)[k]).length === 0);

const md = `# Phase 11A — Core Campaign Content Manifest / 内容审计

> 由 \`npm run audit:content\` 自动生成，请勿手改。
> Manifest Hash: \`${manifestHash}\`

## 1. 总览

- 内容条目总数：**${summary.total}**
- 官方就绪（official-ready）：**${summary.officialReady}**
- 被阻断（blocked）：**${summary.blocked}**
- prototype 状态条目：**${summary.prototype}**
- 官方资料 unavailable：**${summary.unavailable}**
- 缺少 \`sourceReference\`：**${summary.missingSourceReference} / ${summary.total}**

### 1.1 四态分布

${mdTable(['officialDataStatus', '数量'], Object.entries(summary.byStatus).map(([k, v]) => [k, v]))}

${mdTable(['runtimeReadiness', '数量'], Object.entries(summary.byReadiness).map(([k, v]) => [k, v]))}

## 2. 分类明细

${mdTable(
  ['category', '合计', 'verified', 'partial', 'prototype', 'unavailable', 'official-ready', 'framework-only', 'blocked'],
  categoryRows,
)}

${
  emptyCategories.length > 0
    ? `> ⚠️ 以下分类在当前代码库中**没有任何实现条目**（spec §6 要求的槽位存在但内容为空）：\n> ${emptyCategories.map((c) => `\`${c}\``).join('、')}\n`
    : ''
}

## 3. Prototype 污染扫描

官方路径 prototype 引用数：**${prototypeFindings.length}**

${mdTable(['surface', 'id', 'detail'], prototypeFindings.map((f) => [f.surface, f.id, f.detail]))}

## 4. 引用完整性校验

- error：**${refErrors.length}**
- warning：**${refWarnings.length}**

${mdTable(['severity', 'code', 'message'], referenceIssues.slice(0, 60).map((i) => [i.severity, i.code, i.message.replace(/\|/g, '\\|')]))}
${referenceIssues.length > 60 ? `\n> 仅展示前 60 条，完整列表见 \`docs/data/core-campaign/reference-validation.json\`。\n` : ''}

## 5. Golden Seed 矩阵

- 可运行：**${GOLDEN_SEEDS.filter((s) => s.runnable).length}**
- 被阻断：**${GOLDEN_SEEDS.filter((s) => !s.runnable).length}**

${mdTable(
  ['seedId', 'mode', 'expectedOutcome', 'runnable', 'blockedReason'],
  GOLDEN_SEEDS.map((s) => [s.id, s.campaignMode, s.expectedOutcome, s.runnable ? '✅' : '❌', s.blockedReason ?? '—']),
)}

## 6. 结论

${
  summary.officialReady === 0
    ? '**没有任何内容条目达到 official-ready**。核心原因：代码库中的内容定义普遍缺少 `sourceReference` 字段，按 spec §6 的判定规则，无 source 一律不得判为 `verified` / `official-ready`。这是**内容治理缺口**，不是运行时缺陷。'
    : `有 ${summary.officialReady} 条内容达到 official-ready。`
}

Act IV（Guardian / Final Encounter / Darkest Dungeon Quest）的官方卡面数据为 \`unavailable\`，
由 Data Gate 主动关闭官方池，**属设计内行为**，不得猜测补全（硬约束 22）。
`;

written.push(writeReport('01-content-manifest.md', md));

banner('audit:content');
console.log(`内容条目            : ${summary.total}`);
console.log(`official-ready      : ${summary.officialReady}`);
console.log(`blocked             : ${summary.blocked}`);
console.log(`prototype           : ${summary.prototype}`);
console.log(`unavailable         : ${summary.unavailable}`);
console.log(`缺 sourceReference  : ${summary.missingSourceReference}`);
console.log(`prototype 污染      : ${prototypeFindings.length}`);
console.log(`引用 error/warning  : ${refErrors.length} / ${refWarnings.length}`);
console.log(`Manifest Hash       : ${manifestHash}`);
console.log('\n产物:');
for (const p of written) console.log(`  - ${rel(p)}`);

if (prototypeFindings.length > 0 || refErrors.length > 0) {
  console.log('\n⚠️  存在 prototype 污染或引用 error，详见报告（不阻断本脚本退出码，由 release-gate 裁决）。');
}
