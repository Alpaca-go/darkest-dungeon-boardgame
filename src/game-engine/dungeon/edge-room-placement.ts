// Phase 9A §9.1-§9.3：Edge Room 识别、Boss Objective Room 放置与地图验证。
//
// 纪律：
// - Edge Room 只由**图结构**判定（邻接数 === 1），不得依赖屏幕坐标或节点命名（§9.1）。
// - 放置结果必须落盘，刷新/读档不得重新随机（§9.3）。
// - 随机一律走可注入 RNG（src/game-engine/random.ts），保证测试可复现。

import type { DungeonNodeDef } from '../../data/dungeons';
import { shuffle } from '../random';

/** 地图验证问题。 */
export interface BossDungeonIssue {
  kind:
    | 'no-legal-edge-room'
    | 'objective-missing'
    | 'objective-not-edge'
    | 'objective-is-start'
    | 'objective-unreachable'
    | 'duplicate-room-id'
    | 'graph-broken'
    | 'multiple-objective';
  message: string;
  roomId?: string;
}

/** Boss Objective Room 放置结果（供落盘）。 */
export interface BossObjectivePlacement {
  edgeRoomIds: string[];
  candidateRoomIds: string[];
  objectiveRoomId: string;
}

/**
 * §9.1：Edge Room = 只有一条通路与其他房间相连的房间。
 * 返回顺序与输入节点顺序一致（稳定，便于测试断言）。
 */
export function getEdgeRoomIds(nodes: DungeonNodeDef[]): string[] {
  return nodes.filter((n) => n.adjacentRoomIds.length === 1).map((n) => n.id);
}

/** §9.2 步骤 3-4：排除 Start Room 后的合法 Boss Edge Room。 */
export function getLegalBossEdgeRoomIds(nodes: DungeonNodeDef[], startRoomId: string): string[] {
  return getEdgeRoomIds(nodes).filter((id) => id !== startRoomId);
}

/** 从 startRoomId 出发可达的房间集合（BFS，双向连通性以邻接表为准）。 */
export function getReachableRoomIds(nodes: DungeonNodeDef[], startRoomId: string): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  if (!byId.has(startRoomId)) return seen;
  const queue = [startRoomId];
  seen.add(startRoomId);
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const next of byId.get(cur)?.adjacentRoomIds ?? []) {
      if (seen.has(next) || !byId.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * §9.2：把 1 个 Objective Token 与足够的普通 Room Token 混合后用 RNG 分配到 Edge Rooms。
 *
 * 注意当前地牢拓扑（start-A-B-C / A-D-E-B）下，排除 Start 后唯一的 Edge Room 是 C，
 * 因此结果是确定的。这里仍然走「洗牌 Token」流程，是为了在拓扑变复杂后
 * 无需改动调用方即可正确工作。
 *
 * @throws 当不存在任何合法 Edge Room 时抛错 —— 属于地图生成缺陷，必须显式暴露（§9.2 步骤 4）。
 */
export function placeBossObjectiveRoom(
  nodes: DungeonNodeDef[],
  startRoomId: string
): BossObjectivePlacement {
  const edgeRoomIds = getLegalBossEdgeRoomIds(nodes, startRoomId);
  if (edgeRoomIds.length === 0) {
    throw new Error('Boss 地牢生成失败：不存在排除 Start Room 后的合法 Edge Room');
  }

  // Token 数量与候选房间数量一致：1 个 objective + N-1 个 normal。
  const tokens: ('objective' | 'normal')[] = [
    'objective',
    ...Array.from({ length: edgeRoomIds.length - 1 }, () => 'normal' as const),
  ];
  const shuffled = shuffle(tokens);
  const objectiveIndex = shuffled.indexOf('objective');

  return {
    edgeRoomIds,
    candidateRoomIds: edgeRoomIds,
    objectiveRoomId: edgeRoomIds[objectiveIndex],
  };
}

/**
 * §9.3：Boss 地牢验证。只返回问题列表，由调用方决定是重生成还是报错，
 * 避免在生成流程里抛异常导致存档半写入。
 */
export function validateBossDungeon(params: {
  nodes: DungeonNodeDef[];
  startRoomId: string;
  objectiveRoomId: string | null;
  /** 已落盘的 Objective Room 列表（用于检查「只有一个 Boss Objective Room」）。 */
  objectiveRoomIdsInMap?: string[];
}): BossDungeonIssue[] {
  const { nodes, startRoomId, objectiveRoomId } = params;
  const issues: BossDungeonIssue[] = [];

  // Room ID 唯一
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) {
      issues.push({ kind: 'duplicate-room-id', roomId: n.id, message: `房间 id 重复：${n.id}` });
    }
    seen.add(n.id);
  }

  // Graph 无断裂：邻接引用必须存在，且全图从 Start 可达
  for (const n of nodes) {
    for (const adj of n.adjacentRoomIds) {
      if (!seen.has(adj)) {
        issues.push({
          kind: 'graph-broken',
          roomId: n.id,
          message: `房间 ${n.id} 的邻接 ${adj} 不存在`,
        });
      }
    }
  }
  const reachable = getReachableRoomIds(nodes, startRoomId);
  for (const n of nodes) {
    if (!reachable.has(n.id)) {
      issues.push({
        kind: 'graph-broken',
        roomId: n.id,
        message: `房间 ${n.id} 从 Start Room 不可达`,
      });
    }
  }

  const legalEdges = getLegalBossEdgeRoomIds(nodes, startRoomId);
  if (legalEdges.length === 0) {
    issues.push({ kind: 'no-legal-edge-room', message: '不存在排除 Start Room 后的合法 Edge Room' });
  }

  if (!objectiveRoomId) {
    issues.push({ kind: 'objective-missing', message: 'Boss Objective Room 未设置' });
    return issues;
  }
  if (objectiveRoomId === startRoomId) {
    issues.push({
      kind: 'objective-is-start',
      roomId: objectiveRoomId,
      message: 'Boss Objective Room 不得是 Start Room',
    });
  }
  if (!legalEdges.includes(objectiveRoomId)) {
    issues.push({
      kind: 'objective-not-edge',
      roomId: objectiveRoomId,
      message: `Boss Objective Room ${objectiveRoomId} 不是合法 Edge Room`,
    });
  }
  if (!reachable.has(objectiveRoomId)) {
    issues.push({
      kind: 'objective-unreachable',
      roomId: objectiveRoomId,
      message: `Boss Objective Room ${objectiveRoomId} 从 Start Room 不可达`,
    });
  }

  const objectivesInMap = params.objectiveRoomIdsInMap;
  if (objectivesInMap && objectivesInMap.length > 1) {
    issues.push({
      kind: 'multiple-objective',
      message: `Boss 地牢中存在多个 Objective Room：${objectivesInMap.join(', ')}`,
    });
  }

  return issues;
}
