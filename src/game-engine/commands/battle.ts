// Phase 11A.2 §13–§15 — Battle Production Commands。
//
// 三个职责：
//   - settleBattleState（统一战斗结算流水线；§13）
//   - commitBattleVictory（§15）
//   - commitBattleRetreat（§15）
//
// Store 与 Simulation Driver 必须调用同一份；headless-shim 中的
// settleBattleHeadless / shimResolveVictory / shimRetreat 必须删除。
import type { CampaignState } from '../../types';
import { resolveVictory as engineResolveVictory } from '../battle';
import { retreatFromBattle } from '../dungeon';
import { resolveTurnStartMentalEffect, processBattleStressEvents } from '../mental-effects';
import {
  processBattleDeaths,
} from '../hero-death';
import {
  processBattleRuleEvents,
  processBattleDiseaseInfections,
} from '../diseases/battle-bridge';
import { resumeTurnAfterMentalCheck } from '../battle';
import { openBattleTurnStartWindow } from '../trinkets/battle-trinket-bridge';
import { evaluateReplacementFlow } from '../stagecoach';

/** Mental Loop Guard 上限（防止 0 HP / 0 AP 死循环）。 */
export const BATTLE_MENTAL_GUARD_LIMIT = 50;

export type BattleSettlementError =
  | 'mental-guard-exceeded'
  | 'battle-not-active'
  | 'battle-not-victory'
  | 'battle-not-active-for-retreat'
  | 'battle-settlement-failed';

export interface BattleSettlementResult {
  ok: boolean;
  campaign: CampaignState;
  error: BattleSettlementError | null;
  mentalLoops: number;
}

// ---------------------------------------------------------------------------
// 1. settleBattleState（§13 统一战斗结算流水线）
// ---------------------------------------------------------------------------

/**
 * 真实顺序（与 dev doc §13 / 原 Store settleBattle 严格一致）：
 *   1. processBattleDeaths
 *   2. processBattleStressEvents
 *   3. processBattleRuleEvents
 *   4. processBattleDiseaseInfections
 *   5. processBattleDeaths
 *   6. pendingMentalCheck 循环
 *      - resolveTurnStartMentalEffect
 *      - processBattleDeaths / processBattleStressEvents
 *      - resumeTurnAfterMentalCheck
 *      - processBattleDeaths / processBattleStressEvents / processBattleRuleEvents / processBattleDiseaseInfections
 *   7. openBattleTurnStartWindow
 *
 * Mental Loop 超过上限时返回 `ok: false, error: 'mental-guard-exceeded'`，
 * 不静默继续（dev doc §13 硬约束）。
 */
export function settleBattleState(
  campaign: CampaignState,
  options?: { mentalGuardLimit?: number },
): BattleSettlementResult {
  if (!campaign.battle || campaign.battle.status !== 'active') {
    return { ok: false, campaign, error: 'battle-not-active', mentalLoops: 0 };
  }

  const limit = options?.mentalGuardLimit ?? BATTLE_MENTAL_GUARD_LIMIT;

  let next: CampaignState = campaign;
  next = processBattleDeaths(next);
  next = processBattleStressEvents(next);
  next = processBattleRuleEvents(next);
  next = processBattleDiseaseInfections(next);
  next = processBattleDeaths(next);

  let guard = 0;
  while (
    next.battle &&
    next.battle.status === 'active' &&
    next.battle.pendingMentalCheck &&
    guard < limit
  ) {
    guard += 1;
    next = resolveTurnStartMentalEffect(next).campaign;
    next = processBattleDeaths(next);
    next = processBattleStressEvents(next);
    if (!next.battle) break;
    next = { ...next, battle: resumeTurnAfterMentalCheck(next.battle) };
    next = processBattleDeaths(next);
    next = processBattleStressEvents(next);
    next = processBattleRuleEvents(next);
    next = processBattleDiseaseInfections(next);
  }

  if (guard >= limit && next.battle?.pendingMentalCheck) {
    return { ok: false, campaign: next, error: 'mental-guard-exceeded', mentalLoops: guard };
  }

  next = openBattleTurnStartWindow(next);
  return { ok: true, campaign: next, error: null, mentalLoops: guard };
}

// ---------------------------------------------------------------------------
// 2. commitBattleVictory（§15）
// ---------------------------------------------------------------------------

/**
 * 战斗胜利正式入口：engineResolveVictory → evaluateReplacementFlow。
 * 不在 UI 自行组合。
 *
 * 为什么不先 settleBattleState？
 *   §13：settleBattleState 有 'active' 守卫（dev doc §13 硬约束），不能在 status='victory' 终态调用。
 *   进入此函数时 battle 已经是 'victory'——意味着 autoPlayBattle 内的最后一次
 *   settleBattleState 已完成 death/stress/rule/disease/mental 全部 effects 结算。
 *   这里只需走 victory 推进 + Replacement 流程。
 *
 * 旧 Shim 调用 settleBattleHeadless(c) 的行为属于「不必要但合法」的重复结算（settleHeadless
 *   没有 active 守卫），production 删掉这一步既不丢 effects，也不重复工作。
 */
export function commitBattleVictory(campaign: CampaignState): BattleSettlementResult {
  if (!campaign.battle || campaign.battle.status !== 'victory') {
    return { ok: false, campaign, error: 'battle-not-victory', mentalLoops: 0 };
  }
  let next = engineResolveVictory(campaign);
  next = evaluateReplacementFlow(next);
  return { ok: true, campaign: next, error: null, mentalLoops: 0 };
}

// ---------------------------------------------------------------------------
// 3. commitBattleRetreat（§15）
// ---------------------------------------------------------------------------

/**
 * 战斗撤退正式入口：settleBattleState → retreatFromBattle。
 * Boss 不可撤退由 retreatFromBattle 内部守卫（face-the-threat 仍调用此函数，
 * 但 retreatFromBattle 必须拒绝；具体行为由 dungeon.ts 决定）。
 */
export function commitBattleRetreat(campaign: CampaignState): BattleSettlementResult {
  if (!campaign.battle) {
    return { ok: false, campaign, error: 'battle-not-active-for-retreat', mentalLoops: 0 };
  }
  const settled = settleBattleState(campaign);
  if (!settled.ok) return settled;
  const next = retreatFromBattle(settled.campaign);
  return { ok: true, campaign: next, error: null, mentalLoops: settled.mentalLoops };
}

// Re-export helpers used by commands/dungeon.ts to keep a single import surface.
// (no extra re-exports needed)
