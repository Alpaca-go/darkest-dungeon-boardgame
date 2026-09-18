// Phase 11A.4R1 WP-1 / WP-5：Guardian Battle 内的房间级 Hero 站位（BattleState 侧）。
//
// Battle 引擎是纯 BattleState 函数，访问不到 Campaign 级 encounter state。
// Templars Body Slam 的 Pit Toss 在战斗内只写 `BattleState.communityRoomState`；
// campaign 级 `templarsEncounterState.heroPlacements / spikedPitRuntime` 由
// `synchronizeCommunityGuardianDeaths` 在结算点从本模块的数据回写（两边都进存档）。
//
// 来源约束：
// - Pit 目标只来自 Room Definition 的 pitTossD10Map（硬约束：不按 Pit 数量均分、不用下标）；
// - Pit 进入效果（Damage 5 + Bleed 3/3）只来自 Room Definition 的 spikedPits.entryEffects，
//   不在本模块硬编码数值；
// - Pit 容量取 Room Definition 的 areaCapacities；asset:f236b8:face verified
//   「no space → ignore Pit Toss」（不位移、不伤、不 Bleed），绝不改投其他 Pit、绝不重掷；
// - Pit **离开**规则仍是 TEMPLARS_PIT_EXIT_RULE_UNRESOLVED（SOURCE-BLOCKED），
//   本模块不提供任何出坑移动。

import type {
  BattleState,
  BattleUnit,
  CampaignState,
  CommunityGuardianRoomState,
  CommunityPitTossEvent,
} from '../../../types';
import { COMMUNITY_SHUFFLING_ROOM, COMMUNITY_TEMPLARS_ROOM } from '../../../data/darkest-dungeon/community-reference/production-adapters';
import { applyBattleUnitDamage } from '../../damage';
import { applyStatusEffectEvent } from '../../status-effects';
import { findUnit } from '../../initiative';

// ---------------------------------------------------------------------------
// Seeding（Guardian Battle 创建后调用一次）
// ---------------------------------------------------------------------------

/**
 * 从 Campaign 级 encounter state 播种 Battle 级房间站位。
 *
 * encounter 的 heroPlacements 以 campaign Hero instanceId 为 key；
 * BattleUnit.sourceId === instanceId（G06 已固定该约定），此处完成一次显式映射。
 * 非 community Guardian Battle 或未 Setup 时返回 null（调用方原样保留）。
 */
export function seedCommunityGuardianRoomState(campaign: CampaignState): CommunityGuardianRoomState | null {
  const battle = campaign.battle;
  if (!battle) return null;
  const templars = campaign.actFourState.templarsEncounterState;
  if (templars) {
    const heroAreas: CommunityGuardianRoomState['heroAreas'] = {};
    for (const unit of battle.heroes) {
      const placement = templars.heroPlacements.find((entry) => entry.heroId === unit.sourceId);
      if (placement) heroAreas[unit.id] = { areaId: placement.areaId, pitId: placement.pitId ?? null };
    }
    return { family: 'templars', roomId: templars.roomId, heroAreas, pitTossEvents: [] };
  }
  const mammoth = campaign.actFourState.mammothCystEncounterState;
  if (mammoth) {
    const heroAreas: CommunityGuardianRoomState['heroAreas'] = {};
    for (const unit of battle.heroes) {
      const placement = mammoth.heroPlacements.find((entry) => entry.heroId === unit.sourceId);
      if (placement) heroAreas[unit.id] = { areaId: placement.areaId, pitId: null };
    }
    return { family: 'mammoth-cyst', roomId: mammoth.roomId, heroAreas, pitTossEvents: [] };
  }
  const shuffling = campaign.actFourState.shufflingHorrorEncounterState;
  if (shuffling) {
    const heroAreas: CommunityGuardianRoomState['heroAreas'] = {};
    for (const unit of battle.heroes) {
      const assignment = shuffling.heroStanceAssignments.find((entry) => entry.heroId === unit.sourceId);
      if (assignment) heroAreas[unit.id] = { areaId: assignment.areaId, pitId: null };
    }
    return { family: 'shuffling-horror', roomId: COMMUNITY_SHUFFLING_ROOM.id, heroAreas, pitTossEvents: [] };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

/** 查询某 Hero BattleUnit 当前所在 Area（含 Pit）——WP-1 验收的唯一事实来源。 */
export function getCommunityHeroRoomArea(
  state: BattleState,
  heroUnitId: string,
): { areaId: string; pitId: string | null } | null {
  return state.communityRoomState?.heroAreas[heroUnitId] ?? null;
}

/** 某 Area 当前的 Hero 占用数（occupancy rule：仅统计存活 Hero；可排除一个）。 */
export function communityHeroAreaOccupancy(
  room: CommunityGuardianRoomState,
  areaId: string,
  state: BattleState,
  excludeHeroUnitId?: string,
): number {
  return Object.entries(room.heroAreas).filter(([unitId, area]) =>
    area.areaId === areaId &&
    unitId !== excludeHeroUnitId &&
    state.heroes.some((hero) => hero.id === unitId && hero.isAlive),
  ).length;
}

// ---------------------------------------------------------------------------
// Pit Toss（Body Slam 命中后）
// ---------------------------------------------------------------------------

export interface CommunityPitTossResult {
  state: BattleState;
  event: CommunityPitTossEvent;
  /** 目标 Pit 所在的普通 Area id（未掷骰 / 未命中映射时为 null）。 */
  pitAreaId: string | null;
}

/**
 * 执行一次 Battle 级 Pit Toss：
 *   d10（已由调用方掷出并落盘）→ Room Definition 映射 Pit → 容量校验 →
 *   Hero 真实位移（communityRoomState.heroAreas）→ Pit entry 效果（Damage + Bleed，
 *   数值全部取自 Room Definition）→ 写事件。
 *
 * no-space → ignore（asset:f236b8:face）：不位移、不伤、不 Bleed，事件记 ignored=true。
 */
export function applyCommunityPitToss(
  state: BattleState,
  heroUnit: BattleUnit,
  roll: number,
  eventId: string,
): CommunityPitTossResult {
  const room = state.communityRoomState;
  const eventBase = { eventId, heroId: heroUnit.id, roll };
  if (!room || room.family !== 'templars') {
    // 房间状态缺失属于引擎装配错误 —— 显式记为 ignored，绝不静默假位移。
    const event: CommunityPitTossEvent = { ...eventBase, pitId: null, areaId: null, ignored: true, reason: 'community room state unavailable' };
    return { state, event, pitAreaId: null };
  }

  const pitId = COMMUNITY_TEMPLARS_ROOM.pitTossD10Map[String(roll) as unknown as keyof typeof COMMUNITY_TEMPLARS_ROOM.pitTossD10Map] ?? null;
  const pit = pitId ? COMMUNITY_TEMPLARS_ROOM.spikedPits.find((candidate) => candidate.id === pitId) ?? null : null;
  if (!pitId || !pit) {
    const event: CommunityPitTossEvent = { ...eventBase, pitId, areaId: null, ignored: true, reason: `no pit mapped for roll ${roll}` };
    return { state: withPitTossEvent(state, event), event, pitAreaId: null };
  }

  const areaId = pit.areaId;
  const capacity = COMMUNITY_TEMPLARS_ROOM.areaCapacities[areaId];
  const occupancy = communityHeroAreaOccupancy(room, areaId, state, heroUnit.id);
  if (typeof capacity === 'number' && occupancy >= capacity) {
    // asset:f236b8:face verified：no space → ignore Pit Toss（不重掷、不改投）。
    const event: CommunityPitTossEvent = { ...eventBase, pitId, areaId, ignored: true, reason: `pit area ${areaId} has no space (${occupancy}/${capacity})` };
    return { state: withPitTossEvent(state, event), event, pitAreaId: null };
  }

  // ---- 真实位移（先离开原 Area / 原 Pit：heroAreas 单条覆盖，§25 不会同时位于两个 Area）----
  let next: BattleState = {
    ...state,
    communityRoomState: {
      ...room,
      heroAreas: { ...room.heroAreas, [heroUnit.id]: { areaId, pitId } },
    },
  };

  // ---- Pit entry 效果：数值只来自 Room Definition 的 entryEffects；缺数值即数据缺陷，显式报错 ----
  let target = findUnit(next, heroUnit.id) ?? heroUnit;
  for (const effect of pit.entryEffects) {
    if (effect.kind === 'damage') {
      if (typeof effect.amount !== 'number') throw new Error(`Pit ${pit.id} entry damage amount missing from Room Definition`);
      const applied = applyBattleUnitDamage(target, effect.amount);
      target = applied.unit;
      next = setUnit(next, target);
    } else if (effect.kind === 'condition' && effect.condition === 'bleed' && target.isAlive) {
      if (typeof effect.amount !== 'number' || typeof effect.duration !== 'number') throw new Error(`Pit ${pit.id} entry bleed effect missing amount/duration in Room Definition`);
      next = applyStatusEffectEvent(next, target.id, [{ type: 'bleed', amount: effect.amount, durationTurns: effect.duration }], `${eventId}:pit-entry`);
      target = findUnit(next, target.id) ?? target;
    }
  }

  const event: CommunityPitTossEvent = { ...eventBase, pitId, areaId, ignored: false, reason: null };
  return { state: withPitTossEvent(next, event), event, pitAreaId: areaId };
}

function withPitTossEvent(state: BattleState, event: CommunityPitTossEvent): BattleState {
  const room = state.communityRoomState;
  if (!room) return state;
  return { ...state, communityRoomState: { ...room, pitTossEvents: [...room.pitTossEvents, event].slice(-200) } };
}

function setUnit(state: BattleState, unit: BattleUnit): BattleState {
  return {
    ...state,
    heroes: state.heroes.map((candidate) => (candidate.id === unit.id ? unit : candidate)),
    monsters: state.monsters.map((candidate) => (candidate.id === unit.id ? unit : candidate)),
  };
}

// ---------------------------------------------------------------------------
// 房间图移动（供同步 / 测试断言；Displace 的 Push 走 campaign 级 Room 11 图）
// ---------------------------------------------------------------------------

export interface CommunityRoomGraph {
  areas: string[];
  capacities: Record<string, number>;
  edges: Array<[string, string]>;
}

/** 当前 Battle 房间对应的正式拓扑（来自已接受 tileGeometry 的派生边）。 */
export function communityBattleRoomGraph(state: BattleState): CommunityRoomGraph | null {
  const room = state.communityRoomState;
  if (!room) return null;
  if (room.family === 'templars') {
    return {
      areas: COMMUNITY_TEMPLARS_ROOM.validAreaIds,
      capacities: COMMUNITY_TEMPLARS_ROOM.areaCapacities,
      edges: COMMUNITY_TEMPLARS_ROOM.areaGraph.edges.map((edge) => [edge.from, edge.to]),
    };
  }
  return null;
}

/** BFS 最短距离（无路径返回 null）。 */
export function communityRoomDistance(edges: Array<[string, string]>, from: string, to: string): number | null {
  if (from === to) return 0;
  const graph = new Map<string, string[]>();
  for (const [a, b] of edges) {
    graph.set(a, [...(graph.get(a) ?? []), b]);
    graph.set(b, [...(graph.get(b) ?? []), a]);
  }
  const visited = new Set<string>([from]);
  let frontier = [from];
  let distance = 0;
  while (frontier.length > 0) {
    distance += 1;
    const next: string[] = [];
    for (const node of frontier) {
      for (const neighbor of graph.get(node) ?? []) {
        if (visited.has(neighbor)) continue;
        if (neighbor === to) return distance;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return null;
}
