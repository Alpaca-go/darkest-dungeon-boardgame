import type { QuestDefinition } from '../../types';
import type { TrinketDefinition, TrinketLevel } from '../../types/trinkets';
import questData from './quests/data.json';
import trinketData from './trinkets/data.json';
import { buyPriceForLevel, sellPriceForLevel } from '../trinkets/trinket-pricing';

export type ProductionStatus =
  | 'PRODUCTION_READY'
  | 'ADAPTER_REQUIRED'
  | 'ENGINE_PRIMITIVE_MISSING'
  | 'SOURCE_BLOCKED';

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
  adapterStatus: 'IMPLEMENTED' | 'REQUIRED' | 'NOT_APPLICABLE';
  productionStatus: ProductionStatus;
  blockerCodes: string[];
}

type SourceQuest = (typeof questData)[number];
type SourceTrinket = (typeof trinketData)[number];

const IMPLEMENTED_TRINKETS = new Set([
  'community-trinket-core-accuracy-stone',
  'community-trinket-core-critical-stone',
]);

const normalizePrimitive = (message: string): string => {
  if (/timing hero-skill-resolution/i.test(message)) return 'POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW';
  if (/room-token composition/i.test(message)) return 'QUEST_ROOM_TOKEN_COMPOSITION';
  if (/firewood|resting-point/i.test(message)) return 'QUEST_FIREWOOD_SETUP';
  if (/repeated per-unit XP/i.test(message)) return 'QUEST_XP_UNIT_ACCOUNTING';
  if (/quest-specific policies/i.test(message)) return 'QUEST_SPECIAL_RULE_ADAPTER';
  return message.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();
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
    adapterStatus: sourceBlocked ? 'NOT_APPLICABLE' : 'REQUIRED',
    productionStatus: sourceBlocked ? 'SOURCE_BLOCKED' : 'ENGINE_PRIMITIVE_MISSING',
    blockerCodes: sourceBlocked ? ['SOURCE_EVIDENCE_BLOCKED'] : missing,
  };
});

export const COMMUNITY_TRINKET_CAPABILITIES: RuntimeCapabilityRecord[] = trinketData.map((source) => {
  const sourceBlocked = source.sourceStatus !== 'source-supported';
  const implemented = !sourceBlocked && IMPLEMENTED_TRINKETS.has(source.id);
  const rawMissing = [
    ...source.positiveSide.runtimeSupport.missingCapabilities,
    ...source.negativeSide.runtimeSupport.missingCapabilities,
  ];
  const missing = implemented ? [] : [...new Set(rawMissing.map(normalizePrimitive))];
  const status: ProductionStatus = sourceBlocked
    ? 'SOURCE_BLOCKED'
    : implemented
      ? 'PRODUCTION_READY'
      : 'ENGINE_PRIMITIVE_MISSING';
  return {
    definitionId: source.id,
    sourceStatus: source.sourceStatus,
    semanticStatus: source.normalizationStatus,
    positiveRuntimeSupport: status,
    negativeRuntimeSupport: status,
    requiredPrimitives: implemented ? ['POST_ROLL_PRE_RESOLUTION_TRINKET_WINDOW'] : missing,
    existingPrimitives: [
      ...source.positiveSide.runtimeSupport.existingCandidates,
      ...source.negativeSide.runtimeSupport.existingCandidates,
    ],
    missingPrimitives: missing,
    adapterStatus: implemented ? 'IMPLEMENTED' : sourceBlocked ? 'NOT_APPLICABLE' : 'REQUIRED',
    productionStatus: status,
    blockerCodes: sourceBlocked ? ['SOURCE_EVIDENCE_BLOCKED'] : missing,
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
  return {
    id: source.id,
    name: source.printedName,
    level,
    positiveSide: {
      side: 'positive',
      label: `${positive.type} ${positive.amount >= 0 ? '+' : ''}${positive.amount}`,
      description: source.positiveSide.label,
      useWindows: ['after-attack-roll-before-hit-resolution'],
      modifiers: [positive],
      effects: [],
      canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
    },
    negativeSide: {
      side: 'negative',
      label: `${negative.type} ${negative.amount >= 0 ? '+' : ''}${negative.amount}`,
      description: source.negativeSide.label,
      useWindows: ['after-attack-roll-before-hit-resolution'],
      modifiers: [negative],
      effects: [],
      canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
    },
    sellPrice: sellPriceForLevel(level),
    buyPrice: buyPriceForLevel(level),
    officialDataStatus: 'verified',
    sourceReference: source.sourceReferences.join('; '),
    enabledInOfficialPool: false,
    dataOrigin: 'community',
  };
}

export const COMMUNITY_RUNTIME_TRINKETS: TrinketDefinition[] = [
  postRollModifierTrinket(
    'community-trinket-core-accuracy-stone',
    { type: 'accuracy', amount: 1 },
    { type: 'accuracy', amount: -1 },
  ),
  postRollModifierTrinket(
    'community-trinket-core-critical-stone',
    { type: 'crit', amount: 2 },
    { type: 'accuracy', amount: -2 },
  ),
];

// Quest production is deliberately empty until the printed room-token composition,
// per-unit XP, and special-rule hooks are represented exactly by the engine.
export const COMMUNITY_RUNTIME_QUESTS: QuestDefinition[] = [];

export const COMMUNITY_SOURCE_QUESTS: readonly SourceQuest[] = questData;
export const COMMUNITY_SOURCE_TRINKETS: readonly SourceTrinket[] = trinketData;
