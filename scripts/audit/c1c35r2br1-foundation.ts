import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {verifyHistoricalArtifacts} from './historical-baseline';
import {verifyGateA} from './c1c35r2-gate-a';
import {verifyNecromancerCompatibility} from './c1c35r2a-necromancer-compatibility';
import {auditProductionPrototypeReachability} from './c1c35r2a-prototype-reachability';
import {prophetFoundationCampaign,prophetCommand,finishProphetAttack,roundTripProphet} from './c1c35r2br1-fixture';
import {returnProductionBossRoomOnTermination} from '../../src/game-engine/bosses/room-storage';
import {commitBossFoundationVictory} from '../../src/game-engine/commands/boss-foundation';
import {applyProphetThreatEvent} from '../../src/game-engine/prophet/production-threat';
import {createRuinsDrawState,drawOrdinaryRuinsEncounter} from '../../src/game-engine/ruins/encounter-draw';
import {beginOrdinaryRuinsBattle} from '../../src/game-engine/ruins/battle-runtime';
import {ruinsMonster} from '../../src/game-engine/ruins/source-registry';
import {RUINS_V6} from '../../src/types/ruins-executable';
import {createSaveSnapshot,validateSaveFile,restoreSaveSnapshot} from '../../src/game-engine/save';
import {SeededRandom} from '../../src/game-engine/runtime-sources';
import {validateActorOccupancy} from '../../src/game-engine/rules/actor-occupancy';
import type {CampaignState} from '../../src/types';
import tile from '../../docs/data/complete-edition/c1c35-prophet-tile-contract.json';

const root='docs/data/complete-edition/';
export const foundationCapabilities=['ProductionDefinitionL1','ProductionDefinitionL2','ProductionDefinitionL3','Room11Lifecycle',
  'ActorOccupancy','PhysicalPewOwnership','Ordinal1Placement','Ordinal2NormalSkill','CrowdedPendingChoice','Ordinal3Rubble',
  'ThreatLevel1','ThreatLevel2','ThreatLevel3','SaveReplay','TamperValidation','VictoryCleanup','PrototypeIsolation'] as const;
const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);};
const state=(c:CampaignState)=>c.battle!.bossEncounter!.prophetProduction!;
const evidence=(c:CampaignState)=>{const e=c.battle!.bossEncounter!,p=structuredClone(state(c));p.replayOrigin=null;
  return {level:e.bossLevel,round:e.round,phase:e.phase,definition:e.definition,placements:e.placements,occupancy:c.battle!.actorOccupancy,
    rngState:e.rngState,events:e.events,productionState:p,heroes:c.battle!.heroes};};
export const blockerDisposition={previousAssessment:'PROPHET_FOUNDATION_BLOCKED_ON_HERO_ENTRY_PLACEMENT',
  assessmentDisposition:'INVALID_BLOCKER_RUNTIME_MODEL_GAP',sourceWasAvailable:true,newProjectRulingRequired:false,
  failedHistoryCommit:'4bc8dd9a16f13f9f24eff0cf90ea0e14c9e9a45b'};

function roundProof(level:1|2|3,seed:number){
  const reserved=prophetFoundationCampaign(level,seed,false);roundTripProphet(reserved);
  let c=prophetFoundationCampaign(level,seed);roundTripProphet(c);validateActorOccupancy(c.battle!);
  const entry=evidence(c),before=c.battle!.bossEncounter!.rngState;
  c=prophetCommand(c,{type:'SKILL',actionOrdinal:1});const placement=evidence(roundTripProphet(c));
  const rng=new SeededRandom(0);rng.restore(before);
  for(const pew of state(c).pews)assert(pew.placementRoll===Math.floor(rng.next()*10)+1,'Shared placement RNG drift');
  assert(rng.snapshot()===c.battle!.bossEncounter!.rngState,'Placement draw count drift');
  c=prophetCommand(c,{type:'SKILL',actionOrdinal:2});const normalWindow=evidence(roundTripProphet(c));
  c=finishProphetAttack(c);const normal=evidence(c);
  c=prophetCommand(c,{type:'SKILL',actionOrdinal:3});const checkpoints=[];
  for(let ordinal=1;ordinal<=4;ordinal++){
    if(c.battle!.pendingMonsterAttack){c=roundTripProphet(c);c=prophetCommand(c,{type:'PROPHET_ATTACK_FREEZE'});roundTripProphet(c);}
    c=finishProphetAttack(c);roundTripProphet(c);assert(state(c).rubbleCursor===ordinal,'Rubble cursor drift');
    checkpoints.push(evidence(c));if(ordinal<4)c=prophetCommand(c,{type:'PROPHET_NEXT_PEW'});
  }
  assert(state(c).attacks.filter(a=>a.physicalOrdinal).map(a=>a.physicalOrdinal).join(',')==='1,2,3,4','Physical ordering drift');
  const ids=state(c).pews.map(w=>w.physicalCopyId);
  c=prophetCommand(c,{type:'PROPHET_ROUND'});c=prophetCommand(c,{type:'SKILL',actionOrdinal:1});
  assert(JSON.stringify(ids)===JSON.stringify(state(c).pews.map(w=>w.physicalCopyId)),'Physical identity not reused');
  const terminated=returnProductionBossRoomOnTermination(c,'failed');roundTripProphet(terminated);
  let victory=prophetCommand(c,{type:'MONSTER_DAMAGE',amounts:{[c.battle!.monsters[0].id]:999}});
  victory=commitBossFoundationVictory(victory);roundTripProphet(victory);
  assert(commitBossFoundationVictory(victory)===victory,'Repeated victory transaction');
  return {level,seed,entry,placement,normalWindow,normal,rubbleCheckpoints:checkpoints,reusedPewIds:ids,
    room:{reserved:reserved.bossRoomStorage,inPlay:c.bossRoomStorage,terminated:terminated.bossRoomStorage,
      terminationReceipt:terminated.bossRoomReturnHistory,victory:victory.bossRoomStorage,archive:victory.bossEncounterHistory,
      campaignTransactions:victory.processedCampaignTransactionIds}};
}

export function buildFoundationArtifacts(){
  verifyGateA();verifyNecromancerCompatibility();const protectedArtifactCount=verifyHistoricalArtifacts('c1c35r2ar');
  const isolation=auditProductionPrototypeReachability();assert(isolation.productionPrototypeReachability===0,'Prototype reachable');
  const skillSeed=(selected:1|2)=>{
    for(let seed=0;seed<1000;seed++){const rng=new SeededRandom(seed);for(let i=0;i<10;i++)rng.next();
      if((Math.floor(rng.next()*10)+1<=5?1:2)===selected)return seed;}
    throw new Error('Source skill coverage seed absent');
  };
  const proofs=([1,2,3] as const).flatMap(level=>[skillSeed(1),skillSeed(2),35].map(seed=>roundProof(level,seed)));
  for(const level of [1,2,3])assert(new Set(proofs.filter(p=>p.level===level).map(p=>p.normalWindow.productionState.skillSelection!.selectedSkill)).size===2,'Level skill coverage incomplete');
  let tie=prophetFoundationCampaign(1,35,true,{deadHero:1});tie=prophetCommand(tie,{type:'SKILL',actionOrdinal:1});tie=prophetCommand(tie,{type:'SKILL',actionOrdinal:2});
  const choice=tie.battle!.bossEncounter!.pendingChoice!;assert(choice?.candidateIds.length===3,'Crowded tie missing');
  const tieBefore=evidence(roundTripProphet(tie)),tieRng=tie.battle!.bossEncounter!.rngState;
  tie=prophetCommand(tie,{type:'CHOICE',choiceId:choice.choiceId,selectedId:'ruins-tile-11:NE'});
  assert(tie.battle!.bossEncounter!.rngState===tieRng,'Tie selection consumed RNG');
  const threats=[];
  const l1=prophetFoundationCampaign(1,35,false);assert(l1.heroes.every(h=>h.stress===2),'Threat I not applied');
  assert(applyProphetThreatEvent(l1,{type:'DUNGEON_ENTRY',transactionId:`${l1.dungeon!.questRunId}:dungeon-entry`})===l1,'Threat I duplicate');
  threats.push({level:1,stress:l1.heroes.map(h=>h.stress),checkpoint:l1.bossEncounterCheckpoint,dedupe:true});
  const l2=applyProphetThreatEvent(prophetFoundationCampaign(2,35,false),{type:'SCOUTING',transactionId:'proof-scout-1'});
  assert(l2.heroes.every(h=>h.stress===1),'Threat II not applied');assert(applyProphetThreatEvent(l2,{type:'SCOUTING',transactionId:'proof-scout-1'})===l2,'Threat II duplicate');
  threats.push({level:2,stress:l2.heroes.map(h=>h.stress),checkpoint:l2.bossEncounterCheckpoint,dedupe:true});
  let l3=prophetFoundationCampaign(3,35,false,{ruinsV6:true});const stances=Object.fromEntries(l3.heroes.map(h=>[h.instanceId,h.stance]));
  let draw=createRuinsDrawState(3,0,RUINS_V6);
  for(let seed=0;seed<1000;seed++){
    draw=drawOrdinaryRuinsEncounter(createRuinsDrawState(3,seed,RUINS_V6),'prophet-source-spawn-proof',stances);
    const tags=draw.encounters[0].monsters.map(m=>ruinsMonster(m.definitionId,RUINS_V6).tags.includes('Unholy'));
    if(tags.some(Boolean)&&tags.some(x=>!x))break;
  }
  l3=beginOrdinaryRuinsBattle({...l3,ruinsDrawState:draw},'prophet-source-spawn-proof');
  const unholy=l3.battle!.monsters.filter(m=>ruinsMonster(m.sourceId,RUINS_V6).tags.includes('Unholy'));
  assert(unholy.length>0&&l3.heroes.every(h=>h.stress===unholy.length),'Threat III source-spawn mismatch');
  for(const m of unholy)assert(applyProphetThreatEvent(l3,{type:'MONSTER_SPAWN',actorId:m.id,tags:[],transactionId:`${l3.battle!.battleId}:spawn:${m.id}`})===l3,'Threat III duplicate');
  roundTripProphet(l3);threats.push({level:3,stress:l3.heroes.map(h=>h.stress),checkpoint:l3.bossEncounterCheckpoint,dedupe:true,monsters:l3.battle!.monsters});
  const mutations:Record<string,(c:CampaignState)=>void>={
    family:c=>{c.battle!.bossEncounter!.bossFamily='necromancer';},level:c=>{c.battle!.bossEncounter!.bossLevel=2;},
    battleCard:c=>{c.battle!.bossEncounter!.battleCardId++;},threatCard:c=>{c.battle!.bossEncounter!.threatAbilityCardId++;},
    room:c=>{c.bossRoomStorage!.roomCardId++;},tile:c=>{c.bossRoomStorage!.tileId='wrong';},
    stance:c=>{c.battle!.heroes[0].stance='support';},entryArea:c=>{c.battle!.bossEncounter!.placements[c.battle!.heroes[0].id]='ruins-tile-11:S';},
    missingMap:c=>{delete c.battle!.bossEncounter!.definition.heroStartingStanceAreas;},pewCount:c=>{state(c).pews.pop();},
    pewIdentity:c=>{state(c).pews[1].physicalCopyId=state(c).pews[0].physicalCopyId;},pewOrdinal:c=>{state(c).pews[1].ordinal=1;},
    placementRoll:c=>{state(c).pews[0].placementRoll=99;},placementArea:c=>{state(c).pews[0].areaId='foreign';},
    actionOrdinal:c=>{state(c).actionOrdinal=3;},cursor:c=>{state(c).rubbleCursor=9 as never;},
    duplicateAction:c=>{state(c).resolvedActionKeys.push(state(c).resolvedActionKeys[0]);},
    duplicateEvent:c=>{c.battle!.bossEncounter!.events.push(c.battle!.bossEncounter!.events[0]);},
    rngRollback:c=>{c.battle!.bossEncounter!.rngState--;},rngSkip:c=>{c.battle!.bossEncounter!.rngState++;},
    footprint:c=>{c.battle!.actorOccupancy!.occupiedSpaces[c.battle!.monsters[0].id]=1;},
    overflow:c=>{c.battle!.largeMovementContract={ruleSetVersion:'C1C32R2-THREAT-DEPENDENCIES-v3'} as never;},
  };
  const tamper=Object.entries(mutations).map(([kind,mutate])=>{let c=prophetFoundationCampaign();c=prophetCommand(c,{type:'SKILL',actionOrdinal:1});mutate(c);
    const save=createSaveSnapshot(c),rejected=validateSaveFile(save)!==null;let restoreRejected=false;try{restoreSaveSnapshot(save);}catch{restoreRejected=true;}
    assert(rejected&&restoreRejected,'Tamper accepted: '+kind);return {kind,validationRejected:rejected,restoreRejected};});
  const sources=['c1c35-prophet-tile-contract.json','c1c35-prophet-d10-area-map.json','c1c35r2-prophet-production-definitions.json',
    'c1c35-prophet-glyph-semantic-contract.json','c1c35r2-prophet-threat-contract.json','c1c32r2-ordinary-threat-encounter-draw-contract.json'];
  const common={schemaVersion:1,phase:'11A.4-C1C35R2B-R1',baseline:'007712ab6aec2c814fa31e06cf5fe05b21a30879',
    ruleSetVersion:'C1C35R2-PROPHET-DIGITAL-DEFAULT-v1',heroDodgeRuleSetVersion:'C1C31-DIGITAL-DEFAULT-v2',policyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',
    outcome:'PROPHET_PRODUCTION_FOUNDATION_ACCEPTED',productionFoundation:true,productionAccepted:false,
    controlledFoundationRouteAllowed:true,unrestrictedSelectorAllowed:false,c1c36Allowed:true,
    inputHashes:Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(root+p)).digest('hex')])),
    evidenceClassification:{sourceFact:'Pinned official printed components and rulebooks',projectRuling:'Existing versioned R1/R2 rulings only',
      runtimeImplementation:'Shared source-bound production transactions',testProof:'Executed campaign, attack-window, save, tamper and cleanup traces',
      productionAcceptance:'Foundation only; browser acceptance deferred to C1C36'}};
  const accepted=(proof:unknown)=>({...common,status:'PRODUCTION_FOUNDATION_ACCEPTED',proof});
  return {
    'hero-entry-contract':{authority:'OFFICIAL_SOURCE',canonical:true,source:'c1c35-prophet-tile-contract.json',
      sourceReferences:tile.stancePositions.sourceReferences,mapping:tile.stancePositions.heroes,
      genericDeploymentContract:'C1C32R2 ordinary Ruins stance deployment',projectRuling:null,...blockerDisposition},
    'production-state-contract':accepted(proofs.map(p=>p.entry)),
    'pew-ownership-contract':accepted(proofs.map(p=>({level:p.level,seed:p.seed,reusedPewIds:p.reusedPewIds,capacityCost:0,battleActors:false}))),
    'action-scheduler-contract':accepted(proofs.map(p=>({level:p.level,seed:p.seed,keys:p.rubbleCheckpoints[3].productionState.resolvedActionKeys}))),
    'ordinal1-proof':accepted(proofs.map(p=>p.placement)),
    'ordinal2-proof':accepted({normal:proofs.map(p=>({before:p.normalWindow,after:p.normal})),tieBefore,tieAfter:evidence(tie),tieSelectionRngDraws:0}),
    'rubble-proof':accepted(proofs.map(p=>({level:p.level,seed:p.seed,checkpoints:p.rubbleCheckpoints}))),
    'threat-runtime-proof':accepted(threats),
    'room-lifecycle-proof':accepted(proofs.map(p=>({level:p.level,seed:p.seed,...p.room}))),
    'save-replay-matrix':accepted(proofs.map(p=>({level:p.level,seed:p.seed,checkpoints:['RESERVED','IN_PLAY','PLACEMENT','NORMAL_WINDOW','PEW_1','PEW_2','PEW_3','PEW_4','TERMINATION','VICTORY'],result:'EXACT_SHARED_SAVE_RELOAD'}))),
    'tamper-matrix':accepted(tamper),
    'foundation-capability-matrix':{...common,rows:foundationCapabilities.map(capability=>({capability,status:'PRODUCTION_FOUNDATION_ACCEPTED',
      evidence:'Source-bound execution artifacts plus src/audit/c1c35r2br1-prophet-production.test.ts'})),isolation},
    'production-foundation-acceptance':{...common,status:'PRODUCTION_FOUNDATION_ACCEPTED',...blockerDisposition,protectedArtifactCount,
      remoteReleaseGate:{required:true,workflow:'.github/workflows/release-gate.yml',exactHeadEvidence:'Actual GitHub Actions run reported separately; local artifacts do not assert remote success'}},
    'next-workstream-decision':{...common,next:'C1C36 — Prophet Full Production Path & Browser Save/Replay Acceptance',...blockerDisposition},
  };
}
export function verifyFoundationArtifacts(write=false){const artifacts=buildFoundationArtifacts();
  for(const [name,data] of Object.entries(artifacts)){const target=root+'c1c35r2br1-prophet-'+name+'.json',bytes=JSON.stringify(data,null,2)+'\n';
    if(write)writeFileSync(target,bytes);else assert(readFileSync(target,'utf8')===bytes,'R2B-R1 artifact drift: '+target);}
  return artifacts;
}
if(process.argv.includes('--write-r2b')||process.argv.includes('--verify-r2b')){
  verifyFoundationArtifacts(process.argv.includes('--write-r2b'));console.log('C1C35R2B-R1: PROPHET_PRODUCTION_FOUNDATION_ACCEPTED; browser acceptance remains C1C36.');
}
