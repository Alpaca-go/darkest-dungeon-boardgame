import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {verifyHistoricalBaseline} from './historical-baseline';

/** Execute the unchanged C1C31 generator twice in its accepted C2C checkout. */
export function generateHistoricalC1C31Artifacts():Record<string,unknown> {
 let result:Record<string,unknown>|null=null;
 verifyHistoricalBaseline('c2c',[],checkout=>{
  const dump=join(dirname(checkout),'c1c31-generated-dump.ts');
  const contract=join(checkout,'scripts/audit/c1c31-contract.ts').replace(/\\/g,'/');
  writeFileSync(dump,`import {buildArtifacts} from ${JSON.stringify(contract)};\nconsole.log(JSON.stringify([buildArtifacts(),buildArtifacts()]));\n`);
  const output=execFileSync(process.execPath,[resolve('node_modules/vite-node/vite-node.mjs'),dump],
   {cwd:checkout,encoding:'utf8',maxBuffer:32*1024*1024});
  const [first,second]=JSON.parse(output);assert.deepEqual(first,second,'Original C1C31 generator determinism');result=first;
 });
 assert.ok(result);return result;
}
