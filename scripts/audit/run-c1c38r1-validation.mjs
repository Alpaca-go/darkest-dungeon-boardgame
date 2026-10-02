import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const directory='docs/reports/complete-edition/c1c38r1-validation';
mkdirSync(directory,{recursive:true});
const commands=[
  'typecheck','historical-baseline-validation','verify:immutable-phase-baselines',
  'verify:necromancer-successor-compatibility','verify:prophet-successor-compatibility',
  'verify:boss-successor-compatibility','verify:complete-edition-c1c37',
  'verify:complete-edition-c1c38','audit:complete-edition-c1c38r1','verify:complete-edition-c1c38r1',
];
const results=[];
for(const command of commands){
  console.log('Running npm run '+command);
  const started=Date.now();
  // Command names are a fixed allowlist, never shell-interpolated source text.
  const result=spawnSync('npm',['run',command],{encoding:'utf8',shell:process.platform==='win32',maxBuffer:32*1024*1024});
  const logfile=command.replaceAll(':','-')+'.log';
  writeFileSync(directory+'/'+logfile,((result.stdout??'')+(result.stderr??'')).trimEnd()+'\n');
  results.push({command:'npm run '+command,exitCode:result.status,elapsedMs:Date.now()-started,log:logfile});
  writeFileSync(directory+'/validation-results.json',JSON.stringify({phase:'C1C38R1',results},null,2)+'\n');
  if(result.status!==0){console.error(result.stdout,result.stderr);process.exit(1);}
  console.log('PASS '+command);
}
