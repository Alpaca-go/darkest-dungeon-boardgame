// Phase 10B §21：Dual Boss Victory Evaluation + Guardian Victory / Failure 收口。
//
// 硬约束对照：
// - 硬约束 10 / §21：Victory Condition 必须 **Definition 驱动** ——
//   Victory Rule 缺失时 `satisfied` 恒为 false 并给出原因，
//   **绝不**推测「击败任意一个即可」或「必须两个都击败」；
// - 硬约束 12 / §20：单名 Templar 死亡不结束战斗 —— 胜负只由本模块评估；
// - 硬约束 13 / §21：Guardian Quest 失败 → **Campaign Over**（复用 10A 的 resolveGuardianFailure）；
// - §21：胜利后的 3 XP 与 Final Hamlet 复用 Phase 10A / 8D 既有链路，
//   本模块不另建奖励或阶段推进逻辑。

import type { CampaignState } from '../../../types';
import type { DualBossVictoryEvaluation, DualBossVictoryRule } from '../../../types/dual-boss';
import type { TemplarActorState, TemplarsEncounterState } from '../../../types/templars';
import { clearRoomHazardsOnBattleEnd } from '../../room-hazards';
import {
  resolveGuardianFailure,
  resolveGuardianVictory,
} from '../../campaign/act-four/guardian-quest';
import { pushLog } from '../../log';
import { nowIso } from '../../random';
import {
  hasProcessedTemplarsTransaction,
  templarsTransactionIds,
  withProcessedTemplarsTransaction,
} from './templars-runtime';

// ---------------------------------------------------------------------------
// §21 Victory Evaluation（纯查询，不改状态）
// ---------------------------------------------------------------------------

export interface EvaluateDualBossVictoryParams {
  rule: DualBossVictoryRule | null;
  actorStates: TemplarActorState[];
}

/**
 * 评估 Dual Boss 胜利条件。
 *
 * 支持的 Rule：
 * - `all-listed-boss-actors-defeated`：列表中全部 Actor 被击败；
 * - `any-listed-boss-actor-defeated`：列表中任一 Actor 被击败；
 * - `custom`：需要 Resolver，未提供时不评估（不猜）。
 *
 * Rule 为 null（正式 Templars 当前即为此）→ satisfied = false + reason。
 */
export function evaluateDualBossVictory(
  params: EvaluateDualBossVictoryParams,
): DualBossVictoryEvaluation {
  const { rule, actorStates } = params;

  if (!rule) {
    return {
      satisfied: false,
      ruleType: null,
      remainingActorDefinitionIds: [],
      defeatedActorDefinitionIds: actorStates
        .filter((a) => !a.isAlive)
        .map((a) => a.actorDefinitionId),
      reason: 'Templars Victory Rule 缺失（正式卡面未确认），无法评估胜利条件',
    };
  }

  const required = rule.requiredActorDefinitionIds;
  if (required.length === 0) {
    return {
      satisfied: false,
      ruleType: rule.type,
      remainingActorDefinitionIds: [],
      defeatedActorDefinitionIds: [],
      reason: 'Victory Rule 未列出任何 Actor',
    };
  }

  const defeated: string[] = [];
  const remaining: string[] = [];
  for (const defId of required) {
    const actor = actorStates.find((a) => a.actorDefinitionId === defId);
    if (!actor) {
      remaining.push(defId);
      continue;
    }
    if (actor.isAlive) remaining.push(defId);
    else defeated.push(defId);
  }

  if (rule.type === 'custom') {
    return {
      satisfied: false,
      ruleType: 'custom',
      remainingActorDefinitionIds: remaining,
      defeatedActorDefinitionIds: defeated,
      reason: `custom Victory Rule（${rule.customResolverId ?? '未指定 Resolver'}）尚无实现，不做推测`,
    };
  }

  const satisfied =
    rule.type === 'all-listed-boss-actors-defeated'
      ? remaining.length === 0
      : defeated.length > 0;

  return {
    satisfied,
    ruleType: rule.type,
    remainingActorDefinitionIds: remaining,
    defeatedActorDefinitionIds: defeated,
    reason: null,
  };
}

/** 便捷入口：直接从 Encounter State 评估。 */
export function evaluateTemplarsVictory(state: TemplarsEncounterState): DualBossVictoryEvaluation {
  return evaluateDualBossVictory({
    rule: state.dualBossEncounterState.victoryRule,
    actorStates: state.actorStates,
  });
}

// ---------------------------------------------------------------------------
// §21 Guardian Victory
// ---------------------------------------------------------------------------

export interface ResolveTemplarsVictoryResult {
  ok: boolean;
  campaign: CampaignState;
  evaluation: DualBossVictoryEvaluation;
  xpAwarded: number;
  alreadyResolved: boolean;
  reason: string | null;
}

/**
 * Templars Encounter 胜利结算。
 *
 * 顺序：评估 Victory Rule → 标记 Encounter 完成 → 清理 Pit 占据者 →
 * 复用 Phase 10A 的 resolveGuardianVictory（3 XP + Final Hamlet）。
 *
 * 幂等键：`templars-encounter-victory:{battleId}`。
 */
export function resolveTemplarsEncounterVictory(
  campaign: CampaignState,
  options?: { now?: string },
): ResolveTemplarsVictoryResult {
  const actFour = campaign.actFourState;
  const state = actFour.templarsEncounterState;
  const emptyEvaluation: DualBossVictoryEvaluation = {
    satisfied: false,
    ruleType: null,
    remainingActorDefinitionIds: [],
    defeatedActorDefinitionIds: [],
    reason: 'Templars Encounter 尚未 Setup',
  };

  if (!state) {
    return {
      ok: false,
      campaign,
      evaluation: emptyEvaluation,
      xpAwarded: 0,
      alreadyResolved: false,
      reason: 'Templars Encounter 尚未 Setup',
    };
  }

  const transactionId = templarsTransactionIds.encounterVictory(state.battleId);
  const evaluation = evaluateTemplarsVictory(state);

  if (state.templarsBattleRuntime.victoryResolved || hasProcessedTemplarsTransaction(state, transactionId)) {
    return { ok: true, campaign, evaluation, xpAwarded: 0, alreadyResolved: true, reason: null };
  }

  if (!evaluation.satisfied) {
    return {
      ok: false,
      campaign,
      evaluation,
      xpAwarded: 0,
      alreadyResolved: false,
      reason: evaluation.reason ?? `仍有 ${evaluation.remainingActorDefinitionIds.length} 名 Templar 存活`,
    };
  }

  const now = options?.now ?? nowIso();

  let nextState: TemplarsEncounterState = {
    ...state,
    dualBossEncounterState: { ...state.dualBossEncounterState, resolvedVictory: true },
    templarsBattleRuntime: { ...state.templarsBattleRuntime, victoryResolved: true },
    // Battle End：清空 Pit 占据者，保留触发键与历史（§21 末尾）。
    spikedPitRuntime: clearRoomHazardsOnBattleEnd(state.spikedPitRuntime),
    heroPlacements: state.heroPlacements.map((p) => (p.pitId ? { ...p, pitId: null } : p)),
  };
  nextState = withProcessedTemplarsTransaction(nextState, transactionId);

  let staged: CampaignState = {
    ...campaign,
    actFourState: { ...actFour, templarsEncounterState: nextState },
    updatedAt: now,
  };
  staged = pushLog(staged, 'The Templars 双双倒下，Objective Room 归于寂静。', 'success');

  // ---- 复用 Phase 10A：3 XP + 进入 Final Hamlet ----
  const guardian = resolveGuardianVictory(staged, { now });
  if (!guardian.ok) {
    return {
      ok: false,
      campaign: staged,
      evaluation,
      xpAwarded: 0,
      alreadyResolved: false,
      reason: guardian.reason,
    };
  }

  return {
    ok: true,
    campaign: guardian.campaign,
    evaluation,
    xpAwarded: guardian.xpAwarded,
    alreadyResolved: guardian.alreadyResolved,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// §21 Guardian Failure（硬约束 13：Campaign Over）
// ---------------------------------------------------------------------------

export interface ResolveTemplarsFailureResult {
  campaign: CampaignState;
  alreadyFailed: boolean;
}

/**
 * 队伍全灭 → Guardian Quest 失败 → **Campaign Over**。
 * 复用 Phase 10A 的 resolveGuardianFailure，不另建战役失败流程。
 */
export function resolveTemplarsEncounterFailure(
  campaign: CampaignState,
  reason: string,
  options?: { now?: string },
): ResolveTemplarsFailureResult {
  const actFour = campaign.actFourState;
  const state = actFour.templarsEncounterState;

  const staged: CampaignState = state
    ? {
        ...campaign,
        actFourState: {
          ...actFour,
          templarsEncounterState: {
            ...state,
            spikedPitRuntime: clearRoomHazardsOnBattleEnd(state.spikedPitRuntime),
          },
        },
      }
    : campaign;

  const failed = resolveGuardianFailure(staged, `The Templars：${reason}`, options);
  return { campaign: failed.campaign, alreadyFailed: failed.alreadyFailed };
}

/** 队伍是否已全灭（Failure 判定入口）。 */
export function isPartyWipedInTemplarsEncounter(campaign: CampaignState): boolean {
  return campaign.heroes.length > 0 && campaign.heroes.every((h) => h.dead);
}
