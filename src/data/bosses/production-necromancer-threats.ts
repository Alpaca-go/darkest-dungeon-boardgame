import type { BossThreatDefinition, CampaignLevel } from '../../types/bosses';
import { resolveBossDefinition } from '../../game-engine/bosses/definitions';
import { HERO_DODGE_V2 } from '../../game-engine/rules/hero-dodge';

/** Metadata for the pinned source executor. Effects execute through its checkpoint, never card parsing. */
export function productionNecromancerThreat(level: CampaignLevel): BossThreatDefinition {
  const definition = resolveBossDefinition('necromancer', level, HERO_DODGE_V2);
  return { id: `necromancer-threat-level-${level}`, bossFamilyId: 'necromancer',
    bossDefinitionId: `necromancer-source-level-${level}`, campaignLevel: level,
    name: `Necromancer ${['I', 'II', 'III'][level - 1]}`,
    description: `Necromancer Threat / Ability card ${definition.threatAbilityCardId}`,
    hamletEffects: { modifiers: [], reactions: [] }, dungeonEffects: { modifiers: [], reactions: [] },
    officialDataStatus: 'verified', enabledInOfficialPool: true,
    sourceReference: `Locked printed card ${definition.threatAbilityCardId}; ${definition.sourceFieldIds.join(', ')}` };
}
