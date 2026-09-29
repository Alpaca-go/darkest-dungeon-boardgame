// Phase 11A.2 §14 — Dungeon Enter Room Production Command。
//
// 真实顺序（与 dev doc §14 / 原 Store moveToRoom 严格一致）：
//   1. canMoveTo
//   2. freeze exploration move → Trinket decisions → shared commit
//   3. leave-room rules; if battle: settleBattleState
//   4. openRoomEnteredWindows
//   5. if dungeon-explore: evaluateReplacementFlow
import type { CampaignState } from '../../types';
import { canMoveTo } from '../dungeon';
import { openRoomEnteredWindows } from '../trinkets/battle-trinket-bridge';
import { evaluateReplacementFlow } from '../stagecoach';
import { settleBattleState } from './battle';
import { evaluateQuestRules } from '../quests/quest-special-rule-runtime';

import { beginExplorationMoveTrinketAction } from '../trinkets/dungeon-trinket-bridge';
import { necromancerQuestEntryError } from '../bosses/production-dependency-gate';

export type EnterRoomError =
  | 'cannot-move'
  | 'pending-quest-rule-choice'
  | 'battle-settlement-failed'
  | 'necromancer-threat-domain-bridge-unbound'
  | 'necromancer-production-dependencies-unbound';

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
  if (campaign.dungeon?.rooms.some(r => r.id === roomId && r.type === 'objective')
    && necromancerQuestEntryError(campaign, campaign.currentQuestId ?? '')) {
    return { ok: false, campaign, error: 'necromancer-production-dependencies-unbound' };
  }
  if (campaign.questRuntimeState?.pendingRuleChoice) {
    return { ok: false, campaign, error: 'pending-quest-rule-choice' };
  }
  if (campaign.gamePhase !== 'dungeon-explore' || campaign.battle || campaign.pendingDungeonTrinketAction
    || !campaign.dungeon || !canMoveTo(campaign.dungeon, roomId)
    || !campaign.dungeon.rooms.some((room) => room.id === roomId)) {
    return { ok: false, campaign, error: 'cannot-move' };
  }

  // Stop affected promotion: the saved production Threat has no ordinary source-bound
  // battle command yet. Never let its guarded Rooms silently use prototype encounters.
  const room = campaign.dungeon.rooms.find(r => r.id === roomId)!;
  if (campaign.bossEncounterCheckpoint?.checkpointContext?.heroDodgeBindings
    && ['lair', 'treasure', 'curio'].includes(room.sourceRoomToken ?? '')) {
    return { ok: false, campaign, error: 'necromancer-threat-domain-bridge-unbound' };
  }

  const begun = beginExplorationMoveTrinketAction(campaign, roomId);
  return { ok: true, campaign: begun.campaign, error: null };
}

export function finalizeDungeonRoomEntry(campaign: CampaignState, previousRoomId: string, roomId: string): EnterRoomResult {
  let next = campaign;
  next = evaluateQuestRules(next, {
    trigger: 'leave-room',
    triggerInstanceId: `${previousRoomId}->${roomId}`,
  });

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
