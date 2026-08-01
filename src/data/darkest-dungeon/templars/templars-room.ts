// Phase 10B §8 / §9 / §16 / §17：Templars Room Definition（含 Spiked Pit 与 d10 → Pit 映射）。
//
// 资料实况：`templars-room-card` / `templars-room-tile` / `spiked-pit-map` /
// `spiked-pit-effects` 全部 unavailable。
//
// 因此正式 Room：
// - Area 全为空串、validAreaIds / areaCapacities 为空；
// - `pitTossD10Map` 十项全空串；
// - `spikedPits` 为空数组；
// → validateTemplarsRoom 必然失败 → official 禁用。
//
// 明令禁止（§3）：
// - 不依据 Room Tile 视觉猜 d10 → Pit 映射；
// - 不按 Pit 数量平均分配 d10；
// - 不把通用 Room Card 示例的 Pit 数值复制到 Templars Room；
// - 不自行规定 Hero 离开 Pit 的方式（exitRuleDefinitionId 保持 undefined）。

import type { SpikedPitDefinition } from '../../../types/room-hazards';
import type { D10Roll, TemplarsRoomDefinition } from '../../../types/templars';
import { SPIKED_PIT_EFFECT_PROTOTYPE_ID, TEMPLARS_ROOM_OFFICIAL_ID, TEMPLARS_ROOM_PROTOTYPE_ID } from './ids';

// ---------------------------------------------------------------------------
// 正式 Room（空壳；驱动 Data Gate）
// ---------------------------------------------------------------------------

const EMPTY_D10_MAP: Record<D10Roll, string> = {
  1: '',
  2: '',
  3: '',
  4: '',
  5: '',
  6: '',
  7: '',
  8: '',
  9: '',
  10: '',
};

export const TEMPLARS_ROOM_OFFICIAL: TemplarsRoomDefinition = {
  id: TEMPLARS_ROOM_OFFICIAL_ID,
  guardianFamilyId: 'templars',

  // Stance 由规则书 verified；Area 未知 → 空串。
  impalerPlacement: { stance: 'aggressive', areaId: '' },
  warlordPlacement: { stance: 'ranged', areaId: '' },

  heroPlacementRules: [{ rule: 'room-card-defined' }],

  validAreaIds: [],
  areaCapacities: {},
  areaGraph: { areas: [], edges: [] },

  spikedPits: [],
  pitTossD10Map: { ...EMPTY_D10_MAP },
  roomEffects: [],

  officialDataStatus: 'unavailable',
};

// ---------------------------------------------------------------------------
// Prototype Room（开发 harness）
// ---------------------------------------------------------------------------

export const PROTOTYPE_AREA_IMPALER = 'prototype-templars-impaler-area';
export const PROTOTYPE_AREA_WARLORD = 'prototype-templars-warlord-area';
export const PROTOTYPE_AREA_HERO = [
  'prototype-templars-hero-1',
  'prototype-templars-hero-2',
  'prototype-templars-hero-3',
  'prototype-templars-hero-4',
];
export const PROTOTYPE_PIT_A_AREA = 'prototype-templars-pit-a-area';
export const PROTOTYPE_PIT_B_AREA = 'prototype-templars-pit-b-area';
export const PROTOTYPE_PIT_C_AREA = 'prototype-templars-pit-c-area';

export const PROTOTYPE_PIT_A_ID = 'prototype-spiked-pit-a';
export const PROTOTYPE_PIT_B_ID = 'prototype-spiked-pit-b';
export const PROTOTYPE_PIT_C_ID = 'prototype-spiked-pit-c';

/**
 * Prototype Pit Effect —— 使用**独立 prototype ID**（§3 白名单
 * `prototype-spiked-pit-effect`），绝不写入正式 Definition。
 */
function prototypePitEffects(pitSuffix: string) {
  return {
    entry: [
      {
        id: `${SPIKED_PIT_EFFECT_PROTOTYPE_ID}-${pitSuffix}-entry-damage`,
        kind: 'damage' as const,
        amount: 3,
        description: `原型 Spiked Pit ${pitSuffix.toUpperCase()} 进入伤害（仅验证管线）。`,
        officialDataStatus: 'prototype' as const,
      },
      {
        id: `${SPIKED_PIT_EFFECT_PROTOTYPE_ID}-${pitSuffix}-entry-stress`,
        kind: 'stress' as const,
        amount: 2,
        description: `原型 Spiked Pit ${pitSuffix.toUpperCase()} 进入压力（仅验证管线）。`,
        officialDataStatus: 'prototype' as const,
      },
    ],
    endTurn: [
      {
        id: `${SPIKED_PIT_EFFECT_PROTOTYPE_ID}-${pitSuffix}-endturn-damage`,
        kind: 'damage' as const,
        amount: 1,
        description: `原型 Spiked Pit ${pitSuffix.toUpperCase()} 回合结束伤害（仅验证管线）。`,
        officialDataStatus: 'prototype' as const,
      },
    ],
  };
}

function makePrototypePit(id: string, areaId: string, suffix: string): SpikedPitDefinition {
  const effects = prototypePitEffects(suffix);
  return {
    id,
    areaId,
    targetable: false,
    hasHp: false,
    hasInitiative: false,
    // 原型使用强制放置（§17：正式资料未说明 Pit 满时如何处理）。
    capacityPolicy: 'forced-placement-definition',
    entryEffects: effects.entry,
    endTurnEffects: effects.endTurn,
    conditionTriggeredEffects: [],
    // 原型提供 Exit Rule，使 harness 可完整跑通；正式 Room 保持 undefined。
    exitRuleDefinitionId: `${SPIKED_PIT_EFFECT_PROTOTYPE_ID}-${suffix}-exit`,
    officialDataStatus: 'prototype',
  };
}

export const PROTOTYPE_SPIKED_PITS: SpikedPitDefinition[] = [
  makePrototypePit(PROTOTYPE_PIT_A_ID, PROTOTYPE_PIT_A_AREA, 'a'),
  makePrototypePit(PROTOTYPE_PIT_B_ID, PROTOTYPE_PIT_B_AREA, 'b'),
  makePrototypePit(PROTOTYPE_PIT_C_ID, PROTOTYPE_PIT_C_AREA, 'c'),
];

/**
 * Prototype d10 → Pit 映射。
 *
 * **刻意不均分**（4 / 3 / 3），以证明引擎不依赖「按 Pit 数量平均分配」
 * 也不使用数组下标（§16）。正式映射必须来自 Room Card。
 */
const PROTOTYPE_D10_MAP: Record<D10Roll, string> = {
  1: PROTOTYPE_PIT_A_ID,
  2: PROTOTYPE_PIT_A_ID,
  3: PROTOTYPE_PIT_B_ID,
  4: PROTOTYPE_PIT_A_ID,
  5: PROTOTYPE_PIT_C_ID,
  6: PROTOTYPE_PIT_B_ID,
  7: PROTOTYPE_PIT_B_ID,
  8: PROTOTYPE_PIT_C_ID,
  9: PROTOTYPE_PIT_A_ID,
  10: PROTOTYPE_PIT_C_ID,
};

const PROTOTYPE_AREAS = [
  PROTOTYPE_AREA_IMPALER,
  PROTOTYPE_AREA_WARLORD,
  ...PROTOTYPE_AREA_HERO,
  PROTOTYPE_PIT_A_AREA,
  PROTOTYPE_PIT_B_AREA,
  PROTOTYPE_PIT_C_AREA,
];

export const TEMPLARS_ROOM_PROTOTYPE: TemplarsRoomDefinition = {
  id: TEMPLARS_ROOM_PROTOTYPE_ID,
  guardianFamilyId: 'templars',

  impalerPlacement: { stance: 'aggressive', areaId: PROTOTYPE_AREA_IMPALER },
  warlordPlacement: { stance: 'ranged', areaId: PROTOTYPE_AREA_WARLORD },

  heroPlacementRules: [{ rule: 'room-card-defined' }],

  validAreaIds: PROTOTYPE_AREAS,
  areaCapacities: {
    [PROTOTYPE_AREA_IMPALER]: 1,
    [PROTOTYPE_AREA_WARLORD]: 1,
    [PROTOTYPE_AREA_HERO[0]]: 1,
    [PROTOTYPE_AREA_HERO[1]]: 1,
    [PROTOTYPE_AREA_HERO[2]]: 1,
    [PROTOTYPE_AREA_HERO[3]]: 1,
    // Pit 容量 = 1；配合 forced-placement-definition 验证「强制放置忽略容量」。
    [PROTOTYPE_PIT_A_AREA]: 1,
    [PROTOTYPE_PIT_B_AREA]: 1,
    [PROTOTYPE_PIT_C_AREA]: 1,
  },
  areaGraph: {
    areas: PROTOTYPE_AREAS,
    edges: [
      { from: PROTOTYPE_AREA_IMPALER, to: PROTOTYPE_AREA_HERO[0], distance: 1 },
      { from: PROTOTYPE_AREA_HERO[0], to: PROTOTYPE_AREA_HERO[1], distance: 1 },
      { from: PROTOTYPE_AREA_HERO[1], to: PROTOTYPE_AREA_HERO[2], distance: 1 },
      { from: PROTOTYPE_AREA_HERO[2], to: PROTOTYPE_AREA_HERO[3], distance: 1 },
      { from: PROTOTYPE_AREA_WARLORD, to: PROTOTYPE_AREA_HERO[3], distance: 1 },
      { from: PROTOTYPE_PIT_A_AREA, to: PROTOTYPE_AREA_HERO[0], distance: 1 },
      { from: PROTOTYPE_PIT_B_AREA, to: PROTOTYPE_AREA_HERO[1], distance: 1 },
      { from: PROTOTYPE_PIT_C_AREA, to: PROTOTYPE_AREA_HERO[2], distance: 1 },
    ],
  },

  spikedPits: PROTOTYPE_SPIKED_PITS,
  pitTossD10Map: { ...PROTOTYPE_D10_MAP },
  roomEffects: [],

  officialDataStatus: 'prototype',
};
