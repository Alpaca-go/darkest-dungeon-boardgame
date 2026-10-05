import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {verifyHistoricalBaseline,verifyHistoricalArtifacts} from './historical-baseline';
import {verifyNecromancerCompatibility,compatibilityVersion} from './c1c35r2a-necromancer-compatibility';
import {verifyProphetCompatibility,prophetPrerequisite,C1C36_ACCEPTED_COMMIT} from './c1c37-prophet-compatibility';
import {buildBossSourceSurvey} from './c1c37-source-survey';
import {auditSuccessorProductionIsolation,auditBuiltProductionIsolation} from './c1c37-production-isolation';
import {productionBossCapabilities,BOSS_SUCCESSOR_COMPATIBILITY_VERSION,PRODUCTION_BOSS_CAPABILITY_VERSION} from '../../src/game-engine/bosses/production-capabilities';
import {productionBossFamilyRegistry,resolveEncounterRuleDependencies} from '../../src/game-engine/bosses/definitions';
import {commitQuestSelection,commitLeaveDungeon,commitReturnToHamlet} from '../../src/game-engine/commands/quest';
import {getQuestPool,runtimeContentContext} from '../../src/data/content-selector';
import {seededRuntimeSources,withRuntimeSources} from '../../src/game-engine/runtime-sources';
import {createSaveSnapshot,validateSaveFile} from '../../src/game-engine/save';

const root='docs/data/complete-edition/';
const read=(name:string)=>JSON.parse(readFileSync(root+name+'.json','utf8'));
const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error('C1C37 blocked: '+message);};
// Independent coverage recognition. Adding a configuration entry cannot recognize
// itself: its behavioral suite/version must be deliberately registered here.
export const recognizedCompatibilityVersions:Readonly<Record<string,readonly string[]>>={
  necromancer:['C1C28-DIGITAL-DEFAULT-v1','C1C31-DIGITAL-DEFAULT-v2'],
  prophet:['C1C35R2-PROPHET-DIGITAL-DEFAULT-v1'],
};
export function validateCapabilityPromotion(capabilities=productionBossCapabilities) {
  assert(new Set(capabilities.map(c=>c.familyId)).size===capabilities.length,'duplicate capability');
  for(const c of capabilities)if(c.playerRouteEnabled){
    assert(c.bossRuleSetVersions.length>0,'enabled capability without versions');
    const adapter=productionBossFamilyRegistry.get(c.familyId);
    assert(adapter,'unknown enabled family');
    for(const version of c.bossRuleSetVersions)assert(recognizedCompatibilityVersions[c.familyId]?.includes(version)&&adapter!.ruleSetVersions.includes(version),'unrecognized enabled family/version');
  }
  for(const adapter of productionBossFamilyRegistry.values())if(adapter.unrestrictedSelectorAllowed)
    assert(capabilities.some(c=>c.familyId===adapter.familyId&&c.playerRouteEnabled&&adapter.ruleSetVersions.every(v=>c.bossRuleSetVersions.includes(v))),'dispatch bypasses capability declaration');
}
export function verifyBossSuccessorCompatibility() {
  validateCapabilityPromotion();verifyNecromancerCompatibility();verifyProphetCompatibility();
  console.log(BOSS_SUCCESSOR_COMPATIBILITY_VERSION+': PASS; NECROMANCER_SUCCESSOR_COMPATIBILITY: PASS; PROPHET_SUCCESSOR_COMPATIBILITY: PASS');
}
export function prepareBrowserPrerequisite() {
  return withRuntimeSources(seededRuntimeSources(3738),()=>{
    let c=prophetPrerequisite(1);
    for(let i=0;i<2;i++){
      c.gamePhase='quest-select';const q=getQuestPool(runtimeContentContext(c))[0];
      const result=commitQuestSelection(c,q.id);assert(result.ok,'browser prerequisite Standard');c=commitLeaveDungeon(result.campaign).campaign;
      c=commitReturnToHamlet(c,{questId:q.id,questRunId:c.dungeon!.questRunId,questOutcome:c.lastQuestResult!.outcome}).campaign;
    }
    c.gamePhase='quest-select';const save=createSaveSnapshot(c);assert(validateSaveFile(save)===null,'browser prerequisite valid save');return save;
  });
}
export function buildSuccessorArtifacts() {
  verifyHistoricalBaseline('c1c36');validateCapabilityPromotion();
  const necromancer=verifyNecromancerCompatibility();verifyProphetCompatibility();
  const isolation=auditSuccessorProductionIsolation(),browser=read('c1c37-built-bundle-browser-smoke');
  assert(browser.status==='PASS'&&browser.buildIdentity===isolation.buildIdentity,'fresh built-browser parity for current dist');
  assert(browser.externalRequests.length===0&&browser.appErrors.length===0&&browser.server==='vite preview'&&browser.e2eControls===false,'production browser isolation');
  for(const field of ['completeEditionCreated','normalQuestSelectorVisible','sourceStandardQuestSelected','prophetSelectorVisible','roomReserved','validSaveReloaded'])assert(browser[field]===true,'browser '+field);
  const tests=JSON.parse(readFileSync('tmp-c1c37-final-tests.json','utf8'));
  assert(tests.numPassedTests>=2745&&!tests.numFailedTests&&!tests.numFailedTestSuites&&!tests.numPendingTests&&!tests.numTodoTests,'full regression with zero failed/pending/todo');
  assert(tests.testResults.find((r:any)=>r.name.replace(/\\/g,'/').endsWith('/c1c36-prophet-production-path.test.ts'))?.assertionResults.length===16,'original C1C36 tests retained');
  assert(tests.testResults.find((r:any)=>r.name.replace(/\\/g,'/').endsWith('/c1c35r2br1-prophet-production.test.ts'))?.assertionResults.length===67,'original Prophet 67 tests retained');
  const survey=buildBossSourceSurvey(),decision=survey['next-family-decision'];
  const common={schemaVersion:1,phase:'11A.4-C1C37',contractVersion:BOSS_SUCCESSOR_COMPATIBILITY_VERSION,baseline:C1C36_ACCEPTED_COMMIT};
  const registry={...common,version:PRODUCTION_BOSS_CAPABILITY_VERSION,authority:'PRODUCTION_CONFIGURATION',acceptanceEvidenceIsRuntimeAuthority:false,
    capabilities:productionBossCapabilities,recognizedCompatibilityVersions,
    dependencies:productionBossCapabilities.map(c=>({family:c.familyId,versions:c.bossRuleSetVersions.map(v=>resolveEncounterRuleDependencies(c.familyId,v))})),
    sharedContracts:['explicit EncounterRuleDependencies','per-family selectRuleSetVersion(campaign)','capability family/version gate','save dependency validation'],
    familySpecificContracts:['Hero entry geometry','Quest eligibility / content set / region','Room reservation','Threat hooks','number of campaign Levels'],
    dependencyReview:[
      {path:'src/game-engine/bosses/definitions.ts',finding:'Ruleset selection moved to per-family adapter; dependencies(version) keeps Boss / Hero Dodge / occupancy identities independent.'},
      {path:'src/data/content-selector.ts',finding:'The accepted Face the Threat route currently requires core / Ruins / Hero Dodge v2. This is a route-specific contract, not universal Boss eligibility.'},
      {path:'src/game-engine/bosses/production-dependency-gate.ts',finding:'Only the two accepted family gates are dispatched. A new encounter model needs its own reviewed gate before registry promotion.'},
      {path:'src/game-engine/bosses/room-storage.ts',finding:'Shared ownership / lifecycle ledger is reusable; one reserved objective Room and Levels I–III must not be presumed for expansion encounters.'},
    ],
    noImplicitBossEqualsHeroDodge:true,unacceptedFamiliesFailClosed:true};
  return {
    'historical-c1c36-freeze':{...common,phase:'C1C36',commit:C1C36_ACCEPTED_COMMIT,status:'PASS',artifactCount:verifyHistoricalArtifacts('c1c36'),
      outcome:'C1C36-PROPHET-PRODUCTION-ACCEPTED',decision:'PROPHET_PRODUCTION_READY',automatedTests:{passed:2745,failed:0,pending:0,todo:0},
      browser:{levelI:'PASS',levelII:'PASS',levelIII:'PASS'},remoteReleaseGate:'36921892599',productionPrototypeReachability:0,
      freezeScope:'COMMITTED_C1C36_ARTIFACT_BYTES_AND_ANCESTRY',successorRuntimeHashFreeze:false,historicalBrowserReplayedOnEveryPush:false},
    'necromancer-successor-compatibility':{...common,status:'PASS',result:'NECROMANCER_SUCCESSOR_COMPATIBILITY',retainedSuite:compatibilityVersion,
      suiteWeakened:false,requiredCoverage:necromancer.requiredCoverage,levelCount:necromancer.levels.length,
      acceptedBehaviorDigest:createHash('sha256').update(JSON.stringify(necromancer)).digest('hex')},
    'production-capability-registry':registry,
    'production-isolation':isolation,
    ...survey,
    'successor-acceptance':{...common,outcome:'C1C37-SUCCESSOR-REBASELINE-ACCEPTED',c1c36Frozen:true,necromancerCompatibility:'PASS',prophetCompatibility:'PASS',
      auditArtifactRuntimeCoupling:0,builtBundleSmoke:'PASS',prototypeProductionReachability:0,nextFamilySelected:true,nextFamily:decision.selectedFamily,nextFamilyProductionReady:false,
      runtimeImplementationAuthorized:false,automatedTests:{passed:tests.numPassedTests,failed:0,pending:0,todo:0},
      remoteReleaseGate:{required:true,exactCommittedHeadRequired:true,actualRunReportedSeparately:true}},
  };
}
if(process.argv.includes('--prepare-browser'))writeFileSync('tmp-c1c37-prophet-prerequisite.json',JSON.stringify(prepareBrowserPrerequisite(),null,2)+'\n');
if(process.argv.includes('--verify-compatibility'))verifyBossSuccessorCompatibility();
if(process.argv.includes('--write')||process.argv.includes('--verify')){
  // Historical artifacts cannot be rewritten by successor generation.
  execFileSync('git',['diff','--exit-code',C1C36_ACCEPTED_COMMIT,'--','docs/data/complete-edition/c1c36-*','e2e/c1c36-*','scripts/audit/c1c36-*','src/audit/c1c36-*'],{stdio:'pipe'});
  const artifacts=buildSuccessorArtifacts();
  for(const [name,data] of Object.entries(artifacts)){
    const file=root+'c1c37-'+name+'.json',bytes=JSON.stringify(data,null,2)+'\n';
    if(process.argv.includes('--write'))writeFileSync(file,bytes);else if(name==='production-isolation'){
      // Bundle digests are per-build observations, not a permanent runtime hash
      // freeze. The fresh browser report above must match the actual current dist.
      const recorded=JSON.parse(readFileSync(file,'utf8'));
      for(const key of ['status','scanScope','debugHooks','prototypeProductionReachability','auditArtifactRuntimeCoupling','rawLocalRulebookRuntimeDependency'])
        assert(recorded[key]===data[key as keyof typeof data],'isolation boundary '+key);
    }else assert(readFileSync(file,'utf8')===bytes,'artifact drift '+name);
  }
  console.log('C1C37-SUCCESSOR-REBASELINE-ACCEPTED; next family source closure only: thing-from-the-stars. Exact-HEAD remote gate remains independent.');
}
if(process.argv.includes('--built-isolation'))console.log(JSON.stringify(auditBuiltProductionIsolation(),null,2));
