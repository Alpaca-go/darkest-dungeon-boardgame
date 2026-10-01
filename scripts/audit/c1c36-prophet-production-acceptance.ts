import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PRODUCTION_FACE_THE_THREAT_QUEST} from '../../src/data/quests/production-face-the-threat';
import {getBossQuestPool,getQuestPool,runtimeContentContext} from '../../src/data/content-selector';
import {createNewCampaign,selectParty,applyDefaultLoadout} from '../../src/game-engine/campaign';
import {explicitlyMigrateHeroDodgeToV2} from '../../src/game-engine/rules/hero-dodge-versioning';
import {selectProductionRuinsV6} from '../../src/game-engine/commands/necromancer-production-entry';
import {commitQuestSelection,commitLeaveDungeon,commitReturnToHamlet} from '../../src/game-engine/commands/quest';
import {prophetProductionDependencyGate} from '../../src/game-engine/prophet/production-dependency-gate';
import {createSaveSnapshot,validateSaveFile,restoreSaveSnapshot} from '../../src/game-engine/save';
import {seededRuntimeSources,withRuntimeSources} from '../../src/game-engine/runtime-sources';
import {auditProductionPrototypeReachability} from './c1c35r2a-prototype-reachability';
import {verifyHistoricalArtifacts} from './historical-baseline';
import type {CampaignState} from '../../src/types';

const root='docs/data/complete-edition/';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v??null)).digest('hex');
function assert(condition:unknown,message:string):asserts condition {if(!condition)throw new Error('PROPHET_PRODUCTION_ACCEPTANCE_BLOCKED: '+message);}
const read=(name:string)=>JSON.parse(readFileSync(root+name+'.json','utf8'));
export const C1C36_BASELINE='4d1fb9c0af33bb21cf4fa030aa081d5cff3a5106';

function prerequisite(level:1|2|3):CampaignState{
  let c=applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),['crusader','leper','highwayman','vestal']));
  c.gamePhase='quest-select';c=selectProductionRuinsV6(explicitlyMigrateHeroDodgeToV2(c,'c1c36-audit-dodge'));
  c.act=level;c.campaignLevel=level;
  Object.assign(c.campaignProgress,{act:level,campaignLevel:level,activeBossFamilyId:'prophet',defeatedBossFamilyIds:level===3?['necromancer','hag']:level===2?['necromancer']:[]});
  return c;
}
function tamperProof(){return withRuntimeSources(seededRuntimeSources(3636),()=>{
  let c=prerequisite(1);
  for(let i=0;i<2;i++){
    c.gamePhase='quest-select';const q=getQuestPool(runtimeContentContext(c))[0];
    const selected=commitQuestSelection(c,q.id);assert(selected.ok,'audit Standard selection');c=commitLeaveDungeon(selected.campaign).campaign;
    c=commitReturnToHamlet(c,{questId:q.id,questRunId:c.dungeon!.questRunId,questOutcome:c.lastQuestResult!.outcome}).campaign;
  }
  c.gamePhase='quest-select';c=commitQuestSelection(c,'face-the-threat').campaign;
  assert(validateSaveFile(createSaveSnapshot(c))===null,'valid source-bound audit save');
  const mutations:Record<string,(c:CampaignState)=>void>={
    globalReceiptMissing:c=>{c.activeThreatRuntime!.consumedOnceKeys.pop();},
    duplicateGlobalReceipt:c=>{c.activeThreatRuntime!.consumedOnceKeys.push(c.activeThreatRuntime!.consumedOnceKeys[0]);},
    archiveQuestId:c=>{c.prophetQuestThreatHistory![0].questRunId='forged';},
    archiveSourceCard:c=>{c.prophetQuestThreatHistory![0].checkpoint.threatAbilityCardId++;},
    archiveEventSequence:c=>{c.prophetQuestThreatHistory![0].checkpoint.events[0].eventId='forged';},
    archiveCausalParent:c=>{c.prophetQuestThreatHistory![0].checkpoint.events[0].parentEventId='forged';},
    archiveRuleVersion:c=>{c.prophetQuestThreatHistory![0].checkpoint.ruleSetVersion='forged';},
    archiveOnceKey:c=>{c.prophetQuestThreatHistory![0].checkpoint.checkpointContext!.consumedOnceKeys=[];},
    currentQuestId:c=>{c.bossEncounterCheckpoint!.checkpointContext!.questRunId='forged';},
    currentHeroDependency:c=>{Object.values(c.bossEncounterCheckpoint!.checkpointContext!.heroDodgeBindings!)[0].value++;},
    receiptTransaction:c=>{c.processedCampaignTransactionIds=c.processedCampaignTransactionIds.filter(id=>id!==c.activeThreatRuntime!.consumedOnceKeys[0]);},
    roomOwnership:c=>{c.bossRoomStorage!.tileId='forged';},
  };
  return Object.entries(mutations).map(([kind,mutate])=>{
    const forged=structuredClone(c);mutate(forged);const save=createSaveSnapshot(forged);
    const validationRejected=validateSaveFile(save)!==null;let restoreRejected=false;try{restoreSaveSnapshot(save);}catch{restoreRejected=true;}
    assert(validationRejected&&restoreRejected,'tamper accepted: '+kind);return {kind,validationRejected,restoreRejected};
  });
});}

export function buildC1C36Artifacts(){
  assert(existsSync('tmp-c1c36-final-tests.json'),'fresh full-suite JSON report absent; run npm test -- --reporter=json --outputFile=tmp-c1c36-final-tests.json');
  const tests=JSON.parse(readFileSync('tmp-c1c36-final-tests.json','utf8'));
  assert(tests.numPassedTests===2745&&!tests.numFailedTests&&!tests.numFailedTestSuites&&!tests.numPendingTests&&!tests.numTodoTests,
    '2745 automated tests with zero failed/pending/todo required');
  assert(tests.testResults.find((r:{name:string})=>r.name.replace(/\\/g,'/').endsWith('/c1c36-prophet-production-path.test.ts'))?.assertionResults.length===16,
    '16 C1C36 production integration tests required');
  const browser=([1,2,3] as const).map(level=>read('c1c36-prophet-browser-level'+level));
  const matrix=read('c1c36-prophet-browser-reload-matrix');
  for(const b of browser){
    assert(b.status==='PASS'&&b.evidenceVersion==='C1C36-PLAYER-RELOAD-v1','Level '+b.level+' complete browser evidence absent');
    assert(b.questBattleFixture===false&&b.ruleSetVersion==='C1C35R2-PROPHET-DIGITAL-DEFAULT-v1'
      &&b.heroDodgeRuleSetVersion==='C1C31-DIGITAL-DEFAULT-v2','browser source/dependency boundary');
    assert(b.archivedQuestReceipts.length===2&&new Set(b.archivedQuestReceipts.map((r:{questRunId:string})=>r.questRunId)).size===2,'cross-Quest archives');
    assert(b.returnedPewIds.length===4&&new Set(b.returnedPewIds).size===4&&b.activePews===0&&!b.pendingAttack&&!b.pendingChoice,'physical victory cleanup');
    assert(b.room.lifecycle==='RETURNED'&&b.room.roomCardId===44710&&b.room.tileId==='ruins-tile-11'
      &&b.room.encounterId===b.encounterId,'Room 11 identity');
    assert(b.defeatedBossFamilyIds.includes('prophet')&&b.defeatedThreatIds.includes('prophet-threat-level-'+b.level),'Prophet defeat/deactivation');
    assert(b.tavern.some((r:{active:boolean;modifier:number})=>r.active&&r.modifier===-b.level)
      &&b.tavern.some((r:{active:boolean;modifier:number})=>!r.active&&r.modifier===0),'normal Tavern active/deactivated modifier');
    for(const required of ['Standard Quest 0 Threat effect','Standard Quest 1 Threat effect','Hamlet active Threat','Face the Threat Room 11 RESERVED',
      'Room 11 IN_PLAY before first Prophet activation','after ordinal 1 placement','campaign progression','post-victory Tavern without Prophet modifier'])
      assert(matrix.points.some((p:{level:number;point:string})=>p.level===b.level&&p.point===required),'browser reload '+b.level+': '+required);
    for(let n=0;n<=4;n++)assert(b.observed.some((p:string)=>p.endsWith('Rubble '+n)),'Pew checkpoint '+n);
    assert(b.observed.some((p:string)=>p.includes('incoming-attack-window'))&&b.observed.some((p:string)=>p.includes('hero-hit-window')),'staged reaction browser evidence');
    assert(b.observed.includes('Boss victory before settlement'),'victory reload');
  }
  assert(matrix.externalNetworkBlocked===true&&matrix.externalRequests.length===0,'external network boundary');
  assert(browser.some(b=>b.observed.includes('Crowded PendingChoice')),'natural Crowded player choice coverage');
  const spawn=browser[2].spawnAudits;
  assert(spawn.some((r:{unholy:boolean})=>r.unholy)&&spawn.some((r:{unholy:boolean})=>!r.unholy),'both physical Unholy/non-Unholy spawns');
  const skills=new Set(browser.flatMap(b=>b.attacks.map((a:{skillNumber:number})=>a.skillNumber)));
  assert([1,2,3].every(n=>skills.has(n)),'Eye on You, Fulminate and Rubble browser coverage');
  const selector=withRuntimeSources(seededRuntimeSources(3637),()=>[1,2,3].map(level=>{
    const c=prerequisite(level as 1|2|3),context=runtimeContentContext(c),pool=getBossQuestPool(context),gate=prophetProductionDependencyGate(c,level as 1|2|3);
    assert(pool.filter(q=>q.id==='face-the-threat').length===1&&pool.includes(PRODUCTION_FACE_THE_THREAT_QUEST)&&gate.enabled,'normal source selector/gate');
    return {level,context,gate,questHash:hash(PRODUCTION_FACE_THE_THREAT_QUEST),prototypeQuestSelected:false};
  }));
  const isolation=auditProductionPrototypeReachability();const frozen=verifyHistoricalArtifacts('c1c35r2br1');
  assert(existsSync('dist/assets'),'production build output unavailable');
  const entries=[...readFileSync('dist/index.html','utf8').matchAll(/<script[^>]*src="\/assets\/([^"/]+\.js)"/g)].map(m=>m[1]);
  assert(entries.length>0,'production HTML entry bundle absent');
  for(const file of entries)assert(!/force-pew-roll|force-prophet-skill|debug-prophet|inject-crowded|inject-rubble|set-boss-hp|debug-rng/.test(readFileSync('dist/assets/'+file,'utf8')),'production debug control');
  const common={schemaVersion:1,phase:'11A.4-C1C36',baseline:C1C36_BASELINE,policyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',
    ruleSetVersion:'C1C35R2-PROPHET-DIGITAL-DEFAULT-v1',heroDodgeRuleSetVersion:'C1C31-DIGITAL-DEFAULT-v2',ruinsRuleSetVersion:'C1C32R2C-R-DIGITAL-DEFAULT-v6'};
  const levels=browser.map(b=>({level:b.level,status:b.status,stateHash:b.finalStateHash,eventHash:b.eventHash,questRunId:b.questRunId,encounterId:b.encounterId}));
  return {
    'production-path':{...common,status:'PASS',route:['normal Complete Edition campaign','normal Standard Quest selection','active Prophet Threat','source-bound Dungeon',
      'normal Face the Threat selection','Room 11 RESERVED','Room 11 IN_PLAY','three-action Prophet Battle','browser save/reload','victory','physical return','campaign progression'],levels},
    'threat-cross-quest-proof':{...common,status:'PASS',model:'DISJOINT_ARCHIVED_AND_CURRENT_QUEST_RECEIPT_UNION',
      levels:browser.map(b=>({level:b.level,stableThreatDrawTransactionId:b.threatId,archives:b.archivedQuestReceipts,currentQuestRunId:b.questRunId,tavern:b.tavern,spawnAudits:b.spawnAudits}))},
    'physical-ownership-proof':{...common,status:'PASS',levels:browser.map(b=>({level:b.level,room:b.room,returnedPewIds:b.returnedPewIds,activePews:b.activePews,pendingAttack:b.pendingAttack,pendingChoice:b.pendingChoice}))},
    'selector-proof':{...common,status:'PASS',sharedPrintedQuest:{roomCount:8,firewood:PRODUCTION_FACE_THE_THREAT_QUEST.firewoodSetup,hash:hash(PRODUCTION_FACE_THE_THREAT_QUEST),
      rulesAuthority:'LOCKED_OFFICIAL_PRINTED_COMPONENT',transportIsRulesAuthority:false,printedComponentSha256:'3aed3ded69ddd0a3b987fa162c3823159368c569e4514c7a5a1fd2adb7b28001'},levels:selector},
    'save-replay-proof':{...common,status:'PASS',equality:'FULL_PLAYER_SAVE_AND_MIGRATED_RESTORE_EQUALITY',reseedOnReload:false,silentRepairAllowed:false,levels,
      checkpoints:matrix.points.map((p:{level:number;point:string;stateHash:string;saveHash:string;rngHash:string;eventHash:string;ownershipHash:string})=>p)},
    'production-tamper-proof':{...common,status:'PASS',proofScope:'DETERMINISTIC_NODE_INTEGRATION_SEPARATE_FROM_BROWSER_ACCEPTANCE',rows:tamperProof()},
    'production-acceptance':{...common,outcome:'C1C36-PROPHET-PRODUCTION-ACCEPTED',decision:'PROPHET_PRODUCTION_READY',productionFoundation:true,
      productionAccepted:true,productionReady:true,unrestrictedSelectorAllowed:true,workstreamFrozen:true,prototypeProductionReachability:0,debugHooks:0,
      sourceAcquisitionRequired:false,rawLocalRulebookRuntimeDependency:0,externalNetworkBlocked:true,externalRequests:[],
      automatedTests:{passed:tests.numPassedTests,failed:0,pending:0,todo:0,c1c36IntegrationTests:16},
      immutableR2BR1:{phase:'C1C35R2B-R1',commit:C1C36_BASELINE,frozenArtifactCount:frozen,requiredOriginalTests:2729,requiredTargetedTests:67},
      browserLevels:levels,isolation,remoteReleaseGate:{required:true,name:'Production release gate',exactCommittedHeadRequired:true,actualRunReportedSeparately:true}},
    'next-workstream-decision':{...common,next:'C1C37 — Post-Prophet Successor Rebaseline & Next Boss Family Selection',c1c37Allowed:true,
      prophetRuntimeFrozen:true,steps:['freeze C1C36','rebaseline shared successor infrastructure','verify Necromancer + Prophet compatibility','survey remaining Boss families','select next source-closure candidate']},
  };
}
export function verifyC1C36Artifacts(write=false){
  const artifacts=buildC1C36Artifacts();
  for(const [name,data] of Object.entries(artifacts)){
    const file=root+(name==='next-workstream-decision'?'c1c36-':'c1c36-prophet-')+name+'.json',bytes=JSON.stringify(data,null,2)+'\n';
    if(write)writeFileSync(file,bytes);else {
      const committed=JSON.parse(readFileSync(file,'utf8'));
      // Fresh browser campaign identities vary; recompute all acceptance invariants against the current UI run.
      assert(committed.phase==='11A.4-C1C36'&&committed.baseline===C1C36_BASELINE,'acceptance artifact identity '+name);
      for(const [key,value] of Object.entries(data))if(value===null||typeof value!=='object')
        assert(JSON.stringify(committed[key])===JSON.stringify(value),'acceptance artifact contract '+name+': '+key);
      if(name==='production-tamper-proof'||name==='selector-proof')assert(JSON.stringify(committed)===JSON.stringify(data),'deterministic artifact drift '+name);
      if(name==='production-acceptance')for(const key of ['automatedTests','immutableR2BR1','remoteReleaseGate','isolation'])
        assert(JSON.stringify(committed[key])===JSON.stringify(data[key as keyof typeof data]),'deterministic acceptance contract '+key);
    }
  }
  console.log('C1C36: PROPHET_PRODUCTION_READY; three normal browser Levels / complete reload matrix / immutable R2B-R1 evidence PASS. Remote exact-HEAD acceptance remains independently required.');
}
if(process.argv.includes('--write-c1c36')||process.argv.includes('--verify-c1c36'))verifyC1C36Artifacts(process.argv.includes('--write-c1c36'));
