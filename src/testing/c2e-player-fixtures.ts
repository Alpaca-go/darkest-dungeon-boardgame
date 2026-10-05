/** Scoped prerequisites for progression/browser continuation; synthetic combat is never player-path acceptance. */
import type {CampaignState} from '../types';
import {createNewCampaign,selectParty,applyDefaultLoadout} from '../game-engine/campaign';
import {seededRuntimeSources,withRuntimeSources} from '../game-engine/runtime-sources';
import {explicitlyMigrateHeroDodgeToV2} from '../game-engine/rules/hero-dodge-versioning';
import {selectProductionRuinsV6} from '../game-engine/commands/necromancer-production-entry';
import {selectPartyDeployment} from '../game-engine/commands/party-deployment';
import {getQuestPool,runtimeContentContext} from '../data/content-selector';
import {commitQuestSelection,commitLeaveDungeon,commitReturnToHamlet} from '../game-engine/commands/quest';
import {enterProductionOrdinaryThreat} from '../game-engine/ruins/production-threat-runtime';
import {killCampaignHero} from '../game-engine/hero-death';
import {resumeBossFoundation,applyBossFoundationInput} from '../game-engine/commands/boss-foundation';
import {advanceTurn} from '../game-engine/battle';
import {advancePendingMonsterAttack} from '../game-engine/trinkets/battle-trinket-bridge';
import {createInitialXpState} from '../game-engine/progression/xp-ledger';
export function playerPrerequisite(seed=205):CampaignState {return withRuntimeSources(seededRuntimeSources(seed),()=>{
 let c=applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),['crusader','highwayman','vestal','abomination']));c.gamePhase='quest-select';
 c=explicitlyMigrateHeroDodgeToV2(c,'c2e-dodge-'+seed);c=selectProductionRuinsV6(c);
 for(const [i,h] of c.heroes.entries())c=selectPartyDeployment(c,h.instanceId,(['aggressive','defensive','support','ranged'] as const)[i]);
 return c;
});}
export function playerOrdinaryFixture(seed=205):CampaignState {return withRuntimeSources(seededRuntimeSources(seed),()=>{
 let c=playerPrerequisite(seed);const selected=commitQuestSelection(c,getQuestPool(runtimeContentContext(c))[0].id);if(!selected.ok)throw new Error(String(selected.error));c=selected.campaign;
 const room=c.dungeon!.rooms.find(r=>r.sourceRoomToken==='lair'||r.type==='battle');if(!room)throw new Error('Source ordinary Room absent');
 c={...c,dungeon:{...c.dungeon!,currentRoomId:room.id}};return enterProductionOrdinaryThreat(c,room.id);
});}
export function playerGuildFixture():CampaignState {
 const c=playerPrerequisite();c.gamePhase='hamlet';c.hamlet.preparationDays=3;c.hamlet.currentDay=1;c.hamlet.currentEventId='event-quiet-week';c.hamlet.caretakerBlockedBuildingId=null;
 c.heroes=c.heroes.map(h=>({...h,wounds:3,xp:20,xpState:createInitialXpState(20)}));return c;
}
export function playerReplacementFixture():CampaignState {
 let c=playerGuildFixture();c=killCampaignHero(c,{heroInstanceId:c.heroes[0].instanceId,cause:'deathblow-attack',source:'battle',resumePhase:'hamlet'});c.gamePhase='replacement';c.stagecoach.accumulatedXp=20;return c;
}

export function playerBossFixture(family:'necromancer'|'prophet',seed=3621):CampaignState {return withRuntimeSources(seededRuntimeSources(seed),()=>{
 let c=playerPrerequisite(seed);c.campaignProgress.activeBossFamilyId=family;
 for(let n=0;n<2;n++) {c.gamePhase='quest-select';const quest=getQuestPool(runtimeContentContext(c))[0];const selected=commitQuestSelection(c,quest.id);if(!selected.ok)throw new Error(String(selected.error));c=commitLeaveDungeon(selected.campaign).campaign;c=commitReturnToHamlet(c,{questId:quest.id,questRunId:c.dungeon!.questRunId,questOutcome:c.lastQuestResult!.outcome}).campaign;}
 c.gamePhase='quest-select';const selected=commitQuestSelection(c,'face-the-threat');if(!selected.ok)throw new Error(String(selected.error));c=resumeBossFoundation(selected.campaign,selected.campaign.bossRoomStorage!.roomId);
 for(let n=0;n<60;n++) {if(c.battle!.heroes.some(h=>h.id===c.battle!.activeActorId))return c;const b=c.battle!,e=b.bossEncounter!;if(e.pendingChoice)c=applyBossFoundationInput(c,{type:'CHOICE',choiceId:e.pendingChoice.choiceId,selectedId:e.pendingChoice.candidateIds[0]});else if(b.pendingMonsterAttack)c=advancePendingMonsterAttack(c,false,true);else if(e.prophetProduction&&e.phase==='BATTLE_RESOLVING'&&e.prophetProduction.actionOrdinal===3&&e.prophetProduction.rubbleCursor<4)c=applyBossFoundationInput(c,{type:'PROPHET_NEXT_PEW'});else c={...c,battle:advanceTurn(b)};}
 throw new Error('No production Boss Hero turn');
});}
