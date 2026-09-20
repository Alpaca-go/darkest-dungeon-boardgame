import {generate} from './generate-complete-edition-c1a.mjs';
import {write} from '../assets/import-complete-edition-c1a.mjs';
export const questOutputs=['docs/data/complete-edition/quests/community-quest-normalized.json','src/data/community-reference/quests/data.json'];
export function generateRepair(){const output=generate();return Object.fromEntries(questOutputs.map(p=>[p,output[p]]));}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/generate-complete-edition-c1ar.mjs')){
 for(const [path,value] of Object.entries(generateRepair()))write(path,value);
 console.log('C1A-R: regenerated 76 Quest definitions and 75 registry entries; frozen artifacts not written.');
}
