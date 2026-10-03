import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync,copyFileSync} from 'node:fs';
const folder='docs/reports/complete-edition/c2c-validation';
mkdirSync(folder,{recursive:true});mkdirSync('tmp',{recursive:true});
const commands=[['ci'],['run','typecheck'],['test','--','--maxWorkers=4','--minWorkers=4','--reporter=json','--outputFile=tmp/c2c-final-tests.json'],['run','build'],['run','historical-baseline-validation'],['run','verify:immutable-phase-baselines'],['run','verify:necromancer-successor-compatibility'],['run','verify:prophet-successor-compatibility'],['run','verify:boss-successor-compatibility'],['run','verify:complete-edition-c1c38r1'],['run','verify:complete-edition-c2a'],['run','verify:complete-edition-c2a-r1'],['run','verify:complete-edition-c2b'],['run','audit:complete-edition-c2c'],['run','verify:complete-edition-c2c'],['run','test:e2e:built-bundle-successor']];
// Resume only the installation. Code verification always runs against the final sources.
const previous=process.argv.includes('--resume')&&existsSync(folder+'/validation-results.json')?JSON.parse(readFileSync(folder+'/validation-results.json','utf8')):{results:[],priorAttempts:[]};
const results=previous.results.filter(r=>r.command==='npm ci'&&r.exitCode===0);
const priorAttempts=[...(previous.priorAttempts??[]),...previous.results.filter(r=>r.exitCode!==0)];
for(const r of previous.results.filter(r=>r.exitCode!==0))if(existsSync(folder+'/'+r.log)){const old=r.log;r.log='prior-'+old;copyFileSync(folder+'/'+old,folder+'/'+r.log);}
for(const args of commands) {
  const command='npm '+args.join(' '),started=Date.now();console.log('Running '+command);
  if(command==='npm ci'&&results.some(r=>r.command===command&&r.exitCode===0)){console.log('PASS prior npm ci; dependencies unchanged');continue;}
  const r=spawnSync('npm',args,{encoding:'utf8',shell:process.platform==='win32',maxBuffer:64*1024*1024});
  const log=(args[0]==='run'?args[1]:args[0]).replaceAll(':','-')+'.log';
  writeFileSync(folder+'/'+log,((r.stdout??'')+(r.stderr??'')).replace(/\r\n/g,'\n').trimEnd()+'\n');
  const record={command,exitCode:r.status,elapsedMs:Date.now()-started,log};
  if(args[0]==='test'&&r.status===0) {
    const t=JSON.parse(readFileSync('tmp/c2c-final-tests.json','utf8'));
    record.tests={passed:t.numPassedTests,failed:t.numFailedTests,pending:t.numPendingTests,todo:t.numTodoTests,failedSuites:t.numFailedTestSuites};
    if(t.numFailedTests||t.numPendingTests||t.numTodoTests||t.numFailedTestSuites)record.exitCode=1;
  }
  results.push(record);writeFileSync(folder+'/validation-results.json',JSON.stringify({phase:'C2C',results,priorAttempts},null,2)+'\n');
  console.log((record.exitCode===0?'PASS ':'FAIL ')+command);
  if(record.exitCode!==0){console.error((r.stdout??'').slice(-3500),(r.stderr??'').slice(-3500));process.exit(1);}
}
