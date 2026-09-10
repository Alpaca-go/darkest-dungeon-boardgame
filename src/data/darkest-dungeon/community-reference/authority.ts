export type ContentSourceAuthority =
  | 'OFFICIAL_RULEBOOK'
  | 'OFFICIAL_DEMO'
  | 'COMMUNITY_RETAIL_REFERENCE'
  | 'OFFICIAL_RETAIL_VERIFIED'
  | 'PROTOTYPE';

export type CommunityReferenceStatus = 'confirmed' | 'partial' | 'unresolved';
export const COMMUNITY_REFERENCE_AUTHORITY: ContentSourceAuthority = 'COMMUNITY_RETAIL_REFERENCE';
