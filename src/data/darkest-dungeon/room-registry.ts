// Phase 10A §8 / §11：Darkest Dungeon 专属 Room Card / Room Tile / Monster 与 Excavation Site。
//
// 规则（§2）：
// - 7. Darkest Dungeon 使用专属 Monster Deck，全部 Level III；
// - 15. 使用 Darkest Dungeon 专属 Room Tiles 与 Room Cards；
// - 17/18. 不存在普通 Empty Room；三个 Empty Room 被替换为 Excavation Site；
// - 19. Curio 使用 Ruins Curio Deck；
// - 20. Quirk / Disease / Virtue / Affliction Deck 不变。
//
// 数据现状：专属 Monster Card / Room Card / Room Tile 全部 unavailable。
// 因此正式列表全空（驱动 Data Gate），prototype harness 提供可跑通的最小集合。

import type { ProvisionPool } from '../../types';
import type { RegistryValidationIssue } from '../../types/progression';

// ---------------------------------------------------------------------------
// 固定 ID / 常量
// ---------------------------------------------------------------------------

/** 规则 19：Curio 使用 Ruins 牌堆。 */
export const DARKEST_DUNGEON_CURIO_DECK_ID = 'ruins-curios' as const;

/** 规则 16 / 21：Trinket Tier 与 Dungeon Level 均为 III。 */
export const DARKEST_DUNGEON_TRINKET_TIER = 3 as const;
export const DARKEST_DUNGEON_DUNGEON_LEVEL = 3 as const;

/** 规则 18：恰好 3 个 Excavation Site。 */
export const EXCAVATION_SITE_COUNT = 3 as const;

/** 规则 22：Excavation 免费 Rest 固定 8 Resting Points，且不消耗 Firewood。 */
export const EXCAVATION_RESTING_POINTS = 8 as const;

/** Excavation Site Room 定义 ID（Darkest Dungeon Runtime 内 Empty 的解释目标）。 */
export const EXCAVATION_SITE_ROOM_DEFINITION_ID = 'darkest-dungeon-excavation-site';

/** 规则 20：保持不变的牌堆（切换 Content Runtime 时不得动它们）。 */
export const PRESERVED_DECK_IDS: string[] = [
  'quirk-deck',
  'disease-deck',
  'virtue-deck',
  'affliction-deck',
];

// ---------------------------------------------------------------------------
// 正式内容（全部 unavailable → Data Gate）
// ---------------------------------------------------------------------------

/** 正式 Darkest Dungeon Monster Card（卡面未核对 → 空）。 */
export const OFFICIAL_DARKEST_DUNGEON_MONSTER_IDS: string[] = [];

/** 正式 Darkest Dungeon Room Card（卡面未核对 → 空）。 */
export const OFFICIAL_DARKEST_DUNGEON_ROOM_CARD_IDS: string[] = [];

/** 正式 Darkest Dungeon Room Tile（图块未核对 → 空）。 */
export const OFFICIAL_DARKEST_DUNGEON_ROOM_TILE_IDS: string[] = [];

// ---------------------------------------------------------------------------
// Prototype 内容（harness）
// ---------------------------------------------------------------------------

export const PROTOTYPE_DARKEST_DUNGEON_MONSTER_IDS: string[] = [
  'prototype-darkest-dungeon-monster-1',
  'prototype-darkest-dungeon-monster-2',
  'prototype-darkest-dungeon-monster-3',
];

export const PROTOTYPE_DARKEST_DUNGEON_ROOM_CARD_IDS: string[] = [
  'prototype-darkest-dungeon-room-card-battle',
  'prototype-darkest-dungeon-room-card-curio',
  'prototype-darkest-dungeon-room-card-trinket',
  EXCAVATION_SITE_ROOM_DEFINITION_ID,
];

export const PROTOTYPE_DARKEST_DUNGEON_ROOM_TILE_IDS: string[] = [
  'prototype-darkest-dungeon-room-tile-a',
  'prototype-darkest-dungeon-room-tile-b',
];

/**
 * Prototype Monster 的 Level 映射：规则 7 要求全部视为 Level III。
 * 这里显式给出，供 activateDarkestDungeonContentSet 校验。
 */
export const PROTOTYPE_DARKEST_DUNGEON_MONSTER_LEVELS: Record<string, 1 | 2 | 3> =
  Object.fromEntries(PROTOTYPE_DARKEST_DUNGEON_MONSTER_IDS.map((id) => [id, 3 as const]));

// ---------------------------------------------------------------------------
// Provision Die 面值映射（§12）
// ---------------------------------------------------------------------------

/** Provision Die 是六面骰。 */
export const PROVISION_DIE_FACES = 6 as const;

/**
 * 正式 Provision Die 面值 → 补给类型映射。
 *
 * **刻意留空**：骰面图标未核对（审计报告条目 6：Excavation Site 配置 unavailable），
 * 硬约束「绝不猜测缺失数据」→ 空映射驱动 isProvisionDieMapEnabled() = false，
 * formal 模式下 Excavation 结算被拒绝。
 */
export const OFFICIAL_PROVISION_DIE_FACE_MAP: Record<number, keyof ProvisionPool> =
  {} as Record<number, keyof ProvisionPool>;

/**
 * Prototype Provision Die 映射（harness 专用，绝不代表官方骰面）。
 * 仅用于验证「每人一掷 → 结果先保存 → 进公共池 → 刷新不重掷」这条链路。
 */
export const PROTOTYPE_PROVISION_DIE_FACE_MAP: Record<number, keyof ProvisionPool> = {
  1: 'food',
  2: 'food',
  3: 'bandage',
  4: 'potion',
  5: 'torch',
  6: 'tool',
};

export function getProvisionDieFaceMap(
  mode: 'formal' | 'prototype' = 'prototype',
): Record<number, keyof ProvisionPool> {
  return mode === 'formal' ? OFFICIAL_PROVISION_DIE_FACE_MAP : PROTOTYPE_PROVISION_DIE_FACE_MAP;
}

/** 正式 Provision Die 映射是否齐备（六个面都要有）。 */
export function isProvisionDieMapEnabled(): boolean {
  for (let face = 1; face <= PROVISION_DIE_FACES; face += 1) {
    if (!OFFICIAL_PROVISION_DIE_FACE_MAP[face]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 取数
// ---------------------------------------------------------------------------

export interface DarkestDungeonContentSource {
  monsterDefinitionIds: string[];
  roomCardDefinitionIds: string[];
  roomTileDefinitionIds: string[];
}

export function getDarkestDungeonContentSource(
  mode: 'formal' | 'prototype' = 'prototype',
): DarkestDungeonContentSource {
  if (mode === 'formal') {
    return {
      monsterDefinitionIds: OFFICIAL_DARKEST_DUNGEON_MONSTER_IDS,
      roomCardDefinitionIds: OFFICIAL_DARKEST_DUNGEON_ROOM_CARD_IDS,
      roomTileDefinitionIds: OFFICIAL_DARKEST_DUNGEON_ROOM_TILE_IDS,
    };
  }
  return {
    monsterDefinitionIds: PROTOTYPE_DARKEST_DUNGEON_MONSTER_IDS,
    roomCardDefinitionIds: PROTOTYPE_DARKEST_DUNGEON_ROOM_CARD_IDS,
    roomTileDefinitionIds: PROTOTYPE_DARKEST_DUNGEON_ROOM_TILE_IDS,
  };
}

// ---------------------------------------------------------------------------
// 校验（Data Gate）
// ---------------------------------------------------------------------------

export function isDarkestDungeonOfficialContentEnabled(): boolean {
  return (
    OFFICIAL_DARKEST_DUNGEON_MONSTER_IDS.length > 0 &&
    OFFICIAL_DARKEST_DUNGEON_ROOM_CARD_IDS.length > 0 &&
    OFFICIAL_DARKEST_DUNGEON_ROOM_TILE_IDS.length > 0 &&
    isProvisionDieMapEnabled()
  );
}

export function getDarkestDungeonContentDataGaps(): string[] {
  const gaps: string[] = [];
  if (OFFICIAL_DARKEST_DUNGEON_MONSTER_IDS.length === 0) {
    gaps.push('darkest-dungeon-monster-cards（专属 Monster Card 缺失）');
  }
  if (OFFICIAL_DARKEST_DUNGEON_ROOM_CARD_IDS.length === 0) {
    gaps.push('darkest-dungeon-room-cards（专属 Room Card 缺失）');
  }
  if (OFFICIAL_DARKEST_DUNGEON_ROOM_TILE_IDS.length === 0) {
    gaps.push('darkest-dungeon-room-tiles（专属 Room Tile 缺失）');
  }
  if (!isProvisionDieMapEnabled()) {
    gaps.push('provision-die-face-map（Provision Die 骰面 → 补给类型映射缺失）');
  }
  return gaps;
}

export function validateDarkestDungeonRoomRegistry(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];

  if (isDarkestDungeonOfficialContentEnabled()) {
    issues.push({
      kind: 'unknown-owner',
      targetId: 'darkest-dungeon-content',
      message: 'Darkest Dungeon official 内容意外启用，需复核数据',
    });
  }

  for (const id of [
    ...PROTOTYPE_DARKEST_DUNGEON_MONSTER_IDS,
    ...PROTOTYPE_DARKEST_DUNGEON_ROOM_TILE_IDS,
  ]) {
    if (!id.startsWith('prototype-')) {
      issues.push({
        kind: 'unverified',
        targetId: id,
        message: 'Prototype 内容必须使用 prototype- 前缀 ID',
      });
    }
  }

  // 规则 7：所有 Darkest Dungeon Monster 必须是 Level III
  for (const [id, level] of Object.entries(PROTOTYPE_DARKEST_DUNGEON_MONSTER_LEVELS)) {
    if (level !== 3) {
      issues.push({
        kind: 'unverified',
        targetId: id,
        message: 'Darkest Dungeon Monster 必须全部为 Level III',
      });
    }
  }

  return issues;
}
