import { SeededRandom } from '../runtime-sources';
import { shuffleWithRng } from '../campaign/act-four/rng';
import { ruinsMonster, ruinsMonsterDefinitions, ruinsTile } from './source-registry';
import { RUINS_STANCES, RUINS_V4, RUINS_V5, RUINS_V5_REPLACEMENT_RULING, type RuinsRuleSetVersion, type RuinsStance } from '../../types/ruins-executable';

export type CopyOwner = { location: 'DECK' | 'DISCARD' } | { location: 'ENCOUNTER' | 'SUMMON_POOL'; encounterId: string };
export interface OrdinaryRuinsEncounter {
  encounterId: string; ruleSetVersion: RuinsRuleSetVersion; roomNumber: number; tileId: string;
  largeReplacementRulingId?: typeof RUINS_V5_REPLACEMENT_RULING;
  heroes: Array<{ heroId: string; stance: RuinsStance; areaId: string }>;
  monsters: Array<{ copyId: string; definitionId: string; stance: RuinsStance; slots: number; areaId: string }>;
  initiativeCards: Array<{ cardId: string; side: 'hero' | 'monster' }>;
  drawEvents: Array<{ type: 'DRAW' | 'LARGE_REPLACEMENT'; copyId: string }>;
  returned: boolean;
}
export interface RuinsDrawState {
  schemaVersion: 1; ruleSetVersion: RuinsRuleSetVersion; level: 1 | 2 | 3;
  largeReplacementRulingId?: typeof RUINS_V5_REPLACEMENT_RULING;
  rngCursor: number; rngCalls: number; roomDeck: number[]; monsterDeck: string[];
  ownership: Record<string, CopyOwner>; encounters: OrdinaryRuinsEncounter[];
}

export function createRuinsDrawState(level: 1 | 2 | 3, seed: number, ruleSetVersion: RuinsRuleSetVersion = RUINS_V4): RuinsDrawState {
  const random = new SeededRandom(seed);
  let rngCalls = 0;
  const rng = () => { rngCalls++; return random.next(); };
  const definitions = ruinsMonsterDefinitions(ruleSetVersion);
  const copies = definitions.filter(d => d.drawEligibleFromLevel <= level).flatMap(d => d.physicalCopyIds);
  const state: RuinsDrawState = { schemaVersion: 1, ruleSetVersion, level,
    ...(ruleSetVersion === RUINS_V5 ? { largeReplacementRulingId: RUINS_V5_REPLACEMENT_RULING } : {}),
    roomDeck: shuffleWithRng(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]), monsterDeck: shuffleWithRng(rng, copies),
    rngCursor: random.snapshot(), rngCalls, ownership: Object.fromEntries(copies.map(id => [id, { location: 'DECK' }])), encounters: [] };
  validateRuinsDrawState(state);
  return state;
}

/** A saved result is returned unchanged. All draws/ownership/layout/RNG changes commit together. */
export function drawOrdinaryRuinsEncounter(state: RuinsDrawState, encounterId: string,
  heroStances: Record<string, RuinsStance>): RuinsDrawState {
  validateRuinsDrawState(state);
  if (!encounterId.trim() || Object.keys(heroStances).length !== 4 || new Set(Object.values(heroStances)).size !== 4
    || Object.values(heroStances).some(s => !RUINS_STANCES.includes(s))) throw new Error('Four unique Hero Stances required');
  const prior = state.encounters.find(e => e.encounterId === encounterId);
  if (prior) {
    if (prior.heroes.some(h => heroStances[h.heroId] !== h.stance)) throw new Error('Encounter identity already bound to different Heroes');
    return state;
  }
  if (state.encounters.some(e => !e.returned)) throw new Error('Return active encounter before next draw');
  if (state.ruleSetVersion === RUINS_V4 && state.encounters.some(e => e.returned && e.drawEvents.some(event => event.type === 'LARGE_REPLACEMENT'
    && state.ownership[event.copyId].location === 'DISCARD'))) throw new Error('SOURCE_UNRESOLVED: initial Large replacement discard return policy');
  const next = structuredClone(state);
  const random = new SeededRandom(1); random.restore(state.rngCursor);
  const rng = () => { next.rngCalls++; return random.next(); };
  const roomNumber = next.roomDeck.shift();
  if (!roomNumber) throw new Error('Ordinary Room deck exhausted');
  const tile = ruinsTile(`ruins-tile-${roomNumber}`);
  const selected: Array<{ copyId: string; definitionId: string; slots: number; slot: number }> = [];
  const drawEvents: OrdinaryRuinsEncounter['drawEvents'] = [];
  const occupied = () => new Set(selected.flatMap(m => Array.from({ length: m.slots }, (_, i) => m.slot + i)));
  while (occupied().size < 4) {
    const copyId = next.monsterDeck.shift();
    if (!copyId) throw new Error('Monster deck exhausted');
    const definition = ruinsMonsterDefinitions(state.ruleSetVersion).find(d => d.physicalCopyIds.includes(copyId))!;
    drawEvents.push({ type: 'DRAW', copyId });
    const slotOrder = definition.deployment === 'FRONT' ? [0, 1, 2, 3] : [3, 2, 1, 0];
    let slot = slotOrder.find(i => i + definition.stanceSlots <= 4
      && Array.from({ length: definition.stanceSlots }, (_, j) => i + j).every(n => !occupied().has(n)));
    if (slot === undefined && definition.size === 'LARGE' && selected.length === 3) {
      const lastNormal = [...selected].reverse().find(m => m.slots === 1)!;
      selected.splice(selected.indexOf(lastNormal), 1);
      next.ownership[lastNormal.copyId] = { location: 'DISCARD' };
      drawEvents.push({ type: 'LARGE_REPLACEMENT', copyId: lastNormal.copyId });
      let front = 0;
      for (const m of selected.sort((a, b) => a.slot - b.slot)) { m.slot = front; front += m.slots; }
      slot = front;
    }
    if (slot === undefined) throw new Error('Official initial placement could not bind');
    next.ownership[copyId] = { location: 'ENCOUNTER', encounterId };
    selected.push({ copyId, definitionId: definition.canonicalId, slots: definition.stanceSlots, slot });
  }
  const monsters = selected.map(m => ({ copyId: m.copyId, definitionId: m.definitionId, slots: m.slots,
    stance: RUINS_STANCES[m.slot], areaId: tile.monsterStartingStanceAreas[RUINS_STANCES[m.slot]] }));
  const heroes = RUINS_STANCES.map(stance => ({ heroId: Object.keys(heroStances).find(id => heroStances[id] === stance)!,
    stance, areaId: tile.heroStartingStanceAreas[stance] }));
  for (const area of tile.areas) {
    const count = heroes.filter(h => h.areaId === area.id).length + monsters.filter(m => m.areaId === area.id)
      .reduce((sum, m) => sum + ruinsMonster(m.definitionId, state.ruleSetVersion).occupiedSpaces, 0);
    if (count > area.capacity) throw new Error('Printed starting Area capacity exceeded; source review required');
  }
  const cards = [...heroes.map((_, i) => ({ cardId: `${encounterId}:hero:${i + 1}`, side: 'hero' as const })),
    ...monsters.map((_, i) => ({ cardId: `${encounterId}:monster:${i + 1}`, side: 'monster' as const }))];
  const encounter: OrdinaryRuinsEncounter = { encounterId, ruleSetVersion: state.ruleSetVersion, roomNumber, tileId: tile.tileId,
    ...(state.ruleSetVersion === RUINS_V5 ? { largeReplacementRulingId: RUINS_V5_REPLACEMENT_RULING } : {}),
    heroes, monsters, initiativeCards: shuffleWithRng(rng, cards), drawEvents, returned: false };
  next.encounters.push(encounter);
  next.rngCursor = random.snapshot();
  validateRuinsDrawState(next);
  return next;
}

export function returnOrdinaryRuinsEncounter(state: RuinsDrawState, encounterId: string): RuinsDrawState {
  validateRuinsDrawState(state);
  const prior = state.encounters.find(e => e.encounterId === encounterId);
  if (!prior) throw new Error('Encounter unavailable');
  if (prior.returned) return state;
  const next = structuredClone(state);
  next.encounters.find(e => e.encounterId === encounterId)!.returned = true;
  // Official p25: shuffle the Monster cards used in Battle back into the Monster deck.
  const random = new SeededRandom(1); random.restore(state.rngCursor);
  const replacementDiscards = state.ruleSetVersion === RUINS_V5
    ? prior.drawEvents.filter(event => event.type === 'LARGE_REPLACEMENT').map(event => event.copyId) : [];
  for (const copyId of [...prior.monsters.map(m => m.copyId), ...replacementDiscards]) next.ownership[copyId] = { location: 'DECK' };
  next.monsterDeck = shuffleWithRng(() => { next.rngCalls++; return random.next(); },
    [...next.monsterDeck, ...prior.monsters.map(m => m.copyId), ...replacementDiscards]);
  next.rngCursor = random.snapshot();
  validateRuinsDrawState(next);
  return next;
}

export function reserveRuinsSummonCopy(state: RuinsDrawState, copyId: string, encounterId: string): RuinsDrawState {
  validateRuinsDrawState(state);
  if (!encounterId.trim() || state.ownership[copyId]?.location !== 'DECK') throw new Error('Physical summon copy unavailable');
  const next = structuredClone(state);
  next.monsterDeck = next.monsterDeck.filter(id => id !== copyId);
  next.ownership[copyId] = { location: 'SUMMON_POOL', encounterId };
  validateRuinsDrawState(next);
  return next;
}

export function validateRuinsDrawState(state: RuinsDrawState): void {
  if (state.schemaVersion !== 1 || ![RUINS_V4, RUINS_V5].includes(state.ruleSetVersion) || ![1, 2, 3].includes(state.level)
    || !Number.isInteger(state.rngCursor) || state.rngCursor < 0 || state.rngCursor > 0xffffffff
    || !Number.isInteger(state.rngCalls) || state.rngCalls < 0) throw new Error('Invalid Ruins draw version/RNG');
  if (state.ruleSetVersion === RUINS_V5 ? state.largeReplacementRulingId !== RUINS_V5_REPLACEMENT_RULING
    : state.largeReplacementRulingId !== undefined) throw new Error('Invalid Large replacement ruling provenance');
  const expected = ruinsMonsterDefinitions(state.ruleSetVersion).filter(d => d.drawEligibleFromLevel <= state.level).flatMap(d => d.physicalCopyIds).sort();
  if (Object.keys(state.ownership).sort().join('|') !== expected.join('|') || new Set(state.monsterDeck).size !== state.monsterDeck.length) throw new Error('Physical ownership census differs');
  if (Object.values(state.ownership).some(owner => !['DECK', 'DISCARD', 'ENCOUNTER', 'SUMMON_POOL'].includes(owner.location)
    || (owner.location === 'ENCOUNTER' || owner.location === 'SUMMON_POOL') && !owner.encounterId?.trim())) throw new Error('Invalid physical copy owner');
  if (state.monsterDeck.some(id => state.ownership[id]?.location !== 'DECK')
    || Object.entries(state.ownership).some(([id, owner]) => owner.location === 'DECK' && !state.monsterDeck.includes(id))) throw new Error('Deck ownership differs');
  if (new Set(state.encounters.map(e => e.encounterId)).size !== state.encounters.length
    || state.encounters.filter(e => !e.returned).length > 1) throw new Error('Encounter identity duplicate');
  const roomIds = [...state.roomDeck, ...state.encounters.map(e => e.roomNumber)];
  if (roomIds.length !== 9 || roomIds.sort((a, b) => a - b).join(',') !== '1,2,3,4,5,6,7,8,9') throw new Error('Ordinary Room ownership differs');
  for (const encounter of state.encounters) {
    if (encounter.ruleSetVersion !== state.ruleSetVersion || encounter.tileId !== `ruins-tile-${encounter.roomNumber}`
      || encounter.largeReplacementRulingId !== state.largeReplacementRulingId) throw new Error('Encounter Tile/version mismatch');
    const tile = ruinsTile(encounter.tileId);
    const slots = encounter.monsters.flatMap(m => Array.from({ length: m.slots }, (_, i) => RUINS_STANCES.indexOf(m.stance) + i));
    if (new Set(encounter.monsters.map(m => m.copyId)).size !== encounter.monsters.length
      || slots.sort((a, b) => a - b).join(',') !== '0,1,2,3'
      || encounter.heroes.length !== 4 || new Set(encounter.heroes.map(h => h.heroId)).size !== 4
      || new Set(encounter.heroes.map(h => h.stance)).size !== 4
      || encounter.heroes.some(h => !RUINS_STANCES.includes(h.stance) || h.areaId !== tile.heroStartingStanceAreas[h.stance])
      || encounter.monsters.some(m => !RUINS_STANCES.includes(m.stance) || m.areaId !== tile.monsterStartingStanceAreas[m.stance])
      || encounter.initiativeCards.length !== 4 + encounter.monsters.length
      || new Set(encounter.initiativeCards.map(c => c.cardId)).size !== encounter.initiativeCards.length
      || encounter.initiativeCards.filter(c => c.side === 'hero').length !== 4
      || encounter.initiativeCards.filter(c => c.side === 'monster').length !== encounter.monsters.length) throw new Error('Invalid saved initial placement/initiative');
    if (state.ruleSetVersion === RUINS_V5) {
      const drawn = encounter.drawEvents.filter(event => event.type === 'DRAW').map(event => event.copyId);
      const replaced = encounter.drawEvents.filter(event => event.type === 'LARGE_REPLACEMENT').map(event => event.copyId);
      if (new Set(drawn).size !== drawn.length || replaced.length > 1 || replaced.some(id => !drawn.includes(id))
        || drawn.length !== encounter.monsters.length + replaced.length
        || drawn.some(id => !encounter.monsters.some(m => m.copyId === id) && !replaced.includes(id))
        || encounter.initiativeCards.some(card => ![
          ...encounter.heroes.map((_, i) => `${encounter.encounterId}:hero:${i + 1}`),
          ...encounter.monsters.map((_, i) => `${encounter.encounterId}:monster:${i + 1}`),
        ].includes(card.cardId))) throw new Error('v5 physical draw provenance differs');
    }
    for (const m of encounter.monsters) {
      const definition = ruinsMonster(m.definitionId, state.ruleSetVersion);
      const owner = state.ownership[m.copyId];
      if (!definition.physicalCopyIds.includes(m.copyId) || m.slots !== definition.stanceSlots
        || !encounter.returned && (owner.location !== 'ENCOUNTER' || owner.encounterId !== encounter.encounterId)
        || state.ruleSetVersion === RUINS_V5 && encounter.returned && owner.location === 'ENCOUNTER'
          && owner.encounterId === encounter.encounterId) throw new Error('Active Monster ownership differs');
    }
  }
  if (Object.entries(state.ownership).some(([id, owner]) => owner.location === 'ENCOUNTER'
    && !state.encounters.some(e => !e.returned && e.encounterId === owner.encounterId && e.monsters.some(m => m.copyId === id)))) throw new Error('Orphan encounter copy');
  if (Object.entries(state.ownership).some(([id, owner]) => owner.location === 'DISCARD'
    && !state.encounters.some(e => e.drawEvents.some(event => event.type === 'LARGE_REPLACEMENT' && event.copyId === id)))) throw new Error('Discard copy lacks printed replacement provenance');
  if (state.ruleSetVersion === RUINS_V5 && Object.entries(state.ownership).some(([id, owner]) => owner.location === 'DISCARD'
    && !state.encounters.some(e => !e.returned && e.drawEvents.some(event => event.type === 'LARGE_REPLACEMENT' && event.copyId === id)))) {
    throw new Error('v5 replacement discard persisted after Battle return');
  }
  if (state.ruleSetVersion === RUINS_V5 && state.encounters.some(e => e.drawEvents.some(event => {
    if (event.type !== 'LARGE_REPLACEMENT') return false;
    const owner = state.ownership[event.copyId];
    return e.returned ? owner.location === 'DISCARD' || owner.location === 'ENCOUNTER' && owner.encounterId === e.encounterId
      : owner.location !== 'DISCARD';
  }))) {
    throw new Error('v5 replacement discard ownership differs from encounter lifecycle');
  }
}
