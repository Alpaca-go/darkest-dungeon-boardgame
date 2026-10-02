import { HERO_DODGE_V1, HERO_DODGE_V2 } from '../rules/hero-dodge';

export const BOSS_SUCCESSOR_COMPATIBILITY_VERSION = 'C1C37-BOSS-SUCCESSOR-COMPATIBILITY-v1';
export const PRODUCTION_BOSS_CAPABILITY_VERSION = 'C1C37-PRODUCTION-BOSS-CAPABILITIES-v1';

export interface ProductionBossCapability {
  readonly familyId: string;
  readonly bossRuleSetVersions: readonly string[];
  readonly playerRouteEnabled: boolean;
}

/** Production configuration. Promotion requires the current behavioral gate to
 * recognize every enabled family/version; docs acceptance reports are not authority. */
export const productionBossCapabilities: readonly ProductionBossCapability[] = Object.freeze([
  Object.freeze({familyId: 'necromancer', bossRuleSetVersions: Object.freeze([HERO_DODGE_V1, HERO_DODGE_V2]), playerRouteEnabled: true}),
  Object.freeze({familyId: 'prophet', bossRuleSetVersions: Object.freeze(['C1C35R2-PROPHET-DIGITAL-DEFAULT-v1']), playerRouteEnabled: true}),
]);

export function productionBossPlayerRouteEnabled(familyId: string, version: string): boolean {
  return productionBossCapabilities.some(c => c.familyId === familyId && c.playerRouteEnabled && c.bossRuleSetVersions.includes(version));
}
