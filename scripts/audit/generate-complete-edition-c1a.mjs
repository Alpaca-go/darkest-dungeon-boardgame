import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {json,write,sha,dataRoot,expectedSource} from '../assets/import-complete-edition-c1a.mjs';
import {trinketSemantics,classifyTrinket} from './c1a-trinket-semantics.mjs';
import {questSemantics} from './c1a-quest-semantics.mjs';
export const sort = (a,b) => a<b?-1:a>b?1:0;
export const slug = s => s.toLowerCase().replace(/['’!]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const leafPaths = (v,p='') => v!==null&&typeof v==='object' ? Object.entries(v).flatMap(([k,x])=>leafPaths(x,p?`${p}.${k}`:k)) : [p];
const observationPaths = [`${dataRoot}/trinkets/literal-observations.json`,...readdirSync(`${dataRoot}/quests`).filter(p=>/^literal-observations-.*\.json$/.test(p)).sort(sort).map(p=>`${dataRoot}/quests/${p}`)];
export {observationPaths};
export function generate() {
 const manifest=json(`${dataRoot}/c1a-asset-manifest.json`);
 const observed=new Map();
 for(const file of observationPaths) for(const [i,row] of json(file).cards.entries()) {
   if(observed.has(row[0])) throw Error(`Duplicate observation ${row[0]}`);
   observed.set(row[0],{file,index:i,row});
 }
 const output={};
 const evidence={trinkets:[],quests:[]}, normalized={trinkets:[],quests:[]};
 const entries=[];
 for(const physical of manifest.records) {
  const cell=`${physical.deckId}-${physical.cardIndex}`, observation=observed.get(cell);
  if(!observation) throw Error(`Untranscribed card ${cell}`);
  const {row,file,index}=observation;
  const trinket=physical.kind==='trinkets';
  const id=trinket?`community-trinket-${physical.contentSet}-${slug(row[1])}`:`community-quest-${physical.region}-${physical.level?`lvl${physical.level}-`:''}${slug(row[1])}`;
  const sourceId=`c1a-source:${physical.physicalIdentity}`;
  const sourceRef=(field,side='front',region=[0,0,1,1],rotation=0)=>({sourceId,literalField:field,assetPath:physical.assets[side].assetPath,assetSha256:physical.assets[side].assetSha256,region:{units:'fraction-of-card',box:region,rotation},status:'visual-confirmed'});
  const common={sourceId,definitionId:id,...physical,expansion:physical.contentSet,frontAssetPath:physical.assets.front.assetPath,frontSha256:physical.assets.front.assetSha256,backAssetPath:physical.assets.back.assetPath,backSha256:physical.assets.back.assetSha256,observation:{file,jsonPointer:`/cards/${index}`,sha256:sha(readFileSync(file))},extractionStatus:'visual-confirmed',sourceBlockers:[],fieldEvidence:{}};
  const e=trinket?{...common,printedName:row[1],printedLevel:physical.level?['','I','II','III'][physical.level]:null,positiveSide:{printedLabel:row[1],printedText:row[2]},negativeSide:{printedLabel:row[1],printedText:row[3]},printedBackText:physical.level?['','I','II','III'][physical.level]:null,backObservation:'Nomad illustration; no rules. Exact indexed UniqueBack cell retained.'}:{...common,printedTitle:row[1],printedRegion:null,printedRegionSymbol:physical.region==='boss'?null:({ruins:'arched-door',cove:'anchor','crimson-court':'fangs',warrens:'boar',weald:'mushroom'})[physical.region],printedLevel:row[2],printedRestingPoints:row[3],printedFlavorText:row[4],printedObjective:null,objectiveObservation:'No separate Objective heading; qualification is printed in XP and Special Rules panels.',printedSpecialRules:row[5],printedReward:row[6],printedRoomRequirement:row[7],printedBackText:physical.region==='boss'?'Boss Quest':`Quest ${row[2]}`};
  e.symbols=[...new Set(JSON.stringify(row).match(/\[[a-z0-9-]+\]/g)??[])];
  if(!trinket){e.printedIcons=[...e.symbols,...Object.keys(e.printedRoomRequirement).map(k=>`[${k}-room]`),...(e.printedRegionSymbol?[`[${e.printedRegionSymbol}]`]:[])];e.printedKeywords=['XP',...(e.printedSpecialRules.length?['SPECIAL RULES']:[])];}
  for(const field of ['contentSet','region','level','sourceExpansion']) e.fieldEvidence[field]={status:'tts-structure-confirmed',sourceId,ttsPath:physical.ttsPath,containerPath:physical.containerPath};
  if(trinket){
    e.fieldEvidence.printedName=sourceRef('printedName','front',[0.22,0.12,0.7,0.14]);
    for(const side of ['positiveSide','negativeSide']) for(const field of ['printedLabel','printedText']) e.fieldEvidence[`${side}.${field}`]=sourceRef(`${side}.${field}`,'front',side==='positiveSide'?[0,0,1,0.5]:[0,0.5,1,0.5],side==='negativeSide'?180:0);
    e.fieldEvidence.printedLevel=sourceRef('printedLevel','front',[0.15,0.41,0.1,0.09]);
  } else {
    const fields=['printedTitle','printedRegion','printedRegionSymbol','printedLevel','printedRestingPoints','printedFlavorText','printedObjective','printedReward','printedSpecialRules','printedRoomRequirement','printedIcons','printedKeywords'];
    for(const f of fields) for(const p of leafPaths(e[f],f)) {
      const box=f==='printedTitle'?[0.24,0.12,0.68,0.08]:f==='printedLevel'?[0.4,0.04,0.2,0.09]:f==='printedRestingPoints'?[0.08,0.12,0.2,0.2]:f==='printedRoomRequirement'?[0.08,0.72,0.8,0.25]:f==='printedRegionSymbol'?[0.7,0,0.14,0.14]:[0.1,0.19,0.8,0.61];
      e.fieldEvidence[p]=sourceRef(p,'front',box);
    }
  }
  e.fieldEvidence.printedBackText=sourceRef('printedBackText','back',trinket?[0.8,0.1,0.15,0.25]:[0.1,0.8,0.8,0.17]);
  for(const p of leafPaths(e.symbols,'symbols')) e.fieldEvidence[p]=sourceRef(p);
  const n={id,printedName:row[1],contentSet:physical.contentSet,expansion:physical.contentSet,region:physical.region,level:physical.level,sourceReferences:[sourceId],physicalCardIds:[physical.physicalIdentity],normalizationStatus:'runtime-primitive-unsupported',sourceStatus:'source-supported',unresolvedFields:[],leafProvenance:{}};
  const ref=(f)=>e.fieldEvidence[f]??sourceRef(f);
  if(trinket) {
    const sides=trinketSemantics(cell);
    for(const [i,key] of ['positiveSide','negativeSide'].entries()) {
      n[key]={label:row[1],...sides[i],runtimeSupport:classifyTrinket(sides[i])};
      n.unresolvedFields.push(...sides[i].unresolvedFields.map(f=>`${key}.${f}`));
    }
    n.runtimeSupport={classification:n.unresolvedFields.length?'SOURCE_UNRESOLVED':'RUNTIME_PRIMITIVE_UNSUPPORTED',sideClassifications:sides.map(s=>classifyTrinket(s).classification),productionIntegration:'not-integrated'};
  }else{
    Object.assign(n,{questType:physical.region==='boss'?'boss':'standard'},questSemantics(cell,row));
    n.firewood={tokens:row[3]==='-'?0:1,restingPoints:row[3]==='-'?0:row[3]};
    n.bossAssociation=physical.region==='boss'?{kind:'current-imminent-threat',namedBoss:null,trigger:'after-two-ordinary-quests-in-current-act',campaignActs:[1,2,3],retreatAllowed:false,failure:'campaign-over',battleEnd:'boss-death-removes-remaining-monsters',roundLimit:null,source:'S4:p30,S4:p35'}:null;
  }
  if(n.unresolvedFields.length){n.normalizationStatus='source-blocked';n.sourceStatus='source-blocked';}
  for(const p of leafPaths(n)) {
    let field,rulebook=[];
    if(p==='printedName')field=trinket?'printedName':'printedTitle';
    else if(p==='level'||p==='region'||p==='contentSet'||p==='expansion')field=p==='expansion'?'contentSet':p;
    else if(trinket){field=p.startsWith('negativeSide')?'negativeSide.printedText':'positiveSide.printedText';rulebook=['S4:p12','S4:p21','S4:p26'];}
    else if(p.startsWith('specialRules'))field=`printedSpecialRules.${p.split('.')[1]}`;
    else if(p.startsWith('objective.requiredConditions'))field=`printedSpecialRules.${p.split('.')[2]}`;
    else if(p.startsWith('objective.minimumQuestGoal')&&row[5].length)field='printedSpecialRules.0';
    else if(p.startsWith('rewards.')&&n.rewards[Number(p.split('.')[1])]?.kind!=='xp')field='printedSpecialRules.0';
    else if(p.startsWith('firewood')){field='printedRestingPoints';rulebook=['S4:p11'];}
    else if(p.startsWith('dungeonStructure')||p==='roomCount'){field='printedRoomRequirement';rulebook=['S4:p12'];}
    else if(p.startsWith('bossAssociation')){field='printedSpecialRules.0';rulebook=['S4:p30','S4:p35'];}
    else {field='printedReward';rulebook=['S4:p14,p29'];}
    let evidenceRef=ref(field);
    if(field==='printedRoomRequirement')evidenceRef=sourceRef(field,'front',[0.08,0.72,0.8,0.25]);
    n.leafProvenance[p]={...evidenceRef,rulebook,sourceStatus:n.unresolvedFields.includes(p)?'source-blocked':evidenceRef.status};
  }
  for(const p of n.unresolvedFields) n.leafProvenance[p]={...n.leafProvenance[p],sourceStatus:'source-blocked',reason:cell==='444-14'?'Printed sentence "Clearing Curio Rooms causes Heroes to a tomb" is missing a verb. No substituted action.':'Printed receive healing 4 has no explicit operation; additional versus replacement unresolved.'};
  evidence[physical.kind].push(e);normalized[physical.kind].push(n);
  entries.push({definitionId:id,physicalCardIds:[physical.physicalIdentity],frontSha256:physical.assets.front.assetSha256,backSha256:physical.assets.back.assetSha256,printedName:row[1],contentSet:physical.contentSet,level:physical.level,mergeEvidence:[],splitEvidence:[],identityBasis:'unique printed identity + content set + level + independently inspected full rule face; shared backs alone do not merge cards'});
 }
 if(new Set(entries.map(e=>e.definitionId)).size!==125)throw Error('Semantic ID collision requires explicit source-stable disambiguation');
 const groups=(field)=>[...new Map(entries.map(e=>[e[field],entries.filter(x=>x[field]===e[field]).map(x=>x.definitionId)])).values()].filter(g=>g.length>1);
 const duplicateReview={schemaVersion:'c1a.logical-identities.v1',physicalCount:125,logicalCount:entries.length,entries,exactFrontDuplicates:groups('frontSha256'),sharedBacks:groups('backSha256'),samePrintedName:groups('printedName'),mergePolicy:'No name/GUID-only merge; every physical card assigned exactly once. No alternate state counted as another definition. Cross-level or cross-expansion similar mechanics retained with scoped identity.'};
 output[`${dataRoot}/c1a-logical-identities.json`]=duplicateReview;
 for(const kind of ['trinkets','quests']) {
   const stem=kind==='trinkets'?'trinket':'quest';
   evidence[kind].sort((a,b)=>sort(a.definitionId,b.definitionId));normalized[kind].sort((a,b)=>sort(a.id,b.id));
   output[`${dataRoot}/${kind}/community-${stem}-source-evidence.json`]={schemaVersion:`c1a.${stem}.literal.v1`,sourceSha256:expectedSource,records:evidence[kind]};
   output[`${dataRoot}/${kind}/community-${stem}-normalized.json`]={schemaVersion:`c1a.${stem}.normalized.v1`,definitions:normalized[kind]};
   output[`src/data/community-reference/${kind}/data.json`]=normalized[kind].filter(n=>n.sourceStatus==='source-supported');
 }
 return output;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/generate-complete-edition-c1a.mjs')){
 for(const [path,value] of Object.entries(generate()))write(path,value);
 console.log('Generated C1A literal bindings, semantic definitions, logical review and source-supported data registries.');
}
