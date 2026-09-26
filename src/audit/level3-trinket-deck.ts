import trinketData from '../data/community-reference/trinkets/data.json' with { type: 'json' };
import { COMMUNITY_TRINKET_CAPABILITIES } from '../data/community-reference/production-runtime';
import { measureTrinketDeckCoverage } from './level2-trinket-deck';

export const LEVEL_3_TRINKET_CENSUS = trinketData.filter((source) => source.level === 3 && source.contentSet === 'core')
  .map((source) => {
    const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === source.id);
    if (!capability) throw new Error(`Missing Level 3 capability: ${source.id}`);
    return {
      definitionId: source.id, printedName: source.printedName, contentSet: source.contentSet,
      sourceStatus: source.sourceStatus, unresolvedFields: source.unresolvedFields,
      sourceReferences: source.sourceReferences,
      historicalDiagnosis: [source.positiveSide.runtimeSupport.missingCapabilities,
        source.negativeSide.runtimeSupport.missingCapabilities],
      productionReady: capability.productionReady, productionStatus: capability.productionStatus,
      blockerCodes: capability.blockerCodes,
      sides: capability.trinketSemanticObligations?.map((side) => ({
        side: side.side, implementationStatus: side.implementationStatus,
        runtimeSliceSemanticComplete: side.runtimeSliceSemanticComplete,
        blockerCode: side.blockerCode, semanticMismatches: side.semanticMismatches,
        proofIds: side.proofIds,
      })) ?? [],
    };
  });

export const LEVEL_3_TRINKET_DECK_COVERAGE = measureTrinketDeckCoverage(3,
  trinketData.filter((source) => source.level !== 3 || source.contentSet === 'core'));
