import type { BattleState, BattleUnit, CampaignState } from '../../types';
import type { PrintedEffect, RuinsBattleContext } from '../../types/ruins-executable';
import { ruinsMonster, ruinsRoom, ruinsTile } from './source-registry';
import { resumeRuinsAttackContinuation, ruinsAreaDistance } from './monster-runtime';
import { synchronizeRuinsConditions } from './condition-runtime';
import { canMoveRuinsUnit, moveRuinsUnit, pauseRuinsLargeDisplacement } from './movement-runtime';
import { RUINS_STANCES } from '../../types/ruins-executable';
import { applyEffects, applyStatusEffectEvent } from '../status-effects';
import { ALL_DISEASES } from '../../data/diseases';
import { drawDisease } from '../diseases/draw-disease';
import { applyBattleUnitHealing } from '../healing';
import { runRuinsRoomTrigger } from './room-runtime';
import { SeededRandom, getRuntimeSources, withRuntimeSources } from '../runtime-sources';

let activeSources: { encounterId: string; random: SeededRandom; calls: number } | null = null;

export function withRuinsCampaignSources(campaign: CampaignState, action: (campaign: CampaignState) => CampaignState): CampaignState {
  if (!campaign.battle?.ruinsContext) return action(campaign);
  let result!: CampaignState;
  const shell = structuredClone(campaign.battle);
  const resolved = withRuinsBattleSources(shell, battle => {
    result = action({ ...campaign, battle });
    return result.battle ?? battle;
  });
  return result.battle ? { ...result, battle: resolved } : result;
}

export function withRuinsBattleSources(battle: BattleState, action: (battle: BattleState) => BattleState): BattleState {
  const context = battle.ruinsContext;
  if (!context) return action(battle);
  const prior = activeSources;
  const scope = prior?.encounterId === context.encounterId ? prior
    : { encounterId: context.encounterId, random: new SeededRandom(1), calls: context.rngCalls };
  if (scope !== prior) scope.random.restore(context.rngCursor);
  activeSources = scope;
  try {
    const current = getRuntimeSources();
    const next = withRuntimeSources({ ...current, random: { next: () => { scope.calls++; return scope.random.next(); } } },
      () => action(battle));
    if (next.ruinsContext) {
      next.ruinsContext.rngCursor = scope.random.snapshot();
      next.ruinsContext.rngCalls = scope.calls;
    }
    return next;
  } finally { activeSources = prior; }
}

export function withRuinsRandom<T>(battle: BattleState, work: (rng: () => number) => T): T {
  const context = battle.ruinsContext;
  if (!context) throw new Error('Ordinary Ruins context absent');
  if (activeSources?.encounterId === context.encounterId) {
    const result = work(() => { activeSources!.calls++; return activeSources!.random.next(); });
    context.rngCursor = activeSources.random.snapshot();
    context.rngCalls = activeSources.calls;
    return result;
  }
  const source = new SeededRandom(1);
  source.restore(context.rngCursor);
  const rng = () => { context.rngCalls++; const result = source.next(); context.rngCursor = source.snapshot(); return result; };
  const current = getRuntimeSources();
  return withRuntimeSources({ ...current, random: { next: rng } }, () => work(rng));
}

export function recordRuinsEvent(context: RuinsBattleContext, type: string, actorId: string, targetIds: string[],
  parentEventId: string | null, detail: Record<string, unknown>): string {
  const eventId = `${context.encounterId}:event:${context.events.length + 1}`;
  context.events.push({ eventId, type, actorId, targetIds, parentEventId, ruleSetVersion: context.ruleSetVersion, detail });
  return eventId;
}

function findUnit(battle: BattleState, id: string): BattleUnit {
  const unit = [...battle.heroes, ...battle.monsters].find(candidate => candidate.id === id);
  if (!unit) throw new Error('Printed effect target absent');
  return unit;
}

function ruinsMonsterForShuffle(context: RuinsBattleContext, id: string) {
  return ruinsMonster(context.definitionIds[id], context.ruleSetVersion);
}

function replaceUnit(battle: BattleState, unit: BattleUnit): BattleState {
  return { ...battle,
    heroes: battle.heroes.map(candidate => candidate.id === unit.id ? unit : candidate),
    monsters: battle.monsters.map(candidate => candidate.id === unit.id ? unit : candidate),
  };
}

export function ruinsDisplacementCandidates(battle: BattleState, unitId: string, relativeToId: string,
  direction: 'push' | 'pull', distance: number): string[] {
  const context = battle.ruinsContext;
  if (!context || !Number.isInteger(distance) || distance < 0) throw new Error('Invalid printed displacement');
  const tile = ruinsTile(context.tileId);
  const from = context.placements[unitId], relative = context.placements[relativeToId];
  if (!from || !relative) throw new Error('Printed displacement placement missing');
  const before = ruinsAreaDistance(tile, from, relative);
  let frontier = [from];
  for (let step = 0; step < distance; step++) {
    const next = [...new Set(frontier.flatMap(id => tile.areas.find(area => area.id === id)!.adjacent))]
      .filter(id => ruinsAreaDistance(tile, from, id) === step + 1
        && (direction === 'push' ? ruinsAreaDistance(tile, id, relative) === before + step + 1
          : ruinsAreaDistance(tile, id, relative) === before - step - 1)
        && canMoveRuinsUnit(battle, unitId, relativeToId, id));
    // Spatial displacement is cut short; the Stance displacement remains independent.
    if (!next.length) break;
    frontier = next;
  }
  return frontier.filter(id => id !== from).sort();
}

function shuffleStance(battle: BattleState, unitId: string, direction: 'push' | 'pull', distance: number): BattleState {
  const unit = findUnit(battle, unitId);
  const from = RUINS_STANCES.indexOf(unit.stance);
  const to = Math.max(0, Math.min(3, from + (direction === 'push' ? distance : -distance)));
  const shift = to > from ? -1 : 1;
  const update = (candidate: BattleUnit) => {
    if (!candidate.isAlive || candidate.side !== unit.side) return candidate;
    let index = RUINS_STANCES.indexOf(candidate.stance);
    if (candidate.id === unitId) index = to;
    else if (index >= Math.min(from, to) && index <= Math.max(from, to) && index !== from) index += shift;
    return { ...candidate, stance: RUINS_STANCES[index], position: index + 1 };
  };
  const next = { ...battle, heroes: battle.heroes.map(update), monsters: battle.monsters.map(update) };
  if (unit.side === 'monster') {
    const slots = new Set<number>();
    for (const monster of next.monsters.filter(candidate => candidate.isAlive)) {
      const width = ruinsMonster(battle.ruinsContext!.definitionIds[monster.id], battle.ruinsContext!.ruleSetVersion).stanceSlots;
      for (let offset = 0; offset < width; offset++) {
        const slot = monster.position + offset;
        if (slot > 4 || slots.has(slot)) throw new Error('SOURCE_UNRESOLVED: LARGE_STANCE_SHUFFLE_SLOT_COLLISION');
        slots.add(slot);
      }
    }
  }
  return next;
}

function applyOne(battle: BattleState, actorId: string, targetId: string, effect: PrintedEffect,
  parentEventId: string, remainingEffects: PrintedEffect[]): BattleState {
  const context = battle.ruinsContext!;
  const resolvedTargetId = 'target' in effect && effect.target === 'self' ? actorId : targetId;
  const target = findUnit(battle, resolvedTargetId);
  const recorded = (type: string, detail: Record<string, unknown> = {}) =>
    recordRuinsEvent(battle.ruinsContext!, type, actorId, [resolvedTargetId], parentEventId, detail);
  switch (effect.type) {
    case 'stress': {
      const targets = effect.target === 'party' ? battle.heroes.filter(hero => hero.isAlive) : [target];
      let next = battle;
      for (const hero of targets) {
        if (hero.side !== 'hero') throw new Error('Stress effect requires Hero target');
        const eventId = recordRuinsEvent(context, 'PRINTED_STRESS', actorId, [hero.id], parentEventId, { amount: effect.amount, effectTarget: effect.target });
        const updated = { ...findUnit(next, hero.id), stress: Math.max(0, Math.min(10, findUnit(next, hero.id).stress + effect.amount)) };
        next = replaceUnit(next, updated);
        next.pendingStressEvents = [...(next.pendingStressEvents ?? []), {
          id: eventId, heroInstanceId: hero.sourceId, amount: effect.amount,
          sourceType: 'battle-skill', sourceId: parentEventId,
        }];
      }
      return next;
    }
    case 'light': {
      recorded('PRINTED_LIGHT', { amount: effect.amount });
      return { ...battle, light: Math.max(0, Math.min(10, (battle.light ?? 0) + effect.amount)) };
    }
    case 'shuffle': {
      const relativeToId = resolvedTargetId === actorId ? targetId : actorId;
      const definition = target.side === 'monster' ? ruinsMonsterForShuffle(context, resolvedTargetId) : null;
      const roomImmunity = ruinsRoom(context.roomNumber).rules.some(rule => rule.trigger === 'PASSIVE'
        && rule.areas.includes(context.placements[resolvedTargetId]) && (rule.side === 'all' || rule.side === target.side)
        && rule.effects.some(item => item.type === 'immunity' && item.conditions.includes('push-pull')));
      if (effect.target !== 'self' && (definition?.immunities.includes('push-pull') || target.immunities?.includes('push-pull') || roomImmunity)) {
        recorded('PRINTED_SHUFFLE_IMMUNE'); return battle;
      }
      const distance = Math.max(0, effect.distance - (effect.target !== 'self' && definition?.resistances.includes('push-pull') ? 1 : 0));
      const effective = { ...effect, distance };
      const candidates = ruinsDisplacementCandidates(battle, resolvedTargetId, relativeToId, effect.direction, distance);
      battle = shuffleStance(battle, resolvedTargetId, effect.direction, distance);
      if (!candidates.length) { recorded('PRINTED_SHUFFLE_NO_SPACE', { direction: effect.direction, stanceDistance: distance }); return battle; }
      if (candidates.length > 1) {
        const choiceId = recorded('PRINTED_SHUFFLE_CHOICE', { candidateIds: candidates });
        context.pendingChoice = { choiceId, kind: 'PRINTED_SHUFFLE', shuffleEffect: effective, candidateIds: candidates,
          actorId: resolvedTargetId, sourceActorId: actorId, relativeToId, skillNumber: null, targetIds: [targetId],
          remainingEffects, parentEventId, ruleSetVersion: context.ruleSetVersion };
        return battle;
      }
      battle = moveRuinsUnit(battle, resolvedTargetId, relativeToId, candidates[0]);
      if (battle.largeMovementContract?.pendingChoice) return pauseRuinsLargeDisplacement(battle, {
        choiceId: parentEventId, kind: 'PRINTED_SHUFFLE', shuffleEffect: effective, candidateIds: candidates,
        actorId: resolvedTargetId, sourceActorId: actorId, relativeToId, skillNumber: null, targetIds: [targetId],
        remainingEffects, parentEventId, ruleSetVersion: context.ruleSetVersion }, candidates[0]);
      recorded('PRINTED_SHUFFLE', { areaId: candidates[0], direction: effect.direction });
      return runRuinsRoomTrigger(runRuinsRoomTrigger(battle, 'SHUFFLED_INTO', resolvedTargetId), 'PASSIVE', resolvedTargetId);
    }
    case 'condition': {
      const eventId = recorded('PRINTED_CONDITION', { condition: effect.condition, amount: effect.amount, turns: effect.turns });
      const passiveImmunity = ruinsRoom(context.roomNumber).rules.some(rule => rule.trigger === 'PASSIVE'
        && rule.areas.includes(context.placements[resolvedTargetId])
        && (rule.side === 'all' || rule.side === target.side)
        && rule.effects.some(item => item.type === 'immunity' && item.conditions.includes(effect.condition)));
      if (effect.target !== 'self' && (target.immunities?.includes(effect.condition) || passiveImmunity)) {
        recordRuinsEvent(context, 'PRINTED_CONDITION_IMMUNE', actorId, [resolvedTargetId], eventId,
          { condition: effect.condition, source: passiveImmunity ? 'room' : 'unit' });
        return battle;
      }
      let next = battle;
      let turns = effect.turns;
      if (effect.target === 'self' && effect.condition !== 'guard' && effect.condition !== 'riposte') {
        next = replaceUnit(next, applyEffects(target, [{ type: effect.condition as 'bleed', amount: effect.amount, durationTurns: effect.turns }]));
      } else if (effect.condition !== 'guard' && effect.condition !== 'riposte') {
        next = withRuinsRandom(battle, () => applyStatusEffectEvent(battle, resolvedTargetId,
        [{ type: effect.condition as 'bleed' | 'blight' | 'stun' | 'mark' | 'buff' | 'debuff',
          amount: effect.amount, durationTurns: effect.turns }], eventId));
        const blocked = next.statusEffectEvents!.find(item => item.eventId === eventId)!.blocked;
        if (blocked.some(item => item.reason === 'immune' || item.durationReducedTo === undefined)) return next;
        turns = blocked.find(item => item.durationReducedTo !== undefined)?.durationReducedTo ?? turns;
      } else if (effect.target !== 'self' && target.categoricalResistances?.includes(effect.condition as 'debuff')) turns--;
      if (turns > 0) {
        const tokens = next.ruinsContext!.conditionStacks;
        tokens[resolvedTargetId] = [...(tokens[resolvedTargetId] ?? []), { condition: effect.condition, amount: effect.amount, turns }];
        next = replaceUnit(next, synchronizeRuinsConditions(next, findUnit(next, resolvedTargetId)));
      }
      return next;
    }
    case 'markedDamageBonus': {
      recorded('PRINTED_MARKED_DAMAGE_BONUS', { amount: effect.amount, targetMarked: target.marked });
      return battle;
    }
    case 'heal': {
      const room = ruinsRoom(context.roomNumber);
      if (room.rules.some(rule => rule.trigger === 'PASSIVE' && (rule.side === 'all' || rule.side === target.side)
        && rule.areas.includes(context.placements[resolvedTargetId])
        && rule.effects.some(item => item.type === 'healingProhibited'))) throw new Error('Room passive prohibits healing');
      const amount = effect.amount === 'ALL_WOUNDS' ? target.maxHp - target.hp : effect.amount;
      recorded('PRINTED_HEAL', { amount, printedAmount: effect.amount });
      return replaceUnit(battle, applyBattleUnitHealing(target, amount).unit);
    }
    case 'removeCondition': {
      recorded('PRINTED_REMOVE_CONDITION', { condition: effect.condition });
      context.conditionStacks[resolvedTargetId] = (context.conditionStacks[resolvedTargetId] ?? [])
        .filter(token => token.condition !== effect.condition);
      const updated = { ...target, conditionDurations: { ...target.conditionDurations } };
      switch (effect.condition) {
        case 'bleed': updated.bleed = 0; delete updated.conditionDurations.bleed; break;
        case 'blight': updated.blight = 0; delete updated.conditionDurations.blight; break;
        case 'stun': updated.stunned = 0; delete updated.conditionDurations.stun; break;
        case 'mark': updated.marked = false; delete updated.conditionDurations.mark; break;
        case 'buff': updated.buffs = []; break;
        case 'debuff': updated.debuffs = []; break;
        case 'guard': delete context.guardStacks[resolvedTargetId]; break;
        case 'riposte': delete context.riposteStacks[resolvedTargetId]; break;
        case 'push-pull': break;
      }
      return replaceUnit(battle, updated);
    }
    case 'disease': {
      if (target.side !== 'hero' || !target.isAlive || !ALL_DISEASES.length) throw new Error('Disease acquisition target/deck unavailable');
      const diseaseId = withRuinsRandom(battle, drawDisease);
      const eventId = recorded('PRINTED_DISEASE_DRAW', { diseaseId });
      return { ...battle, pendingDiseaseInfections: [...(battle.pendingDiseaseInfections ?? []), {
        id: eventId, heroInstanceId: target.sourceId, diseaseId, sourceSkillId: parentEventId,
      }] };
    }
  }
}

/** Typed effects only. The first unresolved spatial choice freezes the remaining sequence. */
export function applyRuinsPrintedEffects(battle: BattleState, actorId: string, targetId: string,
  effects: PrintedEffect[], parentEventId: string): BattleState {
  if (!battle.ruinsContext || battle.ruinsContext.pendingChoice) throw new Error('Printed effect context unavailable or paused');
  let next = structuredClone(battle);
  for (let index = 0; index < effects.length; index++) {
    next = applyOne(next, actorId, targetId, effects[index], parentEventId, effects.slice(index + 1));
    if (next.ruinsContext?.pendingChoice) break;
  }
  return next;
}

export function resolveRuinsPrintedMovementChoice(battle: BattleState, choiceId: string, areaId: string): BattleState {
  const choice = battle.ruinsContext?.pendingChoice;
  if (!choice || choice.kind !== 'PRINTED_SHUFFLE' || choice.choiceId !== choiceId || !choice.candidateIds.includes(areaId))
    throw new Error('Printed movement choice unavailable');
  let next = structuredClone(battle);
  next.ruinsContext!.pendingChoice = null;
  next = moveRuinsUnit(next, choice.actorId, choice.relativeToId, areaId);
  if (next.largeMovementContract?.pendingChoice) return pauseRuinsLargeDisplacement(next, choice, areaId);
  recordRuinsEvent(next.ruinsContext!, 'PRINTED_SHUFFLE_CHOSEN', choice.actorId, choice.targetIds, choice.parentEventId, { areaId });
  const moved = runRuinsRoomTrigger(runRuinsRoomTrigger(next, 'SHUFFLED_INTO', choice.actorId), 'PASSIVE', choice.actorId);
  const resumed = applyRuinsPrintedEffects(moved, choice.sourceActorId, choice.targetIds[0], choice.remainingEffects, choice.parentEventId);
  if (resumed.ruinsContext?.pendingChoice) {
    resumed.ruinsContext.pendingChoice.attackContinuation = choice.attackContinuation;
    return resumed;
  }
  return choice.attackContinuation ? resumeRuinsAttackContinuation(resumed, choice.attackContinuation) : resumed;
}
