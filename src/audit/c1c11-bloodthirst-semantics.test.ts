import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_SOURCE_TRINKETS,
  COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
  evaluateCommunityTrinketCapability,
} from '../data/community-reference/production-runtime';
import { BLOODTHIRST_RING_ID, PRODUCTION_PROOF_REGISTRY } from './production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { compareTrinketSemanticPayload } from './trinket-semantic-coverage';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from './trinket-effect-consumer-coverage';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from './level2-trinket-deck';

const source = COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === BLOODTHIRST_RING_ID)!;
const definition = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[BLOODTHIRST_RING_ID].definition;
const runtime = definition.negativeSide;

describe('C1C-11 Bloodthirst Ring partial-card semantic closure', () => {
  productionProofTest(PRODUCTION_PROOF_REGISTRY['C1C11-BLOODTHIRST-NEGATIVE-SELECTOR'], () => {
    const capability = evaluateCommunityTrinketCapability(source);
    expect(definition.positiveSide).toMatchObject({ useWindows: [], effects: [] });
    expect(runtime).toMatchObject({
      useWindows: ['before-incoming-damage-applied'],
      effects: [{ type: 'apply-condition-stack', condition: 'bleed', amount: 3, durationTurns: 2, target: 'equipped-hero' }],
      canUse: [{ type: 'in-battle' }],
    });
    expect(capability.trinketSemanticObligations?.find((entry) => entry.side === 'negative')).toMatchObject({
      triggerMatch: true, windowMatch: true, targetMatch: true, effectMatch: true,
      effectConsumerMatch: true, runtimeSliceSemanticComplete: true, implementationStatus: 'IMPLEMENTED',
    });
    expect(capability.trinketSemanticObligations?.find((entry) => entry.side === 'positive')).toMatchObject({
      runtimeSliceSemanticComplete: false,
    });
    expect(TRINKET_EFFECT_CONSUMER_COVERAGE['apply-condition-stack']).toEqual({
      effectType: 'apply-condition-stack', consumerPrimitive: 'TRINKET_CONDITION_STACK_CONSUMER', wired: true,
    });
    expect(capability.requiredPrimitives).toEqual([
      'STAGED_INCOMING_ATTACK_RESOLUTION', 'HERO_HIT_BY_ATTACK_TRINKET_WINDOW', 'TRINKET_CONDITION_STACK_CONSUMER',
    ]);
    expect(capability.productionReady).toBe(false);
    expect(capability.positiveRuntimeSupport).toBe('ENGINE_PRIMITIVE_MISSING');
    // Whole-card support remains fail-closed because the positive voluntary declaration is unresolved.
    expect(capability.negativeRuntimeSupport).toBe('ENGINE_PRIMITIVE_MISSING');
    expect(LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount).toBe(4);
    expect(LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw).toBe(false);
  });

  it.each([
    ['amount-2', { amount: 2 }], ['amount-4', { amount: 4 }],
    ['turns-1', { durationTurns: 1 }], ['turns-3', { durationTurns: 3 }],
    ['blight', { condition: 'blight' }], ['stun', { condition: 'stun' }],
    ['target', { target: 'wrong-target' }],
  ])('rejects mutation %s', (_label, mutation) => {
    const candidate = structuredClone(runtime);
    candidate.effects = [{ ...candidate.effects[0], ...mutation } as typeof candidate.effects[number]];
    expect(compareTrinketSemanticPayload(source.negativeSide, candidate).runtimeSliceSemanticComplete).toBe(false);
  });

  it('rejects missing effect or duration and wrong trigger/window', () => {
    const noEffect = structuredClone(runtime);
    noEffect.effects = [];
    expect(compareTrinketSemanticPayload(source.negativeSide, noEffect).runtimeSliceSemanticComplete).toBe(false);
    const noDuration = structuredClone(runtime);
    noDuration.effects = [{ ...noDuration.effects[0], durationTurns: undefined } as unknown as typeof noDuration.effects[number]];
    expect(compareTrinketSemanticPayload(source.negativeSide, noDuration).runtimeSliceSemanticComplete).toBe(false);
    expect(compareTrinketSemanticPayload(source.negativeSide, runtime, {
      trigger: 'incoming-attack', window: 'before-incoming-damage-applied', target: 'equipped-hero',
    }).runtimeSliceSemanticComplete).toBe(false);
    expect(compareTrinketSemanticPayload(source.negativeSide, runtime, {
      trigger: 'hero-hit-by-attack', window: 'before-incoming-hit-resolution', target: 'equipped-hero',
    }).runtimeSliceSemanticComplete).toBe(false);
  });
});
