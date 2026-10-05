import type { CampaignState, BattleState } from '../../types';
import { withTransactionRecorded } from './campaign-orchestrator';
import { withBossEncounterSources } from '../bosses/foundation';
import { resolveBossDefinition } from '../bosses/definitions';
import { drawGraveyardVirtue, resolveGraveyardVirtue } from './graveyard-virtues';
import { pushLog } from '../log';
import type { GraveyardReceipt } from '../../types/necromancer-dependencies';

/** Guard duty is mandatory. The optional building effect exists only at Threat Level II. */
export function applyNecromancerPreparationDayGraveyard(campaign: CampaignState, useEffect: boolean): CampaignState {
  const e = campaign.bossEncounterCheckpoint, ctx = e?.checkpointContext;
  if (!e || !ctx || e.bossFamily !== 'necromancer' || e.bossLevel === 1 || e.side !== 'THREAT'
    || !e.threatState.preparationDayConsumed || e.pendingChoice || !e.threatState.forcedHeroId
    || ctx.campaignId !== campaign.id || ctx.threatId !== campaign.campaignProgress.activeThreatId
    || ctx.campaignLevel !== campaign.campaignProgress.campaignLevel || ctx.definitionVersion !== e.ruleSetVersion
    || JSON.stringify(e.definition) !== JSON.stringify(resolveBossDefinition('necromancer', e.bossLevel, e.ruleSetVersion))) throw new Error('Unsettled or unbound Preparation Day provenance');
  const transactionId = `necromancer-graveyard:${ctx.encounterId}:first-preparation-day`;
  const forcedHeroId = e.threatState.forcedHeroId;
  const selection = e.events.find(event => event.eventType === 'LOWEST_ROLL');
  const evidence = selection?.result as { rolls?: Record<string, number>; candidates?: string[] } | undefined;
  if (!selection || !evidence?.rolls || !evidence.candidates?.includes(forcedHeroId)
    || (evidence.candidates.length > 1 && !e.events.some(event => {
      const choice = (event.result as { choice?: { selectedId: string; continuation: { kind: string } } })?.choice;
      return event.eventType === 'CHOICE_COMMITTED' && choice?.continuation.kind === 'graveyard' && choice.selectedId === forcedHeroId;
    }))) throw new Error('Forced Hero lacks lowest-roll causal provenance');
  const hero = campaign.heroes.find(h => `u_${h.instanceId}` === forcedHeroId && !h.dead);
  if (!hero || ctx.encounterId !== `${campaign.id}:${ctx.questRunId}:necromancer:${e.bossLevel}`) throw new Error('Invalid forced Hero or Quest provenance');
  const prior = campaign.necromancerGraveyardReceipts?.find(r => r.transactionId === transactionId);
  if (prior) {
    if (prior.forcedHeroId !== forcedHeroId || prior.useEffect !== useEffect || prior.ruleSetVersion !== e.ruleSetVersion) throw new Error('Graveyard transaction conflicts with existing receipt');
    return campaign;
  }
  if (campaign.gamePhase !== 'hamlet' || campaign.hamlet.currentDay !== 1 || hero.hasActedToday
    || (e.bossLevel === 3 && useEffect)) throw new Error('Graveyard unavailable for this Preparation Day');
  const preparationRolls = structuredClone(evidence.rolls);
  let next!: CampaignState;
  const shell = { battleId: ctx.battleId, bossEncounter: structuredClone(e) } as BattleState;
  withBossEncounterSources(shell, () => {
    const draw = useEffect ? drawGraveyardVirtue() : null;
    const receipt: GraveyardReceipt = { transactionId, campaignId: campaign.id, sourceQuestRunId: ctx.questRunId,
      encounterId: ctx.encounterId, ruleSetVersion: e.ruleSetVersion, threatLevel: e.bossLevel as 2 | 3,
      forcedHeroId, heroInstanceId: hero.instanceId, useEffect, virtueId: draw?.id ?? null,
      selectionEventId: selection.eventId, preparationRolls,
      targetQuestRunId: null, lifecycle: useEffect ? 'PENDING_NEXT_QUEST' : 'GUARD_ONLY' };
    next = withTransactionRecorded({ ...campaign,
      heroes: campaign.heroes.map(h => h.instanceId === hero.instanceId ? { ...h, hasActedToday: true } : h),
      hamlet: { ...campaign.hamlet, occupiedBuildingIds: [...new Set([...campaign.hamlet.occupiedBuildingIds, 'graveyard'])] },
      necromancerGraveyardReceipts: [...(campaign.necromancerGraveyardReceipts ?? []), receipt],
    }, transactionId);
    next = pushLog(next, `${hero.name}：Necromancer Level ${e.bossLevel} Graveyard guard duty${useEffect ? '，Virtue 将用于下一 Quest。' : '。'}`, 'info');
    return shell;
  });
  return { ...next, bossEncounterCheckpoint: shell.bossEncounter! };
}
/** Called after the existing new-Quest mental reset. Drawing happened once in the transaction. */
export function activateGraveyardForNextQuest(campaign: CampaignState): CampaignState {
  const pending = campaign.necromancerGraveyardReceipts?.filter(r => r.lifecycle === 'PENDING_NEXT_QUEST');
  if (!pending?.length) return campaign;
  if (!campaign.dungeon || !campaign.currentQuestId) throw new Error('Graveyard activation requires a Quest run');
  return { ...campaign,
    necromancerGraveyardReceipts: campaign.necromancerGraveyardReceipts!.map(r => r.lifecycle === 'PENDING_NEXT_QUEST'
      ? { ...r, lifecycle: 'ACTIVE_QUEST', targetQuestRunId: campaign.dungeon!.questRunId } : r),
    heroes: campaign.heroes.map(h => {
      const effect = pending.find(r => r.heroInstanceId === h.instanceId);
      return effect && !h.dead ? { ...h, resolveState: 'virtuous' as const, virtueId: effect.virtueId,
        afflictionId: null, resolveTestedThisQuest: true, lastResolveQuestId: campaign.currentQuestId } : h;
    }),
  };
}
export function expireGraveyardAtQuestEnd(campaign: CampaignState): CampaignState {
  if (!campaign.necromancerGraveyardReceipts?.some(r => r.lifecycle === 'ACTIVE_QUEST')) return campaign;
  return { ...campaign, necromancerGraveyardReceipts: campaign.necromancerGraveyardReceipts.map(r =>
    r.lifecycle === 'ACTIVE_QUEST' && r.targetQuestRunId === campaign.dungeon?.questRunId ? { ...r, lifecycle: 'EXPIRED' } : r) };
}
export function graveyardStressTenIsFatal(campaign: CampaignState, heroId: string): boolean {
  return !!campaign.necromancerGraveyardReceipts?.some(r => r.lifecycle === 'ACTIVE_QUEST'
    && r.targetQuestRunId === campaign.dungeon?.questRunId && r.heroInstanceId === heroId && r.useEffect);
}
export function validateGraveyardReceipts(campaign: Partial<CampaignState>): void {
  const receipts = campaign.necromancerGraveyardReceipts;
  if (receipts === undefined) return;
  if (!Array.isArray(receipts) || new Set(receipts.map(r => r.transactionId)).size !== receipts.length) throw new Error('Invalid Graveyard receipt list');
  for (const r of receipts) {
    if (r.campaignId !== campaign.id || ![2,3].includes(r.threatLevel)
      || r.encounterId !== `${r.campaignId}:${r.sourceQuestRunId}:necromancer:${r.threatLevel}`
      || r.transactionId !== `necromancer-graveyard:${r.encounterId}:first-preparation-day`
      || r.forcedHeroId !== `u_${r.heroInstanceId}` || (r.threatLevel === 3 && r.useEffect)
      || (r.useEffect ? !r.virtueId || !resolveGraveyardVirtue(r.virtueId) : r.virtueId !== null)
      || (r.useEffect === (r.lifecycle === 'GUARD_ONLY'))
      || (r.lifecycle === 'PENDING_NEXT_QUEST' && r.targetQuestRunId !== null)
      || !['PENDING_NEXT_QUEST','ACTIVE_QUEST','GUARD_ONLY','EXPIRED'].includes(r.lifecycle)
      || (r.lifecycle === 'ACTIVE_QUEST' && r.targetQuestRunId !== campaign.dungeon?.questRunId)) throw new Error('Invalid Graveyard source/Quest receipt');
    const rolls = Object.values(r.preparationRolls ?? {});
    if (!rolls.length || rolls.some(n => !Number.isInteger(n) || n < 1 || n > 10)
      || r.preparationRolls[r.forcedHeroId] !== Math.min(...rolls)
      || !r.selectionEventId.startsWith(`${r.sourceQuestRunId}:boss:event:`)) throw new Error('Invalid Graveyard selection evidence');
    resolveBossDefinition('necromancer', r.threatLevel, r.ruleSetVersion);
  }
}
