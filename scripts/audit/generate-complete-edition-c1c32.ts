import { writeFileSync } from 'node:fs';
import { buildArtifacts,root } from './c1c32-contract';
for(const [name,value] of Object.entries(buildArtifacts()))writeFileSync(root+name,JSON.stringify(value,null,2)+'\n');
console.log('C1C32: generated 9 engineering artifacts; foundation NOT_FINALIZED.');
