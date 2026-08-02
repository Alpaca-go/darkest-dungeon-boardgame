// Phase 10E §Ancestor Room：Stance → Area 映射与容量。
//
// 数据来源：docs/data/darkest-dungeon/final-encounter/ancestor-room.json
//   （officialDataStatus = 'unavailable'，sourceReference 为空）
// 审计结论：docs/reports/phase-10e-final-encounter-data-audit.md §2.1
//
// 硬约束 3：**所有 Form 共用同一个 Room**，因此本模块是四个 Form 唯一的
// Area 解析来源；Absolute Nothingness 落位、Ancestor 传送目标、Sispersion 的
// next-available-stance 全部走这里，不允许各 Form 自建一套坐标系。
//
// 官方 Room 的 Area 布局与容量完全缺失 → 不猜测，留空驱动 Data Gate；
// 开发使用 prototype-final-encounter-area-* harness。

import type { Stance } from '../../../types';
import type {
  AncestorRoomAreaDefinition,
  FinalFormMechanicsValidation,
  NonAggressiveStance,
} from '../../../types/final-forms';
import { NON_AGGRESSIVE_STANCES } from '../../../types/final-forms';
import { PROTOTYPE_FINAL_MECHANICS_PREFIX } from './ancestor-first-form';

export const ALL_STANCES: Stance[] = ['aggressive', 'defensive', 'ranged', 'support'];

export const OFFICIAL_ANCESTOR_ROOM_AREAS: AncestorRoomAreaDefinition = {
  id: 'ancestor-room',
  stanceAreaMap: { aggressive: '', defensive: '', ranged: '', support: '' },
  validAreaIds: [],
  areaCapacities: {},
  officialDataStatus: 'unavailable',
};

/** Prototype Area ID 生成（与 Absolute Nothingness 的 areaId 保持一致）。 */
export function prototypeStanceAreaId(stance: Stance): string {
  return `${PROTOTYPE_FINAL_MECHANICS_PREFIX}area-${stance}`;
}

/** Prototype 每个 Area 的容量：2（1 格给 Absolute Nothingness，1 格给 Hero / 召唤物）。 */
export const PROTOTYPE_AREA_CAPACITY = 2;

export const PROTOTYPE_ANCESTOR_ROOM_AREAS: AncestorRoomAreaDefinition = {
  id: `${PROTOTYPE_FINAL_MECHANICS_PREFIX}ancestor-room`,
  stanceAreaMap: {
    aggressive: prototypeStanceAreaId('aggressive'),
    defensive: prototypeStanceAreaId('defensive'),
    ranged: prototypeStanceAreaId('ranged'),
    support: prototypeStanceAreaId('support'),
  },
  validAreaIds: ALL_STANCES.map(prototypeStanceAreaId),
  areaCapacities: Object.fromEntries(
    ALL_STANCES.map((s) => [prototypeStanceAreaId(s), PROTOTYPE_AREA_CAPACITY]),
  ),
  officialDataStatus: 'prototype',
};

export function getAncestorRoomAreas(
  mode: 'formal' | 'prototype' = 'prototype',
): AncestorRoomAreaDefinition {
  return mode === 'formal' ? OFFICIAL_ANCESTOR_ROOM_AREAS : PROTOTYPE_ANCESTOR_ROOM_AREAS;
}

/** Stance → Area（未定义时返回空串，由调用方判定为数据缺口）。 */
export function resolveStanceAreaId(room: AncestorRoomAreaDefinition, stance: Stance): string {
  return room.stanceAreaMap[stance] ?? '';
}

/** 三个非 aggressive Stance 的 Area（Reflection / Absolute Nothingness 用）。 */
export function getNonAggressiveAreaIds(room: AncestorRoomAreaDefinition): Record<NonAggressiveStance, string> {
  return {
    defensive: resolveStanceAreaId(room, 'defensive'),
    ranged: resolveStanceAreaId(room, 'ranged'),
    support: resolveStanceAreaId(room, 'support'),
  };
}

/** Area 容量（未定义 → 0，表示不可放置）。 */
export function getAreaCapacity(room: AncestorRoomAreaDefinition, areaId: string): number {
  return room.areaCapacities[areaId] ?? 0;
}

// ---------------------------------------------------------------------------
// 校验（Data Gate）
// ---------------------------------------------------------------------------

export function validateAncestorRoomAreas(
  room: AncestorRoomAreaDefinition,
): FinalFormMechanicsValidation {
  const missing: string[] = [];
  const issues: string[] = [];

  for (const stance of ALL_STANCES) {
    if (!room.stanceAreaMap[stance]) missing.push(`ancestor-room:stance-area:${stance}`);
  }
  if (room.validAreaIds.length === 0) missing.push('ancestor-room:valid-areas');
  if (Object.keys(room.areaCapacities).length === 0) missing.push('ancestor-room:area-capacities');

  for (const stance of NON_AGGRESSIVE_STANCES) {
    const areaId = room.stanceAreaMap[stance];
    if (areaId && !room.validAreaIds.includes(areaId)) {
      issues.push(`Stance ${stance} 的 Area ${areaId} 不在 validAreaIds 内`);
    }
  }

  if (room.officialDataStatus === 'unavailable') {
    issues.push('Ancestor Room Card / Tile 数据缺失（unavailable）');
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}
