import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,copyFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const vite=resolve('node_modules/vite-node/vite-node.mjs');
const invoke=(args)=>spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:96*1024*1024});
const fingerprint=(script)=>{const r=invoke([vite,script,'--fingerprint']);if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim();};
const source=fingerprint('scripts/audit/c3e-monster-production-acceptance.ts');
const full=JSON.parse(readFileSync('pw-out/c3e-full-report.json','utf8'));
if(!full.success||full.numFailedTests!==0)throw new Error('Full regression must pass before final production gate');
const browser=JSON.parse(readFileSync('pw-out/c3e-playwright-report.json','utf8'));
if(browser.stats.expected!==8||browser.stats.unexpected!==0||browser.stats.skipped!==0)throw new Error('Focused Monster browser matrix must pass');
const binding=JSON.parse(readFileSync('pw-out/c3e-evidence-binding.json','utf8'));
if(binding.sourceFingerprint!==source)throw new Error('Final evidence source changed');
mkdirSync('pw-out',{recursive:true});copyFileSync('pw-out/c3e-full-report.json','pw-out/c2e-vitest-full.json');
const steps=[];
function run(name,args){console.log('C3E Production Release Gate: '+name);const r=invoke(args),log='pw-out/c3e-gate-'+name.replaceAll(':','-')+'.log';writeFileSync(log,(r.stdout??'')+(r.stderr??''));steps.push({name,exitCode:r.status,log});if(r.status!==0){console.error(r.stdout,r.stderr);writeFileSync('pw-out/c3e-production-gate.json',JSON.stringify({sourceFingerprint:source,status:'FAIL',steps},null,2));process.exit(r.status??1);}return r;}
const npm=(name)=>run(name,[resolve('node_modules/vite-node/vite-node.mjs'),'scripts/audit/c3e-npm-gate.ts',name]);
for(const name of ['verify:complete-edition-c1c38','verify:complete-edition-c1c38r1','verify:complete-edition-c2a','verify:complete-edition-c2a-r1','verify:complete-edition-c2b'])npm(name);
// Existing C2E release validation, reusing the one final full suite instead of running it twice.
const c2eBefore=fingerprint('scripts/audit/c2e-player-path.ts'),commands=[];
const checks=['typecheck','test','build','verify:complete-edition-c2c','verify:complete-edition-c2d','historical-baseline-validation','verify:immutable-phase-baselines','verify:necromancer-successor-compatibility','verify:prophet-successor-compatibility','verify:boss-successor-compatibility','test:e2e:built-bundle-successor'];
for(const name of checks){
 if(name==='test'){commands.push({command:'npm test -- --maxWorkers=2 --minWorkers=2 --reporter=json --outputFile=pw-out/c3e-full-report.json',exitCode:0,status:'PASS',log:'pw-out/c3e-full-report.json',reusedOneFinalFullRegression:true});continue;}
 const r=npm(name);commands.push({command:'npm run '+name,exitCode:r.status,status:'PASS',log:steps[steps.length-1].log});
}
const c2eAfter=fingerprint('scripts/audit/c2e-player-path.ts');if(c2eBefore!==c2eAfter)throw new Error('C2E fingerprint changed during gate');
writeFileSync('pw-out/c2e-validation.json',JSON.stringify({playerPathFingerprint:c2eBefore,afterFingerprint:c2eAfter,status:'PASS',commands},null,2)+'\n');
run('verify-c2a-test-report',[resolve('scripts/audit/verify-c2a-test-report.mjs'),'pw-out/c2e-vitest-full.json']);
for(const name of ['test:e2e:hero-production-player-path','audit:complete-edition-c2e','verify:complete-edition-c2e','verify:prophet-gate-a','verify:complete-edition-c1c35r2a','verify:complete-edition-c1c35r2b','verify:complete-edition-c1c36','verify:complete-edition-c1c37'])npm(name);
if(source!==fingerprint('scripts/audit/c3e-monster-production-acceptance.ts'))throw new Error('C3E source changed during production gate');
writeFileSync('pw-out/c3e-production-gate.json',JSON.stringify({sourceFingerprint:source,status:'PASS',steps,fullRegressionReused:true},null,2)+'\n');
console.log('C3E Production Release Gate PASS');
