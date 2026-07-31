// Phase 8C：Nomad Wagon（流浪商队）静态数据。
//
// 关键规则 8-10：建筑等级决定展示位的 Trinket 等级组合。
// - Level I  ：3 张 Level 1
// - Level II ：2 张 Level 1 + 1 张 Level 2
// - Level III：1 张 Level 1 + 1 张 Level 2 + 1 张 Level 3
//
// 本阶段禁止实现建筑升级操作 —— buildingLevel 固定为 1，
// 但组合表按三级完整定义，便于后续阶段接入且可被单元测试直接验证。

import type { TrinketLevel } from '../types/trinkets';

export const NOMAD_WAGON_BUILDING_ID = 'nomad-wagon';
export const NOMAD_WAGON_NAME = 'Nomad Wagon';

/** 各建筑等级对应的展示位 Trinket 等级组合。 */
export const NOMAD_WAGON_OFFER_LAYOUT: Record<TrinketLevel, TrinketLevel[]> = {
  1: [1, 1, 1],
  2: [1, 1, 2],
  3: [1, 2, 3],
};

/** 展示位数量恒为 3。 */
export const NOMAD_WAGON_SLOT_COUNT = 3;

export function offerLayoutForLevel(level: TrinketLevel): TrinketLevel[] {
  return NOMAD_WAGON_OFFER_LAYOUT[level] ?? NOMAD_WAGON_OFFER_LAYOUT[1];
}
