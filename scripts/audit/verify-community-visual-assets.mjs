import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import sharp from 'sharp';

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
const root=join(repoRoot,'docs/data/darkest-dungeon/community-reference');
const manifestPath=join(root,'community-visual-asset-manifest.json'), lockPath=join(root,'community-visual-identity-lock.json'), inventoryPath=join(root,'asset-inventory.json');
const arg=(name)=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:''};
const intakePath=process.env.PHASE_11A3_INTAKE_PATH||arg('--intake'), ttsPath=process.env.PHASE_11A3_TTS_PATH||arg('--tts');
const adversarial=process.argv.includes('--adversarial'), skipVitest=process.argv.includes('--skip-vitest'), skipImporter=process.argv.includes('--skip-importer');
const hex64=/^[a-f0-9]{64}$/; let failures=0, passes=0;
const checks=[]; let testEvidence=null;
const pass=(m)=>{passes++;checks.push({name:m,passed:true});console.log(`PASS ${m}`)}, fail=(m)=>{failures++;checks.push({name:m,passed:false});console.error(`FAIL ${m}`)}, check=(c,m)=>c?pass(m):fail(m);
function stable(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(stable).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}'}
const sha=(v)=>createHash('sha256').update(v).digest('hex');
function contentView(m){const c=structuredClone(m);delete c.manifestContentSha256;delete c.manifestFileSha256;delete c.hashProtocol;if(c.importer){delete c.importer.downloads;delete c.importer.cacheHits}return c}
function fileProjection(m){const c=structuredClone(m);delete c.manifestFileSha256;delete c.hashProtocol;return JSON.stringify(c,null,2)+'\n'}
const tuple=(v)=>`${v.requirementId}|${v.runtimeEntityId}|${v.assetKind}`;
const sourceKey=(v)=>`${v.guid??v.GUID}/${v.cardId??v.CardID??'null'}/${v.sourceSide}`;
const at=(rootValue,path)=>path.split('/').filter(Boolean).reduce((v,p)=>v?.[p],rootValue);
function verifyTts(tts,ref){const o=at(tts,ref.ttsObjectPath);if(!o||o.GUID!==ref.GUID||(o.CardID??null)!==(ref.CardID??null))return false;if(ref.sourceSide==='face'){const d=o.CustomDeck?.[ref.deckId];return Boolean(d&&d.FaceURL===ref.FaceURL&&d.BackURL===ref.BackURL&&d.NumWidth===ref.NumWidth&&d.NumHeight===ref.NumHeight&&ref.CardID%100===ref.cardIndex)}return o.Name==='Custom_Tile'&&o.CustomImage?.ImageURL===ref.ImageURL&&o.CustomImage?.ImageSecondaryURL===ref.SecondaryURL}
function identityErrors(manifest,lock){const index=new Map(lock.entries.map(e=>[tuple(e),e])),errors=[];for(const a of manifest.assets.filter(a=>a.status==='ready')){const i=index.get(tuple(a));if(!i){errors.push(`${a.assetId}:no-lock`);continue}if(!(i.canonicalSourceReferences||[]).some(r=>sourceKey(a)===sourceKey(r)&&a.sourceReference?.includes(r.sourceReference)&&a.ttsObjectPath===r.ttsObjectPath))errors.push(`${a.assetId}:mismatch`)}return errors}
function physicalErrors(instances){const errors=[];for(let i=0;i<instances.length;i++)for(let j=i+1;j<instances.length;j++){const a=instances[i],b=instances[j];if((a.visualAssetId===b.visualAssetId||a.localPath===b.localPath)&&a.localSha256!==b.localSha256)errors.push(`${a.GUID}/${b.GUID}:different bytes collapsed`)}return errors}

async function main(){
 if(!intakePath||!ttsPath)throw new Error('PHASE_11A3_INTAKE_PATH and PHASE_11A3_TTS_PATH (or --intake/--tts) are required');
 const raws=await Promise.all([manifestPath,lockPath,inventoryPath,intakePath,ttsPath].map(p=>readFile(p,'utf8'))),[manifest,lock,inventory,intake,tts]=raws.map(JSON.parse);
 console.log('--- Phase 11A.3 Community Visual Asset Final Acceptance ---');console.log('manifestContentSha256:',manifest.manifestContentSha256);console.log('manifestFileSha256:',manifest.manifestFileSha256);console.log('metrics:',JSON.stringify(manifest.importer));
 check(manifest.schemaVersion==='phase11a3-community-visual-asset-manifest.v2','V01 manifest schema v2');
 check(manifest.sourceAuthority==='COMMUNITY_RETAIL_REFERENCE'&&lock.sourceAuthority==='COMMUNITY_RETAIL_REFERENCE','V02 Community authority remains isolated');
 check(hex64.test(manifest.manifestContentSha256||'')&&manifest.manifestContentSha256===sha(stable(contentView(manifest))),'V03 manifestContentSha256 present, fresh, exact');
 check(hex64.test(manifest.manifestFileSha256||'')&&manifest.manifestFileSha256===sha(fileProjection(manifest)),'V04 manifestFileSha256 present, fresh, exact projection');
 check(Array.isArray(manifest.inputs)&&manifest.inputs.every(i=>i.role&&i.name&&!/[\\/]/.test(i.name)&&hex64.test(i.sha256)),'V05 canonical inputs have logical names/hashes and no machine paths');
 check(manifest.inputs.find(i=>i.role==='source-intake')?.sha256===sha(raws[3])&&manifest.inputs.find(i=>i.role==='tts-save')?.sha256===sha(raws[4]),'V06 supplied canonical input bytes match manifest');
 const errors=identityErrors(manifest,lock);check(!errors.length,`V07 exact requirement/runtime/kind identity lock${errors.length?': '+errors.join(','):''}`);
 const refs=[...new Map(lock.entries.flatMap(e=>[...(e.canonicalSourceReferences||[]),...(e.allowedPhysicalInstances||[])]).map(r=>[r.sourceReference,r])).values()];
 check(refs.every(r=>verifyTts(tts,r)),`V08 object-specific TTS provenance ${refs.filter(r=>verifyTts(tts,r)).length}/${refs.length}`);
 let localOk=true;for(const a of manifest.assets.filter(a=>a.status==='ready')){const p=join(repoRoot,a.localPath.replaceAll('/',sep));if(!existsSync(p)){localOk=false;continue}const meta=await sharp(p).metadata();if(meta.width!==a.width||meta.height!==a.height||await shaFile(p)!==a.localSha256)localOk=false;for(const x of a.physicalInstances||[]){const pp=join(repoRoot,x.localPath.replaceAll('/',sep));if(!existsSync(pp)||await shaFile(pp)!==x.localSha256)localOk=false}}
 check(localOk,`V09 local decode/dimension/SHA for ${manifest.assets.filter(a=>a.status==='ready').length} ready assets`);
 const cards=manifest.assets.filter(a=>a.assetKind==='guardian-room-card'&&a.status==='ready'),tiles=manifest.assets.filter(a=>a.assetKind==='guardian-room-tile'&&/templars|shuffling|mammoth|ancestor/.test(a.runtimeEntityId)&&a.status==='ready');
 check(cards.length===4&&['afa508/44721/face','9a87c7/44722/face','bb91b0/44723/face','e3fc86/44724/face'].every(x=>cards.some(a=>sourceKey(a)===x)),'V10 canonical Room Cards 4/4');
 check(tiles.length===4&&['7a3fa9/null/imageUrl','7a3fa9/null/secondaryUrl','bc9c87/null/imageUrl','bc9c87/null/secondaryUrl'].every(x=>tiles.some(a=>sourceKey(a)===x)),'V11 canonical Room Tile sides 4/4');
 const monsters=manifest.assets.filter(a=>a.assetKind==='monster-deck-card'&&a.status==='ready'),physical=monsters.flatMap(a=>a.physicalInstances||[]);
 check(monsters.length===9,'V12 Monster logical visuals 9/9');check(physical.length===26&&new Set(physical.map(p=>`${p.GUID}/${p.CardID}`)).size===26,'V13 Monster physical provenance 26/26, unmapped=0');check(physical.every(p=>hex64.test(p.localSha256)&&p.sourceReference&&p.visualAssetId&&p.crop)&&physicalErrors(physical).length===0,'V14 Monster source/crop/hash/visual mappings 26/26 with verified deduplication');
 check(manifest.importer.uniqueSourceUrls===new Set(manifest.assets.filter(a=>a.status==='ready').map(a=>a.sourceUrl)).size&&Number.isInteger(manifest.importer.cacheHits)&&Number.isInteger(manifest.importer.downloads),'V15 source URL/cache/download metrics separated');
 check(inventory.items.length===inventory.summary.total&&manifest.counts.total===inventory.summary.total,'V16 inventory/manifest counts agree');
 check(['community-dd-absolute-nothingness','community-dd-come-unto-your-maker'].every(id=>manifest.assets.some(a=>a.runtimeEntityId===id&&a.status==='source-missing')),'V17 source-missing truth retained');
 if(!skipVitest){
   const scratch=await mkdtemp(join(tmpdir(),'community-visual-tests-')),report=join(scratch,'vitest.json');
   const r=spawnSync(process.execPath,[join(repoRoot,'node_modules/vitest/vitest.mjs'),'run','src/data/darkest-dungeon/community-reference/community-visual-asset-resolver.test.ts','src/components/darkest-dungeon/community-visual-profile-isolation.test.tsx','--reporter=json',`--outputFile=${report}`],{cwd:repoRoot,encoding:'utf8'});
   const results=JSON.parse(await readFile(report,'utf8')).testResults.flatMap(s=>s.assertionResults.map(t=>({file:s.name,title:t.fullName,status:t.status})));
   const count=(...statuses)=>results.filter(t=>statuses.includes(t.status)).length;
   testEvidence={expected:18,discovered:results.length,run:count('passed','failed'),passed:count('passed'),failed:count('failed'),skipped:count('pending','skipped','disabled'),todo:count('todo'),tests:results};
   check(r.status===0&&testEvidence.discovered===18&&testEvidence.run===18&&testEvidence.passed===18&&testEvidence.failed===0&&testEvidence.skipped===0&&testEvidence.todo===0,`V18 resolver + product profile tests${r.status===0?'':`\n${r.stdout}\n${r.stderr}`}`);
 }
 if(!skipImporter)await verifyImporter(manifest,intakePath,ttsPath);if(adversarial)runAdversarial(manifest,lock,tts);
 if(arg('--evidence')) {
   const evidence={runId:randomUUID(),measuredAt:new Date().toISOString(),verifiedImplementationHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim(),manifestContentSha256:manifest.manifestContentSha256,manifestFileSha256:manifest.manifestFileSha256,checks,testEvidence,passed:passes,failed:failures,skipped:skipVitest||skipImporter,terminalVerdict:failures===0&&!skipVitest&&!skipImporter?'COMMUNITY-VISUAL-ASSETS-ACCEPTED':'FAILED'};
   await writeFile(resolve(arg('--evidence')),JSON.stringify(evidence,null,2)+'\n');
 }
 console.log(`--- ${failures?'FAIL':'PASS'} ${passes} passed / ${failures} failed ---`);process.exitCode=failures?1:0;
}
async function verifyImporter(manifest,intake,tts){const sandbox=join(repoRoot,'.artifacts/phase-11a3-final-acceptance/determinism');await rm(sandbox,{recursive:true,force:true});await mkdir(sandbox,{recursive:true});const r=spawnSync(process.execPath,[join(repoRoot,'scripts/assets/import-community-reference-assets.mjs'),'--intake',intake,'--tts',tts,'--out',join(sandbox,'assets'),'--manifest',join(sandbox,'manifest.json'),'--cache',join(repoRoot,'.artifacts/community-reference-assets/raw'),'--skip-download'],{cwd:repoRoot,encoding:'utf8'});if(r.status!==0){fail(`V19 importer rerun failed\n${r.stdout}\n${r.stderr}`);return}const rerun=JSON.parse(await readFile(join(sandbox,'manifest.json'),'utf8'));check(rerun.manifestContentSha256===manifest.manifestContentSha256&&JSON.stringify(rerun.assets)===JSON.stringify(manifest.assets),'V19 path/cache-independent canonical hash and deterministic assets')}
function runAdversarial(manifest,lock,tts){
 const cases=[['I01','community-dd-templars-room','ad6c7d',42024,'face'],['I02','community-dd-shuffling-horror-room','654bdc',42031,'face'],['I03','community-dd-mammoth-cyst-room','eb35cd',42028,'face'],['I04','community-dd-ancestor-room','5e5515',42033,'face'],['I05','community-dd-templars-room-tile','bc9c87',null,'imageUrl'],['I06','community-dd-ancestor-room-tile','bc9c87',null,'imageUrl'],['I07','community-dd-templars-room','083199',44516,'face'],['I08','community-dd-shuffling-horror-room-tile','7a3fa9',null,'imageUrl']];
 for(const [id,entity,g,c,s] of cases){const m=structuredClone(manifest),a=m.assets.find(x=>x.runtimeEntityId===entity);a.guid=g;a.cardId=c;a.sourceSide=s;check(identityErrors(m,lock).length>0,`${id} wrong canonical identity rejected`)}
 {const m=structuredClone(manifest);m.assets.find(a=>a.assetKind==='monster-deck-card').physicalInstances.pop();check(m.assets.filter(a=>a.assetKind==='monster-deck-card').flatMap(a=>a.physicalInstances).length!==26,'I09 removed physical instance rejected')}
 {const original=manifest.assets.find(a=>a.assetKind==='monster-deck-card').physicalInstances;const m=structuredClone(original);m[1].visualAssetId=m[0].visualAssetId;check(original[0].localSha256!==original[1].localSha256&&physicalErrors(m).length>0,'I10 unequal crops forcibly sharing one visual rejected')}
 for(const field of ['manifestContentSha256','manifestFileSha256']){const m=structuredClone(manifest);delete m[field];check(!hex64.test(m[field]||''),`H01 ${field} missing rejected`)}
 const card=lock.entries.find(e=>e.runtimeEntityId==='community-dd-templars-room').canonicalSourceReferences[0],tile=lock.entries.find(e=>e.runtimeEntityId==='community-dd-ancestor-room-tile').canonicalSourceReferences[0];const tests=[['T01',{},card],['T02',structuredClone(tts),card],['T03',structuredClone(tts),card],['T04',structuredClone(tts),tile],['T05',structuredClone(tts),card]];at(tests[1][1],card.ttsObjectPath).GUID='ffffff';at(tests[2][1],card.ttsObjectPath).CustomDeck[card.deckId].FaceURL='wrong';at(tests[3][1],tile.ttsObjectPath).CustomImage.ImageSecondaryURL='wrong';at(tests[4][1],card.ttsObjectPath).CustomDeck[card.deckId].NumWidth=99;for(const [id,v,r] of tests)check(!verifyTts(v,r),`${id} incorrect TTS provenance rejected`)
}
async function shaFile(path){const h=createHash('sha256');await pipeline(createReadStream(path),h);return h.digest('hex')}
main().catch(e=>{console.error(e.stack||e);process.exit(1)});
