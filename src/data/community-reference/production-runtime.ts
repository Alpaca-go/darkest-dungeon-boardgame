import type { QuestDefinition } from '../../types';
import type { RuntimeContentMetadata } from '../../types/content-runtime';
import type { TrinketDefinition, TrinketLevel } from '../../types/trinkets';
import questData from './quests/data.json' with { type: 'json' };
import trinketData from './trinkets/data.json' with { type: 'json' };
import { buyPriceForLevel, sellPriceForLevel } from '../trinkets/trinket-pricing';

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

export interface CommunityProductionProof {
  definitionId: string;
  runtimeAdapterId: string;
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

const normalizePrimitive = (message: string): string => {
  if (/timing hero-skill-resolution/i.test(message)) return 'POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW';
  if (/room-token composition/i.test(message)) return 'QUEST_ROOM_TOKEN_COMPOSITION';
  if (/firewood|resting-point/i.test(message)) return 'QUEST_FIREWOOD_SETUP';
  if (/repeated per-unit XP/i.test(message)) return 'QUEST_XP_UNIT_ACCOUNTING';
  if (/quest-specific policies/i.test(message)) return 'QUEST_SPECIAL_RULE_ADAPTER';
  return message.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();
};

const EMPTY_PROOF: RuntimeProofState = {
  adapterPresent: false,
  productionProofPresent: false,
  saveReplayProofPresent: false,
  selectorProofPresent: false,
  e2eProofPresent: false,
};

export const COMMUNITY_QUEST_CAPABILITIES: RuntimeCapabilityRecord[] = questData.map((source) => {
  const sourceBlocked = source.sourceStatus !== 'source-supported';
  const missing = [...new Set(source.runtimeSupport.missingCapabilities.map(normalizePrimitive))];
  return {
    definitionId: source.id,
    sourceStatus: source.sourceStatus,
    semanticStatus: source.normalizationStatus,
    objectiveRuntimeSupport: sourceBlocked ? 'SOURCE_BLOCKED' : 'ENGINE_PRIMITIVE_MISSING',
    specialRuleRuntimeSupport: sourceBlocked ? 'SOURCE_BLOCKED' : 'ENGINE_PRIMITIVE_MISSING',
    requiredPrimitives: missing,
    existingPrimitives: source.runtimeSupport.existingCandidates,
    missingPrimitives: missing,
    declaredMissingPrimitives: missing,
    adapterStatus: sourceBlocked ? 'NOT_APPLICABLE' : 'REQUIRED',
    productionStatus: sourceBlocked ? 'SOURCE_BLOCKED' : 'ENGINE_PRIMITIVE_MISSING',
    blockerCodes: sourceBlocked ? ['SOURCE_EVIDENCE_BLOCKED'] : missing,
    measuredRuntimeProof: { ...EMPTY_PROOF },
  };
});

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
    saveReplayTests: ['C1BR-E2E-ACCURACY-SAVE-RELOAD'], selectorTests: ['C1BR-CS-TRINKET-METADATA'],
    e2eTests: ['C1BR-E2E-ACCURACY'],
  },
  [criticalStone.id]: {
    definitionId: criticalStone.id, runtimeAdapterId: 'post-roll-critical-stone-v1', sourceSupported: true,
    semanticSupported: true, stateful: true, productionTests: ['C1BR-PA-CRITICAL-RUNTIME'],
    saveReplayTests: ['C1BR-E2E-CRITICAL-SAVE-RELOAD'], selectorTests: ['C1BR-CS-TRINKET-METADATA'],
    e2eTests: ['C1BR-E2E-CRITICAL'],
  },
});

export function evaluateCommunityTrinketCapability(
  source: SourceTrinket,
  adapters: Readonly<Record<string, CommunityTrinketRuntimeAdapter>> = COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
  proofs: Readonly<Record<string, CommunityProductionProof>> = COMMUNITY_TRINKET_PRODUCTION_PROOFS,
): RuntimeCapabilityRecord {
  const sourceBlocked = source.sourceStatus !== 'source-supported';
  const adapter = adapters[source.id];
  const proof = proofs[source.id];
  const proofMatches = Boolean(adapter && proof && proof.definitionId === source.id && proof.runtimeAdapterId === adapter.adapterId);
  const measuredRuntimeProof: RuntimeProofState = {
    adapterPresent: Boolean(adapter),
    productionProofPresent: Boolean(proofMatches && proof.productionTests.length),
    saveReplayProofPresent: Boolean(proofMatches && (!proof.stateful || proof.saveReplayTests.length)),
    selectorProofPresent: Boolean(proofMatches && proof.selectorTests.length),
    e2eProofPresent: Boolean(proofMatches && proof.e2eTests.length),
  };
  const declaredMissingPrimitives = [...new Set([
    ...source.positiveSide.runtimeSupport.missingCapabilities,
    ...source.negativeSide.runtimeSupport.missingCapabilities,
  ].map(normalizePrimitive))];
  const proofComplete = Boolean(proofMatches && proof.sourceSupported && proof.semanticSupported
    && measuredRuntimeProof.productionProofPresent && measuredRuntimeProof.saveReplayProofPresent
    && measuredRuntimeProof.selectorProofPresent && measuredRuntimeProof.e2eProofPresent);
  const productionStatus: ProductionStatus = sourceBlocked ? 'SOURCE_BLOCKED'
    : adapter && proofComplete ? 'PRODUCTION_READY' : 'ADAPTER_REQUIRED';
  const blockerCodes = sourceBlocked ? ['SOURCE_EVIDENCE_BLOCKED'] : productionStatus === 'PRODUCTION_READY' ? [] : [
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
    missingPrimitives: adapter ? [] : declaredMissingPrimitives,
    declaredMissingPrimitives, adapterStatus: sourceBlocked ? 'NOT_APPLICABLE' : adapter ? 'IMPLEMENTED' : 'REQUIRED',
    productionStatus, blockerCodes, measuredRuntimeProof,
  };
}

export const COMMUNITY_TRINKET_CAPABILITIES: RuntimeCapabilityRecord[] = trinketData.map((source) => evaluateCommunityTrinketCapability(source));

export const COMMUNITY_RUNTIME_TRINKETS: TrinketDefinition[] = COMMUNITY_TRINKET_CAPABILITIES
  .filter((capability) => capability.productionStatus === 'PRODUCTION_READY')
  .map((capability) => COMMUNITY_TRINKET_RUNTIME_ADAPTERS[capability.definitionId]?.definition)
  .filter((definition): definition is TrinketDefinition => Boolean(definition));

// Quest production stays empty until exact adapters and proof manifests exist.
export const COMMUNITY_RUNTIME_QUESTS: QuestDefinition[] = [];

export const COMMUNITY_SOURCE_QUESTS: readonly SourceQuest[] = questData;
export const COMMUNITY_SOURCE_TRINKETS: readonly SourceTrinket[] = trinketData;
