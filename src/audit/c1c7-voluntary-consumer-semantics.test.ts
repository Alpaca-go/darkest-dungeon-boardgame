import { describe, expect, it } from 'vitest';
import type { TrinketDefinition } from '../types/trinkets';
import {
  COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_RUNTIME_ADAPTERS, evaluateCommunityTrinketCapability,
  type CommunityTrinketRuntimeAdapter,
} from '../data/community-reference/production-runtime';
import { BOOK_OF_RELAXATION_ID, FORTUNATE_ARMLET_ID } from './production-proof-registry';
import { TRINKET_MODIFIER_CONSUMER_COVERAGE } from './trinket-modifier-consumer-coverage';

const source = () => COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === FORTUNATE_ARMLET_ID)!;
const baseAdapter = () => structuredClone(COMMUNITY_TRINKET_RUNTIME_ADAPTERS[FORTUNATE_ARMLET_ID]);
function capabilityWith(mutate: (definition: TrinketDefinition) => void) {
  const adapter = baseAdapter(); mutate(adapter.definition);
  return evaluateCommunityTrinketCapability(source(), {
    ...COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
    [FORTUNATE_ARMLET_ID]: adapter as CommunityTrinketRuntimeAdapter,
  });
}

describe('C1C-7 semantic truth gates', () => {
  it('matches modifier arrays as canonical semantic sets', () => {
    const result = capabilityWith((definition) => definition.positiveSide.modifiers.reverse());
    expect(result.trinketSemanticObligations?.[0].modifierMatch).toBe(true);
  });

  for (const [label, mutate] of [
    ['accuracy +2', (definition: TrinketDefinition) => { definition.positiveSide.modifiers[0].amount = 2; }],
    ['crit +2', (definition: TrinketDefinition) => { definition.positiveSide.modifiers[1].amount = 2; }],
    ['accuracy removed', (definition: TrinketDefinition) => { definition.positiveSide.modifiers.splice(0, 1); }],
    ['crit removed', (definition: TrinketDefinition) => { definition.positiveSide.modifiers.splice(1, 1); }],
    ['accuracy type changed to crit', (definition: TrinketDefinition) => {
      definition.positiveSide.modifiers[0].type = 'crit';
    }],
    ['extra damage', (definition: TrinketDefinition) => { definition.positiveSide.modifiers.push({ type: 'damage', amount: 1 }); }],
  ] as const) {
    it(`rejects ${label}`, () => {
      expect(capabilityWith(mutate).trinketSemanticObligations?.[0].runtimeSliceSemanticComplete).toBe(false);
    });
  }

  it('keeps voluntary declaration fail closed while preserving the exact positive slice', () => {
    const capability = evaluateCommunityTrinketCapability(source());
    expect(capability.productionReady).toBe(false);
    expect(capability.trinketSemanticObligations?.[0].implementationStatus).toBe('IMPLEMENTED');
    expect(capability.trinketSemanticObligations?.[1]).toMatchObject({
      triggerScopeComplete: false,
      sourceTimingScopeStatus: 'SOURCE_UNRESOLVED',
      blockerCode: 'TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED',
    });
  });

  it('reports Book of Relaxation dodge as represented but unconsumed', () => {
    expect(TRINKET_MODIFIER_CONSUMER_COVERAGE.dodge).toMatchObject({ wired: false, consumerPrimitive: null });
    const book = COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === BOOK_OF_RELAXATION_ID)!;
    const capability = evaluateCommunityTrinketCapability(book);
    expect(capability.productionReady).toBe(false);
    expect(capability.blockerCodes).toContain('TRINKET_MODIFIER_CONSUMER_MISSING');
    expect(capability.trinketSemanticObligations?.[1]).toMatchObject({
      modifierConsumerMatch: false,
      missingModifierConsumers: ['dodge'],
      blockerCode: 'TRINKET_MODIFIER_CONSUMER_MISSING',
    });
  });
});
