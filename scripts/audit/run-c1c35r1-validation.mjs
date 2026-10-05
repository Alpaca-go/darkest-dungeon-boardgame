import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const directory='docs/reports/complete-edition/c1c35r1-validation';
mkdirSync(directory,{recursive:true});
const names=['typecheck','test','build','historical-baseline-validation','verify:complete-edition-c1c33',
  'verify:complete-edition-c1c34','verify:complete-edition-c1c35','audit:complete-edition-c1c35r1','verify:complete-edition-c1c35r1'];
const results=[];
for(const name of names) {
  console.log('Starting npm '+(name==='test'?'test':'run '+name));
  const r=spawnSync(process.execPath,[process.env.npm_execpath,...(name==='test'?['test']:['run',name])],{encoding:'utf8',maxBuffer:32*1024*1024});
  const path=`${directory}/${name.replaceAll(':','-')}.log`;
  writeFileSync(path,`${r.stdout??''}${r.stderr??''}${r.error?String(r.error):''}`.trimEnd()+'\n');
  results.push({command:'npm '+(name==='test'?'test':'run '+name),exitCode:r.status,passed:r.status===0,logPath:path});
  console.log(`${name}: ${r.status===0?'PASS':'FAIL'}`);
  writeFileSync(`${directory}/results.json`,JSON.stringify({schemaVersion:1,results,remoteReleaseGate:'NOT_YET_VERIFIED'},null,2)+'\n');
}
process.exitCode=results.every(r=>r.passed)?0:1;
