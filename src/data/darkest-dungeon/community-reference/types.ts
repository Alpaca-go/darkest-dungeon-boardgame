import type { ContentSourceAuthority, CommunityReferenceStatus } from './authority';

export type EligibleEvidenceType = 'confirmed_from_visual' | 'confirmed_from_json_structure' | 'confirmed_from_rulebook';
export interface CommunityField<T = unknown> {
  value: T | null;
  evidenceType: EligibleEvidenceType | 'unresolved';
  sourceReference: readonly string[];
  status: CommunityReferenceStatus;
}
export interface CommunityRecord {
  id: string;
  sourceAuthority: ContentSourceAuthority;
  sourceEdition: 'antha-complete-edition';
  enabledInOfficialPool: false;
  status: CommunityReferenceStatus;
  sourceReference: readonly string[];
}
export interface SourceIdBinding {
  sourceLocalId: string;
  repositoryId: string;
  bindingBasis: string;
  sourceReference: readonly string[];
}
