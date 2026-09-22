import type { QuestDefinition } from '../../types';
import type {
  QuestFirewoodSetup,
  QuestDungeonComposition,
  QuestRoomTokenType,
  QuestXpUnitDefinition,
  RuntimeContentMetadata,
} from '../../types/content-runtime';
import type { TrinketDefinition, TrinketLevel } from '../../types/trinkets';
import questData from './quests/data.json' with { type: 'json' };
import trinketData from './trinkets/data.json' with { type: 'json' };
import { buyPriceForLevel, sellPriceForLevel } from '../trinkets/trinket-pricing';
import {
  PRODUCTION_PROOF_REGISTRY,
  allProofsResolve,
  allProofsUseSurface,
  type RegisteredProductionProof,
} from '../../audit/production-proof-registry';
import {
  semanticCoverageCounts,
  semanticObligationsForQuest,
  runtimeSemanticComplete as obligationsAreRuntimeComplete,
  type QuestSemanticObligation,
} from '../../audit/quest-semantic-coverage';
import { restAllocationSemanticsImplemented } from '../../audit/rest-semantic-contract';
import type { CampaignState } from '../../types';
import type { QuestRuntimeState } from '../../types/content-runtime';
import type { QuestSpecialRuleDefinition } from '../../game-engine/quests/quest-special-rule-types';
import {
  trinketRuntimeSemanticComplete,
  trinketSemanticObligations,
  trinketSourceSemanticComplete,
  type TrinketSemanticObligation,
} from '../../audit/trinket-semantic-coverage';

export type ProductionStatus = 'PRODUCTION_READY' | 'ADAPTER_REQUIRED' | 'ENGINE_PRIMITIVE_MISSING' | 'SOURCE_BLOCKED';

export interface RuntimeProofState {
  adapterPresent: boolean;
  productionProofPresent: boolean;
  saveReplayProofPresent: boolean;
  selectorProofPresent: boolean;
  e2eProofPresent: boolean;
}

export interface RuntimeCapabilityRecord {
  definitionId: string;
  sourceSupported: boolean;
  engineCapable: boolean;
  sourceSemanticComplete: boolean;
  runtimeSemanticComplete: boolean;
  semanticObligationCount: number;
  implementedSemanticObligationCount: number;
  partialSemanticObligationCount: number;
  unsupportedSemanticObligationCount: number;
  sourceUnresolvedSemanticObligationCount: number;
  semanticObligations: QuestSemanticObligation[];
  trinketSemanticObligations?: TrinketSemanticObligation[];
  /** Backward-compatible alias for sourceSemanticComplete. */
  semanticComplete: boolean;
  adapterComplete: boolean;
  selectorReachable: boolean;
  productionProofComplete: boolean;
  saveReplayProofComplete: boolean;
  e2eProofComplete: boolean;
  productionUiProofComplete: boolean;
  productionReady: boolean;
  sourceStatus: string;
  semanticStatus: string;
  objectiveRuntimeSupport?: ProductionStatus;
  specialRuleRuntimeSupport?: ProductionStatus;
  positiveRuntimeSupport?: ProductionStatus;
  negativeRuntimeSupport?: ProductionStatus;
  requiredPrimitives: string[];
  existingPrimitives: string[];
  missingPrimitives: string[];
  declaredMissingPrimitives: string[];
  adapterStatus: 'IMPLEMENTED' | 'REQUIRED' | 'NOT_APPLICABLE';
  productionStatus: ProductionStatus;
  blockerCodes: string[];
  measuredRuntimeProof: RuntimeProofState;
}

export interface CommunityTrinketRuntimeAdapter {
  adapterId: string;
  definitionId: string;
  requiredPrimitives: string[];
  definition: TrinketDefinition;
}

export interface CommunityQuestRuntimeAdapter {
  adapterId: 'c1c1-simple-community-quest-v1' | 'c1c2-provision-discard-quest-v1' | 'c1c3-multi-primitive-quest-v1';
  definitionId: string;
  questDefinitionId: string;
  requiredPrimitives: string[];
  definition: QuestDefinition;
  setup(state: QuestRuntimeState): QuestRuntimeState;
  evaluateObjective(campaign: CampaignState): number;
  evaluateCompletion(campaign: CampaignState): boolean;
  applyRewards(campaign: CampaignState): CampaignState;
  specialRules: QuestSpecialRuleDefinition[];
}

export interface CommunityProductionProof {
  definitionId: string;
  runtimeAdapterId: string;
  requiredPrimitives?: string[];
  primitiveProofRequirements?: Record<string, string>;
  sourceSupported: boolean;
  semanticSupported: boolean;
  stateful: boolean;
  productionTests: string[];
  saveReplayTests: string[];
  selectorTests: string[];
  e2eTests: string[];
}

type SourceQuest = (typeof questData)[number];
type SourceTrinket = (typeof trinketData)[number];

export const normalizePrimitives = (message: string): string[] => {
  const primitives: string[] = [];
  if (/timing voluntary-declaration/i.test(message)) primitives.push('VOLUNTARY_DECLARATION_RUNTIME');
  if (/timing hero-skill-resolution/i.test(message)) primitives.push('POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW');
  if (/timing hero-skill-hits/i.test(message)) primitives.push('PRE_DAMAGE_HIT_TRINKET_WINDOW');
  if (/primitive:set-damage/i.test(message)) primitives.push('SET_DAMAGE_OVERRIDE');
  if (/timing hero-(heals|is-healed)/i.test(message)) primitives.push('STAGED_HEALING_TRINKET_WINDOWS');
  if (/room-token composition/i.test(message)) primitives.push('QUEST_ROOM_TOKEN_COMPOSITION');
  if (/firewood|resting-point/i.test(message)) primitives.push('QUEST_FIREWOOD_RESTING_POINT_SETUP');
  if (/repeated per-unit XP/i.test(message)) primitives.push('QUEST_XP_UNIT_ACCOUNTING');
  if (/quest-specific policies/i.test(message)) primitives.push('QUEST_SPECIAL_RULE_ADAPTER');
  return primitives.length > 0 ? primitives : [message.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase()];
};

export function implementedQuestPrimitives(restSemanticsReady = restAllocationSemanticsImplemented()): ReadonlySet<string> {
  return new Set([
    'QUEST_ROOM_TOKEN_COMPOSITION',
    'QUEST_FIREWOOD_RESTING_POINT_SETUP',
    'QUEST_XP_UNIT_ACCOUNTING',
    'QUEST_RULE_PROVISION_INTERACTION',
    'QUEST_RULE_ROOM_SETUP',
    'QUEST_RULE_TOKEN_INTERACTION',
    'QUEST_RULE_QUEST_COMPLETION',
    ...(restSemanticsReady ? ['QUEST_REST_ALLOCATION_SEMANTICS'] : []),
  ]);
}

const IMPLEMENTED_QUEST_PRIMITIVES = implementedQuestPrimitives();

type SimpleSourceQuest = SourceQuest & {
  objective: {
    targetEntity: QuestXpUnitDefinition['targetEntity'];
    minimumQuestGoal: number | null;
    xpUnit: { amount: number; targetCount: number };
  };
  rewards: Array<{ kind: string; cap?: { amount?: number } }>;
  dungeonStructure: {
    roomTokens: Partial<Record<QuestRoomTokenType, number>>;
    placement: 'shuffle-on-layout-room-slots';
  };
  specialRules: unknown[];
  firewood: QuestFirewoodSetup;
};

const DEEP_IN_THE_WARRENS_ID = 'community-quest-warrens-lvl3-deep-in-the-warrens';
export const TAINTED_TRINKETS_ID = 'community-quest-cove-lvl3-tainted-trinkets';
export const FAMILY_TRINKETS_ID = 'community-quest-warrens-lvl1-family-trinkets';

const SPECIAL_RULE_PRIMITIVES: Readonly<Record<string, string>> = Object.freeze({
  'room-setup': 'QUEST_RULE_ROOM_SETUP',
  'dungeon-setup': 'QUEST_RULE_ROOM_SETUP',
  'room-selection': 'QUEST_RULE_ROOM_SETUP',
  'room-clear-rule': 'QUEST_RULE_ROOM_CLEAR',
  exploration: 'QUEST_RULE_EXPLORATION',
  scouting: 'QUEST_RULE_EXPLORATION',
  'battle-start': 'QUEST_RULE_BATTLE_SETUP',
  'battle-end': 'QUEST_RULE_BATTLE_RESULT',
  initiative: 'QUEST_RULE_BATTLE_SETUP',
  'monster-pool': 'QUEST_RULE_MONSTER_STATE',
  'monster-spawn': 'QUEST_RULE_MONSTER_STATE',
  'monster-stat-modifier': 'QUEST_RULE_MONSTER_STATE',
  curio: 'QUEST_RULE_TOKEN_INTERACTION',
  loot: 'QUEST_RULE_TOKEN_INTERACTION',
  provision: 'QUEST_RULE_PROVISION_INTERACTION',
  'reward-modifier': 'QUEST_RULE_REWARD_OVERRIDE',
  'objective-qualification': 'QUEST_RULE_QUEST_COMPLETION',
  'objective-completion': 'QUEST_RULE_QUEST_COMPLETION',
  'quest-setup': 'QUEST_RULE_ROOM_SETUP',
  'campaign-rule': 'QUEST_RULE_QUEST_COMPLETION',
  'hero-stress': 'QUEST_RULE_HERO_STATE',
  'hero-condition': 'QUEST_RULE_HERO_STATE',
});

export function classifyQuestSpecialRulePrimitives(source: SourceQuest): string[] {
  return [...new Set(source.specialRules.map((rule) =>
    SPECIAL_RULE_PRIMITIVES[rule.semanticCategory] ?? 'SOURCE_SEMANTIC_UNRESOLVED'))];
}

function isC1C1SimpleCoreQuest(source: SourceQuest): source is SimpleSourceQuest {
  const declared = [...new Set(source.runtimeSupport.missingCapabilities.flatMap(normalizePrimitives))];
  return source.sourceStatus === 'source-supported'
    && source.questType === 'standard'
    && Array.isArray(source.specialRules) && source.specialRules.length === 0
    && declared.length === 3
    && declared.every((primitive) => IMPLEMENTED_QUEST_PRIMITIVES.has(primitive));
}

function isC1C2ProvisionQuest(source: SourceQuest): source is SimpleSourceQuest {
  return source.id === DEEP_IN_THE_WARRENS_ID
    && source.sourceStatus === 'source-supported'
    && source.questType === 'standard'
    && source.firewood.tokens === 0
    && source.unresolvedFields.length === 0
    && classifyQuestSpecialRulePrimitives(source).join(',') === 'QUEST_RULE_PROVISION_INTERACTION';
}

function isC1C3MultiPrimitiveQuest(source: SourceQuest): source is SimpleSourceQuest {
  return (source.id === TAINTED_TRINKETS_ID || source.id === FAMILY_TRINKETS_ID)
    && source.sourceStatus === 'source-supported'
    && source.questType === 'standard'
    && source.firewood.tokens === 0
    && source.unresolvedFields.length === 0;
}

function c1c3Rules(source: SimpleSourceQuest): QuestSpecialRuleDefinition[] {
  const sourceReferences = [source.sourceReferences[0], 'printedSpecialRules.0'];
  const conditions = [
    { type: 'runtime-content-profile' as const, profile: 'community-complete-edition' as const },
    { type: 'quest-active' as const },
  ];
  if (source.id === TAINTED_TRINKETS_ID) return [
    {
      id: 'tainted-trinkets-objective-room-setup', trigger: 'quest-start', conditions,
      effects: [{ type: 'place-quest-token-in-rooms', roomTokenType: 'objective', questTokenType: 'tainted-trinket-objective', count: 3, selectionPolicy: 'all-matching-source-rooms' }],
      sourceReferences, semanticCategory: 'room-setup', printedSpecialRuleIndex: 0,
    },
    {
      id: 'tainted-trinkets-cleanse-completion', trigger: 'token-interacted', conditions,
      effects: [
        { type: 'consume-current-room-quest-token', questTokenType: 'tainted-trinket-objective', progressCounter: 'cleansedTaintedTrinkets' },
        { type: 'complete-when-quest-token-count', questTokenType: 'tainted-trinket-objective', requiredCount: 3 },
      ],
      sourceReferences, semanticCategory: 'quest-completion', printedSpecialRuleIndex: 0,
    },
  ];
  return [
    {
      id: 'family-trinkets-lair-room-setup', trigger: 'quest-start', conditions,
      effects: [{ type: 'place-quest-token-in-rooms', roomTokenType: 'lair', questTokenType: 'family-trinket-chest', count: 3, selectionPolicy: 'all-matching-source-rooms' }],
      sourceReferences, semanticCategory: 'room-setup', printedSpecialRuleIndex: 0,
    },
    {
      id: 'family-trinkets-first-chest-interaction', trigger: 'token-interacted', conditions,
      effects: [{ type: 'consume-current-room-quest-token', questTokenType: 'family-trinket-chest', progressCounter: 'familyTrinketsRecovered' }],
      sourceReferences, semanticCategory: 'token-interaction', printedSpecialRuleIndex: 0,
    },
    {
      id: 'family-trinkets-return-completion', trigger: 'quest-completed', conditions,
      effects: [{ type: 'complete-when-quest-token-count', questTokenType: 'family-trinket-chest', requiredCount: 3 }],
      sourceReferences, semanticCategory: 'quest-completion', printedSpecialRuleIndex: 0,
    },
  ];
}

function adaptCommunityQuest(source: SimpleSourceQuest): CommunityQuestRuntimeAdapter {
  const provisionRule = source.id === DEEP_IN_THE_WARRENS_ID;
  const multiPrimitiveRule = source.id === TAINTED_TRINKETS_ID || source.id === FAMILY_TRINKETS_ID;
  if (source.specialRules.length !== 0 && !provisionRule && !multiPrimitiveRule) throw new Error(`Quest adapter rejects unsupported special rules: ${source.id}`);
  const roomTokens = Object.entries(source.dungeonStructure.roomTokens)
    .filter((entry): entry is [QuestRoomTokenType, number] => Number.isInteger(entry[1]) && Number(entry[1]) > 0)
    .map(([roomType, count]) => ({ roomType, count }));
  const composition: QuestDungeonComposition = {
    roomTokens,
    placement: source.dungeonStructure.placement,
  };
  const reward = source.rewards.find((entry) => entry.kind === 'xp');
  const xpUnit: QuestXpUnitDefinition = {
    qualificationEvent: 'room-cleared',
    targetEntity: source.objective.targetEntity,
    unitSize: source.objective.xpUnit.targetCount,
    xpPerUnit: source.objective.xpUnit.amount,
    maximumXp: reward?.cap?.amount ?? null,
    minimumQuestGoal: source.objective.minimumQuestGoal,
  };
  const runtimeContentMetadata: RuntimeContentMetadata = {
    sourceDefinitionId: source.id,
    contentSet: source.contentSet === 'crimson-court' ? 'crimson-court' : 'core',
    region: source.region as RuntimeContentMetadata['region'],
    sourceOrigin: 'community-complete-edition',
  };
  const firewoodSetup: QuestFirewoodSetup = {
    tokens: Number(source.firewood.tokens),
    restingPoints: Number(source.firewood.restingPoints),
  };
  return {
    adapterId: multiPrimitiveRule ? 'c1c3-multi-primitive-quest-v1'
      : provisionRule ? 'c1c2-provision-discard-quest-v1' : 'c1c1-simple-community-quest-v1',
    definitionId: source.id,
    questDefinitionId: source.id,
    requiredPrimitives: [
      'QUEST_ROOM_TOKEN_COMPOSITION',
      'QUEST_FIREWOOD_RESTING_POINT_SETUP',
      'QUEST_XP_UNIT_ACCOUNTING',
      ...(firewoodSetup.tokens > 0 ? ['QUEST_REST_ALLOCATION_SEMANTICS'] : []),
      ...(provisionRule ? ['QUEST_RULE_PROVISION_INTERACTION'] : []),
      ...(multiPrimitiveRule ? classifyQuestSpecialRulePrimitives(source) : []),
    ],
    definition: {
      id: source.id,
      name: source.printedName,
      type: 'standard',
      description: `Source-backed ${source.region} quest.`,
      dungeonLevel: Number(source.level),
      roomCount: Number(source.roomCount),
      objective: `${xpUnit.xpPerUnit} XP per ${xpUnit.unitSize} ${xpUnit.targetEntity}${xpUnit.unitSize === 1 ? '' : 's'} cleared`,
      reward: `0-${xpUnit.maximumXp ?? 3} XP`,
      difficulty: source.level === 1 ? 'easy' : source.level === 2 ? 'normal' : 'hard',
      objectives: [],
      runtimeContentMetadata,
      dungeonComposition: composition,
      xpUnit,
      firewoodSetup,
    },
    setup: (state) => state,
    evaluateObjective: (campaign) => campaign.questRuntimeState?.qualifiedUnitCount ?? 0,
    evaluateCompletion: (campaign) => Boolean(campaign.dungeon?.objectiveComplete),
    applyRewards: (campaign) => campaign,
    specialRules: provisionRule ? [{
      id: 'deep-in-the-warrens-discard-after-leave',
      trigger: 'leave-room',
      conditions: [
        { type: 'runtime-content-profile', profile: 'community-complete-edition' },
        { type: 'quest-active' },
      ],
      effects: [{ type: 'discard-chosen-provision', amount: 1 }],
      sourceReferences: [source.sourceReferences[0], 'printedSpecialRules.0'],
      semanticCategory: 'provision',
      printedSpecialRuleIndex: 0,
    }] : multiPrimitiveRule ? c1c3Rules(source) : [],
  };
}

export const COMMUNITY_QUEST_RUNTIME_ADAPTERS: Readonly<Record<string, CommunityQuestRuntimeAdapter>> = Object.freeze(
  Object.fromEntries(questData.filter((source) => isC1C1SimpleCoreQuest(source) || isC1C2ProvisionQuest(source) || isC1C3MultiPrimitiveQuest(source)).map((source) => {
    const adapter = adaptCommunityQuest(source as SimpleSourceQuest);
    return [source.id, adapter];
  })),
);

const questDefinitionIds = Object.keys(COMMUNITY_QUEST_RUNTIME_ADAPTERS);
export const COMMUNITY_QUEST_PRODUCTION_PROOFS: Readonly<Record<string, CommunityProductionProof>> = Object.freeze(
  Object.fromEntries(questDefinitionIds.map((definitionId) => [definitionId, {
    definitionId,
    runtimeAdapterId: COMMUNITY_QUEST_RUNTIME_ADAPTERS[definitionId].adapterId,
    requiredPrimitives: [...COMMUNITY_QUEST_RUNTIME_ADAPTERS[definitionId].requiredPrimitives],
    primitiveProofRequirements: COMMUNITY_QUEST_RUNTIME_ADAPTERS[definitionId].definition.firewoodSetup!.tokens > 0
      ? { 'C1C1R2-E2E-REST-ALLOCATION': 'QUEST_REST_ALLOCATION_SEMANTICS' }
      : undefined,
    sourceSupported: true,
    semanticSupported: true,
    stateful: true,
    productionTests: definitionId === TAINTED_TRINKETS_ID ? ['C1C3-TAINTED-RUNTIME']
      : definitionId === FAMILY_TRINKETS_ID ? ['C1C3-FAMILY-RUNTIME']
      : definitionId === DEEP_IN_THE_WARRENS_ID
      ? ['C1C2-SPECIAL-RULE-RUNTIME']
      : definitionId.startsWith('community-quest-crimson-court-')
        ? ['C1C2-ADAPTER-RUNTIME'] : ['C1C1-QUEST-RUNTIME', 'C1C1R-QUEST-SOURCE-SETUP'],
    saveReplayTests: definitionId === TAINTED_TRINKETS_ID ? ['C1C3-TAINTED-SAVE-REPLAY']
      : definitionId === FAMILY_TRINKETS_ID ? ['C1C3-FAMILY-SAVE-REPLAY']
      : definitionId === DEEP_IN_THE_WARRENS_ID ? ['C1C2-SPECIAL-RULE-SAVE-REPLAY']
      : definitionId.startsWith('community-quest-crimson-court-') ? ['C1C2-ADAPTER-SAVE-REPLAY'] : ['C1C1-QUEST-SAVE-REPLAY'],
    selectorTests: definitionId === TAINTED_TRINKETS_ID ? ['C1C3-TAINTED-SELECTOR']
      : definitionId === FAMILY_TRINKETS_ID ? ['C1C3-FAMILY-SELECTOR']
      : definitionId === DEEP_IN_THE_WARRENS_ID ? ['C1C2-SPECIAL-RULE-SELECTOR']
      : definitionId.startsWith('community-quest-crimson-court-') ? ['C1C2-ADAPTER-SELECTOR'] : ['C1C1-QUEST-SELECTOR'],
    e2eTests: definitionId === TAINTED_TRINKETS_ID ? ['C1C3-E2E-TAINTED-TRINKETS']
      : definitionId === FAMILY_TRINKETS_ID ? ['C1C3-E2E-FAMILY-TRINKETS']
      : definitionId === DEEP_IN_THE_WARRENS_ID ? ['C1C2-E2E-SPECIAL-RULE'] : [
      'C1C1R-E2E-SIMPLE-QUEST-ADAPTER',
      ...(COMMUNITY_QUEST_RUNTIME_ADAPTERS[definitionId].definition.firewoodSetup!.tokens > 0
        ? ['C1C1R2-E2E-REST-ALLOCATION'] : []),
    ],
  }])),
);

export function questAdapterSourceSetupErrors(source: SourceQuest, adapter: CommunityQuestRuntimeAdapter | undefined): string[] {
  if (!adapter) return ['adapter missing'];
  const errors: string[] = [];
  if (adapter.definition.firewoodSetup?.tokens !== Number(source.firewood.tokens)) errors.push('firewood token mismatch');
  if (adapter.definition.firewoodSetup?.restingPoints !== Number(source.firewood.restingPoints)) errors.push('resting point mismatch');
  return errors;
}

export function evaluateCommunityQuestCapability(
  source: SourceQuest,
  adapters: Readonly<Record<string, CommunityQuestRuntimeAdapter>> = COMMUNITY_QUEST_RUNTIME_ADAPTERS,
  proofs: Readonly<Record<string, CommunityProductionProof>> = COMMUNITY_QUEST_PRODUCTION_PROOFS,
  registeredProofs: Readonly<Record<string, RegisteredProductionProof>> = PRODUCTION_PROOF_REGISTRY,
  implementedPrimitives: ReadonlySet<string> = IMPLEMENTED_QUEST_PRIMITIVES,
  externalDependencies: ReadonlySet<string> = new Set(),
): RuntimeCapabilityRecord {
  const sourceBlocked = source.sourceStatus !== 'source-supported';
  const declaredMissingPrimitives = [...new Set(source.runtimeSupport.missingCapabilities.flatMap(normalizePrimitives))];
  const specialRulePrimitives = classifyQuestSpecialRulePrimitives(source);
  const semanticObligations = semanticObligationsForQuest(source);
  const obligationPrimitives = semanticObligations.flatMap((obligation) => obligation.runtimePrimitive ? [obligation.runtimePrimitive] : []);
  const obligationCounts = semanticCoverageCounts(semanticObligations);
  const basePrimitives = declaredMissingPrimitives.filter((primitive) => primitive !== 'QUEST_SPECIAL_RULE_ADAPTER');
  const adapter = adapters[source.id];
  const requiredPrimitives = [...new Set([
    ...basePrimitives,
    ...specialRulePrimitives,
    ...obligationPrimitives,
    ...((adapter?.definition.firewoodSetup?.tokens ?? 0) > 0 ? ['QUEST_REST_ALLOCATION_SEMANTICS'] : []),
    ...(source.id === FAMILY_TRINKETS_ID ? ['LEVEL_2_TRINKET_SOURCE_DECK_COMPLETE'] : []),
  ])];
  const availablePrimitives = new Set([...implementedPrimitives, ...externalDependencies]);
  const missingPrimitives = requiredPrimitives.filter((primitive) => !availablePrimitives.has(primitive));
  const sourceSemanticComplete = !sourceBlocked
    && source.unresolvedFields.length === 0
    && !specialRulePrimitives.includes('SOURCE_SEMANTIC_UNRESOLVED')
    && (!(Number(source.firewood.tokens) > 0) || implementedPrimitives.has('QUEST_REST_ALLOCATION_SEMANTICS'));
  const runtimeSemanticComplete = sourceSemanticComplete && obligationsAreRuntimeComplete(source.id, semanticObligations);
  const adapterValid = Boolean(adapter && questAdapterSourceSetupErrors(source, adapter).length === 0);
  const proof = proofs[source.id];
  const proofMatches = Boolean(adapterValid && adapter && proof && proof.definitionId === source.id && proof.runtimeAdapterId === adapter.adapterId);
  const measuredRuntimeProof: RuntimeProofState = {
    adapterPresent: adapterValid,
    productionProofPresent: Boolean(proofMatches && allProofsResolve(proof.productionTests, 'production-runtime', source.id, registeredProofs)),
    saveReplayProofPresent: Boolean(proofMatches && allProofsResolve(proof.saveReplayTests, 'save-replay', source.id, registeredProofs)),
    selectorProofPresent: Boolean(proofMatches && allProofsResolve(proof.selectorTests, 'selector', source.id, registeredProofs)),
    e2eProofPresent: Boolean(proofMatches && allProofsResolve(
      proof.e2eTests,
      'e2e',
      source.id,
      registeredProofs,
      adapter?.adapterId,
      proof.requiredPrimitives ?? [],
      proof.primitiveProofRequirements ?? {},
    )),
  };
  const productionUiProofComplete = Boolean(proofMatches && proof && measuredRuntimeProof.e2eProofPresent
    && allProofsUseSurface(proof.e2eTests, 'production-ui', registeredProofs));
  const proofComplete = Boolean(proofMatches && proof.sourceSupported && proof.semanticSupported
    && measuredRuntimeProof.productionProofPresent && measuredRuntimeProof.saveReplayProofPresent
    && measuredRuntimeProof.selectorProofPresent && productionUiProofComplete);
  const productionStatus: ProductionStatus = sourceBlocked ? 'SOURCE_BLOCKED'
    : missingPrimitives.length > 0 ? 'ENGINE_PRIMITIVE_MISSING'
      : runtimeSemanticComplete && adapterValid && proofComplete ? 'PRODUCTION_READY' : 'ADAPTER_REQUIRED';
  const blockerCodes = productionStatus === 'SOURCE_BLOCKED' ? ['SOURCE_EVIDENCE_BLOCKED']
    : productionStatus === 'PRODUCTION_READY' ? [] : [...new Set([
        ...missingPrimitives,
        ...(sourceSemanticComplete && !runtimeSemanticComplete ? ['RUNTIME_SEMANTIC_PARTIAL'] : []),
        ...semanticObligations.flatMap((obligation) => obligation.implementationStatus === 'IMPLEMENTED' || !obligation.blockerCode ? [] : [obligation.blockerCode]),
        ...(adapterValid ? [] : ['RUNTIME_ADAPTER_MISSING_OR_SOURCE_SETUP_MISMATCH']),
        ...(proofMatches ? [] : ['PRODUCTION_PROOF_MISSING_OR_MISMATCHED']),
        ...(measuredRuntimeProof.productionProofPresent ? [] : ['PRODUCTION_TEST_PROOF_MISSING']),
        ...(measuredRuntimeProof.saveReplayProofPresent ? [] : ['SAVE_REPLAY_PROOF_MISSING']),
        ...(measuredRuntimeProof.selectorProofPresent ? [] : ['SELECTOR_PROOF_MISSING']),
        ...(measuredRuntimeProof.e2eProofPresent ? [] : ['E2E_PROOF_MISSING']),
        ...(productionUiProofComplete ? [] : ['PRODUCTION_UI_E2E_MISSING']),
      ])];
  return {
    definitionId: source.id,
    sourceSupported: !sourceBlocked,
    engineCapable: missingPrimitives.length === 0,
    sourceSemanticComplete,
    runtimeSemanticComplete,
    ...obligationCounts,
    semanticObligations,
    semanticComplete: sourceSemanticComplete,
    adapterComplete: adapterValid,
    selectorReachable: measuredRuntimeProof.selectorProofPresent,
    productionProofComplete: measuredRuntimeProof.productionProofPresent,
    saveReplayProofComplete: measuredRuntimeProof.saveReplayProofPresent,
    e2eProofComplete: measuredRuntimeProof.e2eProofPresent,
    productionUiProofComplete,
    productionReady: productionStatus === 'PRODUCTION_READY',
    sourceStatus: source.sourceStatus,
    semanticStatus: source.normalizationStatus,
    objectiveRuntimeSupport: productionStatus,
    specialRuleRuntimeSupport: source.specialRules.length === 0 || specialRulePrimitives.every((primitive) => implementedPrimitives.has(primitive))
      ? productionStatus : 'ENGINE_PRIMITIVE_MISSING',
    requiredPrimitives,
    existingPrimitives: source.runtimeSupport.existingCandidates,
    missingPrimitives,
    declaredMissingPrimitives,
    adapterStatus: sourceBlocked ? 'NOT_APPLICABLE' : adapterValid ? 'IMPLEMENTED' : 'REQUIRED',
    productionStatus,
    blockerCodes,
    measuredRuntimeProof,
  };
}

function sourceTrinket(id: string): SourceTrinket {
  const found = trinketData.find((item) => item.id === id);
  if (!found) throw new Error(`Missing Community Trinket source: ${id}`);
  return found;
}

function postRollModifierTrinket(
  id: string,
  positive: { type: 'accuracy' | 'crit'; amount: number },
  negative: { type: 'accuracy' | 'crit'; amount: number },
): TrinketDefinition {
  const source = sourceTrinket(id);
  const level = source.level as TrinketLevel;
  const runtimeContentMetadata: RuntimeContentMetadata = {
    sourceDefinitionId: source.id,
    contentSet: 'core',
    region: null,
    sourceOrigin: 'community-complete-edition',
  };
  return {
    id: source.id,
    name: source.printedName,
    level,
    positiveSide: {
      side: 'positive', label: `${positive.type} ${positive.amount >= 0 ? '+' : ''}${positive.amount}`,
      description: source.positiveSide.label, useWindows: ['after-attack-roll-before-hit-resolution'],
      modifiers: [positive], effects: [], canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
    },
    negativeSide: {
      side: 'negative', label: `${negative.type} ${negative.amount >= 0 ? '+' : ''}${negative.amount}`,
      description: source.negativeSide.label, useWindows: ['after-attack-roll-before-hit-resolution'],
      modifiers: [negative], effects: [], canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
    },
    sellPrice: sellPriceForLevel(level), buyPrice: buyPriceForLevel(level), officialDataStatus: 'verified',
    sourceReference: source.sourceReferences.join('; '), enabledInOfficialPool: false, dataOrigin: 'community',
    runtimeContentMetadata,
  };
}

const accuracyStone = postRollModifierTrinket('community-trinket-core-accuracy-stone', { type: 'accuracy', amount: 1 }, { type: 'accuracy', amount: -1 });
const criticalStone = postRollModifierTrinket('community-trinket-core-critical-stone', { type: 'crit', amount: 2 }, { type: 'accuracy', amount: -2 });
const fortunateSource = sourceTrinket('community-trinket-core-fortunate-armlet');
const fortunateArmlet: TrinketDefinition = {
  id: fortunateSource.id,
  name: fortunateSource.printedName,
  level: 2,
  positiveSide: {
    side: 'positive', label: '命中 +1 / 暴击 +1', description: fortunateSource.positiveSide.label,
    useWindows: ['after-attack-roll-before-hit-resolution'],
    modifiers: [{ type: 'accuracy', amount: 1 }, { type: 'crit', amount: 1 }], effects: [],
    canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
  },
  // Outcome B: retain the data shape without inventing a legal declaration window.
  negativeSide: {
    side: 'negative', label: '压力 +1（时机未决）', description: fortunateSource.negativeSide.label,
    useWindows: [], modifiers: [], effects: [],
  },
  sellPrice: sellPriceForLevel(2), buyPrice: buyPriceForLevel(2), officialDataStatus: 'verified',
  sourceReference: fortunateSource.sourceReferences.join('; '), enabledInOfficialPool: false, dataOrigin: 'community',
  runtimeContentMetadata: {
    sourceDefinitionId: fortunateSource.id, contentSet: 'core', region: null,
    sourceOrigin: 'community-complete-edition',
  },
};
const chirurgeonsSource = sourceTrinket('community-trinket-core-chirurgeons-charm');
const chirurgeonsCharm: TrinketDefinition = {
  id: chirurgeonsSource.id,
  name: chirurgeonsSource.printedName,
  level: 2,
  positiveSide: {
    side: 'positive', label: '治疗输出 +2', description: chirurgeonsSource.positiveSide.label,
    useWindows: ['before-healing-delivered-resolution'], modifiers: [{ type: 'healing', amount: 2 }],
    effects: [],
  },
  negativeSide: {
    side: 'negative', label: '治疗承受 -4', description: chirurgeonsSource.negativeSide.label,
    useWindows: ['before-healing-received-resolution'], modifiers: [{ type: 'healing', amount: -4 }],
    effects: [],
  },
  sellPrice: sellPriceForLevel(2), buyPrice: buyPriceForLevel(2), officialDataStatus: 'verified',
  sourceReference: chirurgeonsSource.sourceReferences.join('; '), enabledInOfficialPool: false,
  dataOrigin: 'community',
  runtimeContentMetadata: {
    sourceDefinitionId: chirurgeonsSource.id, contentSet: 'core', region: null,
    sourceOrigin: 'community-complete-edition',
  },
};

function bracerTrinket(id: string, positiveLight: 'min' | 'max', negativeLight: 'min' | 'max'): TrinketDefinition {
  const source = sourceTrinket(id);
  const light = (kind: 'min' | 'max') => kind === 'min'
    ? ({ type: 'min-light', value: 3 } as const)
    : ({ type: 'max-light', value: 3 } as const);
  return {
    id: source.id, name: source.printedName, level: 2,
    positiveSide: {
      side: 'positive', label: '暴击 +2', description: source.positiveSide.label,
      useWindows: ['after-attack-roll-before-hit-resolution'], modifiers: [{ type: 'crit', amount: 2 }],
      effects: [], canUse: [light(positiveLight)],
    },
    negativeSide: {
      side: 'negative', label: '伤害 = 0', description: source.negativeSide.label,
      useWindows: ['before-damage-applied'], modifiers: [{ type: 'damage', operation: 'set', amount: 0 }],
      effects: [], canUse: [light(negativeLight)],
    },
    sellPrice: sellPriceForLevel(2), buyPrice: buyPriceForLevel(2), officialDataStatus: 'verified',
    sourceReference: source.sourceReferences.join('; '), enabledInOfficialPool: false, dataOrigin: 'community',
    runtimeContentMetadata: { sourceDefinitionId: source.id, contentSet: 'core', region: null, sourceOrigin: 'community-complete-edition' },
  };
}

const darkBracer = bracerTrinket('community-trinket-core-dark-bracer', 'max', 'min');
const solarBracer = bracerTrinket('community-trinket-core-solar-bracer', 'min', 'max');

export const COMMUNITY_TRINKET_RUNTIME_ADAPTERS: Readonly<Record<string, CommunityTrinketRuntimeAdapter>> = Object.freeze({
  [accuracyStone.id]: { adapterId: 'post-roll-accuracy-stone-v1', definitionId: accuracyStone.id, requiredPrimitives: ['POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW'], definition: accuracyStone },
  [criticalStone.id]: { adapterId: 'post-roll-critical-stone-v1', definitionId: criticalStone.id, requiredPrimitives: ['POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW'], definition: criticalStone },
  [fortunateArmlet.id]: { adapterId: 'post-roll-fortunate-armlet-positive-v1', definitionId: fortunateArmlet.id, requiredPrimitives: ['POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW'], definition: fortunateArmlet },
  [chirurgeonsCharm.id]: { adapterId: 'staged-healing-chirurgeons-charm-v1', definitionId: chirurgeonsCharm.id, requiredPrimitives: ['STAGED_HEALING_TRINKET_WINDOWS'], definition: chirurgeonsCharm },
  [darkBracer.id]: { adapterId: 'staged-attack-dark-bracer-v1', definitionId: darkBracer.id, requiredPrimitives: ['POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW', 'PRE_DAMAGE_HIT_TRINKET_WINDOW', 'SET_DAMAGE_OVERRIDE'], definition: darkBracer },
  [solarBracer.id]: { adapterId: 'staged-attack-solar-bracer-v1', definitionId: solarBracer.id, requiredPrimitives: ['POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW', 'PRE_DAMAGE_HIT_TRINKET_WINDOW', 'SET_DAMAGE_OVERRIDE'], definition: solarBracer },
});

export const COMMUNITY_TRINKET_PRODUCTION_PROOFS: Readonly<Record<string, CommunityProductionProof>> = Object.freeze({
  [accuracyStone.id]: {
    definitionId: accuracyStone.id, runtimeAdapterId: 'post-roll-accuracy-stone-v1', sourceSupported: true,
    semanticSupported: true, stateful: true, productionTests: ['C1BR-PA-ACCURACY-RUNTIME'],
    saveReplayTests: ['C1BR-SAVE-ACCURACY-SIDE-REPLAY'], selectorTests: ['C1BR-CS-TRINKET-METADATA'],
    e2eTests: ['C1BR-E2E-ACCURACY'],
  },
  [criticalStone.id]: {
    definitionId: criticalStone.id, runtimeAdapterId: 'post-roll-critical-stone-v1', sourceSupported: true,
    semanticSupported: true, stateful: true, productionTests: ['C1BR-PA-CRITICAL-RUNTIME'],
    saveReplayTests: ['C1BR-SAVE-CRITICAL-SIDE-REPLAY'], selectorTests: ['C1BR-CS-TRINKET-METADATA'],
    e2eTests: ['C1BR-E2E-CRITICAL'],
  },
  [fortunateArmlet.id]: {
    definitionId: fortunateArmlet.id, runtimeAdapterId: 'post-roll-fortunate-armlet-positive-v1',
    requiredPrimitives: ['FORTUNATE_POST_ROLL_ATTACK_SLICE'],
    primitiveProofRequirements: {
      'C1C7-FORTUNATE-POSITIVE-RUNTIME': 'FORTUNATE_POST_ROLL_ATTACK_SLICE',
      'C1C7-FORTUNATE-POSITIVE-SAVE-REPLAY': 'FORTUNATE_POST_ROLL_ATTACK_SLICE',
      'C1C7-FORTUNATE-POSITIVE-SELECTOR': 'FORTUNATE_POST_ROLL_ATTACK_SLICE',
      'C1C7-E2E-FORTUNATE-POSITIVE': 'FORTUNATE_POST_ROLL_ATTACK_SLICE',
    } as Record<string, string>,
    sourceSupported: true, semanticSupported: true, stateful: true,
    productionTests: ['C1C7-FORTUNATE-POSITIVE-RUNTIME'],
    saveReplayTests: ['C1C7-FORTUNATE-POSITIVE-SAVE-REPLAY'],
    selectorTests: ['C1C7-FORTUNATE-POSITIVE-SELECTOR'],
    e2eTests: ['C1C7-E2E-FORTUNATE-POSITIVE'],
  },
  [chirurgeonsCharm.id]: {
    definitionId: chirurgeonsCharm.id, runtimeAdapterId: 'staged-healing-chirurgeons-charm-v1',
    requiredPrimitives: ['BATTLE_HEALING_TRINKET_WINDOWS'],
    primitiveProofRequirements: {
      'C1C5-CHIRURGEONS-RUNTIME': 'BATTLE_HEALING_TRINKET_WINDOWS',
      'C1C5-CHIRURGEONS-SAVE-REPLAY': 'BATTLE_HEALING_TRINKET_WINDOWS',
      'C1C5-CHIRURGEONS-SELECTOR': 'BATTLE_HEALING_TRINKET_WINDOWS',
      'C1C5-E2E-CHIRURGEONS': 'BATTLE_HEALING_TRINKET_WINDOWS',
    } as Record<string, string>, sourceSupported: true,
    semanticSupported: true, stateful: true, productionTests: ['C1C5-CHIRURGEONS-RUNTIME'],
    saveReplayTests: ['C1C5-CHIRURGEONS-SAVE-REPLAY'], selectorTests: ['C1C5-CHIRURGEONS-SELECTOR'],
    e2eTests: ['C1C5-E2E-CHIRURGEONS'],
  },
  ...Object.fromEntries([darkBracer, solarBracer].map((definition) => [definition.id, {
    definitionId: definition.id, runtimeAdapterId: `staged-attack-${definition === darkBracer ? 'dark' : 'solar'}-bracer-v1`,
    sourceSupported: true, semanticSupported: true, stateful: true,
    productionTests: [`C1C6-${definition === darkBracer ? 'DARK' : 'SOLAR'}-BRACER-RUNTIME`],
    saveReplayTests: [`C1C6-${definition === darkBracer ? 'DARK' : 'SOLAR'}-BRACER-SAVE-REPLAY`],
    selectorTests: [`C1C6-${definition === darkBracer ? 'DARK' : 'SOLAR'}-BRACER-SELECTOR`],
    e2eTests: [`C1C6-E2E-${definition === darkBracer ? 'DARK' : 'SOLAR'}-BRACER`],
  }])),
});

export function evaluateCommunityTrinketCapability(
  source: SourceTrinket,
  adapters: Readonly<Record<string, CommunityTrinketRuntimeAdapter>> = COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
  proofs: Readonly<Record<string, CommunityProductionProof>> = COMMUNITY_TRINKET_PRODUCTION_PROOFS,
  registeredProofs: Readonly<Record<string, RegisteredProductionProof>> = PRODUCTION_PROOF_REGISTRY,
): RuntimeCapabilityRecord {
  const sourceBlocked = source.sourceStatus !== 'source-supported';
  const adapter = adapters[source.id];
  const proof = proofs[source.id];
  const semanticObligations = trinketSemanticObligations(source, adapter?.definition, proof);
  const proofMatches = Boolean(adapter && proof && proof.definitionId === source.id && proof.runtimeAdapterId === adapter.adapterId);
  const measuredRuntimeProof: RuntimeProofState = {
    adapterPresent: Boolean(adapter),
    productionProofPresent: Boolean(proofMatches && allProofsResolve(proof.productionTests, 'production-runtime', source.id, registeredProofs, adapter?.adapterId, proof?.requiredPrimitives, proof?.primitiveProofRequirements)),
    saveReplayProofPresent: Boolean(proofMatches && (!proof.stateful || allProofsResolve(proof.saveReplayTests, 'save-replay', source.id, registeredProofs, adapter?.adapterId, proof?.requiredPrimitives, proof?.primitiveProofRequirements))),
    selectorProofPresent: Boolean(proofMatches && allProofsResolve(proof.selectorTests, 'selector', source.id, registeredProofs, adapter?.adapterId, proof?.requiredPrimitives, proof?.primitiveProofRequirements)),
    e2eProofPresent: Boolean(proofMatches && allProofsResolve(proof.e2eTests, 'e2e', source.id, registeredProofs, adapter?.adapterId, proof?.requiredPrimitives, proof?.primitiveProofRequirements)),
  };
  const declaredMissingPrimitives = [...new Set([
    ...source.positiveSide.runtimeSupport.missingCapabilities,
    ...source.negativeSide.runtimeSupport.missingCapabilities,
  ].flatMap(normalizePrimitives))];
  const implementedTrinketPrimitives = new Set(['POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW', 'STAGED_HEALING_TRINKET_WINDOWS', 'PRE_DAMAGE_HIT_TRINKET_WINDOW', 'SET_DAMAGE_OVERRIDE']);
  const missingPrimitives = declaredMissingPrimitives.filter((primitive) => !implementedTrinketPrimitives.has(primitive));
  const sourceSemanticComplete = trinketSourceSemanticComplete(source);
  const runtimeSemanticComplete = trinketRuntimeSemanticComplete(sourceSemanticComplete, semanticObligations);
  const productionUiProofComplete = Boolean(proofMatches && proof && measuredRuntimeProof.e2eProofPresent
    && allProofsUseSurface(proof.e2eTests, 'production-ui', registeredProofs));
  const proofComplete = Boolean(proofMatches && proof.sourceSupported && proof.semanticSupported
    && measuredRuntimeProof.productionProofPresent && measuredRuntimeProof.saveReplayProofPresent
    && measuredRuntimeProof.selectorProofPresent && productionUiProofComplete);
  const productionStatus: ProductionStatus = sourceBlocked ? 'SOURCE_BLOCKED'
    : missingPrimitives.length > 0 ? 'ENGINE_PRIMITIVE_MISSING'
      : runtimeSemanticComplete && adapter && proofComplete ? 'PRODUCTION_READY' : 'ADAPTER_REQUIRED';
  const semanticBlockers = semanticObligations.flatMap((obligation) => obligation.blockerCode ? [obligation.blockerCode] : []);
  const blockerCodes = sourceBlocked ? ['SOURCE_EVIDENCE_BLOCKED']
    : productionStatus === 'ENGINE_PRIMITIVE_MISSING' ? [...new Set([...missingPrimitives, ...semanticBlockers])]
    : productionStatus === 'PRODUCTION_READY' ? [] : [
    ...semanticBlockers,
    ...(adapter ? [] : ['RUNTIME_ADAPTER_MISSING']),
    ...(proofMatches ? [] : ['PRODUCTION_PROOF_MISSING_OR_MISMATCHED']),
    ...(proof && !proof.sourceSupported ? ['SOURCE_PROOF_MISSING'] : []),
    ...(proof && !proof.semanticSupported ? ['SEMANTIC_PROOF_MISSING'] : []),
    ...(measuredRuntimeProof.productionProofPresent ? [] : ['PRODUCTION_TEST_PROOF_MISSING']),
    ...(measuredRuntimeProof.saveReplayProofPresent ? [] : ['SAVE_REPLAY_PROOF_MISSING']),
    ...(measuredRuntimeProof.selectorProofPresent ? [] : ['SELECTOR_PROOF_MISSING']),
    ...(measuredRuntimeProof.e2eProofPresent ? [] : ['E2E_PROOF_MISSING']),
      ];
  return {
    definitionId: source.id,
    sourceSupported: !sourceBlocked,
    engineCapable: missingPrimitives.length === 0,
    sourceSemanticComplete,
    runtimeSemanticComplete,
    semanticObligationCount: semanticObligations.length,
    implementedSemanticObligationCount: semanticObligations.filter((entry) => entry.implementationStatus === 'IMPLEMENTED').length,
    partialSemanticObligationCount: semanticObligations.filter((entry) => entry.implementationStatus === 'PARTIAL').length,
    unsupportedSemanticObligationCount: semanticObligations.filter((entry) => entry.implementationStatus === 'UNSUPPORTED').length,
    sourceUnresolvedSemanticObligationCount: semanticObligations.filter((entry) => entry.implementationStatus === 'SOURCE_UNRESOLVED').length,
    semanticObligations: [],
    trinketSemanticObligations: semanticObligations,
    semanticComplete: sourceSemanticComplete,
    adapterComplete: Boolean(adapter),
    selectorReachable: measuredRuntimeProof.selectorProofPresent,
    productionProofComplete: measuredRuntimeProof.productionProofPresent,
    saveReplayProofComplete: measuredRuntimeProof.saveReplayProofPresent,
    e2eProofComplete: measuredRuntimeProof.e2eProofPresent,
    productionUiProofComplete,
    productionReady: productionStatus === 'PRODUCTION_READY',
    sourceStatus: source.sourceStatus, semanticStatus: source.normalizationStatus,
    positiveRuntimeSupport: productionStatus, negativeRuntimeSupport: productionStatus,
    requiredPrimitives: adapter?.requiredPrimitives ?? declaredMissingPrimitives,
    existingPrimitives: [...source.positiveSide.runtimeSupport.existingCandidates, ...source.negativeSide.runtimeSupport.existingCandidates],
    missingPrimitives,
    declaredMissingPrimitives, adapterStatus: sourceBlocked ? 'NOT_APPLICABLE' : adapter ? 'IMPLEMENTED' : 'REQUIRED',
    productionStatus, blockerCodes, measuredRuntimeProof,
  };
}

export const COMMUNITY_TRINKET_CAPABILITIES: RuntimeCapabilityRecord[] = trinketData.map((source) => evaluateCommunityTrinketCapability(source));

/** Implemented definitions available to deterministic fixtures and save restore, independent of promotion. */
export const COMMUNITY_IMPLEMENTED_TRINKETS: TrinketDefinition[] = Object.values(COMMUNITY_TRINKET_RUNTIME_ADAPTERS)
  .map((adapter) => adapter.definition);

const level2Sources = trinketData.filter((source) => source.level === 2);
const level2DeckComplete = level2Sources.length > 0 && level2Sources.every((source) =>
  COMMUNITY_TRINKET_CAPABILITIES.find((capability) => capability.definitionId === source.id)?.productionReady);
const COMMUNITY_EXTERNAL_DEPENDENCIES = new Set(level2DeckComplete ? ['LEVEL_2_TRINKET_SOURCE_DECK_COMPLETE'] : []);

export const COMMUNITY_QUEST_CAPABILITIES: RuntimeCapabilityRecord[] = questData.map((source) =>
  evaluateCommunityQuestCapability(source, COMMUNITY_QUEST_RUNTIME_ADAPTERS, COMMUNITY_QUEST_PRODUCTION_PROOFS,
    PRODUCTION_PROOF_REGISTRY, IMPLEMENTED_QUEST_PRIMITIVES, COMMUNITY_EXTERNAL_DEPENDENCIES));

export const COMMUNITY_RUNTIME_TRINKETS: TrinketDefinition[] = COMMUNITY_TRINKET_CAPABILITIES
  .filter((capability) => capability.productionStatus === 'PRODUCTION_READY')
  .map((capability) => COMMUNITY_TRINKET_RUNTIME_ADAPTERS[capability.definitionId]?.definition)
  .filter((definition): definition is TrinketDefinition => Boolean(definition));

export const COMMUNITY_RUNTIME_QUESTS: QuestDefinition[] = COMMUNITY_QUEST_CAPABILITIES
  .filter((capability) => capability.productionStatus === 'PRODUCTION_READY')
  .map((capability) => COMMUNITY_QUEST_RUNTIME_ADAPTERS[capability.definitionId]?.definition)
  .filter((definition): definition is QuestDefinition => Boolean(definition));

export const COMMUNITY_SOURCE_QUESTS: readonly SourceQuest[] = questData;
export const COMMUNITY_SOURCE_TRINKETS: readonly SourceTrinket[] = trinketData;
