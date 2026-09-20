import type { CampaignState, QuestDefinition } from '../types';
import type { TrinketDefinition, TrinketLevel } from '../types/trinkets';
import { QUESTS, STANDARD_QUESTS } from './quests';
import { officialTrinketPool } from './trinkets/trinket-registry';
import {
  COMMUNITY_RUNTIME_QUESTS,
  COMMUNITY_RUNTIME_TRINKETS,
} from './community-reference/production-runtime';

export interface RuntimeContentContext {
  runtimeContentProfile?: CampaignState['runtimeContentProfile'];
  enabledContentSets?: CampaignState['enabledContentSets'];
  enabledRegions?: CampaignState['enabledRegions'];
  campaignLevel?: number;
}

export function runtimeContentContext(campaign: CampaignState): RuntimeContentContext {
  return {
    runtimeContentProfile: campaign.runtimeContentProfile ?? 'legacy-prototype',
    enabledContentSets: campaign.enabledContentSets ?? ['core'],
    enabledRegions: campaign.enabledRegions ?? ['ruins', 'warrens', 'weald', 'cove'],
    campaignLevel: campaign.campaignLevel,
  };
}

export function getQuestPool(context: RuntimeContentContext): QuestDefinition[] {
  if ((context.runtimeContentProfile ?? 'legacy-prototype') === 'legacy-prototype') {
    return STANDARD_QUESTS;
  }
  return COMMUNITY_RUNTIME_QUESTS.filter((quest) => quest.dungeonLevel === context.campaignLevel);
}

export function getBossQuestPool(context: RuntimeContentContext): QuestDefinition[] {
  if ((context.runtimeContentProfile ?? 'legacy-prototype') === 'legacy-prototype') {
    return QUESTS.filter((quest) => !STANDARD_QUESTS.some((standard) => standard.id === quest.id));
  }
  return COMMUNITY_RUNTIME_QUESTS.filter((quest) => quest.type === 'boss');
}

export function getTrinketPool(context: RuntimeContentContext): TrinketDefinition[] {
  if ((context.runtimeContentProfile ?? 'legacy-prototype') === 'legacy-prototype') {
    return officialTrinketPool();
  }
  const sets = new Set(context.enabledContentSets ?? ['core']);
  return COMMUNITY_RUNTIME_TRINKETS.filter((trinket) => {
    const sourceSet = trinket.id.split('-')[2];
    return sourceSet === 'core' ? sets.has('core') : true;
  });
}

export function getTrinketPoolByLevel(
  context: RuntimeContentContext,
  level: TrinketLevel,
): TrinketDefinition[] {
  return getTrinketPool(context).filter((trinket) => trinket.level === level);
}
