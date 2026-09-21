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
  type RegisteredProductionProof,
} from '../../audit/production-proof-registry';

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
  adapterId: 'c1c1-simple-community-quest-v1';
  definitionId: string;
  requiredPrimitives: ['QUEST_ROOM_TOKEN_COMPOSITION', 'QUEST_FIREWOOD_RESTING_POINT_SETUP', 'QUEST_XP_UNIT_ACCOUNTING'];
  definition: QuestDefinition;
}

export interface CommunityProductionProof {
  definitionId: string;
  runtimeAdapterId: string;
  requiredPrimitives?: string[];
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
  if (/timing hero-skill-resolution/i.test(message)) primitives.push('POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW');
  if (/room-token composition/i.test(message)) primitives.push('QUEST_ROOM_TOKEN_COMPOSITION');
  if (/firewood|resting-point/i.test(message)) primitives.push('QUEST_FIREWOOD_RESTING_POINT_SETUP');
  if (/repeated per-unit XP/i.test(message)) primitives.push('QUEST_XP_UNIT_ACCOUNTING');
  if (/quest-specific policies/i.test(message)) primitives.push('QUEST_SPECIAL_RULE_ADAPTER');
  return primitives.length > 0 ? primitives : [message.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase()];
};

const IMPLEMENTED_QUEST_PRIMITIVES = new Set([
  'QUEST_ROOM_TOKEN_COMPOSITION',
  'QUEST_FIREWOOD_RESTING_POINT_SETUP',
  'QUEST_XP_UNIT_ACCOUNTING',
]);

type SimpleSourceQuest = SourceQuest & {
  objective: {
    targetEntity: 'room' | 'lair';
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

function isC1C1SimpleCoreQuest(source: SourceQuest): source is SimpleSourceQuest {
  const declared = [...new Set(source.runtimeSupport.missingCapabilities.flatMap(normalizePrimitives))];
  return source.sourceStatus === 'source-supported'
    && (source.region === 'ruins' || source.region === 'warrens')
    && source.questType === 'standard'
    && Array.isArray(source.specialRules) && source.specialRules.length === 0
    && declared.length === 3
    && declared.every((primitive) => IMPLEMENTED_QUEST_PRIMITIVES.has(primitive));
}

function adaptSimpleCommunityQuest(source: SimpleSourceQuest): CommunityQuestRuntimeAdapter {
  if (source.specialRules.length !== 0) throw new Error(`Simple Quest adapter rejects special rules: ${source.id}`);
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
    contentSet: 'core',
    region: source.region as 'ruins' | 'warrens',
    sourceOrigin: 'community-complete-edition',
  };
  const firewoodSetup: QuestFirewoodSetup = {
    tokens: Number(source.firewood.tokens),
    restingPoints: Number(source.firewood.restingPoints),
  };
  return {
    adapterId: 'c1c1-simple-community-quest-v1',
    definitionId: source.id,
    requiredPrimitives: ['QUEST_ROOM_TOKEN_COMPOSITION', 'QUEST_FIREWOOD_RESTING_POINT_SETUP', 'QUEST_XP_UNIT_ACCOUNTING'],
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
  };
}

export const COMMUNITY_QUEST_RUNTIME_ADAPTERS: Readonly<Record<string, CommunityQuestRuntimeAdapter>> = Object.freeze(
  Object.fromEntries(questData.filter(isC1C1SimpleCoreQuest).map((source) => {
    const adapter = adaptSimpleCommunityQuest(source);
    return [source.id, adapter];
  })),
);

const questDefinitionIds = Object.keys(COMMUNITY_QUEST_RUNTIME_ADAPTERS);
export const COMMUNITY_QUEST_PRODUCTION_PROOFS: Readonly<Record<string, CommunityProductionProof>> = Object.freeze(
  Object.fromEntries(questDefinitionIds.map((definitionId) => [definitionId, {
    definitionId,
    runtimeAdapterId: 'c1c1-simple-community-quest-v1',
    requiredPrimitives: [...COMMUNITY_QUEST_RUNTIME_ADAPTERS[definitionId].requiredPrimitives],
    sourceSupported: true,
    semanticSupported: true,
    stateful: true,
    productionTests: ['C1C1-QUEST-RUNTIME', 'C1C1R-QUEST-SOURCE-SETUP'],
    saveReplayTests: ['C1C1-QUEST-SAVE-REPLAY'],
    selectorTests: ['C1C1-QUEST-SELECTOR'],
    e2eTests: [
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
): RuntimeCapabilityRecord {
  const sourceBlocked = source.sourceStatus !== 'source-supported';
  const declaredMissingPrimitives = [...new Set(source.runtimeSupport.missingCapabilities.flatMap(normalizePrimitives))];
  const missingPrimitives = declaredMissingPrimitives.filter((primitive) => !implementedPrimitives.has(primitive));
  const adapter = adapters[source.id];
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
    )),
  };
  const proofComplete = Boolean(proofMatches && proof.sourceSupported && proof.semanticSupported
    && measuredRuntimeProof.productionProofPresent && measuredRuntimeProof.saveReplayProofPresent
    && measuredRuntimeProof.selectorProofPresent && measuredRuntimeProof.e2eProofPresent);
  const productionStatus: ProductionStatus = sourceBlocked ? 'SOURCE_BLOCKED'
    : missingPrimitives.length > 0 ? 'ENGINE_PRIMITIVE_MISSING'
      : adapterValid && proofComplete ? 'PRODUCTION_READY' : 'ADAPTER_REQUIRED';
  const blockerCodes = productionStatus === 'SOURCE_BLOCKED' ? ['SOURCE_EVIDENCE_BLOCKED']
    : productionStatus === 'ENGINE_PRIMITIVE_MISSING' ? missingPrimitives
      : productionStatus === 'PRODUCTION_READY' ? [] : [
        ...(adapterValid ? [] : ['RUNTIME_ADAPTER_MISSING_OR_SOURCE_SETUP_MISMATCH']),
        ...(proofMatches ? [] : ['PRODUCTION_PROOF_MISSING_OR_MISMATCHED']),
        ...(measuredRuntimeProof.productionProofPresent ? [] : ['PRODUCTION_TEST_PROOF_MISSING']),
        ...(measuredRuntimeProof.saveReplayProofPresent ? [] : ['SAVE_REPLAY_PROOF_MISSING']),
        ...(measuredRuntimeProof.selectorProofPresent ? [] : ['SELECTOR_PROOF_MISSING']),
        ...(measuredRuntimeProof.e2eProofPresent ? [] : ['E2E_PROOF_MISSING']),
      ];
  return {
    definitionId: source.id,
    sourceStatus: source.sourceStatus,
    semanticStatus: source.normalizationStatus,
    objectiveRuntimeSupport: productionStatus,
    specialRuleRuntimeSupport: source.specialRules.length === 0 ? productionStatus : 'ENGINE_PRIMITIVE_MISSING',
    requiredPrimitives: declaredMissingPrimitives,
    existingPrimitives: source.runtimeSupport.existingCandidates,
    missingPrimitives,
    declaredMissingPrimitives,
    adapterStatus: sourceBlocked ? 'NOT_APPLICABLE' : adapterValid ? 'IMPLEMENTED' : 'REQUIRED',
    productionStatus,
    blockerCodes,
    measuredRuntimeProof,
  };
}

export const COMMUNITY_QUEST_CAPABILITIES: RuntimeCapabilityRecord[] = questData.map((source) => evaluateCommunityQuestCapability(source));

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

export const COMMUNITY_TRINKET_RUNTIME_ADAPTERS: Readonly<Record<string, CommunityTrinketRuntimeAdapter>> = Object.freeze({
  [accuracyStone.id]: { adapterId: 'post-roll-accuracy-stone-v1', definitionId: accuracyStone.id, requiredPrimitives: ['POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW'], definition: accuracyStone },
  [criticalStone.id]: { adapterId: 'post-roll-critical-stone-v1', definitionId: criticalStone.id, requiredPrimitives: ['POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW'], definition: criticalStone },
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
  const proofMatches = Boolean(adapter && proof && proof.definitionId === source.id && proof.runtimeAdapterId === adapter.adapterId);
  const measuredRuntimeProof: RuntimeProofState = {
    adapterPresent: Boolean(adapter),
    productionProofPresent: Boolean(proofMatches && allProofsResolve(proof.productionTests, 'production-runtime', source.id, registeredProofs)),
    saveReplayProofPresent: Boolean(proofMatches && (!proof.stateful || allProofsResolve(proof.saveReplayTests, 'save-replay', source.id, registeredProofs))),
    selectorProofPresent: Boolean(proofMatches && allProofsResolve(proof.selectorTests, 'selector', source.id, registeredProofs)),
    e2eProofPresent: Boolean(proofMatches && allProofsResolve(proof.e2eTests, 'e2e', source.id, registeredProofs)),
  };
  const declaredMissingPrimitives = [...new Set([
    ...source.positiveSide.runtimeSupport.missingCapabilities,
    ...source.negativeSide.runtimeSupport.missingCapabilities,
  ].flatMap(normalizePrimitives))];
  const missingPrimitives = declaredMissingPrimitives.filter((primitive) => primitive !== 'POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW');
  const proofComplete = Boolean(proofMatches && proof.sourceSupported && proof.semanticSupported
    && measuredRuntimeProof.productionProofPresent && measuredRuntimeProof.saveReplayProofPresent
    && measuredRuntimeProof.selectorProofPresent && measuredRuntimeProof.e2eProofPresent);
  const productionStatus: ProductionStatus = sourceBlocked ? 'SOURCE_BLOCKED'
    : missingPrimitives.length > 0 ? 'ENGINE_PRIMITIVE_MISSING'
      : adapter && proofComplete ? 'PRODUCTION_READY' : 'ADAPTER_REQUIRED';
  const blockerCodes = sourceBlocked ? ['SOURCE_EVIDENCE_BLOCKED']
    : productionStatus === 'ENGINE_PRIMITIVE_MISSING' ? missingPrimitives
      : productionStatus === 'PRODUCTION_READY' ? [] : [
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
    definitionId: source.id, sourceStatus: source.sourceStatus, semanticStatus: source.normalizationStatus,
    positiveRuntimeSupport: productionStatus, negativeRuntimeSupport: productionStatus,
    requiredPrimitives: adapter?.requiredPrimitives ?? declaredMissingPrimitives,
    existingPrimitives: [...source.positiveSide.runtimeSupport.existingCandidates, ...source.negativeSide.runtimeSupport.existingCandidates],
    missingPrimitives,
    declaredMissingPrimitives, adapterStatus: sourceBlocked ? 'NOT_APPLICABLE' : adapter ? 'IMPLEMENTED' : 'REQUIRED',
    productionStatus, blockerCodes, measuredRuntimeProof,
  };
}

export const COMMUNITY_TRINKET_CAPABILITIES: RuntimeCapabilityRecord[] = trinketData.map((source) => evaluateCommunityTrinketCapability(source));

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
