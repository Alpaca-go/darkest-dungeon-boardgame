import type { TrinketUseCondition } from '../types/trinkets';

export const TRINKET_CONDITION_CONSUMER_COVERAGE = Object.freeze({
  stance: { conditionType: 'stance', consumerPrimitive: 'TRINKET_STANCE_CONDITION_CONSUMER', wired: true },
} as const);

export function missingConditionConsumers(conditions: readonly TrinketUseCondition[]): string[] {
  return conditions.filter((condition) => condition.type === 'stance' && !TRINKET_CONDITION_CONSUMER_COVERAGE.stance.wired)
    .map((condition) => condition.type);
}
