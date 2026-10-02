import { productionBossFamilyRegistry } from './definitions';
import {productionBossPlayerRouteEnabled} from './production-capabilities';
import {resolveProductionBossRuleSetVersion} from './definitions';
import { prophetProductionDependencyGate } from '../prophet/production-dependency-gate';
import type { CampaignState } from '../../types';
import { getHeroCombatDefinition } from '../../data/progression/hero-level-registry';
import { HERO_DODGE_V1, resolveHeroDodge } from '../rules/hero-dodge';
import { campaignHeroDodgeRuleSetVersion } from '../rules/hero-dodge-versioning';
import { inspectProductionBoneCombatDependency, inspectBoneCombatDependency, productionBoneDefinitions, validateBoneCombatDependency } from './component-adapters/bone-combat-adapter';
import { resolveBossDefinition } from './definitions';
import { validateThreatCheckpoint } from './threat-checkpoint';

export function necromancerProductionDependencyGate(campaign: CampaignState, level: 1 | 2 | 3) {
  const unresolved: string[] = [];
  const ruleSetVersion = campaignHeroDodgeRuleSetVersion(campaign);
  const definition = resolveBossDefinition('necromancer', level, ruleSetVersion);
  if (ruleSetVersion === HERO_DODGE_V1) {
    const legacyUnresolved = ['bone-rabble','bone-soldier','bone-spearman','bone-captain'].flatMap(id=> {
      const candidate = inspectBoneCombatDependency(id);
      return (candidate ? validateBoneCombatDependency(candidate) : ['definition']).map(field=>id+':'+field);
    });
    for (const hero of campaign.heroes.filter(h=>!h.dead)) if (!getHeroCombatDefinition(hero.heroId,hero.level)) legacyUnresolved.push('hero:'+hero.heroId+':level-'+hero.level+':dodge');
    legacyUnresolved.push('BoneSkillExecutor:SOURCE_UNRESOLVED_STANCE_BINDINGS','IncomingAttackReaction:BRIDGE_NOT_CLOSED');
    return { enabled: false, status: 'BLOCKED' as const, ruleSetVersion, roomNumber: definition.roomNumber,
      coreCardIds: [definition.bossIdentityCardId,definition.threatAbilityCardId,definition.battleCardId],
      spawnDefinitions: productionBoneDefinitions(ruleSetVersion), unresolved: legacyUnresolved, syntheticFallbackAllowed: false as const };
  }
  for (const id of ['bone-rabble', 'bone-soldier', 'bone-spearman', 'bone-captain']) {
    const candidate = inspectProductionBoneCombatDependency(id);
    unresolved.push(...(candidate ? validateBoneCombatDependency(candidate) : ['definition']).map(field => `${id}:${field}`));
  }
  for (const hero of campaign.heroes.filter(h => !h.dead)) {
    try { resolveHeroDodge({ heroId: hero.heroId, level: hero.level, ruleSetVersion }); }
    catch { unresolved.push(`hero:${hero.heroId}:level-${hero.level}:dodge`); }
  }
  if (definition.roomNumber !== 10 || !definition.roomCardId || !definition.areas.length) unresolved.push('RoomStorage:UNBOUND');
  if (campaign.bossRoomStorage && campaign.bossRoomStorage.lifecycle !== 'RETURNED'
    && campaign.bossRoomStorage.encounterId !== campaign.bossEncounterCheckpoint?.checkpointContext?.encounterId
    && campaign.bossRoomStorage.encounterId !== campaign.battle?.bossEncounter?.checkpointContext?.encounterId) unresolved.push('RoomStorage:OWNERSHIP_CONFLICT');
  if (campaign.bossEncounterCheckpoint) {
    try { validateThreatCheckpoint(campaign, campaign.bossEncounterCheckpoint); }
    catch { unresolved.push('ThreatCheckpoint:INVALID'); }
  }
  return { enabled: unresolved.length === 0, status: unresolved.length ? 'BLOCKED' as const : 'ENTRY_ALLOWED' as const,
    ruleSetVersion, roomNumber: definition.roomNumber,
    coreCardIds: [definition.bossIdentityCardId, definition.threatAbilityCardId, definition.battleCardId],
    spawnDefinitions: productionBoneDefinitions(ruleSetVersion), unresolved, syntheticFallbackAllowed: false as const };
}
export function necromancerQuestEntryError(campaign: CampaignState, questId: string): string | null {
  if (campaign.runtimeContentProfile !== 'community-complete-edition' || questId !== 'face-the-threat'
    || campaign.campaignProgress.activeBossFamilyId !== 'necromancer') return null;
  try {
    return necromancerProductionDependencyGate(campaign, campaign.campaignProgress.campaignLevel).enabled
      ? null : 'necromancer-production-dependencies-unbound';
  } catch { return 'necromancer-production-dependencies-unbound'; }
}

/** Normal player route fails closed for unregistered families. */
export function productionBossQuestEntryError(campaign: CampaignState, questId: string): string | null {
  if (campaign.runtimeContentProfile !== 'community-complete-edition' || questId !== 'face-the-threat') return null;
  const family = campaign.campaignProgress.activeBossFamilyId;
  if (!family || !productionBossFamilyRegistry.has(family)) return 'production-boss-family-unaccepted';
  if (!productionBossPlayerRouteEnabled(family,resolveProductionBossRuleSetVersion(campaign))) return 'production-boss-family-unaccepted';
  if (family === 'necromancer') return necromancerQuestEntryError(campaign,questId);
  try { return prophetProductionDependencyGate(campaign,campaign.campaignProgress.campaignLevel).enabled
    ? null : 'prophet-production-dependencies-unbound'; } catch { return 'prophet-production-dependencies-unbound'; }
}
