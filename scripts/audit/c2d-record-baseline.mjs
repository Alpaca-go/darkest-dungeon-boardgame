import { readdirSync,readFileSync,writeFileSync } from 'node:fs';
import { join,relative } from 'node:path';
import { createHash } from 'node:crypto';
const root=process.argv[2];if(!root)throw new Error('Accepted baseline dist directory required');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const chunks=walk(root).filter(p=>p.endsWith('.js')).sort().map(path=>({fileName:relative(root,path).replaceAll('\\','/'),bytes:readFileSync(path).length,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
if(!chunks.length)throw new Error('Baseline build missing');
writeFileSync('docs/data/complete-edition/c2d-runtime-bundle-baseline.json',JSON.stringify({phase:'11A.5-C2C',commit:'e1e9f27c882000bee59cec115ec0d1b3f7fcb5de',command:'npm run build',success:true,jsBytes:chunks.reduce((sum,c)=>sum+c.bytes,0),chunks},null,2)+'\n');
