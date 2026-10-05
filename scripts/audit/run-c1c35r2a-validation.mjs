import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root='docs/reports/complete-edition/c1c35r2a-validation';
mkdirSync(root,{recursive:true});
const npm=process.platform==='win32'?'npm.cmd':'npm';
const commands=[
  ['npm-ci',['ci']],['typecheck',['run','typecheck']],
  ['full-regression',['test','--','--maxWorkers=2','--minWorkers=2','--reporter=json',`--outputFile=${root}/tests.json`]],
  ['build',['run','build']],['immutable-historical-checkpoints',['run','verify:immutable-phase-baselines']],
  ['necromancer-successor-compatibility',['run','verify:necromancer-successor-compatibility']],
  ['prophet-gate-a',['run','verify:prophet-gate-a']],['shared-dispatch',['run','verify:complete-edition-c1c35r2a']],
];
const results=[];
for(const [name,args] of commands) {
  console.log(`C1C35R2A release gate: ${name}`);
  const run=spawnSync(npm,args,{cwd:resolve('.'),encoding:'utf8',shell:process.platform==='win32',maxBuffer:64*1024*1024});
  const log=(run.stdout??'')+(run.stderr??'');writeFileSync(`${root}/${name}.log`,log);
  results.push({name,exitCode:run.status,signal:run.signal,error:run.error?.message??null});
  writeFileSync(`${root}/commands.json`,JSON.stringify({phase:'C1C35R2A',commands:results},null,2)+'\n');
  if(run.status!==0) {
    console.error(log.slice(-8000));
    console.error(`Release gate failed: ${name}. Historical artifacts were not regenerated.`);
    process.exit(1);
  }
}
const tests=JSON.parse(readFileSync(`${root}/tests.json`,'utf8'));
if(tests.numFailedTests || tests.numFailedTestSuites || tests.numPendingTests || tests.numTodoTests)throw new Error('Regression requires zero failed/pending/todo');
console.log('C1C35R2A successor release gate PASS');
