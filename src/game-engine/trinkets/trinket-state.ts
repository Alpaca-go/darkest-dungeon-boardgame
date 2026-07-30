// Phase 8C：Trinket 状态读写的公共工具。
//
// 所有对 hero.equippedTrinkets 的写入都必须经过本模块，
// 组件与页面一律不得直接改数组（与 Quirk / Disease 同一约定）。

import type {
  CampaignState,
  HeroInstance,
  HeroTrinketState,
  NomadWagonState,
  TrinketAcquisitionRecord,
  TrinketSide,
  TrinketTransferRecord,
  TrinketTransferReason,
  TrinketUseRecord,
} from '../../types';
import { createId, nowIso } from '../random';

const HISTORY_LIMIT = 200;

function capped<T>(list: T[]): T[] {
  return list.length > HISTORY_LIMIT ? list.slice(-HISTORY_LIMIT) : list;
}

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

export function findHero(campaign: CampaignState, heroId: string): HeroInstance | undefined {
  return campaign.heroes.find((h) => h.instanceId === heroId);
}

/** 找到持有某 Trinket 实例的英雄。 */
export function findHeroByTrinketInstance(
  campaign: CampaignState,
  instanceId: string
): HeroInstance | undefined {
  return campaign.heroes.find((h) =>
    (h.equippedTrinkets ?? []).some((t) => t.instanceId === instanceId)
  );
}

export function findTrinketInstance(
  campaign: CampaignState,
  instanceId: string
): HeroTrinketState | undefined {
  for (const h of campaign.heroes) {
    const t = (h.equippedTrinkets ?? []).find((x) => x.instanceId === instanceId);
    if (t) return t;
  }
  return undefined;
}

/** 可以接收 Trinket 的英雄（存活且未永久死亡）。 */
export function aliveHeroIds(campaign: CampaignState, excludeHeroId?: string): string[] {
  return campaign.heroes
    .filter((h) => h.isAlive && !h.dead && h.instanceId !== excludeHeroId)
    .map((h) => h.instanceId);
}

// ---------------------------------------------------------------------------
// 回合标识（「每个英雄回合每张 Trinket 只能用一次」的键）
// ---------------------------------------------------------------------------

/**
 * 当前「回合」标识：
 * - 战斗中：battleId:round:initiativeIndex:actorId（与 Phase 7 回合键一致）；
 * - 地牢探索：explore:questId:roomId；
 * - Hamlet：hamlet:visitId:day；
 * - 其他阶段：null（不开窗）。
 */
export function currentTrinketTurnId(campaign: CampaignState): string | null {
  const b = campaign.battle;
  if (b && b.status === 'active' && b.activeActorId) {
    return `${b.battleId}:${b.round}:${b.initiativeIndex}:${b.activeActorId}`;
  }
  if (campaign.gamePhase === 'dungeon-explore' && campaign.dungeon) {
    return `explore:${campaign.currentQuestId ?? 'none'}:${campaign.dungeon.currentRoomId}`;
  }
  if (campaign.gamePhase === 'hamlet') {
    return `hamlet:${campaign.hamlet.visitId}:${campaign.hamlet.currentDay}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 写入
// ---------------------------------------------------------------------------

/** 用回调替换某英雄（不存在时原样返回）。 */
export function updateHero(
  campaign: CampaignState,
  heroId: string,
  fn: (h: HeroInstance) => HeroInstance
): CampaignState {
  let touched = false;
  const heroes = campaign.heroes.map((h) => {
    if (h.instanceId !== heroId) return h;
    touched = true;
    return fn(h);
  });
  if (!touched) return campaign;
  return syncBattleTrinketSnapshot({ ...campaign, heroes });
}

/** 给英雄装上一件 Trinket（不做容量检查，调用方负责）。 */
export function addTrinketToHero(
  campaign: CampaignState,
  heroId: string,
  trinket: HeroTrinketState
): CampaignState {
  return updateHero(campaign, heroId, (h) => ({
    ...h,
    equippedTrinkets: [...(h.equippedTrinkets ?? []), trinket],
  }));
}

/** 从英雄身上摘下一件 Trinket。 */
export function removeTrinketFromHero(
  campaign: CampaignState,
  heroId: string,
  instanceId: string
): CampaignState {
  return updateHero(campaign, heroId, (h) => ({
    ...h,
    equippedTrinkets: (h.equippedTrinkets ?? []).filter((t) => t.instanceId !== instanceId),
  }));
}

/** 替换某个 Trinket 实例（翻面 / 标记已用）。 */
export function patchTrinketInstance(
  campaign: CampaignState,
  instanceId: string,
  patch: Partial<HeroTrinketState>
): CampaignState {
  const owner = findHeroByTrinketInstance(campaign, instanceId);
  if (!owner) return campaign;
  return updateHero(campaign, owner.instanceId, (h) => ({
    ...h,
    equippedTrinkets: (h.equippedTrinkets ?? []).map((t) =>
      t.instanceId === instanceId ? { ...t, ...patch } : t
    ),
  }));
}

/** 另一面。 */
export function otherSide(side: TrinketSide): TrinketSide {
  return side === 'positive' ? 'negative' : 'positive';
}

/** 把战役英雄的 Trinket 实例 id 同步到战斗单位快照。 */
export function syncBattleTrinketSnapshot(campaign: CampaignState): CampaignState {
  const b = campaign.battle;
  if (!b) return campaign;
  let changed = false;
  const heroes = b.heroes.map((u) => {
    const src = campaign.heroes.find((h) => h.instanceId === u.sourceId);
    if (!src) return u;
    const ids = (src.equippedTrinkets ?? []).map((t) => t.instanceId);
    const prev = u.equippedTrinketInstanceIds ?? [];
    if (prev.length === ids.length && prev.every((v, i) => v === ids[i])) return u;
    changed = true;
    return { ...u, equippedTrinketInstanceIds: ids };
  });
  if (!changed) return campaign;
  return { ...campaign, battle: { ...b, heroes } };
}

// ---------------------------------------------------------------------------
// 记录
// ---------------------------------------------------------------------------

export function pushAcquisitionRecord(
  campaign: CampaignState,
  record: Omit<TrinketAcquisitionRecord, 'id' | 'createdAt'>
): { campaign: CampaignState; record: TrinketAcquisitionRecord } {
  const full: TrinketAcquisitionRecord = { ...record, id: createId('tacq'), createdAt: nowIso() };
  return {
    campaign: {
      ...campaign,
      trinketAcquisitionRecords: capped([...(campaign.trinketAcquisitionRecords ?? []), full]),
    },
    record: full,
  };
}

export function pushTransferRecord(
  campaign: CampaignState,
  record: {
    trinketId: string;
    instanceId: string;
    fromHeroId: string | null;
    toHeroId: string | null;
    reason: TrinketTransferReason;
  }
): CampaignState {
  const full: TrinketTransferRecord = { ...record, id: createId('ttrf'), createdAt: nowIso() };
  return {
    ...campaign,
    trinketTransferRecords: capped([...(campaign.trinketTransferRecords ?? []), full]),
  };
}

export function pushUseRecord(
  campaign: CampaignState,
  record: Omit<TrinketUseRecord, 'id' | 'createdAt'>
): CampaignState {
  const full: TrinketUseRecord = { ...record, id: createId('tuse'), createdAt: nowIso() };
  return { ...campaign, trinketUseRecords: capped([...(campaign.trinketUseRecords ?? []), full]) };
}

/** 幂等：来源事件是否已处理过。 */
export function isTrinketEventProcessed(campaign: CampaignState, eventId: string): boolean {
  return (campaign.processedTrinketEventIds ?? []).includes(eventId);
}

export function markTrinketEventProcessed(campaign: CampaignState, eventId: string): CampaignState {
  if (!eventId || isTrinketEventProcessed(campaign, eventId)) return campaign;
  return {
    ...campaign,
    processedTrinketEventIds: capped([...(campaign.processedTrinketEventIds ?? []), eventId]),
  };
}

/**
 * Nomad Wagon 初始状态。
 * 本阶段禁止建筑升级 → buildingLevel 固定为 1；展示位在进入 Hamlet 时才生成。
 */
export function createInitialNomadWagonState(): NomadWagonState {
  return {
    buildingLevel: 1,
    offerGenerated: false,
    offerGenerationDay: null,
    offerTransactionId: null,
    offeredTrinketIds: [],
    visitHeroId: null,
    visitActionId: null,
    soldInstanceId: null,
    purchasedTrinketId: null,
    purchasedInstanceId: null,
  };
}

/** 创建一件新的 Trinket 实例状态（始终从 Positive 面起始，关键规则 3）。 */
export function createTrinketInstance(input: {
  instanceId?: string;
  trinketId: string;
  source: HeroTrinketState['source'];
  sourceEventId: string;
  questId: string | null;
}): HeroTrinketState {
  return {
    instanceId: input.instanceId ?? createId('trk'),
    trinketId: input.trinketId,
    currentSide: 'positive',
    usedTurnId: null,
    lastUsedEventId: null,
    acquiredAt: nowIso(),
    acquiredQuestId: input.questId,
    source: input.source,
    sourceEventId: input.sourceEventId,
  };
}
