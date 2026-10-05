import type { BattleState, CampaignState } from '../../types';
import { bindNecromancerFigures, validateBoneFigureSupply, validateNecromancerFigures } from '../ruins/physical-supply';
import { validateThreatCheckpoint } from './threat-checkpoint';

/** Reattach available physical inventory to the same settled production checkpoint.
 * The frozen initial-binding helper and its event history remain unchanged.
 */
export function bindProductionCheckpointFigures(campaign: CampaignState, battle: BattleState): BattleState {
  if (battle.bossEncounter?.bossFamily !== 'necromancer') return battle;
  const supply = campaign.ruinsBoneFigureSupply;
  if (!supply) return battle;
  const encounter = battle.bossEncounter;
  if (!encounter) throw new Error('Production checkpoint physical binding requires an encounter');
  if (encounter.eventSequence === 1) return bindNecromancerFigures(battle, supply, campaign.ruinsDrawState);
  validateThreatCheckpoint(campaign, encounter);
  if (!encounter.checkpointContext?.heroDodgeBindings || encounter.pendingChoice || battle.monsters.length
    || battle.necromancerFigureBinding || Object.values(encounter.summonSupply).some(entry =>
      entry.tokens.some(token => token.state !== 'available' && token.state !== 'permanentlyRemoved')))
    throw new Error('Physical checkpoint resumption requires a settled production Threat');
  validateBoneFigureSupply(supply, campaign.ruinsDrawState);
  const next = structuredClone(battle);
  next.necromancerFigureBinding = {
    encounterId: encounter.checkpointContext.encounterId,
    supply: structuredClone(supply), tokenFigures: {}, tokenCards: {},
    ...(campaign.ruinsDrawState ? { draw: structuredClone(campaign.ruinsDrawState) } : {}),
  };
  validateNecromancerFigures(next);
  return next;
}
