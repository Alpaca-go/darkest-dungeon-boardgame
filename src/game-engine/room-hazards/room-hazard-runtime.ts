// Phase 10B §18 / §19：Room Hazard Runtime 聚合操作。
//
// 提供跨多个 Pit 的批量触发（例如「回合结束时，所有位于 Pit 中的 Hero 结算 endTurnEffects」），
// 以及 Battle End 时的 Hazard 状态清理策略（§21 末尾：由 Room Exit / Battle End Policy 统一处理）。

import type { CampaignState } from '../../types';
import type {
  RoomHazardEvent,
  RoomHazardTrigger,
  SpikedPitDefinition,
  SpikedPitRuntime,
} from '../../types/room-hazards';
import { resolveRoomHazardTrigger } from './room-hazard-trigger';

export interface ResolveAllPitEndTurnParams {
  campaign: CampaignState;
  pits: SpikedPitDefinition[];
  runtimes: SpikedPitRuntime[];
  trigger: Extract<RoomHazardTrigger, 'on-end-turn' | 'on-start-turn'>;
  /** 触发来源事件 id（通常是 `${battleId}:round-${n}:end`）。 */
  sourceEventId: string;
  transactionPrefix: string;
  battleId?: string;
  now?: string;
}

export interface ResolveAllPitEndTurnResult {
  campaign: CampaignState;
  runtimes: SpikedPitRuntime[];
  events: RoomHazardEvent[];
  failures: string[];
}

/**
 * 对所有 Pit 内的 Actor 统一触发某个周期性 Hazard。
 * 顺序：按 Pit 定义顺序 → 各 Pit 内按占据者顺序（确定性）。
 */
export function resolveAllPitPeriodicTriggers(
  params: ResolveAllPitEndTurnParams,
): ResolveAllPitEndTurnResult {
  let campaign = params.campaign;
  let runtimes = params.runtimes;
  const events: RoomHazardEvent[] = [];
  const failures: string[] = [];

  for (const pit of params.pits) {
    const idx = runtimes.findIndex((r) => r.pitDefinitionId === pit.id);
    if (idx < 0) continue;
    for (const actorId of [...runtimes[idx].occupantActorIds]) {
      const current = runtimes[idx];
      const res = resolveRoomHazardTrigger({
        campaign,
        pit,
        runtime: current,
        trigger: params.trigger,
        actorId,
        sourceEventId: params.sourceEventId,
        transactionId: `${params.transactionPrefix}:${pit.id}:${params.trigger}:${actorId}`,
        battleId: params.battleId,
        now: params.now,
      });
      campaign = res.campaign;
      runtimes = runtimes.map((r, i) => (i === idx ? res.runtime : r));
      if (res.event) events.push(res.event);
      if (!res.ok && res.reason) failures.push(res.reason);
    }
  }

  return { campaign, runtimes, events, failures };
}

/**
 * Battle End / Room Exit 时的 Hazard 清理（§21）。
 *
 * 策略：清空 Pit 占据者（Hero 随战斗结束离开房间），
 * 但**保留** resolvedTriggerKeys 与历史事件，供存档审计。
 * 是否对仍在 Pit 中的 Hero 施加额外效果**没有资料** → 不自创。
 */
export function clearRoomHazardsOnBattleEnd(runtimes: SpikedPitRuntime[]): SpikedPitRuntime[] {
  return runtimes.map((r) => (r.occupantActorIds.length === 0 ? r : { ...r, occupantActorIds: [] }));
}

/** 取全部位于任意 Pit 中的 Actor（UI Occupancy 展示用）。 */
export function getAllPitOccupancy(runtimes: SpikedPitRuntime[]): { pitId: string; actorIds: string[] }[] {
  return runtimes.map((r) => ({ pitId: r.pitDefinitionId, actorIds: [...r.occupantActorIds] }));
}
