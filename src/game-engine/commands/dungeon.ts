// Phase 11A.2 §14 — Dungeon Enter Room Production Command。
//
// 真实顺序（与 dev doc §14 / 原 Store moveToRoom 严格一致）：
//   1. canMoveTo
//   2. engineMoveToRoom
//   3. if battle: settleBattleState
//   4. openRoomEnteredWindows
//   5. if dungeon-explore: evaluateReplacementFlow
import type { CampaignState } from '../../types';
import { canMoveTo, moveToRoom as engineMoveToRoom } from '../dungeon';
import { openRoomEnteredWindows } from '../trinkets/battle-trinket-bridge';
import { evaluateReplacementFlow } from '../stagecoach';
import { settleBattleState } from './battle';

export type EnterRoomError =
  | 'cannot-move'
  | 'battle-settlement-failed';

export interface EnterRoomResult {
  ok: boolean;
  campaign: CampaignState;
  error: EnterRoomError | null;
}

/**
 * 正式进入地牢房间。UI 与 Simulation Driver 共用。
 */
export function enterDungeonRoom(
  campaign: CampaignState,
  roomId: string,
): EnterRoomResult {
  if (!campaign.dungeon || !canMoveTo(campaign.dungeon, roomId)) {
    return { ok: false, campaign, error: 'cannot-move' };
  }

  let next: CampaignState = engineMoveToRoom(campaign, roomId);

  // 进入战斗房间时立即结算（压力 / 死亡 / 精神）。
  // 即使 settleBattleState 返回 mental-guard-exceeded（极少见，长 mental loop），
  // 仍把 partial state 推回；Driver 由 mentalGuardLimit 参数控制上限。
  if (next.battle) {
    const settled = settleBattleState(next);
    if (!settled.ok) {
      return { ok: true, campaign: settled.campaign, error: 'battle-settlement-failed' };
    }
    next = settled.campaign;
  }

  // 非战斗房间为全体存活英雄开 room-entered 窗口（幂等）
  next = openRoomEnteredWindows(next, roomId);

  // 探索阶段的死亡 → 替补流程
  if (next.gamePhase === 'dungeon-explore') {
    next = evaluateReplacementFlow(next);
  }

  return { ok: true, campaign: next, error: null };
}
