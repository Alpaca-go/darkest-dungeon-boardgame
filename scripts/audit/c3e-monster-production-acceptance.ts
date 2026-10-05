import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {sweepRealProductionBattle,verifyC3DArtifacts} from './c3d-monster-integration';
import {proveSaveReplay} from '../../src/audit/c3e-save-replay';
import {listProductionMonsterDefinitions} from '../../src/data/monsters/production-monster-definition-registry';
import {productionRuinsBindings} from '../../src/game-engine/monsters/production-encounter';
import {PRODUCTION_MONSTER_RUNTIME_VERSION} from '../../src/game-engine/monsters/production-runtime-types';
import {PRODUCTION_MONSTER_INTEGRATION_VERSION} from '../../src/game-engine/monsters/production-battle-types';
export const C3E_START='eef7fdcb4be3ca3b0bd104518f1fd35d2ca07eb7';
const root='docs/data/complete-edition/',phase='11A.6-C3E';
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const gitFiles=(ref:string,...paths:string[])=>execFileSync('git',['ls-tree','-r','--name-only',ref,...paths],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const allowlist:Record<string,string>={
 'src/game-engine/monsters/production-encounter.ts':'Real Hero attack acceptance exposed absent shared target Dodge binding; bind immutable printed Dodge at instantiation.',
 'src/game-engine/heroes/production-runtime.ts':'One source-profile Protection read for explicit non-Ruins targets; Hero action executor unchanged.',
 'src/game-engine/monsters/production-battle-types.ts':'Optional explicit C3E player route; historical saves remain opt-out.',
 'src/game-engine/monsters/production-battle-runtime.ts':'Reject orphaned/forged saved action cursors instead of silently discarding continuation.'
};
export function sourceFingerprint(infrastructureBaseline?:string){
 const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/);
 const paths=tracked.filter(p=>/^(src\/|scripts\/|e2e\/|\.github\/|package|playwright|vite|tsconfig)/.test(p)&&!p.endsWith('.tsbuildinfo')).sort();
 // Development/release verification may carry this infrastructure-only repair
 // without rewriting the accepted candidate's browser/regression receipts.
 // Every other source byte and the complete path set still participate.
 const infrastructure=['scripts/audit/historical-baseline.ts','scripts/audit/c3b-monster-definition-layer.ts',
   'scripts/audit/c3c-monster-runtime.ts','scripts/audit/c3e-monster-production-acceptance.ts'];
 return hash(paths.map(p=>p+':'+hash(infrastructureBaseline&&infrastructure.includes(p)
   ?execFileSync('git',['show',infrastructureBaseline+':'+p],{maxBuffer:32*1024*1024}):readFileSync(p))).join('\n'));
}
export function frozenReview(){
 const paths=[...gitFiles(C3E_START,'src/data/monsters','src/game-engine/monsters'),'src/game-engine/heroes/production-runtime.ts'];
 const review=[];
 for(const p of paths){const before=execFileSync('git',['show',C3E_START+':'+p],{maxBuffer:32*1024*1024}),after=readFileSync(p);if(!before.equals(after)){assert.ok(allowlist[p],'Frozen Monster input changed: '+p);review.push({path:p,reason:allowlist[p],baselineSha256:hash(before),successorSha256:hash(after)});}}
 for(const p of gitFiles(C3E_START,root).filter(p=>/\/c3[bcd]-/.test(p)))assert.ok(execFileSync('git',['show',C3E_START+':'+p],{maxBuffer:32*1024*1024}).equals(readFileSync(p)),'Frozen artifact changed '+p);
 return review;
}
function report(path:string){if(!existsSync(path))return null;return JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));}
export function buildAcceptance(){
 verifyC3DArtifacts();const review=frozenReview(),sweep=sweepRealProductionBattle(),definitions=listProductionMonsterDefinitions(),bindings=productionRuinsBindings(),pauses=proveSaveReplay();
 const actions=definitions.flatMap(d=>d.actions),identities=new Set(definitions.map(d=>d.identityId));
 const browser=report('pw-out/c3e-playwright-report.json'),targeted=report('pw-out/c3e-targeted-report.json'),full=report('pw-out/c3e-full-report.json'),gate=report('pw-out/c3e-production-gate.json'),receipt=report('pw-out/c3e-evidence-binding.json');
 const fingerprint=sourceFingerprint(),bound=receipt?.sourceFingerprint===fingerprint
   && receipt?.targetedReportSha256===hash(readFileSync('pw-out/c3e-targeted-report.json'))
   && receipt?.browserReportSha256===hash(readFileSync('pw-out/c3e-playwright-report.json'));
 const browserAccepted=bound&&browser?.stats?.expected===8&&browser.stats.unexpected===0&&browser.stats.skipped===0;
 const targetedAccepted=bound&&targeted?.success===true&&targeted.numFailedTests===0;
 const fullAccepted=bound&&full?.success===true&&full.numFailedTests===0&&full.numPassedTests>targeted?.numPassedTests;
 const gateAccepted=bound&&gate?.sourceFingerprint===fingerprint&&gate?.status==='PASS'&&gate.steps?.length>=10&&gate.steps.every((s:{exitCode:number})=>s.exitCode===0);
 const frozen=!!(browserAccepted&&targetedAccepted&&fullAccepted&&gateAccepted);
 const common={phase,startingHead:C3E_START,runtimeVersion:PRODUCTION_MONSTER_RUNTIME_VERSION,integrationVersion:PRODUCTION_MONSTER_INTEGRATION_VERSION,
  monsterIdentities:identities.size,monsterDefinitions:definitions.length,monsterActions:actions.length,runtimeReadyActions:sweep.ready,deferredSemanticActions:sweep.deferred,unknownActions:actions.length-sweep.ready-sweep.deferred,
  definitionsInstantiable:sweep.instantiable,autoEncounterDefinitions:bindings.length,explicitManifestDefinitions:definitions.length-bindings.length,ruinsPhysicalCopies:new Set(bindings.flatMap(b=>b.physicalCopyIds)).size};
 assert.deepEqual([common.monsterIdentities,common.monsterDefinitions,common.monsterActions,common.runtimeReadyActions,common.deferredSemanticActions,common.unknownActions,common.autoEncounterDefinitions,common.ruinsPhysicalCopies],[71,77,175,168,7,0,24,62]);
 return {
  [root+'c3e-monster-player-path-acceptance.json']:{...common,status:frozen?'ACCEPTED':'CANDIDATE',ruinsPlayerPathAccepted:!!browserAccepted,explicitManifestPathAccepted:!!browserAccepted,reactionWindowAccepted:!!browserAccepted,movementChoiceAccepted:!!browserAccepted,allHeroesAccepted:!!browserAccepted,timedProtectionAccepted:!!browserAccepted,deferredBlockerAccepted:!!browserAccepted,browserCasesPassed:browserAccepted?browser.stats.expected:0,targetedAccepted:!!targetedAccepted},
  [root+'c3e-monster-save-replay-acceptance.json']:{phase,startingHead:C3E_START,saveReplayAccepted:true,comparison:'stable gameplay state; wall-clock SaveFile metadata excluded',pausePoints:pauses},
  [root+'c3e-monster-production-freeze.json']:{...common,status:frozen?'FROZEN':'AWAITING_FINAL_ACCEPTANCE',playerPathAccepted:!!browserAccepted,saveReplayAccepted:true,browserAccepted:!!browserAccepted,fullRegressionAccepted:!!fullAccepted,productionReleaseGateAccepted:!!gateAccepted,monsterProductionFrozen:frozen,sourceFingerprint:fingerprint,frozenInputReview:review,evidence:frozen?{targetedPassed:targeted.numPassedTests,browserPassed:browser.stats.expected,fullPassed:full.numPassedTests,productionGateSteps:gate.steps.map((s:{name:string})=>s.name)}:null}
 };
}
if(process.argv.includes('--write')||process.argv.includes('--verify')){
 const artifacts=buildAcceptance();
 const freezePath=root+'c3e-monster-production-freeze.json',previous=report(freezePath),next=artifacts[freezePath] as {sourceFingerprint:string;monsterProductionFrozen:boolean};
 if(previous?.monsterProductionFrozen){
  if(process.argv.includes('--development')&&previous.sourceFingerprint!==next.sourceFingerprint){
   const candidate='88f29123eaea6b6ed316f90084c81919a82288ed';
   execFileSync('git',['merge-base','--is-ancestor',candidate,'HEAD']);
   for(const [path,expected] of Object.entries({
    'scripts/audit/historical-baseline.ts':'8fe6e8ee32db68b57ec1c316e0cabb1ec28072f7c827d6e279ec4fb7956f4bf3',
    'scripts/audit/c3b-monster-definition-layer.ts':'99b7920ca1aa3785f779d899e6fd81b408e2b543a65c096815665b05ecc60f89',
    'scripts/audit/c3c-monster-runtime.ts':'c9ccce698e89e1f8f67e0d692d9bf20f6ac2573ce72088b4c46d516e76ee4764',
   }))assert.equal(hash(readFileSync(path)),expected,'Unreviewed historical Git infrastructure repair: '+path);
   assert.equal(previous.sourceFingerprint,sourceFingerprint(candidate),'Frozen C3E non-infrastructure inputs changed');
  }else assert.equal(previous.sourceFingerprint,next.sourceFingerprint,'Frozen C3E inputs changed; use an explicit successor phase');
  if(process.argv.includes('--write'))assert.ok(next.monsterProductionFrozen,'Do not downgrade a frozen workstream when local evidence is absent');
 }
 for(const [path,value] of Object.entries(artifacts)){if(process.argv.includes('--write'))writeFileSync(path,JSON.stringify(value,null,2)+'\n');else if(process.argv.includes('--development')) {const stored=JSON.parse(readFileSync(path,'utf8'));assert.equal(stored.phase,value.phase);if('pausePoints' in value)assert.deepEqual(stored.pausePoints,value.pausePoints);if('monsterActions' in value)assert.equal(stored.monsterActions,value.monsterActions);if('frozenInputReview' in value)assert.deepEqual(stored.frozenInputReview,value.frozenInputReview);} else assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),value,'C3E artifact differs '+path);}
 const frozen=Object.values(artifacts).some(v=>'monsterProductionFrozen' in v&&v.monsterProductionFrozen);
 if(process.argv.includes('--require-freeze'))assert.ok(frozen,'Final C3E evidence missing or stale');
 console.log(frozen?'C3E_MONSTER_PRODUCTION_ACCEPTED_AND_FROZEN':'C3E candidate verified; final browser/regression/production evidence required');
}

if(process.argv.includes('--fingerprint'))console.log(sourceFingerprint());
