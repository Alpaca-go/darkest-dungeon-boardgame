import type { CampaignState, Stance } from '../../types';
import { RUINS_STANCES } from '../../types/ruins-executable';

/** Player-selected deployment before Quest initialization. Existing encounters never migrate. */
export function selectPartyDeployment(c: CampaignState, heroInstanceId: string, stance: Stance): CampaignState {
  if (c.gamePhase !== 'quest-select' || c.battle || c.bossEncounterCheckpoint || c.pendingDungeonTrinketAction
    || !RUINS_STANCES.includes(stance) || !c.heroes.some(h => h.instanceId === heroInstanceId && !h.dead))
    throw new Error('Party deployment is available before Quest selection');
  return { ...c, heroes: c.heroes.map(h => h.instanceId === heroInstanceId ? { ...h, stance } : h) };
}
