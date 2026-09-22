import type { TrinketModifierType } from '../types/trinkets';

export interface RuntimeModifierConsumerBinding {
  modifierType: TrinketModifierType;
  consumerPrimitive: string | null;
  wired: boolean;
}

/**
 * Card-agnostic truth registry. A modifier is not runtime-complete merely
 * because ActiveModifierDefinition can represent it; a production gameplay
 * path must consume it.
 */
export const TRINKET_MODIFIER_CONSUMER_COVERAGE: Readonly<Record<TrinketModifierType, RuntimeModifierConsumerBinding>> = Object.freeze({
  accuracy: { modifierType: 'accuracy', consumerPrimitive: 'POST_ROLL_ATTACK_ACCURACY_CONSUMER', wired: true },
  crit: { modifierType: 'crit', consumerPrimitive: 'POST_ROLL_ATTACK_CRIT_CONSUMER', wired: true },
  damage: { modifierType: 'damage', consumerPrimitive: 'STAGED_ATTACK_DAMAGE_CONSUMER', wired: true },
  healing: { modifierType: 'healing', consumerPrimitive: 'STAGED_HEALING_CONSUMER', wired: true },
  stress: { modifierType: 'stress', consumerPrimitive: null, wired: false },
  'stress-recovery': { modifierType: 'stress-recovery', consumerPrimitive: null, wired: false },
  dodge: { modifierType: 'dodge', consumerPrimitive: null, wired: false },
  'condition-duration': { modifierType: 'condition-duration', consumerPrimitive: null, wired: false },
  light: { modifierType: 'light', consumerPrimitive: null, wired: false },
  'dungeon-roll': { modifierType: 'dungeon-roll', consumerPrimitive: null, wired: false },
});

export function modifierConsumerBinding(stat: string): RuntimeModifierConsumerBinding | null {
  return Object.prototype.hasOwnProperty.call(TRINKET_MODIFIER_CONSUMER_COVERAGE, stat)
    ? TRINKET_MODIFIER_CONSUMER_COVERAGE[stat as TrinketModifierType]
    : null;
}

export function missingModifierConsumers(modifiers: readonly { stat: string }[]): string[] {
  return [...new Set(modifiers
    .filter((modifier) => !modifierConsumerBinding(modifier.stat)?.wired)
    .map((modifier) => modifier.stat))].sort();
}
