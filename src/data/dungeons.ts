import type { DungeonRoomType } from '../types';

// 节点式地牢的拓扑与房间类型模板（Phase 2 简化，固定地图）。
//
// 拓扑（开发文档第 6.5 节）：
//   Start - A - B - C
//           |   |
//           D - E
//
// 队伍从 Start 出发，只能沿相邻连线移动。每个节点分配一个房间类型，
// 模板保证至少包含 1 个 Battle 与 1 个 Objective，便于跑通 Phase 2 验收。

export interface DungeonNodeDef {
  id: string;
  adjacentRoomIds: string[];
  /** 生成时默认分配的类型（start 固定为 start）。 */
  templateType: DungeonRoomType;
}

export const DUNGEON_NODES: DungeonNodeDef[] = [
  { id: 'start', adjacentRoomIds: ['A'], templateType: 'start' },
  { id: 'A', adjacentRoomIds: ['start', 'B', 'D'], templateType: 'battle' },
  { id: 'B', adjacentRoomIds: ['A', 'C', 'E'], templateType: 'objective' },
  { id: 'C', adjacentRoomIds: ['B'], templateType: 'treasure' },
  { id: 'D', adjacentRoomIds: ['A', 'E'], templateType: 'trap' },
  { id: 'E', adjacentRoomIds: ['B', 'D'], templateType: 'empty' },
];

/**
 * 不同任务可复用同一拓扑，但房间类型按模板微调以增加变化。
 * 每个模板都保证存在 battle 与 objective 房间。
 */
const TYPE_TEMPLATES: Record<string, Record<string, DungeonRoomType>> = {
  'scout-ahead': {
    A: 'battle',
    B: 'objective',
    C: 'treasure',
    D: 'trap',
    E: 'empty',
  },
  'recover-relic': {
    A: 'objective',
    B: 'battle',
    C: 'empty',
    D: 'treasure',
    E: 'trap',
  },
};

const DEFAULT_TEMPLATE: Record<string, DungeonRoomType> = {
  A: 'battle',
  B: 'objective',
  C: 'treasure',
  D: 'trap',
  E: 'empty',
};

/** 根据任务 id 取得节点 → 房间类型的映射。 */
export function roomTypeMapForQuest(questId: string): Record<string, DungeonRoomType> {
  return TYPE_TEMPLATES[questId] ?? DEFAULT_TEMPLATE;
}
