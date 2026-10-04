import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const vite=resolve('node_modules/vite-node/vite-node.mjs');
const fingerprint=()=>{const r=spawnSync(process.execPath,[vite,'scripts/audit/c2e-player-path.ts','--fingerprint'],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim();};
mkdirSync('pw-out',{recursive:true});const before=fingerprint(),commands=[];
const names=['typecheck','test','build','verify:complete-edition-c2c','verify:complete-edition-c2d','historical-baseline-validation','verify:immutable-phase-baselines','verify:necromancer-successor-compatibility','verify:prophet-successor-compatibility','verify:boss-successor-compatibility','test:e2e:built-bundle-successor'];
let status='PASS';
for(const name of names){const args=name==='test'?['test','--','--maxWorkers=2','--minWorkers=2','--reporter=json','--outputFile=pw-out/c2e-vitest-full.json']:['run',name];console.log('C2E validation: '+name);const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{encoding:'utf8',shell:process.platform==='win32',maxBuffer:64*1024*1024});const log='pw-out/c2e-validation-'+name.replaceAll(':','-')+'.log';writeFileSync(log,(r.stdout??'')+(r.stderr??''));commands.push({command:'npm '+args.join(' '),exitCode:r.status,status:r.status===0?'PASS':'FAIL',log});if(r.status!==0){status='BLOCKED';console.error((r.stdout??'')+(r.stderr??''));break;}}
const after=fingerprint();if(after!==before)status='BLOCKED';writeFileSync('pw-out/c2e-validation.json',JSON.stringify({playerPathFingerprint:before,afterFingerprint:after,status,commands},null,2)+'\n');if(status!=='PASS')process.exitCode=1;
