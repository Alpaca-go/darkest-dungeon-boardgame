import type { CampaignState } from '../../types';
import type { QuestRuleProvision, QuestRuntimeState } from '../../types/content-runtime';

export type QuestRuleTrigger =
  | 'quest-start'
  | 'room-entered'
  | 'room-cleared'
  | 'battle-start'
  | 'battle-victory'
  | 'exploration-roll'
  | 'token-interacted'
  | 'quest-completed'
  | 'return-to-hamlet'
  | 'leave-room';

export type QuestRuleCondition =
  | { type: 'runtime-content-profile'; profile: 'community-complete-edition' }
  | { type: 'quest-active' };

export type QuestRuleEffect = {
  type: 'discard-chosen-provision';
  amount: 1;
};

export interface QuestSpecialRuleDefinition {
  id: string;
  trigger: QuestRuleTrigger;
  conditions: QuestRuleCondition[];
  effects: QuestRuleEffect[];
  sourceReferences: string[];
}

export interface QuestRuleTriggerContext {
  trigger: QuestRuleTrigger;
  triggerInstanceId: string;
}

export interface QuestRuleApplicationResult {
  ok: boolean;
  campaign: CampaignState;
  error: 'no-pending-choice' | 'wrong-transaction' | 'invalid-provision' | 'insufficient-provision' | null;
}

export interface CommunityQuestRuntimeAdapterContract {
  adapterId: string;
  questDefinitionId: string;
  setup: (state: QuestRuntimeState) => QuestRuntimeState;
  evaluateObjective: (campaign: CampaignState) => number;
  evaluateCompletion: (campaign: CampaignState) => boolean;
  applyRewards: (campaign: CampaignState) => CampaignState;
  specialRules: QuestSpecialRuleDefinition[];
}

export const QUEST_RULE_PROVISIONS: readonly QuestRuleProvision[] = [
  'food', 'bandage', 'potion', 'torch', 'tool',
];
