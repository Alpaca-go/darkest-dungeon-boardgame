import type { CampaignState, PendingDiseaseTrinketAction } from '../../types';
import { getTrinketSide } from '../../data/trinkets/trinket-registry';
import {
  acquireDisease,
  classifyDiseaseAcquisition,
  discardDiseaseAcquisitionByTrinket,
  type AcquireDiseaseInput,
} from '../diseases/acquire-disease';
import { declineTrinketUse, useTrinket } from './use-trinket';
import { findOpportunity, openTrinketWindow } from './trinket-opportunities';

export interface DiseaseTrinketBridgeResult {
  campaign: CampaignState;
  error: string | null;
  paused: boolean;
}
function inputFromPending(pending: PendingDiseaseTrinketAction): AcquireDiseaseInput {
  return {
    heroId: pending.heroId,
    diseaseId: pending.diseaseId,
    source: pending.source,
    sourceEventId: pending.sourceEventId,
    questId: pending.questId,
    deathSource: pending.deathSource,
    deathResumePhase: pending.deathResumePhase,
  };
}

function clearRoot(campaign: CampaignState, rootEventId: string): CampaignState {
  return {
    ...campaign,
    pendingDiseaseTrinketAction: null,
    pendingTrinketUseOpportunities: campaign.pendingTrinketUseOpportunities.filter(
      (entry) => entry.rootEventId !== rootEventId,
    ),
  };
}

/** Freeze a real add/replace acquisition before hero.disease is mutated. */
export function beginDiseaseAcquisitionWithTrinkets(
  campaign: CampaignState,
  input: AcquireDiseaseInput,
): DiseaseTrinketBridgeResult {
  const existing = campaign.pendingDiseaseTrinketAction;
  if (existing) {
    if (existing.sourceEventId === input.sourceEventId) {
      return { campaign, error: null, paused: true };
    }
    return { campaign, error: '已有疾病获取事务等待结算。', paused: true };
  }

  const classification = classifyDiseaseAcquisition(campaign, input);
  if (classification !== 'would-add' && classification !== 'would-replace') {
    const committed = acquireDisease(campaign, input);
    return { campaign: committed.campaign, error: null, paused: false };
  }

  const rootEventId = `disease-acquisition:${input.sourceEventId}`;
  const pending: PendingDiseaseTrinketAction = {
    kind: 'disease-acquisition',
    rootEventId,
    sourceEventId: input.sourceEventId,
    heroId: input.heroId,
    diseaseId: input.diseaseId,
    source: input.source,
    questId: input.questId ?? campaign.currentQuestId ?? null,
    deathSource: input.deathSource,
    deathResumePhase: input.deathResumePhase,
    stage: 'trinket-window',
    processedTrinketInstanceIds: [],
  };
  const staged: CampaignState = { ...campaign, pendingDiseaseTrinketAction: pending };
  const opened = openTrinketWindow(staged, {
    window: 'before-disease-acquisition-commit',
    heroId: pending.heroId,
    eventId: `${rootEventId}:trinket-window`,
    rootEventId,
  });
  if (opened.hasOpportunity) return { campaign: opened.campaign, error: null, paused: true };

  const committed = acquireDisease(clearRoot(opened.campaign, rootEventId), input);
  return { campaign: committed.campaign, error: null, paused: false };
}

/** Dedicated consumer for the context-bound discard-disease effect. */
export function resolveDiseaseTrinketOpportunity(
  campaign: CampaignState,
  opportunityId: string,
  decision: 'use' | 'decline',
): DiseaseTrinketBridgeResult {
  const pending = campaign.pendingDiseaseTrinketAction;
  const opportunity = findOpportunity(campaign, opportunityId);
  if (!pending || !opportunity || opportunity.status !== 'open'
    || opportunity.rootEventId !== pending.rootEventId
    || opportunity.heroId !== pending.heroId) {
    return { campaign, error: '疾病饰品机会已失效。', paused: Boolean(pending) };
  }
  const input = inputFromPending(pending);
  const classification = classifyDiseaseAcquisition(campaign, input);
  if (classification !== 'would-add' && classification !== 'would-replace') {
    return { campaign: clearRoot(campaign, pending.rootEventId), error: '疾病获取事务已失效。', paused: false };
  }

  if (decision === 'use') {
    const side = getTrinketSide(opportunity.trinketId, opportunity.side);
    const consumesDisease = side?.effects.some((effect) => effect.type === 'discard-disease'
      && effect.immediately === true && effect.target === 'new-disease');
    if (!consumesDisease) return { campaign, error: '饰品没有可结算的疾病丢弃效果。', paused: true };
    const used = useTrinket(campaign, opportunityId, undefined, { allowDiseaseDiscard: true });
    if (used.error) return { campaign, error: used.error, paused: true };
    const prevented = discardDiseaseAcquisitionByTrinket(
      used.campaign,
      input,
      opportunity.trinketId,
      opportunity.trinketInstanceId,
    );
    return { campaign: clearRoot(prevented.campaign, pending.rootEventId), error: null, paused: false };
  }

  let next = declineTrinketUse(campaign, opportunityId);
  if (next === campaign) return { campaign, error: '该使用机会已关闭。', paused: true };
  const processed = [...new Set([...pending.processedTrinketInstanceIds, opportunity.trinketInstanceId])];
  next = { ...next, pendingDiseaseTrinketAction: { ...pending, processedTrinketInstanceIds: processed } };
  const stillOpen = next.pendingTrinketUseOpportunities.some(
    (entry) => entry.rootEventId === pending.rootEventId && entry.status === 'open',
  );
  if (stillOpen) return { campaign: next, error: null, paused: true };
  const committed = acquireDisease(clearRoot(next, pending.rootEventId), input);
  return { campaign: committed.campaign, error: null, paused: false };
}
