import monsterData from '../../../docs/data/complete-edition/c1c32r2a-ruins-monster-executable-definitions.json';
import tileData from '../../../docs/data/complete-edition/c1c32r2a-ruins-tile-area-definitions.json';
import roomData from '../../../docs/data/complete-edition/c1c32r2a-ruins-room-effect-definitions.json';
import type { RuinsMonster, RuinsRoom, RuinsStance, RuinsTile, StanceBehavior } from '../../types/ruins-executable';
import { RUINS_V4, RUINS_V5, RUINS_V6, RUINS_STANCES } from '../../types/ruins-executable';

export function ruinsMonsterDefinitions(version: string): RuinsMonster[] {
  if (version !== RUINS_V4 && version !== RUINS_V5 && version !== RUINS_V6) throw new Error('Ruins successor version required');
  const definitions = structuredClone(monsterData.definitions) as RuinsMonster[];
  return version === RUINS_V6 ? definitions.map(d => ({ ...d, status: 'EXECUTABLE_PRODUCTION_DEFINITION', executable: true })) : definitions;
}
export function ruinsMonster(id: string, version: string): RuinsMonster {
  const definition = ruinsMonsterDefinitions(version).find(d => d.canonicalId === id);
  if (!definition) throw new Error('Official Ruins Monster unavailable');
  return definition;
}
export function ruinsTile(id: string): RuinsTile {
  const tile = tileData.tiles.find(t => t.tileId === id);
  if (!tile) throw new Error('Ordinary Ruins Tile unavailable');
  return structuredClone(tile) as RuinsTile;
}
export function ruinsRoom(roomNumber: number): RuinsRoom {
  const room = roomData.rooms.find(r => r.roomNumber === roomNumber);
  if (!room) throw new Error('Ordinary Ruins Room unavailable');
  return structuredClone(room) as RuinsRoom;
}
export function resolveRuinsStance(definition: RuinsMonster, stance: RuinsStance): Exclude<StanceBehavior, { kind: 'INHERITS' }> {
  const visited = new Set<RuinsStance>();
  let current = stance;
  while (!visited.has(current)) {
    visited.add(current);
    const behavior = definition.stanceBehavior[current];
    if (behavior.kind !== 'INHERITS') return structuredClone(behavior);
    current = behavior.stance;
  }
  throw new Error('Cyclic printed Stance inheritance');
}
export function validateRuinsSourceContracts(): void {
  const definitions = ruinsMonsterDefinitions(RUINS_V4);
  if (definitions.length !== 24 || new Set(definitions.map(d => d.canonicalId)).size !== 24) throw new Error('Monster census mismatch');
  const copies = definitions.flatMap(d => d.physicalCopyIds);
  if (copies.length !== 62 || new Set(copies).size !== copies.length) throw new Error('Physical copy census mismatch');
  for (const d of definitions) {
    if (d.copyCount !== d.physicalCopyIds.length || d.life <= 0 || d.speed < 0 || d.dodge < 0
      || d.occupiedSpaces !== (d.size === 'LARGE' ? 2 : 1)) throw new Error('Invalid printed Monster statistics');
    if (!d.sourceReferences.length || d.sourceReferences.some(s => !s.visualReview || !s.sha256 || !s.location || !s.page)) throw new Error('Printed provenance missing');
    for (const stance of RUINS_STANCES) {
      const behavior = resolveRuinsStance(d, stance);
      if (behavior.kind === 'NO_ACTION') continue;
      const covered = behavior.rows.flatMap(row => Array.from({ length: row.max - row.min + 1 }, (_, i) => row.min + i));
      if (covered.join(',') !== '1,2,3,4,5,6,7,8,9,10'
        || behavior.rows.some(row => !d.skills.some(s => s.number === row.skill))) throw new Error('Unbound printed Skill table');
    }
  }
  for (const tile of tileData.tiles as RuinsTile[]) {
    const ids = tile.areas.map(a => a.id);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate Area');
    for (const area of tile.areas) {
      if (!Number.isInteger(area.capacity) || area.capacity < 2 || area.boundary.length < 3) throw new Error('Invalid printed Area');
      if (area.adjacent.some(id => !tile.areas.find(a => a.id === id)?.adjacent.includes(area.id))) throw new Error('Asymmetric Area adjacency');
    }
    for (const starts of [tile.heroStartingStanceAreas, tile.monsterStartingStanceAreas]) {
      if (RUINS_STANCES.some(s => !ids.includes(starts[s]))) throw new Error('Unbound starting Area');
    }
    if (ruinsRoom(tile.roomNumber).rules.some(rule => rule.areas.some(id => !ids.includes(id)))) throw new Error('Room Area binding missing');
  }
}
