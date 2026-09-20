import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {json,sha,dataRoot} from '../assets/import-complete-edition-c1a.mjs';
import {generate,leafPaths} from './generate-complete-edition-c1a.mjs';
import {loadBundle,validateBundle,tamperTests} from './verify-complete-edition-c1a.mjs';
import {semanticCategories} from './c1ar-quest-classification.mjs';
import {questOutputs} from './generate-complete-edition-c1ar.mjs';

export const BASE='300c0a84ed1e5bd2025128fd4e35eeed0b600a06';
const evidencePath=`${dataRoot}/quests/community-quest-source-evidence.json`;
const normalizedPath=questOutputs[0];
const at=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o);
const cellOf=e=>`${e.deckId}-${e.cardIndex}`;
export function validateQuestSemantics(definitions,evidence){
 assert.equal(definitions.length,76);
 assert.equal(new Set(definitions.map(n=>n.id)).size,76);
 assert.equal(evidence.filter(e=>e.printedSpecialRules.length).length,66);
 const byCell=new Map();
 for(const n of definitions){
  const e=evidence.find(e=>e.definitionId===n.id);assert.ok(e);
  const cell=cellOf(e);byCell.set(cell,n);
  assert.ok(!('requiredConditions' in n.objective),'blanket requiredConditions forbidden');
  assert.ok(!('completionCondition' in n.objective),'XP counter is not quest completion');
  assert.deepEqual(n.objective.xpUnit.targetEntity,n.objective.targetEntity);
  assert.equal(n.objective.xpUnit.targetCount,n.objective.targetCount);
  assert.equal(n.objective.xpUnit.mandatoryQuestThreshold,false);
  assert.equal(n.objective.xpUnit.amount,n.rewards[0].amount);
  if(n.questType!=='boss')assert.deepEqual(n.rewards[0].per,{targetEntity:n.objective.targetEntity,count:n.objective.targetCount});
  for(const p of ['objective.objectiveType','objective.targetEntity','objective.targetCount'])assert.equal(n.leafProvenance[p].literalField,'printedReward');
  if(n.questType==='boss')assert.ok(n.leafProvenance['objective.targetEntity'].rulebook.includes('S4:p30'));
  assert.deepEqual([...new Set(n.specialRules.map(r=>r.sourceRuleIndex))].sort(),e.printedSpecialRules.map((_,i)=>i),'printed panel conservation');
  for(const [i,r] of n.specialRules.entries()){
   assert.ok(semanticCategories.includes(r.semanticCategory));
   assert.equal(typeof r.affectsObjectiveCompletion,'boolean');
   assert.ok(Number.isInteger(r.sourceRuleIndex));
   assert.equal(r.printedText,e.printedSpecialRules[r.sourceRuleIndex]);
   assert.equal(r.sourceReference.literalField,`printedSpecialRules.${r.sourceRuleIndex}`);
   assert.ok(r.scope&&Object.keys(r.parameters).length);
   assert.ok(r.trigger===null||typeof r.trigger==='string');
   if(r.affectsObjectiveCompletion){
    assert.ok(['qualification','completion','minimum-goal'].includes(r.objectiveBinding?.relation));
    assert.ok(['objective-qualification','objective-completion'].includes(r.semanticCategory));
   }else{assert.equal(r.objectiveBinding,null);assert.ok(!r.semanticCategory.startsWith('objective-'));}
   for(const p of leafPaths(r,`specialRules.${i}`)){
    const ref=n.leafProvenance[p];assert.ok(ref,`provenance ${n.id}:${p}`);
    assert.equal(ref.literalField,r.sourceReference.literalField);assert.equal(ref.sourceId,e.sourceId);
   }
  }
  for(const [relation,refs] of [['qualification',n.objective.qualificationRules],['completion',n.objective.completionRules],['minimum-goal',n.objective.minimumQuestGoal?.rules??[]]]){
   assert.ok(Array.isArray(refs));
   assert.deepEqual(refs,n.specialRules.flatMap((r,i)=>r.affectsObjectiveCompletion&&r.objectiveBinding.relation===relation?[{specialRule:i,relation}]:[]),'objective links must be explicitly authorized and exhaustive');
  }
  for(const root of ['objective.qualificationRules','objective.completionRules','objective.minimumQuestGoal.rules']){
   const refs=at(n,root)??[];
   refs.forEach((ref,i)=>{for(const p of leafPaths(ref,`${root}.${i}`))assert.equal(n.leafProvenance[p].literalField,n.specialRules[ref.specialRule].sourceReference.literalField);});
  }
  if(!['445-2','444-9'].includes(cell))assert.equal(n.objective.minimumQuestGoal,null,'no invented minimum');
  assert.equal(n.sourceStatus,cell==='444-14'?'source-blocked':'source-supported');
  assert.equal(n.runtimeSupport.productionIntegration,'not-integrated');
 }
 const get=cell=>{const n=byCell.get(cell);assert.ok(n);return n;};
 const nonObjective=(cell,category)=>{const n=get(cell);assert.ok(n.specialRules.some(r=>r.semanticCategory===category));assert.ok(n.specialRules.every(r=>!r.affectsObjectiveCompletion&&r.objectiveBinding===null));assert.deepEqual(n.objective.qualificationRules,[]);assert.deepEqual(n.objective.completionRules,[]);return n;};
 const bound=(cell,relation,key,value)=>{const n=get(cell);assert.ok(n.specialRules.some(r=>r.affectsObjectiveCompletion&&r.objectiveBinding.relation===relation&&r.parameters[key]===value),`${cell}:${key}`);};
 // QR-01..08: independent semantic counterexamples, not generated snapshots.
 const darkness=nonObjective('445-13','hero-stress');assert.equal(darkness.objective.targetEntity,'room');assert.equal(darkness.objective.targetCount,2);
 assert.deepEqual(nonObjective('445-14','monster-pool').specialRules[0].parameters.excludeMonsterLevels,[1]);
 const patrol=nonObjective('444-34','initiative');assert.equal(patrol.objective.targetCount,2);assert.equal(patrol.specialRules[0].trigger,'battle-start');
 bound('445-3','qualification','actionCost',2);bound('445-3','qualification','area','green');bound('445-3','completion','clearOnlyAfterCollection',true);
 bound('445-9','qualification','actionCost',2);bound('445-9','completion','clearOnlyAfterPurified',true);
 assert.ok(get('445-9').specialRules.some(r=>r.objectiveBinding?.relation==='qualification'&&r.parameters.provisionCost.potion===1));
 bound('444-40','qualification','burnsAt','end-of-next-round');bound('444-40','completion','clearIfBurnt','even-with-monsters-at-end-round-four');
 assert.ok(get('444-40').specialRules.some(r=>r.semanticCategory==='monster-spawn'&&r.objectiveBinding===null));
 assert.equal(get('445-2').objective.minimumQuestGoal.count,1);assert.equal(get('445-2').objective.minimumQuestGoal.roomType,'lair');
 assert.ok(get('445-2').specialRules.filter(r=>'exchange' in r.parameters||'goldPerLair' in r.parameters).every(r=>r.objectiveBinding===null));
 const boss=nonObjective('445-18','campaign-rule');assert.equal(boss.objective.objectiveType,'defeat-boss');assert.equal(boss.objective.targetEntity,'current-imminent-threat-boss');assert.ok(boss.specialRules.some(r=>r.semanticCategory==='quest-setup'));
 // The second explicit minimum restricts exchange eligibility, not general quest success.
 assert.equal(get('444-9').objective.minimumQuestGoal.scope,'trinket-return-xp-eligibility');
 const blocked=get('444-14');assert.equal(blocked.unresolvedFields.length,1);
 const onClear=blocked.specialRules.find(r=>'onClear' in r.parameters);assert.ok(onClear);assert.equal(onClear.parameters.onClear,null);
 assert.equal(onClear.runtimeSupport,'SOURCE_UNRESOLVED');assert.ok(blocked.unresolvedFields.includes(`specialRules.${blocked.specialRules.indexOf(onClear)}.parameters.onClear`));
 assert.equal(blocked.leafProvenance[blocked.unresolvedFields[0]].sourceStatus,'source-blocked');
 return byCell;
}

export function semanticTamperTests(definitions,evidence){
 const cell=(list,id)=>list.find(n=>n.id===evidence.find(e=>cellOf(e)===id).definitionId);
 const cases=[
  ['non-objective-rule-in-objective',ns=>cell(ns,'445-13').objective.qualificationRules.push({specialRule:0,relation:'qualification'})],
  ['blanket-requiredConditions',ns=>cell(ns,'445-13').objective.requiredConditions=[{specialRule:0}]],
  ['objective-rule-unbound',ns=>cell(ns,'445-3').specialRules.find(r=>r.affectsObjectiveCompletion).objectiveBinding=null],
  ['missing-category',ns=>cell(ns,'444-34').specialRules[0].semanticCategory=null],
  ['missing-boolean',ns=>delete cell(ns,'444-34').specialRules[0].affectsObjectiveCompletion],
  ['lost-printed-rule',ns=>cell(ns,'445-14').specialRules=[]],
  ['bad-source-index',ns=>cell(ns,'445-14').specialRules[0].sourceRuleIndex=1],
  ['invented-xp-minimum',ns=>cell(ns,'445-13').objective.minimumQuestGoal={roomType:'room',count:2,rules:[]}],
  ['rest-in-rubble-iii-invented-verb',ns=>cell(ns,'444-14').specialRules.find(r=>'onClear' in r.parameters).parameters.onClear='desecrate-tomb'],
  ['lost-provenance',ns=>delete cell(ns,'445-13').leafProvenance['specialRules.0.semanticCategory']],
  ['boss-no-retreat-as-objective',ns=>{const n=cell(ns,'445-18'),r=n.specialRules[1];r.affectsObjectiveCompletion=true;r.objectiveBinding={relation:'qualification'};r.semanticCategory='objective-qualification';n.objective.qualificationRules=[{specialRule:1,relation:'qualification'}];}],
  ['drop-bone-qualification',ns=>{const n=cell(ns,'445-3'),r=n.specialRules.find(r=>r.semanticCategory==='objective-qualification');r.semanticCategory='room-setup';r.affectsObjectiveCompletion=false;r.objectiveBinding=null;n.objective.qualificationRules=[];}]
 ];
 return cases.map(([name,mutate])=>{const ns=structuredClone(definitions);mutate(ns);assert.throws(()=>validateQuestSemantics(ns,evidence),undefined,name);return {name,result:'PASS: rejected'};});
}

function baselineFreeze(){
 const allowed=new Set([...questOutputs,'package.json','scripts/audit/c1a-quest-semantics.mjs','scripts/audit/generate-complete-edition-c1a.mjs','scripts/audit/c1ar-quest-classification.mjs','scripts/audit/generate-complete-edition-c1ar.mjs','scripts/audit/verify-complete-edition-c1ar.mjs','scripts/audit/c1ar-report.mjs',`${dataRoot}/c1ar-semantic-review-lock.json`,'docs/reports/complete-edition/c1ar-quest-semantic-classification-repair-report.md','docs/reports/complete-edition/c1ar-verification.log']);
 const changed=execFileSync('git',['diff','--name-only',BASE],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
 for(const path of changed)assert.ok(allowed.has(path),`frozen baseline changed: ${path}`);
 const oldLock=json(`${dataRoot}/c1a-source-review-lock.json`);
 for(const [path,hash] of Object.entries(oldLock.files))assert.equal(sha(path==='scripts/audit/c1a-quest-semantics.mjs'?execFileSync('git',['show',`${BASE}:${path}`]):readFileSync(path)),hash,`C1A review lock ${path}`);
 const lock=json(`${dataRoot}/c1ar-semantic-review-lock.json`);assert.equal(lock.base,BASE);
 for(const [path,hash] of Object.entries(lock.files))assert.equal(sha(readFileSync(path)),hash,`C1A-R semantic lock ${path}`);
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]);
 for(const path of walk('src').filter(p=>!p.startsWith('src/data/community-reference/')&&/\.(ts|tsx)$/.test(p)))assert.ok(!/community-reference\/(quests|trinkets)(?:\/|['"])/.test(readFileSync(path,'utf8')),`production consumer: ${path}`);
 return changed;
}
async function main(){
 baselineFreeze();
 const bundle=loadBundle(),expected=generate();validateBundle(bundle,expected);
 for(const [path,value] of Object.entries(expected))assert.equal(readFileSync(path,'utf8'),JSON.stringify(value,null,2)+'\n',`deterministic output ${path}`);
 const definitions=bundle.files[normalizedPath].definitions,evidence=bundle.files[evidencePath].records;
 validateQuestSemantics(definitions,evidence);
 const registry=bundle.files[questOutputs[1]];assert.equal(registry.filter(n=>n.questType==='standard').length,74);assert.equal(registry.filter(n=>n.questType==='boss').length,1);
 const tests=[...semanticTamperTests(definitions,evidence),...tamperTests(bundle,expected)];
 execFileSync(process.execPath,['node_modules/vite-node/vite-node.mjs','scripts/audit/test-complete-edition-c1a-registry.ts'],{stdio:'pipe'});
 const {buildRepairReport}=await import('./c1ar-report.mjs');
 assert.equal(readFileSync('docs/reports/complete-edition/c1ar-quest-semantic-classification-repair-report.md','utf8'),buildRepairReport(definitions,evidence),'deterministic repair report');
 console.log(JSON.stringify({result:'PASS',questDefinitions:76,withSpecialRules:66,withoutSpecialRules:10,sourceSupported:75,sourceBlocked:1,registry:{standard:74,boss:1},baseline:'C0, literal evidence, assets, all Trinkets and Production unchanged',qrFixtures:'QR-01 through QR-08 PASS',semanticTamperTests:tests,stopGate:'C1A-R only; independent audit pending; C1B forbidden'},null,2));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/verify-complete-edition-c1ar.mjs'))main().catch(e=>{console.error(e.stack);process.exitCode=1;});
