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
}
