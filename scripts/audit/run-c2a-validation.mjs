import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
const folder='docs/reports/complete-edition/c2a-validation';mkdirSync(folder,{recursive:true});mkdirSync('tmp',{recursive:true});
const commands=[
  ['ci'],['run','typecheck'],['test','--','--maxWorkers=2','--minWorkers=2','--reporter=json','--outputFile=tmp/c2a-final-tests.json'],
  ['run','build'],['run','historical-baseline-validation'],['run','verify:immutable-phase-baselines'],
  ['run','verify:necromancer-successor-compatibility'],['run','verify:prophet-successor-compatibility'],
  ['run','verify:boss-successor-compatibility'],['run','verify:complete-edition-c1c38r1'],
  ['run','audit:complete-edition-c2a'],['run','verify:complete-edition-c2a'],['run','test:e2e:built-bundle-successor'],
];
const results=process.argv.includes('--resume')&&existsSync(folder+'/validation-results.json')?JSON.parse(readFileSync(folder+'/validation-results.json','utf8')).results:[];
for(const args of commands){
  const command='npm '+args.join(' ');if(results.some(r=>r.command===command&&r.exitCode===0))continue;
  console.log('Running '+command);const started=Date.now();
  const r=spawnSync('npm',args,{encoding:'utf8',shell:process.platform==='win32',maxBuffer:64*1024*1024});
  const logfile=(args[0]==='run'?args[1]:args[0]).replaceAll(':','-')+'.log';
  writeFileSync(folder+'/'+logfile,((r.stdout??'')+(r.stderr??'')).trimEnd()+'\n');
  const record={command,exitCode:r.status,elapsedMs:Date.now()-started,log:logfile};
  if(args[0]==='test'&&r.status===0){const t=JSON.parse(readFileSync('tmp/c2a-final-tests.json','utf8'));
    record.tests={passed:t.numPassedTests,failed:t.numFailedTests,pending:t.numPendingTests,todo:t.numTodoTests,failedSuites:t.numFailedTestSuites};
    if(t.numFailedTests||t.numFailedTestSuites||t.numPendingTests||t.numTodoTests)record.exitCode=1;
  }
  results.push(record);writeFileSync(folder+'/validation-results.json',JSON.stringify({phase:'C2A',results},null,2)+'\n');
  if(record.exitCode!==0){console.error(r.stdout,r.stderr);process.exit(1);}console.log('PASS '+command);
}
