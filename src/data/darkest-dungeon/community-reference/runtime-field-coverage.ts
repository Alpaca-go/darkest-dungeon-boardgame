import { NORMALIZED_CORPUS, type NormalizedField } from './normalized';
import type { CommunityRuntimeBlockerCode } from './runtime-profile';

export type RuntimeFieldClassification =
  | 'consumed'
  | 'explicit-source-blocker'
  | 'engine-unsupported-blocker'
  | 'display-only'
  | 'not-runtime-relevant';

export interface CommunityRuntimeFieldCoverage {
  requirementId: string;
  field: string;
  sourceStatus: string;
  sourceReference: string[];
  runtimeClassification: RuntimeFieldClassification;
  runtimeTarget: string;
  validator: string;
  tests: string[];
  blockerCode?: CommunityRuntimeBlockerCode;
  sourceValueHash: string;
  runtimeValueHash: string | null;
}

const stableValueHash = (value: unknown): string => {
  const text = JSON.stringify(value);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const SOURCE_BLOCKERS: Record<string, CommunityRuntimeBlockerCode> = {
  'tierB-templars-room.pitExitRule': 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED',
  'tierB-absolute-nothingness.stance': 'ABSOLUTE_NOTHINGNESS_STANCE_UNRESOLVED',
  'tierB-gestating-heart.lethalWoundTimingRuling': 'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED',
  'tierB-come-unto-your-maker.definition': 'COME_UNTO_YOUR_MAKER_UNRESOLVED',
  'tierB-darkest-dungeon-monster-deck.drawPolicy': 'MONSTER_DECK_DRAW_POLICY_UNRESOLVED',
};

function classify(requirementId: string, componentType: string, field: string, source: NormalizedField): Pick<CommunityRuntimeFieldCoverage, 'runtimeClassification' | 'runtimeTarget' | 'validator' | 'tests' | 'blockerCode'> {
  const key = `${requirementId}.${field}`;
  const sourceBlocker = SOURCE_BLOCKERS[key];
  if (sourceBlocker) return { runtimeClassification: 'explicit-source-blocker', runtimeTarget: `COMMUNITY_RUNTIME_BLOCKERS.${sourceBlocker}`, validator: 'validateCommunityRuntimeFieldCoverage', tests: [`BLOCK:${key}`], blockerCode: sourceBlocker };
  if (source.status === 'unresolved') return { runtimeClassification: 'explicit-source-blocker', runtimeTarget: 'UNCLASSIFIED_SOURCE_BLOCKER', validator: 'validateCommunityRuntimeFieldCoverage', tests: [] };
  if (componentType === 'battle-card' && field === 'resistances') return { runtimeClassification: 'engine-unsupported-blocker', runtimeTarget: 'communityCombatSemantics.categoricalResistances', validator: 'validateCommunityCombatSemantics', tests: [`TRACE:${key}`, `BLOCK:${key}`], blockerCode: 'GUARDIAN_RESISTANCE_ENGINE_UNSUPPORTED' };
  if (componentType === 'battle-card' && field === 'crit') return { runtimeClassification: 'engine-unsupported-blocker', runtimeTarget: 'communityCombatSemantics.criticalHits', validator: 'validateCommunityCombatSemantics', tests: [`TRACE:${key}`, `BLOCK:${key}`], blockerCode: 'GUARDIAN_CRIT_ENGINE_UNSUPPORTED' };
  if (field === 'name' || field === 'spikedPitPositions' || field === 'bossSlotPositions') return { runtimeClassification: 'display-only', runtimeTarget: `communityDisplay.${key}`, validator: 'validateCommunityRuntimeFieldCoverage', tests: [`CLASSIFY:${key}`] };
  return { runtimeClassification: 'consumed', runtimeTarget: `communityRuntimeProjection.${key}`, validator: 'validateCommunityRuntimeFieldCoverage', tests: [`TRACE:${key}`] };
}

export const COMMUNITY_RUNTIME_FIELD_COVERAGE: CommunityRuntimeFieldCoverage[] = NORMALIZED_CORPUS.requirements.flatMap((requirement) =>
  Object.entries(requirement.fields).map(([field, source]) => ({
    requirementId: requirement.requirementId,
    field,
    sourceStatus: source.status,
    sourceReference: [...source.sourceReference],
    sourceValueHash: stableValueHash(source.value),
    runtimeValueHash: source.status === 'unresolved' ? null : stableValueHash(source.value),
    ...classify(requirement.requirementId, requirement.componentType, field, source),
  })),
);

export const COMMUNITY_COMBAT_SEMANTICS = Object.fromEntries(
  NORMALIZED_CORPUS.requirements
    .filter((requirement) => requirement.componentType === 'battle-card')
    .map((requirement) => [requirement.requirementId, {
      categoricalResistances: requirement.fields.resistances?.value ?? null,
      criticalHits: requirement.fields.crit?.value ?? null,
      accuracy: requirement.fields.accuracy?.value ?? null,
      damage: requirement.fields.damage?.value ?? null,
      d10SkillTable: requirement.fields.d10SkillTable?.value ?? null,
      skillIds: requirement.fields.skillIds?.value ?? null,
    }]),
);

export const COMMUNITY_SHUFFLING_POLICY_PROVENANCE = {
  initialArea: { value: null, classification: 'engine-unsupported-blocker', blockerCode: 'SHUFFLING_INITIAL_AREA_UNRESOLVED' },
  capacityPerStance: { value: 1, classification: 'generic-engine-rule', sourceReference: 'src/types/shuffling-horror.ts#StancePriorityTracker' },
  horrorActionCount: { value: 2, classification: 'rulebook-structural-fact', sourceReference: 'DD_EN_COREBOX_RULES.pdf' },
  linkedActorActionCount: { value: 1, classification: 'rulebook-structural-fact', sourceReference: 'DD_EN_COREBOX_RULES.pdf' },
  heroStanceAssignment: { value: 'one-hero-per-stance', classification: 'generic-engine-rule', sourceReference: 'src/types/shuffling-horror.ts#HeroStanceAssignment' },
  initiativeOpportunity: { value: 'resolve-at-draw-time', classification: 'generic-engine-rule', sourceReference: 'src/types/shuffling-horror.ts#MonsterInitiativeOpportunityCard' },
  undulations: { value: 'definition-driven-permutation', classification: 'generic-engine-rule', sourceReference: 'src/game-engine/bosses/shuffling-horror/undulations-permutation.ts' },
} as const;

export function validateCommunityRuntimeFieldCoverage(coverage = COMMUNITY_RUNTIME_FIELD_COVERAGE): string[] {
  const errors: string[] = [];
  const expected = NORMALIZED_CORPUS.requirements.reduce((total, requirement) => total + Object.keys(requirement.fields).length, 0);
  if (coverage.length !== expected) errors.push(`field coverage count ${coverage.length}/${expected}`);
  const keys = coverage.map((entry) => `${entry.requirementId}.${entry.field}`);
  if (new Set(keys).size !== expected) errors.push('duplicate or missing field coverage key');
  for (const entry of coverage) {
    const canonical = COMMUNITY_RUNTIME_FIELD_COVERAGE.find((candidate) => candidate.requirementId === entry.requirementId && candidate.field === entry.field);
    if (coverage !== COMMUNITY_RUNTIME_FIELD_COVERAGE && canonical && entry.runtimeClassification !== canonical.runtimeClassification) errors.push(`classification drift ${entry.requirementId}.${entry.field}`);
    if (!entry.runtimeClassification || !entry.runtimeTarget || !entry.validator || entry.sourceReference.length === 0) errors.push(`unclassified field ${entry.requirementId}.${entry.field}`);
    if ((entry.runtimeClassification === 'consumed' || entry.runtimeClassification.endsWith('blocker')) && entry.tests.length === 0) errors.push(`untested runtime field ${entry.requirementId}.${entry.field}`);
    if (entry.runtimeClassification.endsWith('blocker') && !entry.blockerCode) errors.push(`blocker code missing ${entry.requirementId}.${entry.field}`);
    if (entry.runtimeClassification === 'consumed' && entry.runtimeValueHash !== entry.sourceValueHash) errors.push(`runtime value drift ${entry.requirementId}.${entry.field}`);
  }
  return errors;
}

export function runtimeFieldCoverageTotals(coverage = COMMUNITY_RUNTIME_FIELD_COVERAGE) {
  const byClassification = Object.fromEntries((['consumed', 'explicit-source-blocker', 'engine-unsupported-blocker', 'display-only', 'not-runtime-relevant'] as RuntimeFieldClassification[]).map((classification) => [classification, coverage.filter((entry) => entry.runtimeClassification === classification).length]));
  return { total: coverage.length, ...byClassification, unclassified: validateCommunityRuntimeFieldCoverage(coverage).filter((error) => error.startsWith('unclassified')).length };
}
