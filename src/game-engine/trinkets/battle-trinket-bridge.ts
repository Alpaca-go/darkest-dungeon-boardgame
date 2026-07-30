// Phase 8C：Trinket 与战斗/地牢流程的桥接（开发文档 §11 / §12）。
//
// before-attack-roll 流程（核心约束 2：UI 不产生随机数）：
//   1. beginHeroSkillAction：先校验动作合法（heroSkillActionError），
//      再为出手英雄打开 before-attack-roll 窗口；
//      - 有机会 → 把意图冻结为 battle.pendingAction，流程暂停等待玩家；
//      - 无机会 → 立即执行 heroUseSkill（零加成）。
//   2. resolveTrinketOpportunity：玩家逐条「使用 / 跳过」；
//      使用产生的 accuracy/crit/damage 修正累加进 pendingAction；
//   3. 该事件的机会全部结清后自动恢复执行冻结动作并清空 pendingAction。
//
// 其余接线窗口：
//   - hero-turn-start：英雄回合开始（settleBattle 后由 store 调用，幂等）；
//   - room-entered：进入房间后为全体存活英雄开窗（战斗房间除外）。

import type { CampaignState, PendingBattleAction } from '../../types';
import { heroSkillActionError, heroUseSkill } from '../battle';
import type { TrinketActionBonuses } from '../battle';
import { openTrinketWindow, openOpportunities, findOpportunity } from './trinket-opportunities';
import { useTrinket, declineTrinketUse, sumModifiers } from './use-trinket';
import { findHero } from './trinket-state';

// ---------------------------------------------------------------------------
// before-attack-roll：冻结与恢复
// ---------------------------------------------------------------------------

export interface BeginHeroSkillActionResult {
  campaign: CampaignState;
  /** 非 null 表示动作非法，未产生任何变化。 */
  error: string | null;
  /** true = 已冻结等待玩家决策；false = 已直接执行完毕。 */
  paused: boolean;
}

/** 当前战斗出手单位对应的 Campaign 英雄 instanceId（找不到返回 null）。 */
export function heroInstanceIdForUnit(campaign: CampaignState, unitId: string): string | null {
  const unit = campaign.battle?.heroes.find((u) => u.id === unitId);
  return unit?.sourceId ?? null;
}

/**
 * 声明英雄技能动作：合法性校验 → 开 before-attack-roll 窗口 →
 * 有机会则冻结 PendingBattleAction，否则立即执行。
 */
export function beginHeroSkillAction(
  campaign: CampaignState,
  skillId: string,
  targetId: string
): BeginHeroSkillActionResult {
  const battle = campaign.battle;
  if (!battle || battle.status !== 'active' || !battle.activeActorId) {
    return { campaign, error: '当前没有进行中的战斗回合。', paused: false };
  }
  if (battle.pendingAction) {
    return { campaign, error: '还有未结清的饰品决策，不能声明新动作。', paused: false };
  }
  const actorUnitId = battle.activeActorId;
  const err = heroSkillActionError(battle, actorUnitId, skillId, targetId);
  if (err) return { campaign, error: err, paused: false };

  const heroId = heroInstanceIdForUnit(campaign, actorUnitId);
  const hero = heroId ? findHero(campaign, heroId) : undefined;

  // 开窗（英雄未找到或无可用 Trinket 时 hasOpportunity=false，直接执行）
  let next = campaign;
  let hasOpportunity = false;
  if (hero) {
    const eventId = `atk:${battle.battleId}:r${battle.round}:i${battle.initiativeIndex}:${actorUnitId}:ap${battle.currentActionPoints}`;
    const opened = openTrinketWindow(next, {
      window: 'before-attack-roll',
      heroId: hero.instanceId,
      eventId,
    });
    next = opened.campaign;
    hasOpportunity = opened.hasOpportunity;
  }

  if (hasOpportunity) {
    const pendingAction: PendingBattleAction = {
      kind: 'hero-skill',
      actorUnitId,
      skillId,
      targetId,
      accuracyBonus: 0,
      critBonus: 0,
      damageBonus: 0,
    };
    return {
      campaign: { ...next, battle: { ...next.battle!, pendingAction } },
      error: null,
      paused: true,
    };
  }

  // 无机会 → 直接执行（零加成）
  const resolved = heroUseSkill(next.battle!, actorUnitId, skillId, targetId);
  return { campaign: { ...next, battle: resolved }, error: null, paused: false };
}

/** 执行冻结动作并清空 pendingAction（内部；机会结清后调用）。 */
function resumePendingAction(campaign: CampaignState): CampaignState {
  const battle = campaign.battle;
  const pa = battle?.pendingAction;
  if (!battle || !pa) return campaign;
  const bonuses: TrinketActionBonuses = {
    accuracy: pa.accuracyBonus,
    crit: pa.critBonus,
    damage: pa.damageBonus,
  };
  const resolved = heroUseSkill(battle, pa.actorUnitId, pa.skillId, pa.targetId, bonuses);
  return { ...campaign, battle: { ...resolved, pendingAction: null } };
}

export interface ResolveOpportunityResult {
  campaign: CampaignState;
  error: string | null;
  /** true = 本次决策后冻结动作已恢复执行。 */
  resumed: boolean;
}

/**
 * 玩家对一条使用机会做出决策（使用 / 跳过）。
 * - 使用：走 useTrinket 完整链路（效果结算 → 翻面 → 记录），
 *   before-attack-roll 的修正器累加进 pendingAction；
 * - 跳过：仅移除该机会；
 * - 全部机会结清且存在冻结动作时，自动恢复执行。
 */
export function resolveTrinketOpportunity(
  campaign: CampaignState,
  opportunityId: string,
  action: 'use' | 'decline'
): ResolveOpportunityResult {
  const opp = findOpportunity(campaign, opportunityId);
  if (!opp) return { campaign, error: '使用机会不存在。', resumed: false };

  let next = campaign;
  if (action === 'use') {
    const res = useTrinket(next, opportunityId);
    if (res.error) return { campaign, error: res.error, resumed: false };
    next = res.campaign;
    // before-attack-roll 修正注入冻结动作
    if (opp.useWindow === 'before-attack-roll' && next.battle?.pendingAction) {
      const pa = next.battle.pendingAction;
      next = {
        ...next,
        battle: {
          ...next.battle,
          pendingAction: {
            ...pa,
            accuracyBonus: pa.accuracyBonus + sumModifiers(res.appliedModifiers, 'accuracy'),
            critBonus: pa.critBonus + sumModifiers(res.appliedModifiers, 'crit'),
            damageBonus: pa.damageBonus + sumModifiers(res.appliedModifiers, 'damage'),
          },
        },
      };
    }
  } else {
    next = declineTrinketUse(next, opportunityId);
    if (next === campaign) return { campaign, error: '该使用机会已关闭。', resumed: false };
  }

  // 机会全部结清 → 恢复冻结动作
  if (next.battle?.pendingAction && openOpportunities(next).length === 0) {
    next = resumePendingAction(next);
    return { campaign: next, error: null, resumed: true };
  }
  return { campaign: next, error: null, resumed: false };
}

// ---------------------------------------------------------------------------
// hero-turn-start / room-entered 开窗
// ---------------------------------------------------------------------------

/**
 * 为当前出手英雄打开 hero-turn-start 窗口（幂等；每次战斗推进后调用即可）。
 * 精神检定暂停 / 冻结动作存在时不开窗，避免决策叠加。
 */
export function openBattleTurnStartWindow(campaign: CampaignState): CampaignState {
  const battle = campaign.battle;
  if (!battle || battle.status !== 'active' || !battle.activeActorId) return campaign;
  if (battle.pendingMentalCheck || battle.pendingAction) return campaign;
  const heroId = heroInstanceIdForUnit(campaign, battle.activeActorId);
  if (!heroId) return campaign; // 敌方回合
  const eventId = `hts:${battle.battleId}:r${battle.round}:i${battle.initiativeIndex}:${battle.activeActorId}`;
  return openTrinketWindow(campaign, {
    window: 'hero-turn-start',
    heroId,
    eventId,
  }).campaign;
}

/** 进入房间后为全体存活英雄打开 room-entered 窗口（幂等；战斗中不开）。 */
export function openRoomEnteredWindows(campaign: CampaignState, roomId: string): CampaignState {
  if (campaign.battle) return campaign; // 战斗房间：进战斗后不再叠加探索窗口
  let next = campaign;
  for (const h of campaign.heroes) {
    if (!h.isAlive || h.dead) continue;
    next = openTrinketWindow(next, {
      window: 'room-entered',
      heroId: h.instanceId,
      eventId: `room:${campaign.currentQuestId ?? 'none'}:${roomId}:${h.instanceId}`,
    }).campaign;
  }
  return next;
}
