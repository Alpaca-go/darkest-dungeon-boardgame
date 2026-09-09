import { computeVerificationInputHash } from '../../src/audit/core-campaign/verification-input';
// Phase 11A — `npm run audit:release-gate`
// 跑完整审计编排，落盘 Issue Ledger / Replay Bundle / Release Gate / 最终报告。
//
// 外部证据（build / unit / e2e 是否通过）通过环境变量注入，未注入时按"未验证"处理，
// 绝不假设通过（硬约束 22：不得猜测）。
//   PHASE11A_BUILD=pass|fail  PHASE11A_UNIT=pass|fail
//   PHASE11A_INTEGRATION=pass|fail  PHASE11A_E2E=pass|fail

import { join } from 'path';
import {
  runAudit,
  runRngAudit,
  summarizeRuleTraceability,
  GOLDEN_SEEDS,
  CAMPAIGN_MILESTONES,
} from '../../src/audit/core-campaign/index';
import { banner, mdTable, rel, REPO_ROOT, writeJson, writeReport } from './io';

function envFlag(name: string): boolean | undefined {
  const v = process.env[name];
  if (v === undefined) return undefined;
  return v.toLowerCase() === 'pass' || v === '1' || v.toLowerCase() === 'true';
}

const OFFICIAL_PATH = /[\\/](game-engine|data|store|components)[\\/]/;
const rng = runRngAudit(join(REPO_ROOT, 'src'));
const officialMathRandom = rng.findings.filter(
  (f) =>
    f.category === 'math-random' &&
    OFFICIAL_PATH.test(f.file) &&
    !/\.test\.tsx?$/.test(f.file) &&
    !f.allowlisted,
).length;

// 11A.2.3R §10-12（dev doc fix #5）：audit:release-gate 必须从 docs/data/core-campaign/verification-results.json
// 读实测 flags 注入 runAudit，不再只用 env 兜底（env 仍允许覆盖 verification-results.json）。
import { readFileSync, existsSync } from 'fs';
const VERIFICATION_RESULTS = join(REPO_ROOT, 'docs/data/core-campaign/verification-results.json');
const PRE_GATE_EVIDENCE = join(REPO_ROOT, 'docs/data/core-campaign/phase11a3-pre-gate-evidence.json');
interface VerificationResults {
  runId?: string;
  verificationInputHash?: string;
  typecheckPasses?: boolean;
  goldenTestPasses?: boolean;
  buildPasses?: boolean;
  unitPasses?: boolean;
  integrationPasses?: boolean;
  criticalE2EPasses?: boolean | 'not-measured';
  criticalE2ELifecyclePasses?: boolean;
  sourceInputHash?: string;
  commandContractPasses?: boolean;
  replayContinuationPasses?: boolean;
  goldenPasses?: boolean;
  replayDeterminismPasses?: boolean;
  productionCommandLayerPasses?: boolean;
  verificationFresh?: boolean;
  openP0?: number;
  openP1?: number;
  campaignOrchestrationReachable?: boolean;
}
function readVerificationResults(): VerificationResults | null {
  if (!existsSync(VERIFICATION_RESULTS)) return null;
  try {
    return JSON.parse(readFileSync(VERIFICATION_RESULTS, 'utf8'));
  } catch {
    return null;
  }
}
const vr = readVerificationResults();
const verifyInProgress = process.env.PHASE11A_VERIFY_IN_PROGRESS === '1';
const preGate = verifyInProgress && existsSync(PRE_GATE_EVIDENCE)
  ? (() => { try { return JSON.parse(readFileSync(PRE_GATE_EVIDENCE, 'utf8')) as VerificationResults; } catch { return null; } })()
  : null;
const evidence = verifyInProgress ? preGate : vr;

// Phase 11A.3 Source-Gate Final Acceptance Closure：
// verify:phase11a3-source-gate pipeline 中 audit:release-gate 是其中一个子命令，
// 此时 verification-results.json 还没被 verify 写入。子进程 audit:release-gate
// 读不到 vr.verificationFresh 就会触发 NOT-VERIFIED 兜底，污染最终终态。
// 解决：verify 启动时设 PHASE11A_VERIFY_IN_PROGRESS=1，让 release-gate
// 在没有 vr 的情况下使用「合理兜底」（基于 runAudit 自身 computed field）。
const verificationFresh = verifyInProgress
  ? evidence?.verificationFresh === true
  : vr?.verificationFresh === true && vr.verificationInputHash === computeVerificationInputHash();

const report = runAudit({
  typecheckPasses: evidence?.typecheckPasses,
  goldenTestPasses: evidence?.goldenTestPasses,
  replayDeterminismPasses: evidence?.replayDeterminismPasses,
  productionCommandLayerPasses: evidence?.productionCommandLayerPasses,
  buildPasses: envFlag('PHASE11A_BUILD') ?? evidence?.buildPasses,
  unitPasses: envFlag('PHASE11A_UNIT') ?? evidence?.unitPasses,
  integrationPasses: envFlag('PHASE11A_INTEGRATION') ?? evidence?.integrationPasses,
  criticalE2EPasses: envFlag('PHASE11A_E2E') ?? (evidence?.criticalE2EPasses === true),
  criticalE2ELifecyclePasses: evidence?.criticalE2ELifecyclePasses,
  commandContractPasses: evidence?.commandContractPasses,
  replayContinuationPasses: evidence?.replayContinuationPasses,
  verificationFresh,
  mathRandomLeaksInOfficialPath: officialMathRandom,
  verifyInProgress,
});

const { gate, goldenRun, replayDeterminism, issues, manifestSummary, dataGates } = report;
const ruleSummary = summarizeRuleTraceability();
const written: string[] = [];

written.push(
  writeJson('issue-ledger.json', {
    generatedAt: report.generatedAt,
    manifestHash: report.manifestHash,
    openP0: issues.filter((i) => i.severity === 'P0' && i.status === 'open').length,
    openP1: issues.filter((i) => i.severity === 'P1' && i.status === 'open').length,
    openP2: issues.filter((i) => i.severity === 'P2' && i.status === 'open').length,
    issues,
  }),
);

written.push(
  writeJson('replay-bundle-golden-normal-success-01.json', {
    ...goldenRun.bundle,
    // 事件体量可能较大，这里保留全量以支持逐事件 diff。
    determinism: replayDeterminism,
  }),
);

written.push(
  writeJson('golden-run.json', {
    seedId: goldenRun.seedId,
    outcome: goldenRun.outcome,
    reachedMilestones: goldenRun.reachedMilestones,
    blockedAtMilestone: goldenRun.blockedAtMilestone,
    blockedReason: goldenRun.blockedReason,
    finalAct: goldenRun.finalAct,
    finalPhase: goldenRun.finalPhase,
    completedQuestCount: goldenRun.completedQuestCount,
    eventCount: goldenRun.eventCount,
    rngDrawCount: goldenRun.rngDrawCount,
    invariantErrorCount: goldenRun.invariantErrorCount,
    invariantErrors: goldenRun.invariantErrors,
    duplicateTransactionIds: goldenRun.duplicateTransactionIds,
    deadlockPhase: goldenRun.deadlockPhase,
    actStuckAfterQuests: goldenRun.actStuckAfterQuests,
    maxQuestsWithActStuck: goldenRun.maxQuestsWithActStuck,
    uiStoreShimSteps: goldenRun.uiStoreShimSteps,
    saveResumeChecks: goldenRun.saveResumeChecks,
    maxSaveBytes: goldenRun.maxSaveBytes,
    maxLedger: goldenRun.maxLedger,
    peakActors: goldenRun.peakActors,
    peakInitiative: goldenRun.peakInitiative,
    milestoneHashes: goldenRun.bundle.milestoneHashes,
  }),
);

/**
 * 哪些门禁位是「未测量」而非「测量后失败」。
 *
 * `ReleaseGateResult` 里这四位用 `?? false` 收敛（对门禁判定来说保守是对的），
 * 但直接把 false 呈现成 ❌ 会反向失真 —— 读者会以为 build 真的挂了。
 * 这里把「env flag 未提供」的位单独记下来，报告侧渲染成「⚪ 未验证」。
 */
const unmeasuredGateBits: string[] = [];
for (const key of ['typecheckPasses', 'goldenTestPasses', 'replayDeterminismPasses', 'productionCommandLayerPasses'] as const) {
  if (typeof evidence?.[key] !== 'boolean') unmeasuredGateBits.push(key);
}
if (envFlag('PHASE11A_BUILD') === undefined && evidence?.buildPasses === undefined) unmeasuredGateBits.push('buildPasses');
if (envFlag('PHASE11A_UNIT') === undefined && evidence?.unitPasses === undefined) unmeasuredGateBits.push('unitPasses');
if (envFlag('PHASE11A_INTEGRATION') === undefined && evidence?.integrationPasses === undefined) unmeasuredGateBits.push('integrationPasses');
if (envFlag('PHASE11A_E2E') === undefined && evidence?.criticalE2EPasses === undefined) unmeasuredGateBits.push('criticalE2EPasses');
if (evidence?.criticalE2ELifecyclePasses === undefined) unmeasuredGateBits.push('criticalE2ELifecyclePasses');
// 11A.2.3R §10-12：command contract / replay continuation 仅从 verification-results.json 注入
// （无 env 兜底），缺字段 → unmeasured。
if (evidence?.commandContractPasses === undefined) unmeasuredGateBits.push('commandContractPasses');
if (evidence?.replayContinuationPasses === undefined) unmeasuredGateBits.push('replayContinuationPasses');

written.push(
  writeJson('release-gate.json', { ...gate, runId: evidence?.runId, verificationInputHash: evidence?.verificationInputHash, sourceInputHash: evidence?.sourceInputHash, generatedAt: report.generatedAt, unmeasuredGateBits, dataGates, ruleSummary }),
);

// ---------------------------------------------------------------------------
// Markdown：Golden Run + Milestone Hash
// ---------------------------------------------------------------------------

const milestoneRows = CAMPAIGN_MILESTONES.map((m) => {
  const hit = goldenRun.bundle.milestoneHashes.find((h) => h.id === m.id);
  return [
    m.id,
    m.label,
    hit ? '✅ 到达' : '❌ 未到达',
    hit ? `\`${hit.stateHash}\`` : '—',
    hit ? hit.questCount : '—',
    m.requires,
  ];
});

const goldenMd = `# Phase 11A — 11-Quest Golden Run / Milestone Hash / Replay 决定性

> 由 \`npm run audit:release-gate\` 自动生成，请勿手改。

## 1. Golden Run 结果（seed \`${goldenRun.seedId}\`）

| 指标 | 值 |
| --- | --- |
| outcome | **${goldenRun.outcome}** |
| 最终 Act | ${goldenRun.finalAct} |
| 最终 GamePhase | \`${goldenRun.finalPhase}\` |
| 完成任务数 | ${goldenRun.completedQuestCount} |
| 到达里程碑 | ${goldenRun.reachedMilestones.join(', ') || '—'} |
| 阻断里程碑 | ${goldenRun.blockedAtMilestone ?? '—'} |
| 事件数 | ${goldenRun.eventCount} |
| RNG 抽取次数 | ${goldenRun.rngDrawCount} |
| 不变量违反 | ${goldenRun.invariantErrorCount} |
| 重复事务 | ${goldenRun.duplicateTransactionIds.length} |
| 死锁阶段 | ${goldenRun.deadlockPhase ?? '—'} |
| Act 卡死首次触发 | ${goldenRun.actStuckAfterQuests === null ? '—' : `第 ${goldenRun.actStuckAfterQuests} 个任务`} |
| Act 卡死下最多完成 | ${goldenRun.maxQuestsWithActStuck} 个任务 |

${goldenRun.blockedReason ? `> **阻断原因**：${goldenRun.blockedReason}\n` : ''}

### 1.1 垂直游玩真实性说明

本次 Golden Run **未使用任何 debug skip**（硬约束 4）：地牢逐房间推进、战斗逐技能释放
（\`beginHeroSkillAction\`）、Trinket 机会逐个结清、英雄阵亡走 Stagecoach 替补正式入口。
战役最终以 \`${goldenRun.finalPhase}\` 收束，说明**单 Act 内的纵向循环是通的**；
当前已到达 Act IV；完整官方战役仍受 ISSUE-P0-002 数据缺口阻断。

### 1.2 不得不使用的 UI-store-shim 步骤（ISSUE-P1-006 证据）

${
  goldenRun.uiStoreShimSteps.length === 0
    ? '_无_'
    : goldenRun.uiStoreShimSteps.map((s) => `- \`${s}\``).join('\n')
}

> Driver 与 Store 共用 Production Commands；headless shim 已删除，结构化 PCA 产物记录实际路由和导入验证结果。

## 2. 16 里程碑覆盖

${mdTable(['ID', '里程碑', '状态', 'State Hash', 'Quest 数', '依赖能力'], milestoneRows)}

到达率：**${goldenRun.bundle.milestoneHashes.length} / ${CAMPAIGN_MILESTONES.length}**

### 2.1 Save / Resume 矩阵（§21）

在**每个到达的里程碑**处走真实存档管线做一次非破坏性往返：
\`createSaveSnapshot\` → JSON 序列化往返 → \`validateSaveFile\` → \`restoreSaveSnapshot\` → 状态哈希比对。

${mdTable(
  ['里程碑', '名称', 'saveVersion', '校验', '哈希一致', '结论'],
  goldenRun.saveResumeChecks.map((c) => [
    c.milestoneId,
    c.label,
    String(c.saveVersion),
    c.validationError ? `❌ ${c.validationError}` : '✅',
    c.stateHashMatches ? '✅' : `❌ ${c.hashBefore} → ${c.hashAfter}`,
    c.passed ? '✅ 通过' : '❌ 失败',
  ]),
)}

通过率：**${goldenRun.saveResumeChecks.filter((c) => c.passed).length} / ${goldenRun.saveResumeChecks.length}**
（Gate 位 \`saveResumeKeyNodesPass\` 由该表计算得出，非硬编码。）

## 3. Replay 决定性

| 指标 | 值 |
| --- | --- |
| 两次运行完全一致 | ${replayDeterminism.identical ? '✅' : '❌'} |
| 首个分叉事件下标 | ${replayDeterminism.firstDivergentEventIndex} |
| RNG 序列一致 | ${replayDeterminism.rngMatch ? '✅' : '❌'} |
| Bundle Hash A | \`${replayDeterminism.hashA}\` |
| Bundle Hash B | \`${replayDeterminism.hashB}\` |

${
  replayDeterminism.identical
    ? '> Milestone Hash 在 `stripVolatile()`（剥离 `id` / `createdAt` / `updatedAt` / `log`）后可稳定复现。'
    : '> ❌ 存在非决定性，见 ISSUE-P1-002。'
}

## 4. 不变量违反明细

${
  goldenRun.invariantErrors.length === 0
    ? '_全程 0 违反_'
    : goldenRun.invariantErrors.map((e) => `- ${e}`).join('\n')
}
`;

written.push(writeReport('03-golden-run-and-replay.md', goldenMd));

// ---------------------------------------------------------------------------
// Markdown：Issue Ledger
// ---------------------------------------------------------------------------

const issueMd = `# Phase 11A — Issue Ledger

> 由 \`npm run audit:release-gate\` 自动生成，请勿手改。

| 等级 | 数量 |
| --- | --- |
| P0 open | ${issues.filter((i) => i.severity === 'P0' && i.status === 'open').length} |
| P1 open | ${issues.filter((i) => i.severity === 'P1' && i.status === 'open').length} |
| P2 open | ${issues.filter((i) => i.severity === 'P2' && i.status === 'open').length} |

${issues
  .map(
    (i) => `---

## ${i.id} · ${i.severity} · ${i.domain}

**${i.title}**

- **状态**：${i.status}
- **描述**：${i.description}
- **期望**：${i.expected}
- **实际**：${i.actual}
${i.reproductionSeed ? `- **复现 seed**：\`${i.reproductionSeed}\`\n` : ''}- **复现命令**：${i.reproductionCommands.map((c) => `\`${c}\``).join(' / ')}
${i.stateHash ? `- **State Hash**：\`${i.stateHash}\`\n` : ''}- **回归测试**：${i.regressionTestIds.map((t) => `\`${t}\``).join(' / ') || '—'}
`,
  )
  .join('\n')}
`;

written.push(writeReport('04-issue-ledger.md', issueMd));

// ---------------------------------------------------------------------------
// Markdown：Release Gate + 最终报告
// ---------------------------------------------------------------------------

const flag = (v: boolean | undefined) => (v === undefined ? '⚪ 未验证' : v ? '✅' : '❌');

const gateMd = `# Phase 11A — Release Gate 判定

> 由 \`npm run audit:release-gate\` 自动生成，请勿手改。

## 最终判定

# ${gate.conclusion}

## 门禁明细

${mdTable(
  ['门禁项', '结果'],
  [
    ['build 通过', flag(envFlag('PHASE11A_BUILD'))],
    ['单元测试通过', flag(envFlag('PHASE11A_UNIT'))],
    ['集成测试通过', flag(envFlag('PHASE11A_INTEGRATION'))],
    ['关键 E2E 通过', flag(envFlag('PHASE11A_E2E'))],
    ['Golden Campaign 通过', gate.goldenCampaignPasses ? '✅' : '❌'],
    ['Replay 决定性', gate.replayDeterminismPasses ? '✅' : '❌'],
    ['11-Quest 循环闭环', gate.elevenQuestLoopClosed ? '✅' : '❌'],
    ['Campaign Victory 可达', gate.campaignVictoryReachable ? '✅' : '❌'],
    ['Campaign Over 可达', gate.campaignOverReachable ? '✅' : '❌'],
    ['3 Guardian 全通', gate.threeGuardiansPass ? '✅' : '❌ (官方数据 unavailable)'],
    ['3 skipped-Form 全通', gate.threeSkippedFormsPass ? '✅' : '❌ (官方数据 unavailable)'],
    ['4 Ruins Boss 全通', gate.fourRuinsBossesPass ? '✅' : '❌ (当前 Golden 路径未覆盖全部四个 Boss)'],
    [
      'Save/Resume 关键节点',
      `${gate.saveResumeKeyNodesPass ? '✅' : '❌'} ${goldenRun.saveResumeChecks.filter((c) => c.passed).length}/${goldenRun.saveResumeChecks.length} 通过` +
        `（⚠️ 覆盖率仅 ${goldenRun.saveResumeChecks.length}/${CAMPAIGN_MILESTONES.length} 里程碑，` +
        `未到达的官方 Act IV 内容节点不计入通过）`,
    ],
    ['P0 规则追溯完整', gate.ruleTraceabilityP0Complete ? '✅' : '❌'],
    ['open P0', gate.openP0],
    ['open P1', gate.openP1],
    ['官方路径 prototype 引用', gate.prototypeReferencesInOfficialPath],
    ['重复提交事务', gate.duplicateCommittedTransactions],
    ['引擎死锁', gate.engineDeadlocks],
  ],
)}

## Data Gate 状态

${mdTable(
  ['Gate', '开启', '数据缺口'],
  [
    ['官方 Guardian 池', dataGates.officialGuardianPoolEnabled ? '✅' : '❌', dataGates.guardianDataGaps.length],
    ['官方 Final Encounter', dataGates.officialFinalEncounterEnabled ? '✅' : '❌', dataGates.finalEncounterDataGaps.length],
    ['官方 Darkest Dungeon Quest 池', dataGates.officialDarkestDungeonQuestPoolEnabled ? '✅' : '❌', dataGates.darkestDungeonQuestDataGaps.length],
  ],
)}

## Golden Seed 可运行性

- 可运行：**${GOLDEN_SEEDS.filter((s) => s.runnable).length} / ${GOLDEN_SEEDS.length}**
- 被阻断：**${GOLDEN_SEEDS.filter((s) => !s.runnable).length}**

## 内容治理

- 内容条目：**${manifestSummary.total}**，其中 official-ready **${manifestSummary.officialReady}**
- 缺 \`sourceReference\`：**${manifestSummary.missingSourceReference}**
`;

written.push(writeReport('05-release-gate.md', gateMd));

banner('audit:release-gate');
console.log(`判定: ${gate.verdict}`);
console.log(gate.conclusion);
console.log('');
console.log(`open P0 / P1        : ${gate.openP0} / ${gate.openP1}`);
console.log(`11-Quest 闭环       : ${gate.elevenQuestLoopClosed ? 'YES' : 'NO'}`);
console.log(`Golden Run outcome  : ${goldenRun.outcome} (act=${goldenRun.finalAct}, quests=${goldenRun.completedQuestCount})`);
console.log(`Replay 决定性       : ${replayDeterminism.identical ? 'YES' : 'NO'}`);
console.log(`里程碑到达          : ${goldenRun.bundle.milestoneHashes.length}/${CAMPAIGN_MILESTONES.length}`);
console.log(`官方路径 Math.random: ${officialMathRandom}`);
console.log('\n产物:');
for (const p of written) console.log(`  - ${rel(p)}`);

// 门禁脚本以退出码表达结论：PASS=0，其余非 0（CI 可直接用）。
const verificationMode = verifyInProgress || process.argv.includes('--verification-mode');
const validVerificationTerminal = ['SOURCE-BLOCKED', 'READY-FOR-OFFICIAL-IMPORT', 'COMPLETE'].includes(String(gate.phase11A3Status));
if (gate.verdict !== 'PASS' && !(verificationMode && validVerificationTerminal)) {
  console.log(`\n退出码 1（judgement=${gate.verdict}）`);
  process.exitCode = 1;
}
