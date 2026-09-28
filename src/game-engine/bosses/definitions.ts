import { necromancerDefinition } from '../necromancer/contract-adapter';
import type { BossDefinitionContract } from '../../types/boss-runtime';

const adapters: Record<string, (level: 1 | 2 | 3) => BossDefinitionContract> = { necromancer: necromancerDefinition };
export function resolveBossDefinition(family: string, level: 1 | 2 | 3, version: string): BossDefinitionContract {
  const adapter = adapters[family];
  if (!adapter) throw new Error('Unsupported Boss family');
  const definition = adapter(level);
  if (definition.ruleSetVersion !== version) throw new Error('Explicit ruling migration required');
  return definition;
}
