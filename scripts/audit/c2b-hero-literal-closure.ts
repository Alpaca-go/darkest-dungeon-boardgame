/** Offline literal closure. Runtime imports occur ONLY in prototypeComparison(). */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {skillReviews,healingNames,transformBackEffects} from './c2b-reviewed-skills';
import {profileReviews,abominationBeastReviews,hamletReviews} from './c2b-reviewed-profiles';
export const C2B_BASELINE='173ca67adf0e9a1fa2af18693c0fc3bc42973217';
const root='docs/data/complete-edition/';
const assets=root+'source-assets/c2b/';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
const check=(ok:unknown,why:string)=>{if(!ok)throw new Error('C2B: '+why);};
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const textHash=(p:string)=>createHash('sha256').update(readFileSync(p,'utf8').replace(/\r\n/g,'\n')).digest('hex');
const common={schemaVersion:1,phase:'11A.5-C2B',baseline:C2B_BASELINE,reviewDate:'2026-10-03',sourcePolicyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',runtimeModified:false,prototypePromoted:false,runtimeImplementationAuthorized:false};
const rule=(page:number,region:string)=>({path:'docs/DD_EN_COREBOX_RULES.pdf',sha256:'9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae',page,region,authority:'OFFICIAL_RULEBOOK'});
const field=(value:any,semanticStatus='OFFICIAL_SOURCE',sourceRefs:any[]=[])=>({printed:value===null?'ABSENT':'PRESENT',literal:value,literalStatus:'LITERAL_COMPLETE',semanticStatus,sourceRefs});
const glyphIds=(text:string)=>[...new Set([...text.matchAll(/\[([a-z0-9-]+)\]/g)].map(m=>m[1]))];
const withoutProvenance=(v:any):any=>Array.isArray(v)?v.map(withoutProvenance):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!['sourceRefs','sourceRef','timingSource','optionalitySource','orderingSourceRefs'].includes(k)).map(([k,x])=>[k,withoutProvenance(x)])):v;
const receipt={visualReview:'PASS',method:'DIRECT_VISUAL_REVIEW',navigationIsAuthority:false,numericAuthority:'OFFICIAL_PRINTED_COMPONENT',levelAuthority:'VISUALLY_VERIFIED_PRINTED_ROMAN_MARKER',derivation:'INDEPENDENT_LEVEL_TRANSCRIPTION',reviewedFront:true,reviewedBack:true};
const stanceNames=['support','ranged','defensive','aggressive'];

function effectDetails(text:string,ref:any){
  const groups=text.split(/; /);let actor='Target';
  const movements:any[]=[];const effects:any[]=[];
  for(const group of groups){
    if(group.startsWith('Self '))actor='Self';if(group.startsWith('Target '))actor='Target';
    for(const m of group.matchAll(/\[shuffle\](Pull|Push) (\d+)(?: or (?:\[shuffle\])?(Pull|Push) (\d+))?/g)){
      movements.push({actor,direction:m[1],distance:field(Number(m[2]),'OFFICIAL_SOURCE',[ref]),alternative:m[3]?{direction:m[3],distance:Number(m[4])}:null,
        printedTiming:field(null),mandatoryOptional:field(m[3]?'or':null),normalizedOptionality:m[3]?'CHOOSE_PRINTED_ALTERNATIVE':actor==='Self'?'MAY_IGNORE_SELF_SHUFFLE':'RESISTANCE_IMMUNITY_APPLY',optionalitySource:rule(21,'Shuffle; self-shuffle may ignore resistance/immunity and decline'),
        orderingStatus:actor==='Self'?'SOURCE_UNRESOLVED':'OFFICIAL_SOURCE',orderingSourceRefs:actor==='Self'?[rule(20,'Self Effects after roll'),rule(22,'example pull before roll')]:[rule(20,'Target Effects after other effects')],literalStatus:'LITERAL_COMPLETE'});
    }
    for(const m of group.matchAll(/(\d+)?\[(bleed|blight|stun|buff|debuff|protection|guard|mark|riposte)\](\d+)?(t)?/g)){
      const context=group.slice(Math.max(0,m.index!-22),m.index!);
      const ifStart=group.indexOf('if ');const ifEnd=ifStart<0?-1:group.indexOf(',',ifStart);
      const inPredicate=ifStart>=0&&m.index!>ifStart&&(ifEnd<0||m.index!<ifEnd);
      const operation=inPredicate?'PREDICATE':/Remove|Ignores|Transfer|vs /.test(context)?(/Transfer/.test(group)?'TRANSFER':/Ignores/.test(group)?'IGNORE':/Remove/.test(group)?'REMOVE':'PREDICATE'):'APPLY';
      effects.push({conditionType:m[2],magnitude:field(m[1]?Number(m[1]):null),duration:field(m[4]?Number(m[3]):null),target:inPredicate&&group.includes('Flagellant has')?'Self':actor,operation,
        applicationTiming:['APPLY','REMOVE'].includes(operation)?actor==='Self'?'AFTER_ROLL_BEFORE_OTHER_EFFECTS':'AFTER_OTHER_EFFECTS_IF_HIT':'SOURCE_UNRESOLVED',timingSource:rule(20,'Self and Target Effects; modifier / transfer phase not defined here'),
        conditionalTrigger:field(/if |vs |Transfer/.test(group)?group:null,/Transfer/.test(group)?'SOURCE_UNRESOLVED':'OFFICIAL_SOURCE',[ref]),
        predicateConnective:inPredicate&&group.includes('[bleed][blight]')?field(null,'SOURCE_UNRESOLVED',[ref]):field(null),printedClause:group,sourceRefs:[ref],literalStatus:'LITERAL_COMPLETE',semanticStatus:['TRANSFER','PREDICATE','IGNORE'].includes(operation)?'SOURCE_UNRESOLVED':'OFFICIAL_SOURCE'});
    }
  }
  return {movements,conditions:effects};
}

function skillFace(n:any,side:'front'|'back',numeric:string,target:string,effects:string,illustrated=false){
  const [crit,critical,accuracy,ordinary]=numeric.split(' ');const [stance,range,targetIcons]=target.split(';');
  const heal=healingNames.includes(side==='front'?n.printedName:n.printedBackName);
  const number=(s:string)=>s==='-'?null:Number(s);
  const ref=n[side].source;
  const numericFields={crit:field(number(crit),'OFFICIAL_SOURCE',[ref]),critDamage:field(heal?null:number(critical),'OFFICIAL_SOURCE',[ref]),critHeal:field(heal?number(critical):null,'OFFICIAL_SOURCE',[ref]),accuracy:field(number(accuracy),'OFFICIAL_SOURCE',[ref]),damage:field(heal?null:number(ordinary),'OFFICIAL_SOURCE',[ref]),heal:field(heal?number(ordinary):null,'OFFICIAL_SOURCE',[ref]),resourceCosts:field(null)};
  const targetGroups=[...targetIcons.matchAll(/([MH])(\d+)/g)].map(m=>({side:m[1]==='M'?'MONSTER':'HERO',glyph:m[1]==='M'?'monster-target':'hero-target',count:Number(m[2])}));
  const targetField=field(illustrated?null:{printedNotation:targetIcons,groups:targetGroups,self:targetIcons==='Self',allAllies:targetIcons==='All Allies'},'OFFICIAL_SOURCE',[ref]);
  const emblem='skill-emblem-'+(side==='back'&&n.printedBackName==='Transform to Human'?'abomination-transform-to-human':n.skillId);
  const glyphs=[...new Set([...glyphIds(effects),emblem,...(!illustrated&&stance?stance.split('').map(d=>'stance-'+stanceNames[Number(d)-1]):[]),...targetGroups.map(g=>g.glyph),...(range&&/^\d/.test(range)?['range-arrow']:[]),...(number(critical)!==null||number(ordinary)!==null?[heal?'heal':'damage']:[]),...(effects.includes('Self ')?['self-effect-arrow']:[]),...(effects.includes('Target ')?['target-effect-arrow']:[]),...(/\dt/.test(effects)?['duration-t']:[])])];
  const details=effectDetails(effects,ref);
  return {role:illustrated?'ILLUSTRATED_SKILL_BACK':'GAMEPLAY_ACTION',printedName:side==='front'?n.printedName:n.printedBackName,heroId:n.heroId,heroIdentityAuthority:'FROZEN_C2A_R1_PAIRING',printedLevel:n.printedLevel,
    completePrintedTextSpans:n[side].navigationSpans,textSpansAreNavigationOnly:true,visualWitness:n[side].image,manualGlyphAwareTranscription:effects,
    numericFields,glyphFields:{usableFromStances:field(illustrated?null:stance.split('').map(d=>stanceNames[Number(d)-1]),'OFFICIAL_SOURCE',[ref]),printedStanceMask:field(illustrated?null:stanceNames.map((name,i)=>({glyphId:'stance-'+name,printedSlot:i+1,color:stance.includes(String(i+1))?'YELLOW':'GREY'})),'OFFICIAL_SOURCE',[ref]),targetableStances:field(null),range:field(illustrated?null:range,'OFFICIAL_SOURCE',[ref]),targeting:targetField,targetSide:field(illustrated?null:targetIcons==='Self'?'Self':targetIcons==='All Allies'?'All Allies':targetGroups.map(g=>g.side),'OFFICIAL_SOURCE',[ref]),targetCount:field(targetGroups.length?targetGroups.map(g=>({side:g.side,glyph:g.glyph,count:g.count})):null,'OFFICIAL_SOURCE',[ref])},
    textClauses:field(effects||null,/Transfer|Change:/.test(effects)?'SOURCE_UNRESOLVED':'OFFICIAL_SOURCE',[ref]),
    formRestriction:field(effects.includes('Human Form Only')?'Human Form Only':effects.includes('Beast Form Only')?'Beast Form Only':null,'OFFICIAL_SOURCE',[ref]),
    selfEffects:field(groupsFor(effects,'Self'),'OFFICIAL_SOURCE',[ref]),targetEffects:field(groupsFor(effects,'Target'),'OFFICIAL_SOURCE',[ref]),
    specialClauses:field(/if |vs |Ignores|Transfer|Change:| or /.test(effects)?effects:null,/Transfer|Change:/.test(effects)?'SOURCE_UNRESOLVED':'OFFICIAL_SOURCE',[ref]),
    movement:field(details.movements.length?details.movements.map(m=>({actor:m.actor,direction:m.direction,distance:m.distance.literal,alternative:m.alternative,printedTiming:null,mandatoryOptional:m.mandatoryOptional.literal})):null,details.movements.some(m=>m.orderingStatus==='SOURCE_UNRESOLVED')?'SOURCE_UNRESOLVED':'OFFICIAL_SOURCE',[ref]),
    conditions:field(details.conditions.length?details.conditions.map(c=>({glyphId:c.conditionType,magnitude:c.magnitude.literal,duration:c.duration.literal,actorLabel:c.operation==='PREDICATE'&&c.printedClause.includes('Flagellant has')?'Flagellant':c.target,printedClause:c.printedClause})):null,details.conditions.some(c=>c.semanticStatus==='SOURCE_UNRESOLVED')?'SOURCE_UNRESOLVED':'OFFICIAL_SOURCE',[ref]),
    stress:field(effects.includes('[stress]')?effects:null),timing:field(null),glyphs,sourceRef:ref,...receipt};
}
function groupsFor(text:string,who:string){const parts=text.split('; ').filter(s=>s.startsWith(who+' '));return parts.length?parts:null;}

const glyphDefinitions:Record<string,[string,string,number,string]>={
 'damage':['red lightning bolts','Damage',19,'Hit effects: damage deals Wounds'],
 'heal':['green cross','Healing',19,'Healing removes Wounds'],
 'heart-outline':['black heart outlined red in a square','Wounds',21,'Wounds and Damage are distinct'],
 'bleed':['red droplet','Bleed',21,'Bleed magnitude and turn stack'], 'blight':['green droplet','Blight',21,'Blight magnitude and turn stack'],
 'stun':['three yellow diamond stars','Stun',21,'Hero loses an action; Monster loses turn'],
 'buff':['blue upward double chevron','Buff',21,'+1 Crit per active stack'], 'debuff':['orange downward double chevron','Debuff',21,'attacker +1 Crit per active stack'],
 'protection':['grey breastplate','Protection',21,'halve Damage rounded up'], 'guard':['cyan shield','Guard',21,'enemies must target guarded character unless Skill targets allies'],
 'riposte':['orange curved counterattack mark','Riposte',21,'return half incoming enemy Damage rounded up'], 'mark':['red circular crosshair','Mark',21,'attacker +1 Accuracy per stack'],
 'shuffle':['blue double lateral chevrons','Shuffle',21,'Push/Pull changes Areas and Stance'],
 'stress':['grey framed spiked semicircle','Stress',28,'Stress tracker and resolve test'],
 'torch':['orange flame on black torch','Light',29,'Light tracker'],
 'hero-target':['yellow helmet','Hero target',19,'count helmets for target count'], 'monster-target':['red skull','Monster target',19,'count skulls for target count'],
 'range-arrow':['grey curved arrow','Range in Areas',19,'exact or bracketed range'],
 'self-effect-arrow':['gold bent arrow pointing up-left','Self Effects',20,'after roll before other effects; hit or miss'],
 'target-effect-arrow':['gold bent arrow pointing right','Target Effects',20,'after other effects; only on hit'],
 'duration-t':['printed digit followed by t','Condition turns',20,'one stack token per turn duration'],
 'life':['white number over fiery red heart','Life',10,'Hero Life label'], 'dodge':['yellow darting silhouette with white numeral','Dodge',10,'Dodge label'],
 'movement-boot':['pale boot icons','Hero movement',10,'count boots; not initiative Speed numeral'],
 'death-door-slot':['red skull in framed die slot','Deathblow die slot',29,'place die at Death’s Door'],
 'trinket-slot':['gold bag in frame','Trinket slot',10,'Trinket Slot label'],
 'disease':['yellow pathogen glyph','Disease',27,'Disease cards; profile Immunities'],
 'affliction-card':['red card silhouette','Affliction card',28,'Affliction card example'],
 'virtue-card':['green card silhouette','Virtue card',28,'Virtue card example'],
 'd10':['ten-sided die','d10',19,'Roll one ten-sided die'],
 'loot-chest':['closed treasure chest','Loot Chest',10,'ten Loot Chest Tokens in Loot pile'],
 'gold':['gold coin','Gold',29,'Guild costs use Gold'],
 'stance-support':['yellow castle outline','Support Stance',19,'eligible Stances'],
 'stance-ranged':['yellow arrows','Ranged Stance',19,'eligible Stances'],
 'stance-defensive':['yellow shield','Defensive Stance',19,'eligible Stances'],
 'stance-aggressive':['yellow crossed swords','Aggressive Stance',19,'eligible Stances'],
};

export function buildC2BArtifacts():Record<string,any>{
  check(textHash(assets+'review-input-locks.json')==='12b6c0ec17644028f769c6ceeeeb288686550d765215d14547f7c912a07d39dd','review receipt lock');
  const locks=read(assets+'review-input-locks.json');
  for(const l of locks.inputs)check(textHash(l.path)===l.sha256,'locked visual transcription input '+l.path);
  const navigation=read(assets+'navigation.json');const map=read(root+'c2a-r1-hero-skill-level-form-map.json').forms;
  const identities=read(root+'c2a-hero-logical-identities.json').heroes;const profileBindings=read(root+'c2a-r1-profile-transport-binding.json').entries;
  const skills=navigation.skills.map((n:any)=>{
    const f=map.find((f:any)=>f.skillId===n.skillId&&f.level===n.level);
    check(f&&same(n.front.source,f.officialSource)&&same(n.back.source,f.officialBackCandidate),'frozen source pairing '+n.skillId);
    check(n.printedLevel===['I','II','III'][n.level-1]&&(n.front.source.page-1)%3===n.level-1,'printed Roman Level independent of state index');
    const reviewed=skillReviews[n.heroId][Math.floor((n.front.source.page-1)%21/3)];
    check(reviewed.length===3&&reviewed.every(s=>s.split('|').length===3),'independently recorded I/II/III columns');
    const front=skillFace(n,'front',reviewed[0].split('|')[n.level-1],reviewed[1].split('|')[n.level-1],reviewed[2].split('|')[n.level-1]);
    const transform=n.printedName==='Transform to Beast';
    const back=skillFace(n,'back','- - - -',transform?'1234;All Allies;All Allies':';;',transform?transformBackEffects[n.level-1]:'',!transform);
    return {heroId:n.heroId,skillId:n.skillId,level:n.level,physicalCardId:n.physicalCardId,printedName:n.printedName,printedLevel:n.printedLevel,printedBackName:n.printedBackName,
      frontLiteral:front,backLiteral:back,numericFields:front.numericFields,glyphFields:front.glyphFields,textClauses:front.textClauses,sourceFront:n.front.source,sourceBack:n.back.source,
      visualReview:receipt,literalStatus:'LITERAL_COMPLETE',semanticStatus:'SEMANTIC_PARTIAL',digitalSerializationReview:'PROJECT_RULING_REQUIRED',unreadableFields:[]};
  });
  const profileFaces=navigation.profileFaces.map((n:any)=>{
    const binding=profileBindings.find((p:any)=>p.physicalId===n.physicalId);
    check(same(n.face.source,binding['official'+(n.side==='front'?'Front':'Back')]),'frozen profile binding');
    const parts=(n.form==='BEAST_FORM'?abominationBeastReviews:profileReviews[n.heroId])[n.level-1].split(';');
    const refs=[n.face.source];const hamlet=n.form==='BEAST_FORM'?null:hamletReviews[n.heroId][n.level-1];
    const literalFields={life:field(Number(parts[0]),'OFFICIAL_SOURCE',refs),dodge:field(Number(parts[1]),'OFFICIAL_SOURCE',refs),speed:field(null),movement:field({glyphId:'movement-boot',count:Number(parts[2])},'OFFICIAL_SOURCE',refs),
      startingStances:field(null),availableStances:field(null),resistances:field(parts[3]?parts[3].split(' '):null,'OFFICIAL_SOURCE',refs),immunities:field(parts[4]?parts[4].split(' '):null,'OFFICIAL_SOURCE',refs),heroTypeTags:field(null),stress:field(null),
      formIdentity:field(n.form,'OFFICIAL_SOURCE',refs),level:field(n.printedLevel,'OFFICIAL_SOURCE',refs),trinketSlots:field({glyphId:'trinket-slot',count:[1,2,3][n.level-1]},'OFFICIAL_SOURCE',refs),deathDoorSlot:field({glyphId:'death-door-slot',count:1},'OFFICIAL_SOURCE',refs),hamletAbility:field(hamlet,n.heroId==='crusader'?'SOURCE_UNRESOLVED':'OFFICIAL_SOURCE',refs),otherModifiers:field(null)};
    return {heroId:n.heroId,level:n.level,form:n.form,physicalId:n.physicalId,printedHeroName:n.printedHeroName,printedLevel:n.printedLevel,sourceRef:n.face.source,
      sourceFront:binding.officialFront,sourceBack:binding.officialBack,side:n.side,visualWitness:n.face.image,completePrintedTextSpans:n.face.navigationSpans,textSpansAreNavigationOnly:true,
      literalFields,glyphs:[...new Set(['life','dodge','movement-boot','trinket-slot','death-door-slot',...parts.slice(3).join(' ').split(' ').filter(Boolean),...glyphIds(hamlet??'')])],unreadableFields:[],
      visualReview:{...receipt,reviewedFace:n.side},literalStatus:'LITERAL_COMPLETE',authority:'OFFICIAL_PRINTED_COMPONENT'};
  });
  const profiles=identities.flatMap((h:any)=>[1,2,3].map(level=>({heroId:h.heroClassId,level,printedLevel:['I','II','III'][level-1],contentSet:h.contentSet,availabilityDecision:'DEFERRED_TO_C2C',
    forms:profileFaces.filter((p:any)=>p.heroId===h.heroClassId&&p.level===level),literalStatus:'LITERAL_COMPLETE',semanticStatus:h.heroClassId==='crusader'?'SEMANTIC_PARTIAL':'SEMANTIC_COMPLETE'})));
  const allGlyphs=[...new Set([...profileFaces.flatMap((p:any)=>p.glyphs),...skills.flatMap((s:any)=>[...s.frontLiteral.glyphs,...s.backLiteral.glyphs])])].sort();
  const glyphs=allGlyphs.map(glyphId=>{
    const d=glyphDefinitions[glyphId];const example=profileFaces.find((p:any)=>p.glyphs.includes(glyphId));const skill=skills.find((s:any)=>s.frontLiteral.glyphs.includes(glyphId)||s.backLiteral.glyphs.includes(glyphId));
    return {glyphId,visualDescription:d?.[0]??'Printed individual skill pictogram; visual witness retained without interpreting artwork',sourceExamples:[example?{heroId:example.heroId,level:example.level,sourceRef:example.sourceRef}:null,skill?{skillId:skill.skillId,level:skill.level,sourceRef:skill.frontLiteral.glyphs.includes(glyphId)?skill.sourceFront:skill.sourceBack}:null].filter(Boolean),
      officialRulebookBinding:d?[rule(d[2],d[3])]:[],normalizedConcept:d?.[1]??null,status:d?'OFFICIAL_SOURCE':'SOURCE_UNRESOLVED',executionRequired:!!d,illustrative:!d};
  });
  const conflicts=[{conflictId:'C2B-CRUSADER-ZEALOUS-SPEECH-PREPARATION',heroId:'crusader',skillId:null,level:1,field:'hamletAbility.preparationDays',kind:'GAMEPLAY_LITERAL',sourceA:rule(10,'Crusader I anatomy example Hamlet box'),sourceB:profiles.find((p:any)=>p.heroId==='crusader'&&p.level===1).forms[0].sourceRef,literalA:'Preparation Days -1',literalB:'ABSENT; Only as the first action of a day; Day ends immediately; four Hero helmets -5 Stress',resolutionStatus:'SOURCE_UNRESOLVED',resolution:null,affectedLevels:[1,2,3],promotionBlocked:true},
    {conflictId:'C2B-SELF-SHUFFLE-ROLL-ORDER',heroId:null,skillId:null,level:null,field:'selfMovement.rollOrdering',kind:'SHARED_SEMANTIC',sourceA:rule(20,'Self Effects'),sourceB:rule(22,'Monster turn example step 6'),literalA:'Self Effects after roll, before any other effects',literalB:'Self Pull 1 takes place before the attack roll in the example',resolutionStatus:'SOURCE_UNRESOLVED',resolution:null,promotionBlocked:true}];
  const schemaSpecs:[string,string,string,(s:any)=>boolean][]=[
    ['per-level-structural-changes','REQUIRES_EXTENSION','Runtime bonus table cannot represent independently printed non-numeric changes.',()=>true],
    ['multi-target','REQUIRES_EXTENSION','Printed icon count and multiple target groups.',s=>s.frontLiteral.glyphFields.targeting.literal.groups.some((g:any)=>g.count>1)],
    ['all-target','REQUIRES_EXTENSION','Literal All Allies has no numeric target count.',s=>s.frontLiteral.glyphFields.targeting.literal.allAllies],
    ['form-restriction','REQUIRES_EXTENSION','Human Form Only / Beast Form Only.',s=>s.frontLiteral.formRestriction.printed==='PRESENT'],
    ['form-transition','SEMANTICS_UNRESOLVED','Paired actions retained; transformation interruption and transition timing need official closure.',s=>s.frontLiteral.manualGlyphAwareTranscription.includes('Change:')],
    ['conditional-bonus','REQUIRES_EXTENSION','Condition-dependent damage modifier.',s=>/if |vs \[mark\]/.test(s.frontLiteral.manualGlyphAwareTranscription)],
    ['condition-transfer','SEMANTICS_UNRESOLVED','Suffer transfers all Bleed or Blight; destination stack handling unresolved.',s=>s.frontLiteral.manualGlyphAwareTranscription.includes('Transfer')],
    ['self-plus-target','REQUIRES_EXTENSION','Separate Self / Target scope and hit timing.',s=>/Self /.test(s.frontLiteral.manualGlyphAwareTranscription)&&/Target /.test(s.frontLiteral.manualGlyphAwareTranscription)],
    ['delayed-effect','REQUIRES_NEW_RUNTIME_PRIMITIVE','Hamlet pending next-Dungeon effects must retain timing; no delayed combat clause observed.',()=>false],
    ['type-specific-bonus','REQUIRES_EXTENSION','Unholy and Eldritch bonus.',s=>/Unholy|Eldritch/.test(s.frontLiteral.manualGlyphAwareTranscription)],
    ['ignore-defense','REQUIRES_EXTENSION','Guard and Protection ignores are separate printed clauses.',s=>/Ignores/.test(s.frontLiteral.manualGlyphAwareTranscription)],
    ['movement-ordering','SEMANTICS_UNRESOLVED','Area and Stance movement plus conflicting roll order.',s=>s.frontLiteral.movement.printed==='PRESENT'],
    ['ally-effects','REQUIRES_EXTENSION','Healing, support, ally Dodge and mixed side target groups.',s=>s.frontLiteral.glyphFields.targeting.literal.groups.some((g:any)=>g.side==='HERO')||s.frontLiteral.glyphFields.targeting.literal.allAllies],
    ['party-wide-effects','REQUIRES_EXTENSION','All Allies; profile Hamlet party targets also retained.',s=>s.frontLiteral.glyphFields.targeting.literal.allAllies],
    ['health-stress-thresholds','SUPPORTED_BY_CURRENT_SCHEMA','No combat Skill threshold clause observed; do not import videogame thresholds.',()=>false],
    ['condition-magnitude-duration','REQUIRES_EXTENSION','Independent magnitude, duration, actor, predicate and turn stacks.',s=>s.frontLiteral.conditions.printed==='PRESENT'],
    ['basic-numeric-values','SUPPORTED_BY_CURRENT_SCHEMA','Damage, Healing and Accuracy scalar fields exist; literal absence retained.',()=>true],
    ['area-range','REQUIRES_EXTENSION','Exact Area range, bracket interval, Self, All Allies distinct from targetable Stances.',()=>true],
  ];
  const schemaRequirements=schemaSpecs.map(([featureId,status,reason,predicate])=>({featureId,status,reason,affectedForms:skills.filter(predicate).map((s:any)=>`${s.skillId}:L${s.level}`),profileEvidence:['delayed-effect','party-wide-effects','ally-effects'].includes(featureId)?profileFaces.filter((p:any)=>p.literalFields.hamletAbility.printed==='PRESENT').map((p:any)=>`${p.heroId}:L${p.level}:${p.form}`):[],observationStatus:skills.some(predicate)||['delayed-effect','party-wide-effects','ally-effects'].includes(featureId)?'OBSERVED':'PRINTED_ABSENT',implementationAuthorized:false}));
  const gaps=[
    {gapId:'C2B-CRUSADER-PREPARATION',semanticStatus:'SOURCE_UNRESOLVED',canonical:false,executionRequired:true,reason:'Conflicting official Hamlet literals; no precedence chosen.',sourceRefs:[conflicts[0].sourceA,conflicts[0].sourceB],affectedForms:profiles.filter((p:any)=>p.heroId==='crusader').map((p:any)=>`crusader:profile:L${p.level}`)},
    {gapId:'C2B-MOVEMENT-ORDER',semanticStatus:'SOURCE_UNRESOLVED',canonical:false,executionRequired:true,reason:'Official Self rule and movement example disagree.',sourceRefs:[conflicts[1].sourceA,conflicts[1].sourceB],affectedForms:skills.filter((s:any)=>s.frontLiteral.movement.literal?.some((m:any)=>m.actor==='Self')).map((s:any)=>`${s.skillId}:L${s.level}`)},
    {gapId:'C2B-TRANSFER-STACKS',semanticStatus:'SOURCE_UNRESOLVED',canonical:false,executionRequired:true,reason:'Literal transfers all Bleed or Blight; no guessed stack duration reset, resistance or reapplication.',sourceRefs:skills.filter((s:any)=>s.skillId==='flagellant-suffer').map((s:any)=>s.sourceFront),affectedForms:skills.filter((s:any)=>s.skillId==='flagellant-suffer').map((s:any)=>`${s.skillId}:L${s.level}`)},
    {gapId:'C2B-TRANSFORM-TIMING',semanticStatus:'SOURCE_UNRESOLVED',canonical:false,executionRequired:true,reason:'Change Human/Beast clauses fully visible; transition atomicity versus other effects not defined.',sourceRefs:skills.filter((s:any)=>s.printedName==='Transform to Beast').flatMap((s:any)=>[s.sourceFront,s.sourceBack]),affectedForms:skills.filter((s:any)=>s.printedName==='Transform to Beast').map((s:any)=>`${s.skillId}:L${s.level}`)},
    {gapId:'C2B-CONDITIONAL-CONNECTIVE',semanticStatus:'SOURCE_UNRESOLVED',canonical:false,executionRequired:true,reason:'Punish and Rain of Sorrows show adjacent Bleed and Blight glyphs after “if Flagellant has”; neither AND nor OR is printed. Preserve adjacency without inventing a connective.',sourceRefs:skills.filter((s:any)=>/flagellant-(punish|rain-of-sorrows)/.test(s.skillId)).map((s:any)=>s.sourceFront),affectedForms:skills.filter((s:any)=>/flagellant-(punish|rain-of-sorrows)/.test(s.skillId)).map((s:any)=>`${s.skillId}:L${s.level}`)},
    {gapId:'C2B-MODIFIER-PHASE',semanticStatus:'SOURCE_UNRESOLVED',canonical:false,executionRequired:true,reason:'Ignore-defense and condition/type-specific damage modifiers retained; generic Target-effects-after-other-effects wording does not establish their routing / damage-modification phase. Do not schedule them as ordinary post-damage conditions.',sourceRefs:[rule(20,'Target Effects')],affectedForms:skills.filter((s:any)=>/Ignores|if |vs /.test(s.frontLiteral.manualGlyphAwareTranscription)).map((s:any)=>`${s.skillId}:L${s.level}`)},
    {gapId:'C2B-SERIALIZATION',semanticStatus:'PROJECT_RULING_REQUIRED',canonical:false,executionRequired:true,reason:'Persist simultaneous-effect order, player-selected targets, pending next-Dungeon effects, transaction identity and save interruption cursor; no ruling approved.',sourceRefs:[rule(19,'multiple targets chosen by Hero'),rule(20,'simultaneous Wounds')],affectedForms:skills.map((s:any)=>`${s.skillId}:L${s.level}`)},
    {gapId:'C2B-ILLUSTRATIVE-PICTOGRAMS',semanticStatus:'SOURCE_UNRESOLVED',canonical:false,executionRequired:false,reason:'Per-Skill pictograms retained as artwork; no executable meaning assigned.',sourceRefs:[],affectedGlyphs:glyphs.filter(g=>g.illustrative).map(g=>g.glyphId),affectedForms:[]},
  ];
  const matrix=[...profiles.map((p:any)=>({heroId:p.heroId,kind:'PROFILE',skillId:null,level:p.level,form:p.forms.map((f:any)=>f.form),literalComplete:true,semanticComplete:p.semanticStatus==='SEMANTIC_COMPLETE',sourceReferences:p.forms.flatMap((f:any)=>[f.sourceFront,f.sourceBack]),unresolvedFields:p.heroId==='crusader'?['hamletAbility.preparationDays']:[],schemaRequirements:['per-level-structural-changes','ally-effects','party-wide-effects','delayed-effect']})),
    ...skills.map((s:any)=>({heroId:s.heroId,kind:'SKILL',skillId:s.skillId,level:s.level,form:[s.frontLiteral.role,s.backLiteral.role],literalComplete:true,semanticComplete:!gaps.some(g=>g.executionRequired&&g.semanticStatus==='SOURCE_UNRESOLVED'&&g.affectedForms?.includes(`${s.skillId}:L${s.level}`)),sourceReferences:[s.sourceFront,s.sourceBack],unresolvedFields:gaps.filter(g=>g.semanticStatus==='SOURCE_UNRESOLVED'&&g.affectedForms?.includes(`${s.skillId}:L${s.level}`)).map(g=>g.gapId),schemaRequirements:schemaRequirements.filter(r=>r.affectedForms.includes(`${s.skillId}:L${s.level}`)).map(r=>r.featureId)}))];
  const sourceUnresolvedCount=matrix.filter(r=>!r.semanticComplete).length;
  for(const row of matrix){Object.assign(row,{sourceSemanticComplete:row.semanticComplete,sourceUnresolved:!row.semanticComplete,projectRulingRequired:row.kind==='SKILL'});if(row.kind==='SKILL'){row.semanticComplete=false;row.unresolvedFields.push('C2B-SERIALIZATION');}}
  const fields:any[]=[];
  const pushFields=(owner:any,kind:string,form:string,side:string,fs:Record<string,any>,ref:any)=>{
    for(const [name,f] of Object.entries(fs)){
      fields.push({fieldId:`${owner.heroId}:${owner.skillId??'profile'}:L${owner.level}:${form}:${side}:${name}`,heroId:owner.heroId,skillId:owner.skillId??null,level:owner.level,form,side,field:name,literal:f.literal,printed:f.printed,literalStatus:f.literalStatus,
        normalizedCandidate:kind==='SKILL'&&['movement','conditions'].includes(name)?effectDetails(owner[side+'Literal'].manualGlyphAwareTranscription,ref)[name==='movement'?'movements':'conditions']:f.literal,authority:f.semanticStatus==='OFFICIAL_SOURCE'?'OFFICIAL_SOURCE':f.semanticStatus,canonical:f.semanticStatus==='OFFICIAL_SOURCE',executionRequired:f.printed==='PRESENT',semanticStatus:f.semanticStatus,sourceRefs:f.sourceRefs?.length?f.sourceRefs:[ref],normalizationIsRuntimeRegistration:false});
      if(kind==='SKILL'&&['movement','conditions'].includes(name)){
        const details=effectDetails(owner[side+'Literal'].manualGlyphAwareTranscription,ref)[name==='movement'?'movements':'conditions'];
        const collect=(v:any,path:string)=>{if(v&&typeof v==='object'&&v.literalStatus){fields.push({fieldId:`${owner.heroId}:${owner.skillId}:L${owner.level}:${form}:${side}:${name}.${path}`,heroId:owner.heroId,skillId:owner.skillId,level:owner.level,form,side,field:name+'.'+path,literal:v.literal,printed:v.printed,literalStatus:v.literalStatus,normalizedCandidate:v.literal,authority:v.semanticStatus,canonical:v.semanticStatus==='OFFICIAL_SOURCE',executionRequired:v.printed==='PRESENT',semanticStatus:v.semanticStatus,sourceRefs:v.sourceRefs?.length?v.sourceRefs:[ref],normalizationIsRuntimeRegistration:false});return;}if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))if(!['sourceRefs','sourceRef','timingSource','optionalitySource','orderingSourceRefs'].includes(k))collect(x,path?path+'.'+k:k);};
        collect(details,'');
      }
    }
  };
  for(const p of profileFaces)pushFields(p,'PROFILE',p.form,p.side,p.literalFields,p.sourceRef);
  for(const s of skills)for(const side of ['front','back']){const face=s[side+'Literal'];pushFields(s,'SKILL',face.role,side,{...face.numericFields,...face.glyphFields,...Object.fromEntries(['textClauses','formRestriction','selfEffects','targetEffects','specialClauses','movement','conditions','stress','timing'].map(k=>[k,face[k]]))},face.sourceRef);}
  const absentAcc=fields.filter(f=>f.field==='accuracy'&&f.printed==='ABSENT'&&f.form==='GAMEPLAY_ACTION');
  for(const f of absentAcc){f.normalizedCandidate=null;f.sharedRuleInterpretation={requiresRoll:false,sourceRef:rule(19,'A Skill without Acc requires no roll and takes effect immediately'),doesNotCreatePrintedAccuracy:true};}
  const dodgeTable=read(root+'c1c31r-hero-dodge-final-table.json');
  const dodgeRows=profiles.map((p:any)=>{const d=dodgeTable.rows.find((r:any)=>r.heroId===p.heroId&&r.level===p.level);const printed=p.forms[0].literalFields.dodge.literal;return {heroId:p.heroId,level:p.level,officialPrintedDodge:printed,acceptedDigitalDodge:d?.dodge??null,acceptedAuthority:d?.authority??null,ruleSetVersion:dodgeTable.ruleSetVersion,status:!d?'NOT_APPLICABLE':d.dodge===printed?'MATCH':d.authority==='PROJECT_RULING'?'RUNTIME_PROJECT_RULING_DIFFERS':'OFFICIAL_SOURCE_DIFFERS',sourceRefs:p.forms.map((f:any)=>f.sourceRef),runtimeModified:false};});
  const deltas=identities.flatMap((h:any)=>[...new Set(skills.filter((s:any)=>s.heroId===h.heroClassId).map((s:any)=>s.skillId))].map(skillId=>{
    const levels=skills.filter((s:any)=>s.skillId===skillId).sort((a:any,b:any)=>a.level-b.level);
    const keys=['numericFields','glyphFields','manualGlyphAwareTranscription','glyphs','movement','conditions','specialClauses','formRestriction'];
    const transitions=[0,1].map(i=>({fromLevel:i+1,toLevel:i+2,changes:keys.flatMap(k=>k==='numericFields'||k==='glyphFields'?Object.keys(levels[i].frontLiteral[k]).filter(f=>!same(levels[i].frontLiteral[k][f].literal,levels[i+1].frontLiteral[k][f].literal)).map(f=>({field:k+'.'+f,before:levels[i].frontLiteral[k][f].literal,after:levels[i+1].frontLiteral[k][f].literal})):same(withoutProvenance(levels[i].frontLiteral[k]),withoutProvenance(levels[i+1].frontLiteral[k]))?[]:[{field:k,before:withoutProvenance(levels[i].frontLiteral[k]),after:withoutProvenance(levels[i+1].frontLiteral[k])}]),sourceRefs:[levels[i].sourceFront,levels[i+1].sourceFront]}));
    const backTransitions=[0,1].map(i=>({fromLevel:i+1,toLevel:i+2,changes:keys.filter(k=>!same(withoutProvenance(levels[i].backLiteral[k]),withoutProvenance(levels[i+1].backLiteral[k]))).map(k=>({field:k,before:withoutProvenance(levels[i].backLiteral[k]),after:withoutProvenance(levels[i+1].backLiteral[k])})),sourceRefs:[levels[i].sourceBack,levels[i+1].sourceBack]}));
    return {heroId:h.heroClassId,skillId,levels:levels.map((s:any)=>({level:s.level,sourceFront:s.sourceFront,sourceBack:s.sourceBack,backClause:s.backLiteral.manualGlyphAwareTranscription})),transitions,backTransitions,descriptiveOnly:true,formula:null};
  }));
  const historic=read(root+'c1c19-hero-skill-condition-source-gap.json').gaps;
  const superseded=historic.map((g:any)=>{const alias=g.skillId==='hellion-bash'?'hellion-barbaric-yawp':g.skillId;const evidence=skills.filter((s:any)=>s.skillId===alias);return {historicalSkillId:g.skillId,historicalCondition:g.condition,historicalSource:root+'c1c19-hero-skill-condition-source-gap.json',historicalContract:root+'c1c19-hero-caused-condition-source-contract.json',successorSkillId:alias,successorForms:evidence.map((s:any)=>({level:s.level,literal:s.frontLiteral.manualGlyphAwareTranscription,source:s.sourceFront})),status:['crusader-holy-lance','highwayman-wicked-slice'].includes(g.skillId)?'OFFICIAL_PRINT_HAS_NO_BLEED':'OFFICIAL_DURATION_BOUND',historicalArtifactsChanged:false};});
  const a:Record<string,any>={};const add=(k:string,v:any)=>a[k]={...common,...v};
  add('hero-profile-literals',{logicalForms:54,physicalGameplayFaces:57,profiles});
  add('hero-skill-literals',{logicalSkills:126,forms:skills,frontReviewed:378,backReviewed:378,stateIndexIsLevelAuthority:false,levelBonusIsAuthority:false,prototypeIsAuthority:false});
  add('hero-glyph-inventory',{glyphs,unknownGameplayGlyphs:glyphs.filter(g=>g.executionRequired&&g.status==='SOURCE_UNRESOLVED').length});
  add('hero-glyph-semantic-contract',{bindings:glyphs.filter(g=>!g.illustrative),rules:[rule(19,'Stances, Area range, target count, accuracy, omitted Accuracy, Damage and Heal'),rule(20,'critical replacement; Self / Target; turn stacks'),rule(21,'conditions, resistance, immunity and Shuffle'),rule(28,'stress'),rule(29,'Life, Death’s Door and independent Hero / Skill levels')],c1c19SuccessorLinks:superseded,approvedProjectRulings:[],unresolvedGlyphs:glyphs.filter(g=>g.status==='SOURCE_UNRESOLVED').map(g=>g.glyphId)});
  add('hero-skill-level-delta',{skills:deltas,formulaDerivationForbidden:true,shieldbreakerSpecialReview:deltas.filter((d:any)=>d.heroId==='shieldbreaker'),flagellantSpecialReview:deltas.filter((d:any)=>d.heroId==='flagellant'),abominationSpecialReview:deltas.filter((d:any)=>d.heroId==='abomination'),musketeerIndependentlyReviewed:true});
  add('hero-dodge-source-comparison',{rows:dodgeRows,acceptedRulingSet:dodgeTable.ruleSetVersion,changesAuthorized:false});
  add('prototype-vs-official-hero-data',prototypeComparison(profiles,skills));
  add('hero-production-schema-requirements',{requirements:schemaRequirements,currentSchemaSource:'src/types/index.ts:SkillDefinition',futureImplementationAuthorized:false});
  add('hero-literal-closure-matrix',{expected:432,rows:matrix});
  add('hero-executable-field-matrix',{fields,absentNumbersDefaulted:false,absentAccuracyRuleBinding:rule(19,'no Acc: no roll; literal remains ABSENT'),runtimeRegistration:false});
  add('hero-semantic-gap-register',{gaps,approvedProjectRulings:[],unresolvedSourceGroups:gaps.filter(g=>g.semanticStatus==='SOURCE_UNRESOLVED').length,projectRulingRequiredGroups:gaps.filter(g=>g.semanticStatus==='PROJECT_RULING_REQUIRED').length});
  add('hero-source-conflicts',{conflicts,unresolvedConflicts:conflicts.length,silentlyResolved:false});
  add('hero-literal-closure-acceptance',{outcome:'HERO_LITERAL_CLOSURE_BLOCKED',heroGroups:18,profileFormsExpected:54,profileFormsLiteralComplete:54,skillIdentities:126,skillFormsExpected:378,skillFormsLiteralComplete:378,totalExpected:432,totalLiteralComplete:432,
    semanticComplete:matrix.filter(r=>r.semanticComplete).length,semanticUnresolved:matrix.filter(r=>!r.semanticComplete).length,projectRulingRequired:378,sourceUnresolved:sourceUnresolvedCount,accountingNote:'Source-unresolved and project-ruling-required counts overlap; semantic completion requires both source and digital-contract closure.',unreadableFields:0,
    literalTranscriptionComplete:true,literalClosureComplete:false,semanticExecutionContractComplete:false,officialSourceProvenanceComplete:true,sourceTranscriptionConflicts:1,unresolvedSharedSemanticConflicts:1,blockers:conflicts.map(c=>c.conflictId),C2CAllowed:false,remoteGateRequirement:'Production release gate completed / success on exact final C2B HEAD'});
  add('next-workstream-decision',{outcome:'HERO_LITERAL_CLOSURE_BLOCKED',nextWorkstream:'Official source conflict review; C2C remains unauthorized',C2CAllowed:false,ThingStatus:'SOURCE_ACQUISITION_HOLD',ThingRuntimeAuthorized:false,approvedProjectRulings:[],requiredOfficialResolution:conflicts.map(c=>({conflictId:c.conflictId,field:c.field,heroId:c.heroId,level:c.level,sourceA:c.sourceA,sourceB:c.sourceB})),externalSourceAcquisitionAuthorized:false});
  add('historical-c2a-r1-freeze',{checkpoint:{phase:'11A.5-C2A-R1',commit:C2B_BASELINE,outcome:'HERO_SOURCE_CENSUS_ACCEPTED'},frozenEvidence:freezeManifest(),freezeFutureRuntime:false});
  for(const h of identities){add('heroes/'+h.heroClassId+'-profiles',{heroId:h.heroClassId,contentSet:h.contentSet,profiles:profiles.filter((p:any)=>p.heroId===h.heroClassId)});add('heroes/'+h.heroClassId+'-skills',{heroId:h.heroClassId,contentSet:h.contentSet,logicalSkills:7,forms:skills.filter((s:any)=>s.heroId===h.heroClassId)});}
  return a;
}

function prototypeComparison(profiles:any[],skills:any[]){
  // Comparison inputs have no path into literal transcription or authority.
  const heroText=readFileSync('src/data/heroes.ts','utf8');const skillText=readFileSync('src/data/skills.ts','utf8');
  const heroBlocks=[...heroText.matchAll(/\{\s*id: '([^']+)'[\s\S]*?\n  \}/g)];const skillBlocks=[...skillText.matchAll(/\{\s*id: '([^']+)'[\s\S]*?\n  \}/g)];
  const prior=read(root+'c2a-prototype-hero-data-comparison.json');const rows:any[]=[];
  const scalar=(block:string,key:string)=>{const m=block.match(new RegExp(key+": (\\d+|'[^']+')"));return m?m[1].startsWith("'")?m[1].slice(1,-1):Number(m[1]):null;};
  const compare=(owner:any,name:string,official:any,prototype:any,placeholder=false)=>{const candidate=name==='range'&&typeof official==='string'&&/^\d+$/.test(official)?Number(official):official;rows.push({...owner,field:name,printedOfficialValue:official,comparisonCandidate:candidate,prototypeRuntimeValue:prototype,status:placeholder?'PLACEHOLDER':prototype===null?'MISSING_RUNTIME_FIELD':same(candidate,prototype)?'MATCH':'PROTOTYPE_MISMATCH',officialAuthority:'OFFICIAL_PRINTED_COMPONENT',prototypeAuthority:false});};
  for(const b of heroBlocks){const p=profiles.find(p=>p.heroId===b[1]&&p.level===1);const f=p.forms[0].literalFields;const placeholder=prior.heroes.find((h:any)=>h.existingId===b[1])?.definitionClassification==='PLACEHOLDER';
    for(const [name,value,runtimeName] of [['life',f.life.literal,'baseLife'],['movement',f.movement.literal.count,'movement'],['dodge',f.dodge.literal,'dodge']] as any[])compare({heroId:b[1],level:1,skillId:null},name,value,scalar(b[0],runtimeName),placeholder);
    rows.push({heroId:b[1],level:1,field:'speed',printedOfficialValue:null,prototypeRuntimeValue:scalar(b[0],'speed'),status:'UNSUPPORTED_SOURCE_SEMANTIC',reason:'Official boot icons are Hero Movement (page 10); no printed initiative Speed scalar exists on these Profiles. Do not equate the two.',prototypeAuthority:false});
    for(const level of [2,3])for(const name of ['life','movement','dodge'])rows.push({heroId:b[1],level,field:name,printedOfficialValue:profiles.find(p=>p.heroId===b[1]&&p.level===level).forms[0].literalFields[name==='movement'?'movement':name].literal,prototypeRuntimeValue:null,status:'PLACEHOLDER',reason:'Runtime profile arithmetic is not an independently printed official level definition.',prototypeAuthority:false});
  }
  for(const b of skillBlocks){const identity=prior.skills.find((s:any)=>s.existingId===b[1]);const s=skills.find(s=>s.skillId===identity?.officialSkillId&&s.level===1);if(!s){rows.push({skillId:b[1],status:'PLACEHOLDER',printedOfficialValue:null,prototypeAuthority:false});continue;}
    const owner={heroId:s.heroId,skillId:s.skillId,runtimeSkillId:b[1],level:1};
    for(const key of ['crit','critDamage','accuracy','damage','heal'])compare(owner,key,s.numericFields[key].literal,scalar(b[0],key));
    compare(owner,'range',s.glyphFields.range.literal,scalar(b[0],'range'));
    for(const key of ['targeting','usableFromStances','targetableStances'])rows.push({...owner,field:key,printedOfficialValue:s.glyphFields[key].literal,prototypeRuntimeValue:key==='targeting'?scalar(b[0],'targetSide'):null,status:'UNSUPPORTED_SOURCE_SEMANTIC',reason:'Prototype target side / position abstraction is not the printed Area and icon-count contract.',prototypeAuthority:false});
    rows.push({...owner,field:'conditions/selfEffects/targetEffects',printedOfficialValue:s.frontLiteral.manualGlyphAwareTranscription,prototypeRuntimeValue:b[0].match(/applyEffects: (.*)/)?.[1]??null,status:'UNSUPPORTED_SOURCE_SEMANTIC',prototypeAuthority:false});
    for(const level of [2,3])rows.push({...owner,level,field:'independentLevelDefinition',printedOfficialValue:skills.find(x=>x.skillId===s.skillId&&x.level===level).numericFields,prototypeRuntimeValue:'SKILL_LEVEL_BONUS (comparison only)',status:'PLACEHOLDER',prototypeAuthority:false});
  }
  return {rows,runtimeInputPurpose:'COMPARISON_ONLY',runtimeCorrectionsAuthorized:false};
}
const git=(args:string[])=>execFileSync('git',args,{maxBuffer:128*1024*1024}).toString().trim();
function freezeManifest(){return git(['ls-tree','-r',C2B_BASELINE,'docs/data/complete-edition']).split(/\r?\n/).filter(l=>/\t.*(?:\/c2a(?:-r1)?-|\/heroes\/c2a(?:-r1)?\/|\/source-assets\/c2a(?:-r1)?\/|\/c1c19-)/.test(l)).map(l=>{const [m,path]=l.split('\t');return {path,gitBlob:m.split(' ')[2]};});}
export function verifyC2BBoundary(){
  const tree=git(['ls-tree','-r',C2B_BASELINE,'src']).split(/\r?\n/).filter(l=>!l.includes('\tsrc/audit/'));
  const files=tree.map(l=>l.split('\t')[1]);const actual=execFileSync('git',['hash-object','--stdin-paths'],{input:files.join('\n')+'\n',maxBuffer:128*1024*1024}).toString().trim().split(/\r?\n/);
  for(const [i,l] of tree.entries())if(actual[i]!==l.split('\t')[0].split(' ')[2])check(readFileSync(files[i],'utf8').replace(/\r\n/g,'\n')===execFileSync('git',['show',C2B_BASELINE+':'+files[i]]).toString('utf8').replace(/\r\n/g,'\n'),'runtime unchanged '+files[i]);
  for(const p of [...git(['diff','--name-only',C2B_BASELINE,'--','src']).split(/\r?\n/),...git(['ls-files','--others','--exclude-standard','src']).split(/\r?\n/)].filter(Boolean))check(p.startsWith('src/audit/'),'runtime addition/deletion '+p);
  const manifest=freezeManifest();const hashes=execFileSync('git',['hash-object','--stdin-paths'],{input:manifest.map(m=>m.path).join('\n')+'\n',maxBuffer:128*1024*1024}).toString().trim().split(/\r?\n/);
  for(const [i,m] of manifest.entries())if(hashes[i]!==m.gitBlob)check(m.path.endsWith('.json')&&readFileSync(m.path,'utf8').replace(/\r\n/g,'\n')===execFileSync('git',['show',C2B_BASELINE+':'+m.path],{maxBuffer:128*1024*1024}).toString('utf8').replace(/\r\n/g,'\n'),'frozen predecessor evidence '+m.path);
}
export function validateC2BArtifacts(a:Record<string,any>){
  const expected=buildC2BArtifacts();check(same(Object.keys(a).sort(),Object.keys(expected).sort()),'complete artifact set');
  for(const [k,v] of Object.entries(expected))check(same(a[k],v),'source-bound independent transcription '+k);
  check(a['hero-profile-literals'].profiles.length===54,'54 logical Profiles');check(a['hero-skill-literals'].forms.length===378,'378 skills');check(a['hero-literal-closure-matrix'].rows.length===432,'432 matrix rows');
  const forms=a['hero-skill-literals'].forms;check(new Set(forms.map((f:any)=>f.skillId)).size===126,'126 frozen identities');
  for(const p of a['hero-profile-literals'].profiles)check(p.forms.length===(p.heroId==='abomination'?2:1),'Human Beast preserved, illustrated backs excluded');
  check(a['next-workstream-decision'].C2CAllowed===false,'source conflicts block C2C');
  const cache=new Map<string,string>();
  const verifyRef=(ref:any)=>{if(!cache.has(ref.path))cache.set(ref.path,hash(ref.path));check(cache.get(ref.path)===ref.sha256,'source hash '+ref.path);check(Number.isInteger(ref.page)&&ref.page>0,'source page');};
  for(const s of forms){verifyRef(s.sourceFront);verifyRef(s.sourceBack);check(s.visualReview.reviewedFront&&s.visualReview.reviewedBack,'both faces reviewed');}
  for(const p of a['hero-profile-literals'].profiles)for(const f of p.forms){verifyRef(f.sourceFront);verifyRef(f.sourceBack);}
  verifyRef(rule(19,'shared rules'));
  for(const n of read(assets+'navigation.json').skills)for(const side of ['front','back']){const w=n[side].image;if(!cache.has(w.path))cache.set(w.path,hash(w.path));check(cache.get(w.path)===w.sha256,'visual witness hash');}
}
export const c2bPath=(k:string)=>k.startsWith('heroes/')?root+'heroes/c2b/'+k.slice(7)+'.json':root+'c2b-'+k+'.json';
if(process.argv.includes('--write')){const a=buildC2BArtifacts();validateC2BArtifacts(a);verifyC2BBoundary();for(const [k,v] of Object.entries(a)){const p=c2bPath(k);mkdirSync(p.slice(0,p.lastIndexOf('/')),{recursive:true});writeFileSync(p,JSON.stringify(v,null,2)+'\n');}console.log('C2B audit: 54 Profiles / 378 Skills / 432 literal forms; official conflicts retained, C2C blocked.');}
if(process.argv.includes('--verify')){const a=buildC2BArtifacts();validateC2BArtifacts(a);verifyC2BBoundary();for(const [k,v] of Object.entries(a))check(existsSync(c2bPath(k))&&same(read(c2bPath(k)),v),'saved deterministic artifact '+k);check(readFileSync('.github/workflows/release-gate.yml','utf8').includes('npm run verify:complete-edition-c2b'),'exact HEAD release verifier');console.log('C2B verification PASS: accounting and integrity; outcome HERO_LITERAL_CLOSURE_BLOCKED; no runtime promotion.');}
