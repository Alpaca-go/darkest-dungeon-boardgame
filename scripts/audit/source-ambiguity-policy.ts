import type { SourceValue } from '../../src/types/hero-production';
export const SOURCE_AMBIGUITY_DEFER_POLICY_V1 = Object.freeze({
  policyId: 'SOURCE_AMBIGUITY_DEFER_POLICY_V1', effectivePhase: '11A.5-C2C',
  oneReasonableReview: true, repeatResearchRequired: false,
  missingOfficialRuleBlocksPhase: false, officialConflictBlocksPhase: false,
  silentGuessAllowed: false, manualValidationRequired: true,
  historicalArtifactsRewritten: false, rulesAuthorityPolicy: 'RULEBOOK_ONLY_SOURCE_POLICY_V1',
});
export interface DeferredManualValidationRecord {
  deferredId: string; historicalGapId: string; domain: string;
  heroId: string | null; skillId: string | null; level: number | null; field: string;
  officialSources: { path: string; sha256: string; page: number; authority: string }[];
  ambiguityType: string; literalVariants: SourceValue[]; reason: string; affectedForms: string[];
  runtimeImpact: string; manualTestScenario: string; resolutionStatus: 'OPEN'; priority: 'HIGH' | 'MEDIUM' | 'LOW';
  semanticStatus: 'DEFERRED_MANUAL_VALIDATION'; canonical: false; executionBinding: null;
  blocksCurrentPhase: false; blocksNextPhase: false; blocksC2C: false; blocksC2D: false;
  requiresFurtherSourceResearchNow: false; manualValidationRequired: true;
}
/** Reusable validation, independent of Hero runtime or any particular phase's counts. */
export function validateDeferredRecords(records: DeferredManualValidationRecord[]) {
  const ids = new Set<string>();
  for (const r of records) {
    if (ids.has(r.deferredId)) throw new Error('Duplicate deferred group: ' + r.deferredId);
    ids.add(r.deferredId);
    if (r.semanticStatus !== 'DEFERRED_MANUAL_VALIDATION' || r.canonical !== false || r.executionBinding !== null
      || r.blocksCurrentPhase !== false || r.blocksNextPhase !== false || r.blocksC2C !== false || r.blocksC2D !== false
      || r.requiresFurtherSourceResearchNow !== false || r.manualValidationRequired !== true || r.resolutionStatus !== 'OPEN')
      throw new Error('Invalid deferred policy disposition: ' + r.deferredId);
    if (!r.officialSources.length || r.officialSources.some(s => !s.path || !/^[a-f0-9]{64}$/.test(s.sha256)
      || !Number.isInteger(s.page) || s.page < 1 || !['OFFICIAL_RULEBOOK','OFFICIAL_PRINTED_COMPONENT'].includes(s.authority)))
      throw new Error('Missing official provenance: ' + r.deferredId);
    if (!r.manualTestScenario?.trim() || !r.reason?.trim() || !r.field || !r.ambiguityType || !r.literalVariants.length)
      throw new Error('Missing manual validation evidence: ' + r.deferredId);
  }
}
/** Pass forward semantic records only; predecessor history retains its original statuses. */
export function validateForwardSemanticPolicy(value: unknown, deferredIds: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  const r=value as Record<string,unknown>;
  if (r.semanticStatus!==undefined && r.semanticStatus!=='OFFICIAL_SOURCE' && r.semanticStatus!=='DEFERRED_MANUAL_VALIDATION')
    throw new Error('Forward ambiguity must be classified as DEFERRED_MANUAL_VALIDATION');
  if (r.semanticStatus==='DEFERRED_MANUAL_VALIDATION') {
    if(r.canonical!==false || r.executionBinding!==null || !deferredIds.has(String(r.deferredId)))
      throw new Error('Deferred field has canonical behavior or lacks a register binding');
    if(r.blocksCurrentPhase===true || r.blocksNextPhase===true)
      throw new Error('Deferred ambiguity cannot block the development phase');
  }
  for(const v of Object.values(r))validateForwardSemanticPolicy(v,deferredIds);
}
