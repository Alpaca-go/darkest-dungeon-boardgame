import type { BattleState, CampaignState } from '../../types';
import type { BossEncounterState } from '../../types/boss-runtime';
import { makeHeroUnit } from '../battle';
import { applyBossRuntimeInput, assertBossEncounter, withBossEncounterSources } from '../bosses/foundation';
import { resolveBossDefinition } from '../bosses/definitions';
import { rollD10 } from './act-four/rng';
import { applyNecromancerPreparationDayGraveyard } from './necromancer-graveyard';

export interface NecromancerPreparationDay {
  schemaVersion: 1;
  hamletVisitId: string;
  sourceQuestRunId: string;
  status: 'PENDING_TIE' | 'PENDING_VISIT' | 'PENDING_LEVEL_II_EFFECT' | 'COMMITTED';
  checkpoint: BossEncounterState;
  effectChoice: null | { choiceId: string; candidateIds: ['USE_EFFECT', 'DECLINE_EFFECT']; parentEventId: string; ruleSetVersion: string };
}

function shell(campaign: CampaignState, checkpoint: BossEncounterState): BattleState {
  return { battleId: checkpoint.checkpointContext!.battleId, sourceRoomId: checkpoint.roomId, status: 'active',
    round: checkpoint.round, maxRounds: 4, heroes: campaign.heroes.filter(h => !h.dead && checkpoint.checkpointContext!.heroDodge[`u_${h.instanceId}`] !== undefined).map((h, i) => ({
      ...makeHeroUnit(h, i, campaign), bossCombatDodge: checkpoint.checkpointContext!.heroDodge[`u_${h.instanceId}`],
      heroDodgeBinding: checkpoint.checkpointContext!.heroDodgeBindings?.[`u_${h.instanceId}`],
    })),
    monsters: [], initiativeOrder: [], initiativeIndex: -1, activeActorId: null, currentActionPoints: 0,
    selectedSkillId: null, selectedTargetId: null, battleLog: [], rewards: { gold: 0 }, bossEncounter: structuredClone(checkpoint) };
}

/** Detach the settled checkpoint before the old Quest dungeon is removed. Ownership stays with Room storage. */
export function checkpointForPreparationDay(campaign: CampaignState, questRunId: string): BossEncounterState | null {
  const checkpoint = campaign.bossEncounterCheckpoint
    ?? campaign.bossRoomReturnHistory?.find(r => r.questRunId === questRunId)?.encounter;
  if (!checkpoint || checkpoint.bossFamily !== 'necromancer' || checkpoint.bossLevel === 1 || checkpoint.side !== 'THREAT'
    || checkpoint.checkpointContext?.questRunId !== questRunId || checkpoint.checkpointContext.threatId !== campaign.campaignProgress.activeThreatId) return null;
  if (checkpoint.phase !== 'THREAT_ACTIVE' || checkpoint.activeSummons.length || checkpoint.bossState.actorId) throw new Error('Preparation requires a settled Threat checkpoint');
  return structuredClone(checkpoint);
}

/** Existing saved selection is retained. Only an unconsumed checkpoint draws the four initial rolls. */
export function enterNecromancerPreparationDay(campaign: CampaignState, saved: BossEncounterState | null): CampaignState {
  if (!saved || campaign.gamePhase !== 'hamlet' || campaign.hamlet.currentDay !== 1) return campaign;
  if (campaign.necromancerPreparationDay?.checkpoint.checkpointContext?.encounterId === saved.checkpointContext?.encounterId) return campaign;
  const working = shell(campaign, saved);
  let checkpoint = saved;
  if (!saved.threatState.preparationDayConsumed) {
    let rolls: Record<string, number> = {};
    withBossEncounterSources(working, (b, rng) => {
      rolls = Object.fromEntries(b.heroes.map(h => [h.id, rollD10(rng)]));
      return b;
    });
    checkpoint = applyBossRuntimeInput(working, { type: 'PREPARATION_DAY', rolls }).bossEncounter!;
  }
  const next: CampaignState = { ...campaign, bossEncounterCheckpoint: null, necromancerPreparationDay: {
    schemaVersion: 1, hamletVisitId: campaign.hamlet.visitId, sourceQuestRunId: saved.checkpointContext!.questRunId,
    status: checkpoint.pendingChoice ? 'PENDING_TIE' : 'PENDING_VISIT', checkpoint, effectChoice: null,
  } };
  validateNecromancerPreparationDay(next);
  return next;
}

export function chooseNecromancerPreparationHero(campaign: CampaignState, choiceId: string, selectedId: string): CampaignState {
  validateNecromancerPreparationDay(campaign);
  const preparation = campaign.necromancerPreparationDay;
  if (!preparation || preparation.status !== 'PENDING_TIE') throw new Error('No Preparation Day tie');
  const checkpoint = applyBossRuntimeInput(shell(campaign, preparation.checkpoint), { type: 'CHOICE', choiceId, selectedId }).bossEncounter!;
  return { ...campaign, necromancerPreparationDay: { ...preparation, checkpoint, status: 'PENDING_VISIT' } };
}

export function beginNecromancerGraveyardVisit(campaign: CampaignState): CampaignState {
  validateNecromancerPreparationDay(campaign);
  const preparation = campaign.necromancerPreparationDay;
  if (!preparation || preparation.status !== 'PENDING_VISIT') throw new Error('No pending Graveyard visit');
  if (preparation.checkpoint.bossLevel === 3) return commitNecromancerGraveyardVisit(campaign, false);
  const parentEventId = preparation.checkpoint.events.find(e => e.eventType === 'LOWEST_ROLL')!.eventId;
  return { ...campaign, necromancerPreparationDay: { ...preparation, status: 'PENDING_LEVEL_II_EFFECT', effectChoice: {
    choiceId: `${parentEventId}:graveyard-effect`, candidateIds: ['USE_EFFECT', 'DECLINE_EFFECT'], parentEventId,
    ruleSetVersion: preparation.checkpoint.ruleSetVersion,
  } } };
}

/** The accepted campaign transaction remains the sole owner of the Virtue draw and day consumption. */
export function commitNecromancerGraveyardVisit(campaign: CampaignState, useEffect: boolean): CampaignState {
  validateNecromancerPreparationDay(campaign);
  const preparation = campaign.necromancerPreparationDay;
  if (!preparation || preparation.status === 'PENDING_TIE' || preparation.status === 'PENDING_VISIT' && preparation.checkpoint.bossLevel !== 3) throw new Error('Graveyard choice unavailable');
  const applied = applyNecromancerPreparationDayGraveyard({ ...campaign, bossEncounterCheckpoint: preparation.checkpoint }, useEffect);
  const next: CampaignState = { ...applied, bossEncounterCheckpoint: campaign.bossEncounterCheckpoint,
    necromancerPreparationDay: { ...preparation, status: 'COMMITTED', effectChoice: null, checkpoint: applied.bossEncounterCheckpoint! } };
  validateNecromancerPreparationDay(next);
  return next;
}

/** Lock all first-day actions while tie selection is pending; then lock only the selected Hero. */
export function preparationDayActionBlocked(campaign: CampaignState, heroInstanceId?: string): boolean {
  const preparation = campaign.necromancerPreparationDay;
  if (!preparation || preparation.status === 'COMMITTED' || campaign.gamePhase !== 'hamlet' || campaign.hamlet.currentDay !== 1) return false;
  return !heroInstanceId || preparation.status === 'PENDING_TIE' || preparation.checkpoint.threatState.forcedHeroId === `u_${heroInstanceId}`;
}

export function validateNecromancerPreparationDay(campaign: Partial<CampaignState>): void {
  const preparation = campaign.necromancerPreparationDay;
  if (preparation === undefined) return;
  const checkpoint = preparation?.checkpoint, ctx = checkpoint?.checkpointContext;
  if (!checkpoint || !ctx || preparation.schemaVersion !== 1 || checkpoint.bossFamily !== 'necromancer'
    || ![2, 3].includes(checkpoint.bossLevel) || checkpoint.side !== 'THREAT' || !checkpoint.threatState.preparationDayConsumed
    || ctx.campaignId !== campaign.id || ctx.questRunId !== preparation.sourceQuestRunId
    || ctx.encounterId !== `${campaign.id}:${ctx.questRunId}:necromancer:${checkpoint.bossLevel}`
    || ctx.definitionVersion !== checkpoint.ruleSetVersion || ctx.battleId !== `${ctx.questRunId}:boss`
    || checkpoint.phase !== 'THREAT_ACTIVE' || checkpoint.bossState.actorId || checkpoint.activeSummons.length
    || checkpoint.events.some(e => e.ruleSetVersion !== checkpoint.ruleSetVersion)
    || JSON.stringify(checkpoint.definition) !== JSON.stringify(resolveBossDefinition('necromancer', checkpoint.bossLevel, checkpoint.ruleSetVersion))) throw new Error('Invalid Preparation Day source linkage');
  assertBossEncounter(shell(campaign as CampaignState, checkpoint));
  const selection = checkpoint.events.find(e => e.eventType === 'LOWEST_ROLL');
  const effectChoice = preparation.effectChoice;
  if (preparation.status === 'PENDING_LEVEL_II_EFFECT' ? !effectChoice
    || effectChoice.choiceId !== `${selection?.eventId}:graveyard-effect` || effectChoice.parentEventId !== selection?.eventId
    || effectChoice.ruleSetVersion !== checkpoint.ruleSetVersion || JSON.stringify(effectChoice.candidateIds) !== '["USE_EFFECT","DECLINE_EFFECT"]'
    : effectChoice !== null) throw new Error('Invalid Graveyard effect choice provenance');
  const evidence = selection?.result as { rolls?: Record<string, number>; candidates?: string[] } | undefined;
  const rolls = evidence?.rolls;
  const values = Object.values(rolls ?? {});
  const minimum = Math.min(...values);
  const candidates = Object.keys(rolls ?? {}).filter(id => rolls![id] === minimum);
  if (!values.length || values.some(n => !Number.isInteger(n) || n < 1 || n > 10)
    || JSON.stringify(candidates) !== JSON.stringify(evidence?.candidates)
    || candidates.some(id => ctx.heroDodge[id] === undefined)
    || checkpoint.pendingChoice && JSON.stringify(checkpoint.pendingChoice.candidateIds) !== JSON.stringify(candidates)
    || !checkpoint.pendingChoice && !candidates.includes(checkpoint.threatState.forcedHeroId ?? '')
    || candidates.length > 1 && !checkpoint.pendingChoice && !checkpoint.events.some(e => {
      const choice = (e.result as { choice?: { selectedId: string; continuation: { kind: string } } })?.choice;
      return e.eventType === 'CHOICE_COMMITTED' && choice?.continuation.kind === 'graveyard' && choice.selectedId === checkpoint.threatState.forcedHeroId;
    })) throw new Error('Preparation Day lowest-roll evidence mismatch');
  if (!['PENDING_TIE', 'PENDING_VISIT', 'PENDING_LEVEL_II_EFFECT', 'COMMITTED'].includes(preparation.status)
    || (preparation.status === 'PENDING_TIE') !== !!checkpoint.pendingChoice
    || checkpoint.pendingChoice && checkpoint.pendingChoice.continuation.kind !== 'graveyard'
    || !checkpoint.events.some(e => e.eventType === 'LOWEST_ROLL')) throw new Error('Invalid Preparation Day selection');
  if (preparation.status !== 'COMMITTED') {
    if (campaign.gamePhase !== 'hamlet' || campaign.hamlet?.currentDay !== 1 || preparation.hamletVisitId !== campaign.hamlet.visitId
      || ctx.threatId !== campaign.campaignProgress?.activeThreatId || ctx.campaignLevel !== campaign.campaignProgress?.campaignLevel
      || checkpoint.threatState.forcedHeroId && !campaign.heroes?.some(h => !h.dead && !h.hasActedToday && `u_${h.instanceId}` === checkpoint.threatState.forcedHeroId)
      || preparation.status === 'PENDING_LEVEL_II_EFFECT' && checkpoint.bossLevel !== 2) throw new Error('Invalid pending Preparation Day');
  } else if (!campaign.necromancerGraveyardReceipts?.some(r => r.encounterId === ctx.encounterId)) throw new Error('Preparation Day transaction receipt missing');
}
