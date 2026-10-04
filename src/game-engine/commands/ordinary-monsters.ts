import type { CampaignState } from '../../types';
import type { ProductionMonsterEncounterManifest } from '../monsters/production-battle-types';
import { initializeProductionMonsterBattle, initializeProductionRuinsBattle } from '../monsters/production-encounter';
import { resolveProductionMonsterChoice, validateProductionMonsterBattle, continueProductionMonsterExecution, withProductionMonsterSources } from '../monsters/production-battle-runtime';
import { advanceTurn } from '../battle';
import { settleBattleState } from './battle';
import { beginOrdinaryRuinsBattle } from '../ruins/battle-runtime';
import { resolveRuinsRoomMovementChoice } from '../ruins/room-runtime';
import { resolveRuinsPrintedMovementChoice } from '../ruins/printed-effect-runtime';
import { resolveRuinsLargeDisplacement } from '../ruins/movement-runtime';

export function beginExplicitProductionMonsterEncounter(campaign: CampaignState, manifest: ProductionMonsterEncounterManifest): CampaignState {
  if (campaign.battle?.status === 'active') throw new Error('An active Battle already exists');
  const roster = campaign.heroes.filter(h => !h.dead).map(h => h.instanceId);
  if (manifest.heroes.length !== roster.length || manifest.heroes.some(h => !roster.includes(h.unit.sourceId))) throw new Error('Explicit encounter campaign Hero roster differs');
  return settleBattleState({ ...campaign, gamePhase: 'battle', battle: advanceTurn(initializeProductionMonsterBattle(manifest)) }).campaign;
}
export function beginProductionRuinsEncounter(campaign: CampaignState, encounterId: string): CampaignState {
  if (campaign.battle?.status === 'active' || !campaign.ruinsDrawState) throw new Error('Production Ruins encounter unavailable');
  // Reuse accepted figure reservation and spawn transactions before selecting the successor action route.
  const entered = beginOrdinaryRuinsBattle(campaign, encounterId);
  return settleBattleState({ ...entered, battle: advanceTurn(initializeProductionRuinsBattle(entered, entered.ruinsDrawState!, encounterId)) }).campaign;
}
export function commitProductionMonsterChoice(campaign: CampaignState, choiceId: string, selectedId: string): CampaignState {
  if (!campaign.battle) throw new Error('Production Battle absent');
  let battle = campaign.battle;
  const roomChoice = battle.ruinsContext?.pendingChoice;
  if (roomChoice) {
    if (roomChoice.choiceId !== choiceId || !roomChoice.candidateIds.includes(selectedId)) throw new Error('Production room choice unavailable');
    const resolve = roomChoice.kind === 'LARGE_DISPLACEMENT' ? resolveRuinsLargeDisplacement
      : roomChoice.kind === 'PRINTED_SHUFFLE' ? resolveRuinsPrintedMovementChoice : resolveRuinsRoomMovementChoice;
    battle = withProductionMonsterSources(structuredClone(battle), b => continueProductionMonsterExecution(resolve(b, choiceId, selectedId)));
  } else battle = resolveProductionMonsterChoice(battle, choiceId, selectedId);
  validateProductionMonsterBattle(battle);
  if (!battle.pendingMonsterAttack && !battle.productionMonsterContext!.pendingExecution && !battle.productionMonsterContext!.pendingChoice) battle = advanceTurn(battle);
  return settleBattleState({ ...campaign, battle }).campaign;
}
