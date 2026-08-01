// Phase 10B §19：Room Area Movement Policy。
//
// 关键约束：资料不足时**不自创**「花 1 Action 爬出」——
// 未知项一律用 'definition-driven' 表达，并由 Data Gate 阻止 official battle。

import type { RoomAreaMovementPolicy, SpikedPitDefinition } from '../../types/room-hazards';

/**
 * 未知策略（正式资料缺失时的默认值）。
 * 三项全部 'definition-driven'：引擎不做任何假定。
 */
export const UNKNOWN_AREA_MOVEMENT_POLICY: RoomAreaMovementPolicy = {
  canEnterNormally: 'definition-driven',
  canExitNormally: 'definition-driven',
  forcedExitAllowed: 'definition-driven',
};

/**
 * 由 Pit Definition 推导 Movement Policy。
 * - 有 exitRuleDefinitionId → 该 Pit 的进出行为有资料来源，可给出确定值；
 * - 无 exitRuleDefinitionId → 保持全 'definition-driven'（未知）。
 */
export function getSpikedPitMovementPolicy(pit: SpikedPitDefinition): RoomAreaMovementPolicy {
  if (!pit.exitRuleDefinitionId) return { ...UNKNOWN_AREA_MOVEMENT_POLICY };
  return {
    // Pit 可被强制进入（Pit Toss），正常进入是否允许仍由 Definition 决定。
    canEnterNormally: 'definition-driven',
    canExitNormally: true,
    exitActionCost: 1,
    forcedExitAllowed: true,
  };
}

/** 强制进入是否被允许（Pit Toss 使用）。 */
export function canForceEnter(pit: SpikedPitDefinition, currentOccupants: number, areaCapacity: number | undefined): {
  allowed: boolean;
  reason: string | null;
} {
  if (pit.capacityPolicy === 'forced-placement-definition') {
    // Definition 明确允许强制放置：忽略容量。
    return { allowed: true, reason: null };
  }
  // normal-area-capacity：受容量约束
  if (areaCapacity === undefined) {
    return { allowed: false, reason: `Pit Area ${pit.areaId} 缺少容量定义` };
  }
  if (currentOccupants >= areaCapacity) {
    // §17：不静默改投其他 Pit、不重新掷 d10 —— 直接失败并回滚。
    return { allowed: false, reason: `Pit ${pit.id} 已满（${currentOccupants}/${areaCapacity}）` };
  }
  return { allowed: true, reason: null };
}

/** Exit Rule 是否有资料来源（缺失 → official 禁用，§19）。 */
export function hasExitRule(pit: SpikedPitDefinition): boolean {
  return Boolean(pit.exitRuleDefinitionId);
}
