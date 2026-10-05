import {readFileSync} from 'node:fs';
import type {CampaignState, BattleState} from '../../src/types';
import {productionBossFamilyRegistry, resolveBossDefinition, resolveEncounterRuleDependencies} from '../../src/game-engine/bosses/definitions';
import {PROPHET_RULE_SET_VERSION, PROPHET_ACTOR_CAPACITY_VERSION} from '../../src/game-engine/prophet/production-definition';
import {resolveHeroDodge} from '../../src/game-engine/rules/hero-dodge';
import {validateProductionBossRoomStorage, returnProductionBossRoomOnTermination} from '../../src/game-engine/bosses/room-storage';
import {validateThreatCheckpoint} from '../../src/game-engine/bosses/threat-checkpoint';
import {validateBossSaveContracts} from '../../src/game-engine/bosses/save-dispatch';
import {canEnterArea, validateActorOccupancy} from '../../src/game-engine/rules/actor-occupancy';
import {createSaveSnapshot, validateSaveFile, restoreSaveSnapshot} from '../../src/game-engine/save';
import {seededRuntimeSources,withRuntimeSources} from '../../src/game-engine/runtime-sources';

/** Infrastructure contract fixture, never a production gameplay/Threat hook acceptance observation. */
export function prophetContractFixture(level: 1|2|3 = 1): CampaignState {
  const states=JSON.parse(readFileSync('docs/data/complete-edition/c1c33-browser-level1-replay-states.json','utf8')) as Array<{point:string;campaign:CampaignState}>;
  const c=structuredClone(states.find(s=>s.point==='after-face-the-threat-selection')!.campaign);
  const e=c.bossEncounterCheckpoint!, ctx=e.checkpointContext!;
  c.campaignProgress.campaignLevel=level;
  c.campaignProgress.activeBossFamilyId='prophet';
  c.campaignProgress.activeThreatId=`prophet-threat-level-${level}`;
  c.activeThreatRuntime=null; // R2B owns installing the live Threat lifecycle.
  c.necromancerQuestThreatHistory=[];
  delete c.necromancerPreparationDay;
  delete c.ruinsDrawState;
  delete c.ruinsBoneFigureSupply;
  e.bossFamily='prophet';e.bossLevel=level;e.ruleSetVersion=PROPHET_RULE_SET_VERSION;
  e.ruleDependencies=resolveEncounterRuleDependencies(e.bossFamily,e.ruleSetVersion);
  e.definition=resolveBossDefinition(e.bossFamily,level,e.ruleSetVersion);
  e.battleCardId=e.definition.battleCardId;e.threatAbilityCardId=e.definition.threatAbilityCardId;e.bossIdentityCardId=e.definition.bossIdentityCardId;
  e.events=[];e.eventSequence=0;e.inputs=[];e.summonSupply={};e.spawnDefinitions={};e.activeSummons=[];e.queuedDeathIds=[];
  e.placements={};e.correspondingAreas={};e.pendingChoice=null;
  e.threatState={firstBattleConsumed:false,preparationDayConsumed:false,forcedHeroId:null,permanentlyRemovedDefinitionIds:[],appearedDefinitionIds:[],appearedTokenIds:[]};
  e.reanimationState={firstDeathWindowConsumed:false,lockedEventId:null};
  ctx.encounterId=`${c.id}:${ctx.questRunId}:prophet:${level}`;ctx.definitionVersion=e.ruleSetVersion;ctx.campaignLevel=level;
  ctx.threatId=c.campaignProgress.activeThreatId;ctx.consumedOnceKeys=[];
  ctx.heroDodgeBindings=Object.fromEntries(c.heroes.filter(h=>!h.dead).map(h=>[`u_${h.instanceId}`,resolveHeroDodge({heroId:h.heroId,level:h.level,ruleSetVersion:e.ruleDependencies!.heroDodgeRuleSetVersion})]));
  ctx.heroDodge=Object.fromEntries(Object.entries(ctx.heroDodgeBindings).map(([id,binding])=>[id,binding.value]));
  c.bossRoomStorage={roomId:e.roomId,roomCardId:e.definition.roomCardId,tileId:'ruins-tile-11',encounterId:ctx.encounterId,lifecycle:'RESERVED'};
  return c;
}
export function threatShell(c: CampaignState): BattleState {
  const e=c.bossEncounterCheckpoint!;
  return {battleId:e.checkpointContext!.battleId,sourceRoomId:e.roomId,status:'active',round:e.round,maxRounds:4,
    heroes:[],monsters:[],initiativeOrder:[],initiativeIndex:-1,activeActorId:null,currentActionPoints:0,
    selectedSkillId:null,selectedTargetId:null,battleLog:[],rewards:{gold:0},bossEncounter:e};
}
export function roomLifecycleProbe() {
  const c=prophetContractFixture();validateProductionBossRoomStorage(c);
  const inPlay=structuredClone(c);inPlay.battle=threatShell(inPlay);inPlay.bossEncounterCheckpoint=null;
  inPlay.battle.bossEncounter!.side='ABILITY';inPlay.bossRoomStorage!.lifecycle='IN_PLAY';
  validateProductionBossRoomStorage(inPlay);
  const returned=returnProductionBossRoomOnTermination(inPlay,'incomplete');validateProductionBossRoomStorage(returned);
  if (returnProductionBossRoomOnTermination(returned,'incomplete')!==returned) throw new Error('Duplicate Room return');
  return ['RESERVED','IN_PLAY','RETURNED'];
}
export function runSharedDispatchProbes() {
  const run=(id:string,action:()=>unknown)=>{const result=action();return {id,status:'PASS',result};};
  return [
    run('boss-definition-dispatch',()=>[1,2,3].map(level=>{
      const d=resolveBossDefinition('prophet',level as 1|2|3,PROPHET_RULE_SET_VERSION),pristine=JSON.stringify(d);
      const forged=resolveBossDefinition('prophet',level as 1|2|3,PROPHET_RULE_SET_VERSION);
      forged.stats.immunityTokens.push('audit-only-forgery');
      if(JSON.stringify(resolveBossDefinition('prophet',level as 1|2|3,PROPHET_RULE_SET_VERSION))!==pristine) throw new Error('Returned definition can mutate its pinned source');
      return {level,cardId:d.battleCardId,threatId:d.threatAbilityCardId,runtimeRegistered:d.successorContract!.runtimeRegistered};
    })),
    run('hero-dodge-version',()=>{const dependencies=resolveEncounterRuleDependencies('prophet',PROPHET_RULE_SET_VERSION);resolveHeroDodge({heroId:'crusader',level:1,ruleSetVersion:dependencies.heroDodgeRuleSetVersion});return dependencies;}),
    run('room-storage-tile-11',roomLifecycleProbe),
    run('threat-checkpoint-dispatch',()=>[1,2,3].map(level=>{const c=prophetContractFixture(level as 1|2|3);validateThreatCheckpoint(c,c.bossEncounterCheckpoint!);validateBossSaveContracts(c);return level;})),
    run('shared-large-contract-version',()=>{const c=prophetContractFixture(),b=threatShell(c);b.actorOccupancy={ruleSetVersion:PROPHET_ACTOR_CAPACITY_VERSION,placements:{},occupiedSpaces:{}};validateActorOccupancy(b);
      const area=b.bossEncounter!.definition.areas.find(a=>a.id==='ruins-tile-11:C')!;
      const fourHeroes=Array.from({length:4},()=>({large:false}));
      if (!canEnterArea(area,fourHeroes,{large:true}) || canEnterArea(area,[...fourHeroes,{large:false}],{large:true})) throw new Error('Actor capacity violated');
      return {capacity:area.capacity,largeCost:2,heroCost:1,capacity6Legal:true,capacity7Rejected:true,overflowInherited:false};}),
  ];
}
export function sharedSaveProbe(level: 1|2|3) {
  const c=prophetContractFixture(level);
  const save=withRuntimeSources(seededRuntimeSources(3535),()=>createSaveSnapshot(c));
  const error=validateSaveFile(save);if(error) throw new Error(error);
  const restored=restoreSaveSnapshot(JSON.parse(JSON.stringify(save)));
  if(JSON.stringify(restored)!==JSON.stringify(c)) throw new Error('Shared infrastructure save bytes changed');
  return {level,sharedSchemaVersion:save.version,status:'PASS',proofKind:'INFRASTRUCTURE_CONTRACT_FIXTURE_NOT_GAMEPLAY_ACCEPTANCE'};
}
export const registeredFamilies=()=>Array.from(productionBossFamilyRegistry.keys());
