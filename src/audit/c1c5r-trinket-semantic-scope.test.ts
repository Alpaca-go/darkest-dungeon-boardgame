import { describe, expect, it } from 'vitest';
import trinketData from '../data/community-reference/trinkets/data.json' with { type: 'json' };
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS, evaluateCommunityTrinketCapability } from '../data/community-reference/production-runtime';
import { CHIRURGEONS_CHARM_ID } from './production-proof-registry';
import { trinketReadinessInvariantErrors } from './trinket-readiness-invariants';

const source = trinketData.find((entry) => entry.id === CHIRURGEONS_CHARM_ID)!;

describe('C1C-5R Trinket semantic truth gates', () => {
  it('keeps the battle slice but does not promote the definition', () => {
    const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID)!;
    expect(capability.sourceSemanticComplete).toBe(true);
    expect(capability.runtimeSemanticComplete).toBe(false);
    expect(capability.productionReady).toBe(false);
    expect(capability.blockerCodes).toContain('TRINKET_TRIGGER_SCOPE_UNRESOLVED');
    expect(capability.trinketSemanticObligations).toHaveLength(2);
    expect(capability.trinketSemanticObligations?.every((entry) => entry.implementationStatus === 'PARTIAL')).toBe(true);
    expect(capability.trinketSemanticObligations?.every((entry) => entry.runtimeWindowBinding && entry.proofIds.length > 0)).toBe(true);
  });

  it('rejects an unsupported runtime-added condition', () => {
    const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[CHIRURGEONS_CHARM_ID];
    const mutated = {
      ...adapter,
      definition: {
        ...adapter.definition,
        positiveSide: { ...adapter.definition.positiveSide, canUse: [{ type: 'in-battle' as const }] },
      },
    };
    const capability = evaluateCommunityTrinketCapability(source, { ...COMMUNITY_TRINKET_RUNTIME_ADAPTERS, [source.id]: mutated });
    expect(capability.runtimeSemanticComplete).toBe(false);
    expect(capability.trinketSemanticObligations?.[0].blockerCode).toBe('TRINKET_RUNTIME_ADDED_CONDITION_UNSUPPORTED');
  });

  it('rejects one complete side plus one partial side and battle-only definition proof', () => {
    const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CHIRURGEONS_CHARM_ID)!;
    const positive = capability.trinketSemanticObligations![0];
    const negative = capability.trinketSemanticObligations![1];
    const mutated = {
      ...capability,
      runtimeSemanticComplete: false,
      productionReady: true,
      trinketSemanticObligations: [{ ...positive, implementationStatus: 'IMPLEMENTED' as const }, negative],
    };
    expect(trinketReadinessInvariantErrors([mutated])).toEqual(expect.arrayContaining([
      expect.stringContaining('runtimeSemanticComplete'),
      expect.stringContaining('negativeSideComplete'),
    ]));
  });

  it('has no readiness invariant violations in the measured production set', () => {
    expect(trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES)).toEqual([]);
  });
});
