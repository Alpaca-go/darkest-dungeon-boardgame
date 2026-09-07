// Phase 11A.2 §6 — Audit Truthfulness 固定测试。
//
// 禁止未来再次把"Act IV 可达"解释成"11 Quest 已闭环"。
//
// 基线断言（来自 Phase 11A.1 末态）：
//   finalAct = 4
//   completedQuestCount = 9
//   darkestDungeonUnlocked = true
//
// 三个真相字段必须各自独立：
//   campaignOrchestrationReachable = true
//   elevenQuestLoopClosed          = false  ← 关键：Act IV Unlocked ≠ 11 Quest Loop Closed
//   campaignVictoryReachable        = false

import { describe, expect, it } from 'vitest';
import { beforeAll } from 'vitest';
import { generateContentManifest } from './content-manifest';
import { runGoldenCampaignAttempt, type GoldenRunAttempt } from './run-audit';
import { stableHashState } from './types';

const SEED = 'golden-normal-success-01';
let attempt: GoldenRunAttempt;

beforeAll(() => {
  const manifestHash = stableHashState(generateContentManifest());
  attempt = runGoldenCampaignAttempt(SEED, manifestHash);
}, 120_000);

describe('Audit Truthfulness (Phase 11A.2 §6)', () => {
  it('基线快照：finalAct = 4 / completedQuestCount = 9 / darkestDungeonUnlocked = true', () => {
    expect(attempt.finalAct).toBe(4);
    expect(attempt.completedQuestCount).toBe(9);
    // Act IV Unlocked 状态由 Campaign Orchestrator（Phase 11A.1）写入；
    // 这里从 state.campaignProgress.darkestDungeonUnlocked 读取（同源）。
    // GoldenRunAttempt 自身只暴露 finalAct / completedQuestCount，因此这里通过
    // reachedMilestones 间接断言（应当包含 M09 / M10...）。
    expect(attempt.reachedMilestones).toContain('M09');
  });

  it('campaignOrchestrationReachable = true（Phase 11A.1 主链修复）', () => {
    expect(attempt.campaignOrchestrationReachable).toBe(true);
  });

  it('elevenQuestLoopClosed = false（Act IV Unlocked ≠ 11 Quest 已闭环）', () => {
    expect(attempt.elevenQuestLoopClosed).toBe(false);
  });

  it('campaignVictoryReachable = false（Final Encounter 未走完）', () => {
    expect(attempt.campaignVictoryReachable).toBe(false);
  });

  it('三个真相字段彼此独立，互不隐含', () => {
    // orchestration=true 不应该蕴含 elevenQuest=true
    expect(attempt.campaignOrchestrationReachable).toBe(true);
    expect(attempt.elevenQuestLoopClosed).toBe(false);
    // elevenQuest=false 不应该蕴含 victory=false（理论上 elevenQuest 可能 = victory）
    expect(attempt.elevenQuestLoopClosed).toBe(false);
    expect(attempt.campaignVictoryReachable).toBe(false);
  });

  it('outcome ≠ campaign-victory（硬约束）', () => {
    expect(attempt.outcome).not.toBe('campaign-victory');
  });

  it('finalAct=4 / outcome=blocked 共存是 Phase 11A.2 的合法末态', () => {
    // 防止后续 refactor 误把"Act IV 走到 quest-select 停下"修复成"模拟器卡死"。
    expect(attempt.finalAct).toBe(4);
    expect(attempt.deadlockPhase).toBeNull();
    expect(attempt.invariantErrorCount).toBe(0);
  });
});
