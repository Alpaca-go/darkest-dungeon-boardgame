import type {BattleState} from '../../types';
/** Read the accepted encounter topology without licensing another family's overflow rules. */
export function heroActionTopology(b:BattleState) {
 if(b.bossEncounter) {
  const e=b.bossEncounter;
  return {placements:e.placements,occupiedSpaces:b.actorOccupancy?.occupiedSpaces??Object.fromEntries([...b.heroes,...b.monsters].map(u=>[u.id,u.side==='monster'?(e.spawnDefinitions[u.sourceId]?.occupiedSlots??1):1])),
   areas:e.definition.areas.map(a=>({...a,adjacent:e.definition.adjacency.filter(pair=>pair.includes(a.id)).flatMap(pair=>pair.filter(id=>id!==a.id))}))};
 }
 if(!b.largeMovementContract)throw new Error('Production activation requires shared Area topology');
 return b.largeMovementContract;
}
