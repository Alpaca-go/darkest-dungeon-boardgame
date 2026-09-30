import type { BattleState, BattleUnit } from '../../types';
import type { PrintedCondition } from '../../types/ruins-executable';
import { applyBattleUnitDamage } from '../damage';
import { recordRuinsEvent, withRuinsRandom } from './printed-effect-runtime';
import { ruinsMonster } from './source-registry';

/** Rebuild the existing combat fields from independently timed printed tokens. */
export function synchronizeRuinsConditions(battle: BattleState, unit: BattleUnit): BattleUnit {
  const tokens = battle.ruinsContext!.conditionStacks[unit.id] ?? [];
  const total = (condition: PrintedCondition) => tokens.filter(token => token.condition === condition)
    .reduce((sum, token) => sum + token.amount, 0);
  const duration = (condition: PrintedCondition) => Math.max(0, ...tokens.filter(token => token.condition === condition).map(token => token.turns));
  const context = battle.ruinsContext!;
  context.guardStacks[unit.id] = duration('guard');
  context.riposteStacks[unit.id] = duration('riposte');
  return { ...unit, stunned: total('stun'), bleed: total('bleed'), blight: total('blight'), marked: total('mark') > 0,
    buffs: tokens.filter(token => token.condition === 'buff').map(token => ({ type: 'buff' as const, amount: token.amount, durationTurns: token.turns })),
    debuffs: tokens.filter(token => token.condition === 'debuff').map(token => ({ type: 'debuff' as const, amount: token.amount, durationTurns: token.turns })),
    conditionDurations: { ...unit.conditionDurations, stun: duration('stun'), bleed: duration('bleed'), blight: duration('blight'), mark: duration('mark') } };
}

/** Called after periodic damage has consumed this turn's token potency. */
export function tickRuinsConditions(battle: BattleState, unitId: string): BattleState {
  const context = battle.ruinsContext;
  if (!context?.conditionStacks[unitId]) return battle;
  context.conditionStacks[unitId] = context.conditionStacks[unitId]
    .map(token => ({ ...token, turns: token.turns - 1 })).filter(token => token.turns > 0);
  recordRuinsEvent(context, 'PRINTED_CONDITIONS_TICKED', unitId, [unitId], null, {});
  return { ...battle,
    heroes: battle.heroes.map(unit => unit.id === unitId ? synchronizeRuinsConditions(battle, unit) : unit),
    monsters: battle.monsters.map(unit => unit.id === unitId ? synchronizeRuinsConditions(battle, unit) : unit) };
}

/** Riposte sees incoming enemy damage before printed Protection halves it (Core Rules p21). */
export function applyRuinsEnemyDamage(battle: BattleState, actorId: string, targetId: string, amount: number) {
  const context = battle.ruinsContext!;
  const units = [...battle.heroes, ...battle.monsters];
  const actor = units.find(unit => unit.id === actorId)!, target = units.find(unit => unit.id === targetId)!;
  if (!actor || !target || actor.side === target.side) throw new Error('Enemy damage actor/target invalid');
  let next = battle;
  if (amount > 0 && context.riposteStacks[targetId] > 0 && actor.isAlive) {
    const rawReflected = Math.ceil(amount / 2);
    const actorProtected = actor.side === 'monster'
      && ruinsMonster(context.definitionIds[actorId], context.ruleSetVersion).printedProtection;
    const reflected = actorProtected ? Math.ceil(rawReflected / 2) : rawReflected;
    const reflectedOutcome = withRuinsRandom(next, () => applyBattleUnitDamage(actor, reflected));
    next = { ...next, heroes: next.heroes.map(unit => unit.id === actorId ? reflectedOutcome.unit : unit),
      monsters: next.monsters.map(unit => unit.id === actorId ? reflectedOutcome.unit : unit) };
    recordRuinsEvent(context, 'PRINTED_RIPOSTE_DAMAGE', targetId, [actorId], null,
      { amount: reflected, rawReflected, protection: actorProtected });
  }
  const protection = target.side === 'monster'
    && ruinsMonster(context.definitionIds[targetId], context.ruleSetVersion).printedProtection;
  const appliedDamage = protection ? Math.ceil(amount / 2) : amount;
  const outcome = withRuinsRandom(next, () => applyBattleUnitDamage(target, appliedDamage));
  next = { ...next, heroes: next.heroes.map(unit => unit.id === targetId ? outcome.unit : unit),
    monsters: next.monsters.map(unit => unit.id === targetId ? outcome.unit : unit) };
  recordRuinsEvent(context, 'PRINTED_ENEMY_DAMAGE', actorId, [targetId], null, { amount, appliedDamage, protection });
  return { battle: next, outcome, appliedDamage };
}
