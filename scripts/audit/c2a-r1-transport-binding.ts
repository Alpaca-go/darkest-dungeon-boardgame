/** Offline successor evidence only; no gameplay normalization. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {verifyHistoricalBaseline} from './historical-baseline';
export const C2A_R1_BASELINE='3bb559868ab4e69c8276e85c364be7fbb3fc1d0b';
const root='docs/data/complete-edition/';const assets=root+'source-assets/c2a-r1/';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const check=(ok:unknown,why:string)=>{if(!ok)throw new Error('C2A-R1: '+why);};
const same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
// Exact reviewed receipts are explicit audit authority, never generated from similarity.
const reviewedLocks:Record<string,string>={
  'reviewed-profile-bindings.json':'b24d73211b5fecc173f93c0accea248de827d8f3d37a927b1405199bbd49318f',
  'reviewed-skill-back-bindings.json':'d7c4917dd402b99355c9fafe74dc3b79e204d9478e79124b2aea582086e02286',
  'transport-manifest.json':'c84158e7203e6d11db0faf3ec88d495ab3933c5bb7f5b0f49f367ef56928442a',
};
const common={schemaVersion:1,phase:'11A.5-C2A-R1',baseline:C2A_R1_BASELINE,reviewDate:'2026-10-03',
  sourcePolicyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',runtimeModified:false,prototypePromoted:false,runtimeImplementationAuthorized:false};
const prior=(name:string)=>read(root+'c2a-'+name+'.json');

export function buildC2AR1Artifacts():Record<string,any>{
  for(const [name,hash] of Object.entries(reviewedLocks))check(createHash('sha256').update(readFileSync(assets+name,'utf8').replace(/\r\n/g,'\n')).digest('hex')===hash,'locked reviewed receipt '+name);
  const profiles=read(assets+'reviewed-profile-bindings.json').records;
  const backs=read(assets+'reviewed-skill-back-bindings.json').records;
  const physical=prior('hero-physical-census');const map=prior('hero-skill-level-form-map');
  const starting=prior('hero-source-gap-register').gaps;
  const objects=physical.objects.map((o:any)=>{
    const p=profiles.find((p:any)=>p.physicalId===o.physicalId&&p.status==='OFFICIAL_SOURCE');
    if(!p)return {...o,transportBindingStatus:o.status};
    return {...o,status:'OFFICIAL_SOURCE',transportBindingStatus:'OFFICIAL_SOURCE',visualReview:'PASS',
      frontHash:p.transportFrontHash,backHash:p.transportBackHash,frontImage:p.transportFront.cropPath,backImage:p.transportBack.cropPath,
      officialSourceId:p.officialFront.sourceId,officialSourceRefs:[p.officialFront],officialBackSource:p.officialBack,
      logicalIdentity:`${o.heroId}:profile:${p.printedFrontLevel}`,printedName:p.printedHeroIdentity,printedLevel:p.printedFrontLevel,
      printedBackLevel:p.printedBackLevel,frontRole:p.frontRole,backRole:p.backRole};
  });
  const forms=map.forms.map((f:any)=>{
    const b=backs.find((b:any)=>b.statePath===f.statePath&&b.status==='OFFICIAL_SOURCE');
    return b?{...f,transportBackBindingStatus:'OFFICIAL_SOURCE',backVisualHash:b.transportBackHash,backVisualImage:b.transportBackCropPath,
      transportBackEvidence:b}:f;
  });
  for(const o of objects.filter((o:any)=>o.category==='SKILL_TRANSPORT_OWNER')) {
    const related=forms.filter((f:any)=>f.physicalCardId===o.physicalId);
    o.backSourceStatus=related.every((f:any)=>f.transportBackBindingStatus==='OFFICIAL_SOURCE')?'OFFICIAL_SOURCE':'SOURCE_UNRESOLVED';
  }
  const closed=starting.filter((g:any)=>g.scope==='PROFILE_TRANSPORT_CORRELATION'
    ?profiles.some((p:any)=>p.physicalId===g.physicalId&&p.status==='OFFICIAL_SOURCE')
    :backs.some((b:any)=>b.statePath===g.statePath&&b.status==='OFFICIAL_SOURCE'));
  const remaining=starting.filter((g:any)=>!closed.includes(g));
  const a:Record<string,any>={};const completeHeroes:string[]=[];
  for(const id of prior('hero-logical-identities').heroes.map((h:any)=>h.heroClassId)) {
    const h=read(root+'heroes/c2a/'+id+'.json');const gaps=remaining.filter((g:any)=>g.heroId===id);
    const heroObjects=objects.filter((o:any)=>o.heroId===id);const heroForms=forms.filter((f:any)=>f.heroId===id);
    const complete=h.identity.status==='OFFICIAL_SOURCE'&&h.skills.length===7&&heroForms.length===21&&
      heroObjects.every((o:any)=>o.status==='OFFICIAL_SOURCE')&&heroForms.every((f:any)=>f.transportBackBindingStatus==='OFFICIAL_SOURCE')&&!gaps.length;
    if(complete)completeHeroes.push(id);
    a['heroes/'+id]={...h,...common,previousCensusStatus:h.censusStatus,
      profileBindingsClosed:profiles.filter((p:any)=>p.heroId===id&&p.status==='OFFICIAL_SOURCE').length,
      skillBackBindingsClosed:backs.filter((b:any)=>b.heroId===id&&b.status==='OFFICIAL_SOURCE').length,
      remainingGaps:gaps,sourceGaps:gaps,unresolvedRefs:gaps.map((g:any)=>g.gapId),censusStatus:complete?'CENSUS_COMPLETE':'CENSUS_PARTIAL',
      specialInventoryExplanation:id==='abomination'?'Three distinct individually bound Profile owners: Human I / Beast I, Human II / Beast II, Human III / Beast III.':h.specialInventoryExplanation,
      heroCards:heroObjects.filter((o:any)=>o.category==='HERO_PVP_CARD'),levelProfileCards:heroObjects.filter((o:any)=>o.category==='LEVEL_PROFILE_CARD'),skillStates:heroForms,
      officialProfileInventory:h.officialProfileInventory.map((s:any)=>({...s,transportBindingStatus:profiles.some((p:any)=>p.heroId===id&&p.officialFront.page===s.front.page&&p.status==='OFFICIAL_SOURCE')?'OFFICIAL_SOURCE':'SOURCE_UNRESOLVED'}))};
  }
  const done=remaining.length===0&&completeHeroes.length===18;
  a['historical-c2a-freeze']={...common,checkpoint:{phase:'11A.5-C2A',commit:C2A_R1_BASELINE,outcome:'HERO_SOURCE_CENSUS_PARTIAL'},c2aArtifactsImmutable:true};
  a['profile-transport-binding']={...common,targeted:37,entries:profiles};
  a['skill-back-transport-binding']={...common,targeted:102,entries:backs};
  a['hero-physical-census']={...physical,...common,objects,physicalObjectsAccounted:objects.length,physicalObjectsBound:objects.filter((o:any)=>o.status==='OFFICIAL_SOURCE').length};
  a['hero-skill-level-form-map']={...map,...common,forms,frontBound:forms.filter((f:any)=>f.status==='OFFICIAL_SOURCE').length,backBound:forms.filter((f:any)=>f.transportBackBindingStatus==='OFFICIAL_SOURCE').length};
  const counts={starting:139,closed:closed.length,remaining:remaining.length,
    profile:{starting:37,closed:closed.filter((g:any)=>g.scope).length,remaining:remaining.filter((g:any)=>g.scope).length},
    skillBack:{starting:102,closed:closed.filter((g:any)=>!g.scope).length,remaining:remaining.filter((g:any)=>!g.scope).length}};
  a['source-gap-register']={...common,counts,closedGaps:closed.map((g:any)=>({...g,status:'CLOSED',previousDetail:g.detail,detail:'Closed by hash-bound direct transport / official print visual confirmation.',successorEvidence:g.scope?'c2a-r1-profile-transport-binding.json':'c2a-r1-skill-back-transport-binding.json'})),gaps:remaining};
  a['source-conflicts']={...common,conflicts:[],unresolvedConflicts:0,navigationCorrections:[{transportGuid:'1bc8a5',similarityCandidatePage:22,visuallyConfirmedPage:23,printedLevel:'III',status:'RESOLVED_BY_DIRECT_VISUAL_REVIEW',acceptedC2AMappingChanged:false}]};
  a['hero-content-coverage']={...prior('hero-content-coverage'),...common,heroGroupsComplete:completeHeroes.length,physicalObjectsAccounted:199,physicalObjectsBound:a['hero-physical-census'].physicalObjectsBound,profileBound:profiles.filter((p:any)=>p.status==='OFFICIAL_SOURCE').length,skillFrontBound:378,skillBackBound:a['hero-skill-level-form-map'].backBound,sourceGaps:remaining.length};
  a['hero-content-coverage'].heroes=a['hero-content-coverage'].heroes.map((h:any)=>({...h,
    physicalObjectsBound:objects.filter((o:any)=>o.heroId===h.heroId&&o.status==='OFFICIAL_SOURCE').length,
    sourceGaps:remaining.filter((g:any)=>g.heroId===h.heroId).length,censusStatus:a['heroes/'+h.heroId].censusStatus,
    skillFormBacksBound:forms.filter((f:any)=>f.heroId===h.heroId&&f.transportBackBindingStatus==='OFFICIAL_SOURCE').length}));
  a['hero-source-census-acceptance']={...prior('hero-source-census-acceptance'),...common,
    heroGroupsComplete:completeHeroes.length,physicalObjectsBound:a['hero-physical-census'].physicalObjectsBound,
    levelProfileCardsBound:profiles.filter((p:any)=>p.status==='OFFICIAL_SOURCE').length,skillFormBacksBound:a['hero-skill-level-form-map'].backBound,
    fullFrontBackOwnersBound:objects.filter((o:any)=>o.status==='OFFICIAL_SOURCE'&&(o.category!=='SKILL_TRANSPORT_OWNER'||o.backSourceStatus==='OFFICIAL_SOURCE')).length,
    identityCensusComplete:done,sourceProvenanceComplete:done,runtimeProductionReady:false,C2BAllowed:done,C2BSourceCompleteSubsets:completeHeroes,
    outcome:done?'HERO_SOURCE_CENSUS_ACCEPTED':'HERO_SOURCE_CENSUS_PARTIAL',blockers:remaining.map((g:any)=>g.gapId),gapAccounting:counts,
    physicalBindingScope:'Transport owners; Profile both faces directly reviewed; Skill families retain accepted fronts plus successor back closure.',
    fullSkillLiteralClosureAuthorized:done};
  a['next-workstream-decision']={...common,outcome:a['hero-source-census-acceptance'].outcome,C2BAllowed:done,
    nextWorkstream:done?'11A.5-C2B — Hero Skill & Level Literal Closure':'C2A-R1 missing transport closure',
    C2BPerformed:false,ThingStatus:'SOURCE_ACQUISITION_HOLD',ThingRuntimeAuthorized:false,
    numericalNormalizationPerformed:false,prototypeClassificationArtifact:'c2a-prototype-hero-data-comparison.json',
    necromancerSuccessorCompatibility:'PASS',prophetSuccessorCompatibility:'PASS',bossSuccessorCompatibility:'PASS',
    remoteGateRequirement:'Production release gate on exact final HEAD: completed / success'};
  const manifest=read(assets+'transport-manifest.json');
  a['missing-transport-assets']={...common,assets:manifest.records.filter((r:any)=>r.retrievalStatus!=='RETRIEVED').map((r:any)=>({assetUrl:r.url,affectedHeroes:[...new Set(r.affected.map((x:any)=>x.heroId))],affectedObjectsForms:r.affected,retrievalAttempts:r.attempts,status:'SOURCE_UNRESOLVED',whyCorrelationCannotBeInferred:'Transport locators and official candidates alone do not demonstrate visual equality.'}))};
  return a;
}

export function validateC2AR1Artifacts(a:Record<string,any>) {
  const expected=buildC2AR1Artifacts();
  check(same(Object.keys(a).sort(),Object.keys(expected).sort()),'artifact set');
  for(const [k,v] of Object.entries(expected))check(same(a[k],v),'source-derived contract '+k);
  const p=a['hero-physical-census'];const m=a['hero-skill-level-form-map'];
  check(p.objects.length===199&&p.officialPrintedObjects.length===451,'owner vs print-slot count');
  check(m.forms.length===378&&m.frontBound===378&&m.stateIndexIsLevelAuthority===false,'fronts and Roman mapping frozen');
  check(prior('hero-skill-identities').skills.length===126,'126 identities');
  const oldForms=prior('hero-skill-level-form-map').forms;
  const strip=(f:any)=>Object.fromEntries(Object.entries(f).filter(([k])=>!['transportBackBindingStatus','backVisualHash','backVisualImage','transportBackEvidence'].includes(k)));
  for(const [i,f] of m.forms.entries())check(same(strip(f),strip(oldForms[i])),'no Skill front remapping or semantic edits');
  const manifest=read(assets+'transport-manifest.json');
  check(!manifest.transportIsRulesAuthority,'transport is not authority');
  for(const r of manifest.records){check(r.authority==='DISCOVERY_TRANSPORT_ONLY'&&r.attempts.length>0,'receipt provenance');
    if(r.retrievalStatus==='RETRIEVED')check(sha(r.path)===r.sha256&&readFileSync(r.path).length===r.byteSize&&r.width>0&&r.height>0,'retrieved asset integrity');
  }
  const validRef=(r:any)=>{check(r.authority==='OFFICIAL_PRINTED_COMPONENT'&&r.page>0&&sha(r.path)===r.sha256,'frozen official reference');};
  for(const b of a['skill-back-transport-binding'].entries){
    const f=oldForms.find((f:any)=>f.statePath===b.statePath);check(f&&same(f.officialBackCandidate,b.officialBackPage),'back candidate to reviewed page');
    check(b.heroId===f.heroId&&b.skillId===f.skillId&&b.level===f.level&&b.printedLevelMarker===f.printedLevelMarker&&b.printedBackName===f.printedBackName,'back printed identity');
    check(b.visualReview==='PASS'&&b.reviewBasis.startsWith('Direct side-by-side')&&b.status==='OFFICIAL_SOURCE','direct back confirmation required');
    check(sha(b.transportBackCropPath)===b.transportBackHash&&sha(b.officialBackCropPath)===b.officialBackCropHash&&sha(b.transportAssetPath)===b.transportAssetHash,'review hashes');
    check(b.transportUrl===f.transport.backImage,'exact physical state back URL');validRef(b.officialBackPage);
  }
  check(a['profile-transport-binding'].entries.length===37&&a['skill-back-transport-binding'].entries.length===102,'37 / 102 targets');
  for(const b of a['profile-transport-binding'].entries){
    const o=prior('hero-physical-census').objects.find((o:any)=>o.physicalId===b.physicalId);
    const h=read(root+'heroes/c2a/'+b.heroId+'.json');const slot=h.officialProfileInventory.find((s:any)=>same(s.front,b.officialFront)&&same(s.back,b.officialBack));
    check(o&&slot&&b.transportGuid===o.transportGuid&&b.transportPath===o.transportPath&&b.printedHeroIdentity===h.identity.printedName,'Profile printed candidate pairing');
    check(b.printedFrontLevel===slot.frontLevelMarker&&b.printedBackLevel===slot.backLevelMarker&&b.frontRole===slot.frontRole&&b.backRole===slot.backRole,'actual Profile roles');
    check(b.visualReview==='PASS'&&b.reviewBasis.startsWith('Direct side-by-side')&&b.status==='OFFICIAL_SOURCE','Profile direct confirmation');
    for(const side of ['Front','Back']){const t=b['transport'+side];check(t.url===o.transport[side.toLowerCase()+'Image']&&sha(t.assetPath)===t.assetHash&&sha(t.cropPath)===t.cropHash&&t.cropHash===b['transport'+side+'Hash'],'Profile crop integrity');
      const c=b['official'+side+'Crop'];check(sha(c.cropPath)===c.cropHash,'official Profile crop hash');validRef(b['official'+side]);}
  }
  const c=a['source-gap-register'].counts;for(const v of [c,c.profile,c.skillBack])check(v.starting===v.closed+v.remaining,'no silent gap deletion');
  check(a['heroes/abomination'].levelProfileCards.length===3,'Abomination three owners');
  check(a['next-workstream-decision'].ThingStatus==='SOURCE_ACQUISITION_HOLD'&&!a['next-workstream-decision'].ThingRuntimeAuthorized,'Thing frozen');
  for(const v of Object.values(a))check(!v.runtimeModified&&!v.prototypePromoted&&!v.runtimeImplementationAuthorized,'runtime/prototype boundary');
}

const pathFor=(k:string)=>k.startsWith('heroes/')?root+'heroes/c2a-r1/'+k.slice(7)+'.json':root+'c2a-r1-'+k+'.json';
export function verifyRuntimeBoundary(){
  const git=(args:string[])=>execFileSync('git',args,{maxBuffer:128*1024*1024}).toString().trim();
  const paths=git(['ls-tree','-r','--name-only',C2A_R1_BASELINE,'src']).split(/\r?\n/).filter(p=>!p.startsWith('src/audit/'));
  const actual=execFileSync('git',['hash-object','--stdin-paths'],{input:paths.join('\n')+'\n',maxBuffer:128*1024*1024}).toString().trim().split(/\r?\n/);
  // Batch expected blob IDs avoids thousands of individual Git processes.
  const tree=git(['ls-tree','-r',C2A_R1_BASELINE,'src']).split(/\r?\n/);const blobs=new Map(tree.map(l=>{const [meta,p]=l.split('\t');return [p,meta.split(' ')[2]];}));
  for(const [i,p] of paths.entries()){
    if(actual[i]===blobs.get(p))continue;
    check(readFileSync(p,'utf8').replace(/\r\n/g,'\n')===execFileSync('git',['show',C2A_R1_BASELINE+':'+p]).toString('utf8').replace(/\r\n/g,'\n'),'runtime source unchanged '+p);
  }
  const changed=git(['diff','--name-only',C2A_R1_BASELINE,'--','src']).split(/\r?\n/);
  const extra=git(['ls-files','--others','--exclude-standard','src']).split(/\r?\n/);
  for(const p of [...changed,...extra].filter(Boolean))check(p.startsWith('src/audit/'),'no new runtime registry '+p);
}
async function verifyCrop(t:any){
  const meta=await sharp(t.assetPath).metadata();const [left,top,right,bottom]=t.bounds;
  check(left>=0&&top>=0&&right<=meta.width!&&bottom<=meta.height!,'crop bounds');
  const actual=await sharp(t.assetPath).extract({left,top,width:right-left,height:bottom-top}).removeAlpha().raw().toBuffer();
  const saved=await sharp(t.cropPath).removeAlpha().raw().toBuffer();check(actual.equals(saved),'deterministic transport crop pixels');
}
export async function verifyC2AR1(){
  execFileSync(process.execPath,['node_modules/vite-node/vite-node.mjs','scripts/audit/c2a-hero-source-census.ts','--verify'],{stdio:'pipe',maxBuffer:128*1024*1024});
  verifyHistoricalBaseline('c2a');verifyRuntimeBoundary();
  const a=buildC2AR1Artifacts();validateC2AR1Artifacts(a);
  for(const [k,v] of Object.entries(a))check(existsSync(pathFor(k))&&same(read(pathFor(k)),v),'deterministic saved artifact '+k);
  for(const p of a['profile-transport-binding'].entries){await verifyCrop(p.transportFront);await verifyCrop(p.transportBack);}
  for(const b of a['skill-back-transport-binding'].entries)await verifyCrop({assetPath:b.transportAssetPath,bounds:b.cropBounds,cropPath:b.transportBackCropPath});
  const workflow=readFileSync('.github/workflows/release-gate.yml','utf8');check(workflow.includes('npm run verify:complete-edition-c2a-r1'),'exact HEAD workflow includes successor');
  console.log('C2A-R1 PASS: '+a['hero-source-census-acceptance'].outcome+'; '+a['source-gap-register'].counts.closed+'/139 closed; runtime unchanged.');
}
if(process.argv.includes('--write')){const a=buildC2AR1Artifacts();validateC2AR1Artifacts(a);for(const [k,v] of Object.entries(a)){const p=pathFor(k);mkdirSync(p.slice(0,p.lastIndexOf('/')),{recursive:true});writeFileSync(p,JSON.stringify(v,null,2)+'\n');}console.log('C2A-R1 artifacts written');}
if(process.argv.includes('--verify'))await verifyC2AR1();
