import { describe, expect, it } from 'vitest';
import { CAMPERS_HELMET_ID, PRODUCTION_PROOF_REGISTRY } from './production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import {
  COMMUNITY_SOURCE_TRINKETS,
  COMMUNITY_TRINKET_CAPABILITIES,
  COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
} from '../data/community-reference/production-runtime';
import { compareTrinketSemanticPayload } from './trinket-semantic-coverage';

productionProofTest(PRODUCTION_PROOF_REGISTRY['C1C10-CAMPERS-SELECTOR'], () => {
  const source = COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === CAMPERS_HELMET_ID)!;
  const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[CAMPERS_HELMET_ID];
  const positive = compareTrinketSemanticPayload(source.positiveSide, adapter.definition.positiveSide);
  const negative = compareTrinketSemanticPayload(source.negativeSide, adapter.definition.negativeSide);
  expect(positive.runtimeSliceSemanticComplete).toBe(true);
  expect(negative.runtimeSliceSemanticComplete).toBe(true);
  expect(positive.runtimePayload.effects).toEqual([{ type: 'roll-provision-dice', target: 'party-provisions', parameters: { count: 2 } }]);
  expect(negative.runtimePayload.effects).toEqual([{ type: 'change-stress', target: 'equipped-hero', parameters: { amount: 1 } }]);
  expect(COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CAMPERS_HELMET_ID)).toMatchObject({
    productionStatus: 'PRODUCTION_READY', productionReady: true, runtimeSemanticComplete: true,
  });
});

describe('Camper semantic mutation guards', () => {
  const source = COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === CAMPERS_HELMET_ID)!;
  const base = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[CAMPERS_HELMET_ID].definition.positiveSide;
  it.each([
    ['count 1', () => ({ ...base, effects: [{ type: 'roll-provision-dice' as const, count: 1, target: 'party-provisions' as const }] }), undefined],
    ['count 3', () => ({ ...base, effects: [{ type: 'roll-provision-dice' as const, count: 3, target: 'party-provisions' as const }] }), undefined],
    ['wrong target', () => ({ ...base, effects: [{ type: 'roll-provision-dice' as const, count: 2, target: 'equipped-hero' as never }] }), undefined],
    ['wrong trigger', () => base, { trigger: 'scout', window: 'before-camp-resolution', target: 'party-provisions' }],
    ['wrong window', () => base, { trigger: 'camping', window: 'before-scout-resolution', target: 'party-provisions' }],
    ['effect removed', () => ({ ...base, effects: [] }), undefined],
    ['effect type', () => ({ ...base, effects: [{ type: 'stress-self' as const, amount: 2 }] }), undefined],
  ] as const)('%s fails exact comparison', (_name, mutate, bindings) => {
    expect(compareTrinketSemanticPayload(source.positiveSide, mutate(), bindings)).toMatchObject({ runtimeSliceSemanticComplete: false });
  });
});
