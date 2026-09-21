import trinketData from '../data/community-reference/trinkets/data.json' with { type: 'json' };
import { COMMUNITY_TRINKET_CAPABILITIES, type RuntimeCapabilityRecord } from '../data/community-reference/production-runtime';

type SourceTrinket = (typeof trinketData)[number];
export interface TrinketSourceForCoverage {
  id: string;
  level: number | null;
  sourceStatus: string;
  unresolvedFields: readonly string[];
}
export interface TrinketSideCensusEntry {
  definitionId: string;
  side: 'positive' | 'negative';
  trigger: string;
  useWindow: string;
  target: string;
  modifiers: readonly unknown[];
  effects: readonly unknown[];
  conditions: readonly unknown[];
  runtimeWindowBinding: string | null;
  runtimeEffectBindings: string[];
  implementationStatus: 'IMPLEMENTED' | 'PARTIAL' | 'UNSUPPORTED' | 'SOURCE_UNRESOLVED';
  proofIds: string[];
}

export interface Level2TrinketCensusEntry {
  definitionId: string;
  printedName: string;
  sourceSupported: boolean;
  unresolvedFields: string[];
  sides: [TrinketSideCensusEntry, TrinketSideCensusEntry];
}

export interface TrinketDeckCoverage {
  level: 1 | 2 | 3;
  sourceDefinitionCount: number;
  sourceSupportedCount: number;
  sourceSemanticCompleteCount: number;
  runtimeSemanticCompleteCount: number;
  productionReadyCount: number;
  productionReadyIds: string[];
  missingDefinitionIds: string[];
  semanticallyIncompleteDefinitionIds: string[];
  completeForRandomDraw: boolean;
}

const CHIRURGEONS_ID = 'community-trinket-core-chirurgeons-charm';
const CHIRURGEONS_PROOFS = [
  'C1C5-CHIRURGEONS-RUNTIME', 'C1C5-CHIRURGEONS-SAVE-REPLAY',
  'C1C5-CHIRURGEONS-SELECTOR', 'C1C5-E2E-CHIRURGEONS',
];

function censusSide(source: SourceTrinket, side: 'positive' | 'negative'): TrinketSideCensusEntry {
  const value = side === 'positive' ? source.positiveSide : source.negativeSide;
  const implemented = source.id === CHIRURGEONS_ID;
  return {
    definitionId: source.id, side, trigger: value.trigger, useWindow: value.useWindow, target: value.target,
    modifiers: value.modifiers, effects: value.effects, conditions: value.conditions,
    runtimeWindowBinding: implemented
      ? (side === 'positive' ? 'before-healing-delivered-resolution' : 'before-healing-received-resolution')
      : null,
    runtimeEffectBindings: implemented ? ['ActiveModifierDefinition:healing'] : value.runtimeSupport.existingCandidates,
    implementationStatus: implemented ? 'IMPLEMENTED' : source.unresolvedFields.length > 0 ? 'SOURCE_UNRESOLVED' : 'UNSUPPORTED',
    proofIds: implemented ? CHIRURGEONS_PROOFS : [],
  };
}

export const LEVEL_2_TRINKET_CENSUS: Level2TrinketCensusEntry[] = trinketData
  .filter((source) => source.level === 2)
  .map((source) => ({
    definitionId: source.id,
    printedName: source.printedName,
    sourceSupported: source.sourceStatus === 'source-supported',
    unresolvedFields: [...source.unresolvedFields],
    sides: [censusSide(source, 'positive'), censusSide(source, 'negative')],
  }));

export function measureTrinketDeckCoverage(
  level: 1 | 2 | 3 = 2,
  sources: readonly TrinketSourceForCoverage[] = trinketData,
  capabilities: readonly RuntimeCapabilityRecord[] = COMMUNITY_TRINKET_CAPABILITIES,
): TrinketDeckCoverage {
  const required = sources.filter((source) => source.level === level && source.sourceStatus === 'source-supported');
  const byId = new Map(capabilities.map((capability) => [capability.definitionId, capability]));
  const missingDefinitionIds = required
    .filter((source) => !byId.get(source.id)?.productionReady)
    .map((source) => source.id);
  const semanticallyIncompleteDefinitionIds = required
    .filter((source) => source.unresolvedFields.length > 0 || !byId.get(source.id)?.sourceSemanticComplete)
    .map((source) => source.id);
  const productionReadyCount = required.filter((source) => byId.get(source.id)?.productionReady).length;
  const productionReadyIds = required.filter((source) => byId.get(source.id)?.productionReady).map((source) => source.id);
  const sourceDefinitions = sources.filter((source) => source.level === level);
  return {
    level,
    sourceDefinitionCount: sourceDefinitions.length,
    sourceSupportedCount: required.length,
    sourceSemanticCompleteCount: required.filter((source) => source.unresolvedFields.length === 0 && byId.get(source.id)?.sourceSemanticComplete).length,
    runtimeSemanticCompleteCount: required.filter((source) => byId.get(source.id)?.runtimeSemanticComplete).length,
    productionReadyCount,
    productionReadyIds,
    missingDefinitionIds,
    semanticallyIncompleteDefinitionIds,
    completeForRandomDraw: sourceDefinitions.length > 0
      && productionReadyCount === sourceDefinitions.length
      && missingDefinitionIds.length === 0
      && semanticallyIncompleteDefinitionIds.length === 0,
  };
}

export const LEVEL_2_TRINKET_DECK_COVERAGE = measureTrinketDeckCoverage(2);
