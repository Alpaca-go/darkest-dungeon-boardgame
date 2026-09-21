import type { CampaignState } from '../../types';
import type { QuestRoomTokenType, QuestRuleProvision, QuestRuntimeState, QuestRuntimeTokenType } from '../../types/content-runtime';

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

export type QuestRuleEffect =
  | { type: 'discard-chosen-provision'; amount: 1 }
  | {
      type: 'place-quest-token-in-rooms';
      roomTokenType: QuestRoomTokenType;
      questTokenType: QuestRuntimeTokenType;
      count: number;
      selectionPolicy: 'all-matching-source-rooms';
    }
  | {
      type: 'consume-current-room-quest-token';
      questTokenType: QuestRuntimeTokenType;
      progressCounter: string;
    }
  | {
      type: 'complete-when-quest-token-count';
      questTokenType: QuestRuntimeTokenType;
      requiredCount: number;
    };

export interface QuestSpecialRuleDefinition {
  id: string;
  trigger: QuestRuleTrigger;
  conditions: QuestRuleCondition[];
  effects: QuestRuleEffect[];
  sourceReferences: string[];
  semanticCategory: 'provision' | 'room-setup' | 'token-interaction' | 'quest-completion';
  printedSpecialRuleIndex: number;
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

export interface QuestTokenInteractionResult {
  ok: boolean;
  campaign: CampaignState;
  error: 'no-active-quest' | 'no-quest-token' | 'room-condition-invalid' | 'already-consumed' | 'already-complete' | null;
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
