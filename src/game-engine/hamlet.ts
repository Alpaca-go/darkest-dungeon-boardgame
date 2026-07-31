import type { CampaignState, GameLogEntry, HamletState } from '../types';
import { HAMLET_BUILDINGS, getHamletBuildingById } from '../data/hamlet-buildings';
import { HAMLET_EVENTS } from '../data/hamlet-events';
import { createId, nowIso, pick } from './random';
import { pushLog } from './log';
import { resolveHealing } from './healing';
import { applyStressBatch, recoverStress } from './stress';
import { createRuleEventContext, emitPartyRuleEvent, removeQuirkFromHero } from './quirks';
import { getQuirkById } from '../data/quirks';
import { distributeQuestXp } from './progression/quest-xp';
import { clearConsumedSkillForms } from './progression/skill-forms';
import { resetAllTrinketsForHamlet } from './trinkets/reset-trinkets';
import { clearAllTrinketOpportunities } from './trinkets/trinket-opportunities';
import { resetNomadWagonForHamletEnd } from './nomad-wagon';

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function hamletLog(
  state: HamletState,
  message: string,
  kind: GameLogEntry['kind'] = 'info'
): HamletState {
  const entry: GameLogEntry = { id: createId('hlog'), at: nowIso(), message, kind };
  return { ...state, log: [...(state.log ?? []), entry].slice(-50) };
}

/** 随机选择 Caretaker 阻塞的建筑 id（统一走可注入随机源）。 */
export function rollCaretakerBuilding(): string {
  return pick(HAMLET_BUILDINGS).id;
}

// ---------------------------------------------------------------------------
// 进入 Hamlet
// ---------------------------------------------------------------------------

/**
 * 从 Quest Result 进入 Hamlet（单一入口，页面不应分步修改状态）：
 * 1. 清除 DungeonState 与 BattleState、清空任务临时字段；
 * 2. 抽取 Hamlet Event 并执行一次事件效果；
 * 3. preparationDays 由事件决定，currentDay = 1；
 * 4. 重置英雄 hasActedToday、清空 occupiedBuildingIds；
 * 5. 随机生成当天 Caretaker 阻塞建筑；
 * 6. Phase 8D：发放本次任务的 Quest XP（英雄 + Stagecoach，幂等）并清理已消耗的临时 Skill Form；
 * 7. gamePhase → hamlet。
 * 仅允许在 quest-result 且已结算后调用（幂等保护）。
 */
/**
 * Phase 8C §14/§15.2：Trinket 待分配未解决时不能进入 Hamlet。
 * 返回 null 表示可进入，否则为阻塞原因（UI 用于禁用按钮并提示）。
 */
export function hamletEntryBlockedByTrinkets(campaign: CampaignState): string | null {
  const pending = (campaign.pendingTrinketAllocations ?? []).filter(
    (a) => a.status === 'pending'
  );
  if (pending.length > 0) {
    return `还有 ${pending.length} 件饰品等待分配，处理完成后才能返回 Hamlet`;
  }
  return null;
}

export function startHamletPhase(campaign: CampaignState): CampaignState {
  if (campaign.gamePhase !== 'quest-result' || !campaign.questResultResolved) {
    return campaign;
  }
  // Phase 8C §14：Pending Allocation 未解决时不能进入 Hamlet。
  if (hamletEntryBlockedByTrinkets(campaign) !== null) {
    return campaign;
  }

  const event = pick(HAMLET_EVENTS);
  const blocked = rollCaretakerBuilding();

  let hamlet: HamletState = {
    visitId: createId('hvisit'),
    preparationDays: event.preparationDays,
    currentDay: 1,
    caretakerBlockedBuildingId: blocked,
    occupiedBuildingIds: [],
    currentEventId: event.id,
    log: [],
    nextQuestProvisionBonus: 0,
  };

  let next: CampaignState = {
    ...campaign,
    heroes: campaign.heroes.map((h) => ({ ...h, hasActedToday: false })),
    dungeon: null,
    battle: null,
    guildVisitSession: null,
    gamePhase: 'hamlet',
  };

  // Phase 8D：Quest XP 在「返回 Hamlet」时才真正发放（规则 2），幂等。
  const xpOutcome = distributeQuestXp(next);
  next = xpOutcome.campaign;
  // Phase 8D：清理上一次任务已消耗的临时 Skill Form。
  next = clearConsumedSkillForms(next);
  // Phase 8C §14：返回 Hamlet 单一事务内重置所有 Trinket 为正面。
  // 幂等键 = questId + returnTransactionId（本次 Hamlet visitId），刷新/重复调用不二次重置；
  // 同时清掉任何残留的使用窗口（防御性，正常流程战斗结束时已关闭）。
  next = clearAllTrinketOpportunities(next);
  next = resetAllTrinketsForHamlet(next, campaign.currentQuestId ?? null, hamlet.visitId).campaign;

  // 事件效果只执行一次（在此处，之后不再触发）。
  switch (event.effectType) {
    case 'bonus-provisions':
      hamlet = { ...hamlet, nextQuestProvisionBonus: event.effectAmount };
      break;
    case 'party-stress': {
      // Phase 7：Hamlet 事件压力统一走 applyStressBatch（阈值规则照常生效）。
      const batchId = createId('sbatch');
      next = applyStressBatch(
        next,
        next.heroes
          .filter((h) => h.isAlive && !h.dead)
          .map((h) => ({
            heroId: h.instanceId,
            amount: event.effectAmount,
            sourceType: 'hamlet-event' as const,
            sourceId: event.id,
            questId: next.currentQuestId ?? '',
            batchId,
          }))
      ).campaign;
      break;
    }
    case 'none':
    default:
      break;
  }

  hamlet = hamletLog(
    hamlet,
    `事件「${event.name}」：${event.effect} 准备天数 ${event.preparationDays} 天。`,
    'info'
  );
  hamlet = hamletLog(
    hamlet,
    `第 1 天开始，Caretaker 占据了 ${getHamletBuildingById(blocked)?.name ?? blocked}。`,
    'warning'
  );
  if (xpOutcome.result) {
    hamlet = hamletLog(
      hamlet,
      `Quest XP 发放：完成 ${xpOutcome.result.completedObjectiveCount} 个 Objective，${xpOutcome.result.eligibleHeroIds.length} 名英雄各 +${xpOutcome.result.xpPerHero} XP，Stagecoach +${xpOutcome.result.stagecoachXp} XP。`,
      xpOutcome.result.xpPerHero > 0 ? 'success' : 'info',
    );
  }

  next = { ...next, hamlet };
  next = pushLog(next, `小队返回 Hamlet，事件「${event.name}」生效。`, 'info');
  // Phase 8A：hamlet-arrived 时机事件（Bad Gambler / Skilled Gambler / Early Riser 等）
  next = emitPartyRuleEvent(next, 'hamlet-arrived', createRuleEventContext());
  return next;
}

/** prepareReturnToHamlet 的语义别名（开发文档命名）。 */
export const prepareReturnToHamlet = startHamletPhase;

// ---------------------------------------------------------------------------
// 建筑访问
// ---------------------------------------------------------------------------

/** 校验英雄能否访问建筑；返回 null 表示可以，否则为拒绝原因。 */
export function buildingVisitError(
  campaign: CampaignState,
  heroInstanceId: string,
  buildingId: string
): string | null {
  if (campaign.gamePhase !== 'hamlet') return '当前不在 Hamlet 阶段';
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId);
  const building = getHamletBuildingById(buildingId);
  if (!hero || !building) return '英雄或建筑不存在';
  if (!hero.isAlive) return '阵亡英雄无法行动';
  if (hero.hasActedToday) return '该英雄今天已经行动过';
  if (campaign.hamlet.caretakerBlockedBuildingId === buildingId)
    return 'Caretaker 阻塞了该建筑';
  if (campaign.hamlet.occupiedBuildingIds.includes(buildingId))
    return '该建筑今天已被其他英雄占用';
  if (campaign.gold < building.cost) return 'Gold 不足';
  if (buildingId === 'sanitarium' && hero.wounds <= 0) return 'HP 已满，无需治疗';
  if (buildingId === 'tavern' && hero.stress <= 0) return 'Stress 已为 0';
  // Phase 8A：Abbey 需要有可移除的 Quirk
  if (
    buildingId === 'abbey' &&
    hero.positiveQuirkIds.length + hero.negativeQuirkIds.length === 0
  ) {
    return '该英雄没有可移除的怪癖';
  }
  return null;
}

/** Phase 8A：Abbey 移除指定 Quirk 的合法性校验（null = 可执行）。 */
export function abbeyRemoveQuirkError(
  campaign: CampaignState,
  heroInstanceId: string,
  quirkId: string
): string | null {
  const base = buildingVisitError(campaign, heroInstanceId, 'abbey');
  if (base) return base;
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId)!;
  if (!hero.positiveQuirkIds.includes(quirkId) && !hero.negativeQuirkIds.includes(quirkId)) {
    return '该英雄没有这个怪癖';
  }
  return null;
}

/**
 * Phase 8A：Abbey 访问（移除英雄一个 Quirk）。
 * 与 visitHamletBuilding 同样的消费/占用/行动标记规则，但需要额外的 quirkId 参数，
 * 因此单独提供入口；移除动作统一走 removeQuirkFromHero（组件不得直接改数组）。
 */
export function visitAbbey(
  campaign: CampaignState,
  heroInstanceId: string,
  quirkId: string
): CampaignState {
  if (abbeyRemoveQuirkError(campaign, heroInstanceId, quirkId) !== null) return campaign;
  const building = getHamletBuildingById('abbey')!;
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId)!;
  const quirkName = getQuirkById(quirkId)?.name ?? quirkId;

  const base = removeQuirkFromHero(campaign, heroInstanceId, quirkId);
  const heroes = base.heroes.map((h) =>
    h.instanceId === heroInstanceId ? { ...h, hasActedToday: true } : h
  );
  const hamlet = hamletLog(
    {
      ...base.hamlet,
      occupiedBuildingIds: [...base.hamlet.occupiedBuildingIds, 'abbey'],
    },
    `${hero.name} 访问 ${building.name}（-${building.cost} Gold）：移除怪癖「${quirkName}」。`,
    'success'
  );

  return { ...base, gold: base.gold - building.cost, heroes, hamlet };
}

/**
 * 英雄访问建筑：扣 Gold → 应用效果 → 标记已行动 → 占用建筑 → 写日志。
 * 非法访问原样返回（不产生任何消费）。
 */
export function visitHamletBuilding(
  campaign: CampaignState,
  heroInstanceId: string,
  buildingId: string
): CampaignState {
  // Phase 8A：Abbey 需要选择移除目标，必须走 visitAbbey（避免无参访问产生消费）。
  if (buildingId === 'abbey') return campaign;
  // Phase 8D：Guild 是「会话式」升级（startGuildVisit / commitGuildVisit），
  // Blacksmith 需要指定技能（visitBlacksmith）；两者都不能通过无参访问产生消费。
  if (buildingId === 'guild' || buildingId === 'blacksmith') return campaign;
  if (buildingVisitError(campaign, heroInstanceId, buildingId) !== null) return campaign;
  const building = getHamletBuildingById(buildingId)!;
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId)!;

  let effectNote = '';
  let base = campaign;

  // Phase 6：Sanitarium 治疗统一走 resolveHealing（脱离 Death's Door 生效）
  if (buildingId === 'sanitarium') {
    const { campaign: healedCampaign, resolution } = resolveHealing(base, heroInstanceId, 3);
    base = healedCampaign;
    effectNote = `恢复 ${resolution.healed} HP${resolution.leftDeathsDoor ? '，脱离 Death\u0027s Door' : ''}`;
  }

  // Phase 7：Tavern 减压统一走 recoverStress（不撤销 Virtue/Affliction）
  if (buildingId === 'tavern') {
    const out = recoverStress(base, {
      heroId: heroInstanceId,
      amount: 3,
      sourceType: 'hamlet-event',
      sourceId: 'tavern',
      questId: base.currentQuestId ?? '',
    });
    base = out.campaign;
    effectNote = `Stress -${Math.abs(out.result.appliedAmount)}`;
  }

  const heroes = base.heroes.map((h) => {
    if (h.instanceId !== heroInstanceId) return h;
    let u = { ...h, hasActedToday: true };
    switch (buildingId) {
      case 'sanitarium': {
        break; // 治疗已在 resolveHealing 中完成
      }
      case 'tavern': {
        break; // 减压已在 recoverStress 中完成
      }
      default:
        break;
    }
    return u;
  });

  const hamlet = hamletLog(
    {
      ...base.hamlet,
      occupiedBuildingIds: [...base.hamlet.occupiedBuildingIds, buildingId],
    },
    `${hero.name} 访问 ${building.name}（-${building.cost} Gold）：${effectNote}。`,
    'success'
  );

  return {
    ...base,
    gold: base.gold - building.cost,
    heroes,
    hamlet,
  };
}

/** 跳过今天行动：不消费、无效果，仅标记已行动（原型闭环用）。 */
export function skipHeroAction(campaign: CampaignState, heroInstanceId: string): CampaignState {
  if (campaign.gamePhase !== 'hamlet') return campaign;
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId);
  if (!hero || !hero.isAlive || hero.hasActedToday) return campaign;

  return {
    ...campaign,
    heroes: campaign.heroes.map((h) =>
      h.instanceId === heroInstanceId ? { ...h, hasActedToday: true } : h
    ),
    hamlet: hamletLog(campaign.hamlet, `${hero.name} 跳过了今天的行动。`, 'info'),
  };
}

// ---------------------------------------------------------------------------
// 结束当天 / 结束 Hamlet
// ---------------------------------------------------------------------------

/** 只有所有存活英雄都已行动（或跳过）才能结束当天。 */
export function canEndHamletDay(campaign: CampaignState): boolean {
  if (campaign.gamePhase !== 'hamlet') return false;
  return campaign.heroes.filter((h) => h.isAlive).every((h) => h.hasActedToday);
}

/**
 * 结束当天：
 * - preparationDays -1、currentDay +1、重置行动标记、清空占用；
 * - 剩余天数 > 0 → 重新随机 Caretaker，继续下一天；
 * - 剩余天数 = 0 → 结束 Hamlet，返回 quest-select 并清理任务临时状态。
 */
export function endHamletDay(campaign: CampaignState): CampaignState {
  if (!canEndHamletDay(campaign)) return campaign;

  const remaining = campaign.hamlet.preparationDays - 1;
  const heroes = campaign.heroes.map((h) => ({ ...h, hasActedToday: false }));

  if (remaining > 0) {
    const nextDay = campaign.hamlet.currentDay + 1;
    const blocked = rollCaretakerBuilding();
    let hamlet: HamletState = {
      ...campaign.hamlet,
      preparationDays: remaining,
      currentDay: nextDay,
      occupiedBuildingIds: [],
      caretakerBlockedBuildingId: blocked,
    };
    hamlet = hamletLog(
      hamlet,
      `第 ${nextDay - 1} 天结束。第 ${nextDay} 天开始，Caretaker 占据了 ${
        getHamletBuildingById(blocked)?.name ?? blocked
      }。`,
      'info'
    );
    return { ...campaign, heroes, hamlet };
  }

  // preparationDays 归零：结束 Hamlet，进入下一任务循环。
  let next: CampaignState = {
    ...campaign,
    heroes,
    gamePhase: 'quest-select',
    currentQuestId: null,
    questStatus: 'none',
    dungeon: null,
    battle: null,
    questResultResolved: false,
    lastQuestResult: null,
    hamlet: {
      ...campaign.hamlet,
      preparationDays: 0,
      occupiedBuildingIds: [],
      caretakerBlockedBuildingId: null,
    },
  };
  // Phase 8C §16.3：Hamlet 结束时未购买的 Nomad Wagon Offer 返回抽取池并清空状态。
  next = resetNomadWagonForHamletEnd(next);
  next = pushLog(next, '准备阶段结束，小队整装待发。选择下一个任务。', 'success');
  return next;
}
