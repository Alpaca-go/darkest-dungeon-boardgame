// Phase 10D §26 / §33：Shuffling Horror Encounter Victory / Failure 收口。
//
// 硬约束对照：
// - 25. Horror 死亡 → Queue 停止 + 清理 linked actors（在 death.ts 已完成）；
// - 27. 3 XP + Final Hamlet 复用 Phase 10A 既有链路（resolveGuardianVictory）；
// - 26. Guardian Failure → Campaign Over（复用 resolveGuardianFailure）；
// - 28. 资料缺失时 official 禁用（evaluate 用 definition-driven，恒 false，不做推测）。

import type { CampaignState } from '../../../types';
import type { ShufflingHorrorEncounterState } from '../../../types/shuffling-horror';
import { pushLog } from '../../log';
import { nowIso } from '../../random';
import {
  hasProcessedShufflingHorrorTransaction,
  shufflingHorrorTransactionIds,
  withProcessedShufflingHorrorTransaction,
} from './shuffling-horror-runtime';
import { resolveGuardianFailure, resolveGuardianVictory } from '../../campaign/act-four/guardian-quest';

export interface ShufflingHorrorVictoryEvaluation {
  satisfied: boolean;
  /** 仍存活、阻碍胜利的 Actor id。 */
  remainingActorIds: string[];
  defeatedActorIds: string[];
  reason: string | null;
}

/** 评估胜利（prototype：Horror 死亡即满足；definition-driven 时恒 false，不推测）。 */
export function evaluateShufflingHorrorVictory(
  state: ShufflingHorrorEncounterState,
): ShufflingHorrorVictoryEvaluation {
  const defeatedActorIds = state.actors.filter((a) => !a.alive).map((a) => a.actorId);
  const horrorAlive = state.actors.some((a) => a.role === 'horror' && a.alive);
  const remainingActorIds = state.actors.filter((a) => a.alive).map((a) => a.actorId);
  return {
    satisfied: !horrorAlive,
    remainingActorIds,
    defeatedActorIds,
    reason: horrorAlive ? 'Shuffling Horror 仍存活，未达成胜利' : null,
  };
}

export interface ResolveShufflingHorrorVictoryResult {
  ok: boolean;
  campaign: CampaignState;
  evaluation: ShufflingHorrorVictoryEvaluation;
  xpAwarded: number;
  cleanedLinkedActorIds: string[];
  alreadyResolved: boolean;
  reason: string | null;
}

/** Shuffling Horror Encounter 胜利结算（复用 Phase 10A resolveGuardianVictory）。 */
export function resolveShufflingHorrorEncounterVictory(
  campaign: CampaignState,
  options?: { now?: string },
): ResolveShufflingHorrorVictoryResult {
  const actFour = campaign.actFourState;
  const state = actFour.shufflingHorrorEncounterState;
  const empty: ShufflingHorrorVictoryEvaluation = {
    satisfied: false,
    remainingActorIds: [],
    defeatedActorIds: [],
    reason: 'Shuffling Horror Encounter 尚未 Setup',
  };
  if (!state) {
    return { ok: false, campaign, evaluation: empty, xpAwarded: 0, cleanedLinkedActorIds: [], alreadyResolved: false, reason: '尚未 Setup' };
  }

  const transactionId = shufflingHorrorTransactionIds.encounterVictory(state.guardianBattleId);
  const evaluation = evaluateShufflingHorrorVictory(state);
  if (hasProcessedShufflingHorrorTransaction(state, transactionId)) {
    return { ok: true, campaign, evaluation, xpAwarded: 0, cleanedLinkedActorIds: [], alreadyResolved: true, reason: null };
  }
  if (!evaluation.satisfied) {
    return { ok: false, campaign, evaluation, xpAwarded: 0, cleanedLinkedActorIds: [], alreadyResolved: false, reason: evaluation.reason };
  }

  const now = options?.now ?? nowIso();
  // 清理 linked actors（Priest/Growth）标记为 defeated。
  const cleanedLinkedActorIds = state.actors
    .filter((a) => a.role !== 'horror' && a.alive)
    .map((a) => a.actorId);
  const nextState: ShufflingHorrorEncounterState = {
    ...state,
    actors: state.actors.map((a) =>
      cleanedLinkedActorIds.includes(a.actorId) ? { ...a, alive: false, hp: 0 } : a,
    ),
    initiativeDrawPile: [],
    initiativeDiscardPile: state.initiativeDiscardPile.map((c) => ({ ...c, invalidated: true })),
  };
  const stagedState = withProcessedShufflingHorrorTransaction(nextState, transactionId);

  let staged: CampaignState = {
    ...campaign,
    actFourState: { ...actFour, shufflingHorrorEncounterState: stagedState },
    updatedAt: now,
  };
  staged = pushLog(staged, 'Shuffling Horror 崩解，残余召唤物随之消散。', 'success');

  const guardian = resolveGuardianVictory(staged, { now });
  if (!guardian.ok) {
    return { ok: false, campaign: staged, evaluation, xpAwarded: 0, cleanedLinkedActorIds, alreadyResolved: false, reason: guardian.reason };
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

/** 队伍全灭 → Guardian Quest 失败 → Campaign Over。 */
export function resolveShufflingHorrorEncounterFailure(
  campaign: CampaignState,
  reason: string,
  options?: { now?: string },
): { campaign: CampaignState; alreadyFailed: boolean } {
  const failed = resolveGuardianFailure(campaign, `Shuffling Horror：${reason}`, options);
  return { campaign: failed.campaign, alreadyFailed: failed.alreadyFailed };
}

/** 队伍是否已全灭。 */
export function isPartyWipedInShufflingHorrorEncounter(campaign: CampaignState): boolean {
  return campaign.heroes.length > 0 && campaign.heroes.every((h) => h.dead);
}
