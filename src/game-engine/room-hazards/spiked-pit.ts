// Phase 10B §9 / §19：Spiked Pit Runtime 与 Occupancy Selector。
//
// 硬约束（§9）：Spiked Pit **不是 BattleActor** ——
// 本文件只维护「哪些 Actor 站在哪个 Pit」的簿记，
// 绝不创建 BattleUnit、不进 Initiative、不给 HP、不可被 Target。

import type { SpikedPitDefinition, SpikedPitRuntime } from '../../types/room-hazards';

/** 由 Pit Definition 创建 Runtime（Setup 时一次性；刷新不重复，见 templars-runtime）。 */
export function createSpikedPitRuntime(pit: SpikedPitDefinition): SpikedPitRuntime {
  return {
    id: `pitrt-${pit.id}`,
    pitDefinitionId: pit.id,
    areaId: pit.areaId,
    occupantActorIds: [],
    resolvedTriggerKeys: [],
    dataStatus: pit.officialDataStatus,
  };
}

export function createSpikedPitRuntimes(pits: SpikedPitDefinition[]): SpikedPitRuntime[] {
  return pits.map(createSpikedPitRuntime);
}

// ---------------------------------------------------------------------------
// Selector（§19）
// ---------------------------------------------------------------------------

/** 取某 Pit 中的全部 Actor。 */
export function getActorsInSpikedPit(runtimes: SpikedPitRuntime[], pitDefinitionId: string): string[] {
  const rt = runtimes.find((r) => r.pitDefinitionId === pitDefinitionId);
  return rt ? [...rt.occupantActorIds] : [];
}

/** 某 Actor 是否位于任一 Pit（可选限定具体 Pit）。 */
export function isActorInSpikedPit(
  runtimes: SpikedPitRuntime[],
  actorId: string,
  pitDefinitionId?: string,
): boolean {
  return runtimes.some(
    (r) =>
      (pitDefinitionId === undefined || r.pitDefinitionId === pitDefinitionId) &&
      r.occupantActorIds.includes(actorId),
  );
}

/** 取某 Actor 所在的 Pit id（不在任何 Pit 时返回 null）。 */
export function findPitOfActor(runtimes: SpikedPitRuntime[], actorId: string): string | null {
  const rt = runtimes.find((r) => r.occupantActorIds.includes(actorId));
  return rt ? rt.pitDefinitionId : null;
}

// ---------------------------------------------------------------------------
// Occupancy 变更（纯函数；返回新数组）
// ---------------------------------------------------------------------------

/**
 * 把 Actor 放入 Pit。
 * 先从所有其他 Pit 移除，保证「Hero 不会同时位于两个 Area」（§25）。
 */
export function placeActorInPit(
  runtimes: SpikedPitRuntime[],
  actorId: string,
  pitDefinitionId: string,
): SpikedPitRuntime[] {
  return runtimes.map((r) => {
    if (r.pitDefinitionId === pitDefinitionId) {
      return r.occupantActorIds.includes(actorId)
        ? r
        : { ...r, occupantActorIds: [...r.occupantActorIds, actorId] };
    }
    if (r.occupantActorIds.includes(actorId)) {
      return { ...r, occupantActorIds: r.occupantActorIds.filter((id) => id !== actorId) };
    }
    return r;
  });
}

/** 把 Actor 移出所有 Pit（回滚 / Exit 用）。 */
export function removeActorFromPits(runtimes: SpikedPitRuntime[], actorId: string): SpikedPitRuntime[] {
  return runtimes.map((r) =>
    r.occupantActorIds.includes(actorId)
      ? { ...r, occupantActorIds: r.occupantActorIds.filter((id) => id !== actorId) }
      : r,
  );
}

/** 触发键（防重复结算）。 */
export function hazardTriggerKey(actorId: string, trigger: string, sourceEventId: string): string {
  return `${actorId}|${trigger}|${sourceEventId}`;
}

export function hasResolvedTrigger(rt: SpikedPitRuntime, key: string): boolean {
  return rt.resolvedTriggerKeys.includes(key);
}

export function withResolvedTrigger(rt: SpikedPitRuntime, key: string): SpikedPitRuntime {
  if (rt.resolvedTriggerKeys.includes(key)) return rt;
  const keys = [...rt.resolvedTriggerKeys, key];
  return { ...rt, resolvedTriggerKeys: keys.slice(-200) };
}
