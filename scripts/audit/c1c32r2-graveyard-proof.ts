import { createHash } from 'node:crypto';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../../src/game-engine/campaign';
import { commitQuestSelection } from '../../src/game-engine/commands/quest';
import { applyBossThreatCheckpointInput } from '../../src/game-engine/commands/boss-foundation';
import { explicitlyMigrateHeroDodgeToV2 } from '../../src/game-engine/rules/hero-dodge-versioning';
import { applyNecromancerPreparationDayGraveyard, activateGraveyardForNextQuest, expireGraveyardAtQuestEnd } from '../../src/game-engine/campaign/necromancer-graveyard';
import { seededRuntimeSources, withRuntimeSources } from '../../src/game-engine/runtime-sources';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../../src/game-engine/save';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function graveyardDependencyProofs() {
  return ([{level:2,useEffect:true},{level:2,useEffect:false},{level:3,useEffect:false}] as const).map(input=>
    withRuntimeSources(seededRuntimeSources(323220 + input.level),()=>{
      let c=applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),['crusader','highwayman','vestal','hellion']));
      c.gamePhase='quest-select';
      Object.assign(c.campaignProgress,{campaignLevel:input.level,act:input.level,activeBossFamilyId:'necromancer',activeThreatId:`necromancer-threat-level-${input.level}`,
        pendingThreatInitialization:false,completedStandardQuestsThisAct:2,bossQuestRequired:true});
      c=explicitlyMigrateHeroDodgeToV2(c,'C1C32R2-graveyard-domain-proof');
      const chosen=commitQuestSelection(c,'face-the-threat');
      if(!chosen.ok)throw new Error(chosen.error!);
      c=applyBossThreatCheckpointInput(chosen.campaign,{type:'PREPARATION_DAY',rolls:Object.fromEntries(chosen.campaign.heroes.map((h,i)=>[`u_${h.instanceId}`,i+1]))});
      // Isolated campaign command: the UI checkpoint-creation bridge is not implemented or certified.
      c={...c,gamePhase:'hamlet',hamlet:{...c.hamlet,currentDay:1}};
      const applied=applyNecromancerPreparationDayGraveyard(c,input.useEffect);
      const save=createSaveSnapshot(applied);
      if(validateSaveFile(save))throw new Error(validateSaveFile(save)!);
      const reload=restoreSaveSnapshot(JSON.parse(JSON.stringify(save)));
      if(hash(applied)!==hash(reload)||applyNecromancerPreparationDayGraveyard(reload,input.useEffect)!==reload)throw new Error('Graveyard transaction replay differs');
      const active=activateGraveyardForNextQuest(applied),resumed=activateGraveyardForNextQuest(reload);
      if(hash(active)!==hash(resumed))throw new Error('Next-Quest activation replay differs');
      const expired=expireGraveyardAtQuestEnd(active);
      return {...input,status:'PASS',classification:'CAMPAIGN_TRANSACTION_COMMAND_ISOLATION',productionPathAcceptance:false,
        fixtureControls:['pre-Boss campaign gate','Hamlet phase at settled checkpoint','next-Quest activation in isolated context'],
        beforeHash:hash(c),appliedHash:hash(applied),saveHash:hash(save),reloadedHash:hash(reload),activeHash:hash(active),expiredHash:hash(expired),
        transactionId:applied.necromancerGraveyardReceipts![0].transactionId,receipt:applied.necromancerGraveyardReceipts![0]};
    }));
}
