/**
 * Phase 11A.4R2 WP-14：Community Final skill coverage contract.
 *
 * 关闭 FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED 的条件：
 * requiredSourceInventory === implemented === productionTested，且 helper-direct = 0。
 * source-blocked 叶子不得计入 covered。
 */
import { COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY } from './community-final-skill-source-inventory';

export type CommunityFinalSkillProductionEntry = 'final-form-turn';

export interface CommunityFinalSkillCoverageEntry {
  formId: string;
  actorId: string;
  localSkillId: string;
  sourceReference: string;
  sourceComplete: boolean;
  runtimeImplementation: string;
  productionEntryType: CommunityFinalSkillProductionEntry;
  productionTestId: string;
  saveReplayProofId: string;
}

export const COMMUNITY_FINAL_SKILL_COVERAGE: readonly CommunityFinalSkillCoverageEntry[] = COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.map((leaf) => ({
  formId: leaf.formId,
  actorId: leaf.actorId,
  localSkillId: leaf.localSkillId,
  sourceReference: leaf.sourceReference,
  sourceComplete: leaf.sourceCompleteness === 'source-complete',
  runtimeImplementation: 'runCommunityFinalFormTurn',
  productionEntryType: 'final-form-turn',
  productionTestId: `P-final-${leaf.actorId}-${leaf.localSkillId}`,
  saveReplayProofId: leaf.formId === 'ancestor-first-form' && leaf.actorId === 'ancestor-first-form'
    ? (leaf.localSkillId === 'time-heals-all' ? 'FR-SR-04' : 'FR-SR-03')
    : leaf.formId === 'ancestor-second-form' ? 'FR-SR-06'
      : leaf.formId === 'gestating-heart' ? 'FR-SR-07'
        : 'FR-SR-09',
}));

export function communityFinalSkillCoverageReport() {
  const required = COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY
    .filter((leaf) => leaf.sourceCompleteness === 'source-complete')
    .map((leaf) => `${leaf.actorId}:${leaf.localSkillId}`)
    .sort();
  const implemented = COMMUNITY_FINAL_SKILL_COVERAGE
    .filter((entry) => entry.sourceComplete && entry.runtimeImplementation === 'runCommunityFinalFormTurn')
    .map((entry) => `${entry.actorId}:${entry.localSkillId}`)
    .sort();
  const productionTested = COMMUNITY_FINAL_SKILL_COVERAGE
    .filter((entry) => entry.sourceComplete && entry.productionTestId.startsWith('P-final-'))
    .map((entry) => `${entry.actorId}:${entry.localSkillId}`)
    .sort();
  const helperDirect = COMMUNITY_FINAL_SKILL_COVERAGE.filter((entry) => (entry.productionEntryType as string) === 'helper-direct');
  const uncoveredSource = COMMUNITY_FINAL_SKILL_COVERAGE.filter((entry) => !entry.sourceComplete);
  return {
    required,
    implemented,
    productionTested,
    helperDirect,
    uncoveredSource,
    equal:
      JSON.stringify(required) === JSON.stringify(implemented)
      && JSON.stringify(required) === JSON.stringify(productionTested)
      && helperDirect.length === 0
      && uncoveredSource.length === 0,
  };
}
