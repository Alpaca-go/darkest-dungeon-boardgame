import type {BattleState} from '../../types';
import {encounterRuleDependencies} from '../bosses/definitions';
import {PROPHET_ACTOR_CAPACITY_VERSION} from '../prophet/production-definition';
export interface ActorOccupancyState {
  ruleSetVersion: string;
  placements: Record<string,string>;
  occupiedSpaces: Record<string,number>;
}
export function actorCapacity(area: {capacity: number}): number {
  if (!Number.isInteger(area.capacity) || area.capacity<1) throw new Error('Invalid Actor capacity');
  return area.capacity;
}
export function occupiedSpaces(actor: {large: boolean}): number { return actor.large?2:1; }
export function canEnterArea(area: {capacity: number}, occupants: Array<{large: boolean}>, entrant: {large: boolean}): boolean {
  return occupants.reduce((n,a)=>n+occupiedSpaces(a),0)+occupiedSpaces(entrant)<=actorCapacity(area);
}
/** Pews are physical markers, absent from BattleActor lists. No displacement or overflow license. */
export function validateActorOccupancy(b: BattleState): void {
  const e=b.bossEncounter, state=b.actorOccupancy;
  if (!state) {
    if (e?.bossFamily==='prophet' && e.side==='ABILITY') throw new Error('Prophet Actor occupancy absent');
    return;
  }
  if (!e || e.bossFamily!=='prophet' || state.ruleSetVersion!==PROPHET_ACTOR_CAPACITY_VERSION
    || encounterRuleDependencies(e).actorOccupancyRuleSetVersion!==state.ruleSetVersion || b.largeMovementContract) throw new Error('Unlicensed Actor occupancy contract');
  const allActors=[...b.heroes,...b.monsters],actors=allActors.filter(a=>a.isAlive);
  if (new Set(allActors.map(a=>a.id)).size!==allActors.length
    || Object.keys(state.placements).some(id=>!allActors.some(a=>a.id===id))
    || Object.keys(state.occupiedSpaces).some(id=>!allActors.some(a=>a.id===id))) throw new Error('Unknown Actor occupancy identity');
  for (const a of actors) {
    const definition=a.side==='monster' && a.id!==e.bossState.actorId?e.spawnDefinitions[a.sourceId]:null;
    if (a.side==='monster' && a.id!==e.bossState.actorId && !definition) throw new Error('Unbound Monster footprint');
    const large=a.side==='monster' && (a.id===e.bossState.actorId || definition?.large===true);
    if (state.occupiedSpaces[a.id]!==occupiedSpaces({large}) || !e.definition.areas.some(area=>area.id===state.placements[a.id])
      || state.placements[a.id]!==e.placements[a.id]) throw new Error('Actor occupancy binding mismatch');
  }
  for (const area of e.definition.areas) if (actors.filter(a=>state.placements[a.id]===area.id).reduce((n,a)=>n+state.occupiedSpaces[a.id],0)>actorCapacity(area)) throw new Error('Actor capacity exceeded');
}
