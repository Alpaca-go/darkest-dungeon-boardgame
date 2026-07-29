import type { CampaignState, DungeonRoom, DungeonState } from '../types';
import { DUNGEON_NODES, roomTypeMapForQuest } from '../data/dungeons';
import { pick } from './random';
import { initBattle } from './battle';
import { pushLog } from './log';
import { resolveExplorationEvent } from './exploration';

/** 宝藏房间固定奖励。 */
export const TREASURE_GOLD = 20;

/**
 * 根据任务生成一张固定拓扑的地牢地图。
 * 起点为 current，其余房间初始隐藏，类型由任务模板决定。
 */
export function generateDungeon(questId: string): DungeonState {
  const typeMap = roomTypeMapForQuest(questId);
  const rooms: DungeonRoom[] = DUNGEON_NODES.map((node) => ({
    id: node.id,
    type: typeMap[node.id] ?? node.templateType,
    status: node.id === 'start' ? 'current' : 'hidden',
    adjacentRoomIds: [...node.adjacentRoomIds],
  }));
  return {
    questId,
    currentRoomId: 'start',
    previousRoomId: null,
    rooms,
    scoutedNextMove: false,
    roomsCleared: 0,
    objectiveComplete: false,
    canLeave: true,
  };
}

/** 当前房间是否还有可揭示（hidden）的相邻房间。 */
export function canScout(dungeon: DungeonState): boolean {
  const current = dungeon.rooms.find((r) => r.id === dungeon.currentRoomId);
  if (!current) return false;
  return current.adjacentRoomIds.some((id) => {
    const r = dungeon.rooms.find((x) => x.id === id);
    return r?.status === 'hidden';
  });
}

/** 揭示当前房间相邻的 hidden 房间（改为 revealed）。 */
export function revealAdjacentRooms(dungeon: DungeonState): DungeonState {
  const current = dungeon.rooms.find((r) => r.id === dungeon.currentRoomId);
  if (!current) return dungeon;
  const rooms = dungeon.rooms.map((r) =>
    current.adjacentRoomIds.includes(r.id) && r.status === 'hidden'
      ? { ...r, status: 'revealed' as const }
      : r
  );
  return { ...dungeon, rooms };
}

/** 判断 roomId 是否为当前房间的相邻房间（可移动）。 */
export function canMoveTo(dungeon: DungeonState, roomId: string): boolean {
  const current = dungeon.rooms.find((r) => r.id === dungeon.currentRoomId);
  if (!current) return false;
  return current.adjacentRoomIds.includes(roomId);
}

/** Scout：揭示相邻隐藏房间，全队 Stress +1，记录日志。 */
export function scoutDungeon(campaign: CampaignState): CampaignState {
  if (!campaign.dungeon || !canScout(campaign.dungeon)) return campaign;
  let next: CampaignState = {
    ...campaign,
    dungeon: { ...revealAdjacentRooms(campaign.dungeon), scoutedNextMove: true },
  };
  next = {
    ...next,
    heroes: next.heroes.map((h) => ({ ...h, stress: h.stress + 1 })),
  };
  next = pushLog(next, '小队进行了侦察（Scout），相邻房间被揭示，全队压力 +1。', 'warning');
  return next;
}

/**
 * 进入房间并结算房间结果（不重复触发已访问/已清除房间）。
 * 返回更新后的 campaign（地牢状态与游戏阶段可能变化）。
 */
function applyRoomResult(campaign: CampaignState, room: DungeonRoom): CampaignState {
  const dungeon = campaign.dungeon!;
  const log = (c: CampaignState, msg: string, kind: 'info' | 'success' | 'warning' | 'danger' = 'info') =>
    pushLog(c, msg, kind);

  switch (room.type) {
    case 'empty': {
      const updated = markRoom(dungeon, room.id, 'cleared');
      const c: CampaignState = { ...campaign, dungeon: { ...updated, roomsCleared: updated.roomsCleared + 1 } };
      return log(c, '进入空房间，已安全清除。', 'success');
    }
    case 'treasure': {
      const updated = markRoom(dungeon, room.id, 'cleared');
      const c: CampaignState = {
        ...campaign,
        gold: campaign.gold + TREASURE_GOLD,
        dungeon: { ...updated, roomsCleared: updated.roomsCleared + 1 },
      };
      return log(c, `发现宝藏，获得 ${TREASURE_GOLD} Gold。`, 'success');
    }
    case 'objective': {
      const updated = markRoom(dungeon, room.id, 'cleared');
      const c: CampaignState = {
        ...campaign,
        dungeon: {
          ...updated,
          roomsCleared: updated.roomsCleared + 1,
          objectiveComplete: true,
        },
      };
      return log(c, '抵达目标房间，任务目标已完成！', 'success');
    }
    case 'trap': {
      // 消耗 Tool 拆除；不足则随机英雄受伤、全队压力上升。陷阱房间保持已访问（不清除）。
      let c: CampaignState = campaign;
      if (c.provisions.tool > 0) {
        c = { ...c, provisions: { ...c.provisions, tool: c.provisions.tool - 1 } };
        return log(c, '触发陷阱，消耗 1 Tool 将其拆除。', 'warning');
      }
      const victim = pick(c.heroes.filter((h) => h.isAlive));
      c = {
        ...c,
        heroes: c.heroes.map((h) => ({
          ...h,
          wounds: h.instanceId === victim?.instanceId ? h.wounds + 1 : h.wounds,
          stress: h.stress + 1,
        })),
      };
      c = { ...c, dungeon: markRoom(c.dungeon!, room.id, 'visited') };
      return log(c, '陷阱触发且无 Tool，随机英雄受 1 Wound，全队压力 +1！', 'danger');
    }
    case 'battle': {
      // Phase 3：初始化完整战斗并切入战斗阶段。
      const c = initBattle(campaign, room.id);
      return log(c, '进入战斗房间，遭遇敌人！', 'danger');
    }
    default:
      return campaign;
  }
}

/** 将某房间标记为指定状态，返回新的 dungeon。 */
function markRoom(
  dungeon: DungeonState,
  roomId: string,
  status: DungeonRoom['status']
): DungeonState {
  return {
    ...dungeon,
    rooms: dungeon.rooms.map((r) => (r.id === roomId ? { ...r, status } : r)),
  };
}

/**
 * 移动到指定房间：先结算走廊探索事件，再进入房间。
 * 非相邻房间直接忽略（调用方应已禁用）。返回更新后的 campaign。
 */
export function moveToRoom(campaign: CampaignState, roomId: string): CampaignState {
  if (!campaign.dungeon) return campaign;
  if (!canMoveTo(campaign.dungeon, roomId)) return campaign;

  // 1) 走廊探索事件（随机）
  let next = resolveExplorationEvent(campaign);

  // 2) 进入房间：更新当前/上一房间状态
  const dungeon = next.dungeon!;
  const target = dungeon.rooms.find((r) => r.id === roomId);
  if (!target) return next;
  const oldCurrentId = dungeon.currentRoomId;

  let rooms = dungeon.rooms.map((r) => {
    if (r.id === oldCurrentId && r.status === 'current') return { ...r, status: 'visited' as const };
    if (r.id === roomId) return { ...r, status: 'current' as const };
    return r;
  });

  let updatedDungeon: DungeonState = {
    ...dungeon,
    rooms,
    previousRoomId: oldCurrentId,
    currentRoomId: roomId,
    scoutedNextMove: false,
  };
  next = { ...next, dungeon: updatedDungeon };

  // 3) 仅首次进入（hidden/revealed）时结算房间结果
  if (target.status === 'hidden' || target.status === 'revealed') {
    next = applyRoomResult(next, target);
  }

  return next;
}

/** 撤退/战败后返回地牢：清除战斗状态，战斗房间标记为已访问（未清除）。 */
export function retreatFromBattle(campaign: CampaignState): CampaignState {
  if (!campaign.dungeon) return { ...campaign, gamePhase: 'dungeon-explore', battle: null };
  const dungeon = markRoom(campaign.dungeon, campaign.dungeon.currentRoomId, 'visited');
  return {
    ...campaign,
    gamePhase: 'dungeon-explore',
    battle: null,
    dungeon: { ...dungeon, canLeave: true },
  };
}
