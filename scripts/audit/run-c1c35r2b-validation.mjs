import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root='docs/reports/complete-edition/c1c35r2b-validation';
mkdirSync(root,{recursive:true});
const commands=[
  ['npm-ci',['ci']],['typecheck',['run','typecheck']],
  ['full-regression',['test','--','--maxWorkers=2','--minWorkers=2','--reporter=json',`--outputFile=${root}/tests.json`]],
  ['build',['run','build']],['historical-baseline-validation',['run','historical-baseline-validation']],
  ['immutable-phase-baselines',['run','verify:immutable-phase-baselines']],
  ['necromancer-successor-compatibility',['run','verify:necromancer-successor-compatibility']],
  ['prophet-gate-a',['run','verify:prophet-gate-a']],
  ['r2a-shared-dispatch',['run','verify:complete-edition-c1c35r2a']],
  ['r2b-artifact-audit',['run','audit:complete-edition-c1c35r2b']],
  ['r2b-foundation-acceptance',['run','verify:complete-edition-c1c35r2b']],
];
const results=[];
for(const [name,args] of commands) {
  console.log(`C1C35R2B validation: ${name}`);
  const run=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,
    {cwd:resolve('.'),encoding:'utf8',shell:process.platform==='win32',maxBuffer:64*1024*1024});
  const log=(run.stdout??'')+(run.stderr??'');writeFileSync(`${root}/${name}.log`,log.trimEnd()+'\n');
  results.push({name,exitCode:run.status,signal:run.signal,error:run.error?.message??null});
  writeFileSync(`${root}/commands.json`,JSON.stringify({phase:'C1C35R2B',productionFoundation:false,commands:results},null,2)+'\n');
  console.log(`${name}: exit ${run.status}`);
  if(run.status!==0) console.error(log.slice(-2500));
}
const tests=JSON.parse(readFileSync(`${root}/tests.json`,'utf8'));
const regression={passed:tests.numPassedTests,failed:tests.numFailedTests,pending:tests.numPendingTests,todo:tests.numTodoTests};
writeFileSync(`${root}/regression-summary.json`,JSON.stringify(regression,null,2)+'\n');
console.log(JSON.stringify(regression));
// Preserve every result, but never convert a blocked acceptance into a green release.
if(results.some(r=>r.exitCode!==0)||regression.failed||regression.pending||regression.todo) process.exitCode=1;
