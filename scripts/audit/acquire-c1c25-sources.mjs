import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
const root = 'docs/data/complete-edition/';
const out = root + 'source-assets/c1c25/';
mkdirSync(out + 'sheets', { recursive: true });
mkdirSync(out + 'crops', { recursive: true });
const raw = JSON.parse(readFileSync(root + 'complete-edition-raw-inventory.json'));
const digest = (b, alg = 'sha256') => createHash(alg).update(b).digest('hex');
const objects = raw.objects.filter(o => o.isCard && (['Bone Rabble','Bone Soldier','Bone Spearman','Bone Captain','Bone Courtier','Bone Defender'].includes(o.nickname) || o.cardId===44709));
const urls = [...new Set(objects.flatMap(o => [o.faceUrl,o.backUrl]))];
const assets = [];
for (const url of urls) {
  const id = digest(url), path = out + 'sheets/' + id + '.bin';
  let receipt;
  if (!existsSync(path)) {
    const cache = '.artifacts/community-reference-assets/raw/' + id + '.png';
    const cached = existsSync(cache);
    const bytes = cached ? readFileSync(cache) : execFileSync('curl.exe', ['--fail','--silent','--show-error','--max-time','60',url], {encoding:'buffer',maxBuffer:100*1024*1024});
    writeFileSync(path, bytes);
    receipt = { acquiredAt: new Date().toISOString(), acquisitionKind: cached ? 'EXACT_URL_CONTENT_HASH_VERIFIED_CACHE' : 'ORIGINAL_URL_DOWNLOAD', cachePath: cached ? cache : null, mimeBasis: 'Decoded original bytes; no HTTP MIME claim' };
    writeFileSync(path + '.receipt.json', JSON.stringify(receipt,null,2)+'\n');
  } else receipt = JSON.parse(readFileSync(path+'.receipt.json'));
  const bytes = readFileSync(path), metadata = await sharp(bytes).metadata();
  const sha1 = digest(bytes,'sha1');
  if (sha1.toUpperCase() !== url.split('/').filter(Boolean).at(-1)) throw new Error('Original URL content mismatch');
  assets.push({url,path,sha256:digest(bytes),sha1,width:metadata.width,height:metadata.height,format:metadata.format,byteLength:bytes.length,...receipt});
}
const bindings = [];
for (const o of objects) {
  const sides = {};
  for (const side of ['front','back']) {
    const url = side === 'front' ? o.faceUrl : o.backUrl;
    const a = assets.find(a=>a.url===url);
    const cell = side==='back' && !o.uniqueBack ? 0 : o.cardIndex;
    const gw = side==='back' && !o.uniqueBack ? 1 : o.numWidth, gh = side==='back' && !o.uniqueBack ? 1 : o.numHeight;
    const col=cell%gw,row=Math.floor(cell/gw);
    const left=Math.floor(col*a.width/gw),top=Math.floor(row*a.height/gh);
    const bounds = {left,top,width:Math.floor((col+1)*a.width/gw)-left,height:Math.floor((row+1)*a.height/gh)-top};
    const path = out+'crops/'+o.cardId+'-'+digest(o.physicalIdentity).slice(0,12)+'-'+side+'.png';
    await sharp(a.path).extract(bounds).png().toFile(path);
    sides[side] = {path,url,sheetPath:a.path,sheetSha256:a.sha256,cell,grid:{width:gw,height:gh},bounds,sha256:digest(readFileSync(path))};
  }
  bindings.push({physicalIdentity:o.physicalIdentity,sourceObjectGuid:o.sourceObjectGuid,ttsPath:o.ttsPath,cardId:o.cardId,nickname:o.nickname,containerHierarchy:o.containerHierarchy,...sides});
}
const tile = raw.objects.find(o=>o.ttsPath==='/ObjectStates/47/ContainedObjects/8/ContainedObjects/4');
const tileUrl = tile.customImage.ImageSecondaryURL;
const tilePath = out+'tile-10.bin';
const tileBytes = existsSync(tilePath) ? readFileSync(tilePath) : execFileSync('curl.exe',['--fail','--silent','--show-error','--max-time','60',tileUrl],{encoding:'buffer',maxBuffer:20*1024*1024});
if (digest(tileBytes,'sha1').toUpperCase() !== tileUrl.split('/').filter(Boolean).at(-1)) throw new Error('Tile URL mismatch');
if (!existsSync(tilePath)) {
  writeFileSync(tilePath,tileBytes);
  writeFileSync(tilePath+'.receipt.json',JSON.stringify({url:tileUrl,acquisitionKind:'ORIGINAL_URL_DOWNLOAD',acquiredAt:new Date().toISOString(),sha256:digest(tileBytes)},null,2)+'\n');
}
const tileMeta = await sharp(tileBytes).metadata();
const tileReceipt=JSON.parse(readFileSync(tilePath+'.receipt.json'));
// Only prune generated PNGs in this phase's dedicated crop directory.
const retained = new Set(bindings.flatMap(b=>[b.front.path,b.back.path]));
for (const name of readdirSync(out+'crops')) if (name.endsWith('.png')&&!retained.has(out+'crops/'+name)) unlinkSync(out+'crops/'+name);
writeFileSync(root+'c1c25-external-source-manifest.json',JSON.stringify({schemaVersion:1,assets,bindings,tile:{physicalIdentity:tile.physicalIdentity,ttsPath:tile.ttsPath,sourceObjectGuid:tile.sourceObjectGuid,nickname:tile.nickname,side:'ImageSecondaryURL',path:tilePath,url:tileUrl,sha256:digest(tileBytes),sha1:digest(tileBytes,'sha1'),width:tileMeta.width,height:tileMeta.height,receipt:tileReceipt}},null,2)+'\n');
console.log(`Acquired ${assets.length} original sheets; ${bindings.length} external physical bindings.`);
