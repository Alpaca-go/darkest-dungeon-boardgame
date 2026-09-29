import type { BattleState } from '../../types';
import { THREAT_DEPENDENCY_V3, type LargeMovementContractState } from '../../types/necromancer-dependencies';

export const LARGE_DISPLACEMENT_RULING = 'C1C32R2-LARGE-SINGLE-DISPLACEMENT-OVERFLOW-v1';
const alive = (b: BattleState) => [...b.heroes, ...b.monsters].filter(u => u.isAlive);
function used(b: BattleState, s: LargeMovementContractState, area: string) {
  return alive(b).filter(u => s.placements[u.id] === area).reduce((n, u) => n + s.occupiedSpaces[u.id], 0);
}
function event(s: LargeMovementContractState, battleId: string, type: string, result: unknown, parentEventId: string | null = null) {
  const eventId = `${battleId}:large:${++s.sequence}`;
  s.events.push({ eventId, parentEventId, type, result });
  return eventId;
}
function normalize(b: BattleState, s: LargeMovementContractState) {
  s.overflow = s.overflow.filter(g => used(b, s, g.areaId) > s.areas.find(a => a.id === g.areaId)!.capacity);
}
export function validateLargeMovementContract(b: BattleState): void {
  const s = b.largeMovementContract;
  if (!s) return;
  if (s.ruleSetVersion !== THREAT_DEPENDENCY_V3 || s.rulingId !== LARGE_DISPLACEMENT_RULING
    || s.sequence !== s.events.length || new Set(s.areas.map(a => a.id)).size !== s.areas.length) throw new Error('Invalid Large contract provenance');
  if (b.bossEncounter) throw new Error('Historical Boss encounters cannot acquire the successor movement contract');
  for (const a of s.areas) {
    if (!Number.isInteger(a.capacity) || a.capacity < 1 || new Set(a.adjacent).size !== a.adjacent.length
      || a.adjacent.includes(a.id) || a.adjacent.some(id => !s.areas.find(x => x.id === id)?.adjacent.includes(a.id))) throw new Error('Invalid Area topology');
    const grants = s.overflow.filter(g => g.areaId === a.id);
    if (grants.length > 1 || grants.some(g => g.extraSpaces !== 1 || s.placements[g.entrantId] !== a.id
      || s.occupiedSpaces[g.entrantId] !== 2 || !s.events.some(e => e.eventId === g.eventId && e.type === 'LARGE_DISPLACED'
        && (e.result as {actor?: string; to?: string})?.actor === g.entrantId && (e.result as {to?: string})?.to === a.id))
      || used(b, s, a.id) > a.capacity + (grants[0]?.extraSpaces ?? 0)) throw new Error('Unlicensed Area overflow');
  }
  for (const u of alive(b)) if (![1, 2].includes(s.occupiedSpaces[u.id]) || !s.areas.some(a => a.id === s.placements[u.id])) throw new Error('Unbound character occupancy');
  s.events.forEach((e, i) => {
    if (e.eventId !== `${b.battleId}:large:${i + 1}` || (e.parentEventId && !s.events.slice(0, i).some(p => p.eventId === e.parentEventId))) throw new Error('Invalid Large causal event');
  });
  if (s.pendingChoice) {
    const p = s.pendingChoice;
    if (p.ruleSetVersion !== s.ruleSetVersion || p.choiceId !== `${p.parentEventId}:choice`
      || !s.events.some(e => e.eventId === p.parentEventId && e.type === 'LARGE_MOVE_REQUESTED')
      || p.from !== s.placements[p.actorId] || !p.candidateIds.length
      || JSON.stringify(p.candidateIds) !== JSON.stringify(displacements(b, s, p.actorId, p.targetId, p.to))) throw new Error('Invalid saved displacement candidates');
  }
}
/** Explicit opt-in before initialization; v1/v2 encounters and replays never migrate. */
export function bindLargeMovementContract(b: BattleState, version: string,
  input: Pick<LargeMovementContractState, 'areas' | 'placements' | 'occupiedSpaces'>): BattleState {
  if (version !== THREAT_DEPENDENCY_V3 || b.bossEncounter || b.largeMovementContract || b.initiativeIndex !== -1
    || b.round !== 1 || b.activeActorId || b.status !== 'active') throw new Error('Large contract migration is pre-encounter only');
  const next = structuredClone(b);
  next.largeMovementContract = { ...structuredClone(input), ruleSetVersion: THREAT_DEPENDENCY_V3,
    rulingId: LARGE_DISPLACEMENT_RULING, sequence: 0, overflow: [], pendingChoice: null, events: [] };
  validateLargeMovementContract(next);
  return next;
}
function displacements(b: BattleState, s: LargeMovementContractState, actor: string, target: string, destination: string) {
  const area = s.areas.find(a => a.id === destination)!;
  const total = used(b, s, destination) + 2;
  return alive(b).filter(u => s.placements[u.id] === destination && u.id !== actor && u.id !== target)
    .flatMap(u => area.adjacent.filter(id => {
      const dest = s.areas.find(a => a.id === id)!;
      // The entrant vacates its source as part of the same atomic move.
      const occupancy = used(b, s, id) - (s.placements[actor] === id ? 2 : 0);
      return !s.overflow.some(g => g.areaId === id) && occupancy + s.occupiedSpaces[u.id] <= dest.capacity
        && total - s.occupiedSpaces[u.id] <= area.capacity + 1;
    }).map(id => JSON.stringify([u.id, id]))).sort();
}
function commitDisplacement(b: BattleState, s: LargeMovementContractState, actor: string, to: string, candidate: string, parent: string) {
  const [displacedId, destination] = JSON.parse(candidate) as string[];
  s.placements[actor] = to; s.placements[displacedId] = destination;
  const id = event(s, b.battleId, 'LARGE_DISPLACED', { actor, to, displacedId, destination, candidate }, parent);
  const extra = used(b, s, to) - s.areas.find(a => a.id === to)!.capacity;
  if (extra > 0) s.overflow.push({ areaId: to, entrantId: actor, eventId: id, extraSpaces: extra });
  s.pendingChoice = null; normalize(b, s);
}
/** Movement endpoint contract; callers separately validate Speed/path/Range. Consumes no RNG. */
export function beginLargeMovement(b: BattleState, actorId: string, targetId: string, to: string): BattleState {
  validateLargeMovementContract(b);
  const next = structuredClone(b), s = next.largeMovementContract;
  if (!s || s.pendingChoice || !alive(next).some(u => u.id === actorId) || !alive(next).some(u => u.id === targetId)
    || s.occupiedSpaces[actorId] !== 2 || s.placements[actorId] === to || !s.areas.some(a => a.id === to)) throw new Error('Invalid Large move');
  normalize(next, s);
  const area = s.areas.find(a => a.id === to)!;
  const parent = event(s, next.battleId, 'LARGE_MOVE_REQUESTED', { actorId, targetId, from: s.placements[actorId], to });
  if (!s.overflow.some(g => g.areaId === to) && used(next, s, to) + 2 <= area.capacity) {
    s.placements[actorId] = to; event(s, next.battleId, 'LARGE_MOVED', { actorId, to }, parent);
  } else {
    const candidates = s.overflow.some(g => g.areaId === to) ? [] : displacements(next, s, actorId, targetId, to);
    if (!candidates.length) event(s, next.battleId, 'LARGE_MOVEMENT_BLOCKED', { actorId, to }, parent);
    else if (candidates.length === 1) commitDisplacement(next, s, actorId, to, candidates[0], parent);
    else s.pendingChoice = { choiceId: `${parent}:choice`, actorId, targetId, from: s.placements[actorId], to,
      candidateIds: candidates, parentEventId: parent, ruleSetVersion: s.ruleSetVersion };
  }
  normalize(next, s); validateLargeMovementContract(next); return next;
}
export function resolveLargeDisplacement(b: BattleState, choiceId: string, selectedId: string): BattleState {
  validateLargeMovementContract(b);
  const next = structuredClone(b), s = next.largeMovementContract!, p = s?.pendingChoice;
  if (!p || p.choiceId !== choiceId || !p.candidateIds.includes(selectedId)) throw new Error('Invalid displacement choice');
  commitDisplacement(next, s, p.actorId, p.to, selectedId, p.parentEventId);
  validateLargeMovementContract(next); return next;
}
