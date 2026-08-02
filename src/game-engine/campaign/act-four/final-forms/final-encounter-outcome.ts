// Phase 10E：Final Encounter 终局收口（Heart 死亡 → Campaign Victory / Final Failure → Campaign Over）。
//
// 硬约束对照（本模块是这三条的唯一执行点）：
// - 硬约束 5：Heart of Darkness 不可跳过 —— 任何绕开 Heart 的胜利路径都要被拒绝；
// - 硬约束 26：Final Encounter 失败 → Campaign Over，复用既有 failFinalEncounter，
//   **不**另建一套战役失败流程；
// - 硬约束 27：Heart of Darkness 死亡 → Campaign Victory，复用 Phase 10A 的
//   defeatFinalForm + resolveCampaignVictory 链路，不新增 GamePhase。
//
// 实现要点：
// - evaluate* 是纯函数，UI / 引擎 / E2E 共用同一份结论，避免各处重复判定；
// - resolve* 全部幂等：Heart 已结算过再调一次返回 alreadyResolved，不重复发奖励；
// - 队伍全灭的判定与三个 Guardian Boss 域保持同构（heroes 非空且全部 dead）。

import type { CampaignState } from '../../../../types';
import type { FinalEncounterState, FinalFormId } from '../../../../types/final-encounter';
import { UNSKIPPABLE_FINAL_FORM_ID } from '../../../../data/darkest-dungeon/final-form-registry';
import {
  areAllFinalFormsDefeated,
  defeatFinalForm,
  failFinalEncounter,
} from '../final-form-sequence';
import { resolveCampaignVictory } from '../resolve-campaign-victory';

// ---------------------------------------------------------------------------
// 评估（纯函数）
// ---------------------------------------------------------------------------

export type FinalEncounterOutcome = 'victory' | 'failure' | 'ongoing';

export interface FinalEncounterOutcomeEvaluation {
  outcome: FinalEncounterOutcome;
  /** 已击败的 Form。 */
  defeatedFormIds: FinalFormId[];
  /** 尚未击败的 Form（含当前出场者）。 */
  remainingFormIds: FinalFormId[];
  /** Heart of Darkness 是否已被击败（硬约束 5 的唯一胜利条件）。 */
  heartDefeated: boolean;
  /** 队伍是否已全灭。 */
  partyWiped: boolean;
  reason: string | null;
}

/** 队伍是否已全灭（与三个 Guardian Boss 域同构）。 */
export function isPartyWipedInFinalEncounter(campaign: CampaignState): boolean {
  return campaign.heroes.length > 0 && campaign.heroes.every((h) => h.dead);
}

/**
 * 评估 Final Encounter 的终局状态。
 *
 * 优先级：失败 > 胜利 > 进行中 —— 队伍全灭时即便 Heart 同回合倒下也判失败，
 * 这与「Guardian Quest 全灭即失败」的既有裁决一致，不为 Final Encounter 另开例外。
 */
export function evaluateFinalEncounterOutcome(
  campaign: CampaignState,
): FinalEncounterOutcomeEvaluation {
  const encounter: FinalEncounterState | null = campaign.actFourState.finalEncounterState;
  const partyWiped = isPartyWipedInFinalEncounter(campaign);

  if (!encounter) {
    return {
      outcome: 'ongoing',
      defeatedFormIds: [],
      remainingFormIds: [],
      heartDefeated: false,
      partyWiped,
      reason: 'Final Encounter 尚未开始',
    };
  }

  const defeatedFormIds = encounter.defeatedFormIds;
  const remainingFormIds = encounter.orderedFormIds.filter((id) => !defeatedFormIds.includes(id));
  const heartDefeated = defeatedFormIds.includes(UNSKIPPABLE_FINAL_FORM_ID);

  if (partyWiped) {
    return {
      outcome: 'failure',
      defeatedFormIds,
      remainingFormIds,
      heartDefeated,
      partyWiped,
      reason: '队伍全灭',
    };
  }

  // 硬约束 5：只有 Heart of Darkness 倒下才算胜利。
  // areAllFinalFormsDefeated 是补充条件——防止「Heart 被记为击败但顺序里还有残余 Form」。
  if (heartDefeated && areAllFinalFormsDefeated(campaign.actFourState)) {
    return {
      outcome: 'victory',
      defeatedFormIds,
      remainingFormIds,
      heartDefeated,
      partyWiped,
      reason: null,
    };
  }

  return {
    outcome: 'ongoing',
    defeatedFormIds,
    remainingFormIds,
    heartDefeated,
    partyWiped,
    reason: heartDefeated
      ? `Heart 已倒下但仍有 ${remainingFormIds.length} 个 Form 未结算`
      : `Heart of Darkness 仍存活（剩余 ${remainingFormIds.length} 个 Form）`,
  };
}

// ---------------------------------------------------------------------------
// Heart of Darkness 死亡 → Campaign Victory
// ---------------------------------------------------------------------------

export interface ResolveHeartOfDarknessDefeatResult {
  ok: boolean;
  campaign: CampaignState;
  evaluation: FinalEncounterOutcomeEvaluation;
  /** 战役胜利是否已结算（含幂等命中）。 */
  campaignVictoryResolved: boolean;
  alreadyResolved: boolean;
  reason: string | null;
}

/**
 * Heart of Darkness 被击败 → 直接收口为战役胜利。
 *
 * 内部两步都是既有入口，本函数只负责串联与幂等：
 * 1. defeatFinalForm('heart-of-darkness')：写 defeatedFormIds + status = 'victory'；
 * 2. resolveCampaignVictory()：写 stage = 'campaign-victory' + gamePhase = 'campaign-over'。
 *
 * 之所以不把这两步合并进 defeatFinalForm，是因为 Phase 10A 的分步设计允许
 * 「Heart 倒下」与「战役结算」之间刷新恢复，本函数保持同样的可恢复性。
 */
export function resolveHeartOfDarknessDefeat(
  campaign: CampaignState,
  options?: { now?: string },
): ResolveHeartOfDarknessDefeatResult {
  const encounter = campaign.actFourState.finalEncounterState;
  const evalBefore = evaluateFinalEncounterOutcome(campaign);

  if (!encounter) {
    return {
      ok: false,
      campaign,
      evaluation: evalBefore,
      campaignVictoryResolved: false,
      alreadyResolved: false,
      reason: 'Final Encounter 尚未开始',
    };
  }

  // 已经是胜利终局 → 幂等返回，绝不重复结算。
  if (campaign.actFourState.stage === 'campaign-victory') {
    return {
      ok: true,
      campaign,
      evaluation: evalBefore,
      campaignVictoryResolved: true,
      alreadyResolved: true,
      reason: null,
    };
  }
  if (evalBefore.partyWiped) {
    return {
      ok: false,
      campaign,
      evaluation: evalBefore,
      campaignVictoryResolved: false,
      alreadyResolved: false,
      reason: '队伍已全灭，不能结算胜利',
    };
  }

  // 硬约束 5：Heart 必须是本局最后一个 Form，且必须实际出场过。
  const order = encounter.orderedFormIds;
  if (order[order.length - 1] !== UNSKIPPABLE_FINAL_FORM_ID) {
    return {
      ok: false,
      campaign,
      evaluation: evalBefore,
      campaignVictoryResolved: false,
      alreadyResolved: false,
      reason: 'Form 顺序异常：Heart of Darkness 必须是最后一个',
    };
  }

  // 1. 标记 Heart 被击败（幂等由 defeatFinalForm 自己负责）。
  let next = campaign;
  if (!encounter.defeatedFormIds.includes(UNSKIPPABLE_FINAL_FORM_ID)) {
    const defeat = defeatFinalForm(campaign, UNSKIPPABLE_FINAL_FORM_ID, options);
    if (!defeat.ok) {
      return {
        ok: false,
        campaign,
        evaluation: evalBefore,
        campaignVictoryResolved: false,
        alreadyResolved: false,
        reason: defeat.reason,
      };
    }
    next = defeat.campaign;
  }

  // 2. 结算战役胜利。
  const victory = resolveCampaignVictory(next, options);
  if (!victory.ok) {
    return {
      ok: false,
      campaign: next,
      evaluation: evaluateFinalEncounterOutcome(next),
      campaignVictoryResolved: false,
      alreadyResolved: false,
      reason: victory.reason,
    };
  }

  return {
    ok: true,
    campaign: victory.campaign,
    evaluation: evaluateFinalEncounterOutcome(victory.campaign),
    campaignVictoryResolved: true,
    alreadyResolved: victory.alreadyResolved,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Final Failure → Campaign Over
// ---------------------------------------------------------------------------

export interface ResolveFinalEncounterFailureResult {
  campaign: CampaignState;
  evaluation: FinalEncounterOutcomeEvaluation;
  alreadyFailed: boolean;
}

/**
 * Final Encounter 失败 → Campaign Over（硬约束 26）。
 * 复用 Phase 10A 的 failFinalEncounter，本函数只补一层评估结果给 UI / E2E。
 */
export function resolveFinalEncounterFailure(
  campaign: CampaignState,
  reason: string,
  options?: { now?: string },
): ResolveFinalEncounterFailureResult {
  const failed = failFinalEncounter(campaign, reason, options);
  return {
    campaign: failed.campaign,
    evaluation: evaluateFinalEncounterOutcome(failed.campaign),
    alreadyFailed: failed.alreadyFailed,
  };
}

/**
 * 每次战斗结算后调用的自动收口：
 * - 队伍全灭 → Campaign Over；
 * - Heart 已倒下且全部 Form 结算完毕 → Campaign Victory；
 * - 其余情况原样返回（包括「非 Heart 的 Form 倒下」——那是 Form Transition 的职责）。
 */
export function settleFinalEncounterIfNeeded(
  campaign: CampaignState,
  options?: { now?: string },
): { campaign: CampaignState; outcome: FinalEncounterOutcome; changed: boolean } {
  const evaluation = evaluateFinalEncounterOutcome(campaign);
  if (evaluation.outcome === 'failure') {
    if (campaign.gamePhase === 'campaign-over') {
      return { campaign, outcome: 'failure', changed: false };
    }
    const failed = resolveFinalEncounterFailure(
      campaign,
      evaluation.reason ?? '队伍全灭',
      options,
    );
    return { campaign: failed.campaign, outcome: 'failure', changed: !failed.alreadyFailed };
  }
  if (evaluation.outcome === 'victory') {
    if (campaign.actFourState.stage === 'campaign-victory') {
      return { campaign, outcome: 'victory', changed: false };
    }
    const victory = resolveHeartOfDarknessDefeat(campaign, options);
    return {
      campaign: victory.campaign,
      outcome: victory.ok ? 'victory' : 'ongoing',
      changed: victory.ok && !victory.alreadyResolved,
    };
  }
  return { campaign, outcome: 'ongoing', changed: false };
}
