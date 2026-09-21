export type QuestSemanticImplementationStatus = 'IMPLEMENTED' | 'PARTIAL' | 'UNSUPPORTED' | 'SOURCE_UNRESOLVED';

export interface QuestSemanticObligation {
  obligationId: string;
  definitionId: string;
  sourceRuleIndex: number;
  semanticCategory: string;
  trigger: string | null;
  scope: string | null;
  sourceReference: unknown;
  parameters: unknown;
  runtimePrimitive: string | null;
  runtimeBindingId: string | null;
  implementationStatus: QuestSemanticImplementationStatus;
  proofIds: string[];
  blockerCode?: string;
}

export interface QuestSemanticSource {
  id: string;
  sourceStatus: string;
  unresolvedFields: unknown[];
  sourceReferences: string[];
  firewood: { tokens: number };
  specialRules: Array<{
    sourceRuleIndex: number;
    semanticCategory: string;
    trigger: string | null;
    scope: string | null;
    sourceReference: unknown;
    parameters: unknown;
  }>;
}

const TAINTED = 'community-quest-cove-lvl3-tainted-trinkets';
const FAMILY = 'community-quest-warrens-lvl1-family-trinkets';

type ObligationSeed = Omit<QuestSemanticObligation, 'definitionId' | 'sourceReference'>;

const taintedSeeds: ObligationSeed[] = [
  { obligationId: 'TT-01', sourceRuleIndex: 0, semanticCategory: 'room-setup', trigger: 'quest-start', scope: 'objective-rooms', parameters: { roomSemanticIdentities: ['cove-1', 'cove-5', 'cove-9'] }, runtimePrimitive: 'QUEST_RULE_ROOM_IDENTITY_SELECTION', runtimeBindingId: 'tainted-trinkets-objective-room-setup', implementationStatus: 'PARTIAL', proofIds: ['C1C3-TAINTED-RUNTIME'], blockerCode: 'QUEST_ROOM_IDENTITY_SELECTION_UNSUPPORTED' },
  { obligationId: 'TT-02', sourceRuleIndex: 0, semanticCategory: 'quest-setup', trigger: 'quest-start', scope: 'each-hero', parameters: { randomTrinketLevel: 3 }, runtimePrimitive: 'QUEST_RULE_TRINKET_ACQUISITION', runtimeBindingId: null, implementationStatus: 'UNSUPPORTED', proofIds: [], blockerCode: 'QUEST_TRINKET_ACQUISITION_UNSUPPORTED' },
  { obligationId: 'TT-03', sourceRuleIndex: 0, semanticCategory: 'quest-setup', trigger: 'quest-start', scope: 'hero-without-capacity', parameters: { fallback: 'choose-owned-trinket-and-taint' }, runtimePrimitive: 'QUEST_RULE_TRINKET_FALLBACK_CHOICE', runtimeBindingId: null, implementationStatus: 'UNSUPPORTED', proofIds: [], blockerCode: 'QUEST_TRINKET_ACQUISITION_UNSUPPORTED' },
  { obligationId: 'TT-04', sourceRuleIndex: 0, semanticCategory: 'trinket-state', trigger: 'quest-start', scope: 'assigned-trinket', parameters: { tainted: true, ownerHeroId: 'required', acquiredByQuest: 'required' }, runtimePrimitive: 'QUEST_RULE_TRINKET_STATE', runtimeBindingId: null, implementationStatus: 'UNSUPPORTED', proofIds: [], blockerCode: 'QUEST_TAINTED_TRINKET_STATE_UNSUPPORTED' },
  { obligationId: 'TT-05', sourceRuleIndex: 0, semanticCategory: 'objective-qualification', trigger: 'token-interacted', scope: 'objective-room-red-area', parameters: { heroLocation: 'red', oncePerRoom: true, taintedTrinketRequired: true }, runtimePrimitive: 'QUEST_RULE_ACTION_AREA_INTERACTION', runtimeBindingId: 'tainted-trinkets-cleanse-completion', implementationStatus: 'PARTIAL', proofIds: ['C1C3-TAINTED-RUNTIME'], blockerCode: 'QUEST_ACTION_AREA_INTERACTION_UNSUPPORTED' },
  { obligationId: 'TT-06', sourceRuleIndex: 0, semanticCategory: 'action-cost', trigger: 'token-interacted', scope: 'acting-hero', parameters: { actionCost: 1 }, runtimePrimitive: 'QUEST_RULE_ACTION_ECONOMY', runtimeBindingId: null, implementationStatus: 'UNSUPPORTED', proofIds: [], blockerCode: 'QUEST_ACTION_AREA_INTERACTION_UNSUPPORTED' },
  { obligationId: 'TT-07', sourceRuleIndex: 0, semanticCategory: 'objective-qualification', trigger: 'token-interacted', scope: 'cleansed-tainted-trinket', parameters: { xpPerCleanse: 1, maximumXp: 3 }, runtimePrimitive: 'QUEST_RULE_QUEST_COMPLETION', runtimeBindingId: 'tainted-trinkets-cleanse-completion', implementationStatus: 'PARTIAL', proofIds: ['C1C3-TAINTED-RUNTIME'], blockerCode: 'RUNTIME_SEMANTIC_PARTIAL' },
  { obligationId: 'TT-08', sourceRuleIndex: 0, semanticCategory: 'campaign-rule', trigger: 'return-to-hamlet', scope: 'heroes-with-tainted-trinkets', parameters: { choices: ['gain-2-negative-quirks-and-cleanse', 'remove-and-return-to-deck'] }, runtimePrimitive: 'QUEST_RULE_HAMLET_CHOICE', runtimeBindingId: null, implementationStatus: 'UNSUPPORTED', proofIds: [], blockerCode: 'QUEST_HAMLET_RESOLUTION_UNSUPPORTED' },
  { obligationId: 'TT-09', sourceRuleIndex: 0, semanticCategory: 'campaign-rule', trigger: 'return-to-hamlet', scope: 'chosen-hero', parameters: { negativeQuirks: 2 }, runtimePrimitive: 'QUEST_RULE_QUIRK_GAIN', runtimeBindingId: null, implementationStatus: 'UNSUPPORTED', proofIds: [], blockerCode: 'QUEST_HAMLET_RESOLUTION_UNSUPPORTED' },
];

const familySeeds: ObligationSeed[] = [
  { obligationId: 'FT-01', sourceRuleIndex: 0, semanticCategory: 'room-selection', trigger: 'quest-start', scope: 'lairs', parameters: { roomFilter: 'has-loot-chests' }, runtimePrimitive: 'QUEST_RULE_LOOT_CHEST_SELECTION', runtimeBindingId: 'family-trinkets-lair-room-setup', implementationStatus: 'PARTIAL', proofIds: ['C1C3-FAMILY-RUNTIME'], blockerCode: 'QUEST_LOOT_CHEST_SELECTION_UNSUPPORTED' },
  { obligationId: 'FT-02', sourceRuleIndex: 0, semanticCategory: 'loot', trigger: 'loot-chest', scope: 'first-chest-per-lair', parameters: { oncePerLair: true }, runtimePrimitive: 'QUEST_RULE_TOKEN_INTERACTION', runtimeBindingId: 'family-trinkets-first-chest-interaction', implementationStatus: 'PARTIAL', proofIds: ['C1C3-FAMILY-RUNTIME'], blockerCode: 'RUNTIME_SEMANTIC_PARTIAL' },
  { obligationId: 'FT-03', sourceRuleIndex: 0, semanticCategory: 'loot', trigger: 'loot-chest', scope: 'first-chest-per-lair', parameters: { trinketLevel: 2, realInventory: true }, runtimePrimitive: 'QUEST_RULE_TRINKET_ACQUISITION', runtimeBindingId: null, implementationStatus: 'UNSUPPORTED', proofIds: [], blockerCode: 'QUEST_TRINKET_ACQUISITION_UNSUPPORTED' },
  { obligationId: 'FT-04', sourceRuleIndex: 0, semanticCategory: 'trinket-provenance', trigger: 'loot-chest', scope: 'acquired-trinket', parameters: { acquiredThisDungeon: true, questRunId: 'required' }, runtimePrimitive: 'QUEST_RULE_TRINKET_PROVENANCE', runtimeBindingId: null, implementationStatus: 'UNSUPPORTED', proofIds: [], blockerCode: 'QUEST_TRINKET_PROVENANCE_UNSUPPORTED' },
  { obligationId: 'FT-05', sourceRuleIndex: 0, semanticCategory: 'campaign-rule', trigger: 'return-to-hamlet', scope: 'qualifying-level-2-trinkets', parameters: { minimum: 0, maximum: 3, playerChoice: true }, runtimePrimitive: 'QUEST_RULE_TRINKET_RETURN_EXCHANGE', runtimeBindingId: null, implementationStatus: 'UNSUPPORTED', proofIds: [], blockerCode: 'QUEST_TRINKET_RETURN_EXCHANGE_UNSUPPORTED' },
  { obligationId: 'FT-06', sourceRuleIndex: 0, semanticCategory: 'objective-qualification', trigger: 'return-to-hamlet', scope: 'returned-qualifying-trinkets', parameters: { xpPerReturnedTrinket: 1, maximumXp: 3 }, runtimePrimitive: 'QUEST_RULE_QUEST_COMPLETION', runtimeBindingId: null, implementationStatus: 'UNSUPPORTED', proofIds: [], blockerCode: 'QUEST_TRINKET_RETURN_EXCHANGE_UNSUPPORTED' },
];

function explicitObligations(source: QuestSemanticSource, seeds: ObligationSeed[]): QuestSemanticObligation[] {
  const sourceRule = source.specialRules.find((rule) => rule.sourceRuleIndex === 0);
  return seeds.map((seed) => ({
    ...seed,
    definitionId: source.id,
    sourceReference: sourceRule?.sourceReference ?? source.sourceReferences[0],
  }));
}

export function semanticObligationsForQuest(source: QuestSemanticSource): QuestSemanticObligation[] {
  if (source.id === TAINTED) return explicitObligations(source, taintedSeeds);
  if (source.id === FAMILY) return explicitObligations(source, familySeeds);
  if (source.id === 'community-quest-warrens-lvl3-deep-in-the-warrens') {
    const rule = source.specialRules[0];
    return [{
      obligationId: 'DITW-01', definitionId: source.id, sourceRuleIndex: rule.sourceRuleIndex,
      semanticCategory: rule.semanticCategory, trigger: rule.trigger, scope: rule.scope,
      sourceReference: rule.sourceReference, parameters: rule.parameters,
      runtimePrimitive: 'QUEST_RULE_PROVISION_INTERACTION', runtimeBindingId: 'deep-in-the-warrens-discard-after-leave',
      implementationStatus: 'IMPLEMENTED', proofIds: ['C1C2-SPECIAL-RULE-RUNTIME', 'C1C2-SPECIAL-RULE-SAVE-REPLAY', 'C1C2-E2E-SPECIAL-RULE'],
    }];
  }
  return source.specialRules.map((rule, index) => ({
    obligationId: `${source.id}:rule-${rule.sourceRuleIndex}:${index}`,
    definitionId: source.id,
    sourceRuleIndex: rule.sourceRuleIndex,
    semanticCategory: rule.semanticCategory,
    trigger: rule.trigger,
    scope: rule.scope,
    sourceReference: rule.sourceReference,
    parameters: rule.parameters,
    runtimePrimitive: null,
    runtimeBindingId: null,
    implementationStatus: 'UNSUPPORTED' as const,
    proofIds: [],
    blockerCode: 'QUEST_SOURCE_RULE_RUNTIME_UNSUPPORTED',
  }));
}

export function expectedSemanticObligationIds(definitionId: string): string[] | null {
  if (definitionId === TAINTED) return taintedSeeds.map((entry) => entry.obligationId);
  if (definitionId === FAMILY) return familySeeds.map((entry) => entry.obligationId);
  return null;
}

export function semanticCoverageErrors(definitionId: string, obligations: readonly QuestSemanticObligation[]): string[] {
  const expected = expectedSemanticObligationIds(definitionId);
  const errors: string[] = [];
  const expectedSeeds = definitionId === TAINTED ? taintedSeeds : definitionId === FAMILY ? familySeeds : null;
  if (expected) {
    const actual = new Set(obligations.map((entry) => entry.obligationId));
    for (const obligationId of expected) if (!actual.has(obligationId)) errors.push(`${obligationId}: obligation missing`);
    for (const obligation of obligations) if (!expected.includes(obligation.obligationId)) errors.push(`${obligation.obligationId}: unexpected obligation`);
  }
  for (const obligation of obligations) {
    const expectedSeed = expectedSeeds?.find((entry) => entry.obligationId === obligation.obligationId);
    if (expectedSeed && (
      obligation.sourceRuleIndex !== expectedSeed.sourceRuleIndex
      || obligation.semanticCategory !== expectedSeed.semanticCategory
      || obligation.trigger !== expectedSeed.trigger
      || obligation.scope !== expectedSeed.scope
      || obligation.runtimePrimitive !== expectedSeed.runtimePrimitive
      || JSON.stringify(obligation.parameters) !== JSON.stringify(expectedSeed.parameters)
    )) errors.push(`${obligation.obligationId}: source semantic contract changed`);
    if (obligation.implementationStatus === 'IMPLEMENTED' && (!obligation.runtimePrimitive || !obligation.runtimeBindingId || obligation.proofIds.length === 0)) {
      errors.push(`${obligation.obligationId}: implemented obligation lacks runtime binding or proof`);
    }
  }
  return errors;
}

export function runtimeSemanticComplete(definitionId: string, obligations: readonly QuestSemanticObligation[]): boolean {
  return semanticCoverageErrors(definitionId, obligations).length === 0
    && obligations.every((obligation) => obligation.implementationStatus === 'IMPLEMENTED' && obligation.proofIds.length > 0);
}

export function semanticCoverageCounts(obligations: readonly QuestSemanticObligation[]) {
  return {
    semanticObligationCount: obligations.length,
    implementedSemanticObligationCount: obligations.filter((entry) => entry.implementationStatus === 'IMPLEMENTED').length,
    partialSemanticObligationCount: obligations.filter((entry) => entry.implementationStatus === 'PARTIAL').length,
    unsupportedSemanticObligationCount: obligations.filter((entry) => entry.implementationStatus === 'UNSUPPORTED').length,
    sourceUnresolvedSemanticObligationCount: obligations.filter((entry) => entry.implementationStatus === 'SOURCE_UNRESOLVED').length,
  };
}
