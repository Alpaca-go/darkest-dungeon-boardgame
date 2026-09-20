import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {json,sha,rows,scope,dataRoot,c0Path,expectedSource} from '../assets/import-complete-edition-c1a.mjs';
import {generate,leafPaths,observationPaths} from './generate-complete-edition-c1a.mjs';
import {buildReport} from './c1a-report.mjs';

export const BASE='d571a323bf7d865f9c4def440e7e5621fdebe595';
const manifestPath=`${dataRoot}/c1a-asset-manifest.json`;
const lockPath=`${dataRoot}/c1a-source-review-lock.json`;
const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
const eq=(a,b,message)=>assert.deepEqual(a,b,message);
export function loadBundle(){
 const files=Object.fromEntries(Object.keys(generate()).map(p=>[p,json(p)]));
 return {files,manifest:json(manifestPath)};
}
export function validateBundle(bundle, expected, readAsset=readFileSync) {
 const sourceRows=rows();
 assert.equal(sourceRows.length,125,'C0 target physical conservation');
 const physical=bundle.manifest.records;
 eq(physical.map(r=>r.physicalIdentity).sort(),sourceRows.map(r=>r.physicalIdentity).sort(),'manifest physical conservation');
 assert.equal(physical.filter(r=>r.kind==='trinkets').length,49,'49 Trinkets');
 assert.equal(physical.filter(r=>r.kind==='quests').length,76,'76 ordinary Quests');
 for(const r of physical){
  const c=sourceRows.find(c=>c.physicalIdentity===r.physicalIdentity);assert.ok(c,'C0 identity');
  for(const [k,v] of Object.entries({sourceGuid:c.sourceObjectGuid,cardId:c.cardId,deckId:c.deckId,cardIndex:c.cardIndex,ttsPath:c.ttsPath,FaceURL:c.faceUrl,BackURL:c.backUrl,NumWidth:c.numWidth,NumHeight:c.numHeight,UniqueBack:c.uniqueBack,...scope(c)}))eq(r[k],v,`${r.physicalIdentity}: ${k}`);
  eq(r.containerPath,c.containerHierarchy,'container hierarchy');
  for(const side of ['front','back']){
   const a=r.assets[side];assert.ok(a.assetPath,'all source crops bound');
   eq(a.cardIndex,c.cardIndex,'asset cardIndex');
   eq(a.sourceAtlasUrl,side==='front'?c.faceUrl:c.backUrl,'source URL');
   const grid=a.atlasGrid;
   const nw=side==='back'&&!c.uniqueBack?1:c.numWidth,nh=side==='back'&&!c.uniqueBack?1:c.numHeight;
   eq([grid.numWidth,grid.numHeight],[nw,nh],'grid matches C0');
   const cell=side==='back'&&!c.uniqueBack?0:c.cardIndex,x=cell%nw,y=Math.floor(cell/nw);
   const box={left:Math.floor(x*grid.width/nw),top:Math.floor(y*grid.height/nh),width:Math.floor((x+1)*grid.width/nw)-Math.floor(x*grid.width/nw),height:Math.floor((y+1)*grid.height/nh)-Math.floor(y*grid.height/nh)};
   eq(a.cropBox,box,'crop matches C0 index and atlas');
   eq(sha(readAsset(a.assetPath)),a.assetSha256,`asset hash ${a.assetPath}`);
  }
 }
 for(const [kind,stem,count] of [['trinkets','trinket',49],['quests','quest',76]]) {
  const evidence=bundle.files[`${dataRoot}/${kind}/community-${stem}-source-evidence.json`].records;
  const normalized=bundle.files[`${dataRoot}/${kind}/community-${stem}-normalized.json`].definitions;
  const registry=bundle.files[`src/data/community-reference/${kind}/data.json`];
  assert.equal(evidence.length,count,'literal physical count');
  assert.equal(new Set(evidence.map(e=>e.physicalIdentity)).size,count,'unique literal physical identities');
  eq(evidence.map(e=>e.physicalIdentity).sort(),physical.filter(r=>r.kind===kind).map(r=>r.physicalIdentity).sort(),'literal physical conservation');
  for(const e of evidence) {
    const m=physical.find(r=>r.physicalIdentity===e.physicalIdentity);
    for(const k of ['cardId','cardIndex','sourceGuid','deckId','contentSet','region','level','assets','containerPath'])eq(e[k],m[k],`literal identity ${k}`);
  }
  const assigned=[];
  for(const n of normalized){
   const e=evidence.find(e=>e.definitionId===n.id);assert.ok(e,'each logical definition has literal evidence');
   eq(n.printedName,e.printedName??e.printedTitle,'normalized printed title');
   eq(n.sourceReferences,[e.sourceId],'source binding');
   eq(n.contentSet,e.contentSet,'expansion isolation');
   assigned.push(...n.physicalCardIds);
   for(const field of n.unresolvedFields){eq(get(n,field),null,'source-blocked semantic leaf cannot receive a value');eq(n.leafProvenance[field].sourceStatus,'source-blocked','blocked field evidence');}
   const ruleRoots=kind==='trinkets'?['positiveSide','negativeSide']:['objective','rewards','dungeonStructure','specialRules','firewood','bossAssociation'];
   for(const root of ruleRoots)for(const p of leafPaths(n[root],root)){
     const ref=n.leafProvenance[p];assert.ok(ref,`missing leaf provenance ${n.id}:${p}`);
     eq(ref.sourceId,e.sourceId,'leaf source identity');
     assert.ok(ref.literalField in e.fieldEvidence || ref.literalField==='printedRoomRequirement' || ref.literalField==='printedSpecialRules.0','leaf literal reference must resolve');
     assert.ok([e.frontAssetPath,e.backAssetPath].includes(ref.assetPath),'leaf points to its own card');
   }
  }
  eq(assigned.sort(),evidence.map(e=>e.physicalIdentity).sort(),'no unaccounted logical split or merge');
  const admitted=normalized.filter(n=>n.sourceStatus==='source-supported');
  eq(evidence.filter(e=>e.sourceSupportStatus==='source-supported').map(e=>e.definitionId).sort(),admitted.map(n=>n.id).sort(),'independently reviewed source-supported logical definitions equal normalized');
  eq(registry,admitted,'registry equals source-supported normalized definitions only');
  assert.ok(registry.every(n=>n.id.startsWith('community-')&&!['scout-ahead','recover-relic','face-the-threat'].includes(n.id)),'no prototype ids');
 }
 const identities=bundle.files[`${dataRoot}/c1a-logical-identities.json`];
 for(const entry of identities.entries)if(entry.physicalCardIds.length>1)assert.ok(entry.mergeEvidence.length,'logical merge needs independent evidence');
 // Independent authored observation/semantic inputs are review-locked outside this
 // generated bundle. Rebuilding checks transformations, not the truth of an image.
 for(const [p,value] of Object.entries(expected))eq(bundle.files[p],value,`generated data drift: ${p}`);
 return true;
}

export function tamperTests(bundle,expected){
 const paths={e:`${dataRoot}/trinkets/community-trinket-source-evidence.json`,q:`${dataRoot}/quests/community-quest-normalized.json`,t:`${dataRoot}/trinkets/community-trinket-normalized.json`,i:`${dataRoot}/c1a-logical-identities.json`,r:'src/data/community-reference/quests/data.json'};
 const attacks=[
  ['T1-delete-trinket-evidence',b=>b.files[paths.e].records.pop()],
  ['T2-alter-card-index',b=>b.manifest.records.find(r=>r.kind==='trinkets').cardIndex++],
  ['T3-swap-trinket-assets',b=>{const r=b.manifest.records.filter(r=>r.kind==='trinkets');[r[0].assets.front.assetPath,r[1].assets.front.assetPath]=[r[1].assets.front.assetPath,r[0].assets.front.assetPath];}],
  ['T4-alter-quest-title',b=>b.files[paths.q].definitions[0].printedName='Wrong title'],
  ['T5-inject-prototype-quest',b=>b.files[paths.r].push({id:'recover-relic',name:'Recover the Relic'})],
  ['T6-fill-blocked-semantic-leaf',b=>b.files[paths.t].definitions.find(n=>n.sourceStatus==='source-blocked').positiveSide.effects[0].operation='add'],
  ['T7-confuse-content-set',b=>b.files[paths.e].records.find(e=>e.contentSet==='color-of-madness').contentSet='core'],
  ['T8-merge-without-evidence',b=>{const e=b.files[paths.i].entries;e[0].physicalCardIds.push(e[1].physicalCardIds[0]);e.splice(1,1);}]
 ];
 return attacks.map(([name,attack])=>{const b=structuredClone(bundle);attack(b);assert.throws(()=>validateBundle(b,expected),undefined,`${name} must fail`);return {name,result:'PASS: tamper rejected'};});
}

async function main(){
 const arg=n=>process.argv.includes(n)?process.argv[process.argv.indexOf(n)+1]:undefined;
 const ttsPath=arg('--tts')??process.env.COMPLETE_EDITION_TTS;
 assert.ok(ttsPath,'Supply --tts <3657612854.json> or COMPLETE_EDITION_TTS');
 const bytes=readFileSync(ttsPath);eq(sha(bytes),expectedSource,'C0 source SHA unchanged');
 eq(sha(readFileSync(c0Path)),sha(execFileSync('git',['show',`${BASE}:${c0Path}`],{maxBuffer:30*1024*1024})),'frozen C0 inventory');
 const lock=json(lockPath);
 for(const [path,hash] of Object.entries(lock.files))eq(sha(readFileSync(path)),hash,`review input lock ${path}`);
 const tts=JSON.parse(bytes.toString('utf8'));
 for(const c of rows()){
   let v=tts,deck={};
   for(const part of c.ttsPath.split('/').filter(Boolean)){v=v[part];if(v?.CustomDeck)deck={...deck,...v.CustomDeck};}
   eq(v.GUID,c.sourceObjectGuid,'raw TTS GUID');eq(v.CardID,c.cardId,'raw TTS CardID');
   const d=deck[String(c.deckId)];assert.ok(d,'raw inherited CustomDeck resolved');
   for(const [key,value] of Object.entries({FaceURL:c.faceUrl,BackURL:c.backUrl,NumWidth:c.numWidth,NumHeight:c.numHeight,UniqueBack:c.uniqueBack}))eq(d[key],value,`raw TTS CustomDeck ${key}`);
 }
 const bundle=loadBundle(),expected=generate();validateBundle(bundle,expected);
 eq(readFileSync('docs/reports/complete-edition/c1a-trinket-quest-source-intake-report.md','utf8'),buildReport(expected),'deterministic coverage report');
 for(const [path,value] of Object.entries(expected))eq(readFileSync(path,'utf8'),JSON.stringify(value,null,2)+'\n',`byte-identical generation: ${path}`);
 const atlasDir=arg('--atlas-cache')??'.artifacts/c1a/atlases';
 let verifiedImages=0;
 for(const r of bundle.manifest.records)for(const a of Object.values(r.assets)){
  const atlas=readFileSync(join(atlasDir,`${sha(a.sourceAtlasUrl)}.bin`));
  eq(sha(atlas),a.sourceAtlasSha256,'original atlas hash');
  const meta=await sharp(atlas).metadata();eq([meta.width,meta.height],[a.atlasGrid.width,a.atlasGrid.height],'independent atlas dimensions');
  const recrop=await sharp(atlas).extract(a.cropBox).png({compressionLevel:9,adaptiveFiltering:false}).toBuffer();
  eq(sha(recrop),a.assetSha256,'independently re-extracted card hash');verifiedImages++;
 }
 const changed=execFileSync('git',['diff','--name-only',BASE,'--','src','scripts/e2e'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
 for(const path of changed)assert.ok(path.startsWith('src/data/community-reference/')||path.startsWith('src/assets/community-reference/complete-edition/'),`Production / DD baseline changed: ${path}`);
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]);
 const outside=walk('src').filter(p=>!p.startsWith('src/data/community-reference/')&&/\.(ts|tsx)$/.test(p));
 for(const p of outside)assert.ok(!/community-reference\/(trinkets|quests)(?:\/|['"])/.test(readFileSync(p,'utf8')),`Production consumes C1A: ${p}`);
 const tests=tamperTests(bundle,expected);
 execFileSync(process.execPath,['node_modules/vite-node/vite-node.mjs','scripts/audit/test-complete-edition-c1a-registry.ts'],{stdio:'pipe'});
 console.log(JSON.stringify({result:'PASS',sourceSha256:expectedSource,physicalTrinkets:49,physicalOrdinaryQuests:76,verifiedImages,sourceSupportedTrinkets:48,sourceSupportedStandardQuests:74,sourceSupportedBossQuests:1,sourceBlocked:2,deterministicGeneration:'byte-identical',productionAndDdBaseline:'unchanged',tamperTests:tests,limitation:'Integrity and transformation verification, not independent visual confirmation. C1B must audit original images and semantic interpretation.'},null,2));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/verify-complete-edition-c1a.mjs'))main().catch(e=>{console.error(e.message);process.exitCode=1;});
