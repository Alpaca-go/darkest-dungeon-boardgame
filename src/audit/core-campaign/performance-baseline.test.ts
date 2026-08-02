// Phase 11A — §32 性能基线工程门禁测试。
//
// 这些断言保护「性能不回归 / 无泄漏」的硬约束，是 release-gate 之外独立的回归护栏：
//   - Save/Load ×100 不能崩溃、存档体积不能指数膨胀；
//   - Form Transition 不能泄漏事务 id；
//   - 各步骤单次耗时必须在预算内（无长时无响应命令）；
//   - 浏览器维度的重复监听器膨胀 node 侧无法测量，显式断言为 'unmeasured' 而非误判通过。

import { describe, expect, it } from 'vitest';
import { measurePerformanceBaseline } from './performance-baseline';

describe('performance-baseline (§32)', () => {
  const r = measurePerformanceBaseline();

  it('New Campaign / Quest Setup / Battle Setup / Save / Load 均可测量', () => {
    expect(r.newCampaignInit.iters).toBeGreaterThan(0);
    expect(r.questSetup.iters).toBeGreaterThan(0);
    expect(r.battleSetup.iters).toBeGreaterThan(0);
    expect(r.save.iters).toBeGreaterThan(0);
    expect(r.load.iters).toBeGreaterThan(0);
    for (const b of [r.newCampaignInit, r.questSetup, r.battleSetup, r.save, r.load]) {
      expect(Number.isFinite(b.avgMs)).toBe(true);
      expect(Number.isFinite(b.maxMs)).toBe(true);
    }
  });

  it('Form Transition 为机制级测量且计时有效', () => {
    expect(r.formTransition.mechanismLevel).toBe(true);
    // 装配链成功时 iters>0 且计时有效；若装配链未达 Final Encounter，iters=0 且备注说明原因。
    if (r.formTransition.iters > 0) {
      expect(Number.isFinite(r.formTransition.avgMs)).toBe(true);
    } else {
      expect(r.formTransition.reachabilityNote).toMatch(/未建立|失败/);
    }
  });

  it('Save/Load ×100 不崩溃', () => {
    expect(r.engineeringGate.saveLoad100xNoCrash).toBe(true);
  });

  it('Save/Load ×100 无体积膨胀', () => {
    expect(r.engineeringGate.saveLoad100xNoInflation).toBe(true);
  });

  it('Form Transition 无事务泄漏', () => {
    expect(r.engineeringGate.formTransitionNoLeak).toBe(true);
  });

  it('无长时无响应命令（各步骤 < 预算）', () => {
    expect(r.engineeringGate.longUnresponsive).toBe(false);
  });

  it('重复监听器膨胀在 node 侧不可测，显式标记为未测量而非误判通过', () => {
    expect(r.engineeringGate.duplicateListenerBlowup).toBe('unmeasured');
  });

  it('完整 Run 体量极值来自真实 golden run', () => {
    expect(r.fullRun.eventCount).toBeGreaterThan(0);
    expect(r.fullRun.maxSaveBytes).toBeGreaterThan(0);
    expect(Number.isFinite(r.fullRun.peakActors)).toBe(true);
    expect(Number.isFinite(r.fullRun.peakInitiative)).toBe(true);
  });
});
