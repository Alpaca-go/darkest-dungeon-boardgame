// Phase 10A §7：Darkest Dungeon Quest 抽取（3 选 1）。
//
// 规则 10：Darkest Dungeon 有 3 张 Quest Card，抽 1 张。
// 规则 11：该 Quest 有 16 Rooms、3 XP，并取消前三个 Final Form 中的一个。
//
// 硬约束对照：
// - 硬约束 4：随机结果先写状态再展示 —— 本函数返回的 CampaignState 已含抽取记录，
//   调用方必须先 commit 再渲染，刷新不重抽；
// - 硬约束 22：不猜 Quest → Skipped Form 映射 —— Skipped Form **只能**从 Quest 定义里读，
//   绝不二次随机（这是文档「不要将 Guardian 与 Skipped Form 分开二次随机」的落点）；
// - 硬约束 13：Heart of Darkness 永不可跳过，抽到非法数据直接判失败而不是兜底改写；
// - 硬约束 19：数据缺失时 official 池禁用，只能用 prototype harness。

import type { CampaignState } from '../../../types';
import type {
  ActFourRuntimeProfileId,
  ActFourState,
  DarkestDungeonQuestDefinition,
  DarkestDungeonQuestDrawRecord,
} from '../../../types/act-four';
import type { SkippableFinalFormId } from '../../../types/final-encounter';
import {
  getDarkestDungeonQuestPool,
  isDarkestDungeonOfficialQuestPoolEnabled,
  validateDarkestDungeonQuest,
} from '../../../data/darkest-dungeon/quest-registry';
import { getDarkestDungeonGuardianById } from '../../../data/darkest-dungeon/guardian-registry';
import { getFinalFormDisplayName } from '../../../data/darkest-dungeon/final-form-registry';
import { nowIso } from '../../random';
import { pushLog } from '../../log';
import {
  actFourTransactionIds,
  canDrawDarkestDungeonQuest,
  hasProcessedActFourTransaction,
  withActFourStage,
  withProcessedActFourTransaction,
} from './act-four-state';
import { pickIndex, rngStateId } from './rng';
import { rollCommunityQuestProvisions } from './community-engine-capabilities';
import type { ProvisionPool } from '../../../types';

export type ActFourContentMode = ActFourRuntimeProfileId;

export interface DrawDarkestDungeonQuestOptions {
  rng: () => number;
  /** 'formal' 仅在 official 数据齐备时可用，否则直接失败（硬约束 19）。 */
  mode?: ActFourContentMode;
  seedLabel?: string;
  now?: string;
  chooseWildProvision?: (heroId: string, dieIndex: 0 | 1) => keyof ProvisionPool;
}

export interface DrawDarkestDungeonQuestResult {
  ok: boolean;
  campaign: CampaignState;
  record: DarkestDungeonQuestDrawRecord | null;
  quest: DarkestDungeonQuestDefinition | null;
  /** 幂等命中：已抽过，返回既有结果。 */
  alreadyDrawn: boolean;
  reason: string | null;
}

/**
 * 抽取 Darkest Dungeon Quest。
 *
 * 幂等键：`darkest-dungeon-quest-draw:{campaignId}`。
 * 已抽过时**原样返回既有记录**，绝不重掷（刷新 / 重放事务安全）。
 */
export function drawDarkestDungeonQuest(
  campaign: CampaignState,
  options: DrawDarkestDungeonQuestOptions,
): DrawDarkestDungeonQuestResult {
  const state: ActFourState = campaign.actFourState;
  const transactionId = actFourTransactionIds.questDraw(campaign.id);
  const mode: ActFourContentMode = options.mode ?? 'prototype';

  // ---- 幂等 ----
  if (state.questDrawRecord || hasProcessedActFourTransaction(state, transactionId)) {
    const existing = state.questDrawRecord;
    return {
      ok: existing !== null,
      campaign,
      record: existing,
      quest: existing
        ? findQuest(existing.selectedQuestId, existing.runtimeProfileId ?? mode)
        : null,
      alreadyDrawn: true,
      reason: existing ? null : '事务已处理但缺少抽取记录（存档损坏）',
    };
  }

  if (!canDrawDarkestDungeonQuest(state)) {
    return fail(campaign, `当前 Stage（${state.stage}）不允许抽取 Darkest Dungeon Quest`);
  }

  // ---- Data Gate（硬约束 19）----
  if (mode === 'formal' && !isDarkestDungeonOfficialQuestPoolEnabled()) {
    return fail(campaign, 'official Darkest Dungeon Quest 数据缺失，正式流程已禁用');
  }

  const pool = getDarkestDungeonQuestPool(mode);
  if (pool.length !== 3) {
    return fail(campaign, `Quest 池必须恰好 3 张，当前 ${pool.length} 张`);
  }

  const index = pickIndex(options.rng, pool.length);
  const selected = pool[index];
  if (!selected) return fail(campaign, 'Quest 抽取失败：候选池为空');

  const validation = validateDarkestDungeonQuest(selected);
  if (!validation.isComplete) {
    return fail(
      campaign,
      `Quest ${selected.id} 数据不完整：${[...validation.missing, ...validation.issues].join('；')}`,
    );
  }

  // 硬约束 22：Guardian 与 Skipped Form 都直接读卡面，不做第二次随机。
  const skipped = selected.skippedFinalFormId;
  if (skipped === null) {
    return fail(campaign, `Quest ${selected.id} 未定义 Skipped Final Form（禁止推测）`);
  }
  if ((skipped as string) === 'heart-of-darkness') {
    return fail(campaign, 'Heart of Darkness 不可被取消（硬约束 13）');
  }

  const provisionResult = mode === 'community-reference'
    ? rollCommunityQuestProvisions(
        campaign.provisions,
        selected.provisionPolicyId,
        campaign.heroes.filter((hero) => hero.isAlive && !hero.dead).map((hero) => hero.instanceId),
        options.rng,
        options.chooseWildProvision,
      )
    : null;
  if (provisionResult && !provisionResult.ok) return fail(campaign, provisionResult.reason);

  const now = options.now ?? nowIso();
  const record: DarkestDungeonQuestDrawRecord = {
    runtimeProfileId: mode,
    transactionId,
    candidateQuestIds: pool.map((q) => q.id),
    selectedQuestId: selected.id,
    guardianDefinitionId: selected.guardianDefinitionId,
    skippedFinalFormId: skipped as SkippableFinalFormId,
    discardedQuestIds: pool.filter((q) => q.id !== selected.id).map((q) => q.id),
    provisionRoll: provisionResult?.record,
    rngStateId: rngStateId(options.seedLabel ?? `dd-quest-draw:${campaign.id}`, index),
    drawnAt: now,
  };

  let next: ActFourState = {
    ...state,
    selectedQuestId: selected.id,
    guardianDefinitionId: selected.guardianDefinitionId,
    // §15：skipped Form 必须一路保存到 Final Encounter，中途不得丢失、不得重掷。
    skippedFinalFormId: skipped,
    questDrawRecord: record,
  };
  next = withProcessedActFourTransaction(next, transactionId);
  // 抽完 Quest 立刻进入地牢准备（Content 切换 / Layout 抽取都发生在这个 Stage 内）。
  next = withActFourStage(next, 'guardian-dungeon-active', `${transactionId}:stage`);

  const guardian = getDarkestDungeonGuardianById(selected.guardianDefinitionId);
  let nextCampaign: CampaignState = {
    ...campaign,
    provisions: provisionResult?.provisions ?? campaign.provisions,
    actFourState: next,
    updatedAt: now,
  };
  nextCampaign = pushLog(
    nextCampaign,
    `抽取 Darkest Dungeon Quest：${selected.name}（16 Rooms / 3 XP）。`,
    'info',
  );
  nextCampaign = pushLog(
    nextCampaign,
    `Guardian：${guardian ? guardian.name : selected.guardianDefinitionId}。`,
    'info',
  );
  nextCampaign = pushLog(
    nextCampaign,
    `Final Form 被取消：${getFinalFormDisplayName(skipped as SkippableFinalFormId)}。`,
    'info',
  );
  return {
    ok: true,
    campaign: nextCampaign,
    record,
    quest: selected,
    alreadyDrawn: false,
    reason: null,
  };
}

/** 读取本 Campaign 已保存的 Skipped Form（Final Encounter 直接消费，不重掷）。 */
export function getSavedSkippedFinalFormId(state: ActFourState): SkippableFinalFormId | null {
  const id = state.skippedFinalFormId;
  if (id === null || id === 'heart-of-darkness') return null;
  return id;
}

/** 读取本 Campaign 已保存的 Guardian 定义 ID。 */
export function getSavedGuardianDefinitionId(state: ActFourState): string | null {
  return state.guardianDefinitionId;
}

/** 另外两张 Quest 本 Campaign 不再使用（§7）。 */
export function isQuestDiscardedThisCampaign(state: ActFourState, questId: string): boolean {
  return state.questDrawRecord?.discardedQuestIds.includes(questId) ?? false;
}

// ---------------------------------------------------------------------------

function findQuest(questId: string, mode: ActFourContentMode): DarkestDungeonQuestDefinition | null {
  return getDarkestDungeonQuestPool(mode).find((q) => q.id === questId) ?? null;
}

function fail(campaign: CampaignState, reason: string): DrawDarkestDungeonQuestResult {
  return { ok: false, campaign, record: null, quest: null, alreadyDrawn: false, reason };
}
