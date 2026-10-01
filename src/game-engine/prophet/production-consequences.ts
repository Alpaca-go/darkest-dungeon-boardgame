import type { CampaignState } from '../../types';
import type { BattleSettlementResult } from '../commands/battle';
import { applyBossRuntimeInput } from '../bosses/foundation';
import { isExecutingProphetCommand } from './production-runtime';

/** The replay binds shared engine inputs once; physical archives stay in their existing owners. */
export function prophetCampaignContext(c:CampaignState):Omit<CampaignState,'battle'> {
  const {battle,bossEncounterCheckpoint,bossEncounterHistory,bossRoomReturnHistory,prophetQuestThreatHistory,
    necromancerQuestThreatHistory,ruinsDrawState,...context}=c;
  return structuredClone(context);
}

export function settleProphetConsequences(c:CampaignState,mentalGuardLimit:number):BattleSettlementResult|null {
  if(isExecutingProphetCommand())return null;
  const before=c.battle!.bossEncounter!.prophetProduction!.campaignContext;
  if(!before)throw new Error('Prophet production consequence origin missing');
  const battle=applyBossRuntimeInput(c.battle!,{type:'PROPHET_CAMPAIGN_CONSEQUENCES',mentalGuardLimit});
  const after=battle.bossEncounter!.prophetProduction!.campaignContext!;
  const patch:Record<string,unknown>={};
  for(const key of Object.keys(after) as Array<keyof typeof after>)
    if(JSON.stringify(after[key])!==JSON.stringify(before[key]))patch[key]=after[key];
  return {ok:true,campaign:{...c,...patch,battle},error:null,mentalLoops:0};
}
