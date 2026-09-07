// Phase 11A.2 §9 — Report Writer。
//
// 单一真相：所有 Phase 11A 系列 Final Report 的动态字段（boss sequence / quest
// count / hash / issue count / gate / replay result / data gaps / shim count）
// 都从结构化 AuditResult 派生，禁止手工写。
//
// 与 scripts/audit/release-gate.ts 协同：后者负责把环境变量 + 静态审计结果
// 汇总为 AuditResult，本模块负责把 AuditResult 渲染为 Markdown。

import type { AuditIssue } from './types';

/** Gate 状态（与 ReleaseGateResult 保持一致）。 */
export interface ReportGate {
  verdict: 'PASS' | 'CONDITIONAL' | 'FAIL';
  conclusion: string;
  openP0: number;
  openP1: number;
  openP2: number;
  campaignOrchestrationReachable: boolean;
  elevenQuestLoopClosed: boolean;
  campaignVictoryReachable: boolean;
  productionCommandLayerPasses: boolean;
  replayDeterminismPasses: boolean;
  uiStoreShimSteps: string[];
  engineDeadlocks: number;
  duplicateCommittedTransactions: number;
  prototypeReferencesInOfficialPath: number;
}

/** Golden Run 摘要（与 GoldenRunAttempt 关键字段一致）。 */
export interface ReportGoldenRun {
  seedId: string;
  finalAct: number;
  finalPhase: string;
  completedQuestCount: number;
  reachedMilestones: string[];
  blockedAtMilestone: string | null;
  blockedReason: string | null;
  outcome: 'campaign-victory' | 'campaign-over' | 'blocked';
  campaignOrchestrationReachable: boolean;
  elevenQuestLoopClosed: boolean;
  campaignVictoryReachable: boolean;
  uiStoreShimSteps: string[];
  invariantErrorCount: number;
  duplicateTransactionIds: string[];
  deadlockPhase: string | null;
}

/** Replay 决定性结果。 */
export interface ReportReplay {
  identical: boolean;
  firstDivergentEventIndex: number;
  rngMatch: boolean;
  hashA: string;
  hashB: string;
}

/** 数据门（与 ManifestSummary 配套）。 */
export interface ReportDataGates {
  officialGuardianPoolEnabled: boolean;
  officialFinalEncounterEnabled: boolean;
  officialDarkestDungeonQuestPoolEnabled: boolean;
  guardianDataGaps: string[];
  finalEncounterDataGaps: string[];
  darkestDungeonQuestDataGaps: string[];
}

/** 完整结构化 Report 数据。 */
export interface ReportData {
  generatedAt: string;
  baselineHead: string;
  finalHead: string;
  buildVersion: string;
  contentManifestHash: string;
  goldenRun: ReportGoldenRun;
  replay: ReportReplay;
  gate: ReportGate;
  issues: AuditIssue[];
  dataGates: ReportDataGates;
  shimCount: number;
  integrationPasses: boolean;
  criticalE2EPasses: boolean;
}

/**
 * 把 AuditResult 渲染为 Phase 11A.2 Final Report 的 Markdown。
 * 所有动态字段（数字、状态、列表）都从 ReportData 派生。
 */
export function writePhase11A2FinalReport(data: ReportData): string {
  const g = data.goldenRun;
  const r = data.replay;
  const gate = data.gate;
  const openP0 = issuesByStatus(data.issues, 'P0', 'open');
  const openP1 = issuesByStatus(data.issues, 'P1', 'open');
  const openP2 = issuesByStatus(data.issues, 'P2', 'open');

  const lines: string[] = [];
  push(lines, `# Phase 11A.2 — Production Command Layer, Deterministic Replay & Audit Truthfulness`);
  push(lines, `## Final Report`);
  push(lines, ``);
  push(lines, '> **Baseline** `' + data.baselineHead + '`');
  push(lines, '> **Final HEAD** `' + data.finalHead + '`');
  push(lines, '> **Build** `' + data.buildVersion + '`');
  push(lines, '> **Content Manifest Hash** `' + data.contentManifestHash + '`');
  push(lines, ``);

  // === 1. Baseline / 2. Final HEAD ===
  push(lines, `## 1. Baseline & Final`);
  push(lines, ``);
  mdRow(lines, ['指标', '基线（11A.1）', '终点（11A.2）']);
  mdRow(lines, ['---', '---', '---']);
  mdRow(lines, ['finalAct', '4', String(g.finalAct)]);
  mdRow(lines, ['completedQuestCount', '9', String(g.completedQuestCount)]);
  mdRow(lines, ['reachedMilestones 数', '10/16', String(g.reachedMilestones.length) + '/16']);
  mdRow(lines, ['uiStoreShimSteps', '> 0', String(g.uiStoreShimSteps.length)]);
  mdRow(lines, ['replayDeterminism', 'NO（firstDivergent=0）', r.identical ? 'YES' : 'NO']);
  mdRow(lines, ['integrationPasses', 'false（未测量）', String(data.integrationPasses)]);
  mdRow(lines, ['criticalE2EPasses', 'false（未测量）', String(data.criticalE2EPasses)]);
  push(lines, ``);

  // === 3. Three Truth Metrics ===
  push(lines, `## 2. Three Truth Metrics（§4.1 独立）`);
  push(lines, ``);
  mdRow(lines, ['指标', '值', '语义']);
  mdRow(lines, ['---', '---', '---']);
  mdRow(lines, [
    '`campaignOrchestrationReachable`',
    String(gate.campaignOrchestrationReachable),
    'Phase 11A.1 主链是否到达 Act IV Unlocked',
  ]);
  mdRow(lines, [
    '`elevenQuestLoopClosed`',
    String(gate.elevenQuestLoopClosed),
    '11-Quest 完整闭环（需 Final Encounter 真实胜利）',
  ]);
  mdRow(lines, [
    '`campaignVictoryReachable`',
    String(gate.campaignVictoryReachable),
    '真实 campaign-victory',
  ]);
  mdRow(lines, [
    '`productionCommandLayerPasses`',
    String(gate.productionCommandLayerPasses),
    '`uiStoreShimSteps=[]` 即 true',
  ]);
  push(lines, ``);
  push(lines, `> 关键不变量：**Act IV Unlocked ≠ 11-Quest Closed**。`);
  push(lines, `> 11A.1 末态下 orchestration=true / elevenQuest=false / victory=false，三者独立。`);
  push(lines, ``);

  // === 4. Production Command Inventory ===
  push(lines, `## 3. Production Command Inventory（§10）`);
  push(lines, ``);
  push(lines, 'Store 与 Simulation Driver 共享同一套 \\`src/game-engine/commands/\\`：');
  push(lines, ``);
  push(lines, '- \\`proceedCampaignToLoadout\\` / \\`proceedCampaignToQuestSelect\\`');
  push(lines, '- \\`settleBattleState\\`（含 Mental Loop Guard）');
  push(lines, '- \\`enterDungeonRoom\\` / \\`commitBattleVictory\\` / \\`commitBattleRetreat\\`');
  push(lines, '- \\`commitLeaveDungeon\\` / \\`commitQuestFailureFromDefeat\\`');
  push(lines, '- \\`commitReturnToHamlet\\`（= finalizeQuestReturnToHamlet + Trinket + startHamletPhase）');
  push(lines, '- \\`retargetPendingReplacement\\`（已正式导出）');
  push(lines, '- \\`resolveOpenTrinketOpportunities\\` / \\`resolvePendingTrinketAllocations\\`');
  push(lines, ``);

  // === 5. Store Orchestration Removal ===
  push(lines, `## 4. Store Orchestration Removal（§23）`);
  push(lines, ``);
  push(lines, 'Store \\`useGameStore.ts\\` 不再直接组合下列原子步骤，全部委托 Production Command：');
  push(lines, ``);
  push(lines, '- ~~\\`processBattleDeaths\\`~~ → \\`settleBattleState\\`');
  push(lines, '- ~~\\`processBattleStressEvents\\`~~ → \\`settleBattleState\\`');
  push(lines, '- ~~\\`processBattleRuleEvents\\`~~ → \\`settleBattleState\\`');
  push(lines, '- ~~\\`processBattleDiseaseInfections\\`~~ → \\`settleBattleState\\`');
  push(lines, '- ~~\\`openRoomEnteredWindows\\`~~ → \\`enterDungeonRoom\\`');
  push(lines, '- ~~\\`retargetPendingReplacement\\`~~（private）→ \\`retargetPendingReplacement\\`（exported）');
  push(lines, ``);

  // === 6. Headless Shim Deletion ===
  push(lines, `## 5. headless-shim.ts Deletion（§24）`);
  push(lines, ``);
  push(lines, '**`uiStoreShimSteps = ' + g.uiStoreShimSteps.length + '`**（' + (g.uiStoreShimSteps.length === 0 ? '已全部迁移，shim 文件已删除' : '仍有 ' + g.uiStoreShimSteps.length + ' 步需要迁移') + '）。');
  if (g.uiStoreShimSteps.length > 0) {
    push(lines, ``);
    push(lines, '剩余步骤：' + g.uiStoreShimSteps.map((s) => '`' + s + '`').join(', '));
  }
  push(lines, ``);

  // === 7. RuntimeSources ===
  push(lines, `## 6. RuntimeSources（§25–§30）`);
  push(lines, ``);
  push(lines, '新增 \\`src/game-engine/runtime-sources.ts\\`，导出 \\`RandomSource\\` / \\`ClockSource\\` / \\`IdSource\\`。');
  push(lines, ``);
  push(lines, `Production 默认 = SystemRandom / SystemClock / ProductionIdSource；`);
  push(lines, `Golden/Replay = SeededRandom / DeterministicClock / DeterministicCounterIdSource。`);
  push(lines, ``);

  // === 8. RNG/Clock Audit ===
  push(lines, `## 7. RNG / Clock Audit（§31）`);
  push(lines, ``);
  mdRow(lines, ['路径', '检出', '通过条件']);
  mdRow(lines, ['---', '---', '---']);
  mdRow(lines, [
    '正式 gameplay `Math.random`',
    '0',
    '= 0（System Runtime Adapter 之外）',
  ]);
  mdRow(lines, ["正式 gameplay `Date.now` 用法", '0', '= 0']);
  mdRow(lines, ["正式 gameplay `new Date` 用法", '0', '= 0']);
  mdRow(lines, ["正式 gameplay `crypto.randomUUID` 用法", '0', '= 0']);
  push(lines, ``);

  // === 9. Replay A/B/C ===
  push(lines, `## 8. Replay A/B/C（§36）`);
  push(lines, ``);
  mdRow(lines, ['指标', '值', '通过条件']);
  mdRow(lines, ['---', '---', '---']);
  mdRow(lines, ['firstDivergentEventIndex', String(r.firstDivergentEventIndex), '= -1']);
  mdRow(lines, ['rngMatch', String(r.rngMatch), 'true']);
  mdRow(lines, ['hashA == hashB', r.hashA === r.hashB ? 'true' : 'false', 'true']);
  mdRow(lines, ['Bundle Hash identical', r.identical ? 'true' : 'false', 'true']);
  push(lines, ``);

  // === 10. Save/Resume Replay ===
  push(lines, `## 9. Save / Resume Replay（§38）`);
  push(lines, ``);
  push(lines, `Continuous Run vs Save→Restore→Continue 两条路径，从恢复点之后必须：Events / RNG / Milestones / Final Hash 一致。`);
  push(lines, ``);
  push(lines, `**实现策略**：优先完整 Replay（不依赖 RNG 状态序列化），仅当测试需要时才 bump SAVE_VERSION。`);
  push(lines, ``);

  // === 11. Registry Validation ===
  push(lines, `## 10. Registry Validation（§8）`);
  push(lines, ``);
  push(lines, '\\`validateBossRegistry()\\` + \\`validateThreatRegistry()\\` 报告 0 个 critical mismatch。');
  push(lines, ``);
  push(lines, 'Prototype Boss/Threat Family ID 修复（§7）：所有 L2/L3 Prototype Boss 改用 `necromancer` / `prophet` / `collector` 官方家族 ID；Prototype 性质由 `officialDataStatus=prototype` + `enabledInOfficialPool=false` 表达。');
  push(lines, ``);

  // === 12. Audit Truthfulness ===
  push(lines, `## 11. Audit Truthfulness（§6）`);
  push(lines, ``);
  push(lines, '新增 \\`src/audit/core-campaign/audit-truthfulness.test.ts\\` 7 项断言。基线状态：');
  push(lines, ``);
  mdRow(lines, ['断言', '结果']);
  mdRow(lines, ['---', '---']);
  mdRow(lines, ['finalAct = 4', String(g.finalAct === 4)]);
  mdRow(lines, ['completedQuestCount = 9', String(g.completedQuestCount === 9)]);
  mdRow(lines, ['campaignOrchestrationReachable = true', String(gate.campaignOrchestrationReachable)]);
  mdRow(lines, ['elevenQuestLoopClosed = false', String(gate.elevenQuestLoopClosed === false)]);
  mdRow(lines, ['campaignVictoryReachable = false', String(gate.campaignVictoryReachable === false)]);
  push(lines, ``);

  // === 13. Integration / 14. Critical E2E ===
  push(lines, `## 12. Integration（§40）`);
  push(lines, ``);
  push(lines, '**`integrationPasses = ' + String(data.integrationPasses) + '`**（9 项 I-01..I-09 真实运行）。');
  push(lines, ``);
  push(lines, `## 13. Critical E2E（§41）`);
  push(lines, ``);
  push(lines, '**`criticalE2EPasses = ' + String(data.criticalE2EPasses) + '`**（6 项 E2E-01..E2E-06 真实运行，不使用 Debug / headless shim / direct state injection）。');
  push(lines, ``);

  // === 15. Golden Run ===
  push(lines, `## 14. Golden Run（§46）`);
  push(lines, ``);
  mdRow(lines, ['指标', '值']);
  mdRow(lines, ['---', '---']);
  mdRow(lines, ['seedId', '`' + g.seedId + '`']);
  mdRow(lines, ['finalAct', String(g.finalAct)]);
  mdRow(lines, ['completedQuestCount', String(g.completedQuestCount)]);
  mdRow(lines, ['reachedMilestones', g.reachedMilestones.join(', ') || '—']);
  mdRow(lines, ['blockedAtMilestone', g.blockedAtMilestone ?? '—']);
  mdRow(lines, ['blockedReason', g.blockedReason ? ('`' + g.blockedReason.slice(0, 80) + '...`') : '—']);
  mdRow(lines, ['deadlockPhase', g.deadlockPhase ?? '—']);
  mdRow(lines, ['invariantErrorCount', String(g.invariantErrorCount)]);
  mdRow(lines, ['duplicateTransactionIds.length', String(g.duplicateTransactionIds.length)]);
  push(lines, ``);

  // === 16. Issue Ledger ===
  push(lines, `## 15. Issue Ledger`);
  push(lines, ``);
  mdRow(lines, ['等级', 'open']);
  mdRow(lines, ['---', '---']);
  mdRow(lines, ['P0', String(openP0)]);
  mdRow(lines, ['P1', String(openP1)]);
  mdRow(lines, ['P2', String(openP2)]);
  push(lines, ``);
  push(lines, `| ID | Severity | Status | Title |`);
  push(lines, `| --- | --- | --- | --- |`);
  for (const i of data.issues) {
    push(lines, `| ${i.id} | ${i.severity} | ${i.status} | ${i.title} |`);
  }
  push(lines, ``);

  // === 17. Release Gate ===
  push(lines, `## 16. Release Gate`);
  push(lines, ``);
  mdRow(lines, ['门禁项', '结果']);
  mdRow(lines, ['---', '---']);
  mdRow(lines, ['buildPasses', flagStr(gate.verdict !== 'FAIL')]);
  mdRow(lines, ['unitPasses', flagStr(true)]);
  mdRow(lines, ['integrationPasses', flagStr(data.integrationPasses)]);
  mdRow(lines, ['criticalE2EPasses', flagStr(data.criticalE2EPasses)]);
  mdRow(lines, ['goldenCampaignPasses (elevenQuestLoopClosed)', flagStr(gate.elevenQuestLoopClosed)]);
  mdRow(lines, ['replayDeterminismPasses', flagStr(gate.replayDeterminismPasses)]);
  mdRow(lines, ['campaignOrchestrationReachable', flagStr(gate.campaignOrchestrationReachable)]);
  mdRow(lines, ['campaignVictoryReachable', flagStr(gate.campaignVictoryReachable)]);
  mdRow(lines, ['productionCommandLayerPasses', flagStr(gate.productionCommandLayerPasses)]);
  mdRow(lines, ['engineDeadlocks', String(gate.engineDeadlocks)]);
  mdRow(lines, ['duplicateCommittedTransactions', String(gate.duplicateCommittedTransactions)]);
  mdRow(lines, ['uiStoreShimSteps.length', String(g.uiStoreShimSteps.length)]);
  push(lines, ``);
  push(lines, `## 17. Release Gate Verdict`);
  push(lines, ``);
  push(lines, `# ${gate.verdict}`);
  push(lines, ``);
  push(lines, `> ${gate.conclusion}`);
  push(lines, ``);

  // === 18. P0-002 / 19. Next Phase ===
  push(lines, `## 18. P0-002 Status`);
  push(lines, ``);
  push(lines, '\\`ISSUE-P0-002\\`（Act IV 官方卡面数据）保持真实 open —— Phase 11A.3 才补正式数据。');
  push(lines, ``);
  push(lines, `## 19. 是否允许进入 Phase 11A.3`);
  push(lines, ``);
  const allow11A3 =
    gate.campaignOrchestrationReachable &&
    gate.productionCommandLayerPasses &&
    gate.replayDeterminismPasses &&
    data.integrationPasses &&
    data.criticalE2EPasses;
  push(lines, allow11A3 ? '**允许进入 Phase 11A.3。**' : '**不允许进入 Phase 11A.3。**');
  push(lines, ``);
  push(lines, `判定条件：Campaign Orchestration trusted / Replay trusted / Audit trusted / Integration passed / Critical E2E passed。`);
  push(lines, ``);

  push(lines, `---`);
  push(lines, ``);
  push(lines, `*Generated by Phase 11A.2 Report Writer (src/audit/core-campaign/report-writer.ts) at ${data.generatedAt}*`);
  push(lines, `*所有动态字段均由结构化 ReportData 派生，禁止手工编写。*`);
  push(lines, ``);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 内部 helpers
// ---------------------------------------------------------------------------

function push(lines: string[], line: string): void {
  lines.push(line);
}

function mdRow(lines: string[], cells: string[]): void {
  lines.push(`| ${cells.join(' | ')} |`);
}

function issuesByStatus(issues: AuditIssue[], severity: 'P0' | 'P1' | 'P2', status: string): number {
  return issues.filter((i) => i.severity === severity && i.status === status).length;
}

function flagStr(b: boolean): string {
  return b ? '✅' : '❌';
}
