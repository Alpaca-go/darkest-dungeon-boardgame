import type { BossThreatDefinition, CampaignLevel } from '../../types/bosses';
import { prophetProductionDefinition } from '../../game-engine/prophet/production-definition';
/** Printed identity; effects run only through accepted production transactions. */
export function productionProphetThreat(level: CampaignLevel): BossThreatDefinition {
  const d=prophetProductionDefinition(level);
  return {id:'prophet-threat-level-'+level,bossFamilyId:'prophet',bossDefinitionId:'prophet-source-level-'+level,campaignLevel:level,
    name:'Prophet '+['I','II','III'][level-1],description:'Prophet Threat / Ability card '+d.threatAbilityCardId,
    hamletEffects:{modifiers:[],reactions:[]},dungeonEffects:{modifiers:[],reactions:[]},
    officialDataStatus:'verified',enabledInOfficialPool:true,sourceReference:'Locked printed card '+d.threatAbilityCardId};
}
