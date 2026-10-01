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
import { commitBossFoundationVictory, settleBossThreatBattle } from './boss-foundation';
import { hasUnfinishedProductionBossQuest } from '../bosses/room-storage';
import { commitQuestFailureFromDefeat } from './quest';
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
import { advanceTurn, resumeTurnAfterMentalCheck } from '../battle';
import { settleProphetConsequences } from '../prophet/production-consequences';
import { advancePendingMonsterAttack, openBattleTurnStartWindow } from '../trinkets/battle-trinket-bridge';
import { settleOrdinaryRuinsBattle } from '../ruins/battle-runtime';
import { returnOrdinaryBoneFigures } from '../ruins/physical-supply';
import { runRuinsRoomTrigger } from '../ruins/room-runtime';
import { withRuinsCampaignSources } from '../ruins/printed-effect-runtime';
import { synchronizeOrdinaryThreatDeaths, endProductionOrdinaryThreat } from '../ruins/production-threat-runtime';
import { evaluateReplacementFlow } from '../stagecoach';
import { commitCommunityGuardianVictory, isCommunityGuardianBattle, synchronizeCommunityGuardianDeaths } from '../campaign/act-four/community-guardian-battle';

/** Mental Loop Guard 上限（防止 0 HP / 0 AP 死循环）。 */
export const BATTLE_MENTAL_GUARD_LIMIT = 50;

export type BattleSettlementError =
  | 'mental-guard-exceeded'
  | 'battle-not-active'
  | 'battle-not-victory'
  | 'battle-not-active-for-retreat'
  | 'boss-quest-cannot-retreat'
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
  if (campaign.battle?.ruinsContext?.executionSchemaVersion === 2 && campaign.battle.status === 'active'
    && !campaign.battle.ruinsContext.pendingChoice && !campaign.battle.ruinsContext.pendingReanimationChoice
    && !campaign.battle.pendingMonsterAttack && !campaign.battle.pendingAction && !campaign.battle.pendingMentalCheck
    && (!campaign.battle.activeActorId || campaign.battle.currentActionPoints === 0))
    campaign = { ...campaign, battle: advanceTurn(campaign.battle) };
  let result!: BattleSettlementResult;
  const next = withRuinsCampaignSources(synchronizeOrdinaryThreatDeaths(campaign), state => {
    result = settleBattleStateInternal(state, options);
    const binding = result.campaign.battle?.necromancerFigureBinding;
    return binding ? { ...result.campaign, ruinsBoneFigureSupply: binding.supply,
      ...(binding.draw ? { ruinsDrawState: binding.draw } : {}) } : result.campaign;
  });
  return { ...result, campaign: next };
}

function settleBattleStateInternal(
  campaign: CampaignState,
  options?: { mentalGuardLimit?: number },
): BattleSettlementResult {
  if (campaign.battle?.ruinsContext?.pendingReanimationChoice) return { ok: true, campaign, error: null, mentalLoops: 0 };
  if (campaign.battle?.bossEncounter?.pendingChoice) return { ok: true, campaign, error: null, mentalLoops: 0 };
  if (!campaign.battle || campaign.battle.status !== 'active') {
    return { ok: false, campaign, error: 'battle-not-active', mentalLoops: 0 };
  }

  const limit = options?.mentalGuardLimit ?? BATTLE_MENTAL_GUARD_LIMIT;

  let next: CampaignState = synchronizeCommunityGuardianDeaths(campaign);
  next = advancePendingMonsterAttack(next);
  next = synchronizeOrdinaryThreatDeaths(next);
  if (next.battle?.ruinsContext?.pendingReanimationChoice) return { ok: true, campaign: next, error: null, mentalLoops: 0 };
  if (next.battle?.pendingMonsterAttack) {
    return { ok: true, campaign: next, error: null, mentalLoops: 0 };
  }
  const consequences=settleSharedBattleConsequences(next,limit);
  if(!consequences.ok)return consequences;
  next=openBattleTurnStartWindow(consequences.campaign);
  if (next.battle?.necromancerFigureBinding) next = { ...next, ruinsBoneFigureSupply: next.battle.necromancerFigureBinding.supply };
  return {...consequences,campaign:next};
}

/** The existing shared consequence pipeline is also the Prophet replay executor. */
export function settleSharedBattleConsequences(campaign:CampaignState,limit=BATTLE_MENTAL_GUARD_LIMIT):BattleSettlementResult {
  if(campaign.battle?.bossEncounter?.checkpointContext?.playerRouteVersion){
    const replayed=settleProphetConsequences(campaign,limit);
    if(replayed)return replayed;
  }
  let next=campaign;
  next = processBattleDeaths(next);
  if (next.battle?.ruinsContext?.executionSchemaVersion === 2 && next.battle.status === 'active'
    && !next.battle.activeActorId && !next.battle.ruinsContext.pendingChoice && !next.battle.ruinsContext.pendingReanimationChoice)
    next = { ...next, battle: advanceTurn(next.battle) };
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
    next = synchronizeOrdinaryThreatDeaths(next);
    if (next.battle?.ruinsContext?.pendingReanimationChoice) break;
  }

  if (guard >= limit && next.battle?.pendingMentalCheck) {
    return { ok: false, campaign: next, error: 'mental-guard-exceeded', mentalLoops: guard };
  }

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
  campaign = synchronizeOrdinaryThreatDeaths(campaign);
  if (campaign.battle?.bossEncounter) {
    if (campaign.battle.status !== 'victory') return { ok: false, campaign, error: 'battle-not-victory', mentalLoops: 0 };
    if (campaign.battle.bossEncounter.side === 'THREAT') return { ok: true, campaign: settleBossThreatBattle(campaign), error: null, mentalLoops: 0 };
    return { ok: true, campaign: commitBossFoundationVictory(campaign), error: null, mentalLoops: 0 };
  }
  if (isCommunityGuardianBattle(campaign)) {
    const result = commitCommunityGuardianVictory(campaign);
    return { ok: result.ok, campaign: result.campaign, error: result.ok ? null : 'battle-not-victory', mentalLoops: 0 };
  }
  if (!campaign.battle || campaign.battle.status !== 'victory') {
    return { ok: false, campaign, error: 'battle-not-victory', mentalLoops: 0 };
  }
  const ordinaryRuins = campaign.battle.ruinsContext;
  if (ordinaryRuins) campaign = synchronizeOrdinaryThreatDeaths(settleOrdinaryEndEffects(campaign));
  if (campaign.battle?.status !== 'victory' || campaign.battle.ruinsContext?.pendingReanimationChoice)
    return { ok: false, campaign, error: 'battle-not-victory', mentalLoops: 0 };
  const returnedDraw = ordinaryRuins && campaign.ruinsDrawState
    ? settleOrdinaryRuinsBattle(campaign.ruinsDrawState, campaign.battle!) : null;
  const returnedFigures = ordinaryRuins && campaign.ruinsBoneFigureSupply
    ? returnOrdinaryBoneFigures(campaign.ruinsBoneFigureSupply, ordinaryRuins.encounterId) : null;
  if (returnedDraw && returnedFigures) campaign = endProductionOrdinaryThreat({ ...campaign,
    ruinsDrawState: returnedDraw, ruinsBoneFigureSupply: returnedFigures });
  let next = engineResolveVictory(campaign);
  if (ordinaryRuins && (!returnedDraw || !returnedFigures)) throw new Error('Ordinary Ruins physical settlement unavailable');
  if (returnedDraw && returnedFigures && ordinaryRuins?.executionSchemaVersion !== 2) next = { ...next, ruinsDrawState: returnedDraw,
    ruinsBoneFigureSupply: returnedFigures };
  next = evaluateReplacementFlow(next);
  return { ok: true, campaign: next, error: null, mentalLoops: 0 };
}

// ---------------------------------------------------------------------------
// 3. commitBattleRetreat（§15）
// ---------------------------------------------------------------------------

/**
 * 战斗撤退正式入口：settleBattleState → retreatFromBattle。
 * Production ABILITY encounters reject voluntary retreat here. A defeated Boss
 * encounter follows the Quest failure transaction; ordinary battle handling stays below.
 */
export function commitBattleRetreat(campaign: CampaignState): BattleSettlementResult {
  campaign = synchronizeOrdinaryThreatDeaths(campaign);
  if (!campaign.battle) {
    return { ok: false, campaign, error: 'battle-not-active-for-retreat', mentalLoops: 0 };
  }
  if (hasUnfinishedProductionBossQuest(campaign) && campaign.battle.bossEncounter?.side === 'ABILITY') {
    if (campaign.battle.status !== 'defeat') return { ok: false, campaign, error: 'boss-quest-cannot-retreat', mentalLoops: 0 };
    const failed = commitQuestFailureFromDefeat(campaign);
    return { ok: failed.ok, campaign: failed.campaign, error: failed.ok ? null : 'battle-settlement-failed', mentalLoops: 0 };
  }
  // The round-limit pipeline has already committed `defeat` before the UI exposes
  // "Retreat to dungeon". Do not send that terminal state through the active-only
  // settlement guard again or the visible button becomes a no-op.
  const settled = campaign.battle.status === 'defeat'
    ? { ok: true as const, campaign, error: null, mentalLoops: 0 }
    : settleBattleState(campaign);
  if (!settled.ok) return settled;
  if (settled.campaign.battle?.ruinsContext?.pendingReanimationChoice || settled.campaign.battle?.ruinsContext?.pendingThreatDeathIds?.length)
    return { ok: false, campaign: settled.campaign, error: 'battle-settlement-failed', mentalLoops: settled.mentalLoops };
  let ended = settled.campaign.battle?.ruinsContext
    ? synchronizeOrdinaryThreatDeaths(settleOrdinaryEndEffects(settled.campaign)) : settled.campaign;
  if (ended.battle?.ruinsContext?.pendingReanimationChoice || ended.battle?.ruinsContext?.pendingThreatDeathIds?.length)
    return { ok: false, campaign: ended, error: 'battle-settlement-failed', mentalLoops: settled.mentalLoops };
  const ordinary = ended.battle?.ruinsContext;
  const returnedDraw = ordinary && ended.ruinsDrawState ? settleOrdinaryRuinsBattle(ended.ruinsDrawState,
    { ...ended.battle!, status: 'defeat' }) : null;
  const returnedFigures = ordinary && ended.ruinsBoneFigureSupply
    ? returnOrdinaryBoneFigures(ended.ruinsBoneFigureSupply, ordinary.encounterId) : null;
  if (returnedDraw && returnedFigures) ended = endProductionOrdinaryThreat({ ...ended,
    ruinsDrawState: returnedDraw, ruinsBoneFigureSupply: returnedFigures });
  let next = retreatFromBattle(ended);
  if (returnedDraw && returnedFigures && ordinary?.executionSchemaVersion !== 2) next = { ...next,
    ruinsDrawState: returnedDraw, ruinsBoneFigureSupply: returnedFigures };
  return { ok: true, campaign: next, error: null, mentalLoops: settled.mentalLoops };
}

function settleOrdinaryEndEffects(campaign: CampaignState): CampaignState {
  const battle = campaign.battle!;
  if (battle.pendingMonsterAttack || battle.pendingAction || battle.ruinsContext!.pendingChoice)
    throw new Error('Ordinary Battle end has unresolved choice or reaction');
  return withRuinsCampaignSources(campaign, state => {
    let next = { ...state, battle: state.battle!.activeActorId
      ? runRuinsRoomTrigger(state.battle!, 'END_TURN', state.battle!.activeActorId!) : state.battle };
    next = processBattleDeaths(next);
    next = processBattleStressEvents(next);
    next = processBattleRuleEvents(next);
    next = processBattleDiseaseInfections(next);
    return processBattleDeaths(next);
  });
}

// Re-export helpers used by commands/dungeon.ts to keep a single import surface.
// (no extra re-exports needed)
