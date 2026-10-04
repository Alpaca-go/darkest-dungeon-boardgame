import type { CampaignState } from '../../types';
import foundation from '../../../docs/data/complete-edition/c1c35r2br1-prophet-production-foundation-acceptance.json';
import { prophetProductionDefinition, PROPHET_RULE_SET_VERSION, assertProphetHeroEntryPlacement } from './production-definition';
import { HERO_DODGE_V2, resolveHeroDodgeForHero } from '../rules/hero-dodge';
import { RUINS_V6 } from '../../types/ruins-executable';
import { validateThreatCheckpoint } from '../bosses/threat-checkpoint';
import { productionBossFamilyRegistry } from '../bosses/definitions';

export function prophetProductionDependencyGate(campaign: CampaignState, level: 1|2|3) {
  const unresolved: string[] = [];
  if(!productionBossFamilyRegistry.get('prophet')?.unrestrictedSelectorAllowed)unresolved.push('C1C36:PLAYER_ROUTE_UNACCEPTED');
  if (campaign.campaignProgress.activeBossFamilyId !== 'prophet' || campaign.campaignProgress.campaignLevel !== level
    || ![1,2,3].includes(level)) unresolved.push('Prophet:CAMPAIGN_IDENTITY');
  if (!foundation.productionFoundation || foundation.outcome !== 'PROPHET_PRODUCTION_FOUNDATION_ACCEPTED'
    || foundation.ruleSetVersion !== PROPHET_RULE_SET_VERSION) unresolved.push('R2B-R1:FOUNDATION_UNACCEPTED');
  if (campaign.heroDodgeRuleSetSelection?.ruleSetVersion !== HERO_DODGE_V2) unresolved.push('HeroDodge:V2_REQUIRED');
  if (campaign.ruinsRuleSetSelection?.ruleSetVersion !== RUINS_V6) unresolved.push('Ruins:V6_REQUIRED');
  if (!(campaign.enabledContentSets ?? ['core']).includes('core') || !(campaign.enabledRegions ?? ['ruins']).includes('ruins'))
    unresolved.push('Content:CORE_RUINS_REQUIRED');
  try {
    const definition = prophetProductionDefinition(level);
    assertProphetHeroEntryPlacement(level);
    if (definition.roomNumber !== 11 || definition.roomCardId !== 44710) unresolved.push('Room11:UNBOUND');
    for (const h of campaign.heroes.filter(h=>!h.dead)) resolveHeroDodgeForHero(h,HERO_DODGE_V2);
  } catch { unresolved.push('Prophet:SOURCE_CONTRACT_UNBOUND'); }
  if (campaign.bossRoomStorage && campaign.bossRoomStorage.lifecycle !== 'RETURNED'
    && campaign.bossRoomStorage.encounterId !== campaign.bossEncounterCheckpoint?.checkpointContext?.encounterId
    && campaign.bossRoomStorage.encounterId !== campaign.battle?.bossEncounter?.checkpointContext?.encounterId) unresolved.push('RoomStorage:OWNERSHIP_CONFLICT');
  if (campaign.bossEncounterCheckpoint) {
    try { validateThreatCheckpoint(campaign,campaign.bossEncounterCheckpoint); } catch { unresolved.push('ThreatCheckpoint:INVALID'); }
  }
  return {enabled:unresolved.length===0,status:unresolved.length?'BLOCKED' as const:'ENTRY_ALLOWED' as const,
    ruleSetVersion:PROPHET_RULE_SET_VERSION,roomNumber:11,unresolved,syntheticFallbackAllowed:false as const};
}
