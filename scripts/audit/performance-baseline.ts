// Phase 11A — §32 性能基线报告生成器。
//
// 调用 src/audit/core-campaign/performance-baseline.ts 的 measurePerformanceBaseline()
// （纯计算、真实路径），把结果落盘为：
//   - docs/data/core-campaign/performance-baseline.json   （final-report 聚合用）
//   - docs/reports/phase-11a/performance-baseline.md     （可交付报告）

import { banner, DATA_DIR, mdTable, REPORT_DIR, rel, writeArtifact, writeJson } from './io';
import { measurePerformanceBaseline, type BenchResult } from '../../src/audit/core-campaign/performance-baseline';

function benchRow(name: string, b: BenchResult, extra: string[] = []): string[] {
  return [name, `${b.iters}`, `${b.avgMs} ms`, `${b.minMs} ms`, `${b.maxMs} ms`, `${b.p95Ms} ms`, ...extra];
}

function main(): void {
  banner('audit:performance-baseline');
  const r = measurePerformanceBaseline();

  // ---- JSON 数据产物 ----
  writeJson('performance-baseline.json', r);

  // ---- Markdown 报告 ----
  const timingRows = [
    benchRow('New Campaign 初始化', r.newCampaignInit),
    benchRow('Quest Setup', r.questSetup),
    benchRow('Battle Setup', r.battleSetup),
    benchRow('Save', r.save, [`${r.save.representativeBytes} B`]),
    benchRow('Load', r.load),
    benchRow('Form Transition', r.formTransition, [r.formTransition.mechanismLevel ? '机制级' : '—']),
  ];

  const fullRunRows: (string | number)[][] = [
    ['完整 Run 事件数', r.fullRun.eventCount],
    ['最大 Save 大小 (B)', r.fullRun.maxSaveBytes],
    ['最大 Ledger（待处理事务）', r.fullRun.maxLedger],
    ['峰值 Actor（英雄+怪物）', r.fullRun.peakActors],
    ['峰值 Initiative（先攻序长度）', r.fullRun.peakInitiative],
  ];

  const gate = r.engineeringGate;
  const gatePass = (v: boolean | 'unmeasured') => (v === 'unmeasured' ? '⚪ 未测量（node 侧无法测）' : v ? '✅' : '❌');
  const gateRows: (string | number)[][] = [
    ['Save/Load ×100 不崩溃', gatePass(gate.saveLoad100xNoCrash)],
    ['Save/Load ×100 无体积膨胀', gatePass(gate.saveLoad100xNoInflation)],
    ['Form Transition 无事务泄漏', gatePass(gate.formTransitionNoLeak)],
    ['无长时无响应命令（步骤 < 预算）', gatePass(!gate.longUnresponsive)],
    ['重复监听器膨胀（浏览器维度）', gatePass(gate.duplicateListenerBlowup)],
    [
      '步骤预算 (ms)',
      Object.entries(gate.stepBudgetsMs)
        .map(([k, v]) => `${k}=${v}`)
        .join(', '),
    ],
  ];

  const md = `# Phase 11A — §32 性能基线

> 由 \`npm run audit:performance-baseline\` 自动生成，请勿手改。
> 本基线走**真实引擎路径**（CampaignSimulationDriver / 正式 Act IV 装配链），非估算。
> \`measuredAt\` 刻意固定为 epoch 以保持产物可复现（非真实时间）。

## 0. 环境

| 项 | 值 |
| --- | --- |
| Node | \`${r.environment.node}\` |
| 平台 | \`${r.environment.platform}\` |
| measuredAt | \`${r.measuredAt}\` |

## 1. 步骤耗时（§32 要求项）

${mdTable(['步骤', '次数', 'avg', 'min', 'max', 'p95', '备注'], timingRows)}

> **Form Transition 为机制级测量**：正式四 Act 主循环在 Act I 断裂（ISSUE-P0-001），
> 无法通过自然游玩到达 Final Encounter；此处复用 Phase 10E 调试面板同款正式引擎入口把战役推到
> Final Encounter 后再对 \`transitionToNextFinalForm\` 计时。${r.formTransition.reachabilityNote ? `\n> ${r.formTransition.reachabilityNote}` : ''}

## 2. 完整 Run 体量极值

${mdTable(['指标', '值'], fullRunRows)}

> ${r.fullRun.note}

## 3. 工程门禁（§32 收尾要求）

${mdTable(['门禁项', '结果'], gateRows)}

- **不重复监听器膨胀**：浏览器/React 维度，node 侧无法测量，标记 ⚪。
- **无指数级 Save 膨胀**：以 Save/Load ×100 前后快照体积对比验证。
- **Form Transition 无泄漏**：完整 defeat+transition 链走完后，\`processedTransactionIds\` 不重复且受 Form 数上界约束。
- **无长时无响应命令**：各步骤单次 avg 耗时均须低于预算（见步骤预算行）。

## 4. 备注

${r.notes.length > 0 ? r.notes.map((n) => `- ${n}`).join('\n') : '_无_'}

---

_本报告由 \`scripts/audit/performance-baseline.ts\` 生成。数据来源：\`docs/data/core-campaign/performance-baseline.json\`。_
`;

  const outMd = writeArtifact(`${REPORT_DIR}/performance-baseline.md`, md);
  void DATA_DIR;

  banner('audit:performance-baseline 完成');
  console.log(`New Campaign init : ${r.newCampaignInit.avgMs} ms`);
  console.log(`Quest Setup       : ${r.questSetup.avgMs} ms`);
  console.log(`Battle Setup      : ${r.battleSetup.avgMs} ms`);
  console.log(`Save / Load       : ${r.save.avgMs} / ${r.load.avgMs} ms`);
  console.log(`Form Transition   : ${r.formTransition.avgMs} ms (机制级)`);
  console.log(`完整 Run 事件数    : ${r.fullRun.eventCount}`);
  console.log(`最大 Save 大小     : ${r.fullRun.maxSaveBytes} B`);
  console.log(`工程门禁           : ${gate.longUnresponsive ? '❌ 存在超预算步骤' : '✅ 步骤均在预算内'}`);
  console.log('');
  console.log('产物:');
  console.log(`  - ${rel(`${DATA_DIR}/performance-baseline.json`)}`);
  console.log(`  - ${rel(outMd)}`);
}

main();
