import { describe, expect } from 'vitest';
import { BOOK_OF_CONSTITUTION_ID, PRODUCTION_PROOF_REGISTRY } from './production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import {
  COMMUNITY_TRINKET_PRODUCTION_PROOFS,
  COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
  COMMUNITY_SOURCE_TRINKETS,
} from '../data/community-reference/production-runtime';
import { compareTrinketSemanticPayload, trinketSemanticObligations } from './trinket-semantic-coverage';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from './trinket-effect-consumer-coverage';
import type { TrinketDefinition } from '../types';

describe('C1C-12 Book of Constitution semantic binding', () => {
  productionProofTest(PRODUCTION_PROOF_REGISTRY['C1C12-CONSTITUTION-SELECTOR'], () => {
    const source = COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === BOOK_OF_CONSTITUTION_ID)!;
    const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[BOOK_OF_CONSTITUTION_ID];
    const proof = COMMUNITY_TRINKET_PRODUCTION_PROOFS[BOOK_OF_CONSTITUTION_ID];
    expect(adapter.adapterId).toBe('book-of-constitution-disease-discard-positive-v1');
    expect(adapter.requiredPrimitives).toEqual([
      'STAGED_DISEASE_ACQUISITION', 'DISEASE_ACQUIRED_TRINKET_WINDOW', 'TRINKET_DISCARD_DISEASE_CONSUMER',
    ]);
    expect(TRINKET_EFFECT_CONSUMER_COVERAGE['discard-disease']).toEqual({
      effectType: 'discard-disease', consumerPrimitive: 'TRINKET_DISCARD_DISEASE_CONSUMER', wired: true,
    });
    const obligations = trinketSemanticObligations(source, adapter.definition, proof);
    expect(obligations[0]).toMatchObject({
      side: 'positive', triggerMatch: true, windowMatch: true, targetMatch: true,
      effectMatch: true, effectConsumerMatch: true, runtimeSliceSemanticComplete: true,
      implementationStatus: 'IMPLEMENTED',
    });
    expect(obligations[1].implementationStatus).not.toBe('IMPLEMENTED');
  });

  const mutations: Array<[string, (definition: TrinketDefinition) => void]> = [
    ['effect type', (definition) => { definition.positiveSide.effects = []; }],
    ['immediately', (definition) => { definition.positiveSide.effects = [{ type: 'discard-disease', immediately: false as true, target: 'new-disease' }]; }],
    ['target hero', (definition) => { definition.positiveSide.effects = [{ type: 'discard-disease', immediately: true, target: 'equipped-hero' as 'new-disease' }]; }],
    ['target provisions', (definition) => { definition.positiveSide.effects = [{ type: 'discard-disease', immediately: true, target: 'party-provisions' as 'new-disease' }]; }],
    ['wrong window', (definition) => { definition.positiveSide.useWindows = ['before-camp-resolution']; }],
    ['extra effect', (definition) => { definition.positiveSide.effects.push({ type: 'change-light', amount: 1 }); }],
  ];

  for (const [label, mutate] of mutations) {
    productionProofTest({ ...PRODUCTION_PROOF_REGISTRY['C1C12-CONSTITUTION-SELECTOR'], proofId: `mutation:${label}` }, () => {
      const source = COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === BOOK_OF_CONSTITUTION_ID)!;
      const definition = structuredClone(COMMUNITY_TRINKET_RUNTIME_ADAPTERS[BOOK_OF_CONSTITUTION_ID].definition);
      mutate(definition);
      expect(compareTrinketSemanticPayload(source.positiveSide, definition.positiveSide).runtimeSliceSemanticComplete).toBe(false);
    });
  }
});
