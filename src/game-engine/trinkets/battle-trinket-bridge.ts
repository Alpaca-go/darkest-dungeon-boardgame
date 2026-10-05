import { withBossEncounterSources } from '../bosses/foundation';
import { applyBossRuntimeInput } from '../bosses/foundation';
import { withRuinsRandom } from '../ruins/printed-effect-runtime';
import { resolveDungeonTrinketOpportunity } from './dungeon-trinket-bridge';
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
import {
  advanceTurn,
  commitPendingMonsterAttackResolution,
  commitHeroAttackResolution,
  freezePendingMonsterAttack,
  heroSkillActionError,
  heroUseSkill,
  prepareHeroAttackResolution,
} from '../battle';
import { rollAttackDie } from '../combat-resolution';
import { getSkillById } from '../../data/skills';
import type { TrinketActionBonuses } from '../battle';
import { openTrinketWindow, openOpportunities, findOpportunity } from './trinket-opportunities';
import { useTrinket, declineTrinketUse, sumModifiers } from './use-trinket';
import { findHero } from './trinket-state';
import { synchronizeCommunityGuardianDeaths } from '../campaign/act-four/community-guardian-battle';
import { beginHealingTrinketAction, resolveHealingTrinketOpportunity } from './healing-trinket-bridge';
import { resolveDiseaseTrinketOpportunity } from './disease-trinket-bridge';
import { withProductionMonsterSources, finishProductionMonsterAttack } from '../monsters/production-battle-runtime';

function hasOpenForRoot(campaign: CampaignState, rootEventId: string): boolean {
  return openOpportunities(campaign).some((entry) => entry.rootEventId === rootEventId);
}

/**
 * Open or resume the two source-distinct defensive windows. Every random fact
 * needed after a window is persisted on pendingMonsterAttack before control is
 * returned to the UI.
 */
export function advancePendingMonsterAttack(campaign: CampaignState, sourceScope = false, playerContinue = false): CampaignState {
  if (!sourceScope && campaign.battle?.productionMonsterContext) {
    let result = campaign;
    const battle = withProductionMonsterSources(structuredClone(campaign.battle), b => {
      result = advancePendingMonsterAttack({ ...campaign, battle: b }, true, playerContinue); return result.battle!;
    });
    return { ...result, battle };
  }
  if((campaign.battle?.bossEncounter?.checkpointContext?.playerRouteVersion || campaign.battle?.productionMonsterContext?.playerRouteVersion) && campaign.battle.pendingMonsterAttack && !playerContinue)return campaign;
  if (!sourceScope && campaign.battle?.pendingMonsterAttack?.sourceAttack) {
    let result = campaign;
    const battle = withBossEncounterSources(structuredClone(campaign.battle), b=> {
      result = advancePendingMonsterAttack({ ...campaign,battle:b },true,playerContinue); return result.battle!;
    });
    return {...result,battle};
  }
  let next = campaign;
  for (let guard = 0; guard < 50; guard += 1) {
    const battle = next.battle;
    const pending = battle?.pendingMonsterAttack;
    if (!battle || !pending || battle.productionMonsterContext?.pendingChoice || battle.bossEncounter?.pendingChoice || battle.ruinsContext?.pendingChoice) return next;
    if (hasOpenForRoot(next, pending.rootEventId)) return next;
    const target = battle.heroes.find((unit) => unit.id === pending.targetHeroUnitId);
    const hero = target ? findHero(next, target.sourceId) : undefined;
    if (!hero || !target?.isAlive) {
      if (pending.productionMonsterAttack && target && !target.isAlive) {
        const skipped = finishProductionMonsterAttack({ ...battle, pendingMonsterAttack: null }, { ...pending, hit: false });
        next = { ...next, battle: skipped.status === 'active' && !skipped.pendingMonsterAttack && !skipped.productionMonsterContext?.pendingExecution
          && !skipped.productionMonsterContext?.pendingChoice && !skipped.ruinsContext?.pendingChoice ? advanceTurn(skipped) : skipped }; continue;
      }
      if (pending.productionMonsterAttack) throw new Error('Production reaction Hero campaign binding absent');
      return { ...next, battle: { ...battle, pendingMonsterAttack: null } };
    }

    if (pending.stage === 'incoming-attack-window') {
      const opened = openTrinketWindow(next, {
        window: 'before-incoming-hit-resolution', heroId: hero.instanceId,
        eventId: `${pending.rootEventId}:incoming`, rootEventId: pending.rootEventId,
        excludedTrinketInstanceIds: pending.processedTrinketInstanceIds,
      });
      next = opened.campaign;
      if (opened.hasOpportunity) {
        next = { ...next, battle: { ...next.battle!, pendingMonsterAttack: {
          ...next.battle!.pendingMonsterAttack!,
          processedTrinketInstanceIds: [...pending.processedTrinketInstanceIds, ...opened.opened.map((entry) => entry.trinketInstanceId)],
        } } };
        return next;
      }
      next = { ...next, battle: freezePendingMonsterAttack(next.battle!) };
      if(next.battle?.bossEncounter?.checkpointContext?.playerRouteVersion || next.battle?.productionMonsterContext?.playerRouteVersion)return next;
      continue;
    }

    if (!pending.hit) {
      const committed = commitPendingMonsterAttackResolution(battle);
      if (committed.bossEncounter?.checkpointContext?.playerRouteVersion || committed.productionMonsterContext?.playerRouteVersion) return { ...next, battle: committed };
      next = { ...next, battle: committed.status === 'active' && !committed.pendingMonsterAttack && !committed.bossEncounter?.pendingChoice && !committed.ruinsContext?.pendingChoice ? advanceTurn(committed) : committed };
      if(next.battle?.bossEncounter?.checkpointContext?.playerRouteVersion || next.battle?.productionMonsterContext?.playerRouteVersion)return next;
      continue;
    }
    const opened = openTrinketWindow(next, {
      window: 'before-incoming-damage-applied', heroId: hero.instanceId,
      eventId: `${pending.rootEventId}:hit`, rootEventId: pending.rootEventId,
      excludedTrinketInstanceIds: pending.processedTrinketInstanceIds,
    });
    next = opened.campaign;
    if (opened.hasOpportunity) {
      next = { ...next, battle: { ...next.battle!, pendingMonsterAttack: {
        ...next.battle!.pendingMonsterAttack!,
        processedTrinketInstanceIds: [...pending.processedTrinketInstanceIds, ...opened.opened.map((entry) => entry.trinketInstanceId)],
      } } };
      return next;
    }
    const committed = commitPendingMonsterAttackResolution(next.battle!);
    if (committed.bossEncounter?.checkpointContext?.playerRouteVersion || committed.productionMonsterContext?.playerRouteVersion) return { ...next, battle: committed };
    next = { ...next, battle: committed.status === 'active' && !committed.pendingMonsterAttack && !committed.productionMonsterContext?.pendingChoice && !committed.ruinsContext?.pendingChoice ? advanceTurn(committed) : committed };
    if(next.battle?.bossEncounter?.checkpointContext?.playerRouteVersion || next.battle?.productionMonsterContext?.playerRouteVersion)return next;
  }
  return next;
}

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
  if (battle.pendingAction || campaign.pendingHealingAction) {
    return { campaign, error: '还有未结清的饰品决策，不能声明新动作。', paused: false };
  }
  const actorUnitId = battle.activeActorId;
  const err = heroSkillActionError(battle, actorUnitId, skillId, targetId);
  if (err) return { campaign, error: err, paused: false };

  const skill = getSkillById(skillId);
  if (skill && skill.targetSide !== 'enemy') {
    if (skill.heal) return beginHealingTrinketAction(campaign, actorUnitId, skillId, targetId);
    const resolved = heroUseSkill(battle, actorUnitId, skillId, targetId);
    return {
      campaign: synchronizeCommunityGuardianDeaths({ ...campaign, battle: resolved }),
      error: null,
      paused: false,
    };
  }

  const heroId = heroInstanceIdForUnit(campaign, actorUnitId);
  const hero = heroId ? findHero(campaign, heroId) : undefined;

  // Roll first. The result is persisted and visible while the reaction window is open.
  const prophetRoll=battle.bossEncounter?.prophetProduction ? applyBossRuntimeInput(battle,
    {type:'PROPHET_HERO_ATTACK_ROLL',heroId:actorUnitId,skillId,targetId}) : null;
  const attackRoll = prophetRoll ? prophetRoll.bossEncounter!.prophetProduction!.playerAttack!.attackRoll
    : battle.ruinsContext ? withRuinsRandom(battle, () => rollAttackDie()) : rollAttackDie();
  const rootEventId = `atk:${battle.battleId}:r${battle.round}:i${battle.initiativeIndex}:${actorUnitId}:ap${battle.currentActionPoints}`;
  let next = prophetRoll ? {...campaign,battle:prophetRoll} : campaign;
  let openedInstanceIds: string[] = [];
  if (hero) {
    const opened = openTrinketWindow(next, {
      window: 'after-attack-roll-before-hit-resolution',
      heroId: hero.instanceId,
      eventId: `${rootEventId}:post-roll`,
      rootEventId,
    });
    next = opened.campaign;
    openedInstanceIds = opened.opened.map((entry) => entry.trinketInstanceId);
  }

  const pendingAction: PendingBattleAction = {
    kind: 'hero-skill', rootEventId, stage: 'post-roll-window', actorUnitId, skillId, targetId, attackRoll,
    accuracyBonus: 0, critBonus: 0, damageBonus: 0,
    hit: null, crit: null, baseDamage: null, finalDamageOverride: null,
    processedTrinketInstanceIds: openedInstanceIds,
  };
  next = { ...next, battle: { ...next.battle!, pendingAction } };
  if (openedInstanceIds.length > 0) {
    return {
      campaign: next,
      error: null,
      paused: true,
    };
  }

  next = advancePendingAction(next);
  return { campaign: next, error: null, paused: Boolean(next.battle?.pendingAction) };
}

function pendingBonuses(pa: PendingBattleAction): TrinketActionBonuses {
  return { accuracy: pa.accuracyBonus, crit: pa.critBonus, damage: pa.damageBonus, healing: 0 };
}

/** Advance one frozen attack stage. Every random value is persisted before another window opens. */
function advancePendingAction(campaign: CampaignState): CampaignState {
  const battle = campaign.battle;
  const pa = battle?.pendingAction;
  if (!battle || !pa) return campaign;
  if (pa.stage === 'post-roll-window') {
    const prophetPrepared=battle.bossEncounter?.prophetProduction ? applyBossRuntimeInput(battle,
      {type:'PROPHET_HERO_ATTACK_PREPARE',heroId:pa.actorUnitId,skillId:pa.skillId,bonuses:pendingBonuses(pa)}) : null;
    const prepared = prophetPrepared ? prophetPrepared.bossEncounter!.prophetProduction!.playerAttack!.prepared!
      : battle.ruinsContext ? withRuinsRandom(battle,
      () => prepareHeroAttackResolution(battle, pa.actorUnitId, pa.skillId, pendingBonuses(pa), pa.attackRoll))
      : prepareHeroAttackResolution(battle, pa.actorUnitId, pa.skillId, pendingBonuses(pa), pa.attackRoll);
    if (!prepared) return { ...campaign, battle: { ...battle, pendingAction: null } };
    const frozen: PendingBattleAction = {
      ...pa, stage: 'pre-damage-window', hit: prepared.hit, crit: prepared.crit, baseDamage: prepared.baseDamage,
    };
    let next: CampaignState = { ...campaign, battle: { ...(prophetPrepared ?? battle), pendingAction: frozen } };
    if (prepared.hit) {
      const heroId = heroInstanceIdForUnit(next, pa.actorUnitId);
      if (heroId) {
        const opened = openTrinketWindow(next, {
          window: 'before-damage-applied', heroId, eventId: `${pa.rootEventId}:pre-damage`,
          rootEventId: pa.rootEventId, excludedTrinketInstanceIds: pa.processedTrinketInstanceIds,
        });
        next = opened.campaign;
        if (opened.hasOpportunity) {
          return {
            ...next,
            battle: {
              ...next.battle!,
              pendingAction: {
                ...frozen,
                processedTrinketInstanceIds: [...frozen.processedTrinketInstanceIds, ...opened.opened.map((entry) => entry.trinketInstanceId)],
              },
            },
          };
        }
      }
    }
    return advancePendingAction(next);
  }
  if (pa.hit === null || pa.crit === null || pa.baseDamage === null) {
    return { ...campaign, battle: { ...battle, pendingAction: null } };
  }
  const resolved = commitHeroAttackResolution(battle, pa.actorUnitId, pa.skillId, pa.targetId, pendingBonuses(pa), {
    roll: pa.attackRoll, hit: pa.hit, crit: pa.crit, baseDamage: pa.baseDamage,
  }, pa.finalDamageOverride);
  return synchronizeCommunityGuardianDeaths({ ...campaign, battle: { ...resolved, pendingAction: null } });
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
  action: 'use' | 'decline', sourceScope = false
): ResolveOpportunityResult {
  if (!sourceScope && campaign.battle?.productionMonsterContext) {
    let result: ResolveOpportunityResult = { campaign, error: null, resumed: false };
    const battle = withProductionMonsterSources(structuredClone(campaign.battle), b => {
      result = resolveTrinketOpportunity({ ...campaign, battle: b }, opportunityId, action, true); return result.campaign.battle!;
    });
    return { ...result, campaign: { ...result.campaign, battle } };
  }
  if (!sourceScope && campaign.battle?.pendingMonsterAttack?.sourceAttack) {
    let result: ResolveOpportunityResult = {campaign,error:null,resumed:false};
    const battle = withBossEncounterSources(structuredClone(campaign.battle), b=>{
      result=resolveTrinketOpportunity({...campaign,battle:b},opportunityId,action,true); return result.campaign.battle!;
    });
    return {...result,campaign:{...result.campaign,battle}};
  }
  const opp = findOpportunity(campaign, opportunityId);
  if (!opp) return { campaign, error: '使用机会不存在。', resumed: false };
  if (campaign.pendingDungeonTrinketAction && opp.rootEventId === campaign.pendingDungeonTrinketAction.rootEventId) {
    return resolveDungeonTrinketOpportunity(campaign, opportunityId, action);
  }
  if (campaign.pendingDiseaseTrinketAction
    && opp.rootEventId === campaign.pendingDiseaseTrinketAction.rootEventId) {
    const resolved = resolveDiseaseTrinketOpportunity(campaign, opportunityId, action);
    return { campaign: resolved.campaign, error: resolved.error, resumed: !resolved.paused };
  }
  if (campaign.pendingHealingAction && opp.rootEventId === campaign.pendingHealingAction.eventId) {
    return resolveHealingTrinketOpportunity(campaign, opportunityId, action);
  }

  let next = campaign;
  if (action === 'use') {
    const res = useTrinket(next, opportunityId);
    if (res.error) return { campaign, error: res.error, resumed: false };
    next = res.campaign;
    // Modifiers are applied only to the stage represented by their exact source window.
    if (opp.useWindow === 'after-attack-roll-before-hit-resolution' && next.battle?.pendingAction) {
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
    if (opp.useWindow === 'before-damage-applied' && next.battle?.pendingAction) {
      const setDamage = res.appliedModifiers.find((modifier) => modifier.type === 'damage' && modifier.operation === 'set');
      if (setDamage) next = {
        ...next,
        battle: { ...next.battle, pendingAction: { ...next.battle.pendingAction, finalDamageOverride: setDamage.amount } },
      };
    }
    if (opp.useWindow === 'before-incoming-hit-resolution' && next.battle?.pendingMonsterAttack) {
      const pending = next.battle.pendingMonsterAttack;
      next = { ...next, battle: { ...next.battle, pendingMonsterAttack: {
        ...pending, dodgeModifier: pending.dodgeModifier + sumModifiers(res.appliedModifiers, 'dodge'),
      } } };
    }
    if (opp.useWindow === 'before-incoming-damage-applied' && next.battle?.pendingMonsterAttack) {
      const scale = res.appliedEffects.find((effect) => effect.type === 'scale-incoming-damage');
      if (scale?.type === 'scale-incoming-damage') {
        const pending = next.battle.pendingMonsterAttack;
        next = { ...next, battle: { ...next.battle, pendingMonsterAttack: {
          ...pending,
          incomingDamageNumerator: pending.incomingDamageNumerator * scale.numerator,
          incomingDamageDenominator: pending.incomingDamageDenominator * scale.denominator,
          incomingDamageRounding: scale.rounding,
        } } };
      }
      const conversion = res.appliedEffects.find((effect) => effect.type === 'convert-incoming-hit-to-critical');
      if (conversion?.type === 'convert-incoming-hit-to-critical') {
        const currentBattle = next.battle;
        const pending = currentBattle?.pendingMonsterAttack;
        if (currentBattle && pending) next = { ...next, battle: { ...currentBattle, pendingMonsterAttack: {
          ...pending, criticalOverride: 'force-critical',
        } } };
      }
    }
  } else {
    next = declineTrinketUse(next, opportunityId);
    if (next === campaign) return { campaign, error: '该使用机会已关闭。', resumed: false };
  }

  // 机会全部结清 → 恢复冻结动作
  if (next.battle?.pendingAction && openOpportunities(next).length === 0) {
    next = advancePendingAction(next);
    return { campaign: next, error: null, resumed: !next.battle?.pendingAction };
  }
  if (next.battle?.pendingMonsterAttack && !hasOpenForRoot(next, next.battle.pendingMonsterAttack.rootEventId)) {
    next = advancePendingMonsterAttack(next);
    return { campaign: next, error: null, resumed: !next.battle?.pendingMonsterAttack };
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
