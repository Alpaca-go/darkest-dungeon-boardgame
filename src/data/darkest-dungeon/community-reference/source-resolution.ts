import dossierJson from '../../../../docs/data/darkest-dungeon/community-reference/community-source-blocker-resolution.json' with { type: 'json' };
import supplementJson from '../../../../docs/data/darkest-dungeon/community-reference/community-source-resolution-supplement.json' with { type: 'json' };

export type CommunitySourceResolutionVerdict = 'resolved' | 'partially-resolved' | 'unresolved' | 'conflicting';

export interface CommunitySourceResolutionTarget {
  blockerCode: string;
  semanticQuestion: string;
  currentState: string;
  searchedSources: string[];
  sourceFindings: Array<{ source: string; finding: string }>;
  verdict: CommunitySourceResolutionVerdict;
  resolvedValue: unknown;
  resolvedSemantics: { complete: boolean; leaves?: unknown[]; resolvedLeaves?: unknown; missingLeaves?: unknown[] };
  sourceAuthority: string[];
  sourceReferences: string[];
  confidence: 'high' | 'medium' | 'low';
  requiresAstraReview: boolean;
  runtimeDependencies: string[];
  notes: string;
}

export interface CommunitySourceResolutionDossier {
  schemaVersion: string;
  resolutionRunId: string;
  sourceAuthority: string;
  terminalState: string;
  inputs: Array<{ name: string; sha256: string; authority: string }>;
  summary: Record<string, number>;
  targets: CommunitySourceResolutionTarget[];
}

export interface CommunitySourceResolutionSupplement {
  schemaVersion: string;
  resolutionRunId: string;
  sourceAuthority: string;
  historicalEvidenceMutation: boolean;
  runtimeConsumptionAuthorized: boolean;
  semantics: Array<{
    semanticId: string;
    blockerCode: string;
    requirementId: string;
    leafPath: string;
    resolvedValue: unknown;
    sourceAuthority: string[];
    sourceReference: string[];
    guid: string[];
    cardId: number[];
    printedPage: number[];
    assetIdentity: string[];
    sourceSha256: Array<{ sourceReference: string; sha256: string }>;
    resolutionRunId: string;
  }>;
}

export const COMMUNITY_SOURCE_BLOCKER_RESOLUTION = dossierJson as CommunitySourceResolutionDossier;
export const COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT = supplementJson as CommunitySourceResolutionSupplement;

export const COMMUNITY_SOURCE_RESOLUTION_TARGETS = [
  'FINAL_PROVISION_POLICY_UNRESOLVED',
  'MONSTER_DECK_DRAW_POLICY_UNRESOLVED',
  'SHUFFLING_INITIAL_AREA_UNRESOLVED',
  'TEMPLARS_AREA_ADJACENCY_UNRESOLVED',
  'EXCAVATION_PROVISION_DIE_MAP_UNRESOLVED',
  'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED',
  'GUARDIAN_SPECIAL_SKILL_ENGINE_UNSUPPORTED',
  'MAMMOTH_STALK_NO_SPACE_RESOLUTION_ENGINE_UNSUPPORTED',
  'ABSOLUTE_NOTHINGNESS_STANCE_UNRESOLVED',
  'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED',
  'COME_UNTO_YOUR_MAKER_UNRESOLVED',
] as const;

const verdicts = new Set<CommunitySourceResolutionVerdict>(['resolved', 'partially-resolved', 'unresolved', 'conflicting']);
const allowedAuthorities = new Set(['OFFICIAL_RULEBOOK', 'OFFICIAL_DEMO', 'COMMUNITY_RETAIL_REFERENCE', 'OFFICIAL_ERRATA']);
const knownRulebookPages = new Set([10, 12, 16, 17, 18, 19, 20, 21, 24, 25, 30, 31, 35, 36, 39, 40, 41]);
const sha256 = /^[a-f0-9]{64}$/;
const serialized = (value: unknown): string => JSON.stringify(value).toLowerCase();

function validateTarget(target: CommunitySourceResolutionTarget): string[] {
  const errors: string[] = [];
  const label = target.blockerCode || '<missing-blocker>';
  if (!verdicts.has(target.verdict)) errors.push(`${label}: invalid verdict`);
  if (!target.semanticQuestion || !target.currentState || !target.searchedSources?.length || !target.sourceFindings?.length) errors.push(`${label}: research record incomplete`);
  if (!Array.isArray(target.sourceReferences) || target.sourceReferences.length === 0) errors.push(`${label}: source references empty`);
  if (!Array.isArray(target.sourceAuthority) || target.sourceAuthority.some((authority) => !allowedAuthorities.has(authority))) errors.push(`${label}: forbidden or unknown source authority`);
  if (target.sourceAuthority.includes('OFFICIAL_RETAIL_VERIFIED')) errors.push(`${label}: Community value relabeled Official Retail Verified`);
  if (target.verdict === 'resolved' && target.resolvedValue === null) errors.push(`${label}: resolved without value`);
  if ((target.verdict === 'unresolved' || target.verdict === 'conflicting') && target.resolvedValue !== null) errors.push(`${label}: non-resolved verdict has canonical value`);
  if (target.verdict === 'resolved' && target.resolvedSemantics?.complete !== true) errors.push(`${label}: partial compound semantic marked resolved`);
  if (target.verdict === 'partially-resolved' && target.resolvedSemantics?.complete !== false) errors.push(`${label}: partial verdict lacks incomplete compound marker`);
  if (serialized(target.resolvedValue).includes('prototype')) errors.push(`${label}: Prototype value copied as source truth`);
  if (target.sourceReferences.some((reference) => /^https?:/i.test(reference)) || target.sourceAuthority.some((authority) => /discovery/i.test(authority))) errors.push(`${label}: discovery-only web source used as canonical proof`);
  for (const reference of target.sourceReferences.filter((item) => item.startsWith('rulebook:'))) {
    const page = Number(reference.slice('rulebook:'.length));
    if (!knownRulebookPages.has(page)) errors.push(`${label}: wrong Rulebook attribution ${reference}`);
  }
  if (target.sourceFindings.some((finding) => /conflict/i.test(`${finding.source} ${finding.finding}`)) && target.verdict !== 'conflicting') errors.push(`${label}: source conflict silently collapsed`);

  if (label === 'MONSTER_DECK_DRAW_POLICY_UNRESOLVED' && target.verdict === 'resolved') {
    const value = target.resolvedValue as Record<string, unknown>;
    if (serialized(value).includes('uniform random among') || value.savedDeckIdsArePolicy === true || serialized(value).includes('deckids order')) errors.push(`${label}: forbidden logical-uniform or DeckIDs policy`);
    if (!serialized(value).includes('physical') || !serialized(value).includes('battle end')) errors.push(`${label}: physical draw/return semantics incomplete`);
  }
  if (label === 'TEMPLARS_AREA_ADJACENCY_UNRESOLVED' && target.verdict === 'resolved' && !target.sourceReferences.some((reference) => reference.startsWith('rulebook:'))) errors.push(`${label}: adjacency inferred from artwork only`);
  if (label === 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED' && target.verdict === 'resolved' && /generic movement|ordinary movement/.test(serialized(target.resolvedValue))) errors.push(`${label}: pit exit inferred from generic movement`);
  if (label === 'COME_UNTO_YOUR_MAKER_UNRESOLVED' && /videogame/.test(serialized(target.resolvedValue))) errors.push(`${label}: videogame definition used`);
  if (label === 'EXCAVATION_PROVISION_DIE_MAP_UNRESOLVED' && /assum.{0,20}(same|identical).{0,20}final/.test(serialized(target.resolvedValue))) errors.push(`${label}: Final/Excavation tables assumed identical`);
  return errors;
}

export function validateCommunitySourceResolution(
  dossier: CommunitySourceResolutionDossier = COMMUNITY_SOURCE_BLOCKER_RESOLUTION,
  supplement: CommunitySourceResolutionSupplement = COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT,
): string[] {
  const errors: string[] = [];
  if (dossier.schemaVersion !== 'phase11a3-community-source-blocker-resolution.v1') errors.push('dossier schema');
  if (supplement.schemaVersion !== 'phase11a3-community-source-resolution-supplement.v1') errors.push('supplement schema');
  if (dossier.sourceAuthority !== 'COMMUNITY_RETAIL_REFERENCE' || supplement.sourceAuthority !== 'COMMUNITY_RETAIL_REFERENCE') errors.push('Community authority isolation');
  if (dossier.terminalState !== 'COMMUNITY-SOURCE-BLOCKERS-RESEARCHED') errors.push('terminal state');
  if (dossier.resolutionRunId !== supplement.resolutionRunId) errors.push('resolution run mismatch');
  if (supplement.historicalEvidenceMutation || supplement.runtimeConsumptionAuthorized) errors.push('supplement scope violation');
  if (dossier.inputs.some((input) => !sha256.test(input.sha256))) errors.push('input SHA missing');

  const expected = new Set<string>(COMMUNITY_SOURCE_RESOLUTION_TARGETS);
  const actual = dossier.targets.map((target) => target.blockerCode);
  if (actual.length !== expected.size || new Set(actual).size !== expected.size || actual.some((code) => !expected.has(code))) errors.push('target coverage');
  for (const target of dossier.targets) errors.push(...validateTarget(target));

  const counts = (verdict: CommunitySourceResolutionVerdict) => dossier.targets.filter((target) => target.verdict === verdict).length;
  const expectedSummary = { targets: 11, resolved: counts('resolved'), partiallyResolved: counts('partially-resolved'), unresolved: counts('unresolved'), conflicting: counts('conflicting'), astraReviewRequired: dossier.targets.filter((target) => target.requiresAstraReview).length };
  for (const [key, value] of Object.entries(expectedSummary)) if (dossier.summary[key] !== value) errors.push(`summary mismatch: ${key}`);

  const semanticIds = new Set<string>();
  for (const semantic of supplement.semantics) {
    const label = semantic.semanticId || '<missing-semantic>';
    if (!label || semanticIds.has(label)) errors.push(`${label}: duplicate/missing semantic id`);
    semanticIds.add(label);
    if (!expected.has(semantic.blockerCode) || !semantic.requirementId || !semantic.leafPath) errors.push(`${label}: invalid semantic binding`);
    if (semantic.resolutionRunId !== dossier.resolutionRunId) errors.push(`${label}: resolution run mismatch`);
    if (!semantic.sourceReference?.length) errors.push(`${label}: source references empty`);
    if (semantic.sourceAuthority.some((authority) => !allowedAuthorities.has(authority) || authority === 'OFFICIAL_RETAIL_VERIFIED')) errors.push(`${label}: authority escalation`);
    if (serialized(semantic.resolvedValue).includes('prototype')) errors.push(`${label}: Prototype value copied as source truth`);
    if (semantic.sourceReference.some((reference) => /^https?:/i.test(reference))) errors.push(`${label}: discovery-only reference`);
    if (!semantic.sourceSha256?.length || semantic.sourceSha256.some((source) => !sha256.test(source.sha256))) errors.push(`${label}: source SHA missing`);
    const assetReferences = semantic.sourceReference.filter((reference) => reference.startsWith('asset:'));
    const hashedReferences = new Set(semantic.sourceSha256.map((source) => source.sourceReference));
    if (assetReferences.length && (!semantic.guid?.length || !semantic.assetIdentity?.length || assetReferences.some((reference) => !hashedReferences.has(reference)))) errors.push(`${label}: image-derived rule missing source identity/SHA`);
  }
  return errors;
}
