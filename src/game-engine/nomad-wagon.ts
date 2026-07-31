// Phase 8C：Nomad Wagon（流浪商队）引擎（开发文档 §16）。
//
// 规则要点：
// - Offer 在「本次 Hamlet 首次有英雄打开商队」时生成并立即保存，之后不重抽（§16.3）；
// - 展示组合由建筑等级决定（关键规则 8-10）：I=3×L1，II=2×L1+1×L2，III=L1+L2+L3；
// - 卖价 2/3/4（L1/L2/L3）；买价仅 L1=4 可信，L2/L3 为 null 禁止购买（关键规则 11-13）；
// - 一次访问最多卖 1 件 + 买 1 件，也可都不做；commitNomadWagonVisit 单一原子事务；
// - 取消（不调用 commit）不产生任何扣费；
// - Hamlet 结束时未售出的 Offer 返回抽取池（抽取池基于定义、无需归还操作），状态清空。
//
// 本阶段禁止建筑升级：buildingLevel 恒为 1，组合表按三级完整定义仅供数据/测试使用。

import type {
  CampaignState,
  NomadWagonState,
  NomadWagonVisitCommand,
  TrinketDefinition,
} from '../types';
import { createId, nowIso } from './random';
import { pushLog } from './log';
import {
  NOMAD_WAGON_BUILDING_ID,
  NOMAD_WAGON_NAME,
  offerLayoutForLevel,
} from '../data/nomad-wagon';
import {
  buyPriceForLevel,
  sellPriceForLevel,
  BUY_PRICE_UNAVAILABLE_NOTE,
} from '../data/trinkets/trinket-pricing';
import { getTrinketById } from '../data/trinkets/trinket-registry';
import { drawTrinket } from './trinkets/draw-trinket';
import { acquireTrinket } from './trinkets/acquire-trinket';
import {
  createInitialNomadWagonState,
  findHero,
  pushTransferRecord,
  removeTrinketFromHero,
} from './trinkets/trinket-state';
import { hasOpenTrinketOpportunity } from './trinkets/trinket-opportunities';

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function wagonHamletLog(campaign: CampaignState, message: string): CampaignState {
  if (!campaign.hamlet) return campaign;
  return {
    ...campaign,
    hamlet: {
      ...campaign.hamlet,
      log: [
        ...(campaign.hamlet.log ?? []),
        { id: createId('hlog'), at: nowIso(), message, kind: 'info' as const },
      ].slice(-50),
    },
  };
}

/** 是否存在任何未决的 Trinket 决策（分配 / 使用窗口 / 使用事务）。 */
export function hasPendingTrinketDecision(campaign: CampaignState): boolean {
  if ((campaign.pendingTrinketAllocations ?? []).some((a) => a.status === 'pending')) return true;
  if (hasOpenTrinketOpportunity(campaign)) return true;
  if (campaign.pendingTrinketUseTransaction) return true;
  return false;
}

/** 当前 Offer 中仍可购买的定义列表（含价格；null 价禁止购买）。 */
export function nomadWagonOfferDetails(
  campaign: CampaignState
): Array<{ definition: TrinketDefinition; buyPrice: number | null; buyDisabledNote: string | null }> {
  const wagon = campaign.nomadWagon;
  if (!wagon?.offerGenerated) return [];
  return wagon.offeredTrinketIds
    .map((id) => getTrinketById(id))
    .filter((d): d is TrinketDefinition => Boolean(d))
    .map((definition) => {
      const buyPrice = buyPriceForLevel(definition.level);
      return {
        definition,
        buyPrice,
        buyDisabledNote: buyPrice === null ? BUY_PRICE_UNAVAILABLE_NOTE : null,
      };
    });
}

// ---------------------------------------------------------------------------
// 访问校验（§16.4）
// ---------------------------------------------------------------------------

/** 校验英雄能否访问 Nomad Wagon；null = 可以，否则为拒绝原因。 */
export function nomadWagonVisitError(
  campaign: CampaignState,
  heroInstanceId: string
): string | null {
  if (campaign.gamePhase !== 'hamlet') return '当前不在 Hamlet 阶段';
  const hero = findHero(campaign, heroInstanceId);
  if (!hero) return '英雄不存在';
  if (!hero.isAlive || hero.dead) return '阵亡英雄无法访问';
  if (hero.hasActedToday) return '该英雄今天已经行动过';
  if (campaign.hamlet.caretakerBlockedBuildingId === NOMAD_WAGON_BUILDING_ID)
    return 'Caretaker 阻塞了 Nomad Wagon';
  if (campaign.hamlet.occupiedBuildingIds.includes(NOMAD_WAGON_BUILDING_ID))
    return 'Nomad Wagon 今天已被其他英雄访问';
  if (hasPendingTrinketDecision(campaign)) return '还有未处理的饰品决策，须先处理完成';
  return null;
}

// ---------------------------------------------------------------------------
// Offer 生成（§16.2 / §16.3）
// ---------------------------------------------------------------------------

/**
 * 确保本次 Hamlet 的 Offer 已生成（首次打开商队时调用；幂等）。
 * - 按建筑等级组合逐位抽取（official 池，排除已抽中的定义避免同屏重复）；
 * - 某等级官方池为空（如 L2/L3 暂无 verified 卡）时该展示位留空，不白屏、不臆测；
 * - 生成后立即由调用方（store commit）保存 —— 刷新不重抽。
 */
export function ensureNomadWagonOffer(campaign: CampaignState): CampaignState {
  const wagon = campaign.nomadWagon ?? createInitialNomadWagonState();
  if (wagon.offerGenerated) return campaign;

  const layout = offerLayoutForLevel(wagon.buildingLevel);
  const drawn: string[] = [];
  for (const level of layout) {
    const res = drawTrinket({
      level,
      pool: 'official',
      excludedTrinketIds: drawn,
      allowDuplicateFallback: true,
    });
    if (res.definition) drawn.push(res.definition.id);
  }

  const nextWagon: NomadWagonState = {
    ...wagon,
    offerGenerated: true,
    offerGenerationDay: campaign.hamlet?.currentDay ?? null,
    offerTransactionId: createId('wagonoffer'),
    offeredTrinketIds: drawn,
  };
  let next: CampaignState = { ...campaign, nomadWagon: nextWagon };
  next = pushLog(
    next,
    `${NOMAD_WAGON_NAME} 摆出了 ${drawn.length} 件饰品。`,
    'info'
  );
  return next;
}

// ---------------------------------------------------------------------------
// 原子事务（§16.7）
// ---------------------------------------------------------------------------

/** 校验一次买/卖提交是否合法；null = 可执行，否则为拒绝原因（校验期零副作用）。 */
export function commitNomadWagonVisitError(
  campaign: CampaignState,
  cmd: NomadWagonVisitCommand
): string | null {
  const base = nomadWagonVisitError(campaign, cmd.heroId);
  if (base) return base;

  const hero = findHero(campaign, cmd.heroId)!;
  let sellGain = 0;

  if (cmd.sellInstanceId) {
    const inst = (hero.equippedTrinkets ?? []).find((t) => t.instanceId === cmd.sellInstanceId);
    if (!inst) return '要卖出的饰品不在该英雄身上';
    const def = getTrinketById(inst.trinketId);
    if (!def) return '要卖出的饰品定义缺失';
    sellGain = sellPriceForLevel(def.level);
  }

  if (cmd.buyTrinketId) {
    const wagon = campaign.nomadWagon;
    if (!wagon?.offerGenerated) return 'Offer 尚未生成';
    if (!wagon.offeredTrinketIds.includes(cmd.buyTrinketId)) return '该饰品不在展示位中';
    const def = getTrinketById(cmd.buyTrinketId);
    if (!def) return '要购买的饰品定义缺失';
    const price = buyPriceForLevel(def.level);
    if (price === null) return BUY_PRICE_UNAVAILABLE_NOTE;
    if (campaign.gold + sellGain < price) return 'Gold 不足';
  }

  return null;
}

export interface NomadWagonVisitResult {
  campaign: CampaignState;
  error: string | null;
  /** 本次事务 Gold 净变化（卖 - 买）。 */
  goldDelta: number;
}

/**
 * 一次性提交本次访问（§16.7）：可选卖出 → 可选买入 → Gold 净变化 →
 * 装备/Offer 变化 → 英雄已行动 → 建筑占用 → 日志。
 * 任何校验失败原样返回（不产生部分效果）；取消 = 不调用本函数，自然不扣钱。
 */
export function commitNomadWagonVisit(
  campaign: CampaignState,
  cmd: NomadWagonVisitCommand
): NomadWagonVisitResult {
  const error = commitNomadWagonVisitError(campaign, cmd);
  if (error) return { campaign, error, goldDelta: 0 };

  const hero = findHero(campaign, cmd.heroId)!;
  const visitActionId = createId('wagonvisit');
  let next: CampaignState = campaign;
  let goldDelta = 0;
  const notes: string[] = [];

  // 1) 可选卖出
  let soldInstanceId: string | null = null;
  if (cmd.sellInstanceId) {
    const inst = (hero.equippedTrinkets ?? []).find((t) => t.instanceId === cmd.sellInstanceId)!;
    const def = getTrinketById(inst.trinketId)!;
    const price = sellPriceForLevel(def.level);
    next = removeTrinketFromHero(next, hero.instanceId, inst.instanceId);
    next = pushTransferRecord(next, {
      trinketId: def.id,
      instanceId: inst.instanceId,
      fromHeroId: hero.instanceId,
      toHeroId: null,
      reason: 'nomad-wagon-sold',
    });
    goldDelta += price;
    soldInstanceId = inst.instanceId;
    notes.push(`卖出「${def.name}」+${price} Gold`);
  }

  // 2) 可选买入（从展示位移除；容量不足自动进入分配确认，钱已按成交扣除）
  let purchasedTrinketId: string | null = null;
  let purchasedInstanceId: string | null = null;
  if (cmd.buyTrinketId) {
    const def = getTrinketById(cmd.buyTrinketId)!;
    const price = buyPriceForLevel(def.level)!;
    goldDelta -= price;
    const acq = acquireTrinket(next, {
      trinketId: def.id,
      source: 'nomad-wagon',
      sourceEventId: `nomad-wagon:${visitActionId}:${def.id}`,
      heroId: hero.instanceId,
      questId: null,
    });
    next = acq.campaign;
    purchasedTrinketId = def.id;
    purchasedInstanceId = acq.instanceId;
    next = {
      ...next,
      nomadWagon: {
        ...next.nomadWagon,
        offeredTrinketIds: next.nomadWagon.offeredTrinketIds.filter((id) => id !== def.id),
      },
    };
    notes.push(`买入「${def.name}」-${price} Gold`);
  }

  // 3) Gold 净变化 + 英雄已行动 + 建筑占用 + 访问记录
  next = {
    ...next,
    gold: next.gold + goldDelta,
    heroes: next.heroes.map((h) =>
      h.instanceId === hero.instanceId ? { ...h, hasActedToday: true } : h
    ),
    hamlet: {
      ...next.hamlet,
      occupiedBuildingIds: [...next.hamlet.occupiedBuildingIds, NOMAD_WAGON_BUILDING_ID],
    },
    nomadWagon: {
      ...next.nomadWagon,
      visitHeroId: hero.instanceId,
      visitActionId,
      soldInstanceId,
      purchasedTrinketId,
      purchasedInstanceId,
    },
  };

  // 4) 日志（campaign 主日志 + hamlet 面板日志）
  const summaryText =
    notes.length > 0 ? notes.join('，') : '未进行任何交易';
  const message = `${hero.name} 访问 ${NOMAD_WAGON_NAME}：${summaryText}。`;
  next = pushLog(next, message, notes.length > 0 ? 'success' : 'info');
  next = wagonHamletLog(next, message);

  return { campaign: next, error: null, goldDelta };
}

// ---------------------------------------------------------------------------
// Hamlet 结束清理（§16.3 后半）
// ---------------------------------------------------------------------------

/**
 * Hamlet 结束时调用：未购买的 Offer 返回抽取池（抽取池基于定义集合，无需显式归还），
 * 清空 Offer 与访问状态；建筑等级保留。
 */
export function resetNomadWagonForHamletEnd(campaign: CampaignState): CampaignState {
  const wagon = campaign.nomadWagon;
  if (!wagon || (!wagon.offerGenerated && !wagon.visitActionId)) return campaign;
  return {
    ...campaign,
    nomadWagon: {
      ...createInitialNomadWagonState(),
      buildingLevel: wagon.buildingLevel,
    },
  };
}
