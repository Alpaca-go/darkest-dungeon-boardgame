import type { CampaignState, ExplorationEventResult, DungeonRoom, DungeonRoomType, DungeonState, QuestDefinition } from '../types';
import { DUNGEON_NODES, roomTypeMapForQuest } from '../data/dungeons';
import { CURIOS } from '../data/curios';
import { createId, d10, pick } from './random';
import { initBattle } from './battle';
import { pushLog } from './log';
import { applyExplorationResult, rollExplorationResult } from './exploration';
import { resolveDamage } from './damage';
import { applyStressBatch } from './stress';
import { createRuleEventContext, emitPartyRuleEvent } from './quirks';
import { drawTrinket } from './trinkets/draw-trinket';
import { acquireTrinket } from './trinkets/acquire-trinket';
import type { MentalEventSourceType } from '../types';
import { runtimeContentContext } from '../data/content-selector';
import { getQuestById } from '../data/quests';
import type { QuestRoomTokenType } from '../types/content-runtime';
import { recordQuestQualificationEvent } from './quests/quest-runtime';
import { necromancerQuestEntryError } from './bosses/production-dependency-gate';

/** Phase 7：全队压力统一入口（存活英雄各 +amount，走统一管线处理阈值）。 */
function applyPartyStress(
  campaign: CampaignState,
  amount: number,
  sourceType: MentalEventSourceType,
  sourceId: string
): CampaignState {
  const batchId = createId('sbatch');
  const inputs = campaign.heroes
    .filter((h) => !h.dead)
    .map((h) => ({
      heroId: h.instanceId,
      amount,
      sourceType,
      sourceId,
      questId: campaign.currentQuestId ?? '',
      batchId,
    }));
  return applyStressBatch(campaign, inputs).campaign;
}

/** 宝藏房间固定奖励。 */
export const TREASURE_GOLD = 20;

/**
 * 根据任务生成一张固定拓扑的地牢地图。
 * 起点为 current，其余房间初始隐藏，类型由任务模板决定。
 */
const COMMUNITY_ROOM_NODES = [
  { id: 'start', adjacentRoomIds: ['A'] },
  { id: 'A', adjacentRoomIds: ['start', 'B', 'E'] },
  { id: 'B', adjacentRoomIds: ['A', 'C', 'F'] },
  { id: 'C', adjacentRoomIds: ['B', 'D'] },
  { id: 'D', adjacentRoomIds: ['C'] },
  { id: 'E', adjacentRoomIds: ['A', 'F'] },
  { id: 'F', adjacentRoomIds: ['E', 'B', 'G'] },
  { id: 'G', adjacentRoomIds: ['F', 'H'] },
  { id: 'H', adjacentRoomIds: ['G'] },
] as const;

function stableSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash || 1;
}

function deterministicShuffle<T>(values: readonly T[], seedText: string): T[] {
  const result = [...values];
  let seed = stableSeed(seedText);
  for (let index = result.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const target = seed % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

const tokenToRuntimeType = (token: QuestRoomTokenType): DungeonRoomType => {
  if (token === 'lair') return 'battle';
  if (token === 'dark' || token === 'curio') return 'empty';
  return token;
};

export const QUEST_ROOM_TOKEN_BEHAVIOR_MATRIX = Object.freeze({
  empty: { sourceSemantic: 'automatically cleared', runtimeRoomType: 'empty', runtimeBehavior: 'clear-on-entry', qualificationBehavior: 'records room clear' },
  dark: { sourceSemantic: 'Light -1; cannot be cleared', runtimeRoomType: 'empty', runtimeBehavior: 'light-loss-and-visited', qualificationBehavior: 'never qualifies as cleared' },
  curio: { sourceSemantic: 'guard roll; battle on 1-5; interact; then clear', runtimeRoomType: 'empty', runtimeBehavior: 'guard-roll-battle-or-interaction', qualificationBehavior: 'records after interaction' },
  treasure: { sourceSemantic: 'guarded battle; 20 Gold after clear', runtimeRoomType: 'treasure', runtimeBehavior: 'battle-then-reward', qualificationBehavior: 'records after victory' },
  lair: { sourceSemantic: 'guarded battle', runtimeRoomType: 'battle', runtimeBehavior: 'battle', qualificationBehavior: 'records after victory' },
  trap: { sourceSemantic: 'party hazard; cannot be cleared', runtimeRoomType: 'trap', runtimeBehavior: 'tool-or-party-stress-and-visited', qualificationBehavior: 'never qualifies as cleared' },
} satisfies Record<Exclude<QuestRoomTokenType, 'objective'>, { sourceSemantic: string; runtimeRoomType: DungeonRoomType; runtimeBehavior: string; qualificationBehavior: string }>);

export function generateCommunityDungeon(quest: QuestDefinition, seed = quest.id): DungeonState {
  if (!quest.dungeonComposition) throw new Error(`Community Quest has no source composition: ${quest.id}`);
  const tokens = quest.dungeonComposition.roomTokens.flatMap(({ roomType, count }) =>
    Array.from({ length: count }, () => roomType));
  if (tokens.length !== quest.roomCount || tokens.length !== COMMUNITY_ROOM_NODES.length - 1) {
    throw new Error(`Community Quest room composition mismatch: ${quest.id}`);
  }
  const arranged = deterministicShuffle(tokens, `${quest.id}:${seed}`);
  const rooms: DungeonRoom[] = COMMUNITY_ROOM_NODES.map((node, index) => {
    if (node.id === 'start') {
      return { id: node.id, type: 'start', status: 'current', adjacentRoomIds: [...node.adjacentRoomIds], curioId: null, curioUsed: false };
    }
    const sourceRoomToken = arranged[index - 1];
    const curioIndex = stableSeed(`${quest.id}:${seed}:${node.id}`) % CURIOS.length;
    return {
      id: node.id,
      type: tokenToRuntimeType(sourceRoomToken),
      sourceRoomToken,
      status: 'hidden',
      adjacentRoomIds: [...node.adjacentRoomIds],
      curioId: sourceRoomToken === 'curio' ? CURIOS[curioIndex]?.id ?? null : null,
      curioUsed: false,
    };
  });
  return {
    questId: quest.id,
    questRunId: createId('qrun'),
    currentRoomId: 'start',
    previousRoomId: null,
    rooms,
    scoutedNextMove: false,
    roomsCleared: 0,
    objectiveComplete: false,
    canLeave: true,
  };
}

export function generateDungeonForQuest(quest: QuestDefinition, seed = quest.id): DungeonState {
  return quest.runtimeContentMetadata?.sourceOrigin === 'community-complete-edition'
    ? generateCommunityDungeon(quest, seed)
    : generateLegacyDungeon(quest.id);
}

function generateLegacyDungeon(questId: string): DungeonState {
  const typeMap = roomTypeMapForQuest(questId);
  const rooms: DungeonRoom[] = DUNGEON_NODES.map((node) => ({
    id: node.id,
    type: typeMap[node.id] ?? node.templateType,
    status: node.id === 'start' ? 'current' : 'hidden',
    adjacentRoomIds: [...node.adjacentRoomIds],
    // Phase 8B：起点外的每个房间随机放置一个 Curio（约 1/2 概率），起点永远没有
    curioId: node.id === 'start' ? null : d10() <= 5 ? pick(CURIOS).id : null,
    curioUsed: false,
  }));
  return {
    questId,
    // Phase 11A.1 §20：Quest Run 唯一 id，用于 standard-complete 事务幂等。
    questRunId: createId('qrun'),
    currentRoomId: 'start',
    previousRoomId: null,
    rooms,
    scoutedNextMove: false,
    roomsCleared: 0,
    objectiveComplete: false,
    canLeave: true,
  };
}

export function generateDungeon(questId: string, seed = questId): DungeonState {
  const quest = getQuestById(questId);
  return quest ? generateDungeonForQuest(quest, seed) : generateLegacyDungeon(questId);
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
  next = applyPartyStress(next, 1, 'scout', 'scout');
  next = pushLog(next, '小队进行了侦察（Scout），相邻房间被揭示，全队压力 +1。', 'warning');
  // Phase 8A：scout-attempted 时机事件（Fear of the Unknown 等）
  next = emitPartyRuleEvent(next, 'scout-attempted', createRuleEventContext());
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

  if (room.sourceRoomToken === 'dark') {
    const updated = markRoom(dungeon, room.id, 'visited');
    return log({ ...campaign, light: Math.max(0, campaign.light - 1), dungeon: updated }, '进入 Dark Room：Light -1；该房间不能被清除。', 'warning');
  }
  if (room.sourceRoomToken === 'curio') {
    const guardRoll = d10();
    if (guardRoll <= 5) {
      return log(initBattle(campaign, room.id), `Curio Room 守卫判定 ${guardRoll}：遭遇战斗。`, 'danger');
    }
    return log({
      ...campaign,
      dungeon: {
        ...dungeon,
        rooms: dungeon.rooms.map((entry) => entry.id === room.id ? { ...entry, curioGuardResolved: true } : entry),
      },
    }, `Curio Room 守卫判定 ${guardRoll}：无守卫；完成 Curio 互动后清除。`, 'success');
  }
  if (room.sourceRoomToken === 'treasure') {
    return log(initBattle(campaign, room.id), 'Treasure Room 由怪物守卫；战斗胜利后获得宝藏。', 'danger');
  }
  if (room.sourceRoomToken === 'trap') {
    let next = campaign;
    if (next.provisions.tool > 0) {
      next = { ...next, provisions: { ...next.provisions, tool: next.provisions.tool - 1 } };
      next = { ...next, dungeon: markRoom(next.dungeon!, room.id, 'visited') };
      return log(next, '使用 1 Tool 忽略 Trap Room；该房间不能被清除。', 'warning');
    }
    const level = Math.max(1, getQuestById(campaign.currentQuestId ?? '')?.dungeonLevel ?? 1);
    next = applyPartyStress(next, level, 'exploration', `trap-room:${room.id}`);
    next = { ...next, dungeon: markRoom(next.dungeon!, room.id, 'visited') };
    return log(next, `Trap Room：每名英雄承受 ${level} Stress；该房间不能被清除。`, 'danger');
  }

  switch (room.type) {
    case 'empty': {
      const updated = markRoom(dungeon, room.id, 'cleared');
      const c: CampaignState = { ...campaign, dungeon: { ...updated, roomsCleared: updated.roomsCleared + 1 } };
      return log(recordQuestQualificationEvent(c, room), '进入空房间，已安全清除。', 'success');
    }
    case 'treasure': {
      const updated = markRoom(dungeon, room.id, 'cleared');
      let c: CampaignState = {
        ...campaign,
        gold: campaign.gold + TREASURE_GOLD,
        dungeon: { ...updated, roomsCleared: updated.roomsCleared + 1 },
      };
      c = log(c, `发现宝藏，获得 ${TREASURE_GOLD} Gold。`, 'success');
      // Phase 8C §15.1：Loot Chest 抽取 Trinket。
      // - 先抽取并立即通过 acquireTrinket 写入存档（equipped / pending-allocation），
      //   刷新后由存档恢复，绝不重抽（房间已 cleared + sourceEventId 幂等双保险）；
      // - 官方池只出 verified 卡；池为空（异常情况）则安全跳过，不白屏。
      const lootEventId = `loot:${dungeon.questId}:${room.id}`;
      const draw = drawTrinket({
        level: 1,
        pool: 'official',
        runtimeContext: runtimeContentContext(campaign),
      });
      if (draw.definition) {
        c = acquireTrinket(c, {
          trinketId: draw.definition.id,
          source: 'loot',
          sourceEventId: lootEventId,
          questId: dungeon.questId,
        }).campaign;
      }
      return recordQuestQualificationEvent(c, room);
    }
    case 'objective': {
      const updated = markRoom(dungeon, room.id, 'cleared');
      const c: CampaignState = {
        ...campaign,
        dungeon: {
          ...updated,
          roomsCleared: updated.roomsCleared + 1,
          objectiveComplete: (campaign.questRuntimeState?.questTokens?.length ?? 0) === 0,
        },
      };
      return log(recordQuestQualificationEvent(c, room), '抵达目标房间，任务目标已完成！', 'success');
    }
    case 'trap': {
      // 消耗 Tool 拆除；不足则随机英雄受伤、全队压力上升。陷阱房间保持已访问（不清除）。
      let c: CampaignState = campaign;
      if (c.provisions.tool > 0) {
        c = { ...c, provisions: { ...c.provisions, tool: c.provisions.tool - 1 } };
        c = { ...c, dungeon: markRoom(c.dungeon!, room.id, 'visited') };
        return log(c, '触发陷阱，消耗 1 Tool 忽略其效果；该房间不能被清除。', 'warning');
      }
      // Phase 6：陷阱伤害统一走 resolveDamage（Death's Door / Deathblow 生效）
      const victim = pick(c.heroes.filter((h) => !h.dead));
      if (victim) {
        c = resolveDamage(c, {
          targetId: victim.instanceId,
          amount: 1,
          sourceType: 'trap',
          eventId: createId('trap'),
        }).campaign;
      }
      c = applyPartyStress(c, 1, 'exploration', 'trap-room');
      c = { ...c, dungeon: markRoom(c.dungeon!, room.id, 'visited') };
      return log(c, '陷阱触发且无 Tool，随机英雄受 1 伤害，全队压力 +1！', 'danger');
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
  if (!campaign.dungeon || !canMoveTo(campaign.dungeon, roomId)) return campaign;
  return commitMoveToRoom(campaign, roomId, rollExplorationResult());
}

export function commitMoveToRoom(campaign: CampaignState, roomId: string, result: ExplorationEventResult | null): CampaignState {
  if (campaign.dungeon?.rooms.some(r => r.id === roomId && r.type === 'objective')
    && necromancerQuestEntryError(campaign, campaign.currentQuestId ?? '')) return campaign;
  if (!campaign.dungeon) return campaign;
  if (!canMoveTo(campaign.dungeon, roomId)) return campaign;

  // 1) 提交调用方已冻结的走廊探索结果；null 表示忽略。
  let next = result === null ? campaign : applyExplorationResult(campaign, result);

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

  // 3) Phase 8A：room-entered 时机事件（Stress Eater / Hopeless 等），
  //    先于房间结算，保证补给消耗在陷阱/战斗判定之前生效
  next = emitPartyRuleEvent(next, 'room-entered', createRuleEventContext());

  // 4) 仅首次进入（hidden/revealed）时结算房间结果
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
