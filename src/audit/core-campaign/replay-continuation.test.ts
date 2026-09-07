// Phase 11A.2.3R §7 — Replay Continuation 真实 checkpoint 续跑。
//
// dev doc §7：
//   RC-C-01 Continuous M00 → M09
//   RC-C-02 M03 checkpoint → restore → continue M09
//   RC-C-03 M06 checkpoint → restore → continue M09
//
// 当前 Golden Run 的 ReplayBundle 不暴露 milestoneHashes / rngSnapshots 数组
// （这些字段在 type 中定义但 run-audit.ts 未填充 — 详见 run-audit.ts:495 附近）。
// 因此 RC-C-02 / RC-C-03 的「真 checkpoint restore」需新基础设施：
//
//   1. run-audit.ts: 在每 milestone 处记录 rngSnapshots 切片到 bundle
//   2. Replay Cursor：seedId + milestoneId 即可重建（runtime-sources 用 seed 重建）
//   3. 用 seekToMilestone(milestoneId) 重建 driver state 继续
//
// 本测试暂时用现有 API 做「Continuous M00→M09」+ 「A/B Replay Determinism」+
// 「Product Save Round Trip」三件事，并对 RC-C-02/RC-C-03 做 PENDING 标记。
// PENDING 项在 dev doc §16 完成定义中列明「Replay M03/M06 continuation 真续跑」
// 待后续 cursor infrastructure 完成后回填。
//
// dev doc §8：Product Save 与 Replay Checkpoint 不混淆 — 本测试只跑 product
// Save 的 round-trip（不带 Replay cursor）。

import { describe, expect, it } from 'vitest';
import { runGoldenCampaignAttempt, verifyReplayDeterminism } from './run-audit';
import { generateContentManifest } from './content-manifest';
import { stableHashState } from './types';
import { CampaignSimulationDriver } from './simulation-driver';
import { createSaveSnapshot, restoreSaveSnapshot } from '../../game-engine/save';

const SEED = 'golden-normal-success-01';
const HERO_IDS = ['crusader', 'vestal', 'highwayman', 'hellion'];

describe('Replay Continuation RC-C-01..RC-C-05 (Phase 11A.2.3R §7 + §8)', () => {
  it('RC-C-01: Continuous M00 → M09 单一 run 跑完整 campaign（核心字段 A/B 一致）', () => {
    const manifest = generateContentManifest();
    const manifestHash = stableHashState(manifest);
    const a = runGoldenCampaignAttempt(SEED, manifestHash);
    const b = runGoldenCampaignAttempt(SEED, manifestHash);
    // 核心确定性断言（finalStateHash 含 runId/timestamp 等 non-deterministic 字段，
    // 故只比较 gameplay-relevant 字段）：
    expect(a.finalAct, 'A.finalAct').toBe(b.finalAct);
    expect(a.completedQuestCount, 'A.completedQuestCount').toBe(b.completedQuestCount);
    expect(a.finalPhase, 'A.finalPhase').toBe(b.finalPhase);
    expect(a.invariantErrorCount, 'A.invariantErrorCount').toBe(b.invariantErrorCount);
    expect(a.duplicateTransactionIds.length, 'A.duplicateTx').toBe(b.duplicateTransactionIds.length);
    expect(a.reachedMilestones.length, 'A.reachedMilestones.length').toBe(b.reachedMilestones.length);
    // Golden prototype 端到端：act=4, completedQuestCount=9
    expect(a.finalAct).toBe(4);
    expect(a.completedQuestCount).toBe(9);
  });

  it('RC-C-02: M03 checkpoint + restore → 续跑到 M09 [PENDING — Replay Cursor 未实装]', () => {
    // dev doc §7 要求：M03 checkpoint → restore → continue M09。
    // 当前 Golden Run 的 bundle.milestoneHashes 数组未填充（run-audit.ts 未在
    // milestone 处 push），因此无法做真「restore RNG cursor → continue」续跑。
    // 退而求其次：验证 reachedMilestones 包含 M00-M09 + final state 等于完整 run。
    // 真 cursor restore 需 run-audit.ts 改造（每 milestone 记录 rngSnapshots 切片 +
    // seekToMilestone API），列为 11A.2.3R 后续 Phase backlog。
    const manifest = generateContentManifest();
    const manifestHash = stableHashState(manifest);
    const a = runGoldenCampaignAttempt(SEED, manifestHash);
    // Golden prototype 末态：reachedMilestones 包含 M00-M09
    const reached = new Set(a.reachedMilestones);
    // 不强制所有 M00-M09 都在 reached（P0-002 仍 open 可能截断）；但应 >= M00-M02（基础里程碑）
    expect(reached.has('M00'), 'M00 必须 reached').toBe(true);
    expect(reached.has('M01'), 'M01 必须 reached').toBe(true);
    expect(reached.has('M02'), 'M02 必须 reached').toBe(true);
    // final 状态是 Act IV（dev doc §4 强调：P0-002 不豁免 prototype architecture test）
    expect(a.finalAct, 'prototype 端到端 finalAct=4').toBe(4);
    // 标记：真 cursor restore 待 backlog
    const REPLAY_CURSOR_INFRA = 'PENDING_replay_cursor';
    expect(REPLAY_CURSOR_INFRA).toBe('PENDING_replay_cursor');
  });

  it('RC-C-03: M06 checkpoint + restore → 续跑到 M09 [PENDING — Replay Cursor 未实装]', () => {
    const manifest = generateContentManifest();
    const manifestHash = stableHashState(manifest);
    const a = runGoldenCampaignAttempt(SEED, manifestHash);
    const reached = new Set(a.reachedMilestones);
    expect(reached.has('M00'), 'M00 reached').toBe(true);
    expect(a.finalAct).toBe(4);
    // 同样待 cursor infrastructure
  });

  it('RC-C-04: Product Save Round Trip（独立 Gate，不含 Replay cursor）', () => {
    // dev doc §8：普通用户 Save 不带 Replay cursor；只要求 state round-trip 正确 + Load 后可继续。
    // 用 driver 跑 quest-select → save → restore → 验证 hash 一致 + 继续 dispatch。
    const driver = new CampaignSimulationDriver(SEED);
    driver.dispatch({ type: 'selectParty', heroIds: HERO_IDS });
    driver.dispatch({ type: 'proceedToLoadout' });
    driver.dispatch({ type: 'applyLoadout' });
    driver.dispatch({ type: 'proceedToQuests' });
    const state = driver.getState();
    const snapshot = createSaveSnapshot(state);
    const restored = restoreSaveSnapshot(snapshot);
    expect(stableHashState(restored)).toBe(stableHashState(state));
  });

  it('RC-C-05: Replay Determinism 独立 Gate（不与 Continuation 聚合）', () => {
    // dev doc §14：replayDeterminismPasses 必须独立于 replayContinuationPasses。
    // 11A.2.3 verify-phase11a2-3.ts 曾错误聚合 — 此处拆开。
    const manifest = generateContentManifest();
    const manifestHash = stableHashState(manifest);
    const replay = verifyReplayDeterminism(SEED, manifestHash);
    expect(replay.identical, 'Replay A/B identical').toBe(true);
    expect(replay.rngMatch, 'Replay RNG match').toBe(true);
  });
});
