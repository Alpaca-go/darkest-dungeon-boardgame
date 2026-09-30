import type { CampaignState } from '../../types';
import { advanceTurn, checkEnd } from '../battle';
import { settleBattleState } from './battle';
import { ruinsTile } from '../ruins/source-registry';
import { ruinsAreaDistance, resolveRuinsMonsterMovementChoice } from '../ruins/monster-runtime';
import { moveRuinsUnit, canMoveRuinsUnit, resolveRuinsLargeDisplacement } from '../ruins/movement-runtime';
import { recordRuinsEvent, resolveRuinsPrintedMovementChoice } from '../ruins/printed-effect-runtime';
import { interactOrdinaryRuinsRoom, resolveRuinsRoomMovementChoice, runRuinsRoomTrigger } from '../ruins/room-runtime';
import { chooseOrdinaryReanimation } from '../ruins/production-threat-runtime';

function continueBattle(campaign: CampaignState): CampaignState {
  let battle = checkEnd(campaign.battle!);
  if (battle.status === 'active' && !battle.ruinsContext?.pendingChoice && !battle.ruinsContext?.pendingReanimationChoice
    && !battle.pendingAction && !battle.pendingMonsterAttack && (!battle.activeActorId
      || battle.currentActionPoints <= 0 || battle.monsters.some(u => u.id === battle.activeActorId))) battle = advanceTurn(battle);
  return settleBattleState({ ...campaign, battle }).campaign;
}

export function commitOrdinaryRuinsAreaMove(c: CampaignState, areaId: string): CampaignState {
  const b = c.battle, r = b?.ruinsContext, hero = b?.heroes.find(u => u.id === b.activeActorId && u.isAlive);
  if (!b || !r || !hero || b.status !== 'active' || b.currentActionPoints < 1 || b.pendingAction
    || b.pendingMonsterAttack || r.pendingChoice || r.pendingReanimationChoice || r.pendingThreatDeathIds?.length)
    throw new Error('Ordinary Hero Area movement unavailable');
  const tile = ruinsTile(r.tileId);
  if (areaId === r.placements[hero.id] || ruinsAreaDistance(tile, r.placements[hero.id], areaId) > hero.speed
    || !canMoveRuinsUnit(b, hero.id, hero.id, areaId)) throw new Error('Illegal ordinary Hero Area');
  let moved = moveRuinsUnit(b, hero.id, hero.id, areaId);
  moved.currentActionPoints--;
  recordRuinsEvent(moved.ruinsContext!, 'HERO_AREA_MOVED', hero.id, [hero.id], null, { areaId });
  moved = runRuinsRoomTrigger(moved, 'PASSIVE', hero.id);
  return continueBattle({ ...c, battle: moved });
}

export function commitOrdinaryRuinsChoice(c: CampaignState, choiceId: string, selectedId: string): CampaignState {
  const r = c.battle?.ruinsContext;
  if (r?.pendingReanimationChoice) return continueBattle(chooseOrdinaryReanimation(c, choiceId, selectedId));
  const choice = r?.pendingChoice;
  if (!choice || choice.choiceId !== choiceId || !choice.candidateIds.includes(selectedId)) throw new Error('Ordinary choice unavailable');
  const resolve = choice.kind === 'LARGE_DISPLACEMENT' ? resolveRuinsLargeDisplacement
    : choice.kind === 'PRINTED_SHUFFLE' ? resolveRuinsPrintedMovementChoice
      : choice.kind === 'ROOM_MOVE' ? resolveRuinsRoomMovementChoice : resolveRuinsMonsterMovementChoice;
  return continueBattle({ ...c, battle: resolve(c.battle!, choiceId, selectedId) });
}

export function commitOrdinaryRuinsInteraction(c: CampaignState, ruleId: string): CampaignState {
  if (!c.battle?.activeActorId || c.battle.ruinsContext?.pendingReanimationChoice
    || c.battle.ruinsContext?.pendingThreatDeathIds?.length) throw new Error('Ordinary interaction unavailable');
  return continueBattle(interactOrdinaryRuinsRoom(c, c.battle.activeActorId, ruleId));
}
