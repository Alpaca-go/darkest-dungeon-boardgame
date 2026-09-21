import { describe, expect, it } from 'vitest';
import trinketData from '../data/community-reference/trinkets/data.json' with { type: 'json' };
import type { TrinketSideDefinition } from '../types/trinkets';
import {
  COMMUNITY_TRINKET_CAPABILITIES,
  COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
  evaluateCommunityTrinketCapability,
} from '../data/community-reference/production-runtime';
import { compareTrinketSemanticPayload, type TrinketSourceSide } from './trinket-semantic-coverage';

const ACCURACY = 'community-trinket-core-accuracy-stone';
const CRITICAL = 'community-trinket-core-critical-stone';
const CHIRURGEONS = 'community-trinket-core-chirurgeons-charm';
const source = (id: string) => trinketData.find((entry) => entry.id === id)!;
const capabilityWith = (id: string, mutate: (side: TrinketSideDefinition) => TrinketSideDefinition, side: 'positive' | 'negative' = 'positive') => {
  const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[id];
  const mutated = { ...adapter, definition: { ...adapter.definition,
    [side === 'positive' ? 'positiveSide' : 'negativeSide']: mutate(side === 'positive' ? adapter.definition.positiveSide : adapter.definition.negativeSide) } };
  return evaluateCommunityTrinketCapability(source(id), { ...COMMUNITY_TRINKET_RUNTIME_ADAPTERS, [id]: mutated });
};
const mismatchCodes = (id: string, side: 'positive' | 'negative' = 'positive') =>
  capabilityWith(id, (value) => value, side).trinketSemanticObligations?.find((entry) => entry.side === side)?.semanticMismatches.map((entry) => entry.code) ?? [];

describe('C1C-5R2 exact Trinket semantic payload mutations', () => {
  it('M1 rejects wrong modifier amount', () => {
    const result = capabilityWith(ACCURACY, (side) => ({ ...side, modifiers: [{ type: 'accuracy', amount: 9 }] }));
    expect(result.runtimeSemanticComplete).toBe(false);
    expect(result.trinketSemanticObligations?.[0].semanticMismatches.map((entry) => entry.code)).toContain('TRINKET_MODIFIER_AMOUNT_MISMATCH');
  });

  it('M2 rejects wrong modifier type', () => {
    const result = capabilityWith(CRITICAL, (side) => ({ ...side, modifiers: [{ type: 'accuracy', amount: 2 }] }));
    expect(result.runtimeSemanticComplete).toBe(false);
    expect(result.trinketSemanticObligations?.[0].semanticMismatches.map((entry) => entry.code)).toContain('TRINKET_MODIFIER_TYPE_MISMATCH');
  });

  it('M3 rejects wrong sign', () => {
    const result = capabilityWith(ACCURACY, (side) => ({ ...side, modifiers: [{ type: 'accuracy', amount: 1 }] }), 'negative');
    expect(result.runtimeSemanticComplete).toBe(false);
    expect(result.trinketSemanticObligations?.[1].semanticMismatches.map((entry) => entry.code)).toContain('TRINKET_MODIFIER_AMOUNT_MISMATCH');
  });

  it('M4 rejects a missing modifier and M5 rejects extra gameplay behavior', () => {
    expect(capabilityWith(ACCURACY, (side) => ({ ...side, modifiers: [] })).runtimeSemanticComplete).toBe(false);
    const extra = capabilityWith(ACCURACY, (side) => ({ ...side, modifiers: [...side.modifiers, { type: 'crit', amount: 1 }] }));
    expect(extra.runtimeSemanticComplete).toBe(false);
    expect(extra.trinketSemanticObligations?.[0].unsupportedRuntimeBehavior).not.toEqual([]);
  });

  it('M6/M7 reject wrong positive and negative healing amounts without erasing the valid baseline slice', () => {
    const positive = capabilityWith(CHIRURGEONS, (side) => ({ ...side, modifiers: [{ type: 'healing', amount: 20 }] }));
    const negative = capabilityWith(CHIRURGEONS, (side) => ({ ...side, modifiers: [{ type: 'healing', amount: -2 }] }), 'negative');
    expect(positive.trinketSemanticObligations?.[0].runtimeSliceSemanticComplete).toBe(false);
    expect(negative.trinketSemanticObligations?.[1].runtimeSliceSemanticComplete).toBe(false);
    const baseline = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === CHIRURGEONS)!;
    expect(baseline.trinketSemanticObligations?.every((entry) => entry.runtimeSliceSemanticComplete)).toBe(true);
    expect(baseline.runtimeSemanticComplete).toBe(false);
  });

  it('M8 rejects an explicit target binding mismatch and trigger binding mismatch', () => {
    const sourceSide = source(CHIRURGEONS).negativeSide;
    const runtime = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[CHIRURGEONS].definition.negativeSide;
    const target = compareTrinketSemanticPayload(sourceSide, runtime, {
      trigger: 'hero-is-healed', window: 'before-healing-received-resolution', target: 'healing-delivered',
    });
    expect(target.targetMatch).toBe(false);
    expect(target.mismatches.map((entry) => entry.code)).toContain('TRINKET_TARGET_MISMATCH');
    const trigger = compareTrinketSemanticPayload(sourceSide, runtime, {
      trigger: 'hero-heals', window: 'before-healing-received-resolution', target: 'healing-received',
    });
    expect(trigger.mismatches.map((entry) => entry.code)).toContain('TRINKET_TRIGGER_MISMATCH');
  });

  it('M9/M10 compare condition threshold and operator exactly', () => {
    const sourceSide: TrinketSourceSide = { ...source(ACCURACY).positiveSide, conditions: [{ kind: 'light', operator: '>=', value: 3 }] };
    const base = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[ACCURACY].definition.positiveSide;
    const bindings = { trigger: 'hero-skill-resolution', window: 'after-attack-roll-before-hit-resolution', target: 'skill' };
    const threshold = compareTrinketSemanticPayload(sourceSide, { ...base, canUse: [{ type: 'min-light', value: 2 }] }, bindings);
    const operator = compareTrinketSemanticPayload(sourceSide, { ...base, canUse: [{ type: 'max-light', value: 3 }] }, bindings);
    expect(threshold.conditionMatch).toBe(false);
    expect(operator.conditionMatch).toBe(false);
    expect(threshold.mismatches.map((entry) => entry.code)).toContain('TRINKET_CONDITION_MISMATCH');
    expect(operator.mismatches.map((entry) => entry.code)).toContain('TRINKET_CONDITION_MISMATCH');
  });

  it('distinguishes set from add and compares effect parameters', () => {
    const baseSource = source(ACCURACY).positiveSide;
    const baseRuntime = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[ACCURACY].definition.positiveSide;
    const bindings = { trigger: 'hero-skill-resolution', window: 'after-attack-roll-before-hit-resolution', target: 'skill' };
    const setSource: TrinketSourceSide = { ...baseSource, modifiers: [{ kind: 'modify', stat: 'damage', operation: 'set', amount: 0 }], effects: [] };
    const addRuntime = { ...baseRuntime, modifiers: [{ type: 'damage' as const, amount: 0 }] };
    expect(compareTrinketSemanticPayload(setSource, addRuntime, bindings).mismatches.map((entry) => entry.code)).toContain('TRINKET_MODIFIER_OPERATION_MISMATCH');

    const bleedSource: TrinketSourceSide = { ...baseSource, modifiers: [], effects: [{ kind: 'apply-condition-stack', condition: 'bleed', amount: 3, turns: 2 }] };
    const bleedRuntime = { ...baseRuntime, modifiers: [], effects: [{ type: 'apply-condition-self' as const, condition: 'bleed' as const, amount: 2 }] };
    expect(compareTrinketSemanticPayload(bleedSource, bleedRuntime, bindings).mismatches.map((entry) => entry.code)).toContain('TRINKET_EFFECT_PARAMETER_MISMATCH');
  });

  it('keeps both Level 1 definitions Ready through the generic comparator', () => {
    for (const id of [ACCURACY, CRITICAL]) {
      const measured = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === id)!;
      expect(measured.productionReady).toBe(true);
      expect(measured.trinketSemanticObligations?.every((entry) => entry.runtimeSliceSemanticComplete && entry.semanticMismatches.length === 0)).toBe(true);
    }
    expect(mismatchCodes(ACCURACY)).toEqual([]);
  });
});
