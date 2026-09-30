import type { BattleState, BattleUnit, CampaignState } from '../../types';
import { RUINS_STANCES, RUINS_V5, RUINS_V6, type RuinsBattleContext } from '../../types/ruins-executable';
import type { OrdinaryRuinsEncounter, RuinsDrawState } from './encounter-draw';
import { validateRuinsDrawState, returnOrdinaryRuinsEncounter } from './encounter-draw';
import { ruinsMonster, ruinsRoom, ruinsTile } from './source-registry';
import { makeHeroUnit, MAX_ROUNDS } from '../battle';
import { validateRuinsV6Selection } from '../rules/ruins-v6';
import { resolveHeroDodge, HERO_DODGE_V2 } from '../rules/hero-dodge';
import { runRuinsRoomTrigger, ruinsRoomMovementCandidates } from './room-runtime';
import { ruinsMonsterTurnMovementCandidates } from './monster-runtime';
import { ruinsDisplacementCandidates } from './printed-effect-runtime';
import { assignOrdinaryBoneFigures, createBoneFigureSupply, validateBoneFigureSupply } from './physical-supply';
import { bindLargeMovementContract, validateLargeMovementContract } from '../rules/large-movement-contract';
import { THREAT_DEPENDENCY_V3 } from '../../types/necromancer-dependencies';

/** Production entry remains closed until the listed executable contracts are tested end to end. */
export const RUINS_V5_EXECUTOR_BLOCKERS = [
  'INITIAL_DRAW_MIXED_TWO_LARGE_LAYOUT_POLICY_ABSENT',
  'LARGE_STANCE_SHUFFLE_SLOT_COLLISION_CONTRACT_ABSENT',
  'ROOM_TRINKET_SOURCE_COMPLETE_DRAW_UNAVAILABLE',
] as const;
export const RUINS_PRODUCTION_EXECUTOR_BLOCKERS: readonly string[] = [];

function makeRuinsMonsterUnit(encounter: OrdinaryRuinsEncounter, placement: OrdinaryRuinsEncounter['monsters'][number]): BattleUnit {
  const definition = ruinsMonster(placement.definitionId, encounter.ruleSetVersion);
  return {
    id: `ruins:${encounter.encounterId}:${placement.copyId}`, name: definition.printedName,
    side: 'monster', sourceId: definition.canonicalId, maxHp: definition.life, hp: definition.life,
    stress: 0, position: RUINS_STANCES.indexOf(placement.stance) + 1, speed: definition.speed,
    stance: placement.stance, isAlive: true, stunned: 0, bleed: 0, blight: 0, marked: false,
    buffs: [], debuffs: [], actionPoints: 0, atDeathsDoor: false, deathblowRollCount: 0,
    resolveTestedThisQuest: false, resolveState: 'normal', virtueId: null, afflictionId: null,
    mentalEffectResolvedTurnId: null, immunities: [...definition.immunities],
    categoricalResistances: definition.resistances.filter(value => value !== 'guard' && value !== 'riposte' && value !== 'push-pull') as BattleUnit['categoricalResistances'],
    conditionDurations: {},
  };
}

/** Bind one already-drawn physical encounter. This command never draws another card. */
export function initializeOrdinaryRuinsBattle(campaign: CampaignState, draw: RuinsDrawState, encounterId: string): BattleState {
  validateRuinsDrawState(draw);
  if (draw.ruleSetVersion === RUINS_V6) validateRuinsV6Selection(campaign);
  if (draw.ruleSetVersion !== RUINS_V5 && draw.ruleSetVersion !== RUINS_V6) throw new Error('Production ordinary Ruins Battle requires pinned v5');
  const encounter = draw.encounters.find(candidate => candidate.encounterId === encounterId && !candidate.returned);
  if (!encounter) throw new Error('Active ordinary Ruins encounter unavailable');
  const liveHeroes = campaign.heroes.filter(hero => !hero.dead);
  if (liveHeroes.length !== 4 || encounter.heroes.some(entry => !liveHeroes.some(hero => hero.instanceId === entry.heroId)))
    throw new Error('Drawn Hero roster differs from campaign');
  const heroes = encounter.heroes.map((entry, index) => {
    const hero = liveHeroes.find(candidate => candidate.instanceId === entry.heroId)!;
    if (hero.stance !== entry.stance) throw new Error('Drawn Hero Stance differs from campaign');
    const binding = resolveHeroDodge({ heroId: hero.heroId, level: hero.level, ruleSetVersion: HERO_DODGE_V2 });
    return { ...makeHeroUnit(hero, index, campaign), bossCombatDodge: binding.value, heroDodgeBinding: binding };
  });
  const monsters = encounter.monsters.map(entry => makeRuinsMonsterUnit(encounter, entry));
  const placements: Record<string, string> = {};
  const definitionIds: Record<string, string> = {};
  const occupiedSpaces: Record<string, number> = {};
  for (const [index, entry] of encounter.heroes.entries()) {
    placements[heroes[index].id] = entry.areaId;
    occupiedSpaces[heroes[index].id] = 1;
  }
  for (const [index, entry] of encounter.monsters.entries()) {
    placements[monsters[index].id] = entry.areaId;
    definitionIds[monsters[index].id] = entry.definitionId;
    occupiedSpaces[monsters[index].id] = ruinsMonster(entry.definitionId, encounter.ruleSetVersion).occupiedSpaces;
  }
  const context: RuinsBattleContext = {
    encounterId, roomNumber: encounter.roomNumber, tileId: encounter.tileId,
    ruleSetVersion: encounter.ruleSetVersion, placements, definitionIds,
    physicalCopyIds: encounter.monsters.map(entry => entry.copyId), occupiedSpaces,
    rngCursor: draw.rngCursor, rngCalls: draw.rngCalls,
    conditionStacks: {}, events: [], roomUses: [], guardStacks: {}, riposteStacks: {}, pendingChoice: null,
  };
  const initiativeOrder = encounter.initiativeCards.map(card => {
    const match = /:(hero|monster):(\d+)$/.exec(card.cardId);
    if (!match || match[1] !== card.side) throw new Error('Drawn initiative card malformed');
    const unit = (card.side === 'hero' ? heroes : monsters)[Number(match[2]) - 1];
    if (!unit) throw new Error('Drawn initiative card unbound');
    return unit.id;
  });
  const battle: BattleState = {
    battleId: `ruins:${encounterId}`, status: 'active', round: 1, maxRounds: MAX_ROUNDS,
    heroes, monsters, initiativeOrder, initiativeIndex: -1, activeActorId: null,
    currentActionPoints: 0, selectedSkillId: null, selectedTargetId: null,
    battleLog: [], sourceRoomId: campaign.dungeon?.currentRoomId ?? encounter.tileId, rewards: { gold: 0 },
    light: campaign.light, stagedIncomingAttacks: true, pendingMonsterAttack: null,
    ruinsContext: context,
  };
  const tile = ruinsTile(context.tileId);
  const bound = bindLargeMovementContract(battle, THREAT_DEPENDENCY_V3, {
    areas: tile.areas.map(area => ({ id: area.id, capacity: area.capacity, adjacent: area.adjacent })),
    placements, occupiedSpaces,
  });
  validateOrdinaryRuinsBattle(bound, draw);
  return [...heroes, ...monsters].reduce((current, unit) =>
    runRuinsRoomTrigger(current, 'PASSIVE', unit.id), bound);
}

/** Detect forged placements, source bindings and copy ownership at save import. */
export function validateOrdinaryRuinsBattle(battle: BattleState, draw?: RuinsDrawState): void {
  const context = battle.ruinsContext;
  if (!context) return;
  if ((context.ruleSetVersion !== RUINS_V5 && context.ruleSetVersion !== RUINS_V6) || battle.battleId !== `ruins:${context.encounterId}`
    || !battle.sourceRoomId || context.tileId !== `ruins-tile-${context.roomNumber}`)
    throw new Error('Ordinary Ruins Battle identity/version mismatch');
  const tile = ruinsTile(context.tileId);
  ruinsRoom(context.roomNumber);
  if (context.ruleSetVersion === RUINS_V6) {
    const slots = new Set<number>();
    for (const monster of battle.monsters.filter(m => m.isAlive)) {
      const width = ruinsMonster(context.definitionIds[monster.id], context.ruleSetVersion).stanceSlots;
      if (monster.position !== RUINS_STANCES.indexOf(monster.stance) + 1) throw new Error('Stance anchor mismatch');
      for (let offset = 0; offset < width; offset++) {
        const slot = monster.position + offset;
        if (slot < 1 || slot > 4 || slots.has(slot)) throw new Error('Invalid v6 atomic Stance layout');
        slots.add(slot);
      }
    }
  }
  const units = [...battle.heroes, ...battle.monsters];
  validateLargeMovementContract(battle);
  if (!battle.largeMovementContract || JSON.stringify(context.placements) !== JSON.stringify(battle.largeMovementContract.placements))
    throw new Error('Ordinary Ruins spatial ledgers differ');
  if (new Set(units.map(unit => unit.id)).size !== units.length
    || Object.keys(context.placements).length !== units.length
    || Object.keys(context.occupiedSpaces).length !== units.length
    || Object.keys(context.definitionIds).length !== battle.monsters.length
    || context.physicalCopyIds.length !== battle.monsters.length
    || new Set(context.physicalCopyIds).size !== context.physicalCopyIds.length)
    throw new Error('Ordinary Ruins Battle unit binding mismatch');
  for (const unit of units) {
    if (!tile.areas.some(area => area.id === context.placements[unit.id])) throw new Error('Ordinary Ruins placement outside Tile');
    const spaces = unit.side === 'hero' ? 1 : ruinsMonster(context.definitionIds[unit.id], context.ruleSetVersion).occupiedSpaces;
    if (context.occupiedSpaces[unit.id] !== spaces) throw new Error('Ordinary Ruins occupied spaces mismatch');
    if (unit.side === 'monster' && unit.sourceId !== context.definitionIds[unit.id])
      throw new Error('Ordinary Ruins Monster source identity mismatch');
    if (unit.side === 'hero') {
      const binding = unit.heroDodgeBinding;
      if (!binding || JSON.stringify(binding) !== JSON.stringify(resolveHeroDodge({
        heroId: binding.heroId, level: binding.level, ruleSetVersion: HERO_DODGE_V2,
      })) || unit.bossCombatDodge !== binding.value) throw new Error('Ordinary Ruins Hero Dodge binding mismatch');
    }
  }
  for (const area of tile.areas) {
    const used = units.filter(unit => unit.isAlive && context.placements[unit.id] === area.id)
      .reduce((sum, unit) => sum + context.occupiedSpaces[unit.id], 0);
    const licensed = battle.largeMovementContract.overflow.find(grant => grant.areaId === area.id)?.extraSpaces ?? 0;
    if (used > area.capacity + licensed) throw new Error('Ordinary Ruins Area capacity exceeded');
  }
  if (!Number.isInteger(context.rngCursor) || context.rngCursor < 0 || context.rngCursor > 0xffffffff
    || !Number.isInteger(context.rngCalls) || context.rngCalls < 0
    || new Set(battle.initiativeOrder).size !== battle.initiativeOrder.length
    || battle.initiativeOrder.some(id => !units.some(unit => unit.id === id))) throw new Error('Ordinary Ruins replay state invalid');
  for (const [index, entry] of context.events.entries()) {
    if (entry.eventId !== `${context.encounterId}:event:${index + 1}` || entry.ruleSetVersion !== context.ruleSetVersion
      || !units.some(unit => unit.id === entry.actorId)
      || entry.targetIds.some(id => !units.some(unit => unit.id === id))
      || entry.parentEventId && !context.events.slice(0, index).some(prior => prior.eventId === entry.parentEventId))
      throw new Error('Ordinary Ruins event sequence/causality invalid');
  }
  if (context.pendingChoice) {
    const choice = context.pendingChoice;
    if (choice.ruleSetVersion !== context.ruleSetVersion
      || !units.some(unit => unit.id === choice.actorId)
      || !units.some(unit => unit.id === choice.sourceActorId)
      || !units.some(unit => unit.id === choice.relativeToId)
      || !choice.candidateIds.length || new Set(choice.candidateIds).size !== choice.candidateIds.length
      || choice.kind !== 'LARGE_DISPLACEMENT' && choice.candidateIds.some(id => !tile.areas.some(area => area.id === id))
      || !context.events.some(entry => entry.eventId === choice.choiceId && entry.parentEventId === choice.parentEventId))
      throw new Error('Ordinary Ruins pending choice invalid');
    if (choice.kind === 'LARGE_DISPLACEMENT' && (!battle.largeMovementContract.pendingChoice
      || choice.movementContinuation?.destinationId !== battle.largeMovementContract.pendingChoice.to
      || choice.actorId !== battle.largeMovementContract.pendingChoice.actorId
      || JSON.stringify(choice.candidateIds) !== JSON.stringify(battle.largeMovementContract.pendingChoice.candidateIds)))
      throw new Error('Ordinary Ruins Large candidates differ');
    if (choice.kind === 'ROOM_MOVE' && JSON.stringify(choice.candidateIds)
      !== JSON.stringify(ruinsRoomMovementCandidates(battle, choice.actorId, choice.relativeToId)))
      throw new Error('Ordinary Room movement candidates differ');
    if (choice.kind === 'MONSTER_MOVE') {
      const definition = ruinsMonster(context.definitionIds[choice.actorId], context.ruleSetVersion);
      const skill = definition.skills.find(candidate => candidate.number === choice.skillNumber);
      const actor = battle.monsters.find(unit => unit.id === choice.actorId);
      if (!skill || !actor || choice.shuffleEffect
        || JSON.stringify(choice.candidateIds) !== JSON.stringify(ruinsMonsterTurnMovementCandidates({ battle, tile,
          placements: context.placements, guardStacks: context.guardStacks }, choice.actorId, choice.relativeToId,
          skill, context.occupiedSpaces, actor.speed))) throw new Error('Ordinary Monster movement candidates differ');
    }
    if (choice.kind === 'PRINTED_SHUFFLE' && (!choice.shuffleEffect
      || JSON.stringify(choice.candidateIds) !== JSON.stringify(ruinsDisplacementCandidates(battle, choice.actorId,
        choice.relativeToId, choice.shuffleEffect.direction, choice.shuffleEffect.distance))))
      throw new Error('Printed shuffle candidates differ');
  }
  if (draw) {
    validateRuinsDrawState(draw);
    const encounter = draw.encounters.find(entry => entry.encounterId === context.encounterId && !entry.returned);
    if (!encounter || encounter.tileId !== context.tileId || encounter.ruleSetVersion !== context.ruleSetVersion
      || JSON.stringify(context.physicalCopyIds) !== JSON.stringify(encounter.monsters.map(entry => entry.copyId))
      || encounter.monsters.some((entry, index) => context.definitionIds[battle.monsters[index]?.id] !== entry.definitionId))
      throw new Error('Ordinary Ruins Battle differs from physical draw');
  }
}

export function settleOrdinaryRuinsBattle(draw: RuinsDrawState, battle: BattleState): RuinsDrawState {
  validateOrdinaryRuinsBattle(battle, draw);
  if (battle.status === 'active' || battle.pendingMonsterAttack || battle.ruinsContext?.pendingChoice)
    throw new Error('Ordinary Ruins Battle is unsettled');
  return returnOrdinaryRuinsEncounter({ ...draw, rngCursor: battle.ruinsContext!.rngCursor,
    rngCalls: battle.ruinsContext!.rngCalls }, battle.ruinsContext!.encounterId);
}

/** Campaign command: reserve figures and bind the drawn encounter in one saveable state. */
export function beginOrdinaryRuinsBattle(campaign: CampaignState, encounterId: string): CampaignState {
  if (campaign.ruinsDrawState?.ruleSetVersion !== RUINS_V6) throw new Error(
    `ORDINARY_RUINS_EXECUTABLE_DEPENDENCIES_NOT_CLOSED: ${RUINS_V5_EXECUTOR_BLOCKERS.join(', ')}`);
  const draw = campaign.ruinsDrawState;
  if (!draw || campaign.battle || campaign.gamePhase !== 'dungeon-explore' || !campaign.dungeon)
    throw new Error('Ordinary Ruins Battle campaign entry unavailable');
  const encounter = draw.encounters.find(entry => entry.encounterId === encounterId && !entry.returned);
  if (!encounter) throw new Error('Drawn ordinary Ruins encounter unavailable');
  const supply = assignOrdinaryBoneFigures(campaign.ruinsBoneFigureSupply ?? createBoneFigureSupply(), draw, encounter);
  const battle = initializeOrdinaryRuinsBattle(campaign, draw, encounterId);
  validateBoneFigureSupply(supply, draw);
  return { ...campaign, battle, ruinsBoneFigureSupply: supply, gamePhase: 'battle' };
}
