// Phase 10A §9：Darkest Dungeon Layout Registry（两张红边 Layout Tile）+ Data Gate。
//
// 硬约束 5：Boss Slot 由 Layout 自带（bossSlotIds），**不使用 Phase 9A 的 Edge Room 算法**。
// 硬约束 19：Layout 不完整时 official Quest 禁用。
//
// 数据现状（docs/data/darkest-dungeon/darkest-dungeon-layout.template.json）：
// roomSlotIds = []、bossSlotIds = ["", "", ""]、startRoomSlotId = ""，officialDataStatus = unavailable。
// 硬约束「不根据 Layout 图片猜 Boss Slot ID」→ 正式两张 Layout 保持空，仅提供 prototype harness。

import type {
  CorridorDefinition,
  DarkestDungeonLayoutDefinition,
} from '../../types/act-four';
import type { RegistryValidationIssue } from '../../types/progression';

/** 规则固定：16 Room Slot / 3 Boss Slot。 */
export const DARKEST_DUNGEON_ROOM_SLOT_COUNT = 16 as const;
export const DARKEST_DUNGEON_BOSS_SLOT_COUNT = 3 as const;

export const OFFICIAL_DARKEST_DUNGEON_LAYOUT_IDS = [
  'darkest-dungeon-layout-red-1',
  'darkest-dungeon-layout-red-2',
] as const;

export const PROTOTYPE_DARKEST_DUNGEON_LAYOUT_IDS = [
  'prototype-darkest-dungeon-layout-a',
  'prototype-darkest-dungeon-layout-b',
] as const;

// ---------------------------------------------------------------------------
// 正式 Layout（刻意留空 → Data Gate）
// ---------------------------------------------------------------------------

export const OFFICIAL_DARKEST_DUNGEON_LAYOUTS: DarkestDungeonLayoutDefinition[] =
  OFFICIAL_DARKEST_DUNGEON_LAYOUT_IDS.map((id) => ({
    id,
    name: '',
    roomSlotIds: [],
    corridorDefinitions: [],
    bossSlotIds: ['', '', ''],
    startRoomSlotId: '',
    roomCount: DARKEST_DUNGEON_ROOM_SLOT_COUNT,
    officialDataStatus: 'unavailable',
    enabledInOfficialPool: false,
  }));

// ---------------------------------------------------------------------------
// Prototype Layout（harness：16 Slot / 3 Boss Slot / 连通 Graph）
// ---------------------------------------------------------------------------

function slotIds(prefix: string): string[] {
  return Array.from({ length: DARKEST_DUNGEON_ROOM_SLOT_COUNT }, (_, i) =>
    `${prefix}-${String(i + 1).padStart(2, '0')}`,
  );
}

function corridors(prefix: string, pairs: Array<[number, number]>): CorridorDefinition[] {
  const ids = slotIds(prefix);
  return pairs.map(([a, b]) => ({
    id: `${prefix}-corridor-${a}-${b}`,
    from: ids[a - 1],
    to: ids[b - 1],
    length: 1,
  }));
}

const LAYOUT_A_PREFIX = 'proto-dd-a';
const LAYOUT_B_PREFIX = 'proto-dd-b';

/**
 * Layout A：主干链 + 两条支线，Boss Slot 在 14 / 15 / 16（末端聚集）。
 * 全部 16 个 Slot 通过走廊连通，Boss Slot 均可达。
 */
const LAYOUT_A_PAIRS: Array<[number, number]> = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [3, 7],
  [7, 8],
  [8, 9],
  [6, 10],
  [10, 11],
  [9, 12],
  [12, 13],
  [11, 14],
  [13, 15],
  [14, 16],
  [15, 16],
];

/**
 * Layout B：中枢 + 辐射结构，Boss Slot 分散在 6 / 11 / 16。
 */
const LAYOUT_B_PAIRS: Array<[number, number]> = [
  [1, 2],
  [2, 3],
  [3, 4],
  [2, 5],
  [5, 6],
  [3, 7],
  [7, 8],
  [8, 9],
  [4, 10],
  [10, 11],
  [9, 12],
  [12, 13],
  [13, 14],
  [11, 15],
  [14, 16],
  [15, 16],
];

export const PROTOTYPE_DARKEST_DUNGEON_LAYOUTS: DarkestDungeonLayoutDefinition[] = [
  {
    id: PROTOTYPE_DARKEST_DUNGEON_LAYOUT_IDS[0],
    name: '原型 Darkest Dungeon Layout A',
    roomSlotIds: slotIds(LAYOUT_A_PREFIX),
    corridorDefinitions: corridors(LAYOUT_A_PREFIX, LAYOUT_A_PAIRS),
    bossSlotIds: [
      `${LAYOUT_A_PREFIX}-14`,
      `${LAYOUT_A_PREFIX}-15`,
      `${LAYOUT_A_PREFIX}-16`,
    ],
    startRoomSlotId: `${LAYOUT_A_PREFIX}-01`,
    roomCount: DARKEST_DUNGEON_ROOM_SLOT_COUNT,
    officialDataStatus: 'prototype',
    enabledInOfficialPool: false,
  },
  {
    id: PROTOTYPE_DARKEST_DUNGEON_LAYOUT_IDS[1],
    name: '原型 Darkest Dungeon Layout B',
    roomSlotIds: slotIds(LAYOUT_B_PREFIX),
    corridorDefinitions: corridors(LAYOUT_B_PREFIX, LAYOUT_B_PAIRS),
    bossSlotIds: [
      `${LAYOUT_B_PREFIX}-06`,
      `${LAYOUT_B_PREFIX}-11`,
      `${LAYOUT_B_PREFIX}-16`,
    ],
    startRoomSlotId: `${LAYOUT_B_PREFIX}-01`,
    roomCount: DARKEST_DUNGEON_ROOM_SLOT_COUNT,
    officialDataStatus: 'prototype',
    enabledInOfficialPool: false,
  },
];

// ---------------------------------------------------------------------------
// 取数
// ---------------------------------------------------------------------------

export function getDarkestDungeonLayoutPool(
  mode: 'formal' | 'prototype' = 'prototype',
): DarkestDungeonLayoutDefinition[] {
  return mode === 'formal' ? OFFICIAL_DARKEST_DUNGEON_LAYOUTS : PROTOTYPE_DARKEST_DUNGEON_LAYOUTS;
}

export function getDarkestDungeonLayoutById(
  layoutId: string,
): DarkestDungeonLayoutDefinition | undefined {
  return (
    PROTOTYPE_DARKEST_DUNGEON_LAYOUTS.find((l) => l.id === layoutId) ??
    OFFICIAL_DARKEST_DUNGEON_LAYOUTS.find((l) => l.id === layoutId)
  );
}

// ---------------------------------------------------------------------------
// Graph 工具（连通性 / 可达性；不复用 Edge Room 算法）
// ---------------------------------------------------------------------------

/** 从 startSlotId 出发可达的 Slot 集合（无向 BFS）。 */
export function reachableSlots(layout: DarkestDungeonLayoutDefinition): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const slot of layout.roomSlotIds) adjacency.set(slot, []);
  for (const corridor of layout.corridorDefinitions) {
    if (adjacency.has(corridor.from)) adjacency.get(corridor.from)!.push(corridor.to);
    if (adjacency.has(corridor.to)) adjacency.get(corridor.to)!.push(corridor.from);
  }
  const visited = new Set<string>();
  if (!layout.startRoomSlotId || !adjacency.has(layout.startRoomSlotId)) return visited;
  const queue = [layout.startRoomSlotId];
  visited.add(layout.startRoomSlotId);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

// ---------------------------------------------------------------------------
// 校验（Data Gate）
// ---------------------------------------------------------------------------

export interface LayoutValidationResult {
  isComplete: boolean;
  missing: string[];
  issues: string[];
}

/**
 * Layout 校验（§9.1）：
 * 恰好 16 Slot / 恰好 3 Boss Slot / Start 合法 / Graph 连通 / Boss Slot 可达。
 */
export function validateDarkestDungeonLayout(
  layout: DarkestDungeonLayoutDefinition,
): LayoutValidationResult {
  const missing: string[] = [];
  const issues: string[] = [];

  if (!layout.name) missing.push(`layout-name:${layout.id}`);
  if (layout.roomSlotIds.length === 0) missing.push(`layout-room-slots:${layout.id}`);
  if (layout.corridorDefinitions.length === 0) missing.push(`layout-corridors:${layout.id}`);
  if (!layout.startRoomSlotId) missing.push(`layout-start-slot:${layout.id}`);
  if (layout.bossSlotIds.some((s) => !s)) missing.push(`layout-boss-slots:${layout.id}`);

  if (layout.roomSlotIds.length > 0) {
    if (layout.roomSlotIds.length !== DARKEST_DUNGEON_ROOM_SLOT_COUNT) {
      issues.push(`Layout ${layout.id} 必须恰好 16 个 Room Slot`);
    }
    if (new Set(layout.roomSlotIds).size !== layout.roomSlotIds.length) {
      issues.push(`Layout ${layout.id} 存在重复 Room Slot`);
    }
    if (layout.startRoomSlotId && !layout.roomSlotIds.includes(layout.startRoomSlotId)) {
      issues.push(`Layout ${layout.id} 的 Start Slot 不在 Room Slot 列表内`);
    }
  }

  if (layout.bossSlotIds.length !== DARKEST_DUNGEON_BOSS_SLOT_COUNT) {
    issues.push(`Layout ${layout.id} 必须恰好 3 个 Boss Slot`);
  }
  const filledBossSlots = layout.bossSlotIds.filter((s) => !!s);
  if (filledBossSlots.length > 0) {
    if (new Set(filledBossSlots).size !== filledBossSlots.length) {
      issues.push(`Layout ${layout.id} 存在重复 Boss Slot`);
    }
    for (const bossSlot of filledBossSlots) {
      if (!layout.roomSlotIds.includes(bossSlot)) {
        issues.push(`Layout ${layout.id} 的 Boss Slot ${bossSlot} 不在 Room Slot 列表内`);
      }
    }
  }

  if (layout.roomCount !== DARKEST_DUNGEON_ROOM_SLOT_COUNT) {
    issues.push(`Layout ${layout.id} 的 roomCount 必须为 16`);
  }

  // Graph 连通 + Boss Slot 可达
  if (missing.length === 0 && issues.length === 0) {
    const reachable = reachableSlots(layout);
    if (reachable.size !== layout.roomSlotIds.length) {
      issues.push(
        `Layout ${layout.id} Graph 不连通（可达 ${reachable.size} / ${layout.roomSlotIds.length}）`,
      );
    }
    for (const bossSlot of layout.bossSlotIds) {
      if (!reachable.has(bossSlot)) {
        issues.push(`Layout ${layout.id} 的 Boss Slot ${bossSlot} 不可达`);
      }
    }
  }

  if (layout.officialDataStatus === 'unavailable') {
    issues.push(`Layout ${layout.id} 数据缺失（unavailable）→ official 禁用`);
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

export function isDarkestDungeonOfficialLayoutPoolEnabled(): boolean {
  if (OFFICIAL_DARKEST_DUNGEON_LAYOUTS.length !== 2) return false;
  return OFFICIAL_DARKEST_DUNGEON_LAYOUTS.every(
    (l) =>
      l.enabledInOfficialPool &&
      l.officialDataStatus === 'verified' &&
      validateDarkestDungeonLayout(l).isComplete,
  );
}

export function getDarkestDungeonLayoutDataGaps(): string[] {
  const gaps: string[] = [];
  for (const layout of OFFICIAL_DARKEST_DUNGEON_LAYOUTS) {
    const result = validateDarkestDungeonLayout(layout);
    if (!result.isComplete) {
      gaps.push(`${layout.id}（${[...result.missing, ...result.issues].join('；')}）`);
    }
  }
  return gaps;
}

export function validateDarkestDungeonLayoutRegistry(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];

  if (isDarkestDungeonOfficialLayoutPoolEnabled()) {
    issues.push({
      kind: 'unknown-owner',
      targetId: 'darkest-dungeon-layout-pool',
      message: 'Darkest Dungeon official Layout 池意外启用，需复核数据',
    });
  }

  for (const layout of PROTOTYPE_DARKEST_DUNGEON_LAYOUTS) {
    if (layout.enabledInOfficialPool) {
      issues.push({
        kind: 'unverified',
        targetId: layout.id,
        message: 'Prototype Layout 不得 enabledInOfficialPool',
      });
    }
    const result = validateDarkestDungeonLayout(layout);
    if (!result.isComplete) {
      issues.push({
        kind: 'unknown-owner',
        targetId: layout.id,
        message: `Prototype Layout 不自洽：${[...result.missing, ...result.issues].join('；')}`,
      });
    }
  }

  return issues;
}
