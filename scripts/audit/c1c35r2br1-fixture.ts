import type {CampaignState} from '../../src/types';
import {createNewCampaign,selectParty,applyDefaultLoadout,selectQuest} from '../../src/game-engine/campaign';
import {seededRuntimeSources,withRuntimeSources} from '../../src/game-engine/runtime-sources';
import {explicitlyMigrateHeroDodgeToV2} from '../../src/game-engine/rules/hero-dodge-versioning';
import {reserveProphetFoundationEncounter,enterProphetFoundationRoom} from '../../src/game-engine/prophet/production-entry';
import {applyBossFoundationInput} from '../../src/game-engine/commands/boss-foundation';
import {createSaveSnapshot,restoreSaveSnapshot,validateSaveFile} from '../../src/game-engine/save';
import type {BossRuntimeInput} from '../../src/types/boss-runtime';
import {explicitlySelectRuinsV6} from '../../src/game-engine/rules/ruins-v6';
import {explicitlySelectRuinsV4} from '../../src/game-engine/rules/ruins-v4';
import {explicitlySelectRuinsV5} from '../../src/game-engine/rules/ruins-v5';

/** Controlled campaign progression fixture, built through real constructors/commands.
 * It does not substitute a Necromancer encounter or use prototype definitions. */
export function prophetFoundationCampaign(level:1|2|3=1,seed=35,enter=true,setup:{deadHero?:number;deathDoorHero?:number;ruinsV6?:boolean}={}):CampaignState {
  return withRuntimeSources(seededRuntimeSources(351),()=>{
    let c=applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),['crusader','leper','highwayman','vestal']));
    c=explicitlyMigrateHeroDodgeToV2(c,'controlled-prophet-foundation-dodge-v2');
    if(setup.ruinsV6)c=explicitlySelectRuinsV6(explicitlySelectRuinsV5(explicitlySelectRuinsV4({...c,gamePhase:'quest-select',activeThreatRuntime:null},'controlled-prophet-v4'),'controlled-prophet-v5'),'controlled-prophet-foundation-ruins-v6');
    c={...c,act:level,campaignLevel:level,gamePhase:'quest-select',currentThreatId:`prophet-threat-level-${level}`,
      campaignProgress:{...c.campaignProgress,act:level,campaignLevel:level,activeThreatId:`prophet-threat-level-${level}`,
        activeBossFamilyId:'prophet',activeBossDefinitionId:`prophet-source-level-${level}`,completedStandardQuestsThisAct:2,
        defeatedBossFamilyIds:level===3?['necromancer','collector']:level===2?['necromancer']:[],
        defeatedThreatIds:level===3?['necromancer-threat-level-1','collector-threat-level-2']:level===2?['necromancer-threat-level-1']:[],
        bossQuestUnlocked:true,bossQuestRequired:true,pendingThreatInitialization:false}};
    c=selectQuest(c,'face-the-threat');
    if(setup.deadHero!==undefined)c.heroes[setup.deadHero].dead=true;
    if(setup.deathDoorHero!==undefined){c.heroes[setup.deathDoorHero].atDeathsDoor=true;c.heroes[setup.deathDoorHero].wounds=999;}
    c=reserveProphetFoundationEncounter(c,seed);
    return enter?enterProphetFoundationRoom(c):c;
  });
}
export function prophetCommand(c:CampaignState,input:BossRuntimeInput):CampaignState{return applyBossFoundationInput(c,input);}
export function finishProphetAttack(c:CampaignState):CampaignState {
  let next=c;let guard=0;
  while(next.battle?.pendingMonsterAttack){if(guard++>20)throw new Error('Unsettled Prophet attack');
    next=prophetCommand(next,{type:next.battle.pendingMonsterAttack.stage==='incoming-attack-window'?'PROPHET_ATTACK_FREEZE':'PROPHET_ATTACK_COMMIT'});}
  return next;
}
export function roundTripProphet(c:CampaignState):CampaignState {
  const save=withRuntimeSources(seededRuntimeSources(351),()=>createSaveSnapshot(c));
  const error=validateSaveFile(save);if(error)throw new Error(error);
  return restoreSaveSnapshot(JSON.parse(JSON.stringify(save)));
}
