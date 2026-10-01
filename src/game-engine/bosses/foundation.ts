import type { BattleState, BattleUnit, Stance } from '../../types';
import type { BossContinuation, BossDefinitionContract, BossEncounterState, BossRuntimeInput, ChoiceType, DeathSnapshot, SpawnDefinition, SummonSupplyEntry } from '../../types/boss-runtime';
import { SeededRandom, DeterministicClock, DeterministicCounterIdSource, withRuntimeSources, getRuntimeSources } from '../runtime-sources';
import { shuffleWithRng, rollD10 } from '../campaign/act-four/rng';
import { validateSourceMonsterAttack, startSourceMonsterAttack, continuePrintedMonsterTurn } from '../component-monster-runtime';
import { resolveProductionMonsterDefinition } from './component-adapters/bone-combat-adapter';
import { resolveHeroDodge } from '../rules/hero-dodge';
import {encounterRuleDependencies} from './definitions';
import type { ProductionMonsterDefinition } from '../../types/component-combat';
import { applyBattleUnitDamage } from '../damage';
import { isNonUnholy, isReanimationEligible } from './threat-semantics';
import { commitNecromancerFigure, defeatNecromancerFigure, hasNecromancerFigure,
  returnNecromancerFigures, validateNecromancerFigures } from '../ruins/physical-supply';

const stances: Stance[] = ['aggressive', 'defensive', 'ranged', 'support'];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const runtimeId = (name: string) => name.toLowerCase().replace(/ /g, '-');
let activeEncounterSources: { battleId: string; random: SeededRandom; clock: DeterministicClock; ids: DeterministicCounterIdSource } | null = null;
function encounter(battle: BattleState): BossEncounterState {
  if (!battle.bossEncounter) throw new Error('No Boss encounter');
  return battle.bossEncounter;
}
export function recordBossRuntimeEvent(b: BattleState, eventType: string, result: unknown, targets: string[] = [], rulingId?: string, parentEventId: string | null = null): string {
  const e = encounter(b);
  const eventId = `${b.battleId}:event:${++e.eventSequence}`;
  e.events.push({ eventId, eventType, sourceCardId: e.side === 'THREAT' ? e.threatAbilityCardId : e.battleCardId,
    authority: rulingId ? 'PROJECT_RULING' : 'OFFICIAL_SOURCE', ...(rulingId ? { rulingId } : {}), actor: e.bossState.actorId,
    targets: targets.slice(), result: clone(result), parentEventId, ruleSetVersion: e.ruleSetVersion });
  return eventId;
}
/** Shared seeded source, restored from persisted state. The existing damage pipeline uses it too. */
export function withBossEncounterSources(b: BattleState, action: (battle: BattleState, rng: () => number) => BattleState): BattleState {
  if (!b.bossEncounter) return action(b, () => getRuntimeSources().random.next());
  const prior = activeEncounterSources;
  const sources = prior?.battleId === b.battleId ? prior : { battleId: b.battleId, random: new SeededRandom(b.bossEncounter.idSeed), clock: new DeterministicClock(), ids: new DeterministicCounterIdSource(b.bossEncounter.idSeed) };
  if (sources !== prior) {
    sources.random.restore(b.bossEncounter.rngState); sources.clock.restore(b.bossEncounter.clockCursor); sources.ids.restore(b.bossEncounter.idCursor);
  }
  activeEncounterSources = sources;
  try {
    const next = withRuntimeSources(sources, () => action(b, () => sources.random.next()));
    if (next.bossEncounter) next.bossEncounter = { ...next.bossEncounter, rngState: sources.random.snapshot(), clockCursor: sources.clock.snapshot(), idCursor: sources.ids.snapshot() };
    return next;
  } finally { activeEncounterSources = prior; }
}
function freshUnit(def: SpawnDefinition, id: string, position: number): BattleUnit {
  const production = def as Partial<ProductionMonsterDefinition>;
  return { ...(production.skills ? {immunities: production.immunities!.slice(), categoricalResistances: production.resistances!.slice() as BattleUnit['categoricalResistances'], bossCombatDodge: production.dodge} : {}), id, name: production.displayName ?? def.definitionId, sourceId: def.definitionId, side: 'monster', maxHp: def.life, hp: def.life,
    speed: def.speed, position, stance: stances[position - 1], stress: 0, isAlive: true,
    stunned: 0, bleed: 0, blight: 0, marked: false, buffs: [], debuffs: [], actionPoints: 0,
    atDeathsDoor: false, deathblowRollCount: 0, resolveTestedThisQuest: false, resolveState: 'normal',
    virtueId: null, afflictionId: null, mentalEffectResolvedTurnId: null, monsterSkillIds: def.skillIds.slice() };
}
function syncLedger(entry: SummonSupplyEntry): void {
  for (const state of ['available', 'active', 'spentThisBattle', 'permanentlyRemoved'] as const) entry[state] = entry.tokens.filter(t => t.state === state).length;
}
export function assertBossEncounter(b: BattleState): void {
  validateNecromancerFigures(b);
  const e = encounter(b);
  if (e.checkpointContext?.heroDodgeBindings) {
    for (const hero of b.heroes) {
      const binding=hero.heroDodgeBinding ?? e.checkpointContext.heroDodgeBindings[hero.id];
      if (!binding || JSON.stringify(binding)!==JSON.stringify(resolveHeroDodge({...binding,ruleSetVersion:encounterRuleDependencies(e).heroDodgeRuleSetVersion}))
        || hero.bossCombatDodge!==binding.value) throw new Error('Pinned Hero Dodge binding invalid');
    }
    for (const definition of Object.values(e.spawnDefinitions).filter(d=>d.definitionId!==e.bossFamily+'-level-'+e.bossLevel)) {
      if (JSON.stringify(definition)!==JSON.stringify(resolveProductionMonsterDefinition(definition.definitionId,e.ruleSetVersion))) throw new Error('Production summon definition differs from locked review');
    }
    validateSourceMonsterAttack(b);
  }
  if (e.ruleSetVersion !== e.definition.ruleSetVersion) throw new Error('Rule version mismatch');
  if (!['SETUP', 'THREAT_ACTIVE', 'BOSS_ROOM', 'BATTLE_ACTIVE', 'BATTLE_RESOLVING', 'VICTORY', 'CLEANUP', 'COMPLETE'].includes(e.phase)) throw new Error('Invalid encounter phase');
  if (!['THREAT', 'ABILITY'].includes(e.side)) throw new Error('Invalid physical side');
  if (![e.rngState, e.clockCursor, e.idCursor, e.eventSequence].every(n => Number.isInteger(n) && n >= 0)) throw new Error('Invalid saved runtime cursor');
  if (!Array.isArray(e.queuedDeathIds) || !Array.isArray(e.events) || e.events.length !== e.eventSequence) throw new Error('Invalid event sequence');
  for (const [index, event] of e.events.entries()) {
    if (event.eventId !== `${b.battleId}:event:${index + 1}` || event.ruleSetVersion !== e.ruleSetVersion) throw new Error('Invalid versioned event');
    if (event.parentEventId && !e.events.slice(0, index).some(parent => parent.eventId === event.parentEventId)) throw new Error('Invalid causal parent');
  }
  for (const [definitionId, supply] of Object.entries(e.summonSupply)) {
    if (supply.total !== supply.tokens.length || supply.total !== supply.available + supply.active + supply.spentThisBattle + supply.permanentlyRemoved) throw new Error('Invalid summon ledger');
    for (const state of ['available', 'active', 'spentThisBattle', 'permanentlyRemoved'] as const) {
      if (supply[state] !== supply.tokens.filter(t => t.state === state).length) throw new Error('Ledger token mismatch');
    }
    for (const token of supply.tokens.filter(t => t.state === 'active')) {
      const dying = e.queuedDeathIds.includes(token.instanceId ?? '') || e.pendingChoice?.continuation.kind === 'death-effects' && e.pendingChoice.continuation.deaths.some(d => d.instanceId === token.instanceId);
      if (!b.monsters.some(u => u.id === token.instanceId && u.sourceId === definitionId && (u.isAlive || dying))) throw new Error('Orphan active token');
    }
  }
  if (e.pendingChoice && (e.pendingChoice.ruleSetVersion !== e.ruleSetVersion || !e.pendingChoice.candidateIds.length)) throw new Error('Invalid choice');
  if (e.pendingChoice) {
    const p = e.pendingChoice;
    const created = e.events.find(event => event.eventId === p.createdAtEventId);
    if (p.status !== 'PENDING' || p.selectedId !== null || new Set(p.candidateIds).size !== p.candidateIds.length ||
      created?.eventType !== 'CHOICE_CREATED' || JSON.stringify((created.result as { candidateIds: string[] }).candidateIds) !== JSON.stringify(p.candidateIds)) throw new Error('Invalid saved choice snapshot');
  }
  if (new Set(b.monsters.map(u => u.id)).size !== b.monsters.length) throw new Error('Duplicate runtime instance');
}
/** Attach to existing BattleState, reserving already active matching physical units. */
export function bindBossEncounter(battle: BattleState, definition: BossDefinitionContract, seed: number,
  spawnDefinitions: SpawnDefinition[] = [], permanentlyRemovedTokenIds: string[] = []): BattleState {
  if (battle.bossEncounter) throw new Error('Encounter already reserved on this battle');
  const b = clone(battle);
  if (definition.family==='prophet' || definition.successorContract) throw new Error('Successor gameplay requires production foundation acceptance');
  const supply: BossEncounterState['summonSupply'] = {};
  for (const pool of definition.supply) {
    const id = runtimeId(pool.name);
    const tokens: SummonSupplyEntry['tokens'] = Array.from({ length: pool.digitalBattleSupplyLimit }, (_, i) => ({
      tokenId: `${id}:${i + 1}`, state: permanentlyRemovedTokenIds.includes(`${id}:${i + 1}`) ? 'permanentlyRemoved' : 'available', instanceId: null }));
    supply[id] = { total: tokens.length, available: 0, active: 0, spentThisBattle: 0, permanentlyRemoved: 0, tokens };
    for (const unit of b.monsters.filter(u => u.isAlive && u.sourceId === id)) {
      const token = tokens.find(t => t.state === 'available');
      if (!token) throw new Error('Active physical units exceed supply');
      token.state = 'active'; token.instanceId = unit.id;
    }
    syncLedger(supply[id]);
  }
  for (const d of spawnDefinitions) {
    if (d.ruleSetVersion !== definition.ruleSetVersion || !['OFFICIAL_SOURCE', 'PROJECT_RULING', 'TEST_FIXTURE'].includes(d.dataAuthority)) throw new Error('Unversioned spawn definition');
    if (!(d.life > 0) || !Number.isFinite(d.life) || !Number.isFinite(d.speed) || d.occupiedSlots !== (d.large ? 2 : 1)) throw new Error('Invalid resolved spawn definition');
    if (d.onDeathEffects?.some(effect => !effect.effectId || !Number.isFinite(effect.damage) || effect.damage < 0) || new Set(d.onDeathEffects?.map(effect => effect.effectId)).size !== (d.onDeathEffects?.length ?? 0)) throw new Error('Invalid mandatory death definition');
    if (d.onDeathOrder && (new Set(d.onDeathOrder).size !== d.onDeathOrder.length || d.onDeathOrder.length !== (d.onDeathEffects?.length ?? 0) || d.onDeathOrder.some(id => !d.onDeathEffects?.some(effect => effect.effectId === id)))) throw new Error('Invalid explicit death order');
  }
  const rng = new SeededRandom(seed);
  b.bossEncounter = { bossFamily: definition.family, bossLevel: definition.level, ruleSetVersion: definition.ruleSetVersion,
    definition: clone(definition), roomId: b.sourceRoomId, battleCardId: definition.battleCardId, threatAbilityCardId: definition.threatAbilityCardId,
    bossIdentityCardId: definition.bossIdentityCardId, phase: 'SETUP', round: b.round, side: 'THREAT',
    bossState: { actorId: null, lastActionRound: 0, storage: 'IN_PLAY' }, summonSupply: supply,
    activeSummons: b.monsters.filter(u => supply[u.sourceId] && u.isAlive).map(u => u.id), queuedDeathIds: [],
    spawnDefinitions: Object.fromEntries(spawnDefinitions.map(d => [d.definitionId, clone(d)])),
    placements: Object.fromEntries([...b.heroes, ...b.monsters].map(u => [u.id, u.side === 'hero' ? definition.heroStartArea! : definition.bossStartArea])),
    correspondingAreas: Object.fromEntries(b.monsters.map(u => [u.id, definition.bossStartArea])),
    reanimationState: { firstDeathWindowConsumed: false, lockedEventId: null },
    threatState: { firstBattleConsumed: false, preparationDayConsumed: false, forcedHeroId: null, permanentlyRemovedDefinitionIds: [],
      appearedDefinitionIds: [...new Set(b.monsters.map(u => u.sourceId))], appearedTokenIds: Object.values(supply).flatMap(entry => entry.tokens.filter(t => t.state === 'active').map(t => t.tokenId)) },
    pendingChoice: null, eventSequence: 0, events: [], inputs: [], rngState: rng.snapshot(), clockCursor: 0, idCursor: 0, idSeed: seed,
    cleanupState: { completed: false, campaignTransactionId: null, roomCleaned: false } };
  recordBossRuntimeEvent(b, 'ENCOUNTER_SETUP', { roomNumber: definition.roomNumber, level: definition.level, cardIds: [definition.bossIdentityCardId, definition.threatAbilityCardId, definition.battleCardId] });
  encounter(b).phase = 'THREAT_ACTIVE';
  assertBossEncounter(b);
  return b;
}
export function areaDistance(definition: BossDefinitionContract, from: string, to: string): number {
  const queue: Array<[string, number]> = [[from, 0]];
  const visited = new Set<string>();
  while (queue.length) {
    const [id, distance] = queue.shift()!;
    if (id === to) return distance;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const edge of definition.adjacency) if (edge.includes(id)) for (const next of edge) if (next !== id) queue.push([next, distance + 1]);
  }
  return Infinity;
}
const alive = (b: BattleState) => [...b.heroes, ...b.monsters].filter(u => u.isAlive);
function slotsFor(e: BossEncounterState, unit: BattleUnit): number { return e.spawnDefinitions[unit.sourceId]?.occupiedSlots ?? 1; }
function freeSpace(b: BattleState, areaId: string): number {
  const e = encounter(b);
  const area = e.definition.areas.find(a => a.id === areaId);
  if (!area) throw new Error('Unknown Area');
  return area.capacity - alive(b).filter(u => e.placements[u.id] === areaId).reduce((sum, u) => sum + slotsFor(e, u), 0);
}
export function createBossRuntimeChoice(b: BattleState, type: ChoiceType, candidates: string[], continuation: BossContinuation, rulingId: string | undefined, parentEventId: string): void {
  const e = encounter(b);
  if (e.pendingChoice) throw new Error('Cannot overwrite pending choice');
  const candidateIds = [...new Set(candidates)].sort();
  if (candidateIds.length < 2) throw new Error('Choice requires a tie');
  const eventId = recordBossRuntimeEvent(b, 'CHOICE_CREATED', { type, candidateIds }, candidateIds, rulingId, parentEventId);
  e.pendingChoice = { choiceId: `${eventId}:choice`, choiceType: type, sourceEffectId: parentEventId, candidateIds,
    createdAtEventId: eventId, selectedId: null, status: 'PENDING', ruleSetVersion: e.ruleSetVersion, continuation: clone(continuation) };
}
function insertInitiative(b: BattleState, unitId: string, rng: () => number): void {
  const completed = b.initiativeOrder.slice(0, b.initiativeIndex + 1);
  const remaining = b.initiativeOrder.slice(b.initiativeIndex + 1);
  b.initiativeOrder = [...completed, ...shuffleWithRng(rng, [...remaining, unitId])];
}
function emptyStance(b: BattleState, slots = 1): number | null {
  const e = encounter(b);
  const occupied = new Set(b.monsters.filter(u => u.isAlive).flatMap(u => Array.from({ length: slotsFor(e, u) }, (_, i) => u.position + i)));
  for (let position = 1; position <= 5 - slots; position++) if (Array.from({ length: slots }, (_, i) => position + i).every(p => !occupied.has(p))) return position;
  return null;
}
function commitSpawn(b: BattleState, def: SpawnDefinition, areaId: string, parentEventId: string, rng: () => number, transferTokenId?: string, reanimation = false): void {
  const e = encounter(b);
  const position = emptyStance(b, def.occupiedSlots);
  const entry = e.summonSupply[def.definitionId];
  const token = transferTokenId ? entry?.tokens.find(t => t.tokenId === transferTokenId && t.state === 'spentThisBattle') : entry?.tokens.find(t => t.state === 'available');
  if (position === null || freeSpace(b, areaId) < def.occupiedSlots || (entry && !token)) throw new Error('Spawn transaction precondition failed');
  const id = `${b.battleId}:spawn:${e.eventSequence + 1}`;
  const unit = freshUnit(def, id, position);
  if (token) commitNecromancerFigure(b, def.definitionId, token.tokenId, reanimation);
  // Mutations run only on the transaction copy. Any exception discards the entire input.
  if (token) { token.state = 'active'; token.instanceId = id; syncLedger(entry); }
  b.monsters.push(unit);
  e.placements[id] = areaId; e.correspondingAreas[id] = areaId;
  e.activeSummons.push(id);
  if (!e.threatState.appearedDefinitionIds.includes(def.definitionId)) e.threatState.appearedDefinitionIds.push(def.definitionId);
  if (token && !e.threatState.appearedTokenIds.includes(token.tokenId)) e.threatState.appearedTokenIds.push(token.tokenId);
  insertInitiative(b, id, rng);
  if (token) recordBossRuntimeEvent(b, reanimation ? 'SUPPLY_TOKEN_TRANSFERRED' : 'SUPPLY_TOKEN_COMMITTED', { tokenId: token.tokenId, instanceId: id }, [id], 'NECRO_FINITE_BATTLE_SUPPLY_NO_DEATH_REFUND', parentEventId);
  recordBossRuntimeEvent(b, reanimation ? 'REANIMATION_SPAWNED' : 'SUMMON_SPAWNED', { instanceId: id, definitionId: def.definitionId, tokenId: token?.tokenId ?? null, areaId, position,
    combatDefinitionAuthority: def.dataAuthority, combatSourceCardId: def.sourceCardId }, [id], reanimation ? 'NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER' : undefined, parentEventId);
}
function suppress(b: BattleState, reason: string, parentEventId: string): void { recordBossRuntimeEvent(b, reason, { consumedSupply: false, insertedInitiative: false }, [], reason === 'SUMMON_SUPPRESSED_SUPPLY_EXHAUSTED' || reason === 'SUMMON_SUPPRESSED_NO_SPACE' ? 'NECRO_FINITE_BATTLE_SUPPLY_NO_DEATH_REFUND' : undefined, parentEventId); }
function spawn(b: BattleState, continuation: Extract<BossContinuation, { kind: 'spawn' }>, rng: () => number, selected?: string): void {
  const e = encounter(b);
  const { definitionId, areaId, parentEventId } = continuation;
  const def = e.spawnDefinitions[definitionId];
  if (!def) { recordBossRuntimeEvent(b, 'SPAWN_DEFINITION_UNBOUND', { definitionId, consumedSupply: false }, [], undefined, parentEventId); return; }
  if (emptyStance(b, def.occupiedSlots) === null) { suppress(b, 'SUMMON_SUPPRESSED_FULL_STANCES', parentEventId); return; }
  if (e.summonSupply[definitionId]?.available === 0) { suppress(b, 'SUMMON_SUPPRESSED_SUPPLY_EXHAUSTED', parentEventId); return; }
  if (!hasNecromancerFigure(b, definitionId)) { suppress(b, 'SUMMON_SUPPRESSED_PHYSICAL_FIGURE_UNAVAILABLE', parentEventId); return; }
  if (freeSpace(b, areaId) >= def.occupiedSlots) { commitSpawn(b, def, areaId, parentEventId, rng); return; }
  // Official p31: displace an occupant, with Hero precedence, rather than relocating the new summon.
  const occupants = alive(b).filter(u => e.placements[u.id] === areaId);
  const heroes = occupants.filter(u => u.side === 'hero');
  const movable = (heroes.length ? heroes : occupants).filter(u => slotsFor(e, u) >= def.occupiedSlots)
    .filter(u => e.definition.areas.some(a => a.id !== areaId && freeSpace(b, a.id) >= slotsFor(e, u)));
  let displacedId = continuation.displacedId;
  if (!displacedId) {
    if (!movable.length) { suppress(b, 'SUMMON_SUPPRESSED_NO_SPACE', parentEventId); return; }
    if (selected) displacedId = selected;
    else if (movable.length === 1) displacedId = movable[0].id;
    else { createBossRuntimeChoice(b, 'CHOICE_DISPLACEMENT_CHARACTER', movable.map(u => u.id), continuation, 'NECRO_ROOM_CAPACITY_DISPLACEMENT_OR_SUPPRESS', parentEventId); return; }
  }
  const displaced = occupants.find(u => u.id === displacedId);
  if (!displaced) throw new Error('Displaced character no longer eligible');
  const legal = e.definition.areas.filter(a => a.id !== areaId && freeSpace(b, a.id) >= slotsFor(e, displaced));
  const minimum = Math.min(...legal.map(a => areaDistance(e.definition, areaId, a.id)));
  const nearest = legal.filter(a => areaDistance(e.definition, areaId, a.id) === minimum && Number.isFinite(minimum)).map(a => a.id);
  if (!nearest.length) { suppress(b, 'SUMMON_SUPPRESSED_NO_SPACE', parentEventId); return; }
  let destination: string;
  if (continuation.displacedId && selected) destination = selected;
  else if (nearest.length === 1) destination = nearest[0];
  else { createBossRuntimeChoice(b, 'CHOICE_PLACEMENT_DESTINATION', nearest, { ...continuation, displacedId }, 'NECRO_ROOM_CAPACITY_DISPLACEMENT_OR_SUPPRESS', parentEventId); return; }
  if (!nearest.includes(destination)) throw new Error('Illegal displacement destination');
  e.placements[displacedId] = destination;
  recordBossRuntimeEvent(b, 'CHARACTER_DISPLACED', { areaId, destination }, [displacedId], undefined, parentEventId);
  commitSpawn(b, def, areaId, parentEventId, rng);
}
function resolveSkill(b: BattleState, continuation: Extract<BossContinuation, { kind: 'skill' }>, areaId: string, rng: () => number): void {
  const e = encounter(b);
  const skill = e.definition.skills.find(s => s.number === continuation.skillNumber);
  const boss = b.monsters.find(u => u.id === e.bossState.actorId && u.isAlive);
  if (!skill || !boss) throw new Error('Missing Skill/Boss actor');
  const distance = areaDistance(e.definition, e.placements[boss.id], areaId);
  if (distance !== skill.range && !continuation.movementDone && !continuation.selfPushDone && boss.speed > 0) {
    const current = e.placements[boss.id];
    const reachable = e.definition.areas.filter(a => a.id !== current && freeSpace(b, a.id) >= 1 && areaDistance(e.definition, current, a.id) <= boss.speed);
    const exact = reachable.filter(a => areaDistance(e.definition, a.id, areaId) === skill.range);
    const candidates = exact.length ? exact : reachable.filter(a => Math.abs(areaDistance(e.definition, a.id, areaId) - skill.range) < Math.abs(distance - skill.range));
    if (candidates.length > 1) {
      createBossRuntimeChoice(b, 'CHOICE_PLACEMENT_DESTINATION', candidates.map(a => a.id), { kind: 'boss-move', skillNumber: skill.number, attackRoll: continuation.attackRoll, parentEventId: continuation.parentEventId, targetAreaId: areaId }, undefined, continuation.parentEventId);
      return;
    }
    if (candidates.length === 1) {
      e.placements[boss.id] = candidates[0].id;
      recordBossRuntimeEvent(b, 'BOSS_MOVED', { from: current, destination: candidates[0].id }, [boss.id], undefined, continuation.parentEventId);
      resolveSkill(b, { ...continuation, movementDone: true }, areaId, rng); return;
    }
  }
  if (distance !== skill.range && !continuation.selfPushDone) {
    recordBossRuntimeEvent(b, 'SKILL_OUT_OF_RANGE', { areaId, range: skill.range, distance }, [], undefined, continuation.parentEventId);
    e.phase = 'BATTLE_ACTIVE'; return;
  }
  const attackRoll = continuation.attackRoll ?? rollD10(rng);
  const targets = b.heroes.filter(u => u.isAlive && e.placements[u.id] === areaId).sort((a, z) => a.position - z.position).slice(0, skill.targetCount);
  // Self effect window precedes successful Target effects, including on all misses.
  if (!continuation.selfPushDone) {
    recordBossRuntimeEvent(b, 'ATTACK_ROLLED', { attackRoll }, targets.map(u => u.id), undefined, continuation.parentEventId);
    const originalPosition = boss.position;
    boss.position = Math.min(4, boss.position + skill.self.count); boss.stance = stances[boss.position - 1];
    // Shift intervening Stance cards; spatial placement remains independent.
    for (const u of b.monsters.filter(u => u.isAlive && u.id !== boss.id && u.position > originalPosition && u.position <= boss.position)) { u.position -= 1; u.stance = stances[u.position - 1]; }
    const from = e.placements[boss.id];
    const pushAreas = e.definition.areas.filter(a => areaDistance(e.definition, from, a.id) === skill.self.count && areaDistance(e.definition, a.id, areaId) > distance && freeSpace(b, a.id) >= 1);
    recordBossRuntimeEvent(b, 'SELF_PUSH', { count: skill.self.count, stance: boss.stance, from }, [boss.id], undefined, continuation.parentEventId);
    if (pushAreas.length > 1) {
      createBossRuntimeChoice(b, 'CHOICE_PLACEMENT_DESTINATION', pushAreas.map(a => a.id), { kind: 'self-push', skillNumber: skill.number, attackRoll, parentEventId: continuation.parentEventId, targetAreaId: areaId }, undefined, continuation.parentEventId); return;
    }
    if (pushAreas.length === 1) e.placements[boss.id] = pushAreas[0].id;
  }
  if (b.stagedIncomingAttacks && targets.some(t => t.heroDodgeBinding)) {
    const staged = startSourceMonsterAttack(b, boss.id, targets.map(t=>t.id), attackRoll, {
      skill: { id: 'official:' + e.battleCardId + ':skill:' + skill.number, monsterId: boss.sourceId, name: skill.name,
        usableFromPositions: [1,2,3,4], validTargetPositions: [1,2,3,4], targetSide: 'enemy', accuracy: skill.accuracy,
        minDamage: typeof skill.damage === 'number' ? skill.damage : 0,
        maxDamage: typeof skill.critDamage === 'number' ? skill.critDamage : 0, stress: skill.stress, description: 'Frozen C1C28 Boss semantics' },
      criticalEnabled: typeof skill.crit === 'number',
      criticalThreshold: typeof skill.crit === 'number' ? skill.crit : 0,
      criticalDamage: typeof skill.critDamage === 'number' ? skill.critDamage : 0, targetPush: 0,
      remainingHeroes: [], alreadyResolvedHeroes: [], successfulHits: [], parentEventId: continuation.parentEventId,
      targetAreaId: areaId, summonDefinitionId: runtimeId(skill.targetEffect.monster), skillNumber: skill.number,
    });
    Object.assign(b, staged); return;
  }
  const hits: string[] = [];
  for (const target of targets) {
    const dodge = target.bossCombatDodge;
    if (typeof dodge !== 'number') throw new Error('Hero Dodge must be definition-bound');
    const hit = attackRoll <= skill.accuracy - dodge;
    const critical = typeof skill.crit === 'number' && attackRoll <= skill.crit;
    if (hit) {
      hits.push(target.id);
      const damage = critical && typeof skill.critDamage === 'number' ? skill.critDamage : typeof skill.damage === 'number' ? skill.damage : 0;
      const outcome = applyBattleUnitDamage(target, damage);
      const unit = outcome.unit;
      if (outcome.heroDied) unit.deathCause = 'deathblow-attack';
      if (unit.isAlive && skill.stress) {
        unit.stress = Math.min(10, unit.stress + skill.stress);
        b.pendingStressEvents ??= [];
        b.pendingStressEvents.push({ id: `${continuation.parentEventId}:stress:${unit.id}`, heroInstanceId: unit.sourceId, amount: skill.stress, sourceType: 'battle-skill', sourceId: String(e.battleCardId) });
      }
      b.heroes[b.heroes.findIndex(u => u.id === unit.id)] = unit;
      recordBossRuntimeEvent(b, 'TARGET_EFFECT', { attackRoll, dodge, hit, critical, damage, stress: skill.stress, deathblowRoll: outcome.deathblowRoll ?? null }, [target.id], undefined, continuation.parentEventId);
    } else recordBossRuntimeEvent(b, 'TARGET_MISSED', { attackRoll, dodge }, [target.id], undefined, continuation.parentEventId);
  }
  recordBossRuntimeEvent(b, 'SKILL_RESOLVED', { areaId, skillNumber: skill.number, attackRoll, successfulHits: hits, summonInstructions: hits.length ? 1 : 0 }, targets.map(u => u.id), `NECRO_SUMMON_COUNT_LEVEL_${e.bossLevel}_ONCE_PER_ACTIVATION`, continuation.parentEventId);
  if (hits.length) spawn(b, { kind: 'spawn', definitionId: runtimeId(skill.targetEffect.monster), areaId, parentEventId: continuation.parentEventId }, rng);
  e.phase = e.pendingChoice ? 'BATTLE_RESOLVING' : 'BATTLE_ACTIVE';
}
function reanimate(b: BattleState, deaths: DeathSnapshot[], selectedId: string, parentEventId: string, rng: () => number): void {
  const e = encounter(b);
  const death = deaths.find(d => d.instanceId === selectedId);
  if (!death) throw new Error('Invalid death candidate');
  e.reanimationState.firstDeathWindowConsumed = true;
  recordBossRuntimeEvent(b, 'REANIMATION_WINDOW_CONSUMED', { selectedId, candidateIds: deaths.map(d => d.instanceId) }, [selectedId], 'NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER', parentEventId);
  if (freeSpace(b, death.correspondingAreaId) < death.definition.occupiedSlots || emptyStance(b, death.definition.occupiedSlots) === null) {
    recordBossRuntimeEvent(b, 'REANIMATION_IGNORED_NO_SPACE', { correspondingAreaId: death.correspondingAreaId }, [selectedId], undefined, parentEventId);
  } else {
    commitSpawn(b, death.definition, death.correspondingAreaId, parentEventId, rng, death.tokenId ?? undefined, true);
  }
  recordBossRuntimeEvent(b, 'DEATH_CHAIN_RESUMED', { oldInstanceIds: deaths.map(d => d.instanceId) }, [], 'NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER', parentEventId);
}
function resolveDeaths(b: BattleState, ids: string[], rng: () => number): void {
  const e = encounter(b);
  const units = b.monsters.filter(u => ids.includes(u.id));
  if (units.length !== new Set(ids).size || units.some(u => u.isAlive)) throw new Error('Deaths require captured dead instances');
  const parent = recordBossRuntimeEvent(b, 'ATOMIC_DEATH_SNAPSHOT', { ids }, ids);
  const snapshots: DeathSnapshot[] = units.map(unit => {
    const def = e.spawnDefinitions[unit.sourceId];
    if (!def) throw new Error('Death definition unbound');
    const token = e.summonSupply[unit.sourceId]?.tokens.find(t => t.instanceId === unit.id && t.state === 'active');
    return { instanceId: unit.id, definition: clone(def), areaId: e.placements[unit.id], correspondingAreaId: e.correspondingAreas[unit.id], unit: clone(unit), tokenId: token?.tokenId ?? null };
  });
  e.queuedDeathIds = e.queuedDeathIds.filter(id => !ids.includes(id));
  const eligible = snapshots.filter(d => isReanimationEligible(d.definition.large));
  if (e.side === 'THREAT' && e.definition.reanimation && !e.reanimationState.firstDeathWindowConsumed && !e.reanimationState.lockedEventId && eligible.length) e.reanimationState.lockedEventId = parent;
  const effects = snapshots.flatMap(d => (d.definition.onDeathEffects ?? []).map(effect => `${d.instanceId}:${effect.effectId}`));
  continueDeathEffects(b, { kind: 'death-effects', deaths: snapshots, remainingEffectIds: effects, nestedDeathIds: [], parentEventId: parent }, rng);
}
function continueDeathEffects(b: BattleState, continuation: Extract<BossContinuation, { kind: 'death-effects' }>, rng: () => number, selectedEffectId?: string): void {
  const e = encounter(b);
  const { deaths: snapshots, parentEventId: parent } = continuation;
  const ids = snapshots.map(d => d.instanceId);
  const remaining = continuation.remainingEffectIds.slice();
  const nested = continuation.nestedDeathIds.slice();
  const eligibleEffects = snapshots.flatMap(death => {
    const order = death.definition.onDeathOrder;
    if (!order) return remaining.filter(id => (death.definition.onDeathEffects ?? []).some(effect => `${death.instanceId}:${effect.effectId}` === id));
    const next = order.find(id => remaining.includes(`${death.instanceId}:${id}`));
    return next ? [`${death.instanceId}:${next}`] : [];
  });
  if (eligibleEffects.length > 1 && !selectedEffectId) {
    createBossRuntimeChoice(b, 'CHOICE_DEATH_EFFECT', eligibleEffects, continuation, 'NECRO_REANIMATION_NEW_INSTANCE_EVENT_ORDER', parent); return;
  }
  const effectId = selectedEffectId ?? (eligibleEffects.length === 1 ? eligibleEffects[0] : undefined);
  if (effectId) {
    const owner = snapshots.find(d => (d.definition.onDeathEffects ?? []).some(effect => `${d.instanceId}:${effect.effectId}` === effectId));
    const effect = owner?.definition.onDeathEffects?.find(effect => `${owner.instanceId}:${effect.effectId}` === effectId);
    if (!effect || !remaining.includes(effectId)) throw new Error('Unbound dying-instance effect');
    for (const id of effect.targetIds) {
      const unit = alive(b).find(u => u.id === id);
      if (!unit) continue;
      const outcome = applyBattleUnitDamage(unit, effect.damage);
      const list = unit.side === 'hero' ? b.heroes : b.monsters;
      list[list.findIndex(u => u.id === id)] = outcome.unit;
      if (unit.side === 'monster' && !outcome.unit.isAlive && !ids.includes(id) && !nested.includes(id)) { nested.push(id); e.queuedDeathIds.push(id); }
    }
    recordBossRuntimeEvent(b, 'MANDATORY_DEATH_EFFECT_RESOLVED', { effectId, damage: effect.damage }, effect.targetIds, undefined, parent);
    if (e.bossState.actorId && !b.monsters.some(u => u.id === e.bossState.actorId && u.isAlive)) { Object.assign(b, checkBossRuntimeEnd(b)); return; }
    remaining.splice(remaining.indexOf(effectId), 1);
    if (remaining.length) { continueDeathEffects(b, { ...continuation, remainingEffectIds: remaining, nestedDeathIds: nested }, rng); return; }
  }
  recordBossRuntimeEvent(b, 'MANDATORY_DEATH_EFFECTS_RESOLVED', { count: snapshots.reduce((sum, d) => sum + (d.definition.onDeathEffects?.length ?? 0), 0) }, ids, undefined, parent);
  for (const death of snapshots) {
    const entry = e.summonSupply[death.definition.definitionId];
    const token = entry?.tokens.find(t => t.tokenId === death.tokenId);
    if (token) { defeatNecromancerFigure(b, token.tokenId); token.state = 'spentThisBattle'; token.instanceId = null; syncLedger(entry); }
    delete e.placements[death.instanceId]; delete e.correspondingAreas[death.instanceId];
  }
  b.monsters = b.monsters.filter(u => !ids.includes(u.id));
  e.activeSummons = e.activeSummons.filter(id => !ids.includes(id));
  const prefix = b.initiativeOrder.slice(0, b.initiativeIndex + 1).filter(id => !ids.includes(id));
  const rest = b.initiativeOrder.slice(b.initiativeIndex + 1).filter(id => !ids.includes(id));
  b.initiativeOrder = [...prefix, ...rest]; b.initiativeIndex = prefix.length - 1;
  b.initiativeCards = b.initiativeCards?.filter(c => !c.actorId || !ids.includes(c.actorId));
  recordBossRuntimeEvent(b, 'OLD_INSTANCES_REMOVED', { ids }, ids, undefined, parent);
  const eligible = snapshots.filter(d => isReanimationEligible(d.definition.large));
  if (e.side === 'THREAT' && e.definition.reanimation && !e.reanimationState.firstDeathWindowConsumed && eligible.length && e.reanimationState.lockedEventId === parent) {
    if (eligible.length > 1) {
      createBossRuntimeChoice(b, 'CHOICE_REANIMATION_DEATH', eligible.map(d => d.instanceId), { kind: 'reanimate', deaths: eligible, parentEventId: parent }, 'NECRO_SIMULTANEOUS_FIRST_DEATH_PLAYER_CHOICE', parent);
      // Nested deaths remain dead in the Battle and are synchronized after this player choice.
    } else reanimate(b, eligible, eligible[0].instanceId, parent, rng);
  }
  if (nested.length && !e.pendingChoice) resolveDeaths(b, nested, rng);
}
function cleanup(b: BattleState): void {
  const e = encounter(b);
  if (e.cleanupState.completed) return;
  if (e.phase !== 'VICTORY') throw new Error('Cleanup requires victory');
  e.phase = 'CLEANUP';
  e.pendingChoice = null; e.activeSummons = []; e.queuedDeathIds = []; e.placements = {}; e.correspondingAreas = {};
  returnNecromancerFigures(b);
  for (const entry of Object.values(e.summonSupply)) { for (const token of entry.tokens) if (token.state !== 'permanentlyRemoved') { token.state = 'available'; token.instanceId = null; } syncLedger(entry); }
  b.monsters = []; b.initiativeOrder = []; b.initiativeCards = []; b.initiativeDrawPile = []; b.resolvedInitiativeCardIds = [];
  b.boss = null; b.selectedSkillId = null; b.selectedTargetId = null;
  b.activeActorId = null; b.currentActionPoints = 0; b.pendingAction = null; b.pendingMonsterAttack = null;
  e.side = 'THREAT'; e.bossState = { actorId: null, lastActionRound: 0, storage: 'BOSS_ENCOUNTER_STORAGE' };
  e.reanimationState = { firstDeathWindowConsumed: false, lockedEventId: null };
  e.threatState.forcedHeroId = null;
  e.cleanupState.completed = true;
  recordBossRuntimeEvent(b, 'ENCOUNTER_CLEANUP', { storage: 'BOSS_ENCOUNTER_STORAGE', permanentRemovalPreserved: true }, [], 'NECRO_BOSS_TRIO_ENCOUNTER_STORAGE_RESET');
  e.phase = 'COMPLETE';
}
function handle(b: BattleState, input: BossRuntimeInput, rng: () => number): void {
  const e = encounter(b);
  if (input.type === 'CLEANUP') { cleanup(b); return; }
  if (input.type === 'END_THREAT_BATTLE' && e.side === 'THREAT' && b.status === 'victory') b.status = 'active';
  if (e.phase === 'COMPLETE' || e.phase === 'VICTORY' || b.status !== 'active') throw new Error('Encounter ended');
  if (b.pendingMonsterAttack && input.type !== 'CHOICE') throw new Error('Incoming reaction blocks gameplay');
  if (e.pendingChoice && input.type !== 'CHOICE') throw new Error('Pending choice blocks gameplay');
  if (input.type === 'CHOICE') {
    const p = e.pendingChoice;
    if (!p || p.choiceId !== input.choiceId || !p.candidateIds.includes(input.selectedId) || p.ruleSetVersion !== e.ruleSetVersion) throw new Error('Invalid choice');
    p.status = 'COMMITTED'; p.selectedId = input.selectedId;
    recordBossRuntimeEvent(b, 'CHOICE_COMMITTED', { choice: clone(p) }, [input.selectedId], e.events.find(event => event.eventId === p.createdAtEventId)?.rulingId, p.createdAtEventId);
    e.pendingChoice = null;
    const c = p.continuation;
    if (c.kind === 'source-self-move') {
      e.placements[c.monsterId] = input.selectedId;
      Object.assign(b, startSourceMonsterAttack(b, c.monsterId, c.targetIds, c.attackRoll, c.source));
    }
    if (c.kind === 'source-target-push') {
      e.placements[c.characterId] = input.selectedId;
      Object.assign(b, finishSourceMonsterAttack(b, true));
    }
    if (c.kind === 'monster-move') {
      e.placements[c.monsterId] = input.selectedId;
      recordBossRuntimeEvent(b, 'MONSTER_MOVED', { destination: input.selectedId }, [c.monsterId], undefined, c.parentEventId);
      Object.assign(b, continuePrintedMonsterTurn(b, c.monsterId, c.skillNumber, c.targetIds, c.targetAreaId, c.parentEventId, rng, true));
    }
    if (c.kind === 'graveyard') e.threatState.forcedHeroId = input.selectedId;
    if (c.kind === 'skill') resolveSkill(b, c, input.selectedId, rng);
    if (c.kind === 'boss-move' || c.kind === 'self-push') {
      const actorId = e.bossState.actorId;
      if (!actorId) throw new Error('Missing Boss');
      e.placements[actorId] = input.selectedId;
      recordBossRuntimeEvent(b, c.kind === 'boss-move' ? 'BOSS_MOVED' : 'SELF_PUSH_MOVED', { destination: input.selectedId }, [actorId], undefined, c.parentEventId);
      resolveSkill(b, { kind: 'skill', skillNumber: c.skillNumber, attackRoll: c.attackRoll, parentEventId: c.parentEventId, movementDone: true, selfPushDone: c.kind === 'self-push' }, c.targetAreaId, rng);
    }
    if (c.kind === 'spawn') spawn(b, c, rng, input.selectedId);
    if (c.kind === 'reanimate') reanimate(b, c.deaths, input.selectedId, c.parentEventId, rng);
    if (c.kind === 'death-effects') continueDeathEffects(b, c, rng, input.selectedId);
    if (b.status !== 'active') return;
    if (!e.pendingChoice && e.queuedDeathIds.length) resolveDeaths(b, e.queuedDeathIds.slice(), rng);
    if (!e.pendingChoice && e.phase === 'BATTLE_RESOLVING') e.phase = 'BATTLE_ACTIVE';
    return;
  }
  if (input.type === 'MOVE_HERO_AREA') {
    const hero = b.heroes.find(h=>h.id===input.heroId && h.isAlive);
    const from = hero ? e.placements[hero.id] : '';
    if (!hero || b.activeActorId!==hero.id || b.currentActionPoints<=0 || !e.definition.areas.some(a=>a.id===input.areaId)
      || from===input.areaId || areaDistance(e.definition,from,input.areaId)>hero.speed || freeSpace(b,input.areaId)<1) throw new Error('Illegal Hero Area movement');
    e.placements[hero.id]=input.areaId; b.currentActionPoints--;
    recordBossRuntimeEvent(b,'HERO_AREA_MOVED',{from,to:input.areaId,actionPoints:b.currentActionPoints},[hero.id]); return;
  }
  if (input.type === 'PREPARATION_DAY') {
    if (e.side !== 'THREAT' || e.threatState.preparationDayConsumed || e.definition.hamlet === 'BLOCK_GRAVEYARD') throw new Error('Inactive preparation effect');
    const heroes = b.heroes.filter(u => u.isAlive);
    if (!heroes.length || heroes.some(u => !Number.isInteger(input.rolls[u.id]) || input.rolls[u.id] < 1 || input.rolls[u.id] > 10)) throw new Error('Invalid Hero rolls');
    const minimum = Math.min(...heroes.map(u => input.rolls[u.id]));
    const candidates = heroes.filter(u => input.rolls[u.id] === minimum).map(u => u.id);
    e.threatState.preparationDayConsumed = true;
    const parent = recordBossRuntimeEvent(b, 'LOWEST_ROLL', { rolls: input.rolls, candidates }, candidates);
    if (candidates.length === 1) e.threatState.forcedHeroId = candidates[0];
    else createBossRuntimeChoice(b, 'CHOICE_TARGET_HERO', candidates, { kind: 'graveyard' }, 'NECRO_LOWEST_ROLL_TIE_PLAYER_CHOICE', parent);
    return;
  }
  if (input.type === 'FIRST_DUNGEON_BATTLE') {
    if (e.side !== 'THREAT' || e.threatState.firstBattleConsumed) throw new Error('Inactive Dungeon Threat');
    e.threatState.firstBattleConsumed = true;
    if (e.definition.captainThreat) {
      const parent = recordBossRuntimeEvent(b, 'CAPTAIN_THREAT_CONSUMED', { firstMonster: true }, [], 'NECRO_CAPTAIN_PROJECT_COMPONENT_BINDING');
      const def = e.spawnDefinitions['bone-captain'];
      if (!def) { recordBossRuntimeEvent(b, 'SPAWN_DEFINITION_UNBOUND', { definitionId: 'bone-captain' }, [], undefined, parent); return; }
      if (!hasNecromancerFigure(b, 'bone-captain')) { suppress(b, 'SUMMON_SUPPRESSED_PHYSICAL_FIGURE_UNAVAILABLE', parent); return; }
      // Separate large initial-draw path: require first placement and two free slots; no replacement.
      if (b.monsters.some(u => u.isAlive) || freeSpace(b, e.definition.bossStartArea) < def.occupiedSlots || emptyStance(b, def.occupiedSlots) !== 1) { suppress(b, 'CAPTAIN_SUPPRESSED_INITIAL_PLACEMENT', parent); return; }
      commitSpawn(b, def, e.definition.bossStartArea, parent, rng);
    }
    return;
  }
  if (input.type === 'ENTER_BOSS_ROOM') {
    if (e.side !== 'THREAT') throw new Error('Already in Boss Room');
    if (b.monsters.some(u => u.isAlive)) throw new Error('End the Threat battle before entering Boss Room');
    e.phase = 'BOSS_ROOM'; e.side = 'ABILITY'; e.roomId = b.sourceRoomId;
    recordBossRuntimeEvent(b, 'THREAT_FLIPPED_TO_ABILITY', { threatStopped: true, abilityActive: true });
    const id = `${b.battleId}:boss`;
    const bossDef: SpawnDefinition = { definitionId: `${e.bossFamily.toLowerCase()}-level-${e.bossLevel}`, sourceCardId: e.battleCardId, dataAuthority: 'OFFICIAL_SOURCE', ruleSetVersion: e.ruleSetVersion, life: e.definition.stats.HP,
      speed: e.definition.stats.speed!, large: false, occupiedSlots: 1, tags: e.definition.stats.type, skillIds: [] };
    const boss = freshUnit(bossDef, id, stances.indexOf(e.definition.initialStance.toLowerCase() as Stance) + 1);
    boss.bossCombatDodge = e.definition.stats.dodge;
    boss.immunities = e.definition.stats.immunityTokens.map(token => e.definition.stats.glyphMeanings[token].toLowerCase());
    if (e.checkpointContext?.heroDodgeBindings) boss.categoricalResistances = e.definition.stats.resistanceTokens.map(token => e.definition.stats.glyphMeanings[token].toLowerCase()) as BattleUnit['categoricalResistances'];
    b.monsters = [boss]; e.spawnDefinitions[boss.sourceId] = bossDef;
    e.bossState.actorId = id; e.placements[id] = e.definition.bossStartArea;
    b.boss = { isBossBattle: true, bossActorId: id, bossDefinitionId: boss.sourceId, bossFamilyId: e.bossFamily, threatId: `${e.bossFamily}-threat-level-${e.bossLevel}`,
      actionsPerRound: e.definition.actionsPerRound, bossInitiativeCardIds: [], roundLimitEnabled: false, currentRound: 1, bossDefeated: false, victoryResolved: false,
      summonHistory: [], bossRevealTransactionId: `${b.battleId}:reveal`, bossVictoryTransactionId: null, actionSelections: [] };
    e.correspondingAreas[id] = e.definition.bossStartArea;
    for (const hero of b.heroes) e.placements[hero.id] = e.definition.heroStartArea!;
    b.round = 1; e.round = 1; b.roundLimitEnabled = false; b.roundLimitPolicy = 'not-counted';
    b.initiativeOrder = shuffleWithRng(rng, [...b.heroes.filter(u => u.isAlive).map(u => u.id), id]);
    b.initiativeIndex = -1; b.activeActorId = null;
    e.phase = 'BATTLE_ACTIVE'; recordBossRuntimeEvent(b, 'BOSS_BATTLE_STARTED', { life: boss.hp, areaId: e.placements[id], stance: boss.stance });
    return;
  }
  if (input.type === 'SKILL') {
    if (e.side !== 'ABILITY' || e.phase !== 'BATTLE_ACTIVE' || e.bossState.lastActionRound === b.round) throw new Error('Boss action unavailable');
    const skillRoll = input.skillRoll ?? rollD10(rng);
    const attackRoll = input.attackRoll ?? null;
    if (![skillRoll, ...(attackRoll === null ? [] : [attackRoll])].every(n => Number.isInteger(n) && n >= 1 && n <= 10)) throw new Error('Invalid D10');
    const number = e.definition.attackTable.find(t => skillRoll >= t.rollMin && skillRoll <= t.rollMax)?.skill;
    if (!number) throw new Error('Invalid D10 table');
    e.bossState.lastActionRound = b.round; e.round = b.round; e.phase = 'BATTLE_RESOLVING';
    const parent = recordBossRuntimeEvent(b, 'SKILL_ROLLED', { skillRoll, attackRoll, skillNumber: number });
    const areas = e.definition.areas.map(a => ({ id: a.id, count: b.heroes.filter(u => u.isAlive && e.placements[u.id] === a.id).length })).filter(a => a.count > 0);
    const maximum = Math.max(...areas.map(a => a.count));
    const candidates = areas.filter(a => a.count === maximum).map(a => a.id);
    const c: Extract<BossContinuation, { kind: 'skill' }> = { kind: 'skill', skillNumber: number, attackRoll, parentEventId: parent };
    if (!candidates.length) { recordBossRuntimeEvent(b, 'SKILL_NO_TARGET', {}, [], undefined, parent); e.phase = 'BATTLE_ACTIVE'; }
    else if (candidates.length === 1) resolveSkill(b, c, candidates[0], rng);
    else createBossRuntimeChoice(b, 'CHOICE_TARGET_AREA', candidates, c, 'NECRO_CROWDED_AREA_TIE_PLAYER_CHOICE', parent);
    return;
  }
  if (input.type === 'DEATHS') { resolveDeaths(b, input.instanceIds, rng); return; }
  if (input.type === 'MONSTER_DAMAGE') {
    const ids = Object.keys(input.amounts);
    if (!ids.length || ids.some(id => !b.monsters.some(u => u.id === id && u.isAlive)) || Object.values(input.amounts).some(n => !Number.isFinite(n) || n < 0)) throw new Error('Invalid atomic Monster damage');
    b.monsters = b.monsters.map(u => idInAmounts(u.id, input.amounts) ? applyBattleUnitDamage(u, input.amounts[u.id]).unit : u);
    recordBossRuntimeEvent(b, 'ATOMIC_MONSTER_DAMAGE', { amounts: input.amounts }, ids);
    const ended = checkBossRuntimeEnd(b);
    if (ended.status === 'victory') { Object.assign(b, ended); return; }
    const dead = b.monsters.filter(u => ids.includes(u.id) && !u.isAlive).map(u => u.id);
    if (dead.length) resolveDeaths(b, dead, rng);
    return;
  }
  if (input.type === 'END_THREAT_BATTLE') {
    if (e.side !== 'THREAT') throw new Error('Threat expired');
    returnNecromancerFigures(b);
    if (e.definition.hamlet === 'BLOCK_GRAVEYARD') {
      const nonUnholy = e.threatState.appearedDefinitionIds.filter(id => {
        const def = e.spawnDefinitions[id];
        if (!def) throw new Error('Resolved Monster tags required for Threat removal');
        return isNonUnholy(def.tags);
      });
      for (const id of nonUnholy) if (!e.threatState.permanentlyRemovedDefinitionIds.includes(id)) e.threatState.permanentlyRemovedDefinitionIds.push(id);
      for (const id of nonUnholy) {
        const entry = e.summonSupply[id];
        for (const token of entry?.tokens ?? []) if (e.threatState.appearedTokenIds.includes(token.tokenId)) { token.state = 'permanentlyRemoved'; token.instanceId = null; }
        if (entry) syncLedger(entry);
      }
    }
    for (const entry of Object.values(e.summonSupply)) { for (const token of entry.tokens) if (token.state !== 'permanentlyRemoved') { token.state = 'available'; token.instanceId = null; } syncLedger(entry); }
    b.monsters = []; e.activeSummons = []; b.initiativeOrder = b.heroes.filter(u => u.isAlive).map(u => u.id); b.initiativeIndex = -1;
    e.reanimationState = { firstDeathWindowConsumed: false, lockedEventId: null };
    recordBossRuntimeEvent(b, 'THREAT_BATTLE_ENDED', { permanentlyRemovedDefinitionIds: e.threatState.permanentlyRemovedDefinitionIds });
  }
}
function idInAmounts(id: string, amounts: Record<string, number>): boolean { return Object.prototype.hasOwnProperty.call(amounts, id); }
/** Transaction boundary: rejected input never mutates the original BattleState or persisted RNG. */
export function applyBossRuntimeInput(battle: BattleState, input: BossRuntimeInput): BattleState {
  const b = clone(battle);
  const e = encounter(b);
  if (e.bossFamily==='prophet' || e.definition.successorContract) throw new Error('Successor gameplay requires production foundation acceptance');
  if (e.cleanupState.completed && input.type === 'CLEANUP') return battle;
  const next = withBossEncounterSources(b, (working, rng) => { handle(working, input, rng); return checkBossRuntimeEnd(working); });
  encounter(next).inputs.push(clone(input));
  assertBossEncounter(next);
  return next;
}
export function checkBossRuntimeEnd(battle: BattleState): BattleState {
  const e = battle.bossEncounter;
  if (!e || !e.bossState.actorId || e.phase === 'COMPLETE' || e.phase === 'VICTORY') return battle;
  const boss = battle.monsters.find(u => u.id === e.bossState.actorId);
  if (boss?.isAlive) return battle;
  const b = clone(battle);
  encounter(b).pendingChoice = null; encounter(b).phase = 'VICTORY';
  encounter(b).activeSummons = []; encounter(b).queuedDeathIds = [];
  for (const entry of Object.values(encounter(b).summonSupply)) {
    for (const token of entry.tokens) if (token.state === 'active') { token.state = 'spentThisBattle'; token.instanceId = null; }
    syncLedger(entry);
  }
  b.monsters = b.monsters.filter(u => u.id === e.bossState.actorId);
  b.initiativeOrder = []; b.initiativeCards = []; b.initiativeDrawPile = [];
  b.status = 'victory'; b.activeActorId = null;
  if (b.boss) b.boss.bossDefeated = true;
  recordBossRuntimeEvent(b, 'BOSS_DEFEATED', { queuedEffectsCancelled: true });
  return b;
}
export function replayBossRuntime(initial: BattleState, inputs: BossRuntimeInput[]): BattleState {
  return inputs.reduce((state, input) => applyBossRuntimeInput(state, input), clone(initial));
}
export function restoreBossRuntime(json: string, ruleSetVersion: string): BattleState {
  const b = JSON.parse(json) as BattleState;
  if (b.bossEncounter?.ruleSetVersion !== ruleSetVersion) throw new Error('Explicit ruling migration required');
  assertBossEncounter(b);
  return b;
}

/** Complete the generic shared-roll continuation only after every Hero reaction has committed. */
export function finishSourceMonsterAttack(battle: BattleState, hit: boolean): BattleState {
  return withBossEncounterSources(structuredClone(battle), (b, rng) => {
    const pending = b.pendingMonsterAttack!;
    const source = pending.sourceAttack!;
    const resolved = [...source.alreadyResolvedHeroes, pending.targetHeroUnitId];
    const hits = hit ? [...source.successfulHits, pending.targetHeroUnitId] : source.successfulHits;
    recordBossRuntimeEvent(b, hit ? 'TARGET_EFFECT' : 'TARGET_MISSED', { attackRoll: pending.attackRoll,
      dodgeBinding: b.heroes.find(h=>h.id===pending.targetHeroUnitId)?.heroDodgeBinding,
      dodgeModifier: pending.dodgeModifier, hit, critical: pending.crit || pending.criticalOverride === 'force-critical',
      baseDamage: pending.baseDamage, modifiers: { numerator: pending.incomingDamageNumerator, denominator: pending.incomingDamageDenominator } },
      [pending.targetHeroUnitId], undefined, source.parentEventId);
    b.pendingMonsterAttack = null;
    if (source.remainingHeroes.length) return startSourceMonsterAttack(b, pending.monsterUnitId,
      source.remainingHeroes, pending.attackRoll, { ...source, alreadyResolvedHeroes: resolved, successfulHits: hits });
    recordBossRuntimeEvent(b, 'SKILL_RESOLVED', { skillNumber: source.skillNumber, attackRoll: pending.attackRoll,
      successfulHits: hits, summonInstructions: source.summonDefinitionId && hits.length ? 1 : 0 }, resolved,
      source.summonDefinitionId ? 'NECRO_SUMMON_COUNT_LEVEL_' + encounter(b).bossLevel + '_ONCE_PER_ACTIVATION' : undefined, source.parentEventId);
    if (source.summonDefinitionId && hits.length) spawn(b, { kind: 'spawn', definitionId: source.summonDefinitionId,
      areaId: source.targetAreaId, parentEventId: source.parentEventId }, rng);
    encounter(b).phase = encounter(b).pendingChoice ? 'BATTLE_RESOLVING' : 'BATTLE_ACTIVE';
    return b;
  });
}
