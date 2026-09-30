import type { BattleState, CampaignState } from '../../types';
import type { PrintedEffect, RuinsRoomRule } from '../../types/ruins-executable';
import { ruinsRoom, ruinsTile } from './source-registry';
import { continueRuinsSkillAfterForcedMove, ruinsAreaDistance } from './monster-runtime';
import { applyRuinsPrintedEffects, recordRuinsEvent, withRuinsRandom } from './printed-effect-runtime';
import { applyBattleUnitDamage } from '../damage';
import { getQuirkById } from '../../data/quirks';
import { drawSourceBoundTrinketCard } from '../trinkets/source-deck';
import { nowIso } from '../random';
import { RUINS_V6 } from '../../types/ruins-executable';
import { drawSourceCompleteTrinket } from '../trinkets/draw-trinket';
import { acquireTrinket } from '../trinkets/acquire-trinket';
import { runtimeContentContext } from '../../data/content-selector';
import { canMoveRuinsUnit, moveRuinsUnit, pauseRuinsLargeDisplacement } from './movement-runtime';

export function isRuinsHealingProhibited(battle: BattleState, targetId: string): boolean {
  const context = battle.ruinsContext;
  if (!context) return false;
  const target = [...battle.heroes, ...battle.monsters].find(unit => unit.id === targetId);
  return !!target && ruinsRoom(context.roomNumber).rules.some(rule => rule.trigger === 'PASSIVE'
    && (rule.side === 'all' || rule.side === target.side)
    && rule.areas.includes(context.placements[targetId])
    && rule.effects.some(effect => effect.type === 'healingProhibited'));
}

function inRuleArea(battle: BattleState, rule: RuinsRoomRule, unitId: string): boolean {
  const unit = [...battle.heroes, ...battle.monsters].find(candidate => candidate.id === unitId && candidate.isAlive);
  return !!unit && (rule.side === 'all' || rule.side === unit.side)
    && (rule.areas.length === 0 || rule.areas.includes(battle.ruinsContext!.placements[unitId]));
}

type MonsterContinuation = { skillNumber: number; targetIds: string[]; parentEventId: string };
export function ruinsRoomMovementCandidates(battle: BattleState, unitId: string, targetId = unitId): string[] {
  const context = battle.ruinsContext!;
  const effect = ruinsRoom(context.roomNumber).rules.filter(rule => rule.trigger === 'LAST_MONSTER_MOVE')
    .flatMap(rule => rule.effects).find(item => item.type === 'moveTowards');
  if (!effect || effect.type !== 'moveTowards') throw new Error('Room movement rule unbound');
  const actor = battle.monsters.find(unit => unit.id === unitId && unit.isAlive);
  if (!actor) throw new Error('Room forced movement Monster missing');
  const tile = ruinsTile(context.tileId), from = context.placements[unitId];
  const before = ruinsAreaDistance(tile, from, effect.areaId);
  const legal = tile.areas.filter(area => ruinsAreaDistance(tile, from, area.id) <= actor.speed
    && ruinsAreaDistance(tile, area.id, effect.areaId) < before
    && canMoveRuinsUnit(battle, unitId, targetId, area.id)).map(area => area.id);
  const closest = Math.min(...legal.map(id => ruinsAreaDistance(tile, id, effect.areaId)));
  return legal.filter(id => ruinsAreaDistance(tile, id, effect.areaId) === closest).sort();
}
function runRoomRule(battle: BattleState, rule: RuinsRoomRule, unitId: string, key: string,
  continuation?: MonsterContinuation): BattleState {
  const next = structuredClone(battle);
  const context = next.ruinsContext!;
  const parentEventId = recordRuinsEvent(context, 'ROOM_RULE', unitId, [unitId], null,
    { ruleId: rule.id, trigger: rule.trigger, key });
  let current = next;
  for (const effect of rule.effects) {
    if (effect.type === 'healingProhibited' || effect.type === 'immunity') continue;
    if (effect.type === 'damage') {
      const unit = [...current.heroes, ...current.monsters].find(candidate => candidate.id === unitId)!;
      const damaged = withRuinsRandom(current, () => applyBattleUnitDamage(unit, effect.amount)).unit;
      current = { ...current, heroes: current.heroes.map(candidate => candidate.id === unitId ? damaged : candidate),
        monsters: current.monsters.map(candidate => candidate.id === unitId ? damaged : candidate) };
      recordRuinsEvent(current.ruinsContext!, 'ROOM_DAMAGE', unitId, [unitId], parentEventId, { amount: effect.amount });
      continue;
    }
    if (effect.type === 'drawTrinket') throw new Error('Room Trinket draw requires campaign interaction command');
    if (effect.type === 'moveTowards') {
      const candidates = ruinsRoomMovementCandidates(current, unitId, continuation?.targetIds[0] ?? unitId);
      if (candidates.length > 1) {
        const choiceId = recordRuinsEvent(context, 'ROOM_MOVEMENT_CHOICE', unitId, [unitId], continuation?.parentEventId ?? parentEventId, { candidateIds: candidates });
        context.pendingChoice = { choiceId, kind: 'ROOM_MOVE', shuffleEffect: null, candidateIds: candidates,
          actorId: unitId, sourceActorId: unitId, relativeToId: continuation?.targetIds[0] ?? unitId,
          skillNumber: continuation?.skillNumber ?? null,
          targetIds: continuation?.targetIds ?? [unitId], remainingEffects: [],
          parentEventId: continuation?.parentEventId ?? parentEventId, ruleSetVersion: context.ruleSetVersion };
        return current;
      }
      if (candidates.length === 1) {
        current = moveRuinsUnit(current, unitId, continuation?.targetIds[0] ?? unitId, candidates[0]);
        if (current.largeMovementContract?.pendingChoice) return pauseRuinsLargeDisplacement(current, {
          choiceId: parentEventId, kind: 'ROOM_MOVE', shuffleEffect: null, candidateIds: candidates,
          actorId: unitId, sourceActorId: unitId, relativeToId: continuation?.targetIds[0] ?? unitId,
          skillNumber: continuation?.skillNumber ?? null, targetIds: continuation?.targetIds ?? [unitId],
          remainingEffects: [], parentEventId: continuation?.parentEventId ?? parentEventId,
          ruleSetVersion: context.ruleSetVersion }, candidates[0]);
        recordRuinsEvent(current.ruinsContext!, 'ROOM_MONSTER_MOVED', unitId, [unitId], parentEventId, { areaId: candidates[0] });
      }
      continue;
    }
    if (effect.type === 'quirkStressAndHealing') {
      const unit = current.heroes.find(hero => hero.id === unitId)!;
      const quirks = (unit.quirkIds ?? []).map(id => getQuirkById(id)).filter(q => !!q);
      const negative = quirks.filter(q => q.polarity === 'negative').length;
      const positive = quirks.filter(q => q.polarity === 'positive').length;
      if (negative) current = applyRuinsPrintedEffects(current, unitId, unitId,
        [{ type: 'stress', target: 'target', amount: negative * effect.stressPerNegative }], parentEventId);
      if (positive) current = applyRuinsPrintedEffects(current, unitId, unitId,
        [{ type: 'heal', target: 'target', amount: positive * effect.healPerPositivePerLevel * (unit.heroLevel ?? 1) }], parentEventId);
      continue;
    }
    if (!([...current.heroes, ...current.monsters].find(unit => unit.id === unitId)?.isAlive)) break;
    current = applyRuinsPrintedEffects(current, unitId, unitId, [effect as PrintedEffect], parentEventId);
    if (current.ruinsContext?.pendingChoice) break;
  }
  return current;
}

/** Called by Battle lifecycle; repeated calls for the same turn/round are idempotent. */
export function runRuinsRoomTrigger(battle: BattleState, trigger: RuinsRoomRule['trigger'], unitId?: string,
  continuation?: MonsterContinuation): BattleState {
  const context = battle.ruinsContext;
  if (!context || context.pendingChoice) return battle;
  if (trigger === 'LAST_MONSTER_MOVE') {
    const lastMonsterId = [...battle.initiativeOrder].reverse().find(id => battle.monsters.some(unit => unit.id === id && unit.isAlive));
    if (!unitId || unitId !== lastMonsterId) return battle;
  }
  let next = battle;
  for (const rule of ruinsRoom(context.roomNumber).rules.filter(candidate => candidate.trigger === trigger)) {
    const eligible = unitId ? [unitId] : [...next.heroes, ...next.monsters].map(unit => unit.id);
    const candidates = eligible.filter(id => inRuleArea(next, rule, id));
    if (!candidates.length) continue;
    const selected = trigger === 'ROUND_END' ? candidates.slice(0, 1) : candidates;
    for (const id of selected) {
      const key = ['SHUFFLED_INTO', 'LAST_MONSTER_MOVE'].includes(trigger)
        ? `${trigger}:${next.round}:${next.initiativeIndex}:${rule.id}:${id}:${next.ruinsContext!.events.length}`
        : `${trigger}:${next.round}:${next.initiativeIndex}:${rule.id}:${id}`;
      if (!['SHUFFLED_INTO', 'LAST_MONSTER_MOVE'].includes(trigger)
        && next.ruinsContext!.events.some(entry => entry.type === 'ROOM_RULE' && entry.detail.key === key)) continue;
      next = runRoomRule(next, rule, id, key, continuation);
      if (next.ruinsContext?.pendingChoice) return next;
    }
  }
  return next;
}

export function resolveRuinsRoomMovementChoice(battle: BattleState, choiceId: string, areaId: string): BattleState {
  const choice = battle.ruinsContext?.pendingChoice;
  if (!choice || choice.kind !== 'ROOM_MOVE' || choice.choiceId !== choiceId || !choice.candidateIds.includes(areaId))
    throw new Error('Room movement choice unavailable');
  let next = structuredClone(battle);
  next.ruinsContext!.pendingChoice = null;
  next = moveRuinsUnit(next, choice.actorId, choice.relativeToId, areaId);
  if (next.largeMovementContract?.pendingChoice) return pauseRuinsLargeDisplacement(next, choice, areaId);
  recordRuinsEvent(next.ruinsContext!, 'ROOM_MOVEMENT_CHOSEN', choice.actorId, [choice.actorId], choice.parentEventId, { areaId });
  return choice.skillNumber === null ? next
    : continueRuinsSkillAfterForcedMove(next, choice.actorId, choice.skillNumber,
      choice.targetIds, choice.parentEventId);
}

/** Room interaction uses the campaign Trinket acquisition pipeline and commits use only after success. */
export function interactOrdinaryRuinsRoom(campaign: CampaignState, unitId: string, ruleId: string): CampaignState {
  const battle = campaign.battle, context = battle?.ruinsContext;
  if (!battle || !context || battle.status !== 'active' || context.pendingChoice || battle.pendingMonsterAttack)
    throw new Error('Ordinary Ruins Room interaction unavailable');
  const rule = ruinsRoom(context.roomNumber).rules.find(candidate => candidate.id === ruleId && candidate.trigger === 'INTERACT');
  const hero = battle.heroes.find(unit => unit.id === unitId && unit.isAlive);
  if (!rule || !hero || battle.activeActorId !== unitId || !inRuleArea(battle, rule, unitId)
    || battle.currentActionPoints < rule.actionCost
    || rule.oncePerBattle && context.roomUses.includes(ruleId)
    || rule.requiresNoMonsters && battle.monsters.some(unit => unit.isAlive))
    throw new Error('Ordinary Ruins Room interaction requirements unmet');
  let nextBattle = structuredClone(battle);
  let nextCampaign: CampaignState = { ...campaign, battle: nextBattle };
  const interactionId = recordRuinsEvent(nextBattle.ruinsContext!, 'ROOM_INTERACT', unitId, [unitId], null, { ruleId });
  for (const effect of rule.effects) {
    if (effect.type === 'drawTrinket') {
      const level = campaign.campaignProgress.campaignLevel;
      if (![1, 2, 3].includes(level)) throw new Error('Room Trinket draw level unavailable');
      if (context.ruleSetVersion === RUINS_V6) {
        const card = drawSourceBoundTrinketCard(level as 1 | 2 | 3,
          () => withRuinsRandom(nextBattle, random => random()));
        // The causal draw receipt precedes allocation and shares its atomic campaign commit.
        recordRuinsEvent(nextBattle.ruinsContext!, 'SOURCE_TRINKET_DRAW', unitId, [unitId], interactionId,
          { sourceTrinketId: card.id, level: card.level, runtimeEffectReady: card.runtimeEffectReady,
            rngCursor: nextBattle.ruinsContext!.rngCursor, rngCalls: nextBattle.ruinsContext!.rngCalls,
            rewardOwner: campaign.id });
        if (card.runtimeEffectReady) {
          nextCampaign = acquireTrinket(nextCampaign, { trinketId: card.id, source: 'loot',
            sourceEventId: interactionId, questId: campaign.currentQuestId, heroId: hero.sourceId }).campaign;
        } else {
          nextCampaign = { ...nextCampaign, pendingSourceTrinketRewards: [...(nextCampaign.pendingSourceTrinketRewards ?? []), {
            sourceTrinketId: card.id, printedName: card.name, level: card.level, sourceEventId: interactionId,
            questId: campaign.currentQuestId ?? null, acquiredAt: nowIso(), runtimeEffectReady: false,
            status: 'SOURCE_BOUND_EFFECT_RUNTIME_PENDING',
          }] };
        }
        nextBattle = nextCampaign.battle!;
      } else {
      const result = drawSourceCompleteTrinket({ level: level as 1 | 2 | 3,
        runtimeContext: runtimeContentContext(campaign),
        rng: () => withRuinsRandom(nextBattle, random => random()) });
      if (result.error || !result.definition) throw new Error(`Room Trinket runtime unavailable: ${result.error ?? 'EMPTY_DECK'}`);
      nextCampaign = acquireTrinket(nextCampaign, { trinketId: result.definition.id,
        source: 'loot', sourceEventId: interactionId, questId: campaign.currentQuestId,
        heroId: hero.sourceId }).campaign;
      nextBattle = nextCampaign.battle!;
      }
    } else {
      nextBattle = applyRuinsPrintedEffects(nextBattle, unitId, unitId, [effect as PrintedEffect], interactionId);
      nextCampaign = { ...nextCampaign, battle: nextBattle };
    }
  }
  nextBattle = { ...nextBattle, currentActionPoints: nextBattle.currentActionPoints - rule.actionCost,
    ruinsContext: { ...nextBattle.ruinsContext!, roomUses: [...nextBattle.ruinsContext!.roomUses, ruleId] } };
  return { ...nextCampaign, battle: nextBattle };
}
