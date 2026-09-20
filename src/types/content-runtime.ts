export type RuntimeContentProfile = 'legacy-prototype' | 'community-complete-edition';

export type CommunityContentSet = 'core' | 'color-of-madness' | 'crimson-court';
export type CommunityRegion = 'ruins' | 'warrens' | 'weald' | 'cove' | 'crimson-court';

export interface QuestRuntimeState {
  definitionId: string;
  counters: Record<string, number>;
  flags: Record<string, boolean>;
  selectedRoomIds: string[];
  setAsideRoomIds: string[];
}
