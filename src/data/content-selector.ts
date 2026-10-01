import type { CampaignState, QuestDefinition } from '../types';
import type { CommunityContentSet, CommunityRegion, RuntimeContentMetadata } from '../types/content-runtime';
import type { TrinketDefinition, TrinketLevel } from '../types/trinkets';
import { PRODUCTION_FACE_THE_THREAT_QUEST } from './quests/production-face-the-threat';
import { resolveProductionBossRuleSetVersion, productionBossFamilyRegistry } from '../game-engine/bosses/definitions';
import { campaignHeroDodgeRuleSetVersion } from '../game-engine/rules/hero-dodge-versioning';
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
  bossFamilyId?: string | null;
  bossRuleSetVersion?: string;
  heroDodgeRuleSetVersion?: string;
}

export function runtimeContentContext(campaign: CampaignState): RuntimeContentContext {
  return {
    runtimeContentProfile: campaign.runtimeContentProfile ?? 'legacy-prototype',
    enabledContentSets: campaign.enabledContentSets ?? ['core'],
    enabledRegions: campaign.enabledRegions ?? ['ruins', 'warrens', 'weald', 'cove'],
    campaignLevel: campaign.campaignProgress.campaignLevel,
    bossFamilyId: campaign.campaignProgress.activeBossFamilyId,
    bossRuleSetVersion: resolveProductionBossRuleSetVersion(campaign),
    heroDodgeRuleSetVersion: campaignHeroDodgeRuleSetVersion(campaign),
  };
}

const CONTENT_SETS: readonly CommunityContentSet[] = ['core', 'color-of-madness', 'crimson-court'];
const REGIONS: readonly CommunityRegion[] = ['ruins', 'warrens', 'weald', 'cove', 'crimson-court'];

function validMetadata(value: RuntimeContentMetadata | undefined): value is RuntimeContentMetadata {
  return Boolean(
    value
      && value.sourceOrigin === 'community-complete-edition'
      && value.sourceDefinitionId.length > 0
      && CONTENT_SETS.includes(value.contentSet)
      && (value.region === null || REGIONS.includes(value.region)),
  );
}

/** Pure fixture seam: Community quest selection never infers routing from an id. */
export function filterCommunityQuestCandidates(
  candidates: readonly QuestDefinition[],
  context: RuntimeContentContext,
): QuestDefinition[] {
  const sets = new Set(context.enabledContentSets ?? ['core']);
  const regions = new Set(context.enabledRegions ?? ['ruins', 'warrens', 'weald', 'cove']);
  return candidates.filter((quest) => {
    const metadata = quest.runtimeContentMetadata;
    return validMetadata(metadata)
      && metadata.region !== null
      && sets.has(metadata.contentSet)
      && regions.has(metadata.region)
      && (context.campaignLevel === undefined || quest.dungeonLevel === context.campaignLevel);
  });
}

/** Pure fixture seam: malformed/unknown metadata fails closed. */
export function filterCommunityTrinketCandidates(
  candidates: readonly TrinketDefinition[],
  context: RuntimeContentContext,
): TrinketDefinition[] {
  const sets = new Set(context.enabledContentSets ?? ['core']);
  return candidates.filter((trinket) => {
    const metadata = trinket.runtimeContentMetadata;
    return validMetadata(metadata) && metadata.region === null && sets.has(metadata.contentSet);
  });
}

export function getQuestPool(context: RuntimeContentContext): QuestDefinition[] {
  if ((context.runtimeContentProfile ?? 'legacy-prototype') === 'legacy-prototype') {
    return STANDARD_QUESTS;
  }
  return filterCommunityQuestCandidates(COMMUNITY_RUNTIME_QUESTS, context);
}

export function getBossQuestPool(context: RuntimeContentContext): QuestDefinition[] {
  if ((context.runtimeContentProfile ?? 'legacy-prototype') === 'legacy-prototype') {
    return QUESTS.filter((quest) => !STANDARD_QUESTS.some((standard) => standard.id === quest.id));
  }
  const existing = filterCommunityQuestCandidates(COMMUNITY_RUNTIME_QUESTS, { ...context, campaignLevel: undefined }).filter(q=>q.type==='boss');
  const adapter = productionBossFamilyRegistry.get(context.bossFamilyId ?? '');
  if (adapter?.unrestrictedSelectorAllowed && adapter.ruleSetVersions.includes(context.bossRuleSetVersion ?? '')
    && (context.heroDodgeRuleSetVersion ?? (context.bossFamilyId === 'necromancer' ? context.bossRuleSetVersion : undefined)) === 'C1C31-DIGITAL-DEFAULT-v2'
    && (context.enabledContentSets ?? ['core']).includes('core') && (context.enabledRegions ?? ['ruins']).includes('ruins')) return [...existing.filter(q=>q.id !== PRODUCTION_FACE_THE_THREAT_QUEST.id),PRODUCTION_FACE_THE_THREAT_QUEST];
  return existing;
}

export function getTrinketPool(context: RuntimeContentContext): TrinketDefinition[] {
  if ((context.runtimeContentProfile ?? 'legacy-prototype') === 'legacy-prototype') {
    return officialTrinketPool();
  }
  return filterCommunityTrinketCandidates(COMMUNITY_RUNTIME_TRINKETS, context);
}

export function getTrinketPoolByLevel(
  context: RuntimeContentContext,
  level: TrinketLevel,
): TrinketDefinition[] {
  return getTrinketPool(context).filter((trinket) => trinket.level === level);
}
