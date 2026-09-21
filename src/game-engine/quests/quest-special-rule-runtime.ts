import type { CampaignState } from '../../types';
import type { QuestRuleProvision } from '../../types/content-runtime';
import { COMMUNITY_QUEST_RUNTIME_ADAPTERS } from '../../data/community-reference/production-runtime';
import type {
  QuestRuleApplicationResult,
  QuestRuleCondition,
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
  const processed = [...new Set([...(state.processedRuleTransactionIds ?? []), transactionId])].slice(-200);
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
