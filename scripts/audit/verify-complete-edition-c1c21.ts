import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { artifacts, report, baselineHead, baselineTree } from './c1c21-contract';
import { git, sha, buildArtifacts as build20, historicalFreeze, historyHash } from './c1c20-contract';
import { priorContractGates } from './c1c20-contract-gate';
import { C1C17_VERIFICATION_COMMANDS } from './c1c17-implementation-gate';
const assert = (ok: unknown, msg: string) => { if (!ok) throw new Error('C1C21: ' + msg); };
const equal = (a: unknown,b: unknown,msg: string) => assert(JSON.stringify(a) === JSON.stringify(b),msg);
function contract() {
  assert(git('rev-parse', `${baselineHead}^{tree}`) === baselineTree, 'exact C1C20 tree');
  git('merge-base','--is-ancestor',baselineHead,'HEAD');
  const allowed = (p: string) => p === 'package.json' || /^src\/audit\/(standard-quest-live-rebaseline|c1c21-standard-quest-live-rebaseline\.test)\.ts$/.test(p) || /^scripts\/audit\/(c1c21-contract|(?:generate|verify)-complete-edition-c1c21)\.ts$/.test(p) || /^docs\/(data|reports)\/complete-edition\/c1c21-/.test(p);
  assert(git('diff','--name-only',baselineHead).split(/\r?\n/).filter(Boolean).every(allowed),'no gameplay/history diff');
  const pkg = JSON.parse(git('show',`${baselineHead}:package.json`));
  pkg.scripts['audit:complete-edition-c1c21'] = 'vite-node scripts/audit/generate-complete-edition-c1c21.ts';
  pkg.scripts['verify:complete-edition-c1c21'] = 'vite-node scripts/audit/verify-complete-edition-c1c21.ts';
  equal(JSON.parse(readFileSync('package.json','utf8')),pkg,'only C1C21 package scripts');
  for (const [p,hash] of Object.entries(historicalFreeze())) assert(historyHash(p,readFileSync(p)) === hash,'C1C18/19 historical freeze '+p);
  for (const [name,value] of Object.entries(build20())) equal(JSON.parse(readFileSync('docs/data/complete-edition/'+name,'utf8')),value,'C1C20 terminal gate '+name);
  priorContractGates();
  const expected = artifacts();
  for (const [name,value] of Object.entries(expected)) equal(JSON.parse(readFileSync('docs/data/complete-edition/'+name,'utf8')),value,'live artifact '+name);
  equal(readFileSync('docs/reports/complete-edition/c1c21-standard-quest-live-rebaseline-report.md','utf8').replace(/\r\n/g,'\n'),report(),'report binding');
  const matrix = expected['c1c21-standard-quest-live-capability-matrix.json'];
  assert(matrix.expectedReadyInvariant.matches,'live Ready differs from expected IDs; explicit investigation required');
  for (const [p,hash] of Object.entries(matrix.coreTrinketFreeze)) assert(sha(readFileSync(p,'utf8').replace(/\r\n/g,'\n').trimEnd()) === hash,'C1C20 freeze '+p);
}
mkdirSync('tmp/c1c21-verification',{recursive:true});
const retries: unknown[] = [];
function run(command: string, retry = false): string {
  console.log('Running '+command);
  const r = spawnSync(process.env.ComSpec ?? 'cmd.exe',['/d','/s','/c',command],{encoding:'utf8',maxBuffer:100*1024*1024,timeout:900000,env:{...process.env,FORCE_COLOR:'0',NO_COLOR:'1'}});
  const output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const path = `tmp/c1c21-verification/${command.replace(/[^a-z0-9-]/gi,'-')}${retry ? '-retry' : ''}.log`;
  writeFileSync(path,output);
  if (r.status !== 0) {
    if (!retry && command.startsWith('npm run test:e2e:') && (output.match(/Error: page\.reload: Test timeout of 60000ms exceeded\./g) ?? []).length === 1 && /(?:^|\n)\s*1 failed\s*(?:\r?\n|$)/.test(output) && !/Error: expect\(/.test(output)) {
      retries.push({command,reason:'Exactly one page.reload 60s infrastructure timeout; no expect failure',failedLog:path,failedOutputSha256:sha(output)});
      writeFileSync('tmp/c1c21-verification/reload-retries.json',JSON.stringify(retries,null,2)+'\n');
      return run(command,true);
    }
    writeFileSync('tmp/c1c21-verification/failure.json',JSON.stringify({command,log:path,outputSha256:sha(output),retryExhausted:retry,retries},null,2)+'\n');
    throw new Error(command+' failed '+(r.error ?? '')+'\n'+output.slice(-16000));
  }
  console.log('Passed '+command); return sha(output);
}
contract();
run('npx vitest run src/audit/c1c21-standard-quest-live-rebaseline.test.ts');
if (!process.argv.includes('--contract-only')) {
  const commands = [...C1C17_VERIFICATION_COMMANDS.filter(c => !['test','typecheck','build'].includes(c)), 'test:e2e:community-content-c1c3','test:e2e:community-content-c1c2','test:e2e:community-content-c1c1r','test','typecheck','build'];
  const volatile = ['docs/data/core-campaign/official-source-manifest.json','docs/data/core-campaign/source-readiness.json'].map(p => [p,readFileSync(p)] as const);
  const outputHashes: Record<string,string> = {};
  try { for (const command of commands) outputHashes[command] = run(command === 'test' ? 'npm test' : 'npm run '+command); }
  finally { for (const [p,bytes] of volatile) writeFileSync(p,bytes); }
  contract();
  writeFileSync('tmp/c1c21-verification/receipt.json',JSON.stringify({status:'CONTRACT_AND_REGRESSIONS_VERIFIED',head:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),commands,outputHashes,retries},null,2)+'\n');
}
console.log('C1C21 contract accepted');
