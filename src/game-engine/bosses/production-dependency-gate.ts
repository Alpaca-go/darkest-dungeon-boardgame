import type { CampaignState } from '../../types';
import { getHeroCombatDefinition } from '../../data/progression/hero-level-registry';
import { inspectBoneCombatDependency, productionBoneDefinitions, validateBoneCombatDependency } from './component-adapters/bone-combat-adapter';
import { necromancerDefinition } from '../necromancer/contract-adapter';

export function necromancerProductionDependencyGate(campaign: CampaignState, level: 1 | 2 | 3) {
  const definition = necromancerDefinition(level);
  const unresolved = ['bone-rabble', 'bone-soldier', 'bone-spearman', 'bone-captain'].flatMap(id => {
    const candidate = inspectBoneCombatDependency(id);
    return (candidate ? validateBoneCombatDependency(candidate) : ['definition']).map(field => `${id}:${field}`);
  });
  for (const hero of campaign.heroes.filter(h => !h.dead)) {
    if (!getHeroCombatDefinition(hero.heroId, hero.level)) unresolved.push(`hero:${hero.heroId}:level-${hero.level}:dodge`);
  }
  // A validated data shape alone is not an executable ordinary Monster turn.
  // Promotion requires the source-bound Stance/Area executor and reaction bridge.
  unresolved.push('BoneSkillExecutor:SOURCE_UNRESOLVED_STANCE_BINDINGS', 'IncomingAttackReaction:BRIDGE_NOT_CLOSED');
  return { enabled: false as const, status: 'BLOCKED' as const, ruleSetVersion: definition.ruleSetVersion,
    roomNumber: definition.roomNumber, coreCardIds: [definition.bossIdentityCardId, definition.threatAbilityCardId, definition.battleCardId],
    spawnDefinitions: productionBoneDefinitions(), unresolved, syntheticFallbackAllowed: false as const };
}

/** Same gate for the production command and selector. Legacy prototypes stay separate. */
export function necromancerQuestEntryError(campaign: CampaignState, questId: string): string | null {
  if (campaign.runtimeContentProfile !== 'community-complete-edition' || questId !== 'face-the-threat'
    || campaign.campaignProgress.activeBossFamilyId !== 'necromancer') return null;
  const gate = necromancerProductionDependencyGate(campaign, campaign.campaignProgress.campaignLevel);
  return gate.enabled ? null : 'necromancer-production-dependencies-unbound';
}
