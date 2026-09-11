// Phase 10A §8：Darkest Dungeon 内容切换（Location Content Runtime）。
//
// 规则 7/15/16/19/20/21：
// - Monster Deck → 仅 Darkest Dungeon Monster，全部视为 Level III；
// - Room Deck / Room Tiles → Darkest Dungeon 专属；
// - Curio → Ruins Curio Deck；
// - Dungeon Trinket → Level III；
// - Quirk / Disease / Virtue / Affliction → 保持原 Deck。
//
// 硬约束对照：
// - §8 末尾 / 硬约束 7：**不修改静态 Registry、不永久删除 Ruins 内容**，
//   本模块只产出一份 Runtime 快照挂到 ActFourState 上；
// - 硬约束 7：Empty Token 只在本 Runtime 内被解释为 Excavation Site，
//   全局 Empty Room Definition 原样不动；
// - 硬约束 19：official 内容缺失时 formal 模式直接拒绝。

import type { CampaignState } from '../../../types';
import type { ActFourState, LocationContentRuntime } from '../../../types/act-four';
import { DARKEST_DUNGEON_LOCATION_ID } from '../../../types/act-four';
import {
  DARKEST_DUNGEON_CURIO_DECK_ID,
  DARKEST_DUNGEON_DUNGEON_LEVEL,
  DARKEST_DUNGEON_TRINKET_TIER,
  EXCAVATION_SITE_COUNT,
  PRESERVED_DECK_IDS,
  getDarkestDungeonContentSource,
  isDarkestDungeonOfficialContentEnabled,
} from '../../../data/darkest-dungeon/room-registry';
import { computeDarkestDungeonContentHash } from '../../../data/darkest-dungeon/darkest-dungeon-family';
import { nowIso } from '../../random';
import type { ActFourContentMode } from './draw-quest';
import {
  actFourTransactionIds,
  hasProcessedActFourTransaction,
  withProcessedActFourTransaction,
} from './act-four-state';
import { blockCommunityOperation, type CommunityRuntimeBlocker } from '../../../data/darkest-dungeon/community-reference/runtime-profile';

export interface ActivateContentSetOptions {
  mode?: ActFourContentMode;
  now?: string;
}

export interface ActivateContentSetResult {
  ok: boolean;
  campaign: CampaignState;
  runtime: LocationContentRuntime | null;
  alreadyActivated: boolean;
  reason: string | null;
}

/**
 * 切换到 Darkest Dungeon 内容集合。
 *
 * 幂等键：`darkest-dungeon-content-activate:{campaignId}`。
 * 已切换过时原样返回既有 Runtime —— contentHash 一旦落盘就不再变，
 * 保证进行中的 Quest 始终读到同一份内容快照（§23）。
 */
export function activateDarkestDungeonContentSet(
  campaign: CampaignState,
  options?: ActivateContentSetOptions,
): ActivateContentSetResult {
  const state: ActFourState = campaign.actFourState;
  const transactionId = actFourTransactionIds.contentActivate(campaign.id);
  const mode: ActFourContentMode = options?.mode ?? 'prototype';

  if (state.contentRuntime || hasProcessedActFourTransaction(state, transactionId)) {
    return {
      ok: state.contentRuntime !== null,
      campaign,
      runtime: state.contentRuntime,
      alreadyActivated: true,
      reason: state.contentRuntime ? null : '事务已处理但缺少 Content Runtime（存档损坏）',
    };
  }

  if (!state.unlocked) {
    return { ok: false, campaign, runtime: null, alreadyActivated: false, reason: 'Act IV 未解锁' };
  }

  if (mode === 'formal' && !isDarkestDungeonOfficialContentEnabled()) {
    return {
      ok: false,
      campaign,
      runtime: null,
      alreadyActivated: false,
      reason: 'official Darkest Dungeon 内容缺失（Monster / Room Card / Room Tile），正式流程已禁用',
    };
  }

  const source = getDarkestDungeonContentSource(mode);
  if (source.monsterDefinitionIds.length === 0) {
    return {
      ok: false,
      campaign,
      runtime: null,
      alreadyActivated: false,
      reason: 'Monster Deck 为空，无法切换内容',
    };
  }

  const now = options?.now ?? nowIso();
  const runtime: LocationContentRuntime = {
    locationId: DARKEST_DUNGEON_LOCATION_ID,
    runtimeProfileId: mode,

    monsterDefinitionIds: [...source.monsterDefinitionIds],
    roomCardDefinitionIds: [...source.roomCardDefinitionIds],
    roomTileDefinitionIds: [...source.roomTileDefinitionIds],

    curioDeckId: DARKEST_DUNGEON_CURIO_DECK_ID,
    trinketTier: DARKEST_DUNGEON_TRINKET_TIER,
    dungeonLevel: DARKEST_DUNGEON_DUNGEON_LEVEL,

    allMonstersLevelThree: true,
    // 规则 20：这四个牌堆保持原样，此处只是记录「我没动它们」。
    preservedDeckIds: [...PRESERVED_DECK_IDS],

    emptyTokenInterpretation: 'excavation-site',
    excavationSiteCount: EXCAVATION_SITE_COUNT,

    contentHash: computeDarkestDungeonContentHash(mode),

    transactionId,
    activatedAt: now,
  };

  const next = withProcessedActFourTransaction({ ...state, contentRuntime: runtime }, transactionId);

  return {
    ok: true,
    campaign: { ...campaign, actFourState: next, updatedAt: now },
    runtime,
    alreadyActivated: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// 只读 Selector（UI / 引擎共用同一份结论，避免各自判断 Location）
// ---------------------------------------------------------------------------

/** 当前是否处于 Darkest Dungeon 内容集合下。 */
export function isDarkestDungeonContentActive(state: ActFourState): boolean {
  return state.contentRuntime !== null;
}

/** 当前 Monster 池（未激活时返回空数组，调用方回落到既有 Location 逻辑）。 */
export function getActiveMonsterPool(state: ActFourState): string[] {
  return state.contentRuntime?.monsterDefinitionIds ?? [];
}

export interface DrawDarkestDungeonMonsterResult {
  ok: boolean;
  campaign: CampaignState;
  monsterDefinitionId: string | null;
  reason: string | null;
  kind?: 'community-source-blocked';
  blocker?: CommunityRuntimeBlocker;
}

/** Normal-room production draw seam. Community composition is known, ordering is not. */
export function drawDarkestDungeonMonster(
  campaign: CampaignState,
  rng: () => number,
): DrawDarkestDungeonMonsterResult {
  const runtime = campaign.actFourState.contentRuntime;
  if (!runtime) return { ok: false, campaign, monsterDefinitionId: null, reason: 'Darkest Dungeon content is not active' };
  if (runtime.runtimeProfileId === 'community-reference') {
    const blocked = blockCommunityOperation('MONSTER_DECK_DRAW_POLICY_UNRESOLVED');
    return { campaign, monsterDefinitionId: null, reason: blocked.blocker.code, ...blocked };
  }
  const pool = runtime.monsterDefinitionIds;
  if (pool.length === 0) return { ok: false, campaign, monsterDefinitionId: null, reason: 'Monster Deck 为空' };
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return { ok: true, campaign, monsterDefinitionId: pool[index], reason: null };
}

/** 规则 7：Darkest Dungeon 内所有 Monster 的等级恒为 III。 */
export function resolveMonsterLevel(state: ActFourState, fallbackLevel: 1 | 2 | 3): 1 | 2 | 3 {
  return state.contentRuntime?.allMonstersLevelThree ? 3 : fallbackLevel;
}

/** 规则 16：Dungeon Trinket 抽取层级。 */
export function resolveTrinketTier(state: ActFourState, fallbackTier: 1 | 2 | 3): 1 | 2 | 3 {
  return state.contentRuntime ? state.contentRuntime.trinketTier : fallbackTier;
}

/** 规则 19：Curio 牌堆 ID。 */
export function resolveCurioDeckId(state: ActFourState, fallbackDeckId: string): string {
  return state.contentRuntime?.curioDeckId ?? fallbackDeckId;
}

/**
 * 硬约束 7：Empty Token 的解释。
 * 只有在 Darkest Dungeon Runtime 激活时才解释为 excavation-site，
 * 其余 Location 一律保持 'empty'。
 */
export function interpretEmptyToken(state: ActFourState): 'empty' | 'excavation-site' {
  return state.contentRuntime?.emptyTokenInterpretation ?? 'empty';
}

/** 规则 20：该牌堆是否被 Darkest Dungeon 保留（不切换）。 */
export function isPreservedDeck(state: ActFourState, deckId: string): boolean {
  return state.contentRuntime?.preservedDeckIds.includes(deckId) ?? false;
}
