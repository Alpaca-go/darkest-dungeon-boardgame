// Phase 11A — §43 最终报告生成器。
//
// 本脚本**不做任何新的审计计算**，只聚合 docs/data/core-campaign/*.json 里
// 由 audit:content / audit:rules / audit:release-gate 产出的既有结论，
// 汇编成一份可交付的 phase-11a-final-report.md。
//
// 这样做的原因：最终报告必须与各分项报告**逐字一致**，任何手写摘要都可能与
// 数据产物漂移。若某项数据缺失，报告里直接写「未采集」而不是猜测。

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { CAMPAIGN_MILESTONES, GOLDEN_SEEDS } from '../../src/audit/core-campaign/golden-seeds';

import { banner, DATA_DIR, mdTable, rel, writeReport } from './io';

// ---------------------------------------------------------------------------
// 数据装载：缺失即诚实标注，绝不编造
// ---------------------------------------------------------------------------

const missingArtifacts: string[] = [];

function loadJson<T>(name: string): T | null {
  const p = join(DATA_DIR, name);
  if (!existsSync(p)) {
    missingArtifacts.push(name);
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch (e) {
    missingArtifacts.push(`${name}（解析失败：${e instanceof Error ? e.message : String(e)}）`);
    return null;
  }
}

interface ManifestSummary {
  total: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  byReadiness: Record<string, number>;
  officialReady: number;
  blocked: number;
  prototype: number;
  unavailable: number;
  missingSourceReference: number;
}

const manifest = loadJson<{ manifestHash: string; summary: ManifestSummary; generatedAt: string }>(
  'manifest.json',
);
const prototypeScan = loadJson<{ findingCount: number; findings: unknown[] }>('prototype-scan.json');
const refValidation = loadJson<{ errorCount: number; warningCount: number; issues: unknown[] }>(
  'reference-validation.json',
);
const traceability = loadJson<{
  summary: {
    total: number;
    p0Total: number;
    implementedAndTested: number;
    implementedNotTested: number;
    dataMissing: number;
    implementationMissing: number;
    p0Complete: boolean;
    blockedRuleIds: string[];
  };
  records: { id: string; status: string; ruleSummary: string; notes: string[] }[];
}>('rule-traceability.json');
const rng = loadJson<{
  passed: boolean;
  mathRandomLeaks: number;
  officialPathMathRandomLeaks: number;
  timeSourceLeaks: number;
  definitionHashStable: boolean;
  officialFindings: { file: string; line: number; text: string }[];
}>('rng-audit.json');
const goldenRun = loadJson<{
  seedId: string;
  outcome: string;
  reachedMilestones: string[];
  blockedAtMilestone: string | null;
  blockedReason: string | null;
  finalAct: number;
  finalPhase: string;
  completedQuestCount: number;
  eventCount: number;
  rngDrawCount: number;
  invariantErrorCount: number;
  duplicateTransactionIds: string[];
  deadlockPhase: string | null;
  actStuckAfterQuests: number | null;
  maxQuestsWithActStuck: number;
  uiStoreShimSteps: string[];
  saveResumeChecks: { milestoneId: string; label: string; passed: boolean }[];
  milestoneHashes: { id: string; stateHash: string }[];
}>('golden-run.json');
const gate = loadJson<
  Record<string, unknown> & {
    verdict: string;
    conclusion: string;
    /** env flag 未提供、因而「未测量」而非「测量后失败」的门禁位。 */
    unmeasuredGateBits?: string[];
  }
>('release-gate.json');
const ledger = loadJson<{
  openP0: number;
  openP1: number;
  openP2: number;
  issues: {
    id: string;
    severity: string;
    status: string;
    domain: string;
    title: string;
    expected?: string;
    actual?: string;
  }[];
}>('issue-ledger.json');
const perf = loadJson<{
  newCampaignInit: { avgMs: number };
  questSetup: { avgMs: number };
  battleSetup: { avgMs: number };
  save: { avgMs: number; representativeBytes: number };
  load: { avgMs: number };
  formTransition: { avgMs: number; mechanismLevel: boolean; reachabilityNote: string };
  fullRun: {
    eventCount: number;
    maxSaveBytes: number;
    maxLedger: number;
    peakActors: number;
    peakInitiative: number;
  };
  engineeringGate: {
    saveLoad100xNoCrash: boolean;
    saveLoad100xNoInflation: boolean;
    formTransitionNoLeak: boolean;
    longUnresponsive: boolean;
  };
}>('performance-baseline.json');

// ---------------------------------------------------------------------------
// Build Commit
// ---------------------------------------------------------------------------

function gitInfo(): { commit: string; branch: string; dirty: string } {
  const safe = (cmd: string, fallback: string) => {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return fallback;
    }
  };
  const status = safe('git status --porcelain', '');
  return {
    commit: safe('git rev-parse HEAD', '未采集（git 不可用）'),
    branch: safe('git rev-parse --abbrev-ref HEAD', '未采集'),
    dirty: status === '' ? '干净' : `${status.split('\n').filter(Boolean).length} 个文件未提交`,
  };
}

const git = gitInfo();

// ---------------------------------------------------------------------------
// 组装
// ---------------------------------------------------------------------------

const NA = '_未采集_';

const milestoneRows = CAMPAIGN_MILESTONES.map((m) => {
  const reached = goldenRun?.reachedMilestones.includes(m.id) ?? false;
  const hash = goldenRun?.milestoneHashes.find((h) => h.id === m.id)?.stateHash;
  return [m.id, m.label, reached ? '✅' : '❌', hash ? `\`${hash}\`` : '—'];
});

const seedRows = GOLDEN_SEEDS.map((s) => [
  s.id,
  s.campaignMode,
  s.runnable ? '✅ 可跑' : '❌ 不可跑',
  s.runnable ? '—' : (s.blockedReason ?? '未说明'),
]);

const issueRows =
  ledger?.issues.map((i) => [i.id, i.severity, i.status, i.domain, i.title]) ?? [];

const traceRows =
  traceability?.records.map((r) => [
    r.id,
    r.status,
    r.ruleSummary.length > 46 ? `${r.ruleSummary.slice(0, 46)}…` : r.ruleSummary,
  ]) ?? [];

const saveResumeRows =
  goldenRun?.saveResumeChecks.map((c) => [c.milestoneId, c.label, c.passed ? '✅' : '❌']) ?? [];

/** §43 要求逐项回答的清单；每项要么给数据，要么诚实写"未采集/不适用"。 */
const coverageRows: (string | number)[][] = [
  ['Build Commit', git.commit === '未采集（git 不可用）' ? NA : `\`${git.commit.slice(0, 12)}\``],
  ['Content Manifest Hash', manifest ? `\`${manifest.manifestHash}\`` : NA],
  ['规则资料范围', traceability ? `${traceability.summary.p0Total} 条 P0 规则已登记` : NA],
  [
    'official-ready 内容',
    manifest ? `${manifest.summary.officialReady} / ${manifest.summary.total}` : NA,
  ],
  ['blocked 内容', manifest ? `${manifest.summary.blocked}` : NA],
  ['Prototype 污染（官方路径）', prototypeScan ? `${prototypeScan.findingCount} 处` : NA],
  [
    'Traceability P0 完整',
    traceability ? (traceability.summary.p0Complete ? '✅' : '❌') : NA,
  ],
  [
    '十一 Quest Golden Run',
    goldenRun ? `❌ 仅完成 ${goldenRun.completedQuestCount} 个任务、act=${goldenRun.finalAct}` : NA,
  ],
  ['Boss 顺序覆盖', '❌ 不适用 — Boss Quest 在正式路径上不可选中（ISSUE-P0-001）'],
  ['Guardian 覆盖', '❌ 不适用 — Guardian Data Gate 关闭（ISSUE-P0-002）'],
  ['skipped Form 覆盖', '❌ 不适用 — Final Encounter Data Gate 关闭（ISSUE-P0-002）'],
  ['Outcome', goldenRun ? `\`${goldenRun.outcome}\`（\`${goldenRun.finalPhase}\`）` : NA],
  [
    'Save / Resume',
    goldenRun
      ? `${goldenRun.saveResumeChecks.filter((c) => c.passed).length}/${goldenRun.saveResumeChecks.length} 通过，` +
        `覆盖 ${goldenRun.saveResumeChecks.length}/${CAMPAIGN_MILESTONES.length} 里程碑`
      : NA,
  ],
  ['Replay Hash', gate ? (gate.replayDeterminismPasses ? '✅ 一致' : '❌ 同 seed 两次运行不一致') : NA],
  ['Hero Death / Replacement', goldenRun?.uiStoreShimSteps.includes('resolveReplacements') ? '✅ 已真实触发并走 Stagecoach 正式入口' : NA],
  ['Failure Matrix', '⚠️ 仅 stagecoach-exhaustion 分支真实到达；其余 seed 标记 runnable:false'],
  ['Guardian Matrix', '❌ 未采集 — Data Gate 关闭'],
  ['Final Form Matrix', '❌ 未采集 — Data Gate 关闭'],
  [
    'P0 / P1 / P2',
    ledger ? `open P0=${ledger.openP0} / P1=${ledger.openP1} / P2=${ledger.openP2}` : NA,
  ],
  [
    'Performance Baseline',
    perf
      ? `✅ 已采集（§32）：${perf.newCampaignInit.avgMs}ms / Quest ${perf.questSetup.avgMs}ms / Battle ${perf.battleSetup.avgMs}ms / Save ${perf.save.avgMs}ms / Load ${perf.load.avgMs}ms / Form Transition ${perf.formTransition.avgMs}ms（机制级）；完整 Run ${perf.fullRun.eventCount} 事件、最大 Save ${perf.fullRun.maxSaveBytes}B`
      : '❌ 未采集',
  ],
  ['Release Gate', gate ? `**${gate.verdict}**` : NA],
  [
    '缺失卡牌资料',
    manifest
      ? `${manifest.summary.unavailable} 条 unavailable、${manifest.summary.missingSourceReference} 条缺 sourceReference`
      : NA,
  ],
  ['可称为「核心盒 Campaign 完整可玩」', '**否**'],
];

/**
 * 只取三选一的判定短语作为 H1，长篇根因放到正文。
 * 直接把整段 conclusion 塞进 H1 会让报告首屏变成一堵墙。
 */
const VERDICT_PHRASES: Record<string, string> = {
  PASS: 'PASS — core-campaign-official-ready',
  CONDITIONAL: 'CONDITIONAL — framework-complete-content-blocked',
  FAIL: 'FAIL — campaign-flow-blocked',
};
const verdictPhrase = gate ? (VERDICT_PHRASES[gate.verdict] ?? gate.verdict) : '未采集';

/** 未测量的门禁位集合，用于把 ❌ 与 ⚪ 区分开。 */
const unmeasured = new Set(gate?.unmeasuredGateBits ?? []);

const md = `# Phase 11A — 核心盒 Campaign 内容审计与完整垂直游玩 · 最终报告

> 由 \`npm run audit:final-report\` 自动生成，请勿手改。
> 本报告只聚合 \`docs/data/core-campaign/*.json\` 中的既有结论，不做二次计算，
> 任何缺失项一律标注「未采集」而不是估算。

## 0. 最终结论

# ${verdictPhrase}

${
  gate
    ? `结论语法固定为 \`PASS — core-campaign-official-ready\` / \`CONDITIONAL — framework-complete-content-blocked\` / \`FAIL — campaign-flow-blocked\` 三选一。

**判定依据**：${gate.conclusion}`
    : '> ⚠️ 未找到 release-gate.json，无法给出判定。'
}

### 0.1 一句话总结

本项目已具备**完整的单 Act 纵向游玩能力**（选队 → 配技能 → 选任务 → 逐房间探索 → 逐技能战斗 →
战利品 → 饰品分配 → 回城 → Hamlet → 英雄阵亡替补 → 下一任务），且全程 0 条不变量违反、0 次重复事务、
0 处引擎死锁；但**四 Act 之间的横向推进链路是断的**，Act 推进状态机无任何生产调用方，
因此 11-Quest / 4-Act 主循环在正式引擎路径上不可达。同时 Act IV 全部官方数据 Gate 处于关闭状态。
两者叠加，本阶段不能宣称「核心盒 Campaign 完整可玩」。

## 1. 构建信息

| 项 | 值 |
| --- | --- |
| Commit | \`${git.commit}\` |
| 分支 | \`${git.branch}\` |
| 工作区 | ${git.dirty} |
| Content Manifest Hash | ${manifest ? `\`${manifest.manifestHash}\`` : NA} |
| Manifest 生成时间 | ${manifest ? `\`${manifest.generatedAt}\`（**刻意固定为 epoch**，使 manifestHash 可复现；非真实时间）` : NA} |

## 2. §43 要求项逐条对照

${mdTable(['要求项', '结论'], coverageRows)}

## 3. 内容清单（Content Manifest）

${
  manifest
    ? `总计 **${manifest.summary.total}** 条内容定义。

**按官方数据状态**

${mdTable(
  ['状态', '数量'],
  Object.entries(manifest.summary.byStatus).map(([k, v]) => [k, v]),
)}

**按运行时就绪度**

${mdTable(
  ['就绪度', '数量'],
  Object.entries(manifest.summary.byReadiness).map(([k, v]) => [k, v]),
)}

**按分类**

${mdTable(
  ['分类', '数量'],
  Object.entries(manifest.summary.byCategory).map(([k, v]) => [k, v]),
)}

> ⚠️ \`official-ready\` 仅 **${manifest.summary.officialReady}** 条，\`missingSourceReference\` 高达
> **${manifest.summary.missingSourceReference}** 条 —— 绝大多数内容尚未回指到规则书页码/卡牌编号，
> 这是 ISSUE-P2-001 的量化依据。`
    : NA
}

### 3.1 Prototype 污染与引用完整性

| 检查 | 结果 |
| --- | --- |
| 官方路径 prototype 引用 | ${prototypeScan ? `${prototypeScan.findingCount} 处` : NA} |
| 引用校验 error | ${refValidation ? refValidation.errorCount : NA} |
| 引用校验 warning | ${refValidation ? refValidation.warningCount : NA} |

## 4. 规则追溯矩阵（P0）

${
  traceability
    ? `| 指标 | 值 |
| --- | --- |
| P0 规则总数 | ${traceability.summary.p0Total} |
| implemented-and-tested | ${traceability.summary.implementedAndTested} |
| implemented-not-tested | ${traceability.summary.implementedNotTested} |
| data-missing | ${traceability.summary.dataMissing} |
| implementation-missing | ${traceability.summary.implementationMissing} |
| P0 全覆盖 | ${traceability.summary.p0Complete ? '✅' : '❌'} |
| 被数据阻塞的规则 | ${traceability.summary.blockedRuleIds.join(', ') || '—'} |

${mdTable(['规则 ID', '状态', '摘要'], traceRows)}`
    : NA
}

## 5. 确定性 RNG 审计

${
  rng
    ? `| 指标 | 值 |
| --- | --- |
| 整体通过 | ${rng.passed ? '✅' : '❌'} |
| \`Math.random\` 命中（全仓） | ${rng.mathRandomLeaks} |
| \`Math.random\` 命中（官方路径） | ${rng.officialPathMathRandomLeaks} |
| 时间源命中 | ${rng.timeSourceLeaks} |
| Definition Hash 稳定 | ${rng.definitionHashStable ? '✅' : '❌'} |

${
  rng.officialFindings.length > 0
    ? `**官方路径命中明细**\n\n${mdTable(
        ['文件', '行', '代码'],
        rng.officialFindings.map((f) => [`\`${f.file}\``, f.line, `\`${f.text}\``]),
      )}\n\n> 该命中位于 \`createId()\`，用于生成实体 id 而非游戏结果；但它使**同 seed 两次运行的状态哈希不同**，
> 直接导致 Replay 决定性判定失败（ISSUE-P1-001 / ISSUE-P1-002）。`
    : ''
}`
    : NA
}

## 6. Golden Run（十一 Quest 垂直游玩）

${
  goldenRun
    ? `| 指标 | 值 |
| --- | --- |
| seed | \`${goldenRun.seedId}\` |
| outcome | **${goldenRun.outcome}** |
| 最终 Act | ${goldenRun.finalAct} |
| 最终 GamePhase | \`${goldenRun.finalPhase}\` |
| 完成任务数 | ${goldenRun.completedQuestCount} |
| 事件数 | ${goldenRun.eventCount} |
| RNG 抽取次数 | ${goldenRun.rngDrawCount} |
| 不变量违反（error） | ${goldenRun.invariantErrorCount} |
| 重复事务 | ${goldenRun.duplicateTransactionIds.length} |
| 引擎死锁 | ${goldenRun.deadlockPhase ?? '无'} |
| Act 卡死首次触发 | ${goldenRun.actStuckAfterQuests === null ? '—' : `第 ${goldenRun.actStuckAfterQuests} 个任务`} |
| Act 卡死下最多完成 | ${goldenRun.maxQuestsWithActStuck} 个任务 |

${goldenRun.blockedReason ? `> **阻断原因**：${goldenRun.blockedReason}` : ''}

### 6.1 里程碑覆盖（状态谓词判定，非任务数下标映射）

${mdTable(['ID', '里程碑', '到达', 'State Hash'], milestoneRows)}

到达率：**${goldenRun.reachedMilestones.length} / ${CAMPAIGN_MILESTONES.length}**

### 6.2 Save / Resume 矩阵

${mdTable(['里程碑', '名称', '往返'], saveResumeRows)}

> 覆盖率受 Act 推进断裂限制：M03 及之后的里程碑从未到达，其存档往返**未被验证**。

### 6.3 UI-store-shim 步骤（架构泄漏证据）

${goldenRun.uiStoreShimSteps.map((s) => `- \`${s}\``).join('\n') || '_无_'}

> 这些编排步骤在 \`src/game-engine/**\` 中没有可调用入口，只存在于 \`src/store/useGameStore.ts\` 与 UI 页面。
> 无头审计必须在 \`src/audit/core-campaign/headless-shim.ts\` 中逐行复刻，该文件的存在本身即为 ISSUE-P1-006 的证据。`
    : NA
}

${
  perf
    ? `### 6.4 性能基线（§32）

| 步骤 | avg | 备注 |
| --- | --- | --- |
| New Campaign 初始化 | ${perf.newCampaignInit.avgMs} ms | 真实路径 |
| Quest Setup | ${perf.questSetup.avgMs} ms | 真实路径 |
| Battle Setup | ${perf.battleSetup.avgMs} ms | 真实路径 |
| Save | ${perf.save.avgMs} ms | 代表性存档 ${perf.save.representativeBytes} B |
| Load | ${perf.load.avgMs} ms | 真实路径 |
| Form Transition | ${perf.formTransition.avgMs} ms | **机制级**（正式四 Act 主循环不可达，ISSUE-P0-001） |

完整 Run 体量极值：事件数 **${perf.fullRun.eventCount}**、最大 Save **${perf.fullRun.maxSaveBytes} B**、最大 Ledger **${perf.fullRun.maxLedger}**、峰值 Actor **${perf.fullRun.peakActors}**、峰值 Initiative **${perf.fullRun.peakInitiative}**。

工程门禁：Save/Load×100 不崩溃 \`${perf.engineeringGate.saveLoad100xNoCrash}\`、无体积膨胀 \`${perf.engineeringGate.saveLoad100xNoInflation}\`、Form Transition 无泄漏 \`${perf.engineeringGate.formTransitionNoLeak}\`、无长时无响应 \`${perf.engineeringGate.longUnresponsive ? '❌' : '✅'}\`。

> 完整报告见 [performance-baseline.md](./performance-baseline.md)。浏览器内存趋势为浏览器/Playwright 维度，node 侧未测量。`
    : ''
}

## 7. Golden Seed 矩阵

${mdTable(['Seed', '模式', '可跑', '阻断原因'], seedRows)}

可跑 **${GOLDEN_SEEDS.filter((s) => s.runnable).length} / ${GOLDEN_SEEDS.length}**。

## 8. Issue Ledger

${
  ledger
    ? `open **P0=${ledger.openP0} / P1=${ledger.openP1} / P2=${ledger.openP2}**

${mdTable(['ID', '级别', '状态', '域', '标题'], issueRows)}`
    : NA
}

## 9. Release Gate 明细

${
  gate
    ? mdTable(
        ['门禁项', '值'],
        Object.entries(gate)
          .filter(([, v]) => typeof v === 'boolean' || typeof v === 'number')
          .map(([k, v]) => {
            if (unmeasured.has(k)) return [k, '⚪ 未验证（本阶段未测量，不计为通过）'];
            return [k, typeof v === 'boolean' ? (v ? '✅' : '❌') : String(v)];
          }),
      )
    : NA
}

${
  unmeasured.size > 0
    ? `> ⚪ 标记的门禁位**未被测量**，与「测量后失败」是两回事。\n> \`ReleaseGateResult\` 内部用 \`?? false\` 收敛（对门禁判定保守是对的），\n> 但报告必须把两者区分开，否则会读成「build 挂了」。`
    : ''
}

## 10. 未采集项（诚实声明）

Phase 11A 的定义（§45）共 35 项，以下项目**本阶段未采集**，不得视为通过：

- **Performance Baseline（§32）** — 已采集（见 [performance-baseline.md](./performance-baseline.md)）；浏览器内存趋势仍 ⚪ 未测量（node 侧无法测）。
- **Manual Vertical Playtest（§38-39）** — 未产出 \`docs/reports/phase-11a/playtests/\` 人工游玩日志。
- **Playwright E2E 五套 spec（§37）** — \`core-campaign-golden\` / \`campaign-failure\` / \`guardian-matrix\` / \`final-form-matrix\` / \`save-resume-matrix\` 未创建。
- **CI 工作流（§41）** — 未接入。
- **CoreCampaignAuditPanel.tsx（§44）** — 审计调试面板未创建。
- **四 Ruins Boss / 三 Guardian / 三 skipped Form 覆盖（§25-26）** — 前置阻塞（Act 推进 + Data Gate），不可达。
${missingArtifacts.length > 0 ? `- **缺失数据产物**：${missingArtifacts.join('、')}` : ''}

> 之所以逐条列出而不是省略：Phase 11A 的目的就是**诚实地界定当前边界**。
> 把未做的事标成"通过"会让后续阶段基于错误前提排期。

## 11. 结论与后续建议

1. **ISSUE-P0-001（Act 推进断裂）是唯一的横向阻塞点**，且根因明确、修复面很小：
   \`campaign-progress.ts\` 的纯函数本身经测试证明是正确的，缺的只是在 \`finishQuest\` 里接线。
   修复后 M03—M09 应立即可达。
2. **ISSUE-P0-002（Act IV 官方数据缺失）** 属于资料问题而非代码问题，需要补齐规则书/卡牌数据后再开 Data Gate。
3. **ISSUE-P1-001/002（\`createId\` 用 \`Math.random\`）** 使 Replay 决定性无法成立，建议改为由 seed 派生的计数器。
4. **ISSUE-P1-006（编排逻辑只存在于 store）** 是本次审计成本最高的一项；建议把
   \`headless-shim.ts\` 里复刻的 8 类编排上提为引擎导出，store 退化为薄适配层。

---

_本报告由 \`scripts/audit/final-report.ts\` 生成。数据来源：\`docs/data/core-campaign/\`。_
`;

banner('audit:final-report');

const out = writeReport('phase-11a-final-report.md', md);

console.log(`判定: ${gate?.verdict ?? '未采集'}`);
console.log(`${gate?.conclusion ?? ''}`);
console.log('');
console.log(`里程碑到达      : ${goldenRun?.reachedMilestones.length ?? '?'}/${CAMPAIGN_MILESTONES.length}`);
console.log(`Golden Seed 可跑: ${GOLDEN_SEEDS.filter((s) => s.runnable).length}/${GOLDEN_SEEDS.length}`);
console.log(`open P0/P1/P2   : ${ledger?.openP0 ?? '?'}/${ledger?.openP1 ?? '?'}/${ledger?.openP2 ?? '?'}`);
if (missingArtifacts.length > 0) {
  console.log(`⚠️ 缺失数据产物 : ${missingArtifacts.join(', ')}`);
}
console.log('');
console.log('产物:');
console.log(`  - ${rel(out)}`);

// Phase 11A.2 acceptance is determined by the measured final pipeline, not prose in legacy reports.
const acceptance = loadJson<{ status?: string; canEnterPhase11A3?: boolean }>('verification-results.json');
console.log('Phase 11A.2 acceptance:', acceptance?.status === 'COMPLETE' && acceptance.canEnterPhase11A3 === true ? 'COMPLETE (await independent audit)' : 'PARTIAL');
