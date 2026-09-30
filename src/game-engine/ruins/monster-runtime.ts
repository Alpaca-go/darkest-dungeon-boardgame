import type { BattleState, BattleUnit, MonsterSkillDefinition, PendingMonsterAttack } from '../../types';
import type { RuinsMonster, RuinsSkill, RuinsStance, RuinsTile } from '../../types/ruins-executable';
import { RUINS_STANCES } from '../../types/ruins-executable';
import { resolveRuinsStance } from './source-registry';
import { ruinsMonster, ruinsRoom, ruinsTile } from './source-registry';
import { applyRuinsPrintedEffects, recordRuinsEvent, withRuinsRandom } from './printed-effect-runtime';
import { runRuinsRoomTrigger } from './room-runtime';
import { canMoveRuinsUnit, moveRuinsUnit, pauseRuinsLargeDisplacement } from './movement-runtime';
import { resolvePrintedAttackFromRoll } from '../combat-resolution';

/** Selection is sourced exclusively from the locked typed Stance table. */
export function resolveRuinsMonsterSkill(definition: RuinsMonster, stance: RuinsStance, d10: number): RuinsSkill | null {
  if (!Number.isInteger(d10) || d10 < 1 || d10 > 10) throw new Error('Saved Monster d10 must be 1–10');
  const behavior = resolveRuinsStance(definition, stance);
  if (behavior.kind === 'NO_ACTION') return null;
  const rows = behavior.rows.filter(row => row.min <= d10 && d10 <= row.max);
  if (rows.length !== 1) throw new Error('Printed Stance d10 table is not exhaustive');
  const skill = definition.skills.find(candidate => candidate.number === rows[0].skill);
  if (!skill) throw new Error('Printed Skill not bound');
  return skill;
}

export function ruinsAreaDistance(tile: RuinsTile, from: string, to: string): number {
  const known = new Set(tile.areas.map(area => area.id));
  if (!known.has(from) || !known.has(to)) throw new Error('Unknown printed Area');
  const queue: Array<[string, number]> = [[from, 0]];
  const visited = new Set<string>();
  while (queue.length) {
    const [area, distance] = queue.shift()!;
    if (area === to) return distance;
    if (visited.has(area)) continue;
    visited.add(area);
    for (const next of tile.areas.find(candidate => candidate.id === area)!.adjacent) queue.push([next, distance + 1]);
  }
  return Infinity;
}

export interface RuinsTargetContext {
  battle: BattleState;
  tile: RuinsTile;
  placements: Record<string, string>;
  /** Printed Guard stacks. Mandatory so callers cannot silently bypass Guard priority. */
  guardStacks: Record<string, number>;
}

/** p24 target priority and Aggressive-to-Support tie order; no array-order fallback. */
export function selectRuinsMonsterTargets(context: RuinsTargetContext, actorId: string, skill: RuinsSkill): string[] {
  const { battle, tile, placements, guardStacks } = context;
  const actor = battle.monsters.find(unit => unit.id === actorId && unit.isAlive);
  if (!actor || !placements[actorId]) throw new Error('Unbound ordinary Monster actor');
  if (skill.targetSide === 'self') return [actorId];
  const population = (skill.targetSide === 'hero' ? battle.heroes : battle.monsters)
    .filter(unit => unit.isAlive && unit.id !== actorId);
  let units = population;
  if (units.some(unit => !placements[unit.id] || !tile.areas.some(area => area.id === placements[unit.id]))) {
    throw new Error('Target placement is not bound to the printed Tile');
  }
  const guarded = skill.targetSide === 'hero' ? units.filter(unit => guardStacks[unit.id] > 0) : [];
  if (guarded.length) units = guarded;
  if (skill.targeting.markedFirst && units.some(unit => unit.marked)) units = units.filter(unit => unit.marked);
  if (!units.length) return [];
  const score = (unit: BattleUnit): number => {
    const distance = ruinsAreaDistance(tile, placements[actorId], placements[unit.id]);
    switch (skill.targeting.priority) {
      case 'Closest': return -distance;
      case 'Furthest': return distance;
      case 'Most Wounded': return unit.maxHp - unit.hp;
      case 'Most Stressed': return unit.stress;
      case 'Crowded': return population.filter(other => placements[other.id] === placements[unit.id]).length;
      case 'Self': return unit.id === actorId ? 1 : 0;
    }
  };
  const sorted = units.sort((a, b) => score(b) - score(a)
    || RUINS_STANCES.indexOf(a.stance) - RUINS_STANCES.indexOf(b.stance)
    || a.id.localeCompare(b.id));
  const first = sorted[0];
  return sorted.filter(unit => placements[unit.id] === placements[first.id]).slice(0, skill.targets).map(unit => unit.id);
}

/** Legal destination candidates are returned for a saved player choice when tied. */
export function ruinsMonsterMovementCandidates(context: RuinsTargetContext, actorId: string,
  targetId: string, skill: RuinsSkill, occupiedSpaces: Record<string, number>, speed: number): string[] {
  if (skill.range.kind === 'SELF') return [context.placements[actorId]];
  const { tile, placements, battle } = context;
  const from = placements[actorId], target = placements[targetId];
  if (!from || !target || !Number.isInteger(speed) || speed < 0) throw new Error('Unbound Monster movement');
  const desired = skill.range.distance;
  if (ruinsAreaDistance(tile, from, target) === desired) return [from];
  const occupancy = (areaId: string) => [...battle.heroes, ...battle.monsters]
    .filter(unit => unit.isAlive && unit.id !== actorId && placements[unit.id] === areaId)
    .reduce((total, unit) => total + (occupiedSpaces[unit.id] ?? 1), 0);
  const spaces = occupiedSpaces[actorId];
  if (spaces !== 1 && spaces !== 2) throw new Error('Unbound printed Monster size');
  return tile.areas.filter(area => ruinsAreaDistance(tile, from, area.id) <= speed
    && ruinsAreaDistance(tile, area.id, target) === desired
    && (battle.largeMovementContract ? canMoveRuinsUnit(battle, actorId, targetId, area.id) : area.capacity - occupancy(area.id) >= spaces))
    .map(area => area.id).sort();
}

/** When Speed cannot reach exact Range, still move as close to that Range as possible (p24). */
export function ruinsMonsterTurnMovementCandidates(context: RuinsTargetContext, actorId: string,
  targetId: string, skill: RuinsSkill, occupiedSpaces: Record<string, number>, speed: number): string[] {
  const exact = ruinsMonsterMovementCandidates(context, actorId, targetId, skill, occupiedSpaces, speed);
  if (exact.length || skill.range.kind === 'SELF') return exact;
  const { tile, placements, battle } = context;
  const from = placements[actorId], target = placements[targetId];
  const desired = skill.range.distance;
  const candidates = tile.areas.filter(area => ruinsAreaDistance(tile, from, area.id) <= speed
    && canMoveRuinsUnit(battle, actorId, targetId, area.id));
  const gap = (areaId: string) => Math.abs(ruinsAreaDistance(tile, areaId, target) - desired);
  const best = Math.min(gap(from), ...candidates.map(area => gap(area.id)));
  return candidates.filter(area => gap(area.id) === best).map(area => area.id).sort();
}

function printedSkillSnapshot(definition: RuinsMonster, skill: RuinsSkill): MonsterSkillDefinition {
  if (skill.attack.kind !== 'ROLL') throw new Error('Automatic printed Skill has no attack snapshot');
  return { id: `ruins:${definition.canonicalId}:skill:${skill.number}`, monsterId: definition.canonicalId,
    name: skill.name, usableFromPositions: [1, 2, 3, 4], validTargetPositions: [1, 2, 3, 4],
    targetSide: 'enemy', accuracy: skill.attack.accuracy, minDamage: skill.attack.damage,
    maxDamage: skill.attack.critDamage, description: `Locked Ruins printed Skill ${skill.number}` };
}

function unappliedPartyEffects(battle: BattleState, effects: RuinsSkill['effects'], parentEventId: string) {
  return effects.filter(effect => {
    if (effect.type !== 'light' && !(effect.type === 'stress' && effect.target === 'party')) return true;
    return !battle.ruinsContext!.events.some(event => event.parentEventId === parentEventId
      && (effect.type === 'light' ? event.type === 'PRINTED_LIGHT'
        : event.type === 'PRINTED_STRESS' && event.detail.effectTarget === 'party'));
  });
}

export function stageRuinsAttack(battle: BattleState, actorId: string, skill: RuinsSkill, targetIds: string[],
  parentEventId: string, savedAttackRoll: number | null = null, selfEffectsApplied = false): BattleState {
  const context = battle.ruinsContext!;
  const definition = ruinsMonster(context.definitionIds[actorId], context.ruleSetVersion);
  targetIds = targetIds.filter(id => [...battle.heroes, ...battle.monsters].some(unit => unit.id === id && unit.isAlive));
  if (!targetIds.length) return battle;
  const roll = skill.attack.kind === 'ROLL' ? savedAttackRoll ?? withRuinsRandom(battle, rng => 1 + Math.floor(rng() * 10)) : null;
  if (roll !== null) recordRuinsEvent(context, 'MONSTER_ATTACK_ROLLED', actorId, targetIds, parentEventId, { roll });
  if (!selfEffectsApplied) {
    const selfEffects = skill.effects.filter(effect => 'target' in effect && effect.target === 'self');
    if (selfEffects.length) {
      battle = applyRuinsPrintedEffects(battle, actorId, targetIds[0], selfEffects, parentEventId);
      if (battle.ruinsContext!.pendingChoice) {
        battle.ruinsContext!.pendingChoice.attackContinuation = { actorId, skillNumber: skill.number,
          targetIds, parentEventId, attackRoll: roll, selfEffectsApplied: true };
        return battle;
      }
    }
  }
  const targetEffects = skill.effects.filter(effect => !('target' in effect && effect.target === 'self'));
  if (skill.attack.kind === 'AUTOMATIC') {
    let next = battle;
    for (const [index, targetId] of targetIds.entries()) {
      next = applyRuinsPrintedEffects(next, actorId, targetId, unappliedPartyEffects(next, targetEffects, parentEventId), parentEventId);
      if (next.ruinsContext?.pendingChoice) {
        next.ruinsContext.pendingChoice.attackContinuation = { actorId, skillNumber: skill.number,
          targetIds: targetIds.slice(index + 1), parentEventId, attackRoll: null, selfEffectsApplied: true };
        break;
      }
    }
    return next;
  }
  const snapshot = printedSkillSnapshot(definition, skill);
  const pending: PendingMonsterAttack = {
    kind: 'monster-attack', rootEventId: `${parentEventId}:${targetIds[0]}`,
    stage: 'incoming-attack-window', monsterUnitId: actorId, targetHeroUnitId: targetIds[0],
    skillId: snapshot.id, attackRoll: roll!, dodgeModifier: 0, hit: null, crit: null,
    baseDamage: null, criticalOverride: null, diseaseRoll: null,
    incomingDamageNumerator: 1, incomingDamageDenominator: 1, incomingDamageRounding: 'ceil',
    processedTrinketInstanceIds: [], ruinsAttack: { skillNumber: skill.number,
      skill: snapshot, remainingTargetIds: targetIds.slice(1), parentEventId },
  };
  return { ...battle, pendingMonsterAttack: pending };
}

/** One pinned d10 selects a typed skill. Movement choices pause before the attack roll. */
export function prepareRuinsMonsterTurn(battle: BattleState, actorId: string): BattleState {
  if (!battle.ruinsContext || battle.ruinsContext.pendingChoice || battle.pendingMonsterAttack)
    throw new Error('Ordinary Ruins Monster turn unavailable');
  const next = structuredClone(battle);
  const context = next.ruinsContext!;
  const actor = next.monsters.find(unit => unit.id === actorId && unit.isAlive);
  if (!actor) throw new Error('Ordinary Ruins Monster actor unavailable');
  const definition = ruinsMonster(context.definitionIds[actorId], context.ruleSetVersion);
  const d10 = withRuinsRandom(next, rng => 1 + Math.floor(rng() * 10));
  const skill = resolveRuinsMonsterSkill(definition, actor.stance, d10);
  const parentEventId = recordRuinsEvent(context, 'MONSTER_SKILL_SELECTED', actorId, [], null,
    { d10, skillNumber: skill?.number ?? null, stance: actor.stance });
  if (!skill) return next;
  const tile = ruinsTile(context.tileId);
  const targetIds = selectRuinsMonsterTargets({ battle: next, tile,
    placements: context.placements, guardStacks: context.guardStacks }, actorId, skill);
  if (!targetIds.length) {
    recordRuinsEvent(context, 'MONSTER_NO_TARGET', actorId, [], parentEventId, {});
    return next;
  }
  const lastMonsterId = [...next.initiativeOrder].reverse().find(id => next.monsters.some(unit => unit.id === id && unit.isAlive));
  if (lastMonsterId === actorId && ruinsRoom(context.roomNumber).rules.some(rule => rule.trigger === 'LAST_MONSTER_MOVE')) {
    const moved = runRuinsRoomTrigger(next, 'LAST_MONSTER_MOVE', actorId,
      { skillNumber: skill.number, targetIds, parentEventId });
    if (moved.ruinsContext?.pendingChoice) return moved;
    return continueRuinsSkillAfterForcedMove(moved, actorId, skill.number, targetIds, parentEventId);
  }
  const candidates = ruinsMonsterTurnMovementCandidates({ battle: next, tile,
    placements: context.placements, guardStacks: context.guardStacks }, actorId, targetIds[0],
    skill, context.occupiedSpaces, actor.speed);
  if (!candidates.length) {
    recordRuinsEvent(context, 'MONSTER_OUT_OF_RANGE', actorId, targetIds, parentEventId, {});
    return next;
  }
  if (candidates.length > 1) {
    const choiceId = recordRuinsEvent(context, 'MONSTER_MOVEMENT_CHOICE', actorId, targetIds, parentEventId,
      { candidateIds: candidates });
    context.pendingChoice = { choiceId, kind: 'MONSTER_MOVE', shuffleEffect: null, candidateIds: candidates,
      actorId, sourceActorId: actorId, relativeToId: targetIds[0], skillNumber: skill.number,
      targetIds, remainingEffects: [], parentEventId, ruleSetVersion: context.ruleSetVersion };
    return next;
  }
  let moved = moveRuinsUnit(next, actorId, targetIds[0], candidates[0]);
  if (moved.largeMovementContract?.pendingChoice) return pauseRuinsLargeDisplacement(moved, {
    choiceId: parentEventId, kind: 'MONSTER_MOVE', shuffleEffect: null, candidateIds: candidates,
    actorId, sourceActorId: actorId, relativeToId: targetIds[0], skillNumber: skill.number,
    targetIds, remainingEffects: [], parentEventId, ruleSetVersion: context.ruleSetVersion }, candidates[0]);
  recordRuinsEvent(moved.ruinsContext!, 'MONSTER_MOVED', actorId, targetIds, parentEventId, { areaId: candidates[0] });
  moved = runRuinsRoomTrigger(moved, 'PASSIVE', actorId);
  return continueRuinsSkillAfterForcedMove(moved, actorId, skill.number, targetIds, parentEventId);
}

export function continueRuinsSkillAfterForcedMove(battle: BattleState, actorId: string, skillNumber: number,
  targetIds: string[], parentEventId: string): BattleState {
  const context = battle.ruinsContext!;
  const definition = ruinsMonster(context.definitionIds[actorId], context.ruleSetVersion);
  const skill = definition.skills.find(candidate => candidate.number === skillNumber);
  if (!skill) throw new Error('Forced Room movement Skill missing');
  const tile = ruinsTile(context.tileId);
  if (skill.range.kind === 'EXACT' && ruinsAreaDistance(tile, context.placements[actorId], context.placements[targetIds[0]]) !== skill.range.distance) {
    recordRuinsEvent(context, 'MONSTER_OUT_OF_RANGE', actorId, targetIds, parentEventId, { roomForcedMovement: true });
    return battle;
  }
  const area = context.placements[targetIds[0]];
  const remainingInArea = skill.targetSide === 'self' ? targetIds : targetIds.filter(id => context.placements[id] === area);
  return stageRuinsAttack(runRuinsRoomTrigger(battle, 'PASSIVE', actorId), actorId, skill, remainingInArea, parentEventId);
}

export function resolveRuinsMonsterMovementChoice(battle: BattleState, choiceId: string, areaId: string): BattleState {
  const choice = battle.ruinsContext?.pendingChoice;
  if (!choice || choice.kind !== 'MONSTER_MOVE' || choice.choiceId !== choiceId || !choice.candidateIds.includes(areaId)
    || choice.skillNumber === null) throw new Error('Ordinary Monster movement choice unavailable');
  let next = structuredClone(battle);
  next.ruinsContext!.pendingChoice = null;
  next = moveRuinsUnit(next, choice.actorId, choice.relativeToId, areaId);
  if (next.largeMovementContract?.pendingChoice) return pauseRuinsLargeDisplacement(next, choice, areaId);
  const context = next.ruinsContext!;
  recordRuinsEvent(context, 'MONSTER_MOVEMENT_CHOSEN', choice.actorId, choice.targetIds, choice.parentEventId, { areaId });
  const definition = ruinsMonster(context.definitionIds[choice.actorId], context.ruleSetVersion);
  const skill = definition.skills.find(candidate => candidate.number === choice.skillNumber);
  if (!skill) throw new Error('Saved Monster Skill missing');
  return continueRuinsSkillAfterForcedMove(next, choice.actorId, skill.number, choice.targetIds, choice.parentEventId);
}

export function resolveRuinsAttackValues(battle: BattleState): { hit: boolean; crit: boolean; damage: number } {
  const pending = battle.pendingMonsterAttack;
  const source = pending?.ruinsAttack;
  const context = battle.ruinsContext;
  if (!pending || !source || !context) throw new Error('Ordinary Ruins attack unavailable');
  const definition = ruinsMonster(context.definitionIds[pending.monsterUnitId], context.ruleSetVersion);
  const skill = definition.skills.find(candidate => candidate.number === source.skillNumber);
  const hero = battle.heroes.find(unit => unit.id === pending.targetHeroUnitId);
  if (!skill || skill.attack.kind !== 'ROLL' || !hero?.heroDodgeBinding) throw new Error('Printed attack or Hero Dodge unbound');
  const dodge = hero.heroDodgeBinding.value;
  const actor = battle.monsters.find(unit => unit.id === pending.monsterUnitId)!;
  const markStacks = context.conditionStacks[hero.id]?.filter(item => item.condition === 'mark')
    .reduce((sum, item) => sum + item.amount, 0) ?? (hero.marked ? 1 : 0);
  const critBonus = actor.buffs.reduce((sum, item) => sum + item.amount, 0)
    + hero.debuffs.reduce((sum, item) => sum + item.amount, 0);
  const resolved = resolvePrintedAttackFromRoll(skill.attack, pending.attackRoll, dodge + pending.dodgeModifier, markStacks, critBonus);
  const markedBonus = hero.marked ? skill.effects.filter(effect => effect.type === 'markedDamageBonus')
    .reduce((sum, effect) => sum + effect.amount, 0) : 0;
  return { hit: resolved.hit, crit: resolved.crit, damage: resolved.hit ? resolved.damage + markedBonus : 0 };
}

export function finishRuinsAttack(battle: BattleState, pending: PendingMonsterAttack, hit: boolean): BattleState {
  const source = pending.ruinsAttack;
  const context = battle.ruinsContext;
  if (!source || !context) throw new Error('Ordinary Ruins attack continuation absent');
  const definition = ruinsMonster(context.definitionIds[pending.monsterUnitId], context.ruleSetVersion);
  const skill = definition.skills.find(candidate => candidate.number === source.skillNumber);
  if (!skill) throw new Error('Ordinary Ruins Skill unavailable');
  let next = battle;
  const effects = skill.effects.filter(effect => effect.type !== 'markedDamageBonus'
    && !('target' in effect && effect.target === 'self')
    && hit && battle.heroes.some(unit => unit.id === pending.targetHeroUnitId && unit.isAlive));
  if (effects.length) next = applyRuinsPrintedEffects(next, pending.monsterUnitId, pending.targetHeroUnitId,
    unappliedPartyEffects(next, effects, source.parentEventId), source.parentEventId);
  if (next.ruinsContext?.pendingChoice) {
    next.ruinsContext.pendingChoice.attackContinuation = { actorId: pending.monsterUnitId,
      skillNumber: skill.number, targetIds: source.remainingTargetIds,
      parentEventId: source.parentEventId, attackRoll: pending.attackRoll, selfEffectsApplied: true };
    return next;
  }
  if (!source.remainingTargetIds.length) return next;
  return stageRuinsAttack(next, pending.monsterUnitId, skill, source.remainingTargetIds, source.parentEventId, pending.attackRoll, true);
}

export function resumeRuinsAttackContinuation(battle: BattleState,
  continuation: NonNullable<NonNullable<NonNullable<BattleState['ruinsContext']>['pendingChoice']>['attackContinuation']>): BattleState {
  if (!continuation.targetIds.length) return battle;
  const context = battle.ruinsContext!;
  const skill = ruinsMonster(context.definitionIds[continuation.actorId], context.ruleSetVersion).skills
    .find(item => item.number === continuation.skillNumber);
  if (!skill) throw new Error('Saved attack continuation Skill unavailable');
  return stageRuinsAttack(battle, continuation.actorId, skill, continuation.targetIds,
    continuation.parentEventId, continuation.attackRoll, continuation.selfEffectsApplied);
}

export function validateRuinsPendingAttack(battle: BattleState): void {
  const pending = battle.pendingMonsterAttack;
  if (!pending?.ruinsAttack) return;
  const context = battle.ruinsContext, source = pending.ruinsAttack;
  if (!context || pending.sourceAttack || pending.monsterUnitId !== battle.activeActorId
    || !context.events.some(entry => entry.eventId === source.parentEventId && entry.type === 'MONSTER_SKILL_SELECTED')
    || !context.events.some(entry => entry.type === 'MONSTER_ATTACK_ROLLED'
      && entry.parentEventId === source.parentEventId && entry.detail.roll === pending.attackRoll))
    throw new Error('Ordinary Ruins attack causal provenance invalid');
  const definition = ruinsMonster(context.definitionIds[pending.monsterUnitId], context.ruleSetVersion);
  const skill = definition.skills.find(candidate => candidate.number === source.skillNumber);
  if (!skill || skill.attack.kind !== 'ROLL' || pending.skillId !== source.skill.id
    || JSON.stringify(source.skill) !== JSON.stringify(printedSkillSnapshot(definition, skill))
    || pending.rootEventId !== `${source.parentEventId}:${pending.targetHeroUnitId}`
    || source.remainingTargetIds.some(id => !battle.heroes.some(hero => hero.id === id)))
    throw new Error('Ordinary Ruins attack differs from locked printed Skill');
  if (pending.stage === 'hero-hit-window') {
    const expected = resolveRuinsAttackValues(battle);
    if (pending.hit !== expected.hit || pending.crit !== expected.crit || pending.baseDamage !== expected.damage)
      throw new Error('Ordinary Ruins frozen attack result differs');
  }
}
