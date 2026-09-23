import { describe, expect } from 'vitest';
import contract from '../../docs/data/complete-edition/c1c13-book-holiness-critical-contract.json';
import { productionProofTest } from '../test-support/production-proof-test';
import { BOOK_OF_HOLINESS_ID, PRODUCTION_PROOF_REGISTRY } from './production-proof-registry';
import {
  COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_PRODUCTION_PROOFS, COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
} from '../data/community-reference/production-runtime';
import { compareTrinketSemanticPayload, trinketSemanticObligations } from './trinket-semantic-coverage';
import { TRINKET_EFFECT_CONSUMER_COVERAGE } from './trinket-effect-consumer-coverage';
import type { TrinketDefinition } from '../types';

describe('C1C-13 Book of Holiness source and semantic closure', () => {
  productionProofTest(PRODUCTION_PROOF_REGISTRY['C1C13-HOLINESS-CRITICAL-SOURCE-CONTRACT'], () => {
    expect(contract.status).toBe('SOURCE_CLOSED');
    expect(Object.values(contract.closure)).toEqual([true, true, true, true, true]);
    expect(contract.semantics).toMatchObject({
      criticalDamage: 'REPLACE_STANDARD_DAMAGE_WITH_PRINTED_CRITICAL_DAMAGE',
      alreadyCriticalPolicy: 'NOT_APPLICABLE', rngPolicy: 'NO_REROLL_OR_RESELECTION',
    });
  });

  productionProofTest(PRODUCTION_PROOF_REGISTRY['C1C13-HOLINESS-CRITICAL-SELECTOR'], () => {
    const source = COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === BOOK_OF_HOLINESS_ID)!;
    const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[BOOK_OF_HOLINESS_ID];
    const proof = COMMUNITY_TRINKET_PRODUCTION_PROOFS[BOOK_OF_HOLINESS_ID];
    expect(adapter.adapterId).toBe('book-of-holiness-critical-negative-v1');
    expect(adapter.requiredPrimitives).toEqual([
      'STAGED_INCOMING_ATTACK_RESOLUTION', 'HERO_HIT_BY_ATTACK_TRINKET_WINDOW',
      'INCOMING_CRITICAL_CONVERSION_CONSUMER',
    ]);
    expect(TRINKET_EFFECT_CONSUMER_COVERAGE['convert-incoming-hit-to-critical']).toEqual({
      effectType: 'convert-incoming-hit-to-critical',
      consumerPrimitive: 'INCOMING_CRITICAL_CONVERSION_CONSUMER', wired: true,
    });
    const obligations = trinketSemanticObligations(source, adapter.definition, proof);
    expect(obligations[0].implementationStatus).not.toBe('IMPLEMENTED');
    expect(obligations[1]).toMatchObject({
      side: 'negative', triggerMatch: true, windowMatch: true, targetMatch: true,
      effectMatch: true, effectConsumerMatch: true, runtimeSliceSemanticComplete: true,
      implementationStatus: 'IMPLEMENTED',
    });
  });

  const mutations: Array<[string, (definition: TrinketDefinition) => void]> = [
    ['missing effect', (d) => { d.negativeSide.effects = []; }],
    ['different effect', (d) => { d.negativeSide.effects = [{ type: 'change-light', amount: 1 }]; }],
    ['extra effect', (d) => { d.negativeSide.effects.push({ type: 'change-light', amount: 1 }); }],
    ['wrong window', (d) => { d.negativeSide.useWindows = ['before-incoming-hit-resolution']; }],
    ['wrong trigger via no window', (d) => { d.negativeSide.useWindows = []; }],
    ['wrong target', (d) => { d.negativeSide.effects = [{ type: 'convert-incoming-hit-to-critical', target: 'party-provisions' as 'equipped-hero' }]; }],
    ['positive wired', (d) => { d.positiveSide.useWindows = ['hero-turn-start']; d.positiveSide.effects = [{ type: 'recover-stress-self', amount: 3 }]; }],
  ];
  for (const [label, mutate] of mutations) {
    productionProofTest({ ...PRODUCTION_PROOF_REGISTRY['C1C13-HOLINESS-CRITICAL-SELECTOR'], proofId: `mutation:${label}` }, () => {
      const source = COMMUNITY_SOURCE_TRINKETS.find((entry) => entry.id === BOOK_OF_HOLINESS_ID)!;
      const definition = structuredClone(COMMUNITY_TRINKET_RUNTIME_ADAPTERS[BOOK_OF_HOLINESS_ID].definition);
      mutate(definition);
      const negative = compareTrinketSemanticPayload(source.negativeSide, definition.negativeSide);
      const positive = compareTrinketSemanticPayload(source.positiveSide, definition.positiveSide);
      expect(negative.runtimeSliceSemanticComplete && positive.runtimeSliceSemanticComplete).toBe(false);
    });
  }
});
