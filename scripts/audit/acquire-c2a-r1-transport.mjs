// Exact predecessor URLs only; transport is never printed rules authority.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root='docs/data/complete-edition/';
const gaps=JSON.parse(readFileSync(root+'c2a-hero-source-gap-register.json')).gaps;
const targets=new Map();
for(const g of gaps) for(const t of g.transportRefs) for(const side of g.scope==='PROFILE_TRANSPORT_CORRELATION'?['frontImage','backImage']:['backImage']) {
  const url=t[side]; if(!targets.has(url)) targets.set(url,[]);
  targets.get(url).push({gapId:g.gapId,heroId:g.heroId,physicalId:g.physicalId,statePath:g.statePath??t.path,side});
}
const folder=root+'source-assets/c2a-r1'; mkdirSync(folder,{recursive:true});
const records=[]; let next=0; const urls=[...targets.keys()].sort();
await Promise.all(Array.from({length:4},async()=>{while(next<urls.length){
  const url=urls[next++]; const attempts=[]; let asset=null;
  for(let attempt=1;attempt<=2&&!asset;attempt++) {
    const retrievalDate=new Date().toISOString();
    try {const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
      if(!response.ok) throw new Error('HTTP '+response.status);
      const bytes=Buffer.from(await response.arrayBuffer()); const meta=await sharp(bytes).metadata();
      if(!meta.width||!meta.height) throw new Error('Missing image dimensions');
      const sha256=createHash('sha256').update(bytes).digest('hex');
      const path=folder+'/'+createHash('sha256').update(url).digest('hex')+'.bin'; writeFileSync(path,bytes);
      asset={path,sha256,byteSize:bytes.length,width:meta.width,height:meta.height,retrievalDate};
      attempts.push({attempt,retrievalDate,status:'RETRIEVED'});
    } catch(error) {attempts.push({attempt,retrievalDate,status:'FAILED',error:String(error),cause:String(error.cause??'')});}
  }
  records.push({url,authority:'DISCOVERY_TRANSPORT_ONLY',retrievalStatus:asset?'RETRIEVED':'INACCESSIBLE',sha256:null,byteSize:null,width:null,height:null,...asset,affected:targets.get(url),attempts});
  console.log(records.length+'/'+urls.length+' '+(asset?'RETRIEVED':'INACCESSIBLE'));
}}));
writeFileSync(folder+'/transport-manifest.json',JSON.stringify({phase:'11A.5-C2A-R1',transportIsRulesAuthority:false,records:records.sort((a,b)=>a.url.localeCompare(b.url))},null,2)+'\n');
