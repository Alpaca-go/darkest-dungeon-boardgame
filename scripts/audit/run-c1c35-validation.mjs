import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const directory='docs/reports/complete-edition/c1c35-validation';
mkdirSync(directory,{recursive:true});
const commands=[['typecheck'],['test'],['build'],['historical-baseline-validation'],
  ['verify:complete-edition-c1c33'],['verify:complete-edition-c1c34'],['audit:complete-edition-c1c35'],['verify:complete-edition-c1c35']];
const results=[];
for(const [name] of commands) {
  console.log(`Starting npm ${name==='test'?'test':'run '+name}`);
  const r=spawnSync(process.execPath,[process.env.npm_execpath,...(name==='test'?['test']:['run',name])],{encoding:'utf8',maxBuffer:32*1024*1024});
  const log=`${r.stdout??''}${r.stderr??''}${r.error?String(r.error):''}`;
  const path=`${directory}/${name.replaceAll(':','-')}.log`;
  writeFileSync(path,log.trimEnd()+'\n');
  results.push({command:`npm ${name==='test'?'test':'run '+name}`,exitCode:r.status,passed:r.status===0,logPath:path});
  console.log(`${name}: ${r.status===0?'PASS':'FAIL'} (exit ${r.status})`);
  writeFileSync(`${directory}/results.json`,JSON.stringify({schemaVersion:1,results,remoteReleaseGate:'NOT_YET_VERIFIED'},null,2)+'\n');
}
process.exitCode=results.every(r=>r.passed)?0:1;
