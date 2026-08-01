// Phase 10C §23：Mammoth Cyst Encounter Victory / Failure 收口。
//
// 硬约束对照：
// - 硬约束 19 / §23：Victory Condition **Definition 驱动** ——
//   `definition-driven` 时 satisfied 恒 false 并给出原因，
//   绝不推测「击败 Cyst 即胜」或「Stalk 也要清光」；
// - §23：胜利后的 **3 XP + Final Hamlet** 复用 Phase 10A 既有链路（resolveGuardianVictory），
//   本模块不另建奖励或阶段推进；
// - §23：队伍全灭 → Guardian Quest 失败 → **Campaign Over**（复用 resolveGuardianFailure）。

import type { CampaignState } from '../../../types';
import type {
  MammothCystActorState,
  MammothCystEncounterState,
  MammothCystGuardianDefinition,
} from '../../../types/mammoth-cyst';
import { clearRoomHazardsOnBattleEnd } from '../../room-hazards';
import {
  resolveGuardianFailure,
  resolveGuardianVictory,
} from '../../campaign/act-four/guardian-quest';
import { pushLog } from '../../log';
import { nowIso } from '../../random';
import {
  hasProcessedMammothCystTransaction,
  mammothCystTransactionIds,
  withProcessedMammothCystTransaction,
} from './mammoth-cyst-runtime';

// ---------------------------------------------------------------------------
// §23 Victory Evaluation（纯查询）
// ---------------------------------------------------------------------------

export interface MammothCystVictoryEvaluation {
  satisfied: boolean;
  condition: MammothCystGuardianDefinition['victoryCondition'] | null;
  /** 仍存活、阻碍胜利的 Actor id。 */
  remainingActorIds: string[];
  defeatedActorIds: string[];
  reason: string | null;
}

export function evaluateMammothCystVictoryFrom(
  condition: MammothCystGuardianDefinition['victoryCondition'] | null,
  actorStates: MammothCystActorState[],
): MammothCystVictoryEvaluation {
  const defeatedActorIds = actorStates.filter((a) => !a.isAlive).map((a) => a.actorId);

  if (!condition || condition === 'definition-driven') {
    return {
      satisfied: false,
      condition: condition ?? null,
      remainingActorIds: actorStates.filter((a) => a.isAlive).map((a) => a.actorId),
      defeatedActorIds,
      reason:
        'Mammoth Cyst Victory Condition 未录入（definition-driven），无法评估胜利条件（不做推测）',
    };
  }

  if (condition === 'boss-defeated') {
    const remaining = actorStates
      .filter((a) => a.owner === 'mammoth-cyst' && a.isAlive)
      .map((a) => a.actorId);
    const bossExists = actorStates.some((a) => a.owner === 'mammoth-cyst');
    return {
      satisfied: bossExists && remaining.length === 0,
      condition,
      remainingActorIds: remaining,
      defeatedActorIds,
      reason: bossExists ? null : 'Encounter 中不存在 Mammoth Cyst Actor',
    };
  }

  // all-encounter-owned-actors-defeated
  const remaining = actorStates.filter((a) => a.isAlive).map((a) => a.actorId);
  return {
    satisfied: actorStates.length > 0 && remaining.length === 0,
    condition,
    remainingActorIds: remaining,
    defeatedActorIds,
    reason: null,
  };
}

export function evaluateMammothCystVictory(
  state: MammothCystEncounterState,
): MammothCystVictoryEvaluation {
  return evaluateMammothCystVictoryFrom(
    state.snapshot.guardian.victoryCondition,
    state.actorStates,
  );
}

// ---------------------------------------------------------------------------
// §23 Guardian Victory
// ---------------------------------------------------------------------------

export interface ResolveMammothCystVictoryResult {
  ok: boolean;
  campaign: CampaignState;
  evaluation: MammothCystVictoryEvaluation;
  xpAwarded: number;
  /** 依 cleanupPolicy 在胜利时清除的关联 Actor id。 */
  cleanedLinkedActorIds: string[];
  alreadyResolved: boolean;
  reason: string | null;
}

/**
 * Mammoth Cyst Encounter 胜利结算。
 *
 * 顺序：评估 Victory Condition → 按 cleanupPolicy 清理关联 Stalk →
 * 清空 Entry Effect 占据者 → 复用 Phase 10A 的 resolveGuardianVictory（3 XP + Final Hamlet）。
 *
 * 幂等键：`mammoth-cyst-encounter-victory:{battleId}`。
 */
export function resolveMammothCystEncounterVictory(
  campaign: CampaignState,
  options?: { now?: string },
): ResolveMammothCystVictoryResult {
  const actFour = campaign.actFourState;
  const state = actFour.mammothCystEncounterState;

  const emptyEvaluation: MammothCystVictoryEvaluation = {
    satisfied: false,
    condition: null,
    remainingActorIds: [],
    defeatedActorIds: [],
    reason: 'Mammoth Cyst Encounter 尚未 Setup',
  };

  if (!state) {
    return {
      ok: false,
      campaign,
      evaluation: emptyEvaluation,
      xpAwarded: 0,
      cleanedLinkedActorIds: [],
      alreadyResolved: false,
      reason: 'Mammoth Cyst Encounter 尚未 Setup',
    };
  }

  const transactionId = mammothCystTransactionIds.encounterVictory(state.battleId);
  const evaluation = evaluateMammothCystVictory(state);

  if (
    state.mammothCystBattleRuntime.victoryResolved ||
    hasProcessedMammothCystTransaction(state, transactionId)
  ) {
    return {
      ok: true,
      campaign,
      evaluation,
      xpAwarded: 0,
      cleanedLinkedActorIds: [],
      alreadyResolved: true,
      reason: null,
    };
  }

  if (!evaluation.satisfied) {
    return {
      ok: false,
      campaign,
      evaluation,
      xpAwarded: 0,
      cleanedLinkedActorIds: [],
      alreadyResolved: false,
      reason:
        evaluation.reason ?? `仍有 ${evaluation.remainingActorIds.length} 名 Actor 存活，未达成胜利条件`,
    };
  }

  const now = options?.now ?? nowIso();
  const cleanupPolicy = state.snapshot.guardian.cleanupPolicy;

  // ---- cleanupPolicy 驱动的关联 Actor 清理 ----
  const cleanedLinkedActorIds: string[] = [];
  let actorStates = state.actorStates;
  if (cleanupPolicy === 'remove-linked-actors-on-boss-victory') {
    actorStates = state.actorStates.map((a) => {
      if (a.owner === 'white-cell-stalk' && a.isAlive) {
        cleanedLinkedActorIds.push(a.actorId);
        return { ...a, isAlive: false, hp: 0, defeatedAt: now };
      }
      return a;
    });
  }

  let nextState: MammothCystEncounterState = {
    ...state,
    actorStates,
    // Battle End：所有未抽卡失效、Queue 清空。
    initiativeCards: state.initiativeCards.map((c) => ({ ...c, invalidated: true })),
    initiativeDrawPile: [],
    summonHistory: state.summonHistory.map((r) =>
      cleanedLinkedActorIds.includes(r.actorId) ? { ...r, status: 'removed' } : r,
    ),
    areaEntryRuntime: clearRoomHazardsOnBattleEnd(state.areaEntryRuntime),
    mammothCystBattleRuntime: {
      ...state.mammothCystBattleRuntime,
      victoryResolved: true,
      activeWhiteCellStalkActorId: null,
      activeSummonRecordId: null,
      activeStalkInitiativeCardIds: [],
    },
  };
  nextState = withProcessedMammothCystTransaction(nextState, transactionId);

  let staged: CampaignState = {
    ...campaign,
    actFourState: { ...actFour, mammothCystEncounterState: nextState },
    updatedAt: now,
  };
  staged = pushLog(
    staged,
    cleanedLinkedActorIds.length > 0
      ? `Mammoth Cyst 崩解，残余的 ${cleanedLinkedActorIds.length} 个 White Cell Stalk 随之枯萎。`
      : 'Mammoth Cyst 崩解，Objective Room 归于死寂。',
    'success',
  );

  // ---- 复用 Phase 10A：3 XP + 进入 Final Hamlet ----
  const guardian = resolveGuardianVictory(staged, { now });
  if (!guardian.ok) {
    return {
      ok: false,
      campaign: staged,
      evaluation,
      xpAwarded: 0,
      cleanedLinkedActorIds,
      alreadyResolved: false,
      reason: guardian.reason,
    };
  }

  return {
    ok: true,
    campaign: guardian.campaign,
    evaluation,
    xpAwarded: guardian.xpAwarded,
    cleanedLinkedActorIds,
    alreadyResolved: guardian.alreadyResolved,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// §23 Guardian Failure（Campaign Over）
// ---------------------------------------------------------------------------

export interface ResolveMammothCystFailureResult {
  campaign: CampaignState;
  alreadyFailed: boolean;
}

/** 队伍全灭 → Guardian Quest 失败 → Campaign Over（复用 Phase 10A 链路）。 */
export function resolveMammothCystEncounterFailure(
  campaign: CampaignState,
  reason: string,
  options?: { now?: string },
): ResolveMammothCystFailureResult {
  const actFour = campaign.actFourState;
  const state = actFour.mammothCystEncounterState;

  const staged: CampaignState = state
    ? {
        ...campaign,
        actFourState: {
          ...actFour,
          mammothCystEncounterState: {
            ...state,
            areaEntryRuntime: clearRoomHazardsOnBattleEnd(state.areaEntryRuntime),
          },
        },
      }
    : campaign;

  const failed = resolveGuardianFailure(staged, `Mammoth Cyst：${reason}`, options);
  return { campaign: failed.campaign, alreadyFailed: failed.alreadyFailed };
}

/** 队伍是否已全灭。 */
export function isPartyWipedInMammothCystEncounter(campaign: CampaignState): boolean {
  return campaign.heroes.length > 0 && campaign.heroes.every((h) => h.dead);
}
