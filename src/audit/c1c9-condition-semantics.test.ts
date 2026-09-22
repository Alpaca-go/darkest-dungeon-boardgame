import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_SOURCE_TRINKETS,
  COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
  evaluateCommunityTrinketCapability,
} from '../data/community-reference/production-runtime';
import { CAMOUFLAGE_CLOAK_ID, PRODUCTION_PROOF_REGISTRY } from './production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { compareTrinketSemanticPayload } from './trinket-semantic-coverage';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from './trinket-effect-consumer-coverage';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from './level2-trinket-deck';

const source = COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === CAMOUFLAGE_CLOAK_ID)!;
const runtime = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[CAMOUFLAGE_CLOAK_ID].definition.negativeSide;

describe('C1C-9 exact condition semantics', () => {
  productionProofTest(PRODUCTION_PROOF_REGISTRY['C1C9-CAMOUFLAGE-CONDITION-SELECTOR'], () => {
    const capability = evaluateCommunityTrinketCapability(source);
    expect(runtime).toMatchObject({
      useWindows: ['before-incoming-damage-applied'],
      effects: [{ type: 'apply-condition-stack', condition: 'stun', amount: null, durationTurns: 1, target: 'equipped-hero' }],
    });
    expect(capability.trinketSemanticObligations?.find((entry) => entry.side === 'negative')).toMatchObject({
      triggerMatch: true, windowMatch: true, targetMatch: true, effectMatch: true,
      effectConsumerMatch: true, runtimeSliceSemanticComplete: true, implementationStatus: 'IMPLEMENTED',
    });
    expect(TRINKET_EFFECT_CONSUMER_COVERAGE['apply-condition-stack']).toEqual({
      effectType: 'apply-condition-stack', consumerPrimitive: 'TRINKET_CONDITION_STACK_CONSUMER', wired: true,
    });
    expect(capability.productionReady).toBe(true);
    expect(LEVEL_2_TRINKET_DECK_COVERAGE.productionReadyCount).toBe(3);
    expect(LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw).toBe(false);
  });

  it.each([
    ['amount', { amount: 1 }],
    ['turns', { durationTurns: 2 }],
    ['condition', { condition: 'bleed' }],
    ['target', { target: 'wrong-target' }],
  ])('rejects a wrong %s payload', (_label, mutation) => {
    const candidate = structuredClone(runtime);
    candidate.effects = [{ ...candidate.effects[0], ...mutation } as typeof candidate.effects[number]];
    expect(compareTrinketSemanticPayload(source.negativeSide, candidate).runtimeSliceSemanticComplete).toBe(false);
  });

  it('rejects missing duration, wrong trigger, and wrong window', () => {
    const missing = structuredClone(runtime);
    missing.effects = [{ ...missing.effects[0], durationTurns: undefined } as unknown as typeof missing.effects[number]];
    expect(compareTrinketSemanticPayload(source.negativeSide, missing).runtimeSliceSemanticComplete).toBe(false);
    expect(compareTrinketSemanticPayload(source.negativeSide, runtime, {
      trigger: 'incoming-attack', window: 'before-incoming-damage-applied', target: 'equipped-hero',
    }).runtimeSliceSemanticComplete).toBe(false);
    expect(compareTrinketSemanticPayload(source.negativeSide, runtime, {
      trigger: 'hero-hit-by-attack', window: 'before-incoming-hit-resolution', target: 'equipped-hero',
    }).runtimeSliceSemanticComplete).toBe(false);
  });
});
