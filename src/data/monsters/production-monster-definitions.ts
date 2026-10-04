import data from './production-monster-definitions.generated.json';
import type { ProductionMonsterDefinition, ProductionMonsterIdentity } from './production-monster-definition-types';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
export const PRODUCTION_MONSTER_DEFINITION_VERSION = 'C3B-MONSTER-DEFINITIONS-v1';
export const PRODUCTION_MONSTER_DEFINITIONS: readonly ProductionMonsterDefinition[] =
  deepFreeze(data.definitions as ProductionMonsterDefinition[]);
export const PRODUCTION_MONSTER_IDENTITIES: readonly ProductionMonsterIdentity[] =
  deepFreeze(data.identities as ProductionMonsterIdentity[]);
