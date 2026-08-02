// Phase 10E §Ancestor 2nd Form 运行时：Absolute Nothingness / Action 结束传送。
//
// 硬约束对照：
// - 3.  所有 Form 共用同一 Room → Area 一律经 AncestorRoomAreaDefinition 解析，
//       本模块不自建坐标系；
// - 12. Absolute Nothingness **不是** BattleActor：不进 Initiative、不可被 Target，
//       但**占据 Area Space**（影响传送落点与召唤空位）；
// - 13. Ancestor 每次 Action 结束后掷 d10 传送；
// - 14. 掷出 10 时**不传送**（Definition 里该项为 null，不得写成「原地不动的传送」）；
// - 25. 随机结果先保存后展示，刷新不重掷 → 同一 sequence 的记录存在即直接复用。

import type { Stance } from '../../../../types';
import type {
  AbsoluteNothingnessState,
  AncestorRoomAreaDefinition,
  AncestorSecondFormMechanics,
  AncestorSecondFormRuntime,
  AncestorTeleportRecord,
} from '../../../../types/final-forms';
import {
  getAreaCapacity,
  resolveStanceAreaId,
} from '../../../../data/darkest-dungeon/final-encounter/ancestor-room';
import { rollD10 } from '../rng';
import { finalFormTransactionIds } from './final-form-transactions';

const HISTORY_LIMIT = 20;

/** Ancestor 2nd Form 出场 Stance（本体恒在 aggressive，三张虚无占据其余三格）。 */
export const ANCESTOR_SECOND_FORM_START_STANCE: Stance = 'aggressive';

function nothingnessId(index: number): string {
  return `absolute-nothingness-${index + 1}`;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * 建立 Ancestor 2nd Form 运行时。
 *
 * Absolute Nothingness 的数量（3）与 Stance 归属来自 Definition（manifest 中唯一
 * verified 的条目）；Area 一律从共用 Room 解析，Definition 上的 areaId 只作为兜底。
 */
export function setupAncestorSecondFormRuntime(
  mech: AncestorSecondFormMechanics,
  room: AncestorRoomAreaDefinition,
): AncestorSecondFormRuntime {
  const nothingness: AbsoluteNothingnessState[] = mech.absoluteNothingness.map((n, index) => ({
    id: nothingnessId(index),
    linkedStance: n.linkedStance,
    // 硬约束 3：Area 以共用 Room 为准。
    areaId: resolveStanceAreaId(room, n.linkedStance) || n.areaId,
    // 硬约束 12：字面量锁死，任何分支都不得把它变成可选目标。
    targetable: false,
    occupiesAreaSpace: true,
  }));

  return {
    kind: 'ancestor-second-form',
    initiativeCardCount: 2,
    nothingness,
    currentAreaId: resolveStanceAreaId(room, ANCESTOR_SECOND_FORM_START_STANCE),
    currentStance: ANCESTOR_SECOND_FORM_START_STANCE,
    lastTeleport: null,
    teleportHistory: [],
    capacityPolicy: mech.capacityPolicy,
  };
}

// ---------------------------------------------------------------------------
// 只读 Selector
// ---------------------------------------------------------------------------

/** Absolute Nothingness 占用的 Area（硬约束 12）。 */
export function getNothingnessAreaIds(runtime: AncestorSecondFormRuntime): string[] {
  return runtime.nothingness.filter((n) => n.occupiesAreaSpace).map((n) => n.areaId);
}

export function countNothingnessInArea(
  runtime: AncestorSecondFormRuntime,
  areaId: string,
): number {
  return getNothingnessAreaIds(runtime).filter((id) => id === areaId).length;
}

/** Absolute Nothingness 恒不可被 Target（供 Battle 目标筛选调用）。 */
export function isAbsoluteNothingnessTargetable(): false {
  return false;
}

/** Absolute Nothingness 不进 Initiative（供先攻构建调用）。 */
export function getAncestorSecondFormInitiativeActorCount(): 1 {
  return 1;
}

export interface AreaOccupancyInput {
  /** 由调用方给出的「非虚无占位」计数（Hero / 召唤物等）。 */
  externalOccupancyByArea?: Record<string, number>;
}

/** 指定 Area 的剩余空位（含 Absolute Nothingness 占位）。 */
export function getAreaFreeSpace(
  runtime: AncestorSecondFormRuntime,
  room: AncestorRoomAreaDefinition,
  areaId: string,
  input?: AreaOccupancyInput,
): number {
  const capacity = getAreaCapacity(room, areaId);
  const external = input?.externalOccupancyByArea?.[areaId] ?? 0;
  return capacity - countNothingnessInArea(runtime, areaId) - external;
}

// ---------------------------------------------------------------------------
// Action 结束传送（硬约束 13 / 14 / 25）
// ---------------------------------------------------------------------------

export interface AncestorTeleportResult {
  ok: boolean;
  runtime: AncestorSecondFormRuntime;
  record: AncestorTeleportRecord | null;
  alreadyProcessed: boolean;
  reason: string | null;
}

/**
 * Ancestor Action 结束后的 d10 传送。
 *
 * - 同一 sequence 已有记录 → 直接返回既有记录（刷新绝不重掷，硬约束 25）；
 * - roll = 10 → `resultStance = null`、`teleported = false`，**不是**「传送到原地」；
 * - 目标 Area 无空位 → 记录 blockedReason，位置保持不变（不静默吞掉）。
 */
export function rollAncestorTeleport(
  runtime: AncestorSecondFormRuntime,
  mech: AncestorSecondFormMechanics,
  room: AncestorRoomAreaDefinition,
  encounterId: string,
  sequence: number,
  rng: () => number,
  now: string,
  input?: AreaOccupancyInput,
): AncestorTeleportResult {
  const transactionId = finalFormTransactionIds.teleport(encounterId, sequence);
  const existing = runtime.teleportHistory.find((r) => r.transactionId === transactionId);
  if (existing) {
    return { ok: true, runtime, record: existing, alreadyProcessed: true, reason: null };
  }

  const roll = rollD10(rng);
  const resultStance = mech.actionEndTeleportMap[roll] ?? null;

  let record: AncestorTeleportRecord;
  let nextAreaId = runtime.currentAreaId;
  let nextStance = runtime.currentStance;

  if (resultStance === null) {
    // 硬约束 14：掷出 10 就是不传送。
    record = {
      transactionId,
      roll,
      resultStance: null,
      teleported: false,
      fromAreaId: runtime.currentAreaId,
      toAreaId: null,
      blockedReason: null,
      at: now,
    };
  } else {
    const toAreaId = resolveStanceAreaId(room, resultStance);
    if (!toAreaId) {
      record = {
        transactionId,
        roll,
        resultStance,
        teleported: false,
        fromAreaId: runtime.currentAreaId,
        toAreaId: null,
        blockedReason: `Stance ${resultStance} 在共用 Room 中没有 Area 定义`,
        at: now,
      };
    } else if (toAreaId === runtime.currentAreaId) {
      record = {
        transactionId,
        roll,
        resultStance,
        teleported: false,
        fromAreaId: runtime.currentAreaId,
        toAreaId,
        blockedReason: null,
        at: now,
      };
    } else if (getAreaFreeSpace(runtime, room, toAreaId, input) <= 0) {
      // 硬约束 12：Absolute Nothingness 也占格，满了就按 Definition 处理，不重掷。
      record = {
        transactionId,
        roll,
        resultStance,
        teleported: false,
        fromAreaId: runtime.currentAreaId,
        toAreaId,
        blockedReason: `目标 Area ${toAreaId} 已无空位（含 Absolute Nothingness 占位）`,
        at: now,
      };
    } else {
      record = {
        transactionId,
        roll,
        resultStance,
        teleported: true,
        fromAreaId: runtime.currentAreaId,
        toAreaId,
        blockedReason: null,
        at: now,
      };
      nextAreaId = toAreaId;
      nextStance = resultStance;
    }
  }

  return {
    ok: true,
    runtime: {
      ...runtime,
      currentAreaId: nextAreaId,
      currentStance: nextStance,
      lastTeleport: record,
      teleportHistory: [...runtime.teleportHistory, record].slice(-HISTORY_LIMIT),
    },
    record,
    alreadyProcessed: false,
    reason: record.blockedReason,
  };
}
