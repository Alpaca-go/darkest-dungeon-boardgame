// Phase 10A §9 / §10 / §11：Darkest Dungeon 16 Room 地图生成。
//
// 三个步骤，各自独立幂等：
//   1. drawDarkestDungeonLayout()      —— 2 张红边 Layout 抽 1 张（规则 12）
//   2. assignDarkestDungeonBossSlots() —— Objective + 2 Non-Objective 洗入 3 个 Boss Slot（规则 14）
//   3. buildDarkestDungeonMap()        —— 剩余 12 个 Token 填满其余 Slot，得到 16 Room 地图
//
// 硬约束对照：
// - 硬约束 5：Boss Slot **不走** Phase 9A 的 Edge Room Selector —— Boss Slot 是 Layout
//   自带的固定字段 bossSlotIds，本文件不引用任何 edge-room 算法；
// - 硬约束 6：Objective 位置不得被 UI 泄露 —— 真相只写进 BossSlotAssignmentRecord 与
//   mapState.slotTokens，UI 必须走 act-four-state 的 getMaskedBossSlotViews()；
// - 硬约束 4：随机结果先保存 —— 三步都返回新的 CampaignState，调用方 commit 后刷新不重掷；
// - 硬约束 19：Layout 数据不完整时 formal 模式禁用。

import type { CampaignState } from '../../../types';
import type {
  ActFourState,
  BossSlotAssignmentRecord,
  DarkestDungeonLayoutDefinition,
  DarkestDungeonLayoutDrawRecord,
  DarkestDungeonMapState,
  DarkestDungeonRoomToken,
} from '../../../types/act-four';
import {
  DARKEST_DUNGEON_BOSS_SLOT_COUNT,
  getDarkestDungeonLayoutById,
  getDarkestDungeonLayoutPool,
  isDarkestDungeonOfficialLayoutPoolEnabled,
  validateDarkestDungeonLayout,
} from '../../../data/darkest-dungeon/layout-registry';
import {
  buildDarkestDungeonRoomTokens,
  buildDarkestDungeonStartToken,
  validateDarkestDungeonRoomTokens,
} from '../../../data/darkest-dungeon/prototype-act-four-content';
import { nowIso } from '../../random';
import { pushLog } from '../../log';
import type { ActFourContentMode } from './draw-quest';
import {
  actFourTransactionIds,
  hasProcessedActFourTransaction,
  withProcessedActFourTransaction,
} from './act-four-state';
import { pickIndex, rngStateId, shuffleWithRng } from './rng';

// ---------------------------------------------------------------------------
// §9.2 Layout 抽取
// ---------------------------------------------------------------------------

export interface DrawLayoutOptions {
  rng: () => number;
  mode?: ActFourContentMode;
  seedLabel?: string;
  now?: string;
}

export interface DrawLayoutResult {
  ok: boolean;
  campaign: CampaignState;
  record: DarkestDungeonLayoutDrawRecord | null;
  layout: DarkestDungeonLayoutDefinition | null;
  alreadyDrawn: boolean;
  reason: string | null;
}

/**
 * 抽取 Darkest Dungeon Layout（2 选 1）。
 * 幂等键：`darkest-dungeon-layout-draw:{questId}`（questId = 已抽到的 Quest 定义 ID）。
 */
export function drawDarkestDungeonLayout(
  campaign: CampaignState,
  options: DrawLayoutOptions,
): DrawLayoutResult {
  const state = campaign.actFourState;
  const questId = state.selectedQuestId;
  const mode: ActFourContentMode = options.mode ?? 'prototype';

  if (!questId) {
    return layoutFail(campaign, '尚未抽取 Darkest Dungeon Quest，无法抽 Layout');
  }
  const transactionId = actFourTransactionIds.layoutDraw(questId);

  if (state.layoutDrawRecord || hasProcessedActFourTransaction(state, transactionId)) {
    const existing = state.layoutDrawRecord;
    return {
      ok: existing !== null,
      campaign,
      record: existing,
      layout: existing ? (getDarkestDungeonLayoutById(existing.selectedLayoutId) ?? null) : null,
      alreadyDrawn: true,
      reason: existing ? null : '事务已处理但缺少 Layout 抽取记录（存档损坏）',
    };
  }

  if (mode === 'formal' && !isDarkestDungeonOfficialLayoutPoolEnabled()) {
    return layoutFail(campaign, 'official Darkest Dungeon Layout 数据缺失，正式流程已禁用');
  }

  const pool = getDarkestDungeonLayoutPool(mode);
  if (pool.length !== 2) {
    return layoutFail(campaign, `Layout 池必须恰好 2 张（红边），当前 ${pool.length} 张`);
  }

  const index = pickIndex(options.rng, pool.length);
  const selected = pool[index];
  if (!selected) return layoutFail(campaign, 'Layout 抽取失败：候选池为空');

  const validation = validateDarkestDungeonLayout(selected);
  if (!validation.isComplete) {
    return layoutFail(campaign, `Layout ${selected.id} 校验失败：${validation.issues.join('；')}`);
  }

  const now = options.now ?? nowIso();
  const record: DarkestDungeonLayoutDrawRecord = {
    transactionId,
    candidateLayoutIds: pool.map((l) => l.id),
    selectedLayoutId: selected.id,
    rngStateId: rngStateId(options.seedLabel ?? `dd-layout-draw:${questId}`, index),
    drawnAt: now,
  };

  const next = withProcessedActFourTransaction(
    { ...state, layoutDrawRecord: record },
    transactionId,
  );

  const nextCampaign = pushLog(
    { ...campaign, actFourState: next, updatedAt: now },
    `抽取 Darkest Dungeon Layout：${selected.name}。`,
    'info',
  );
  return {
    ok: true,
    campaign: nextCampaign,
    record,
    layout: selected,
    alreadyDrawn: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// §10 Boss Slot Token 分配 + §11 其余 Room 填充
// ---------------------------------------------------------------------------

export interface BuildMapOptions {
  rng: () => number;
  mode?: ActFourContentMode;
  seedLabel?: string;
  now?: string;
}

export interface BuildMapResult {
  ok: boolean;
  campaign: CampaignState;
  map: DarkestDungeonMapState | null;
  assignment: BossSlotAssignmentRecord | null;
  alreadyBuilt: boolean;
  reason: string | null;
}

/**
 * 生成 16 Room 地图：Boss Slot 分配 + 其余 Slot 填充，一次事务完成。
 *
 * 拆成两个记录保存（bossSlotAssignment / mapState），但共用一个幂等键
 * `darkest-dungeon-boss-slot-assign:{questId}:{layoutId}` —— 因为「洗牌」只能发生一次，
 * 分成两次事务会给重放留下重新洗牌的缝隙。
 */
export function buildDarkestDungeonMap(
  campaign: CampaignState,
  options: BuildMapOptions,
): BuildMapResult {
  const state: ActFourState = campaign.actFourState;
  const questId = state.selectedQuestId;
  const layoutId = state.layoutDrawRecord?.selectedLayoutId ?? null;

  if (!questId) return mapFail(campaign, '尚未抽取 Quest');
  if (!layoutId) return mapFail(campaign, '尚未抽取 Layout');

  const transactionId = actFourTransactionIds.bossSlotAssign(questId, layoutId);

  if (state.mapState || hasProcessedActFourTransaction(state, transactionId)) {
    return {
      ok: state.mapState !== null,
      campaign,
      map: state.mapState,
      assignment: state.bossSlotAssignment,
      alreadyBuilt: true,
      reason: state.mapState ? null : '事务已处理但缺少地图（存档损坏）',
    };
  }

  const layout = getDarkestDungeonLayoutById(layoutId);
  if (!layout) return mapFail(campaign, `找不到 Layout ${layoutId}`);

  const validation = validateDarkestDungeonLayout(layout);
  if (!validation.isComplete) {
    return mapFail(campaign, `Layout ${layout.id} 校验失败：${validation.issues.join('；')}`);
  }

  // ---- Token 池 ----
  const tokens = buildDarkestDungeonRoomTokens();
  const tokenIssues = validateDarkestDungeonRoomTokens(tokens);
  if (tokenIssues.length > 0) {
    return mapFail(campaign, `Room Token 池非法：${tokenIssues.join('；')}`);
  }

  const objective = tokens.find((t) => t.kind === 'objective');
  if (!objective) return mapFail(campaign, 'Room Token 池缺少 Objective');

  const nonObjective = tokens.filter((t) => t.id !== objective.id);
  if (nonObjective.length !== tokens.length - 1) {
    return mapFail(campaign, 'Objective Token 不唯一');
  }

  // ---- §10 步骤 1：随机取 2 个 Non-Objective，与 Objective 一起洗牌 ----
  const shuffledNonObjective = shuffleWithRng(options.rng, nonObjective);
  const bossCompanions = shuffledNonObjective.slice(0, DARKEST_DUNGEON_BOSS_SLOT_COUNT - 1);
  const remainingTokens = shuffledNonObjective.slice(DARKEST_DUNGEON_BOSS_SLOT_COUNT - 1);

  const bossTokens = shuffleWithRng(options.rng, [objective, ...bossCompanions]);
  if (bossTokens.length !== DARKEST_DUNGEON_BOSS_SLOT_COUNT) {
    return mapFail(campaign, 'Boss Slot Token 数量必须为 3');
  }

  // ---- §10 步骤 2：依次放入 3 个 Boss Slot ----
  const bossSlotIds = layout.bossSlotIds;
  const slotTokens: Record<string, DarkestDungeonRoomToken> = {};
  bossSlotIds.forEach((slotId, i) => {
    slotTokens[slotId] = bossTokens[i];
  });

  const objectiveSlotIndex = bossTokens.findIndex((t) => t.id === objective.id);
  const objectiveRoomSlotId = bossSlotIds[objectiveSlotIndex];
  if (!objectiveRoomSlotId) return mapFail(campaign, 'Objective 未能落入任何 Boss Slot');

  // ---- §10 步骤 3：其余 Slot 正常填充 ----
  const startSlotId = layout.startRoomSlotId;
  slotTokens[startSlotId] = buildDarkestDungeonStartToken();

  const fillableSlots = layout.roomSlotIds.filter(
    (slotId) => slotId !== startSlotId && !bossSlotIds.includes(slotId),
  );
  const fillTokens = shuffleWithRng(options.rng, remainingTokens);
  if (fillTokens.length !== fillableSlots.length) {
    return mapFail(
      campaign,
      `剩余 Token 数（${fillTokens.length}）与剩余 Slot 数（${fillableSlots.length}）不匹配`,
    );
  }
  fillableSlots.forEach((slotId, i) => {
    slotTokens[slotId] = fillTokens[i];
  });

  // ---- 自检：16 Slot 全部有 Token，且 Objective 恰好一个 ----
  if (Object.keys(slotTokens).length !== layout.roomSlotIds.length) {
    return mapFail(campaign, `地图 Slot 数必须为 16（当前 ${Object.keys(slotTokens).length}）`);
  }
  const objectiveCount = Object.values(slotTokens).filter((t) => t.kind === 'objective').length;
  if (objectiveCount !== 1) {
    return mapFail(campaign, `Objective 必须恰好出现一次（当前 ${objectiveCount}）`);
  }

  const now = options.now ?? nowIso();
  const seed = options.seedLabel ?? `dd-map:${questId}:${layoutId}`;

  const assignment: BossSlotAssignmentRecord = {
    layoutId: layout.id,
    bossSlotIds,
    assignedTokenIds: [bossTokens[0].id, bossTokens[1].id, bossTokens[2].id],
    objectiveRoomSlotId,
    rngStateId: rngStateId(seed, objectiveSlotIndex),
    transactionId,
    assignedAt: now,
  };

  const map: DarkestDungeonMapState = {
    layoutId: layout.id,
    slotTokens,
    // 起始 Room 一开始就是已揭示的；其余 15 个未揭示（硬约束 6）。
    revealedSlotIds: [startSlotId],
    startRoomSlotId: startSlotId,
    roomCount: 16,
    bossSlotIds,
    transactionId,
  };

  // Excavation Site 状态随地图一起初始化（§11：三个 Empty → Excavation）。
  const excavationSiteStates = layout.roomSlotIds
    .filter((slotId) => slotTokens[slotId]?.kind === 'excavation-site')
    .map((slotId) => ({
      roomId: slotId,
      status: 'unrevealed' as const,
      provisionRollTransactionId: null,
      restTransactionId: null,
      provisionRolls: {},
      restSession: null,
    }));

  const next = withProcessedActFourTransaction(
    { ...state, bossSlotAssignment: assignment, mapState: map, excavationSiteStates },
    transactionId,
  );

  const nextCampaign = pushLog(
    { ...campaign, actFourState: next, updatedAt: now },
    `3 个 Boss Slot 已分配隐藏 Room Token；Dungeon 共 16 个 Rooms。`,
    'info',
  );
  return {
    ok: true,
    campaign: nextCampaign,
    map,
    assignment,
    alreadyBuilt: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Room Reveal（复用既有幂等语义：同一 Slot 只揭示一次）
// ---------------------------------------------------------------------------

export interface RevealRoomResult {
  ok: boolean;
  campaign: CampaignState;
  token: DarkestDungeonRoomToken | null;
  /** 揭示的是否就是 Objective Room（引擎内部判定，UI 只在揭示后才能读）。 */
  isObjective: boolean;
  reason: string | null;
}

/** 揭示一个 Room Slot。已揭示时幂等返回既有 token。 */
export function revealDarkestDungeonRoom(
  campaign: CampaignState,
  slotId: string,
  options?: { now?: string },
): RevealRoomResult {
  const state = campaign.actFourState;
  const map = state.mapState;
  if (!map) {
    return { ok: false, campaign, token: null, isObjective: false, reason: '地图尚未生成' };
  }
  const token = map.slotTokens[slotId];
  if (!token) {
    return { ok: false, campaign, token: null, isObjective: false, reason: `未知 Slot ${slotId}` };
  }

  const isObjective = token.kind === 'objective';

  if (map.revealedSlotIds.includes(slotId)) {
    return { ok: true, campaign, token, isObjective, reason: null };
  }

  const nextMap: DarkestDungeonMapState = {
    ...map,
    revealedSlotIds: [...map.revealedSlotIds, slotId],
  };

  // Excavation Site 揭示后从 unrevealed → available（§11 状态机）。
  const excavationSiteStates = state.excavationSiteStates.map((site) =>
    site.roomId === slotId && site.status === 'unrevealed'
      ? { ...site, status: 'available' as const }
      : site,
  );

  return {
    ok: true,
    campaign: {
      ...campaign,
      actFourState: { ...state, mapState: nextMap, excavationSiteStates },
      updatedAt: options?.now ?? nowIso(),
    },
    token,
    isObjective,
    reason: null,
  };
}

/** 已揭示 Room 数 / 总 Room 数（UI 进度条用，不泄露 Objective 位置）。 */
export function getRevealProgress(state: ActFourState): { revealed: number; total: number } {
  const map = state.mapState;
  return { revealed: map?.revealedSlotIds.length ?? 0, total: map?.roomCount ?? 0 };
}

// ---------------------------------------------------------------------------

function layoutFail(campaign: CampaignState, reason: string): DrawLayoutResult {
  return { ok: false, campaign, record: null, layout: null, alreadyDrawn: false, reason };
}

function mapFail(campaign: CampaignState, reason: string): BuildMapResult {
  return { ok: false, campaign, map: null, assignment: null, alreadyBuilt: false, reason };
}
