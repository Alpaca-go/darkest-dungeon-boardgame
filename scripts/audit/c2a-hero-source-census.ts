/** C2A offline candidate census. Never imported by production. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {HEROES} from '../../src/data/heroes';
import {SKILLS} from '../../src/data/skills';
import {HERO_LEVEL_PROFILES} from '../../src/data/hero-level-profiles';
import {printOrder,reviewedSkills,printedHeroNames,specialStructures} from './c2a-reviewed-identities';

export const C2A_BASELINE='7f4001b956cac441778dbb457cc33041f9057ad5';
const root='docs/data/complete-edition/';
const assets=root+'source-assets/c2a/';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const digest=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
// Text locks use LF for cross-platform checkout reproducibility; PDFs/PNGs lock raw bytes.
const hash=(p:string)=>digest(/\.(ts|json|mjs)$/.test(p)?readFileSync(p,'utf8').replace(/\r\n/g,'\n'):readFileSync(p));
const check=(ok:unknown,why:string)=>{if(!ok)throw new Error('C2A: '+why);};
const slug=(s:string)=>s.toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const common={schemaVersion:1,phase:'11A.5-C2A',baseline:C2A_BASELINE,sourcePolicyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',
  reviewDate:'2026-10-02',runtimeModified:false,prototypePromoted:false,runtimeImplementationAuthorized:false};
const totals={heroGroups:18,heroCards:36,levelProfileCards:37,skillPhysicalCards:126,physicalObjects:199,
  additionalSkillStateRecords:252,skillStateRecordsIncludingBase:378,logicalSkillIdentities:126,logicalSkillLevelForms:378};
const frozenInputs=['complete-edition-content-coverage.json','complete-edition-raw-inventory.json','rule-source-policy.json',
  'c1c19-hero-caused-condition-source-contract.json','c1c19-hero-skill-condition-source-gap.json',
  'c1c31-necromancer-required-hero-combat-coverage.json','c1c31r-hero-dodge-final-table.json',
  'c1c38r1-source-intake-decision.json'];
const prototypeFiles=['src/data/heroes.ts','src/data/skills.ts','src/data/hero-level-profiles.ts'];

export function buildC2AArtifacts():Record<string,any>{
  const raw=read(root+'complete-edition-raw-inventory.json');
  const predecessor=read(root+'complete-edition-content-coverage.json');
  const nav=read(assets+'print-navigation.json');
  const matches=read(assets+'transport-match-navigation.json').matches;
  const backMatches=read(assets+'transport-back-navigation.json').records;
  const observations=read(assets+'reviewed-transport-bindings.json').observations;
  const receipts=read(assets+'transport/manifest.json').records;
  const context=read(assets+'context-sources.json');
  const lockedArchive=read(root+'source-assets/c1c38r1/repository-source-inventory.json').archiveFiles;
  for(const s of nav.sources)check(lockedArchive.some((f:any)=>f.path===s.originalLocation&&f.sha256===s.sha256),'locked official print intake '+s.sourceId);
  for(const s of context)check(lockedArchive.some((f:any)=>f.path===s.originalLocation&&f.sha256===s.originalSha256),'hash-bound original context '+s.sourceId);
  const sourceList=nav.sources.map((s:any)=>({sourceId:s.sourceId,publisher:'Mythic Games',documentTitle:s.sourceId,
    sourceType:'OFFICIAL_PRODUCTION_PRINT',originalLocation:s.originalLocation,originalSha256:s.sha256,
    path:s.path,sha256:s.sha256,pageCount:s.pageCount,pageSheetCardRange:[1,s.pageCount],
    heroesSupported:s.sourceId.includes('MUSKETEER')?['musketeer']:printOrder.filter(h=>h!=='musketeer'),
    authority:'OFFICIAL_PRINTED_COMPONENT',authorityBasis:'Publisher print content, corroborated by official box copyright and component list; storage location is only a locator.'}));
  sourceList.push(...context.map((s:any)=>({...s,publisher:'Mythic Games',documentTitle:s.sourceId,sourceType:s.sourceId.includes('RULES')?'OFFICIAL_RULEBOOK_EXTRACT':'OFFICIAL_BOX_PRINT_EXTRACT',
    pageCount:1,pageSheetCardRange:[1,1],heroesSupported:s.sourceId.includes('WARRENS')?['leper','antiquarian']:s.sourceId.includes('COVE')?['man-at-arms','flagellant']:s.sourceId.includes('WEALD')?['hound-master','shieldbreaker']:printOrder.filter(h=>h!=='musketeer'),authority:s.sourceId.includes('RULES')?'OFFICIAL_RULEBOOK':'OFFICIAL_PRINTED_COMPONENT'})));
  const source=(hero:string,kind:string,side='FRONT')=>sourceList.find((s:any)=>s.sourceId.includes(hero==='musketeer'?'MUSKETEER_CARDS':'DARKEST_HEROES_CARDS')&&s.sourceId.includes(kind+'_'+side));
  const ref=(s:any,page:number)=>({sourceId:s.sourceId,path:s.path,sha256:s.sha256,page,authority:s.authority});
  const contextRef=(id:string)=>ref(sourceList.find((s:any)=>s.sourceId===id),1);
  const provenanceReview=[...nav.sources.map((s:any)=>({sourceId:s.sourceId,sha256:s.sha256,
    visualReview:'PASS',
    scope:'Identity, card type, printed level and visible form restrictions only; numerical effects not normalized.'})),
    ...context.map((s:any)=>({sourceId:s.sourceId,sha256:s.sha256,visualReview:'PASS',scope:'Publisher identity, content-set labels and physical print count.'}))];
  const physical:any[]=[];const skills:any[]=[];const forms:any[]=[];const heroes:any[]=[];const gaps:any[]=[];const printedObjects:any[]=[];
  const groupCards=raw.objects.filter((o:any)=>o.isCard&&o.ttsPath.startsWith('/ObjectStates/49/ContainedObjects/'));
  const transportRef=(o:any)=>({guid:o.sourceObjectGuid,path:o.ttsPath,cardId:o.cardId,deckId:o.deckId,cardIndex:o.cardIndex,
    customDeckId:o.customDeckId,numWidth:o.numWidth,numHeight:o.numHeight,uniqueBack:o.uniqueBack,
    frontImage:o.faceUrl,backImage:o.backUrl,frontSheetSha256:receipts.find((r:any)=>r.url===o.faceUrl)?.sha256??null,
    backSheetSha256:receipts.find((r:any)=>r.url===o.backUrl)?.sha256??null,authority:'DISCOVERY_TRANSPORT_ONLY'});
  for(const heroId of printOrder){
    const group=predecessor.heroGroups.find((g:any)=>slug(g.name)===heroId);check(group,'discovered Hero '+heroId);
    const objects=groupCards.filter((o:any)=>o.ttsPath.startsWith(group.ttsPath+'/'));
    const owners=objects.filter((o:any)=>!o.isState);
    const skillOwners=owners.filter((o:any)=>o.runtimeCategory==='Hero Skills');
    const skillFront=source(heroId,'SKILLS');const skillBack=source(heroId,'SKILLS','BACK');
    const skillStart=heroId==='musketeer'?1:printOrder.indexOf(heroId)*21+1;
    const profileStart=heroId==='musketeer'?1:printOrder.indexOf(heroId)*2+1+(printOrder.indexOf(heroId)>10?1:0);
    const profileCount=heroId==='abomination'?3:2;
    const profileFront=source(heroId,'Hero_STAT');const profileBack=source(heroId,'Hero_STAT','BACK');
    const perHeroSkills:any[]=[];const perHeroPhysical:any[]=[];const perHeroForms:any[]=[];
    for(const owner of owners){
      const category=owner.runtimeCategory==='Heroes'?'HERO_PVP_CARD':owner.runtimeCategory==='Hero Skills'?'SKILL_TRANSPORT_OWNER':'LEVEL_PROFILE_CARD';
      const match=matches.find((m:any)=>m.transportPath===owner.ttsPath);
      const back=backMatches.find((m:any)=>m.transportPath===owner.ttsPath);
      const observation=observations.find((o:any)=>o.transportPath===owner.ttsPath);
      const entry:any={physicalId:`c2a-${heroId}-${owner.sourceObjectGuid}`,heroId,category,
        transportGuid:owner.sourceObjectGuid,transportPath:owner.ttsPath,transport:transportRef(owner),
        frontHash:match?.frontCropHash??null,frontImage:match?.frontCropPath??null,backHash:back?.backCropHash??null,backImage:back?.backCropPath??null,
        officialSourceId:null,officialSourceRefs:[],logicalIdentity:null,duplicateOf:null,
        status:'SOURCE_UNRESOLVED',visualReview:'BLOCKED'};
      if(category==='HERO_PVP_CARD'){
        // All 36 matched pages were directly inspected; match score itself is not evidence.
        const s=source(heroId,'Hero_PVP');check(match?.match,'PvP image unavailable '+heroId);
        check(observation?.frontVisualReview==='PASS'&&observation.frontVisualHash===match.frontCropHash&&observation.sourceId===s.sourceId,'reviewed PvP binding');
        entry.officialSourceId=s.sourceId;entry.officialSourceRefs=[ref(s,observation.page)];entry.logicalIdentity=`${heroId}:pvp-board:${observation.page}`;
        entry.printedName=printedHeroNames[heroId];entry.cardSubtype='PVP_HERO_BOARD';entry.printedLevel=null;
        entry.stanceInformation='Visible stance icons; not transcribed as gameplay';entry.statInformation='Visible printed stats; not normalized';
        entry.status='OFFICIAL_SOURCE';entry.visualReview='PASS';entry.backSourceStatus='OFFICIAL_SOURCE';
        entry.officialBackSource=ref(source(heroId,'Hero_PVP','BACK'),observation.page);
      }else if(category==='LEVEL_PROFILE_CARD'){
        entry.cardSubtype='CAMPAIGN_HERO_PROFILE';entry.printedName=null;entry.printedLevel=null;
        entry.officialPrintCandidates=Array.from({length:profileCount},(_,i)=>({front:ref(profileFront,profileStart+i),back:ref(profileBack,profileStart+i)}));
        const gap={gapId:`profile-${owner.sourceObjectGuid}`,heroId,physicalId:entry.physicalId,category:'STATE_RELATION_UNRESOLVED',scope:'PROFILE_TRANSPORT_CORRELATION',
          status:'SOURCE_UNRESOLVED',affectedFields:['transport image to printed profile identity','front/back physical pairing'],
          detail:'Official Profile PDFs are available and reviewed. Shared transport front/back sheets time out; no CardID-to-print-page inference is allowed.',
          officialSourceCandidates:entry.officialPrintCandidates,transportRefs:[transportRef(owner)]};gaps.push(gap);
      }else{
        check(observation?.frontVisualReview==='PASS'&&observation.frontVisualHash===match.frontCropHash,'reviewed Skill owner binding');
        const printIndex=reviewedSkills[heroId].indexOf(observation.printedName);check(printIndex>=0,'reviewed Skill front name');
        const printedName=reviewedSkills[heroId][printIndex];const skillId=`${heroId}-${slug(printedName)}`;
        entry.officialSourceId=skillFront.sourceId;entry.officialSourceRefs=[ref(skillFront,skillStart+printIndex*3)];
        entry.logicalIdentity=skillId;entry.printedName=printedName;entry.status='OFFICIAL_SOURCE';entry.visualReview='PASS';
        entry.cardSubtype='TTS_VIRTUALIZED_SKILL_FAMILY';entry.physicalPrintMultiplicity=3;entry.backSourceStatus=back?.backCropHash?'OFFICIAL_SOURCE':'SOURCE_UNRESOLVED';
        entry.officialBackSourceCandidate=ref(skillBack,skillStart+printIndex*3);
        const states=[owner,...objects.filter((o:any)=>o.isState&&o.stateOwnerPath===owner.ttsPath)];check(states.length===3,'three transport forms '+skillId);
        const levelForms:any[]=[];
        // Roman markers were visually read on every crop. State keys are saved only as transport locators.
        for(const state of states){
          const observed=observations.find((o:any)=>o.transportPath===state.ttsPath);check(observed?.frontVisualReview==='PASS','explicit reviewed state observation');
          const marker=observed.printedLevelMarker;const level=['I','II','III'].indexOf(marker)+1;check(level>0,'observed Roman marker');
          const m=matches.find((m:any)=>m.transportPath===state.ttsPath);check(m?.frontCropHash&&m.frontCropHash===observed.frontVisualHash,'review crop '+state.ttsPath);
          check(observed.heroId===heroId&&observed.printedName===printedName&&observed.sourceId===skillFront.sourceId&&observed.page===skillStart+printIndex*3+level-1,'printed page relation');
          const b=backMatches.find((m:any)=>m.transportPath===state.ttsPath);
          const form={skillId,heroId,level,stateId:state.isState?state.ttsPath.split('/').pop():'base',
            stateGuid:state.sourceObjectGuid,statePath:state.ttsPath,physicalCardId:entry.physicalId,
            visualHash:m.frontCropHash,visualImage:m.frontCropPath,printedLevelMarker:marker,
            printedName,officialSource:ref(skillFront,observed.page),
            officialBackCandidate:ref(skillBack,observed.page),
            officialBackVisualReview:'PASS',transportBackBindingStatus:b?.backCropHash?'OFFICIAL_SOURCE':'SOURCE_UNRESOLVED',
            backVisualHash:b?.backCropHash??null,backVisualImage:b?.backCropPath??null,
            printedBackName:heroId==='abomination'&&printedName==='Transform to Beast'?'Transform to Human':printedName,
            transport:transportRef(state),visualReview:'PASS',status:'OFFICIAL_SOURCE',
            mappingBasis:'Direct visual Roman marker and Skill name match against official print page; never state index authority.'};
          forms.push(form);perHeroForms.push(form);levelForms.push({level,printedLevelMarker:marker,statePath:state.ttsPath,officialSource:form.officialSource});
          if(!b?.backCropHash)gaps.push({gapId:`skill-back-${state.sourceObjectGuid}`,heroId,physicalId:entry.physicalId,skillId,statePath:state.ttsPath,
            category:'STATE_RELATION_UNRESOLVED',status:'SOURCE_UNRESOLVED',affectedFields:['transport back to official print back pairing'],
            detail:'Official back PDF reviewed; transport back atlas unavailable. Front identity remains bound; back pairing is not inferred.',officialSourceCandidates:[form.officialBackCandidate],transportRefs:[transportRef(state)]});
        }
        const skill={skillId,heroId,printedName,physicalCardId:entry.physicalId,transportObjectId:owner.sourceObjectGuid,
          levelForms,officialSourceStatus:'OFFICIAL_SOURCE',visualReview:'PASS',gameplayTranscribed:false,
          acceptedEvidenceRefs:heroId==='occultist'&&['Sacrificial Stab','Abyssal Artillery'].includes(printedName)?['c1c38r1-official-source-intake-manifest.json#CORE-ELDRITCH']:[],
          priorConditionRefs:read(root+'c1c19-hero-skill-condition-source-gap.json').gaps.filter((g:any)=>g.skillId===skillId).map((g:any)=>({artifact:'c1c19-hero-skill-condition-source-gap.json',skillId:g.skillId,status:g.status,sourceReference:g.sourceReference,historicalClassificationPreserved:true}))};
        skills.push(skill);perHeroSkills.push(skill);
      }
      physical.push(entry);perHeroPhysical.push(entry);
    }
    const contentSource=heroId==='musketeer'?'DD_EN_THE_DARKEST_HEROES_BOX':['leper','antiquarian'].includes(heroId)?'DD_EN_WARRENS_BOX':['flagellant','man-at-arms'].includes(heroId)?'DD_EN_COVE_BOX':['shieldbreaker','hound-master'].includes(heroId)?'DD_EN_WEALD_BOX':'DD_EN_COREBOX_RULES';
    const hero:any={...common,identity:{heroClassId:heroId,printedName:printedHeroNames[heroId],discoveryDisplayName:group.name,sourceGuid:group.sourceGuid,ttsPath:group.ttsPath,
      status:'OFFICIAL_SOURCE',sourceReferences:[ref(profileFront,profileStart)],
      contentSet:{id:heroId==='musketeer'?'musketeer-promo':contentSource.includes('WARRENS')?'warrens':contentSource.includes('COVE')?'cove':contentSource.includes('WEALD')?'weald':'core',
        kind:heroId==='musketeer'?'DLC_ADD_ON':contentSource.includes('RULES')?'CORE':'EXPANSION',officialSource:contextRef(contentSource),productionEligibilityDecided:false},
      artEdition:heroId==='musketeer'?'MUSKETEER_PROMO':'THE_DARKEST_HEROES_ALTERNATE_ART',artEditionSource:contextRef('DD_EN_THE_DARKEST_HEROES_BOX')},
      transport:{authority:'DISCOVERY_TRANSPORT_ONLY',sourceGuid:group.sourceGuid,ttsPath:group.ttsPath,transportRefs:objects.map(transportRef)},
      heroCards:perHeroPhysical.filter(o=>o.category==='HERO_PVP_CARD'),levelProfileCards:perHeroPhysical.filter(o=>o.category==='LEVEL_PROFILE_CARD'),
      skills:perHeroSkills,skillStates:perHeroForms,
      officialSources:[...new Set(perHeroForms.map(o=>o.officialSource.sourceId).concat([profileFront.sourceId,profileBack.sourceId]))],
      officialProfileInventory:Array.from({length:profileCount},(_,i)=>({printSlot:`${heroId}:profile:${i}`,printedName:printedHeroNames[heroId],front:ref(profileFront,profileStart+i),back:ref(profileBack,profileStart+i),
        frontLevelMarker:heroId==='abomination'?['I','II','III'][i]:i===0?'I':'III',backLevelMarker:heroId==='abomination'?['I','II','III'][i]:i===0?'II':null,
        frontRole:heroId==='abomination'?'HUMAN_FORM':'HERO_PROFILE',backRole:heroId==='abomination'?'BEAST_FORM':i===0?'HERO_PROFILE':'ILLUSTRATED_CARD_BACK',
        visualReview:'PASS',transportBindingStatus:'SOURCE_UNRESOLVED'})),
      existingPrototypeLinks:{hero:HEROES.find(h=>h.id===heroId)?.id??null,skills:SKILLS.filter(s=>s.heroId===heroId).map(s=>s.id)},
      duplicateRefs:[],unresolvedRefs:gaps.filter(g=>g.heroId===heroId).map(g=>g.gapId),sourceGaps:gaps.filter(g=>g.heroId===heroId),
      censusStatus:'CENSUS_PARTIAL',counts:{transportOwners:owners.length,heroCards:perHeroPhysical.filter(o=>o.category==='HERO_PVP_CARD').length,levelProfileCards:profileCount,skillOwners:skillOwners.length,skillForms:perHeroForms.length},
      specialInventoryExplanation:heroId==='abomination'?'Three distinct official Profile print slots: Human I / Beast I, Human II / Beast II, Human III / Beast III. No card discarded; transport GUID-to-page binding remains unresolved.':null};
    heroes.push(hero);
    for(const p of hero.heroCards)printedObjects.push({printSlotId:`${heroId}:pvp:${p.officialSourceRefs[0].page}`,heroId,category:'HERO_PVP_CARD',front:p.officialSourceRefs[0],back:ref(source(heroId,'Hero_PVP','BACK'),p.officialSourceRefs[0].page),backVisualReview:'PASS'});
    for(const p of hero.officialProfileInventory)printedObjects.push({...p,printSlotId:p.printSlot,heroId,category:'LEVEL_PROFILE_CARD'});
    for(const f of perHeroForms)printedObjects.push({printSlotId:`${f.skillId}:${f.printedLevelMarker}`,heroId,category:'SKILL_PRINT_CARD',skillId:f.skillId,level:f.level,front:f.officialSource,back:f.officialBackCandidate,printedBackName:f.printedBackName,backVisualReview:'PASS'});
  }
  const collisions=[...new Set(groupCards.map((o:any)=>o.customDeckId))].map(id=>({deckId:id,
    declarations:[...new Set(groupCards.filter((o:any)=>o.customDeckId===id).map((o:any)=>`${o.faceUrl}|${o.backUrl}`))],
    objectRefs:groupCards.filter((o:any)=>o.customDeckId===id).map((o:any)=>({guid:o.sourceObjectGuid,path:o.ttsPath,cardIndex:o.cardIndex}))})).filter(c=>c.declarations.length>1);
  const prototypes={heroes:HEROES.map((h,index)=>({existingId:h.id,existingDisplayName:h.name,officialHeroId:h.id,officialPrintedName:printedHeroNames[h.id],sourceAvailability:'OFFICIAL_SOURCE',identityClassification:'SOURCE_MATCHED_IDENTITY',definitionClassification:index<4?'PROTOTYPE_ONLY':'PLACEHOLDER',numericalComparisonPerformed:false})),
    skills:SKILLS.map(s=>{const official=skills.filter(k=>k.heroId===s.heroId);const exact=official.find(k=>slug(k.printedName)===slug(s.name));
      const partial=official.find(k=>slug(k.printedName).includes(slug(s.name))||slug(s.name).includes(slug(k.printedName)));
      const placeholder=['leper','occultist','plague-doctor','grave-robber'].includes(s.heroId);
      return {existingId:s.id,existingName:s.name,heroId:s.heroId,officialSkillId:exact?.skillId??partial?.skillId??null,officialPrintedName:exact?.printedName??partial?.printedName??null,
        nameClassification:exact?'EXACT_NAME_MATCH':partial?'PARTIAL_MATCH':placeholder?'PROTOTYPE_ONLY':'MISSING_FROM_OFFICIAL_SET',
        identityClassification:exact?'SOURCE_MATCHED_IDENTITY':partial?'SOURCE_MISMATCH':placeholder?'PLACEHOLDER':'PROTOTYPE_ONLY',
        valueClassification:'PROTOTYPE_ONLY',numericalComparisonPerformed:false,printedIdentityDoesNotValidateRuntimeValues:true};}),
    profiles:Object.keys(HERO_LEVEL_PROFILES).map(heroId=>({heroId,classification:'PROTOTYPE_ONLY',levelIIandIII:'HAND_AUTHORED_PROTOTYPE',sourceAuthority:false})),
    skillLevelBonus:{symbol:'SKILL_LEVEL_BONUS',classification:'PROTOTYPE_ONLY',futureProductionAuthorityAllowed:false}};
  const coverage=heroes.map(h=>({heroId:h.identity.heroClassId,physicalObjectsExpected:h.counts.transportOwners,physicalObjectsAccounted:h.counts.transportOwners,
    physicalObjectsBound:h.heroCards.length+h.skills.length,skillsExpected:7,skillsBound:h.skills.length,skillFormsExpected:21,skillFormsBound:h.skillStates.length,
    officialSourcesBound:h.officialSources.length,sourceGaps:h.sourceGaps.length,censusStatus:h.censusStatus,normalizedHeroSkills:0,productionSourceBackedHeroSkills:0}));
  const acceptance={...common,heroGroupsExpected:18,heroGroupsBound:18,heroGroupsComplete:0,
    physicalObjectsExpected:199,physicalObjectsAccounted:physical.length,physicalObjectsBound:physical.filter(p=>p.status==='OFFICIAL_SOURCE').length,
    heroCardsExpected:36,heroCardsBound:36,levelProfileCardsExpected:37,levelProfileCardsAccounted:37,levelProfileCardsBound:0,
    skillPhysicalExpected:126,skillPhysicalBound:126,skillFormsExpected:378,skillFormsBound:378,
    officialPrintedCardSlots:printedObjects.length,sourcePolicyCompliant:true,identityCensusComplete:false,sourceProvenanceComplete:false,
    runtimeProductionReady:false,C2BAllowed:false,C2BSourceCompleteSubsets:[],outcome:'HERO_SOURCE_CENSUS_PARTIAL',
    countBasis:'199 counts TTS owners only. Official alternate-art print has 34 PvP + 35 Profile + 357 Skill cards; Musketeer print adds 2 + 2 + 21 = 451 print slots. Seven virtual Skill owners are not seven retail printed cards.',
    physicalBindingScope:'Front identity only; full pairing counters are separate.',
    fullFrontBackOwnersBound:physical.filter(p=>p.status==='OFFICIAL_SOURCE'&&p.backSourceStatus==='OFFICIAL_SOURCE').length,
    skillFormBacksBound:forms.filter(f=>f.transportBackBindingStatus==='OFFICIAL_SOURCE').length,
    blockers:['37 Profile transport front/back image bindings unavailable','102 Skill form transport back image bindings unavailable; official back PDFs reviewed'],
    fullSkillLiteralClosureAuthorized:false};
  const outputs:Record<string,any>={
    'hero-official-source-manifest':{...common,sources:sourceList,visualReviews:provenanceReview,transportManifest:assets+'transport/manifest.json',transportIsAuthority:false,
      acceptedEvidenceReuse:frozenInputs.slice(3).map(f=>({path:root+f,sha256:hash(root+f),historicalClassificationPreserved:true})),
      reusedOfficialSkillEvidence:[{path:root+'c1c38r1-official-source-intake-manifest.json',sha256:hash(root+'c1c38r1-official-source-intake-manifest.json'),sourceId:'CORE-ELDRITCH',heroId:'occultist',skills:['Sacrificial Stab','Abyssal Artillery']}],
      existingRulingReview:{ruleSetVersion:'C1C31-DIGITAL-DEFAULT-v2',classification:'PROJECT_RULING_PRESERVED',newOfficialProfileSources:sourceList.filter((s:any)=>s.sourceId.includes('Hero_STAT')).map((s:any)=>s.sourceId),potentialSupersession:'C2C_REBASELINE_REVIEW_REQUIRED',runtimePrecedenceChanged:false}},
    'hero-physical-census':{...common,countBasis:'TTS_TRANSPORT_OWNERS_NOT_RETAIL_CARD_COUNTS',totals,objects:physical,officialPrintedObjects:printedObjects,
      officialPrintTotals:{heroCards:36,levelProfileCards:37,skillCards:378,cardSlots:451},delta:{skillCards:252,total:252,reason:'Official box list and distinct I/II/III front/back print pages show separate printed Skill cards. TTS States virtualize these cards; States do not add TTS owners.'},
      duplicatePolicy:'GUID + container path + card index + scoped image hash; DeckID is never identity.',
      guidDuplicates:[...new Set(physical.map(o=>o.transportGuid))].map(guid=>({guid,paths:physical.filter(o=>o.transportGuid===guid).map(o=>o.transportPath)})).filter(d=>d.paths.length>1),customDeckCollisions:collisions,
      evidence:[contextRef('DD_EN_THE_DARKEST_HEROES_BOX')],retailSupplyAcrossAllAlternateCopiesDecided:false},
    'hero-logical-identities':{...common,heroes:heroes.map(h=>h.identity)},
    'hero-skill-identities':{...common,skills},
    'hero-skill-level-form-map':{...common,forms,additionalStateRecords:252,baseRecords:126,stateIndexIsLevelAuthority:false},
    'hero-content-coverage':{...common,totals,heroes:coverage,productionSourceBackedHeroSkills:0,normalizedHeroSkills:0},
    'prototype-hero-data-comparison':{...common,...prototypes,runtimeMigrationPerformed:false},
    'hero-future-schema-gap':{...common,audits:specialStructures.map(s=>({...s,officialSources:skills.find(k=>k.heroId===s.heroId&&k.printedName===s.skillName)?.levelForms.map((f:any)=>f.officialSource),mechanicsInferred:false})),runtimeSchemaChanged:false},
    'hero-source-gap-register':{...common,gaps,additionalReviewGaps:[],counts:{profileObjects:37,skillFormBacks:102,total:139}},
    'hero-source-conflicts':{...common,conflicts:[],scope:'Census identity and printed markers only; C2B numerical comparisons not performed.',accountingDifference:'PRINT_VS_TRANSPORT_COUNT_BASIS_DIFFERENCE_NOT_A_RULE_CONFLICT'},
    'hero-source-census-acceptance':acceptance,
    'next-workstream-decision':{...common,outcome:acceptance.outcome,C2BAllowed:false,selectedWorkstream:'C2A_PROFILE_TRANSPORT_AND_BACK_BINDING_CLOSURE',
      ThingStatus:'SOURCE_ACQUISITION_HOLD',ThingRuntimeAuthorized:false,sourceCompleteHeroSubsets:[],nextAfterAccepted:'11A.5-C2B — Hero Skill & Level Literal Closure',laterSequence:['C2C','C2D','C2E','Common + Ruins Monsters','Ruins Room / Tile / Dungeon production data']},
    'missing-hero-official-source-request':{...common,officialFrontPrintDocumentsMissing:0,groups:[
      {id:'PROFILE-TRANSPORT-CORRELATION',heroes:printOrder,physicalObjects:37,required:'Recover hash-bound shared Profile front/back atlas or directly verify all GUID/CardID-to-official-profile front/back pairs.',officialPrintsAlreadyAvailable:true,missingAuthorityIsNotReplacedByTransport:true},
      {id:'SKILL-BACK-TRANSPORT-CORRELATION',heroes:[...new Set(gaps.filter(g=>g.skillId).map(g=>g.heroId))],levelForms:102,required:'Recover the two unavailable hash-bound transport back atlases and directly correlate 102 backs to already reviewed official print pages.',officialPrintsAlreadyAvailable:true}]},
    'historical-c1c38r1-freeze':{...common,frozenPhase:'C1C38R1',commit:C2A_BASELINE,outcome:'THING_OFFICIAL_SOURCE_INTAKE_PARTIAL',gateAPassed:false,ThingRuntimeAuthorized:false,ThingStatus:'SOURCE_ACQUISITION_HOLD'},
    'input-locks':{...common,textHashNormalization:'LF; no other text normalization',files:[...frozenInputs.map(f=>root+f),...prototypeFiles,
      ...['print-navigation.json','context-sources.json','transport-match-navigation.json','transport-back-navigation.json','reviewed-transport-bindings.json','transport/manifest.json'].map(f=>assets+f)].map(path=>({path,sha256:hash(path)})),
      reviewCodeSha256:hash('scripts/audit/c2a-reviewed-identities.ts'),reviewAtlases:printOrder.flatMap(heroId=>['skills-review','skills-back-review','transport-review','transport-back-review'].map(kind=>({heroId,path:assets+heroId+'-'+kind+'.png',sha256:hash(assets+heroId+'-'+kind+'.png')})))},
  };
  for(const hero of heroes)outputs['heroes/'+hero.identity.heroClassId]=hero;
  return outputs;
}

export function validateC2AArtifacts(a:Record<string,any>){
  const expected=printOrder.slice().sort();const ids=a['hero-logical-identities'].heroes.map((h:any)=>h.heroClassId).sort();
  check(JSON.stringify(ids)===JSON.stringify(expected),'exact 18 Hero group set');
  const objects=a['hero-physical-census'].objects, skills=a['hero-skill-identities'].skills, forms=a['hero-skill-level-form-map'].forms;
  check(objects.length===199&&new Set(objects.map((o:any)=>o.transportPath)).size===199,'199 distinct transport owners');
  check(objects.filter((o:any)=>o.category==='HERO_PVP_CARD').length===36,'36 PvP owners');
  check(objects.filter((o:any)=>o.category==='LEVEL_PROFILE_CARD').length===37,'37 Profile owners');
  check(objects.filter((o:any)=>o.category==='SKILL_TRANSPORT_OWNER').length===126,'126 Skill owners');
  check(skills.length===126&&new Set(skills.map((s:any)=>s.skillId)).size===126,'126 logical Skills');
  check(forms.length===378&&new Set(forms.map((f:any)=>f.statePath)).size===378,'378 distinct form records');
  for(const heroId of expected){
    const h=a['heroes/'+heroId];check(h,'per-Hero contract '+heroId);
    check(h.skills.length===7&&h.skillStates.length===21,'7 identities / 21 forms '+heroId);
    check(h.levelProfileCards.length===(heroId==='abomination'?3:2),'Profile special accounting '+heroId);
    check(h.identity.printedName===printedHeroNames[heroId]&&h.identity.status==='OFFICIAL_SOURCE','source-bound printed Hero name');
    check(h.censusStatus==='CENSUS_PARTIAL'&&h.sourceGaps.filter((g:any)=>g.scope==='PROFILE_TRANSPORT_CORRELATION').length===h.levelProfileCards.length,'partial Profile status');
  }
  const sources=a['hero-official-source-manifest'].sources;
  const validRef=(r:any)=>sources.some((s:any)=>s.sourceId===r?.sourceId&&s.path===r.path&&s.sha256===r.sha256&&s.authority===r.authority&&r.page>=1&&r.page<=s.pageCount);
  for(const skill of skills){
    check(skill.skillId===skill.heroId+'-'+slug(skill.printedName)&&reviewedSkills[skill.heroId].includes(skill.printedName),'printed Skill identity');
    check(objects.some((o:any)=>o.physicalId===skill.physicalCardId&&o.logicalIdentity===skill.skillId),'Skill physical binding');
    const group=forms.filter((f:any)=>f.skillId===skill.skillId);
    check(JSON.stringify(group.map((f:any)=>f.printedLevelMarker).sort())===JSON.stringify(['I','II','III']),'printed three Level markers');
    for(const f of group){check(f.visualReview==='PASS'&&validRef(f.officialSource)&&f.visualHash===hash(f.visualImage),'hash-bound visually reviewed level source');
      check(f.level===['I','II','III'].indexOf(f.printedLevelMarker)+1&&f.printedName===skill.printedName,'Roman marker mapping');
      check(f.status==='OFFICIAL_SOURCE'&&f.mappingBasis.startsWith('Direct visual'),'not state-index authority');
    }
    check(skill.gameplayTranscribed===false,'census does not transcribe gameplay');
  }
  check(a['hero-physical-census'].officialPrintedObjects.length===451,'451 distinct official print slots');
  check(a['hero-physical-census'].countBasis==='TTS_TRANSPORT_OWNERS_NOT_RETAIL_CARD_COUNTS','physical count basis');
  check(a['hero-physical-census'].delta.total===252,'official print count delta explained');
  check(a['prototype-hero-data-comparison'].heroes.length===8&&a['prototype-hero-data-comparison'].skills.length===28&&a['prototype-hero-data-comparison'].profiles.length===8,'all prototypes compared');
  check(a['prototype-hero-data-comparison'].skillLevelBonus.futureProductionAuthorityAllowed===false,'generic bonus cannot be source');
  for(const s of sources){check(['OFFICIAL_PRINTED_COMPONENT','OFFICIAL_RULEBOOK'].includes(s.authority),'official authority only');check(hash(s.path)===s.sha256,'official source hash '+s.path);}
  for(const lock of a['input-locks'].files)check(hash(lock.path)===lock.sha256,'immutable input '+lock.path);
  const accepted=a['hero-source-census-acceptance'];
  check(accepted.outcome==='HERO_SOURCE_CENSUS_PARTIAL'&&!accepted.identityCensusComplete&&!accepted.sourceProvenanceComplete&&!accepted.C2BAllowed,'unresolved evidence cannot accept census');
  check(accepted.physicalObjectsBound===162&&accepted.levelProfileCardsBound===0&&accepted.skillFormsBound===378,'bound/accounted counters');
  check(a['hero-content-coverage'].productionSourceBackedHeroSkills===0&&a['hero-content-coverage'].normalizedHeroSkills===0,'production counters frozen');
  for(const value of Object.values(a))check(value.runtimeModified===false&&value.prototypePromoted===false&&value.runtimeImplementationAuthorized===false,'no runtime promotion');
  check(a['next-workstream-decision'].ThingStatus==='SOURCE_ACQUISITION_HOLD'&&!a['next-workstream-decision'].ThingRuntimeAuthorized,'Thing remains frozen');
  check(a['hero-skill-level-form-map'].stateIndexIsLevelAuthority===false,'state keys are not printed authority');
  check(a['hero-source-gap-register'].gaps.length===139,'all unresolved bindings recorded');
  for(const f of forms){
    check(validRef(f.officialBackCandidate)&&f.officialBackVisualReview==='PASS','official back review');
    if(f.transportBackBindingStatus==='OFFICIAL_SOURCE')check(f.backVisualHash===hash(f.backVisualImage),'reviewed transport back hash');
    else check(f.transportBackBindingStatus==='SOURCE_UNRESOLVED'&&f.backVisualHash===null,'missing back cannot be promoted');
  }
  for(const r of a['input-locks'].reviewAtlases)check(hash(r.path)===r.sha256,'review atlas lock');
  // Reject unauthorized fields, numerical values, evidence substitutions and inconsistent
  // per-Hero copies even when an attacker preserves every aggregate count.
  const expectedArtifacts=buildC2AArtifacts();
  check(JSON.stringify(Object.keys(a).sort())===JSON.stringify(Object.keys(expectedArtifacts).sort()),'artifact set');
  for(const [key,value] of Object.entries(expectedArtifacts))check(JSON.stringify(a[key])===JSON.stringify(value),'source-derived contract '+key);
}

function artifactPath(key:string){return key.startsWith('heroes/')?root+'heroes/c2a/'+key.slice(7)+'.json':root+'c2a-'+key+'.json';}
export function verifyC2A(){
  const built=buildC2AArtifacts();validateC2AArtifacts(built);
  const git=(args:string[])=>execFileSync('git',args,{maxBuffer:128*1024*1024});
  git(['merge-base','--is-ancestor',C2A_BASELINE,'HEAD']);
  const tree=git(['ls-tree','-r',C2A_BASELINE]).toString().trim().split(/\r?\n/).map(line=>{
    const [metadata,path]=line.split('\t');return {path,blob:metadata.split(' ')[2]};
  });
  const frozen=tree.filter(e=>e.path.startsWith('src/')||e.path.startsWith(root));
  // Use Git's existing clean filters: Windows checkout CRLF is not evidence drift.
  // The explicit input locks above additionally pin the reviewed checkout bytes.
  const currentBlobs=execFileSync('git',['hash-object','--stdin-paths'],{input:frozen.map(e=>e.path).join('\n')+'\n',maxBuffer:128*1024*1024}).toString().trim().split(/\r?\n/);
  for(const [i,{path,blob}] of frozen.entries()){
    if(currentBlobs[i]===blob)continue;
    const baseline=git(['show',`${C2A_BASELINE}:${path}`]);
    check(path.startsWith('src/')&&baseline.toString('utf8').replace(/\r\n/g,'\n')===readFileSync(path,'utf8').replace(/\r\n/g,'\n'),'accepted runtime/evidence unchanged '+path);
  }
  for(const [key,value] of Object.entries(built)){check(existsSync(artifactPath(key)),'artifact exists '+key);check(JSON.stringify(read(artifactPath(key)))===JSON.stringify(value),'deterministic artifact '+key);}
  // Candidate audit data cannot be imported by live runtime.
  const runtime=git(['ls-tree','-r','--name-only',C2A_BASELINE,'src']).toString().trim().split(/\r?\n/).filter(p=>/\.[tj]sx?$/.test(p)&&!p.includes('.test.'));
  for(const path of runtime)check(!/c2a-|heroes\/c2a/.test(readFileSync(path,'utf8')),'no runtime candidate consumer');
  check(readFileSync('.github/workflows/release-gate.yml','utf8').includes('npm run verify:complete-edition-c2a'),'Production release gate includes C2A');
  console.log('C2A PASS: 18 groups; 199 transport owners; 126 Skills; 378 printed Level identities; 451 official print slots. HERO_SOURCE_CENSUS_PARTIAL; runtime unauthorized.');
}
if(process.argv.includes('--write')){const built=buildC2AArtifacts();validateC2AArtifacts(built);for(const [key,value] of Object.entries(built)){const path=artifactPath(key);mkdirSync(path.slice(0,path.lastIndexOf('/')),{recursive:true});writeFileSync(path,JSON.stringify(value,null,2)+'\n');}console.log('C2A artifacts written');}
if(process.argv.includes('--verify'))verifyC2A();
