import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const run=(file,args,log)=>{const result=spawnSync(process.execPath,[file,...args],{encoding:'utf8',maxBuffer:64*1024*1024});if(log)writeFileSync(log,(result.stdout??'')+(result.stderr??''));if(result.status!==0)throw new Error(`${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);return result.stdout.trim();};
const vite=resolve('node_modules/vite-node/vite-node.mjs');
mkdirSync('pw-out',{recursive:true});
writeFileSync('pw-out/c2e-browser-checkpoints.jsonl','');writeFileSync('pw-out/c2e-browser-network.jsonl','');
run(vite,['scripts/e2e/prepare-c2e-browser.ts'],'pw-out/c2e-browser-prepare.log');
const before=run(vite,['scripts/audit/c2e-player-path.ts','--fingerprint']);
let status='BLOCKED';
try {run(resolve('node_modules/playwright/cli.js'),['test','e2e/c2e-hero-player-path.spec.ts','--config=playwright.c2e.config.ts'],'pw-out/c2e-browser.log');status='PASS';}
finally {const after=run(vite,['scripts/audit/c2e-player-path.ts','--fingerprint']);if(before!==after)status='BLOCKED';writeFileSync('pw-out/c2e-browser-run-binding.json',JSON.stringify({playerPathFingerprint:before,afterFingerprint:after,status,server:'vite preview',e2eControls:false,report:'pw-out/c2e-playwright-report.json'},null,2)+'\n');}
console.log('C2E production browser: '+status);
if(status!=='PASS')process.exitCode=1;
