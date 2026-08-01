// Phase 10C §22：Actor 死亡 / Initiative 失效 / 重召唤 Generation。
//
// 硬约束对照：
// - 硬约束 6：Stalk 死亡后**不立即**重召唤 —— 本模块只做「移除 + 失效卡」，
//   下一次 Cyst 行动时由 decideMammothCystAction 重新判定条件（那时才可能再召唤）；
// - 硬约束 18 / §22：Actor 死亡 → 其**未抽出**的 Initiative Card 立即失效；
// - 硬约束 19 / §22：**Cyst 死亡** → Mammoth Cyst 域 Initiative Queue 停止；
//   关联 Actor（Stalk）的清理**由 Guardian Definition 的 cleanupPolicy 驱动**，
//   绝不自行规定「Boss 死则小怪必死」；
// - 每一代 Stalk 的 actorId / Initiative Card id 都带 generation，历史可追溯（§14）。

import type { CampaignState } from '../../../types';
import type { MammothCystEncounterState } from '../../../types/mammoth-cyst';
import { pushLog } from '../../log';
import { nowIso } from '../../random';
import {
  hasProcessedMammothCystTransaction,
  mammothCystTransactionIds,
  withProcessedMammothCystTransaction,
} from './mammoth-cyst-runtime';

export interface ResolveMammothCystActorDefeatResult {
  ok: boolean;
  campaign: CampaignState;
  state: MammothCystEncounterState | null;
  /** 本次因死亡而失效的 Initiative Card id。 */
  invalidatedCardIds: string[];
  /** Cyst 死亡时按 cleanupPolicy 一并移除的关联 Actor id。 */
  removedLinkedActorIds: string[];
  /** 是否导致整个 Mammoth Cyst 域 Initiative Queue 停止（Cyst 死亡）。 */
  queueStopped: boolean;
  alreadyResolved: boolean;
  reason: string | null;
}

/**
 * 结算一名 Mammoth Cyst 域 Actor 的死亡。
 *
 * Stalk 死亡：
 *   - actorState.isAlive = false（保留记录，供 generation 追溯）；
 *   - 其**未抽出**的 Initiative Card 失效；
 *   - runtime.activeWhiteCellStalkActorId → null；
 *   - **不**触发重召唤（硬约束 6）。
 *
 * Cyst 死亡：
 *   - 其未抽出的卡失效；
 *   - **整个域的 Queue 停止**（drawPile 清空，硬约束 19）；
 *   - 关联 Stalk 的处置由 `cleanupPolicy` 决定：
 *     · `remove-linked-actors-on-boss-victory` → 一并移除；
 *     · `definition-driven` → **保持原样**并在返回值中说明（不猜）。
 *
 * 幂等键：`mammoth-cyst-actor-defeat:{battleId}:{actorId}`。
 */
export function resolveMammothCystActorDefeat(
  campaign: CampaignState,
  actorId: string,
  options?: { now?: string },
): ResolveMammothCystActorDefeatResult {
  const actFour = campaign.actFourState;
  const state = actFour.mammothCystEncounterState;
  if (!state) {
    return {
      ok: false,
      campaign,
      state: null,
      invalidatedCardIds: [],
      removedLinkedActorIds: [],
      queueStopped: false,
      alreadyResolved: false,
      reason: 'Mammoth Cyst Encounter 尚未 Setup',
    };
  }

  const transactionId = mammothCystTransactionIds.actorDefeat(state.battleId, actorId);
  if (hasProcessedMammothCystTransaction(state, transactionId)) {
    return {
      ok: true,
      campaign,
      state,
      invalidatedCardIds: [],
      removedLinkedActorIds: [],
      queueStopped: false,
      alreadyResolved: true,
      reason: null,
    };
  }

  const actor = state.actorStates.find((a) => a.actorId === actorId);
  if (!actor) {
    return {
      ok: false,
      campaign,
      state,
      invalidatedCardIds: [],
      removedLinkedActorIds: [],
      queueStopped: false,
      alreadyResolved: false,
      reason: `找不到 Actor ${actorId}`,
    };
  }
  if (!actor.isAlive) {
    return {
      ok: true,
      campaign,
      state,
      invalidatedCardIds: [],
      removedLinkedActorIds: [],
      queueStopped: false,
      alreadyResolved: true,
      reason: null,
    };
  }

  const now = options?.now ?? nowIso();
  const isBoss = actor.owner === 'mammoth-cyst';
  const cleanupPolicy = state.snapshot.guardian.cleanupPolicy;

  // ---- 决定哪些 Actor 因本次死亡而离场 ----
  const removedLinkedActorIds: string[] = [];
  if (isBoss && cleanupPolicy === 'remove-linked-actors-on-boss-victory') {
    for (const a of state.actorStates) {
      if (a.owner === 'white-cell-stalk' && a.isAlive) removedLinkedActorIds.push(a.actorId);
    }
  }
  const goneActorIds = new Set<string>([actorId, ...removedLinkedActorIds]);

  // ---- 硬约束 18：未抽出的卡失效 ----
  const unresolved = new Set(state.initiativeDrawPile);
  const invalidatedCardIds = state.initiativeCards
    .filter((c) => goneActorIds.has(c.actorId) && !c.invalidated && unresolved.has(c.id))
    .map((c) => c.id);

  const nextCards = state.initiativeCards.map((c) =>
    invalidatedCardIds.includes(c.id) ? { ...c, invalidated: true } : c,
  );

  // ---- 硬约束 19：Cyst 死亡 → 整个域的 Queue 停止 ----
  const queueStopped = isBoss;
  const nextPile = queueStopped
    ? []
    : state.initiativeDrawPile.filter((id) => !invalidatedCardIds.includes(id));

  const nextActorStates = state.actorStates.map((a) =>
    goneActorIds.has(a.actorId) ? { ...a, isAlive: false, hp: 0, defeatedAt: now } : a,
  );

  const stalkGone = goneActorIds.has(state.mammothCystBattleRuntime.activeWhiteCellStalkActorId ?? '');
  let nextState: MammothCystEncounterState = {
    ...state,
    actorStates: nextActorStates,
    initiativeCards: nextCards,
    initiativeDrawPile: nextPile,
    // Stalk 离场 → 召唤记录置为 defeated / removed（保留 generation 供追溯）。
    summonHistory: state.summonHistory.map((r) =>
      goneActorIds.has(r.actorId) && r.status === 'active'
        ? { ...r, status: r.actorId === actorId ? 'defeated' : 'removed' }
        : r,
    ),
    mammothCystBattleRuntime: {
      ...state.mammothCystBattleRuntime,
      activeWhiteCellStalkActorId: stalkGone
        ? null
        : state.mammothCystBattleRuntime.activeWhiteCellStalkActorId,
      activeSummonRecordId: stalkGone ? null : state.mammothCystBattleRuntime.activeSummonRecordId,
      activeStalkInitiativeCardIds: stalkGone
        ? []
        : state.mammothCystBattleRuntime.activeStalkInitiativeCardIds,
    },
  };
  nextState = withProcessedMammothCystTransaction(nextState, transactionId);

  // BattleState 同步（Stalk 与 Cyst 都是真正的 BattleUnit）。
  const battle = campaign.battle
    ? {
        ...campaign.battle,
        monsters: campaign.battle.monsters.map((m) =>
          goneActorIds.has(m.id) ? { ...m, hp: 0, isAlive: false } : m,
        ),
      }
    : campaign.battle;

  let next: CampaignState = {
    ...campaign,
    battle,
    actFourState: { ...actFour, mammothCystEncounterState: nextState },
    updatedAt: now,
  };

  if (isBoss) {
    next = pushLog(
      next,
      `${actor.name} 被击破，Mammoth Cyst 的 Initiative 队列停止（${invalidatedCardIds.length} 张未抽卡失效）` +
        (cleanupPolicy === 'remove-linked-actors-on-boss-victory'
          ? `，关联的 ${removedLinkedActorIds.length} 个 White Cell Stalk 一并消散。`
          : `；关联 Actor 的清理规则未录入（cleanupPolicy=definition-driven），维持原状。`),
      'success',
    );
  } else {
    next = pushLog(
      next,
      `${actor.name} 被摧毁，其 ${invalidatedCardIds.length} 张未抽 Initiative 失效；` +
        `Mammoth Cyst 不会立刻重新召唤 —— 需等到它的下一次行动。`,
      'info',
    );
  }

  return {
    ok: true,
    campaign: next,
    state: nextState,
    invalidatedCardIds,
    removedLinkedActorIds,
    queueStopped,
    alreadyResolved: false,
    reason: null,
  };
}

/**
 * 查询：下一次 Cyst 行动时是否会重新召唤（硬约束 6 的可观测出口）。
 * 仅在「Cyst 存活 且 无存活 Stalk」时为 true。
 */
export function willResummonOnNextCystAction(state: MammothCystEncounterState): boolean {
  const cystAlive = state.actorStates.some((a) => a.owner === 'mammoth-cyst' && a.isAlive);
  const stalkAlive = state.actorStates.some((a) => a.owner === 'white-cell-stalk' && a.isAlive);
  return cystAlive && !stalkAlive;
}

/** 已召唤过的 Stalk 代数（generation 从 1 起）。 */
export function getWhiteCellStalkGeneration(state: MammothCystEncounterState): number {
  return state.mammothCystBattleRuntime.summonGeneration;
}
