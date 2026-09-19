import data from './data.json';
import { freezeSourceData, type CommunityContentSet } from '../types';

/** Source-backed semantic data only. Intentionally not imported by Production. */
export const COMMUNITY_TRINKETS = freezeSourceData(data);
export const communityTrinkets = () => COMMUNITY_TRINKETS;
export const communityTrinketsByLevel = (level: number | null) => COMMUNITY_TRINKETS.filter(t => t.level === level);
export const communityTrinketsByContentSet = (contentSet: CommunityContentSet) => COMMUNITY_TRINKETS.filter(t => t.contentSet === contentSet);
