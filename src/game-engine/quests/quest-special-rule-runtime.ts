import type { CampaignState } from '../../types';
import type { QuestRuleProvision } from '../../types/content-runtime';
import { COMMUNITY_QUEST_RUNTIME_ADAPTERS } from '../../data/community-reference/production-runtime';
import type {
  QuestRuleApplicationResult,
  QuestRuleCondition,
  QuestSpecialRuleDefinition,
  QuestTokenInteractionResult,
  QuestRuleTriggerContext,
} from './quest-special-rule-types';
import { QUEST_RULE_PROVISIONS } from './quest-special-rule-types';

function conditionMatches(campaign: CampaignState, condition: QuestRuleCondition): boolean {
  if (condition.type === 'quest-active') return campaign.questStatus === 'active';
  return campaign.runtimeContentProfile === condition.profile;
}

export function questRuleTransactionId(
  questInstanceId: string,
  questRuleId: string,
  triggerInstanceId: string,
): string {
  return `quest-rule:${questInstanceId}:${questRuleId}:${triggerInstanceId}`;
}

export const QUEST_RULE_TRANSACTION_LIMIT = 200;

function appendTransaction(state: NonNullable<CampaignState['questRuntimeState']>, transactionId: string): string[] {
  const transactions = [...new Set([...(state.processedRuleTransactionIds ?? []), transactionId])];
  if (transactions.length > QUEST_RULE_TRANSACTION_LIMIT) {
    throw new Error(`Quest rule transaction limit exceeded for ${state.questInstanceId ?? state.definitionId}`);
  }
  return transactions;
}

function rulesFor(campaign: CampaignState): QuestSpecialRuleDefinition[] {
  const state = campaign.questRuntimeState;
  const adapter = campaign.currentQuestId ? COMMUNITY_QUEST_RUNTIME_ADAPTERS[campaign.currentQuestId] : undefined;
  return state && adapter && state.definitionId === adapter.definitionId ? adapter.specialRules : [];
}

/** Quest-start transition run after both runtime state and dungeon layout exist. */
export function applyQuestRoomSetup(campaign: CampaignState): CampaignState {
  const state = campaign.questRuntimeState;
  const dungeon = campaign.dungeon;
  if (!state || !dungeon || state.roomSetup) return campaign;
  const rule = rulesFor(campaign).find((candidate) => candidate.trigger === 'quest-start'
    && candidate.semanticCategory === 'room-setup'
    && candidate.conditions.every((condition) => conditionMatches(campaign, condition)));
  const effect = rule?.effects.find((candidate) => candidate.type === 'place-quest-token-in-rooms');
  if (!rule || !effect) return campaign;
  const selectedRoomIds = dungeon.rooms
    .filter((room) => room.sourceRoomToken === effect.roomTokenType)
    .map((room) => room.id)
    .slice(0, effect.count);
  if (selectedRoomIds.length !== effect.count) return campaign;
  const transactionId = questRuleTransactionId(state.questInstanceId ?? state.definitionId, rule.id, dungeon.questRunId);
  if ((state.processedRuleTransactionIds ?? []).includes(transactionId)) return campaign;
  const questTokens = selectedRoomIds.map((roomId, index) => ({
    id: `${state.questInstanceId ?? state.definitionId}:${effect.questTokenType}:${index + 1}`,
    type: effect.questTokenType,
    roomId,
    status: 'available' as const,
  }));
  return {
    ...campaign,
    questRuntimeState: {
      ...state,
      selectedRoomIds,
      questTokens,
      roomSetup: {
        selectedRoomIds,
        setAsideRoomIds: [],
        tokenPlacement: questTokens.map((token) => ({ tokenId: token.id, tokenType: token.type, roomId: token.roomId })),
        rngCursor: 0,
        transactionId,
      },
      processedRuleTransactionIds: appendTransaction(state, transactionId),
    },
  };
}

export function evaluateQuestCompletion(campaign: CampaignState): boolean {
  const state = campaign.questRuntimeState;
  if (!state) return Boolean(campaign.dungeon?.objectiveComplete);
  const rule = rulesFor(campaign).find((candidate) => candidate.semanticCategory === 'quest-completion');
  const effect = rule?.effects.find((candidate) => candidate.type === 'complete-when-quest-token-count');
  if (!effect) return Boolean(campaign.dungeon?.objectiveComplete);
  return (state.questTokens ?? []).filter((token) => token.type === effect.questTokenType && token.status === 'consumed').length
    >= effect.requiredCount;
}

/** Production command for quest-owned tokens; it never mutates ordinary Room/Curio tokens. */
export function interactWithQuestToken(campaign: CampaignState): QuestTokenInteractionResult {
  const state = campaign.questRuntimeState;
  const dungeon = campaign.dungeon;
  if (!state || !dungeon || campaign.questStatus !== 'active' || campaign.gamePhase !== 'dungeon-explore') {
    return { ok: false, campaign, error: 'no-active-quest' };
  }
  if (evaluateQuestCompletion(campaign)) return { ok: false, campaign, error: 'already-complete' };
  const token = (state.questTokens ?? []).find((candidate) => candidate.roomId === dungeon.currentRoomId);
  if (!token) return { ok: false, campaign, error: 'no-quest-token' };
  if (token.status === 'consumed') return { ok: false, campaign, error: 'already-consumed' };
  const room = dungeon.rooms.find((candidate) => candidate.id === token.roomId);
  if (!room || room.status !== 'cleared') return { ok: false, campaign, error: 'room-condition-invalid' };
  const rule = rulesFor(campaign).find((candidate) => candidate.trigger === 'token-interacted'
    && candidate.effects.some((effect) => effect.type === 'consume-current-room-quest-token'
      && effect.questTokenType === token.type));
  const effect = rule?.effects.find((candidate) => candidate.type === 'consume-current-room-quest-token');
  if (!rule || !effect || effect.type !== 'consume-current-room-quest-token' || effect.questTokenType !== token.type) {
    return { ok: false, campaign, error: 'no-quest-token' };
  }
  const transactionId = questRuleTransactionId(state.questInstanceId ?? state.definitionId, rule.id, token.id);
  if ((state.processedRuleTransactionIds ?? []).includes(transactionId)) {
    return { ok: false, campaign, error: 'already-consumed' };
  }
  const qualifiedUnitCount = (state.qualifiedUnitCount ?? 0) + 1;
  let next: CampaignState = {
    ...campaign,
    questRuntimeState: {
      ...state,
      questTokens: (state.questTokens ?? []).map((candidate) => candidate.id === token.id
        ? { ...candidate, status: 'consumed' as const } : candidate),
      qualifiedUnitCount,
      xpUnitsEarned: qualifiedUnitCount,
      xpEarned: Math.min(3, qualifiedUnitCount),
      counters: { ...state.counters, [effect.progressCounter]: qualifiedUnitCount, qualifiedUnitCount, xpUnitsEarned: qualifiedUnitCount, xpEarned: Math.min(3, qualifiedUnitCount) },
      processedRuleTransactionIds: appendTransaction(state, transactionId),
    },
  };
  if (evaluateQuestCompletion(next)) {
    next = {
      ...next,
      dungeon: { ...next.dungeon!, objectiveComplete: true },
      questRuntimeState: { ...next.questRuntimeState!, flags: { ...next.questRuntimeState!.flags, objectiveComplete: true } },
    };
  }
  return { ok: true, campaign: next, error: null };
}

/** Evaluates typed rules only; printed prose is never interpreted at runtime. */
export function evaluateQuestRules(
  campaign: CampaignState,
  context: QuestRuleTriggerContext,
): CampaignState {
  const state = campaign.questRuntimeState;
  const adapter = campaign.currentQuestId ? COMMUNITY_QUEST_RUNTIME_ADAPTERS[campaign.currentQuestId] : undefined;
  if (!state || !adapter || state.definitionId !== adapter.definitionId || state.pendingRuleChoice) return campaign;
  const processed = new Set(state.processedRuleTransactionIds ?? []);
  const rule = adapter.specialRules.find((candidate) =>
    candidate.trigger === context.trigger
    && candidate.conditions.every((condition) => conditionMatches(campaign, condition))
    && candidate.effects.some((effect) => effect.type === 'discard-chosen-provision'));
  if (!rule) return campaign;
  const transactionId = questRuleTransactionId(
    state.questInstanceId ?? state.definitionId,
    rule.id,
    context.triggerInstanceId,
  );
  if (processed.has(transactionId)) return campaign;
  const effect = rule.effects.find((candidate) => candidate.type === 'discard-chosen-provision');
  if (!effect) return campaign;
  return {
    ...campaign,
    questRuntimeState: {
      ...state,
      pendingRuleChoice: {
        transactionId,
        questRuleId: rule.id,
        triggerInstanceId: context.triggerInstanceId,
        trigger: 'leave-room',
        effect,
      },
    },
  };
}

export function applyQuestRuleEffects(
  campaign: CampaignState,
  transactionId: string,
  provision: QuestRuleProvision,
): QuestRuleApplicationResult {
  const state = campaign.questRuntimeState;
  const pending = state?.pendingRuleChoice;
  if (!state || !pending) return { ok: false, campaign, error: 'no-pending-choice' };
  if (pending.transactionId !== transactionId) return { ok: false, campaign, error: 'wrong-transaction' };
  if (!QUEST_RULE_PROVISIONS.includes(provision)) return { ok: false, campaign, error: 'invalid-provision' };
  if ((campaign.provisions[provision] ?? 0) < pending.effect.amount) {
    return { ok: false, campaign, error: 'insufficient-provision' };
  }
  const processed = appendTransaction(state, transactionId);
  return {
    ok: true,
    campaign: {
      ...campaign,
      provisions: { ...campaign.provisions, [provision]: campaign.provisions[provision] - pending.effect.amount },
      questRuntimeState: {
        ...state,
        pendingRuleChoice: null,
        processedRuleTransactionIds: processed,
        counters: {
          ...state.counters,
          provisionsDiscardedByQuestRules: (state.counters.provisionsDiscardedByQuestRules ?? 0) + pending.effect.amount,
        },
      },
    },
    error: null,
  };
}
