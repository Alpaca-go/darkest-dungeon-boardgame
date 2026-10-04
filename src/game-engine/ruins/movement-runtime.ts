import type { BattleState } from '../../types';
import { beginLargeMovement, resolveLargeDisplacement, validateLargeMovementContract } from '../rules/large-movement-contract';
import { recordRuinsEvent } from './printed-effect-runtime';
import { runRuinsRoomTrigger } from './room-runtime';
import { continueRuinsSkillAfterForcedMove } from './monster-runtime';
import { applyRuinsPrintedEffects } from './printed-effect-runtime';
import { resumeRuinsAttackContinuation } from './monster-runtime';

/** Ordinary movement keeps the inherited ledger valid without changing the frozen v3 module. */
export function moveNormalCharacter(battle: BattleState, actorId: string, to: string): BattleState {
  validateLargeMovementContract(battle);
  const next = structuredClone(battle), contract = next.largeMovementContract;
  const living = [...next.heroes, ...next.monsters].filter(unit => unit.isAlive);
  if (!contract || contract.pendingChoice || contract.occupiedSpaces[actorId] !== 1
    || !living.some(unit => unit.id === actorId)) throw new Error('Invalid normal character move');
  const used = (areaId: string) => living.filter(unit => contract.placements[unit.id] === areaId)
    .reduce((sum, unit) => sum + contract.occupiedSpaces[unit.id], 0);
  const area = contract.areas.find(area => area.id === to);
  if (!area || used(to) - (contract.placements[actorId] === to ? 1 : 0) + 1 > area.capacity)
    throw new Error('Normal character Area capacity exceeded');
  contract.placements[actorId] = to;
  contract.overflow = contract.overflow.filter(grant => used(grant.areaId)
    > contract.areas.find(area => area.id === grant.areaId)!.capacity);
  validateLargeMovementContract(next);
  return next;
}

export function canMoveRuinsUnit(battle: BattleState, actorId: string, targetId: string, to: string): boolean {
  const context = battle.ruinsContext!;
  if (context.placements[actorId] === to) return true;
  try {
    const moved = context.occupiedSpaces[actorId] === 2
      ? beginLargeMovement(battle, actorId, targetId, to) : moveNormalCharacter(battle, actorId, to);
    return moved.largeMovementContract!.placements[actorId] === to || !!moved.largeMovementContract!.pendingChoice;
  } catch { return false; }
}

/** All ordinary spatial movement updates the inherited v3 ledger atomically. */
export function moveRuinsUnit(battle: BattleState, actorId: string, targetId: string, to: string): BattleState {
  if (battle.ruinsContext!.placements[actorId] === to) return battle;
  const next = battle.ruinsContext!.occupiedSpaces[actorId] === 2
    ? beginLargeMovement(battle, actorId, targetId, to) : moveNormalCharacter(battle, actorId, to);
  if (next.largeMovementContract!.pendingChoice) return next;
  next.ruinsContext!.placements = { ...next.largeMovementContract!.placements };
  return next;
}

export function pauseRuinsLargeDisplacement(battle: BattleState,
  input: NonNullable<NonNullable<BattleState['ruinsContext']>['pendingChoice']>, destinationId: string): BattleState {
  const large = battle.largeMovementContract!.pendingChoice!;
  const context = battle.ruinsContext!;
  const choiceId = recordRuinsEvent(context, 'LARGE_DISPLACEMENT_CHOICE', input.sourceActorId, input.targetIds,
    input.parentEventId, { candidateIds: large.candidateIds, largeChoiceId: large.choiceId });
  context.pendingChoice = { ...input, choiceId, kind: 'LARGE_DISPLACEMENT', candidateIds: [...large.candidateIds],
    movementContinuation: { kind: input.kind as 'MONSTER_MOVE' | 'PRINTED_SHUFFLE' | 'ROOM_MOVE', destinationId } };
  return battle;
}

export function resolveRuinsLargeDisplacement(battle: BattleState, choiceId: string, candidateId: string): BattleState {
  const choice = battle.ruinsContext?.pendingChoice;
  const large = battle.largeMovementContract?.pendingChoice;
  if (!choice || choice.kind !== 'LARGE_DISPLACEMENT' || choice.choiceId !== choiceId
    || !choice.candidateIds.includes(candidateId) || !large || !choice.movementContinuation)
    throw new Error('Ordinary Large displacement choice unavailable');
  const next = resolveLargeDisplacement(battle, large.choiceId, candidateId);
  next.ruinsContext!.placements = { ...next.largeMovementContract!.placements };
  next.ruinsContext!.pendingChoice = null;
  recordRuinsEvent(next.ruinsContext!, 'LARGE_DISPLACEMENT_CHOSEN', choice.actorId, choice.targetIds,
    choice.parentEventId, { candidateId });
  if (choice.movementContinuation.kind === 'PRINTED_SHUFFLE') {
    let resumed = runRuinsRoomTrigger(runRuinsRoomTrigger(next, 'SHUFFLED_INTO', choice.actorId), 'PASSIVE', choice.actorId);
    resumed = applyRuinsPrintedEffects(resumed, choice.sourceActorId, choice.targetIds[0], choice.remainingEffects, choice.parentEventId);
    if (resumed.ruinsContext?.pendingChoice) {
      resumed.ruinsContext.pendingChoice.attackContinuation = choice.attackContinuation;
      return resumed;
    }
    return choice.attackContinuation ? resumeRuinsAttackContinuation(resumed, choice.attackContinuation) : resumed;
  }
  return choice.skillNumber === null ? next : continueRuinsSkillAfterForcedMove(next, choice.actorId,
    choice.skillNumber, choice.targetIds, choice.parentEventId);
}
