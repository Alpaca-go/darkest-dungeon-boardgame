import type { CampaignState } from '../../types';
import prophetAcceptance from '../../../docs/data/complete-edition/c1c36-prophet-production-acceptance.json';
import { campaignHeroDodgeRuleSetVersion } from '../rules/hero-dodge-versioning';
import { necromancerDefinition } from '../necromancer/contract-adapter';
import { assertHeroDodgeRuleSetVersion } from '../rules/hero-dodge';
import {prophetProductionDefinition, PROPHET_RULE_SET_VERSION, PROPHET_ACTOR_CAPACITY_VERSION} from '../prophet/production-definition';
import {HERO_DODGE_V1, HERO_DODGE_V2} from '../rules/hero-dodge';
import type { BossDefinitionContract, BossEncounterState, EncounterRuleDependencies, NecromancerDefinitionContract } from '../../types/boss-runtime';

export interface ProductionBossFamilyAdapter {
  familyId: string;
  unrestrictedSelectorAllowed: boolean;
  resolveDefinition(level: 1|2|3): BossDefinitionContract;
  ruleSetVersions: readonly string[];
  roomContract: {roomNumber: number; tileId: string};
  threatContract: {gameplayEnabled: boolean};
  dependencies(version: string): EncounterRuleDependencies;
}
export const productionBossFamilyRegistry: ReadonlyMap<string, ProductionBossFamilyAdapter> = new Map([
  ['necromancer', {familyId:'necromancer',unrestrictedSelectorAllowed:true,resolveDefinition:necromancerDefinition,ruleSetVersions:[HERO_DODGE_V1,HERO_DODGE_V2],
    roomContract:{roomNumber:10,tileId:'tile-10'},threatContract:{gameplayEnabled:true},
    dependencies:(version: string)=>({bossRuleSetVersion:version,heroDodgeRuleSetVersion:version})}],
  ['prophet', {familyId:'prophet',unrestrictedSelectorAllowed:prophetAcceptance.productionFoundation&&prophetAcceptance.productionAccepted
    &&prophetAcceptance.productionReady&&prophetAcceptance.unrestrictedSelectorAllowed&&prophetAcceptance.workstreamFrozen
    &&prophetAcceptance.ruleSetVersion===PROPHET_RULE_SET_VERSION,resolveDefinition:prophetProductionDefinition,ruleSetVersions:[PROPHET_RULE_SET_VERSION],
    roomContract:{roomNumber:11,tileId:'ruins-tile-11'},threatContract:{gameplayEnabled:true},
    dependencies:(version: string)=>({bossRuleSetVersion:version,heroDodgeRuleSetVersion:HERO_DODGE_V2,actorOccupancyRuleSetVersion:PROPHET_ACTOR_CAPACITY_VERSION})}],
]);
export function productionBossFamily(family: string): ProductionBossFamilyAdapter {
  const adapter = productionBossFamilyRegistry.get(family);
  if (!adapter) throw new Error('Unsupported Boss family');
  return adapter;
}
export function resolveBossDefinition(family: 'necromancer', level: 1|2|3, version: string): NecromancerDefinitionContract;
export function resolveBossDefinition(family: string, level: 1|2|3, version: string): BossDefinitionContract;
export function resolveBossDefinition(family: string, level: 1 | 2 | 3, version: string): BossDefinitionContract {
  const adapter = productionBossFamily(family);
  if (!adapter.ruleSetVersions.includes(version)) throw new Error('Explicit ruling migration required');
  const definition = adapter.resolveDefinition(level);
  return { ...definition, ruleSetVersion: version };
}
export function resolveEncounterRuleDependencies(family: string, version: string): EncounterRuleDependencies {
  const adapter = productionBossFamily(family);
  if (!adapter.ruleSetVersions.includes(version)) throw new Error('Explicit ruling migration required');
  const binding = adapter.dependencies(version);
  assertHeroDodgeRuleSetVersion(binding.heroDodgeRuleSetVersion);
  return binding;
}
export function encounterRuleDependencies(encounter: Pick<BossEncounterState,'bossFamily'|'ruleSetVersion'|'ruleDependencies'>): EncounterRuleDependencies {
  const expected = resolveEncounterRuleDependencies(encounter.bossFamily,encounter.ruleSetVersion);
  if (encounter.ruleDependencies === undefined) {
    if (encounter.bossFamily !== 'necromancer') throw new Error('Explicit encounter dependencies missing');
  } else if (JSON.stringify(encounter.ruleDependencies)!==JSON.stringify(expected)) throw new Error('Encounter dependency binding mismatch');
  return expected;
}

/** Family identity and Hero Dodge identity are independent pinned dependencies. */
export function resolveProductionBossRuleSetVersion(campaign: CampaignState): string {
  const family = campaign.campaignProgress.activeBossFamilyId;
  if (!family || !productionBossFamilyRegistry.has(family)) return '';
  return family === 'necromancer' ? campaignHeroDodgeRuleSetVersion(campaign)
    : productionBossFamily(family).ruleSetVersions[0];
}
