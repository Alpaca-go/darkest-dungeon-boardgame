// Phase 10A §11 / §12：Excavation Site（挖掘点）结算。
//
// 规则 22：Excavation Site = 每名 Hero 掷 1 个 Provision Die + 一次免费 8 点 Rest，
//          且**不消耗 Firewood**。
//
// §12 事务顺序：
//   1. 验证 Room 未清除 → 2. 锁定 Room Entry → 3. 每名当前 Party Hero 掷 1 个 Provision Die
//   → 4. 保存每个结果 → 5. 加入公共 Provision Pool → 6. 创建免费 Rest Session
//   → 7. Resting Points = 8 → 8. 不消耗 Firewood → 9. 玩家完成 Rest 分配
//   → 10. Room 标记 cleared → 11. 保存
//
// 硬约束对照：
// - 硬约束 8：复用既有 Provision / Rest 引擎，**不复制一套治疗 / 减压逻辑** ——
//   分配点数时直接调用 resolveHealing() 与 recoverStress()；
// - 硬约束 9：Provision Die 不可重掷（provisionRollTransactionId 落盘后拒绝再掷）；
// - 硬约束 10：免费 Rest 不消耗 Firewood（consumeFirewood 恒为 false 字面量类型）；
// - §12 Pending Rest：未分配完 8 点前 Room 保持 pending，不能继续探索，刷新可恢复。

import type { CampaignState, ProvisionPool } from '../../../types';
import type {
  ActFourState,
  ExcavationRestAllocation,
  ExcavationRestSessionState,
  ExcavationSiteRoomState,
} from '../../../types/act-four';
import {
  EXCAVATION_RESTING_POINTS,
  PROVISION_DIE_FACES,
  getProvisionDieFaceMap,
  isProvisionDieMapEnabled,
} from '../../../data/darkest-dungeon/room-registry';
import { resolveHealing } from '../../healing';
import { recoverStress } from '../../stress';
import { nowIso } from '../../random';
import { pushLog } from '../../log';
import type { ActFourContentMode } from './draw-quest';
import { actFourTransactionIds, hasProcessedActFourTransaction, withProcessedActFourTransaction } from './act-four-state';
import { rollProvisionDie } from './rng';
import {
  blockCommunityOperation,
  type CommunityRuntimeBlocker,
} from '../../../data/darkest-dungeon/community-reference/runtime-profile';

// ---------------------------------------------------------------------------
// 步骤 1—8：进入 Room → 掷 Provision Dice → 开启免费 Rest
// ---------------------------------------------------------------------------

export interface ResolveExcavationOptions {
  rng: () => number;
  mode?: ActFourContentMode;
  now?: string;
}

export interface ResolveExcavationResult {
  ok: boolean;
  campaign: CampaignState;
  site: ExcavationSiteRoomState | null;
  /** heroId → 骰点。 */
  rolls: Record<string, number>;
  /** 本次进入公共池的补给增量。 */
  gained: Partial<ProvisionPool>;
  alreadyResolved: boolean;
  reason: string | null;
  kind?: 'community-source-blocked';
  blocker?: CommunityRuntimeBlocker;
}

/**
 * 进入 Excavation Site：掷 Provision Dice 并创建免费 Rest Session。
 *
 * 幂等键：`excavation-provision:{questId}:{roomId}`。
 * 已掷过时原样返回既有结果 —— 刷新绝不重掷（硬约束 9）。
 */
export function resolveExcavationSiteRoom(
  campaign: CampaignState,
  roomId: string,
  options: ResolveExcavationOptions,
): ResolveExcavationResult {
  const state: ActFourState = campaign.actFourState;
  const questId = state.selectedQuestId;
  const mode: ActFourContentMode = options.mode ?? 'prototype';

  if (!questId) return excFail(campaign, '尚未抽取 Darkest Dungeon Quest');

  const site = state.excavationSiteStates.find((s) => s.roomId === roomId);
  if (!site) return excFail(campaign, `Room ${roomId} 不是 Excavation Site`);

  const transactionId = actFourTransactionIds.excavationProvision(questId, roomId);

  // ---- 幂等：已掷过（步骤 1 的「验证 Room 未清除」）----
  if (site.provisionRollTransactionId || hasProcessedActFourTransaction(state, transactionId)) {
    return {
      ok: true,
      campaign,
      site,
      rolls: site.provisionRolls,
      gained: {},
      alreadyResolved: true,
      reason: null,
    };
  }

  if (site.status === 'cleared') return excFail(campaign, `Room ${roomId} 已清除`);
  if (site.status === 'unrevealed') return excFail(campaign, `Room ${roomId} 尚未揭示`);

  if (mode === 'community-reference') {
    const blocked = blockCommunityOperation('EXCAVATION_PROVISION_DIE_MAP_UNRESOLVED');
    return { ...excFail(campaign, blocked.blocker.code), ...blocked };
  }

  // ---- Data Gate：正式骰面映射缺失时 formal 模式拒绝（硬约束 19）----
  if (mode === 'formal' && !isProvisionDieMapEnabled()) {
    return excFail(campaign, 'Provision Die 骰面映射缺失，正式 Excavation 结算已禁用');
  }
  const faceMap = getProvisionDieFaceMap(mode);

  // ---- 步骤 3：每名「当前」Party Hero 掷 1 个 ----
  // dead / removed Hero 不掷（§12 Provision Dice）。
  const heroes = campaign.heroes.filter((h) => !h.dead && h.isAlive !== false);
  if (heroes.length === 0) return excFail(campaign, '队伍中没有可掷骰的英雄');

  const rolls: Record<string, number> = {};
  const gained: Partial<ProvisionPool> = {};
  for (const hero of heroes) {
    const face = rollProvisionDie(options.rng);
    rolls[hero.instanceId] = face;
    const provision = faceMap[face];
    if (provision) {
      gained[provision] = (gained[provision] ?? 0) + 1;
    }
  }

  // ---- 步骤 5：加入公共 Provision Pool ----
  const provisions: ProvisionPool = { ...campaign.provisions };
  (Object.keys(gained) as (keyof ProvisionPool)[]).forEach((key) => {
    provisions[key] = (provisions[key] ?? 0) + (gained[key] ?? 0);
  });

  // ---- 步骤 6—8：创建免费 Rest Session（8 点、不消耗 Firewood）----
  const restTransactionId = actFourTransactionIds.excavationRest(questId, roomId);
  const restSession: ExcavationRestSessionState = {
    id: `excavation-rest:${roomId}`,
    source: 'excavation-site',
    restingPoints: EXCAVATION_RESTING_POINTS,
    consumeFirewood: false,
    remainingPoints: EXCAVATION_RESTING_POINTS,
    allocations: [],
    status: 'pending',
    transactionId: restTransactionId,
  };

  const nextSite: ExcavationSiteRoomState = {
    ...site,
    status: 'resolving-rest',
    provisionRollTransactionId: transactionId,
    provisionRolls: rolls,
    restSession,
  };

  const now = options.now ?? nowIso();
  const nextState = withProcessedActFourTransaction(
    {
      ...state,
      excavationSiteStates: state.excavationSiteStates.map((s) =>
        s.roomId === roomId ? nextSite : s,
      ),
    },
    transactionId,
  );

  const rollText = heroes.map((h) => `${h.name}:${rolls[h.instanceId]}`).join('、');
  let nextCampaign: CampaignState = { ...campaign, provisions, actFourState: nextState, updatedAt: now };
  nextCampaign = pushLog(nextCampaign, `进入 Excavation Site（${roomId}）。`, 'info');
  nextCampaign = pushLog(nextCampaign, `每名 Hero 各掷 1 个 Provision Die：${rollText}。`, 'info');
  nextCampaign = pushLog(
    nextCampaign,
    `开始免费 Rest，${EXCAVATION_RESTING_POINTS} Resting Points（不消耗 Firewood）。`,
    'info',
  );
  return {
    ok: true,
    campaign: nextCampaign,
    site: nextSite,
    rolls,
    gained,
    alreadyResolved: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// 步骤 9：Rest 点数分配（复用既有治疗 / 减压引擎）
// ---------------------------------------------------------------------------

export interface AllocateRestResult {
  ok: boolean;
  campaign: CampaignState;
  session: ExcavationRestSessionState | null;
  reason: string | null;
}

/**
 * 分配免费 Rest 点数。
 *
 * 硬约束 8：治疗 / 减压一律走既有引擎 —— 本函数只做「点数账本 + 幂等」。
 * 1 点 = 1 HP 或 1 点 Stress 恢复（与既有 Rest 语义一致）。
 */
export function allocateExcavationRestPoints(
  campaign: CampaignState,
  roomId: string,
  allocation: ExcavationRestAllocation,
  options?: { now?: string },
): AllocateRestResult {
  const state = campaign.actFourState;
  const site = state.excavationSiteStates.find((s) => s.roomId === roomId);
  if (!site) return restFail(campaign, `Room ${roomId} 不是 Excavation Site`);

  const session = site.restSession;
  if (!session) return restFail(campaign, `Room ${roomId} 尚未开启 Rest Session`);
  if (session.status === 'completed') return restFail(campaign, 'Rest 已完成');

  const points = Math.floor(allocation.points);
  if (points <= 0) return restFail(campaign, '分配点数必须为正整数');
  if (points > session.remainingPoints) {
    return restFail(campaign, `剩余点数不足（剩 ${session.remainingPoints}，请求 ${points}）`);
  }

  const hero = campaign.heroes.find((h) => h.instanceId === allocation.heroId);
  if (!hero) return restFail(campaign, `找不到英雄 ${allocation.heroId}`);
  if (hero.dead) return restFail(campaign, '死亡英雄无法休整');

  // ---- 复用既有引擎 ----
  // sourceType 用 'exploration'（Excavation 发生在地牢探索中），
  // sourceId 标注来源，便于日志区分「营火 Rest」与「Excavation 免费 Rest」。
  let next: CampaignState = campaign;
  if (allocation.kind === 'heal') {
    next = resolveHealing(next, hero.instanceId, points).campaign;
  } else {
    next = recoverStress(next, {
      heroId: hero.instanceId,
      amount: points,
      sourceType: 'exploration',
      sourceId: 'excavation-site',
      questId: campaign.currentQuestId ?? state.selectedQuestId ?? 'darkest-dungeon',
    }).campaign;
  }

  const remainingPoints = session.remainingPoints - points;
  const nextSession: ExcavationRestSessionState = {
    ...session,
    remainingPoints,
    allocations: [...session.allocations, { ...allocation, points }],
    status: remainingPoints === 0 ? 'completed' : 'pending',
  };

  const nextSite: ExcavationSiteRoomState = {
    ...site,
    // §12 步骤 10：8 点分配完毕后 Room 才 cleared。
    status: remainingPoints === 0 ? 'cleared' : 'resolving-rest',
    restTransactionId: remainingPoints === 0 ? session.transactionId : site.restTransactionId,
    restSession: nextSession,
  };

  return {
    ok: true,
    campaign: {
      ...next,
      actFourState: {
        ...next.actFourState,
        excavationSiteStates: next.actFourState.excavationSiteStates.map((s) =>
          s.roomId === roomId ? nextSite : s,
        ),
      },
      updatedAt: options?.now ?? nowIso(),
    },
    session: nextSession,
    reason: null,
  };
}

/**
 * 放弃剩余点数并结束 Rest（玩家主动跳过）。
 * 仍然标记 cleared —— 规则上 Rest 是「可以用」而非「必须用完」，
 * 但只要玩家没显式结束，Room 就保持 pending（§12 Pending Rest）。
 */
export function finishExcavationRest(
  campaign: CampaignState,
  roomId: string,
  options?: { now?: string },
): AllocateRestResult {
  const state = campaign.actFourState;
  const site = state.excavationSiteStates.find((s) => s.roomId === roomId);
  if (!site) return restFail(campaign, `Room ${roomId} 不是 Excavation Site`);
  const session = site.restSession;
  if (!session) return restFail(campaign, `Room ${roomId} 尚未开启 Rest Session`);
  if (session.status === 'completed') {
    return { ok: true, campaign, session, reason: null };
  }

  const nextSession: ExcavationRestSessionState = { ...session, status: 'completed' };
  const nextSite: ExcavationSiteRoomState = {
    ...site,
    status: 'cleared',
    restTransactionId: session.transactionId,
    restSession: nextSession,
  };

  return {
    ok: true,
    campaign: {
      ...campaign,
      actFourState: {
        ...state,
        excavationSiteStates: state.excavationSiteStates.map((s) =>
          s.roomId === roomId ? nextSite : s,
        ),
      },
      updatedAt: options?.now ?? nowIso(),
    },
    session: nextSession,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

/** §12 Pending Rest：存在未完成的 Rest 时不能继续探索。 */
export function hasPendingExcavationRest(state: ActFourState): boolean {
  return state.excavationSiteStates.some(
    (s) => s.restSession !== null && s.restSession.status === 'pending',
  );
}

/** 当前阻塞探索的 Excavation Room（UI 提示用）。 */
export function getPendingExcavationRoomId(state: ActFourState): string | null {
  return (
    state.excavationSiteStates.find(
      (s) => s.restSession !== null && s.restSession.status === 'pending',
    )?.roomId ?? null
  );
}

/** 已清除的 Excavation Site 数 / 总数。 */
export function getExcavationProgress(state: ActFourState): { cleared: number; total: number } {
  return {
    cleared: state.excavationSiteStates.filter((s) => s.status === 'cleared').length,
    total: state.excavationSiteStates.length,
  };
}

/** Provision Die 面数（UI 展示与测试断言共用同一常量）。 */
export const EXCAVATION_PROVISION_DIE_FACES = PROVISION_DIE_FACES;

// ---------------------------------------------------------------------------

function excFail(campaign: CampaignState, reason: string): ResolveExcavationResult {
  return {
    ok: false,
    campaign,
    site: null,
    rolls: {},
    gained: {},
    alreadyResolved: false,
    reason,
  };
}

function restFail(campaign: CampaignState, reason: string): AllocateRestResult {
  return { ok: false, campaign, session: null, reason };
}
