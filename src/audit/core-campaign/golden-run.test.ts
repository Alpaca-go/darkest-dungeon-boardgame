// Phase 11A — Golden Run 回归测试。
//
// ⚠️ 定位说明：本文件里的多数断言是 **characterization test（现状固化测试）**，
// 用来锁住审计当天观测到的真实行为，而不是宣称这些行为是对的。
// 每条已知缺陷的断言都标注了对应的 ISSUE 编号；一旦缺陷被修复，这些测试会**故意变红**，
// 强制修复者同步更新 Issue Ledger（docs/reports/phase-11a/04-issue-ledger.md），
// 避免"修好了但台账还写着 open"这种账实不符。

import { beforeAll, describe, expect, it } from 'vitest';
import { generateContentManifest } from './content-manifest';
import { runGoldenCampaignAttempt, verifyReplayDeterminism, type GoldenRunAttempt } from './run-audit';
import { stableHashState } from './types';
import { GOLDEN_SEEDS, runnableGoldenSeeds, blockedGoldenSeeds } from './golden-seeds';

const SEED = 'golden-normal-success-01';

let attempt: GoldenRunAttempt;
let manifestHash: string;

beforeAll(() => {
  manifestHash = stableHashState(generateContentManifest());
  attempt = runGoldenCampaignAttempt(SEED, manifestHash);
}, 120_000);

describe('golden-run', () => {
  it('vertical-slice-runs: 单 Act 内的纵向循环可在正式引擎路径上真实跑通', () => {
    // 这条是"能力证明"而非缺陷固化：不使用任何 debug skip，
    // 走完 选队 → 配技能 → 选任务 → 逐房间探索 → 逐技能战斗 → 结算 → 饰品分配 → Hamlet → 下一任务。
    expect(attempt.completedQuestCount).toBeGreaterThanOrEqual(3);
    expect(attempt.eventCount).toBeGreaterThan(50);
    expect(attempt.rngDrawCount).toBeGreaterThan(0);
    // Act I 内的三个里程碑由**状态谓词**证实（M01/M02 要求 act===1 且任务数达标）。
    expect(attempt.reachedMilestones).toContain('M00');
    expect(attempt.reachedMilestones).toContain('M01');
    expect(attempt.reachedMilestones).toContain('M02');
  });

  it('milestone-verification-is-state-based: 里程碑不得由任务数下标硬映射推出', () => {
    // 回归保护：早期实现用 CAMPAIGN_MILESTONES[completedQuestCount] 硬映射，
    // 导致「完成第 3 个 Standard Quest」被误记为「M03 Boss Quest 胜利 → 进入 Act II」，
    // 报告同时出现「M03 ✅ 到达」与「finalAct = 1 / 阻断于 M03」的自相矛盾。
    // 现在每个里程碑都有 verify(state) 谓词，M03 要求 act >= 2。
    expect(attempt.finalAct).toBe(1);
    for (const mid of ['M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10']) {
      expect(
        attempt.reachedMilestones,
        `${mid} 依赖 Act 推进，act 恒为 1 时不应被标记为已到达`,
      ).not.toContain(mid);
    }
    // 已到达里程碑数必须与阻断结论一致：只有 Act I 的 M00~M02。
    expect(attempt.reachedMilestones.sort()).toEqual(['M00', 'M01', 'M02']);
  });

  it('save-resume: 每个到达的里程碑都能走真实存档管线无损往返（§21）', () => {
    expect(attempt.saveResumeChecks.length).toBeGreaterThan(0);
    for (const c of attempt.saveResumeChecks) {
      expect(c.validationError, `${c.milestoneId} validateSaveFile 应通过`).toBeNull();
      expect(c.stateHashMatches, `${c.milestoneId} 还原后状态哈希应一致`).toBe(true);
    }
    // 诚实标注：覆盖率受 Act 推进断裂限制，M03+ 未被验证。
    expect(attempt.saveResumeChecks.length).toBe(attempt.reachedMilestones.length);
  });

  it('no-deadlock: 全程不出现"非终局阶段无可用命令"的引擎死锁', () => {
    expect(attempt.deadlockPhase).toBeNull();
  });

  it('no-duplicate-transactions: 同一事务 id 不重复提交', () => {
    expect(attempt.duplicateTransactionIds).toEqual([]);
  });

  it('invariants-clean: Golden Run 全程 0 条 error 级不变量违反', () => {
    expect(attempt.invariantErrors).toEqual([]);
    expect(attempt.invariantErrorCount).toBe(0);
  });

  it('campaign-over-reachable: 战役失败终局可达（替补耗尽 → campaign-over）', () => {
    expect(attempt.finalPhase).toBe('campaign-over');
    expect(attempt.outcome).toBe('campaign-over');
  });

  // -------------------------------------------------------------------------
  // 已知缺陷固化
  // -------------------------------------------------------------------------

  it('11-quest-loop [KNOWN DEFECT ISSUE-P0-001]: Act 永不推进，11-Quest 闭环不可达', () => {
    // 期望行为（修复后）：完成 2 个 Standard Quest 后可选 Boss Quest，击败后 act → 2。
    // 当前行为：无论完成多少任务，act 恒为 1。
    expect(attempt.finalAct).toBe(1);
    expect(attempt.actStuckAfterQuests).not.toBeNull();
    expect(attempt.maxQuestsWithActStuck).toBeGreaterThanOrEqual(3);
    expect(attempt.blockedAtMilestone).toBe('M03');
    expect(attempt.blockedReason).toContain('CAMPAIGN_FLOW_BLOCKED');
    expect(attempt.outcome).not.toBe('campaign-victory');
  });

  it('replay-determinism [KNOWN DEFECT ISSUE-P1-002]: 同 seed 两次运行不完全一致', () => {
    const det = verifyReplayDeterminism(SEED, manifestHash);
    // 期望行为（修复 createId 的 Math.random/Date.now 之后）：identical === true。
    expect(det.identical).toBe(false);
    expect(det.firstDivergentEventIndex).toBeGreaterThanOrEqual(0);
  }, 120_000);
});

describe('golden-seeds', () => {
  it('seed 清单区分可运行与被内容缺口阻断的种子', () => {
    expect(GOLDEN_SEEDS.length).toBeGreaterThan(0);
    expect(runnableGoldenSeeds().length + blockedGoldenSeeds().length).toBe(GOLDEN_SEEDS.length);
    // 被阻断的 seed 必须写明原因，不允许静默跳过。
    for (const s of blockedGoldenSeeds()) {
      expect(s.blockedReason ?? '').not.toBe('');
    }
  });
});
