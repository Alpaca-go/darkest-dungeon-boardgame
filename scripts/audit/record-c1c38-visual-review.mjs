// Offline reviewed evidence only; no network acquisition or rules inference from transport.
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='docs/data/complete-edition/';
const out=root+'source-assets/c1c38/';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(name,value)=>writeFileSync(out+name+'.json',JSON.stringify(value,null,2)+'\n');
const discovery=read(out+'locked-corpus-discovery.json');
const reviewed=new Set([1,3,7,9,10,11,12,13,16,17,20,21]);
const rulebookPages=[7,12,16,17,19,20,21,24,25,30,31,35,38].map(page=>{
  const path=out+`core-print-p${page}.png`;
  copyFileSync(`tmp/c1c38-review/rules-21-p${page}.png`,path);
  return {page,path,sha256:hash(path),pdfRelativePath:discovery.files[21].relativePath,
    pdfSha256:discovery.files[21].sha256,renderScale:1.5,review:'DIRECT_VISUAL_REVIEW',
    context:'Shared core rules or core-specific examples only; Thing applicability not established.'};
});
write('visual-review',{schemaVersion:1,scope:{textSearch:'All 25 locked PDFs, 529 pages, exact hash checked',
  directImages:'Six selected Thing sides and four independent Aberration dependency sides',
  contactSheets:'Complete front sets for medium/large cards, rooms/tiles, both aids/track, old-road overview and core pages 37-44',
  detailedRulebookPages:rulebookPages.map(p=>p.page),all529PagesVisuallyReviewed:false,
  rule:'Text misses and contact-sheet navigation do not prove missing rules do not exist.'},rulebookPages,
  files:discovery.files.map((f,index)=>({relativePath:f.relativePath,sha256:f.sha256,pageCount:f.pageCount,
    textSearchCompleted:true,textReviewScope:'Keyword discovery; relevant shared rules reviewed in detail; remaining generic hits are unaccepted navigation only',
    visualScope:reviewed.has(index)?'TARGETED_CONTACT_SHEET_OR_DETAILED_REVIEW':'TEXT_DISCOVERY_ONLY',
    classification:index===21?'SHARED_RULES_AND_CORE_ENCOUNTER_EXAMPLES':index===24?'PRIOR_LOCKED_CORE_EDITION':
      index===20?'OLD_ROAD_CORE_SCENARIO':'CORE_PRINTED_COMPONENT_CORPUS',
    thingSpecificEncounterClauseBound:false,physicalSummonSupplyBound:false}))});
const values={name:'Thing from the Stars',tags:'Eldritch - Large',dodge:2,resistances:['Blight','Debuff'],immunity:['Stun'],
  speedGlyphCount:2,life:130,emblem:'teal crystal banner; meaning SOURCE_UNRESOLVED',
  skill1:{number:1,name:'Vorpal Strike',priority:'Closest',range:1,heroHeads:1,crit:2,criticalDamage:16,accuracy:11,damage:11,target:'Stress +2',duration:'PRINTED_ABSENT'},
  skill2:{number:2,name:'Weakening Shard',priority:'Furthest',range:2,heroHeads:1,crit:2,criticalDamage:4,accuracy:11,damage:2,target:'Stun 2t; 4 Blight 2t; Stress +1; Debuff 3t'},
  skill3:{number:3,name:'Return to the Stars',priority:'Crowded',range:2,heroHeads:4,crit:'PRINTED_ABSENT',criticalDamage:'PRINTED_ABSENT',accuracy:'PRINTED_ABSENT',damage:'PRINTED_ABSENT',self:'5 [orange-outline black-heart token]; remove [green dotted drop] [red drop]',target:'[Stress] +2; [white skull on red downward arrow]',duration:'PRINTED_ABSENT'},
  stancePanels:'four colored Aggressive/Defensive/Ranged/Support panels; four gray panels',table:'[1] 1-5; [2] 6-10',back:'BOSS [LEVEL:I]'};
write('battle-visual-transcription',{schemaVersion:1,method:'DIRECT_FRONT_AND_BACK_VISUAL_REVIEW',ocrAssistanceUsed:false,
  frontLiteral:JSON.stringify(values,null,2),fields:Object.entries(values).map(([id,literal])=>({id,literal,confidence:'HIGH_DIRECT_VISUAL',
    absenceIsZero:false,semanticAuthority:'See separately hash-bound glyph and semantic contracts'}))});
const sheets=['24f0738f3b51e297b3329c6a6f481a89421ed06a970629fd81bd722009239d44','5376d20b7b1dcf7eefd77b03b75f71ab8b95ac1915c2693713bf70f0388614f9'];
const sheetBindings=sheets.map(id=>{const path=root+'source-assets/c1c24/sheets/'+id+'.bin';return {path,sha256:hash(path),
  receipt:path+'.receipt.json',receiptSha256:hash(path+'.receipt.json'),width:3540,height:5700,numWidth:6,numHeight:6,
  transportAuthority:'NONE',rulesAuthority:'OFFICIAL_PRINTED_COMPONENT_IMAGE_ONLY'};});
write('aberration-intake',{schemaVersion:1,authority:'OFFICIAL_PRINTED_COMPONENT',externalAcquisition:false,
  source:'Existing hash-locked official printed card images; transport grouping does not bind content set or copy census',sheetBindings,
  cards:[43107,43117].map((cardId,i)=>({cardId,printedName:'Crystalline Aberration',printedLevel:i===0?'I':'II',
    transportNickname:'Crystalline Aberation',contentSet:'SOURCE_UNRESOLVED',physicalCopies:'SOURCE_UNRESOLVED',
    productionDefinition:'SOURCE_UNRESOLVED',frontReviewed:true,backReviewed:true,
    physicalIdentity:i===0?'tts-path:/ObjectStates/48/ContainedObjects/6/ContainedObjects/0/ContainedObjects/3':'tts-path:/ObjectStates/48/ContainedObjects/6/ContainedObjects/2/ContainedObjects/7',
    crop:{index:i===0?7:17,left:i===0?590:2950,top:i===0?950:1900,width:590,height:950},
    sourceReferences:['front','back'].map((side,j)=>({path:out+`${cardId}-${side}.png`,sha256:hash(out+`${cardId}-${side}.png`),
      side,sheetPath:sheetBindings[j].path,sheetSha256:sheetBindings[j].sha256,authority:'OFFICIAL_PRINTED_COMPONENT'})),
    frontLiteral:{name:`Crystalline Aberration ${i===0?'I':'II'}`,tags:'Eldritch - Back - Small',life:i===0?3:6,dodge:0,
      speed:'PRINTED_ABSENT',resistances:'PRINTED_ABSENT',immunities:['Stun','Bleed','Blight','Debuff','Shuffle'],
      copyGlyph:'white circular monster copy mark; count not established',
      skills:[{number:1,name:'Unstable Resonance',target:'All Heroes',range:'PRINTED_ABSENT',crit:1,criticalDamage:i===0?10:12,accuracy:i===0?10:12,damage:i===0?5:8,
        self:'After the action is finished: 10 [wound token]',effects:i===0?'2 Blight 2t':'Stun 1t; 2 Blight 2t'},
        {number:2,name:'Explosive Undoing',target:'All Heroes',range:'PRINTED_ABSENT',crit:1,criticalDamage:i===0?4:5,accuracy:12,damage:i===0?2:3,
          self:'After the action is finished: 10 [wound token]',effects:i===0?'Stress +2':'Stun 1t; Debuff 2t; Stress +3'}],
      table:'[1] 1-5; [2] 6-10; four stance panels'},backLiteral:'Red doorway illustration; no printed text',
    literalStatus:'LITERAL_COMPLETE',semanticScope:'Dependency intake only; Level II does not create Thing Level II'}))});
