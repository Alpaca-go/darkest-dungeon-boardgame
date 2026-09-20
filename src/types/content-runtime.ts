export type RuntimeContentProfile = 'legacy-prototype' | 'community-complete-edition';

export type CommunityContentSet = 'core' | 'color-of-madness' | 'crimson-court';
export type CommunityRegion = 'ruins' | 'warrens' | 'weald' | 'cove' | 'crimson-court';

/** Explicit selector metadata carried by production Community definitions. */
export interface RuntimeContentMetadata {
  sourceDefinitionId: string;
  contentSet: CommunityContentSet;
  /** Trinkets are global and therefore use null; quests must name a region. */
  region: CommunityRegion | null;
  sourceOrigin: 'community-complete-edition';
}

export interface QuestRuntimeState {
  definitionId: string;
  counters: Record<string, number>;
  flags: Record<string, boolean>;
  selectedRoomIds: string[];
  setAsideRoomIds: string[];
  /** Source-qualified progress. This is independent from quest completion. */
  qualifiedUnitCount?: number;
  xpUnitsEarned?: number;
  xpEarned?: number;
  firewoodTokensRemaining?: number;
  restingPointsRemaining?: number;
  restingPointsSpent?: number;
}

export interface QuestFirewoodSetup {
  tokens: number;
  restingPoints: number;
}

export type QuestRoomTokenType = 'empty' | 'dark' | 'curio' | 'treasure' | 'lair' | 'trap';

export interface QuestRoomTokenRequirement {
  roomType: QuestRoomTokenType;
  count: number;
}

export interface QuestDungeonComposition {
  roomTokens: QuestRoomTokenRequirement[];
  placement: 'shuffle-on-layout-room-slots';
}

export interface QuestXpUnitDefinition {
  qualificationEvent: 'room-cleared';
  targetEntity: 'room' | 'lair';
  unitSize: number;
  xpPerUnit: number;
  maximumXp: number | null;
  minimumQuestGoal: number | null;
}
