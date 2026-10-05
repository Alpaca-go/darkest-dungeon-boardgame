import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const directory='docs/reports/complete-edition/c1c35r2-validation';
mkdirSync(directory,{recursive:true});
const commands=[['ci'],['run','typecheck'],['test'],['run','build'],['run','historical-baseline-validation'],
  ...['c1c33','c1c34','c1c35','c1c35r1'].map(p=>['run','verify:complete-edition-'+p]),
  ['run','audit:complete-edition-c1c35r2'],['run','verify:complete-edition-c1c35r2']];
const results=[];
for(const args of commands) {
  const name=args.at(-1); console.log('Starting npm '+args.join(' '));
  const r=spawnSync(process.execPath,[process.env.npm_execpath,...args],{encoding:'utf8',maxBuffer:32*1024*1024});
  const path=`${directory}/${name.replaceAll(':','-')}.log`;
  writeFileSync(path,`${r.stdout??''}${r.stderr??''}${r.error?String(r.error):''}`.trimEnd()+'\n');
  results.push({command:'npm '+args.join(' '),exitCode:r.status,passed:r.status===0,logPath:path});
  console.log(`${name}: ${r.status===0?'PASS':'FAIL'}`);
  writeFileSync(`${directory}/results.json`,JSON.stringify({schemaVersion:1,results,
    phaseOutcome:'PROPHET_PRODUCTION_FOUNDATION_BLOCKED',gateAPassed:true,
    productionFoundation:false,productionAccepted:false,remoteReleaseGate:'NOT_YET_VERIFIED'},null,2)+'\n');
}
process.exitCode=results.every(r=>r.passed)?0:1;
