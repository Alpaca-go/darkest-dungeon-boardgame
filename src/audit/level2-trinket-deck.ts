import trinketData from '../data/community-reference/trinkets/data.json' with { type: 'json' };
import { COMMUNITY_TRINKET_CAPABILITIES, type RuntimeCapabilityRecord } from '../data/community-reference/production-runtime';

type SourceTrinket = (typeof trinketData)[number];
export interface TrinketSourceForCoverage {
  id: string;
  level: number | null;
  sourceStatus: string;
  unresolvedFields: readonly string[];
  positiveSide?: { unresolvedFields: readonly string[] };
  negativeSide?: { unresolvedFields: readonly string[] };
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

function censusSide(source: SourceTrinket, side: 'positive' | 'negative'): TrinketSideCensusEntry {
  const value = side === 'positive' ? source.positiveSide : source.negativeSide;
  const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === source.id);
  const obligation = capability?.trinketSemanticObligations?.find((entry) => entry.side === side);
  return {
    definitionId: source.id, side, trigger: value.trigger, useWindow: value.useWindow, target: value.target,
    modifiers: value.modifiers, effects: value.effects, conditions: value.conditions,
    runtimeWindowBinding: obligation?.runtimeWindowBinding ?? null,
    runtimeEffectBindings: obligation?.runtimeEffectBindings ?? value.runtimeSupport.existingCandidates,
    implementationStatus: obligation?.implementationStatus ?? (source.unresolvedFields.length > 0 ? 'SOURCE_UNRESOLVED' : 'UNSUPPORTED'),
    proofIds: obligation?.proofIds ?? [],
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
    .filter((source) => source.unresolvedFields.length > 0 || (source.positiveSide?.unresolvedFields.length ?? 0) > 0
      || (source.negativeSide?.unresolvedFields.length ?? 0) > 0 || !byId.get(source.id)?.sourceSemanticComplete)
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
