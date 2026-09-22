import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_SOURCE_TRINKETS,
  COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
  evaluateCommunityTrinketCapability,
} from '../data/community-reference/production-runtime';
import { compareTrinketSemanticPayload } from './trinket-semantic-coverage';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from './trinket-effect-consumer-coverage';
import { TRINKET_MODIFIER_CONSUMER_COVERAGE } from './trinket-modifier-consumer-coverage';

const PADLOCK = 'community-trinket-core-protective-padlock';
const CLOAK = 'community-trinket-core-camouflage-cloak';

const source = (id: string) => COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === id)!;

describe('C1C-8 exact incoming attack semantics', () => {
  it('binds the exact Protective Padlock positive payload and consumer', () => {
    const capability = evaluateCommunityTrinketCapability(source(PADLOCK));
    expect(capability.productionReady).toBe(false);
    expect(capability.trinketSemanticObligations?.[0]).toMatchObject({
      triggerMatch: true, windowMatch: true, targetMatch: true, effectMatch: true,
      effectConsumerMatch: true, missingEffectConsumers: [], runtimeSliceSemanticComplete: true,
    });
    expect(capability.trinketSemanticObligations?.[1]).toMatchObject({
      implementationStatus: 'PARTIAL',
      blockerCode: 'TRINKET_MODIFIER_CONSUMER_MISSING',
      triggerScopeComplete: false,
    });
    expect(TRINKET_EFFECT_CONSUMER_COVERAGE['scale-incoming-damage']).toMatchObject({
      wired: true, consumerPrimitive: 'INCOMING_DAMAGE_SCALE_CONSUMER',
    });
  });

  it('binds Dodge only to incoming-attack, not arbitrary voluntary declarations', () => {
    const capability = evaluateCommunityTrinketCapability(source(CLOAK));
    expect(capability.trinketSemanticObligations?.[0]).toMatchObject({
      triggerMatch: true, windowMatch: true, modifierMatch: true,
      modifierConsumerMatch: true, missingModifierConsumers: [], runtimeSliceSemanticComplete: true,
    });
    expect(TRINKET_MODIFIER_CONSUMER_COVERAGE.dodge.supportedTriggers).toEqual(['incoming-attack']);
  });

  it.each([
    ['factor', { numerator: 2, denominator: 5, rounding: 'ceil' }],
    ['rounding', { numerator: 1, denominator: 2, rounding: 'floor' }],
  ] as const)('rejects wrong Protective Padlock %s', (_label, replacement) => {
    const runtime = structuredClone(COMMUNITY_TRINKET_RUNTIME_ADAPTERS[PADLOCK].definition.positiveSide);
    runtime.effects = [{ type: 'scale-incoming-damage', ...replacement } as typeof runtime.effects[number]];
    const comparison = compareTrinketSemanticPayload(source(PADLOCK).positiveSide, runtime);
    expect(comparison.effectMatch).toBe(false);
    expect(comparison.runtimeSliceSemanticComplete).toBe(false);
  });

  it('rejects wrong trigger/window/target bindings', () => {
    const runtime = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[PADLOCK].definition.positiveSide;
    for (const binding of [
      { trigger: 'incoming-attack', window: 'before-incoming-damage-applied', target: 'equipped-hero' },
      { trigger: 'hero-hit-by-attack', window: 'before-incoming-hit-resolution', target: 'equipped-hero' },
      { trigger: 'hero-hit-by-attack', window: 'before-incoming-damage-applied', target: 'skill' },
    ]) {
      expect(compareTrinketSemanticPayload(source(PADLOCK).positiveSide, runtime, binding).runtimeSliceSemanticComplete).toBe(false);
    }
  });
});
