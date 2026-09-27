import trinketData from '../data/community-reference/trinkets/data.json' with { type: 'json' };
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS, evaluateCommunityTrinketCapability } from '../data/community-reference/production-runtime';
import { LEVEL1_STANCE_ACCURACY_SPECS } from './production-proof-registry';
import { measureTrinketDeckCoverage } from './level2-trinket-deck';

export const LEVEL_1_TRINKET_CENSUS = trinketData.filter((source) => source.level === 1 && source.contentSet === 'core')
  .map((source) => {
    const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === source.id);
    if (!capability) throw new Error(`Missing Level 1 capability: ${source.id}`);
    return {
      definitionId: source.id, printedName: source.printedName, contentSet: source.contentSet,
      sourceStatus: source.sourceStatus, unresolvedFields: source.unresolvedFields,
      sourceReferences: source.sourceReferences,
      historicalDiagnosis: [source.positiveSide.runtimeSupport.missingCapabilities,
        source.negativeSide.runtimeSupport.missingCapabilities],
      productionReady: capability.productionReady, productionStatus: capability.productionStatus,
      blockerCodes: capability.blockerCodes,
      runtimeSemanticComplete: capability.runtimeSemanticComplete,
      measuredRuntimeProof: capability.measuredRuntimeProof,
      productionUiProofComplete: capability.productionUiProofComplete,
      requiredPrimitives: capability.requiredPrimitives, missingPrimitives: capability.missingPrimitives,
      sides: capability.trinketSemanticObligations?.map((side) => ({
        side: side.side, implementationStatus: side.implementationStatus,
        runtimeSliceSemanticComplete: side.runtimeSliceSemanticComplete,
        blockerCode: side.blockerCode, semanticMismatches: side.semanticMismatches,
        proofIds: side.proofIds,
      })) ?? [],
    };
  });

export const LEVEL_1_TRINKET_DECK_COVERAGE = measureTrinketDeckCoverage(1,
  trinketData.filter((source) => source.level !== 1 || source.contentSet === 'core'));

/** Recompute the pre-family state using live consumers with only the new adapters removed. */
const addedIds = new Set<string>([...LEVEL1_STANCE_ACCURACY_SPECS.map((card) => card.definitionId), 'community-trinket-core-survival-guide']);
const baselineAdapters = Object.fromEntries(Object.entries(COMMUNITY_TRINKET_RUNTIME_ADAPTERS).filter(([id]) => !addedIds.has(id)));
const level1Sources = trinketData.filter((source) => source.level === 1 && source.contentSet === 'core');
export const LEVEL_1_BASELINE_DECK_COVERAGE = measureTrinketDeckCoverage(1, level1Sources,
  level1Sources.map((source) => evaluateCommunityTrinketCapability(source, baselineAdapters)));
