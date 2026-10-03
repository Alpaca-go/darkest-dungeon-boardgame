// Images locate transport states only. They are never independent rules authority.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='docs/data/complete-edition/';
const inventory=JSON.parse(readFileSync(root+'complete-edition-raw-inventory.json'));
const objects=inventory.objects.filter(o=>o.isCard&&o.ttsPath.startsWith('/ObjectStates/49/ContainedObjects/'));
const urls=[...new Set(objects.flatMap(o=>[o.faceUrl,o.backUrl]).filter(Boolean))];
const folder=root+'source-assets/c2a/transport';mkdirSync(folder,{recursive:true});
const prior=existsSync(folder+'/manifest.json')?JSON.parse(readFileSync(folder+'/manifest.json')).records:[];
const records=[];
let next=0;
await Promise.all(Array.from({length:4},async()=>{
  while(next<urls.length){const url=urls[next++];const id=createHash('sha256').update(url).digest('hex');
    const old=prior.find(r=>r.url===url&&r.path&&existsSync(r.path));if(old){records.push(old);continue;}
    try{const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(String(response.status));
      const data=Buffer.from(await response.arrayBuffer());const path=folder+'/'+id+'.bin';writeFileSync(path,data);
      records.push({url,path,sha256:createHash('sha256').update(data).digest('hex'),authority:'DISCOVERY_TRANSPORT_ONLY'});
    }catch(error){records.push({url,path:null,sha256:null,authority:'DISCOVERY_TRANSPORT_ONLY',error:String(error)});}
    console.log(records.length+'/'+urls.length);
  }
}));
writeFileSync(folder+'/manifest.json',JSON.stringify({transportIsRulesAuthority:false,records:records.sort((a,b)=>a.url.localeCompare(b.url))},null,2)+'\n');
