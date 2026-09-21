import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_PRODUCTION_PROOFS,
  COMMUNITY_QUEST_RUNTIME_ADAPTERS,
  COMMUNITY_SOURCE_QUESTS,
  evaluateCommunityQuestCapability,
  implementedQuestPrimitives,
} from '../data/community-reference/production-runtime';
import {
  C1C1_CORE_QUEST_IDS,
  PRODUCTION_PROOF_REGISTRY,
  type RegisteredProductionProof,
} from './production-proof-registry';
import {
  REST_SEMANTIC_CONTRACT,
  deriveUnresolvedRestSemantics,
  semanticContractAcceptanceErrors,
  type RestSemanticContract,
} from './rest-semantic-contract';
import { questReadinessInvariantErrors } from './quest-readiness-invariants';

const source = (id: string) => COMMUNITY_SOURCE_QUESTS.find((entry) => entry.id === id)!;
const firewoodIds = C1C1_CORE_QUEST_IDS.filter((id) => Number(source(id).firewood.tokens) > 0);
const zeroFirewoodIds = C1C1_CORE_QUEST_IDS.filter((id) => Number(source(id).firewood.tokens) === 0);

describe('C1C-1R3 Rest budget semantic closure', () => {
  it('RS-03 derives unresolved Production semantics and refuses SOURCE_BACKED publication', () => {
    expect(deriveUnresolvedRestSemantics()).toEqual(['insufficientRecoveryCapacity']);
    expect(semanticContractAcceptanceErrors()).toEqual([
      'insufficientRecoveryCapacity: SOURCE_UNRESOLVED is not accepted for Production',
    ]);
  });

  it('RS-04 rejects a non-allowlisted SOURCE_DERIVED Production semantic', () => {
    const contract = structuredClone(REST_SEMANTIC_CONTRACT) as RestSemanticContract;
    contract.partialSpend = { status: 'SOURCE_DERIVED' };
    contract.productionRequiredFields = [...contract.productionRequiredFields, 'partialSpend'];
    expect(semanticContractAcceptanceErrors(contract)).toContain(
      'partialSpend: SOURCE_DERIVED is not accepted for Production',
    );
  });

  it('RS-05 deleting the Rest interaction primitive closes all five Firewood Quests', () => {
    for (const id of firewoodIds) {
      const capability = evaluateCommunityQuestCapability(
        source(id),
        COMMUNITY_QUEST_RUNTIME_ADAPTERS,
        COMMUNITY_QUEST_PRODUCTION_PROOFS,
        PRODUCTION_PROOF_REGISTRY,
        implementedQuestPrimitives(false),
      );
      expect(capability.productionStatus).toBe('ENGINE_PRIMITIVE_MISSING');
      expect(capability.missingPrimitives).toContain('QUEST_REST_ALLOCATION_SEMANTICS');
    }
  });

  it('RS-06 zero-Firewood Quests do not require Rest interaction semantics', () => {
    expect(zeroFirewoodIds).toHaveLength(2);
    for (const id of zeroFirewoodIds) {
      const capability = evaluateCommunityQuestCapability(
        source(id),
        COMMUNITY_QUEST_RUNTIME_ADAPTERS,
        COMMUNITY_QUEST_PRODUCTION_PROOFS,
        PRODUCTION_PROOF_REGISTRY,
        implementedQuestPrimitives(false),
      );
      expect(capability.productionStatus).toBe('PRODUCTION_READY');
      expect(capability.requiredPrimitives).not.toContain('QUEST_REST_ALLOCATION_SEMANTICS');
    }
  });

  it('RS-07 preserves both R3 zero-Firewood Ready definitions and validates measured readiness', () => {
    expect(zeroFirewoodIds.every((id) => COMMUNITY_QUEST_CAPABILITIES.some(
      (entry) => entry.definitionId === id && entry.productionStatus === 'PRODUCTION_READY',
    ))).toBe(true);
    expect(questReadinessInvariantErrors(COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_SOURCE_QUESTS)).toEqual([]);
  });

  it('RS-08 rejects an accidentally Ready special-rule Quest', () => {
    const special = COMMUNITY_SOURCE_QUESTS.find((entry) => entry.specialRules.length > 0)!;
    const promoted = {
      ...COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === special.id)!,
      productionStatus: 'PRODUCTION_READY' as const,
      productionReady: false,
      missingPrimitives: [],
      adapterStatus: 'IMPLEMENTED' as const,
      measuredRuntimeProof: { adapterPresent: true, productionProofPresent: true, saveReplayProofPresent: true, selectorProofPresent: true, e2eProofPresent: true },
    };
    expect(questReadinessInvariantErrors([promoted], COMMUNITY_SOURCE_QUESTS)).toContain(`${special.id}: status/ready gate mismatch`);
  });

  it('RS-09 rejects an accidentally promoted simple Crimson Court Quest', () => {
    const crimson = COMMUNITY_SOURCE_QUESTS.find((entry) => entry.contentSet === 'crimson-court' && entry.specialRules.length === 0)!;
    const promoted = {
      ...COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === crimson.id)!,
      productionStatus: 'PRODUCTION_READY' as const,
      productionReady: false,
      missingPrimitives: [],
      adapterStatus: 'IMPLEMENTED' as const,
      measuredRuntimeProof: { adapterPresent: true, productionProofPresent: true, saveReplayProofPresent: true, selectorProofPresent: true, e2eProofPresent: true },
    };
    expect(questReadinessInvariantErrors([promoted], COMMUNITY_SOURCE_QUESTS)).toContain(`${crimson.id}: status/ready gate mismatch`);
  });

  it('RS-10 wrong Rest proof primitive cannot close a Firewood Quest', () => {
    const registry = structuredClone(PRODUCTION_PROOF_REGISTRY) as Record<string, RegisteredProductionProof>;
    registry['C1C1R2-E2E-REST-ALLOCATION'].primitiveId = 'QUEST_FIREWOOD_RESTING_POINT_SETUP';
    const id = firewoodIds[0];
    expect(evaluateCommunityQuestCapability(
      source(id),
      COMMUNITY_QUEST_RUNTIME_ADAPTERS,
      COMMUNITY_QUEST_PRODUCTION_PROOFS,
      registry,
      implementedQuestPrimitives(true),
    ).productionStatus).toBe('ADAPTER_REQUIRED');
  });
});
