export interface RuntimeEffectConsumerBinding {
  effectType: string;
  consumerPrimitive: string | null;
  wired: boolean;
}

/** Runtime truth registry: representability alone never implies consumption. */
export const TRINKET_EFFECT_CONSUMER_COVERAGE: Readonly<Record<string, RuntimeEffectConsumerBinding>> = Object.freeze({
  heal: { effectType: 'heal', consumerPrimitive: 'TRINKET_HEALING_CONSUMER', wired: true },
  'change-stress': { effectType: 'change-stress', consumerPrimitive: 'TRINKET_STRESS_CONSUMER', wired: true },
  'consume-provision': { effectType: 'consume-provision', consumerPrimitive: 'TRINKET_PROVISION_CONSUMER', wired: true },
  damage: { effectType: 'damage', consumerPrimitive: 'TRINKET_SELF_DAMAGE_CONSUMER', wired: true },
  'change-light': { effectType: 'change-light', consumerPrimitive: 'TRINKET_LIGHT_CONSUMER', wired: true },
  'scale-incoming-damage': { effectType: 'scale-incoming-damage', consumerPrimitive: 'INCOMING_DAMAGE_SCALE_CONSUMER', wired: true },
  'set-damage': { effectType: 'set-damage', consumerPrimitive: 'SET_DAMAGE_OVERRIDE', wired: true },
  'convert-incoming-hit-to-critical': { effectType: 'convert-incoming-hit-to-critical', consumerPrimitive: null, wired: false },
  'apply-condition-stack': { effectType: 'apply-condition-stack', consumerPrimitive: null, wired: false },
});

export function missingEffectConsumers(effects: readonly { type: string }[]): string[] {
  return [...new Set(effects.filter((effect) => !TRINKET_EFFECT_CONSUMER_COVERAGE[effect.type]?.wired)
    .map((effect) => effect.type))].sort();
}
