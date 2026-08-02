// Phase 10D §17 / §25：Actor 死亡 / 重召唤 Generation / Queue 停止。
//
// 硬约束对照：
// - 16. Priest/Growth 死亡后**不立即**重生（仅标记死亡；下次 Horror 行动重召唤）；
// - 17. 下一次 Horror 行动重召唤缺失 Role（generation++），由 decide/execute 检测 missing；
// - 22（Monster 侧）/ 7. 角色死亡后多余 Initiative 在抽到时移除（Excess Policy 已覆盖）；
// - 25. Horror 死亡立即停止 Queue 并清理 linked actors；
// - 每一代 Actor 的 actorId 带 generation，历史可追溯。

import type { CampaignState } from '../../../types';
import type { ShufflingHorrorEncounterState } from '../../../types/shuffling-horror';
import { pushLog } from '../../log';
import { nowIso } from '../../random';
import {
  hasProcessedShufflingHorrorTransaction,
  shufflingHorrorTransactionIds,
  withProcessedShufflingHorrorTransaction,
} from './shuffling-horror-runtime';

export interface ResolveShufflingHorrorActorDefeatResult {
  ok: boolean;
  campaign: CampaignState;
  state: ShufflingHorrorEncounterState | null;
  /** Horror 死亡时一并清理的关联 Actor id（Priest/Growth）。 */
  removedLinkedActorIds: string[];
  /** 是否导致整个 Queue 停止（Horror 死亡）。 */
  queueStopped: boolean;
  alreadyResolved: boolean;
  reason: string | null;
}

/** 结算一名 Shuffling Horror 域 Actor 的死亡。 */
export function resolveShufflingHorrorActorDefeat(
  campaign: CampaignState,
  actorId: string,
  options?: { now?: string },
): ResolveShufflingHorrorActorDefeatResult {
  const actFour = campaign.actFourState;
  const state = actFour.shufflingHorrorEncounterState;
  const base = (reason: string | null, ok: boolean): ResolveShufflingHorrorActorDefeatResult => ({
    ok,
    campaign,
    state,
    removedLinkedActorIds: [],
    queueStopped: false,
    alreadyResolved: false,
    reason,
  });
  if (!state) return base('Shuffling Horror Encounter 尚未 Setup', false);

  const transactionId = shufflingHorrorTransactionIds.actorDefeat(state.guardianBattleId, actorId);
  if (hasProcessedShufflingHorrorTransaction(state, transactionId)) {
    return { ok: true, campaign, state, removedLinkedActorIds: [], queueStopped: false, alreadyResolved: true, reason: null };
  }

  const actor = state.actors.find((a) => a.actorId === actorId);
  if (!actor) return base(`找不到 Actor ${actorId}`, false);
  if (!actor.alive) return { ok: true, campaign, state, removedLinkedActorIds: [], queueStopped: false, alreadyResolved: true, reason: null };

  const now = options?.now ?? nowIso();
  const isBoss = actor.role === 'horror';
  const removedLinkedActorIds: string[] = [];

  let nextActors = state.actors.map((a) => (a.actorId === actorId ? { ...a, alive: false, hp: 0 } : a));

  // ---- 硬约束 25：Horror 死亡 → 停止 Queue 并清理 linked actors ----
  const queueStopped = isBoss;
  let nextDrawPile = state.initiativeDrawPile;
  let nextTracker = state.stancePriority;
  if (isBoss) {
    for (const a of state.actors) {
      if (a.role !== 'horror' && a.alive) removedLinkedActorIds.push(a.actorId);
    }
    nextActors = nextActors.map((a) =>
      removedLinkedActorIds.includes(a.actorId) ? { ...a, alive: false, hp: 0 } : a,
    );
    nextDrawPile = [];
    nextTracker = {
      ...state.stancePriority,
      stanceOccupant: { aggressive: null, defensive: null, ranged: null, support: null },
      isFull: false,
    };
  }

  let nextState: ShufflingHorrorEncounterState = {
    ...state,
    actors: nextActors,
    initiativeDrawPile: nextDrawPile,
    stancePriority: nextTracker,
    initiativeDiscardPile: state.initiativeDiscardPile.map((c) => ({ ...c, invalidated: true })),
  };
  nextState = withProcessedShufflingHorrorTransaction(nextState, transactionId);

  // BattleState 同步（Horror 是真正的 BattleUnit）。
  const battle = campaign.battle
    ? {
        ...campaign.battle,
        monsters: campaign.battle.monsters.map((m) =>
          m.id === actorId || removedLinkedActorIds.includes(m.id)
            ? { ...m, hp: 0, isAlive: false }
            : m,
        ),
      }
    : campaign.battle;

  let next: CampaignState = {
    ...campaign,
    battle,
    actFourState: { ...actFour, shufflingHorrorEncounterState: nextState },
    updatedAt: now,
  };

  next = pushLog(
    next,
    isBoss
      ? `Shuffling Horror 被击破，Monster Initiative 队列停止，关联的 ${removedLinkedActorIds.length} 名召唤物一并消散。`
      : `${actor.role} 被摧毁；Shuffling Horror 不会立刻重新召唤 —— 需等到它的下一次行动。`,
    isBoss ? 'success' : 'info',
  );

  return {
    ok: true,
    campaign: next,
    state: nextState,
    removedLinkedActorIds,
    queueStopped,
    alreadyResolved: false,
    reason: null,
  };
}

/** 查询：下一次 Horror 行动时是否会重召唤缺失角色（硬约束 16/17）。 */
export function willResummonOnNextHorrorAction(state: ShufflingHorrorEncounterState): boolean {
  const horrorAlive = state.actors.some((a) => a.role === 'horror' && a.alive);
  const priestAlive = state.actors.some((a) => a.role === 'cultist-priest' && a.alive && !a.inReserve);
  const growthAlive = state.actors.some((a) => a.role === 'malignant-growth' && a.alive && !a.inReserve);
  return horrorAlive && (!priestAlive || !growthAlive);
}

/** 某角色当前代（generation）。 */
export function getShufflingHorrorRoleGeneration(
  state: ShufflingHorrorEncounterState,
  role: 'horror' | 'cultist-priest' | 'malignant-growth',
): number {
  return state.generationByRole[role] ?? 0;
}
