import { RUINS_V6 } from '../../types/ruins-executable';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter } from '../ruins/encounter-draw';
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
  const battle = initializeProductionMonsterBattle(manifest);
  battle.productionMonsterContext!.playerRouteVersion = 'C3E-MONSTER-PLAYER-PATH-v1';
  return settleBattleState({ ...campaign, gamePhase: 'battle', battle: advanceTurn(battle) }).campaign;
}
export function beginProductionRuinsEncounter(campaign: CampaignState, encounterId: string): CampaignState {
  if (campaign.battle?.status === 'active' || !campaign.ruinsDrawState) throw new Error('Production Ruins encounter unavailable');
  // Reuse accepted figure reservation and spawn transactions before selecting the successor action route.
  const entered = beginOrdinaryRuinsBattle(campaign, encounterId);
  const battle = initializeProductionRuinsBattle(entered, entered.ruinsDrawState!, encounterId);
  battle.productionMonsterContext!.playerRouteVersion = 'C3E-MONSTER-PLAYER-PATH-v1';
  return settleBattleState({ ...entered, battle: advanceTurn(battle) }).campaign;
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

/** Explicit successor selection; never inferred when restoring historical saves. */
export function selectProductionMonsterPlayerRoute(c: CampaignState): CampaignState {
  if (c.battle || c.bossEncounterCheckpoint || c.ruinsDrawState || !['quest-select', 'hamlet'].includes(c.gamePhase)) throw new Error('Select Monster route before encounter initialization');
  return { ...c, monsterPlayerRouteVersion: 'C3E-MONSTER-PLAYER-PATH-v1' };
}

export function hasProductionMonsterPlayerRoute(c: CampaignState): boolean {
  return c.monsterPlayerRouteVersion === 'C3E-MONSTER-PLAYER-PATH-v1' && c.ruinsRuleSetSelection?.ruleSetVersion === RUINS_V6
    && c.currentQuestId !== 'face-the-threat' && !c.battle;
}
export function enterProductionMonsterRoom(c: CampaignState, roomId: string): CampaignState {
  if (!hasProductionMonsterPlayerRoute(c) || !c.dungeon || c.dungeon.currentRoomId !== roomId) throw new Error('Production Monster Room unavailable');
  // Source-closed ordinary physical deck only; no expansion eligibility inference.
  const seed = Array.from(c.id + c.dungeon.questRunId).reduce((n, ch) => Math.imul(n ^ ch.charCodeAt(0),16777619) >>> 0,2166136261);
  const draw = c.ruinsDrawState ?? createRuinsDrawState(c.campaignProgress.campaignLevel as 1|2|3,seed,RUINS_V6);
  const encounterId = c.dungeon.questRunId + ':monster:' + roomId;
  return beginProductionRuinsEncounter({ ...c, ruinsDrawState: drawOrdinaryRuinsEncounter(draw,encounterId,
    Object.fromEntries(c.heroes.filter(h=>!h.dead).map(h=>[h.instanceId,h.stance]))) },encounterId);
}
