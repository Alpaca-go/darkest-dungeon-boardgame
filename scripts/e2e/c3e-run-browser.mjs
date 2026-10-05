import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
mkdirSync('pw-out',{recursive:true});writeFileSync('pw-out/c3e-browser-observations.jsonl','');
run(['node_modules/vite-node/vite-node.mjs','scripts/e2e/c3e-prepare-fixtures.ts']);
run(['node_modules/@playwright/test/cli.js','test','--config','playwright.c3e.config.ts','e2e/c3e-monster-production.spec.ts']);
