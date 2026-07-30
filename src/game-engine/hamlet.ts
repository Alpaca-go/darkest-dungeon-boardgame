import type { CampaignState, GameLogEntry, HamletState } from '../types';
import { HAMLET_BUILDINGS, getHamletBuildingById } from '../data/hamlet-buildings';
import { HAMLET_EVENTS } from '../data/hamlet-events';
import { createId, nowIso, pick } from './random';
import { pushLog } from './log';
import { resolveHealing } from './healing';

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
 * 6. gamePhase → hamlet。
 * 仅允许在 quest-result 且已结算后调用（幂等保护）。
 */
export function startHamletPhase(campaign: CampaignState): CampaignState {
  if (campaign.gamePhase !== 'quest-result' || !campaign.questResultResolved) {
    return campaign;
  }

  const event = pick(HAMLET_EVENTS);
  const blocked = rollCaretakerBuilding();

  let hamlet: HamletState = {
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
    gamePhase: 'hamlet',
  };

  // 事件效果只执行一次（在此处，之后不再触发）。
  switch (event.effectType) {
    case 'bonus-provisions':
      hamlet = { ...hamlet, nextQuestProvisionBonus: event.effectAmount };
      break;
    case 'party-stress':
      next = {
        ...next,
        heroes: next.heroes.map((h) =>
          h.isAlive ? { ...h, stress: h.stress + event.effectAmount } : h
        ),
      };
      break;
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

  next = { ...next, hamlet };
  next = pushLog(next, `小队返回 Hamlet，事件「${event.name}」生效。`, 'info');
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
  return null;
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

  const heroes = base.heroes.map((h) => {
    if (h.instanceId !== heroInstanceId) return h;
    let u = { ...h, hasActedToday: true };
    switch (buildingId) {
      case 'sanitarium': {
        break; // 治疗已在 resolveHealing 中完成
      }
      case 'tavern': {
        const relieved = Math.min(3, u.stress);
        u = { ...u, stress: u.stress - relieved };
        effectNote = `Stress -${relieved}`;
        break;
      }
      case 'guild':
        u = { ...u, xp: u.xp + 1 };
        effectNote = '获得 1 XP';
        break;
      case 'blacksmith':
        u = { ...u, temporaryDamageBonus: 1 };
        effectNote = '下次任务攻击 +1 伤害';
        break;
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
  next = pushLog(next, '准备阶段结束，小队整装待发。选择下一个任务。', 'success');
  return next;
}
