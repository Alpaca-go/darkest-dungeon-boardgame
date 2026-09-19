import data from './data.json';
import { freezeSourceData, type CommunityContentSet } from '../types';

/** Does not replace src/data/quests.ts. No production imports allowed in C1A. */
export const COMMUNITY_STANDARD_QUESTS = freezeSourceData(data.filter(q => q.questType === 'standard'));
export const COMMUNITY_BOSS_QUESTS = freezeSourceData(data.filter(q => q.questType === 'boss'));
export const communityStandardQuests = () => COMMUNITY_STANDARD_QUESTS;
export const communityBossQuests = () => COMMUNITY_BOSS_QUESTS;
export const communityQuestsByContentSet = (contentSet: CommunityContentSet) => data.filter(q => q.contentSet === contentSet);
