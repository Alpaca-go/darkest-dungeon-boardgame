// Phase 10C §8 / §9 / §19 / §20 / §21：Mammoth Cyst Room Definition
// （含 d10 → Area Teleportation Map 与 Room Entry Effects）。
//
// 资料实况：
// - `mammoth-cyst-room-card` / `mammoth-cyst-room-tile` = unavailable；
// - `teleportation-d10-area-map` = unavailable；
// - `teleportation-capacity-policy` = unavailable；
// - `white-cell-stalk-spawn-policy` = partial。
//
// 因此正式 Room：
// - Area 全为空串、validAreaIds / areaCapacities 为空；
// - `teleportationD10Map` 十项全空串；
// - `roomEntryEffects` 为空；
// → validateMammothCystRoom 必然失败 → official 禁用。
//
// 明令禁止（§3）：
// - 不依据 Room Tile 视觉猜 d10 → Area 映射；
// - 不按 Area 数量平均分配 d10；
// - 不把通用 Room Card 示例的 Area 数值复制到 Mammoth Cyst Room；
// - 不自行规定 Area 满时重掷或换 Area。

import type { RoomHazardEffectDefinition } from '../../../types/room-hazards';
import type { D10Roll, MammothCystRoomDefinition } from '../../../types/mammoth-cyst';
import {
  MAMMOTH_CYST_ENTRY_EFFECT_PROTOTYPE_ID,
  MAMMOTH_CYST_ROOM_OFFICIAL_ID,
  MAMMOTH_CYST_ROOM_PROTOTYPE_ID,
} from './ids';

// ---------------------------------------------------------------------------
// 正式 Room（空壳；驱动 Data Gate）
// ---------------------------------------------------------------------------

const EMPTY_D10_MAP: Record<D10Roll, string> = {
  1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '', 8: '', 9: '', 10: '',
};

export const MAMMOTH_CYST_ROOM_OFFICIAL: MammothCystRoomDefinition = {
  id: MAMMOTH_CYST_ROOM_OFFICIAL_ID,
  guardianFamilyId: 'mammoth-cyst',

  mammothCystPlacement: { stance: 'aggressive', areaId: '' },

  whiteCellStalkSpawn: {
    stancePolicy: 'definition-driven',
    areaPolicy: 'definition-driven',
  },

  // §13：Stance → Area 映射只能来自 Room Card；资料缺失 → 空映射，
  // 通用召唤规则因此无法解析 Area（拒绝召唤，绝不猜）。
  stanceAreaMap: {},

  validAreaIds: [],
  areaCapacities: {},
  areaGraph: { areas: [], edges: [] },

  teleportationD10Map: { ...EMPTY_D10_MAP },
  roomEntryEffects: {},

  officialDataStatus: 'unavailable',
};

// ---------------------------------------------------------------------------
// Prototype Room（开发 harness）
// ---------------------------------------------------------------------------

export const PROTOTYPE_CYST_AREA = 'prototype-mammoth-cyst-area';
export const PROTOTYPE_STALK_AREA = 'prototype-white-cell-stalk-area';
export const PROTOTYPE_HERO_AREAS = [
  'prototype-mammoth-cyst-hero-1',
  'prototype-mammoth-cyst-hero-2',
  'prototype-mammoth-cyst-hero-3',
  'prototype-mammoth-cyst-hero-4',
];

/**
 * Prototype Room Entry Effect —— 使用**独立 prototype ID**（§3 白名单），
 * 绝不写入正式 Definition。挂在 hero-3，仅用于验证「Entry Effect 复用正式管线 + 幂等」。
 */
const PROTOTYPE_ENTRY_EFFECT: RoomHazardEffectDefinition = {
  id: MAMMOTH_CYST_ENTRY_EFFECT_PROTOTYPE_ID,
  kind: 'damage',
  amount: 2,
  effectDefinitionId: undefined,
  description: '原型 Room Entry 伤害（仅验证管线；不写入正式 Room Card）。',
  officialDataStatus: 'prototype',
  sourceReference: undefined,
};

/**
 * Prototype d10 → Area 映射。
 *
 * **刻意不均分**（3 / 2 / 3 / 2 落到四个 Hero Area），以证明引擎不依赖
 * 「按 Area 数量平均分配」也不使用数组下标（§19）。正式映射必须来自 Room Card。
 */
const PROTOTYPE_D10_MAP: Record<D10Roll, string> = {
  1: PROTOTYPE_HERO_AREAS[0],
  2: PROTOTYPE_HERO_AREAS[0],
  3: PROTOTYPE_HERO_AREAS[0],
  4: PROTOTYPE_HERO_AREAS[1],
  5: PROTOTYPE_HERO_AREAS[1],
  6: PROTOTYPE_HERO_AREAS[2],
  7: PROTOTYPE_HERO_AREAS[2],
  8: PROTOTYPE_HERO_AREAS[2],
  9: PROTOTYPE_HERO_AREAS[3],
  10: PROTOTYPE_HERO_AREAS[3],
};

const PROTOTYPE_AREAS = [
  PROTOTYPE_CYST_AREA,
  PROTOTYPE_STALK_AREA,
  ...PROTOTYPE_HERO_AREAS,
];

export const MAMMOTH_CYST_ROOM_PROTOTYPE: MammothCystRoomDefinition = {
  id: MAMMOTH_CYST_ROOM_PROTOTYPE_ID,
  guardianFamilyId: 'mammoth-cyst',

  // 规则书 p.39 verified：Cyst 放 Aggressive Stance + 对应 Area。
  mammothCystPlacement: { stance: 'aggressive', areaId: PROTOTYPE_CYST_AREA },

  // Prototype 采用 Boss 专属 Spawn 规则（确定性强）：固定 Stance + 固定 Area（§13 通用规则的例外）。
  whiteCellStalkSpawn: {
    stancePolicy: 'specified-stance',
    specifiedStance: 'defensive',
    areaPolicy: 'specified-area',
    specifiedAreaId: PROTOTYPE_STALK_AREA,
  },

  // §13 通用召唤规则用（prototype 走 Boss 专属规则，此表仅供通用分支的单测使用）。
  stanceAreaMap: {
    aggressive: PROTOTYPE_CYST_AREA,
    ranged: PROTOTYPE_HERO_AREAS[0],
    defensive: PROTOTYPE_STALK_AREA,
    support: PROTOTYPE_HERO_AREAS[1],
  },

  validAreaIds: PROTOTYPE_AREAS,
  areaCapacities: {
    [PROTOTYPE_CYST_AREA]: 4,
    [PROTOTYPE_STALK_AREA]: 4,
    [PROTOTYPE_HERO_AREAS[0]]: 4,
    [PROTOTYPE_HERO_AREAS[1]]: 4,
    [PROTOTYPE_HERO_AREAS[2]]: 4,
    [PROTOTYPE_HERO_AREAS[3]]: 4,
  },
  areaGraph: {
    areas: PROTOTYPE_AREAS,
    edges: [
      { from: PROTOTYPE_CYST_AREA, to: PROTOTYPE_HERO_AREAS[0], distance: 1 },
      { from: PROTOTYPE_HERO_AREAS[0], to: PROTOTYPE_HERO_AREAS[1], distance: 1 },
      { from: PROTOTYPE_HERO_AREAS[1], to: PROTOTYPE_HERO_AREAS[2], distance: 1 },
      { from: PROTOTYPE_HERO_AREAS[2], to: PROTOTYPE_HERO_AREAS[3], distance: 1 },
      { from: PROTOTYPE_STALK_AREA, to: PROTOTYPE_HERO_AREAS[2], distance: 1 },
    ],
  },

  teleportationD10Map: { ...PROTOTYPE_D10_MAP },
  // 仅 hero-3 有原型 Entry Effect（验证管线 + 幂等）。
  roomEntryEffects: {
    [PROTOTYPE_HERO_AREAS[2]]: [PROTOTYPE_ENTRY_EFFECT],
  },

  officialDataStatus: 'prototype',
};
