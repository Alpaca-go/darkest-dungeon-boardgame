import type { BattleState } from '../../types';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../campaign';
import { commitQuestSelection } from '../commands/quest';
import { getQuestPool, runtimeContentContext } from '../../data/content-selector';
import { explicitlySelectRuinsV4 } from '../rules/ruins-v4';
import { explicitlySelectRuinsV5 } from '../rules/ruins-v5';
import { RUINS_STANCES, RUINS_V5 } from '../../types/ruins-executable';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter, type OrdinaryRuinsEncounter } from './encounter-draw';
import { initializeOrdinaryRuinsBattle } from './battle-runtime';
import { assignOrdinaryBoneFigures, createBoneFigureSupply } from './physical-supply';

/** Source definitions and physical draws, with controlled campaign prerequisites for executor tests. */
export function drawnRuinsFixture(matches: (encounter: OrdinaryRuinsEncounter) => boolean, level: 1 | 2 | 3 = 3) {
  const chosen = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'hellion']));
  const party = { ...chosen, heroes: chosen.heroes.map((hero, index) => ({ ...hero, stance: RUINS_STANCES[index] })) };
  const stances = Object.fromEntries(party.heroes.map(hero => [hero.instanceId, hero.stance]));
  const selected = explicitlySelectRuinsV5(explicitlySelectRuinsV4({ ...party, gamePhase: 'quest-select' }, 'before-draw'), 'before-draw');
  const quest = commitQuestSelection(selected, getQuestPool(runtimeContentContext(selected))[0].id);
  if (!quest.ok) throw new Error(quest.error!);
  for (let seed = 1; seed <= 2000; seed++) {
    let draw;
    try { draw = drawOrdinaryRuinsEncounter(createRuinsDrawState(level, seed, RUINS_V5), 'source-executor', stances); }
    catch (error) {
      // Search only executable source layouts; the omitted initial Large policy is separately reproduced and blocks promotion.
      if (String(error).includes('Official initial placement could not bind')) continue;
      throw error;
    }
    if (!matches(draw.encounters[0])) continue;
    const campaign = { ...quest.campaign, ruinsDrawState: draw };
    return { ...campaign, battle: initializeOrdinaryRuinsBattle(campaign, draw, 'source-executor'),
      ruinsBoneFigureSupply: assignOrdinaryBoneFigures(createBoneFigureSupply(), draw, draw.encounters[0]), gamePhase: 'battle' as const };
  }
  throw new Error('Source encounter seed not found');
}

/** Relocate only for an isolated rule test; both saved spatial ledgers remain identical. */
export function fixtureArea(battle: BattleState, unitId: string, areaId: string): void {
  battle.ruinsContext!.placements[unitId] = areaId;
  battle.largeMovementContract!.placements[unitId] = areaId;
}
