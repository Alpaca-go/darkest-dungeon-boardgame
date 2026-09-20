import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';

export const sha = b => createHash('sha256').update(b).digest('hex');
export const c0Path = 'docs/data/complete-edition/complete-edition-raw-inventory.json';
export const dataRoot = 'docs/data/complete-edition';
export const expectedSource = 'd2fe21a6aa294f80fb47e56677c3a74090c3dc131361d798dfde709f6a3a64a2';
export const json = p => JSON.parse(readFileSync(p, 'utf8'));
export const write = (p, v) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); };
export const rows = () => json(c0Path).objects.filter(r => r.isCard && ['Trinkets', 'Standard Quests', 'Boss Quests'].includes(r.runtimeCategory)).sort((a,b) => a.deckId-b.deckId || a.cardIndex-b.cardIndex || a.ttsPath.localeCompare(b.ttsPath, 'en'));
export function scope(r) {
  const contentSet = ({'Shared table':'core','Darkest Dungeon':'core','The Color of Madness':'color-of-madness','The Crimson Court':'crimson-court','The Warrens':'warrens','The Cove':'cove','The Weald':'weald'})[r.sourceCategory];
  if (!contentSet) throw Error(`Unknown source root ${r.sourceCategory}`);
  const level = Number(r.containerHierarchy.map(c => c.nickname).join(' > ').match(/lvl\s*(\d)/i)?.[1]) || null;
  const kind = r.runtimeCategory === 'Trinkets' ? 'trinkets' : 'quests';
  const region = kind === 'trinkets' ? null : r.runtimeCategory === 'Boss Quests' ? 'boss' : contentSet === 'core' ? 'ruins' : contentSet;
  return {contentSet, region, level, kind};
}

const arg = n => process.argv[process.argv.indexOf(n)+1];
if (process.argv[1]?.replaceAll('\\','/').endsWith('/import-complete-edition-c1a.mjs')) {
  const ttsPath = process.argv.includes('--tts') ? arg('--tts') : process.env.COMPLETE_EDITION_TTS;
  if (!ttsPath || sha(readFileSync(ttsPath)) !== expectedSource) throw Error('Supply the C0 TTS using --tts or COMPLETE_EDITION_TTS');
  const tts = json(ttsPath);
  const manifestFile=`${dataRoot}/c1a-asset-manifest.json`;
  const previous=existsSync(manifestFile)?json(manifestFile):null;
  const atlasLocks=new Map((previous?.records??[]).flatMap(r=>Object.values(r.assets)).filter(a=>a.sourceAtlasSha256).map(a=>[a.sourceAtlasUrl,a.sourceAtlasSha256]));
  const records = [];
  const unavailable = new Map();
  for (const r of rows()) {
    const o = r.ttsPath.split('/').filter(Boolean).reduce((v,k)=>v[k],tts);
    if (o.GUID !== r.sourceObjectGuid || o.CardID !== r.cardId) throw Error(`C0 mismatch ${r.ttsPath}`);
    const s = scope(r), assets = {};
    for (const side of ['front','back']) {
      const url = side === 'front' ? r.faceUrl : r.backUrl;
      const cache = `.artifacts/c1a/atlases/${sha(url)}.bin`;
      const imageDir = process.argv.includes('--tts-images') ? arg('--tts-images') : null;
      const local = imageDir ? `${imageDir}/${url.replace(/[^a-zA-Z0-9]/g,'')}.png` : null;
      if (!existsSync(cache) && local && existsSync(local)) {
        mkdirSync(dirname(cache),{recursive:true}); writeFileSync(cache,readFileSync(local));
      }
      if (!existsSync(cache)) {
        if (!unavailable.has(url)) {
          try {
            const downloaded = execFileSync('curl.exe',['--fail','--silent','--show-error','--retry','2','--max-time','180',url],{maxBuffer:100*1024*1024});
            await sharp(downloaded).metadata();
            mkdirSync(dirname(cache),{recursive:true}); writeFileSync(cache,downloaded);
          } catch { unavailable.set(url,'Source atlas unavailable: HTTP/network failure; no exact-URL TTS cached image supplied.'); }
        }
        if (unavailable.has(url)) { assets[side] = {assetPath:null,assetSha256:null,sourceAtlasUrl:url,cardIndex:r.cardIndex,status:'source-blocked',blocker:unavailable.get(url)}; continue; }
      }
      const bytes = readFileSync(cache), meta = await sharp(bytes).metadata();
      if(atlasLocks.has(url)&&atlasLocks.get(url)!==sha(bytes))throw Error(`Atlas bytes differ from the frozen intake: ${url}`);
      const index = side === 'back' && !r.uniqueBack ? 0 : r.cardIndex;
      const nw = side === 'back' && !r.uniqueBack ? 1 : r.numWidth;
      const nh = side === 'back' && !r.uniqueBack ? 1 : r.numHeight;
      const x = index % nw, y = Math.floor(index/nw);
      const cropBox = {left:Math.floor(x*meta.width/nw),top:Math.floor(y*meta.height/nh),width:Math.floor((x+1)*meta.width/nw)-Math.floor(x*meta.width/nw),height:Math.floor((y+1)*meta.height/nh)-Math.floor(y*meta.height/nh)};
      const assetPath = `src/assets/community-reference/complete-edition/${s.kind}/${s.region ?? s.contentSet}/${s.level ? `level-${s.level}/` : ''}${r.deckId}-${r.cardIndex}.${side}.png`;
      const out = await sharp(bytes).extract(cropBox).png({compressionLevel:9,adaptiveFiltering:false}).toBuffer();
      mkdirSync(dirname(assetPath),{recursive:true}); writeFileSync(assetPath,out);
      assets[side] = {assetPath, assetSha256:sha(out), sourceAtlasUrl:url, sourceAtlasSha256:sha(bytes), sourceAtlasFaceUrl:r.faceUrl, sourceAtlasBackUrl:r.backUrl, cropBox, cardIndex:r.cardIndex, atlasGrid:{numWidth:nw,numHeight:nh,width:meta.width,height:meta.height}};
    }
    records.push({...s,sourceGuid:r.sourceObjectGuid,cardId:r.cardId,deckId:r.deckId,cardIndex:r.cardIndex,physicalIdentity:r.physicalIdentity,ttsPath:r.ttsPath,containerPath:r.containerHierarchy,sourceExpansion:r.sourceCategory,FaceURL:r.faceUrl,BackURL:r.backUrl,NumWidth:r.numWidth,NumHeight:r.numHeight,UniqueBack:r.uniqueBack,assets});
  }
  const missing=records.flatMap(r=>Object.entries(r.assets).filter(([,a])=>!a.assetPath).map(([side,a])=>({physicalIdentity:r.physicalIdentity,side,...a})));
  if(missing.length){write('.artifacts/c1a/asset-failures.json',missing);throw Error(`${missing.length} unavailable card sides; previous complete manifest preserved. See .artifacts/c1a/asset-failures.json`);}
  write(manifestFile, {schemaVersion:'c1a.assets.v1',sourceSha256:expectedSource,c0InventorySha256:sha(readFileSync(c0Path)),cropConvention:'row-major; floor(cell boundary); UniqueBack uses same index',records});
  console.log(`Vendored ${records.length} cards / ${records.length*2} images`);
}
