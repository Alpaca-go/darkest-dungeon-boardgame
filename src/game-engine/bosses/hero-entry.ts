import type {BossDefinitionContract} from '../../types/boss-runtime';
import type {Stance} from '../../types';

export const BOSS_ENTRY_STANCES: readonly Stance[] = ['aggressive','defensive','ranged','support'];
/** The same Tile-by-Stance deployment semantics as ordinary Ruins encounters. */
export function resolveBossHeroStartingArea(definition: BossDefinitionContract, heroStance: Stance): string {
  if(!BOSS_ENTRY_STANCES.includes(heroStance))throw new Error('Invalid Hero entry Stance');
  let area: string | null;
  if (definition.heroStartingStanceAreas) {
    if (!BOSS_ENTRY_STANCES.includes(heroStance) || Object.keys(definition.heroStartingStanceAreas).sort().join(',') !== [...BOSS_ENTRY_STANCES].sort().join(','))
      throw new Error('Invalid Hero entry Stance contract');
    area=definition.heroStartingStanceAreas[heroStance];
  } else {
    if (definition.family==='prophet') throw new Error('Prophet requires official stance-aware Hero entry');
    area=definition.heroStartArea;
  }
  if (!area || !definition.areas.some(a=>a.id===area)) throw new Error('Hero starting Area is unbound');
  return area;
}
