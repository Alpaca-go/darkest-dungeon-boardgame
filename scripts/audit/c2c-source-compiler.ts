/** Offline conversion of frozen C2B rows. Never import prototype values here. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { HeroProductionEffect, HeroProductionProfileDefinition, HeroProductionSkillDefinition,
  HeroProductionSkillAction, HeroProductionTarget, PrintedField, DeferredSemanticField } from '../../src/types/hero-production';
import { SOURCE_AMBIGUITY_DEFER_POLICY_V1, validateDeferredRecords, type DeferredManualValidationRecord } from './source-ambiguity-policy';

export const C2C_BASELINE = '84e747b170d4ba65c463d1d5be1cfcd80dd0dd08';
export const dataRoot = 'docs/data/complete-edition/';
export const readArtifact = (name: string): any => JSON.parse(readFileSync(dataRoot + name + '.json', 'utf8'));
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const absent = <T>(): PrintedField<T> => ({presence: 'PRINTED_ABSENT'});
const printed = <T>(value: T): PrintedField<T> => ({presence: 'PRINTED_VALUE', value});
const field = (f: any): any => f.printed === 'ABSENT' ? absent() : printed(f.literal);
const projectFields = (fields: any): any => Object.fromEntries(Object.entries(fields).map(([k,v]) => [k,field(v)]));
const versions = {schemaVersion: 'HERO_PRODUCTION_SCHEMA_V1', definitionVersion: 'C2C-HERO-PRODUCTION-DEFINITION-v1'} as const;
export const deferredIds: Record<string,string> = {
  'C2B-CRUSADER-PREPARATION': 'C2C-DEFER-CRUSADER-PREPARATION-DAYS',
  'C2B-MOVEMENT-ORDER': 'C2C-DEFER-SELF-MOVEMENT-ORDER',
  'C2B-TRANSFER-STACKS': 'C2C-DEFER-CONDITION-TRANSFER-STACKS',
  'C2B-TRANSFORM-TIMING': 'C2C-DEFER-TRANSFORM-ATOMIC-ORDER',
  'C2B-CONDITIONAL-CONNECTIVE': 'C2C-DEFER-CONDITIONAL-CONNECTIVE',
  'C2B-MODIFIER-PHASE': 'C2C-DEFER-MODIFIER-PHASE',
  'C2B-SERIALIZATION': 'C2C-DEFER-SERIALIZATION',
  'C2B-LEGACY-PROTOTYPE-IDENTITIES': 'C2C-DEFER-LEGACY-SAVE-IDENTITIES',
};
const manualTests: Record<string,string> = {
  'C2B-CRUSADER-PREPARATION': 'Play Zealous Speech as the first action of a day with and without an additional Preparation Day decrement; compare day economy, Hamlet pacing, printed wording and tabletop expectations.',
  'C2B-MOVEMENT-ORDER': 'Execute Holy Lance and Point Blank Shot before the attack roll and after the roll before other effects; compare target legality, resistance choices and board state.',
  'C2B-TRANSFER-STACKS': 'Use Suffer on unequal Bleed/Blight durations with existing Flagellant stacks; compare preserving versus resetting duration, stack merges and resistance rechecks.',
  'C2B-TRANSFORM-TIMING': 'Transform in both directions while healing, stress and party effects cross thresholds; interrupt between operations and compare atomic versus staged resolution.',
  'C2B-CONDITIONAL-CONNECTIVE': 'Use Punish and Rain of Sorrows with neither, only Bleed, only Blight, then both; compare AND and OR damage interpretations.',
  'C2B-MODIFIER-PHASE': 'Use Smite against Unholy and Intimidate against Guard/Protection; compare modifier placement before and after protection rounding and target filtering.',
  'C2B-SERIALIZATION': 'Select multiple targets, resolve simultaneous effects and a next-Dungeon Hamlet effect; save and reload at every interruption and compare selected targets, event order and pending effects.',
  'C2B-LEGACY-PROTOTYPE-IDENTITIES': 'Load a legacy save with Bash and Sanctuary; compare explicit removal and user replacement flows without mapping by effect similarity.',
};
function makeRegister(profiles: any[], skills: any[]): DeferredManualValidationRecord[] {
  const gaps = readArtifact('c2b-hero-semantic-gap-register').gaps;
  const conflicts = readArtifact('c2b-hero-source-conflicts').conflicts;
  return gaps.filter((g:any) => g.executionRequired).map((g:any): DeferredManualValidationRecord => {
    const conflict = conflicts.find((c:any) => c.field === (g.gapId === 'C2B-CRUSADER-PREPARATION' ? 'hamletAbility.preparationDays' : g.gapId === 'C2B-MOVEMENT-ORDER' ? 'selfMovement.rollOrdering' : ''));
    const affectedForms = [...g.affectedForms];
    if (g.gapId === 'C2B-SERIALIZATION') affectedForms.push(...profiles.map(p => `${p.heroId}:profile:L${p.level}`));
    const sources = g.sourceRefs.length ? [...g.sourceRefs] : skills.filter(s => g.historicalSkillIds.some((id:string)=>id.startsWith(s.heroId+'-'))).map(s=>s.sourceFront);
    if (conflict) sources.push(conflict.sourceA, conflict.sourceB, ...(conflict.affectedSourcePairs ?? []).flatMap((p:any) => [p.sourceA,p.sourceB]));
    const variants: string[] = conflict ? [conflict.literalA, conflict.literalB] : skills.filter(s => affectedForms.includes(`${s.skillId}:L${s.level}`))
      .flatMap(s => [s.frontLiteral.manualGlyphAwareTranscription,s.backLiteral.manualGlyphAwareTranscription]).filter(Boolean);
    return {
      deferredId: deferredIds[g.gapId], historicalGapId: g.gapId, domain: g.gapId.includes('CRUSADER') ? 'HAMLET' : g.gapId.includes('SERIALIZATION') || g.gapId.includes('LEGACY') ? 'SERIALIZATION' : 'COMBAT',
      heroId: g.gapId.includes('CRUSADER') ? 'crusader' : null, skillId: null, level: null,
      field: conflict?.field ?? ({'C2B-TRANSFER-STACKS':'conditionTransfer.stackSemantics','C2B-TRANSFORM-TIMING':'transform.atomicOrdering','C2B-CONDITIONAL-CONNECTIVE':'predicate.connective','C2B-MODIFIER-PHASE':'modifier.executionPhase','C2B-SERIALIZATION':'saveReplay.interruptionAndPendingEffects','C2B-LEGACY-PROTOTYPE-IDENTITIES':'legacySave.unmatchedSkillIdentity'} as Record<string,string>)[g.gapId],
      officialSources: [...new Map(sources.map((s:any) => [JSON.stringify(s),s])).values()] as any,
      ambiguityType: conflict ? 'OFFICIAL_SOURCE_CONFLICT' : g.gapId.includes('SERIALIZATION') || g.gapId.includes('LEGACY') ? 'DIGITAL_SERIALIZATION_UNSPECIFIED' : g.gapId.includes('TIMING') || g.gapId.includes('PHASE') ? 'EXECUTION_ORDER_UNSPECIFIED' : 'OFFICIAL_SOURCE_SILENT',
      literalVariants: [...new Set<string>(variants.length ? variants : g.historicalSkillIds)], reason: g.reason, affectedForms,
      runtimeImpact: g.reason, manualTestScenario: manualTests[g.gapId], resolutionStatus: 'OPEN',
      priority: g.gapId.includes('SERIALIZATION') || g.gapId.includes('LEGACY') ? 'LOW' : 'HIGH',
      semanticStatus: 'DEFERRED_MANUAL_VALIDATION', canonical: false, executionBinding: null,
      blocksCurrentPhase: false, blocksNextPhase: false, blocksC2C: false, blocksC2D: false,
      requiresFurtherSourceResearchNow: false, manualValidationRequired: true,
    };
  });
}
const defer = (gap: string, variants: any[] = []): DeferredSemanticField => ({semanticStatus:'DEFERRED_MANUAL_VALIDATION',deferredId:deferredIds[gap],canonical:false,executionBinding:null,literalVariants:variants});
const binding = (ruleBinding: string) => ({semanticStatus:'OFFICIAL_SOURCE' as const,ruleBinding});

function targeting(face: any): HeroProductionTarget {
  const t = face.glyphFields.targeting.literal;
  const groups = t.groups.map((g:any) => ({side:g.side,targetCount:{kind:'exact',value:g.count}}));
  return {scope:t.self?'SELF':t.allAllies?'ALL_ALLIES':groups.length>1?'GROUP':groups[0]?.side==='HERO'?(groups[0].targetCount.value>1?'MULTIPLE_ALLIES':'ONE_ALLY'):groups[0]?.targetCount.value>1?'MULTIPLE_ENEMIES':'ONE_ENEMY',
    groups,targetCount:t.allAllies?{kind:'all'}:t.self?{kind:'exact',value:1}:groups.length===1?groups[0].targetCount:null,
    range:field(face.glyphFields.range),stanceFilter:field(face.glyphFields.targetableStances),printedNotation:t.printedNotation};
}
/** Each comma clause is represented, including explicit alternatives and mixed recipients. */
function effects(text: string, sourceBindingId: string): HeroProductionEffect[] {
  const result: HeroProductionEffect[] = [];
  let actor: 'SELF'|'TARGET' = 'TARGET';
  let recipient: 'SELF'|'TARGET'|'HERO'|'MONSTER'|'ALL_ALLIES' = 'TARGET';
  for (let group of text.split('; ')) {
    if (/^(Human|Beast) Form Only$/.test(group) || !group) continue;
    if (group.startsWith('Self ')) {actor='SELF';recipient='SELF';group=group.slice(5);}
    if (group.startsWith('Target ')) {actor='TARGET';recipient='TARGET';group=group.slice(7);}
    if (group.startsWith('Allies: ')) {recipient='ALL_ALLIES';group=group.slice(8);}
    if (group.startsWith('[hero-target]: ')) {recipient='HERO';group=group.slice(15);}
    if (group.startsWith('[monster-target]: ')) {recipient='MONSTER';group=group.slice(18);}
    for (const literal of group.split(', ')) {
      const base = {actor,recipient,literal,sourceBindingId,semanticStatus:'OFFICIAL_SOURCE' as const,runtimeSupport:'REQUIRES_RUNTIME_EXTENSION' as const};
      let m: RegExpMatchArray | null;
      if ((m=literal.match(/^\[shuffle\](Push|Pull) (\d+)(?: or (?:\[shuffle\])?(Push|Pull) (\d+))?$/))) {
        const timing = actor==='SELF'?defer('C2B-MOVEMENT-ORDER',['after roll before other effects','before attack roll']):binding('core:p20:target-effects');
        result.push({...base,kind:'MOVEMENT',type:m[1].toUpperCase() as 'PUSH'|'PULL',direction:m[1].toUpperCase() as 'PUSH'|'PULL',distance:printed(Number(m[2])),alternative:m[3]?{direction:m[3].toUpperCase() as 'PUSH'|'PULL',distance:Number(m[4])}:null,timing,timingSemanticStatus:timing.semanticStatus,optionality:m[3]?printed('CHOOSE_PRINTED_ALTERNATIVE'):absent()});
      } else if ((m=literal.match(/^Change: (Human|Beast)$/))) {
        result.push({...base,kind:'TRANSFORM',from:m[1]==='Beast'?'HUMAN':'BEAST',to:m[1].toUpperCase() as 'HUMAN'|'BEAST',atomicOrdering:defer('C2B-TRANSFORM-TIMING',[text])});
      } else if (literal.startsWith('Transfer all ')) {
        result.push({...base,kind:'CONDITION_TRANSFER',conditionTypes:['bleed','blight'],connective:'OR',quantity:'ALL',destination:'SELF',stackSemantics:defer('C2B-TRANSFER-STACKS',[literal])});
      } else if (literal.startsWith('Ignores ')) {
        for (const d of literal.matchAll(/\[(guard|protection)\]/g)) result.push({...base,kind:'IGNORE_DEFENSE',defense:d[1] as 'guard'|'protection',executionPhase:defer('C2B-MODIFIER-PHASE',[literal])});
      } else if ((m=literal.match(/^\[damage\]\+(\d+) (vs |if )(.*)$/))) {
        const values = [...m[3].matchAll(/\[([^\]]+)\]/g)].map(x=>x[1]);
        result.push({...base,kind:'DAMAGE_MODIFIER',amount:Number(m[1]),predicate:{subject:m[3].includes('Flagellant has')?'SELF':'TARGET',kind:values.length?'CONDITION':'TYPE',values:values.length?values:[m[3]],connective:values.length>1?defer('C2B-CONDITIONAL-CONNECTIVE',[m[3]]):'SINGLE',literal:m[3]},executionPhase:defer('C2B-MODIFIER-PHASE',[literal])});
      } else if (literal.startsWith('Remove ')) {
        for (const d of literal.matchAll(/\[([^\]]+)\]/g)) result.push({...base,kind:'CONDITION',operation:'REMOVE',conditionType:d[1],magnitude:absent(),duration:absent(),resistanceInteraction:binding('core:p21:condition-removal')});
      } else if ((m=literal.match(/^(\d+)?\[(bleed|blight|stun|buff|debuff|protection|guard|mark|riposte)\](\d+)t$/))) {
        result.push({...base,kind:'CONDITION',operation:'APPLY',conditionType:m[2],magnitude:m[1]?printed(Number(m[1])):absent(),duration:printed(Number(m[3])),resistanceInteraction:binding('core:p21:conditions-resistances')});
      } else if ((m=literal.match(/^(\d+)\[heart-outline\]$/))) {
        result.push({...base,kind:'WOUNDS',amount:Number(m[1])});
      } else if ((m=literal.match(/^\[(stress|heal|torch|dodge|heart-outline|damage)\]([+-]?\d+)$/))) {
        result.push({...base,kind:({'stress':'STRESS','heal':'HEALING','torch':'LIGHT','dodge':'DODGE','heart-outline':'WOUNDS','damage':'DAMAGE'} as const)[m[1] as 'stress'],amount:Number(m[2])});
      } else { throw new Error('Unmapped clear combat clause '+sourceBindingId+': '+literal); }
    }
  }
  return result;
}
function action(face: any, id: string): HeroProductionSkillAction {
  const n=face.numericFields, text=face.manualGlyphAwareTranscription;
  const hasHeal=n.heal.printed==='PRESENT';
  const e=effects(text,id), hasAttack=n.damage.printed==='PRESENT';
  return {printedName:face.printedName,sourceBindingId:id,
    kind:e.some(x=>x.kind==='TRANSFORM')?'transform':(hasAttack||hasHeal)&&e.length?'mixed':hasHeal?'heal':hasAttack?'attack':e.some(x=>x.kind==='MOVEMENT')?'movement':'support',
    activation:{usableFromStances:field(face.glyphFields.usableFromStances),formRequirement:text.includes('Human Form Only')?'HUMAN':text.includes('Beast Form Only')?'BEAST':'ANY',actionCost:absent()},
    roll:{kind:'SKILL_ACCURACY',requiresRoll:n.accuracy.printed==='PRESENT',accuracy:field(n.accuracy),crit:field(n.crit),semanticStatus:'OFFICIAL_SOURCE',ruleBinding:'core:p19:skill-roll'},
    effectTimingRules:{self:binding('core:p20:self-effects'),target:binding('core:p20:target-effects'),exceptions:[...new Set(e.flatMap(effect=>effect.kind==='MOVEMENT'&&effect.actor==='SELF'?[deferredIds['C2B-MOVEMENT-ORDER']]:effect.kind==='TRANSFORM'?[deferredIds['C2B-TRANSFORM-TIMING']]:effect.kind==='CONDITION_TRANSFER'?[deferredIds['C2B-TRANSFER-STACKS']]:['IGNORE_DEFENSE','DAMAGE_MODIFIER'].includes(effect.kind)?[deferredIds['C2B-MODIFIER-PHASE']]:[]))]},
    targeting:targeting(face),attack:hasAttack?{accuracy:field(n.accuracy),damage:field(n.damage),crit:field(n.crit),critDamage:field(n.critDamage)}:null,
    healing:hasHeal?{wounds:field(n.heal),critWounds:field(n.critHeal),stress:absent()}:null,
    selfEffects:e.filter(e=>e.actor==='SELF'),targetEffects:e.filter(e=>e.actor==='TARGET'),literal:text,printedGlyphs:face.glyphs,
    printedFields:projectFields({...n,...face.glyphFields,textClauses:face.textClauses,formRestriction:face.formRestriction,selfEffects:face.selfEffects,targetEffects:face.targetEffects,specialClauses:face.specialClauses,movement:face.movement,conditions:face.conditions,stress:face.stress,timing:face.timing})};
}

function hamlet(literal: string, heroId: string, level: any, sourceBindingId: string): any {
  // Actor transitions and roll/choice branches are source data, never implicit execution.
  const choices=literal.replace(/^Hamlet Skill: /,'').split(' or ').map(choice => {
    const effects: HeroProductionEffect[]=[];
    const targets:any[]=[];
    let actor:'SELF'|'TARGET'='SELF',recipient:'SELF'|'HERO'|'ALL_ALLIES'='SELF';
    let branch:string|null=null;
    const token=/Self:? |All Heroes (?:\[hero-target\])+:? |(?:\[hero-target\])+(?::)? |\d+-\d+: |(?:[+-]?\d+\s*)?\[[a-z-]+\](?:[+-]?\d+t?)?/g;
    for(const m of choice.matchAll(token)) {
      const t=m[0];
      if(t.startsWith('Self')) {actor='SELF';recipient='SELF';targets.push({scope:'SELF',count:absent()});continue;}
      if(t.startsWith('All Heroes')||t.startsWith('[hero-target]')) {
        actor='TARGET';recipient=t.startsWith('All Heroes')?'ALL_ALLIES':'HERO';
        targets.push({scope:recipient==='ALL_ALLIES'?'ALL_HEROES':'HERO',count:recipient==='ALL_ALLIES'?absent():printed([...t.matchAll(/\[hero-target\]/g)].length)});continue;
      }
      if(/^\d+-\d+:/.test(t)) {branch=t.replace(/: $/,'');continue;}
      const x=t.match(/^([+-]?\d+)?\s*\[([a-z-]+)\]([+-]?\d+)?(t)?$/)!;
      if(x[2]==='d10')continue;
      const value=x[1]?Number(x[1]):x[3]?Number(x[3]):null;
      const preceding=choice.slice(0,m.index),following=choice.slice(m.index!+t.length);
      const base={actor,recipient,literal:t,sourceBindingId,semanticStatus:'OFFICIAL_SOURCE' as const,runtimeSupport:'REQUIRES_RUNTIME_EXTENSION' as const};
      const optional=choice.includes(' OR ')&&preceding.includes(',');
      if(branch||following.startsWith(' per ')||optional||preceding.includes(' per ')) {
        effects.push({...base,kind:'CAMPAIGN_OPERATION',operation:optional?'CHOICE_ALTERNATIVE':following.startsWith(' per ')?'CONDITIONAL_SCALAR':preceding.includes(' per ')?'PREDICATE_OPERAND':'D10_OUTCOME',operands:{glyph:x[2],value,duration:x[4]?Number(x[3]):null,operation:/[Rr]emove\s*$/.test(preceding)?'REMOVE':null,rollRange:branch,choiceGroup:optional?'WOUND_CARE':null,predicateLiteral:following.startsWith(' per ')?following:null,clause:choice}});
      } else if(['buff','debuff','protection','bleed','blight','guard','mark','stun','disease'].includes(x[2])) {
        effects.push({...base,kind:'CONDITION',operation:/[Rr]emove\s*$/.test(preceding)?'REMOVE':'APPLY',conditionType:x[2],magnitude:absent(),duration:x[4]?printed(Number(x[3])):absent(),resistanceInteraction:binding('core:p21:conditions')});
      } else if(['stress','heal','damage','heart-outline'].includes(x[2])) {
        if(value===null)throw new Error('Missing Hamlet scalar '+sourceBindingId);
        effects.push({...base,kind:({'stress':'STRESS','heal':'HEALING','damage':'DAMAGE','heart-outline':'WOUNDS'} as const)[x[2] as 'stress'],amount:value});
      } else {
        effects.push({...base,kind:'CAMPAIGN_OPERATION',operation:x[2]==='gold'?'PAY':x[2]==='loot-chest'?'DRAW_LOOT':x[2]==='virtue-card'?'GAIN_VIRTUE':'PREDICATE_OPERAND',operands:{glyph:x[2],value,clause:choice}});
      }
    }
    const campaign=(operation:string,operands:any)=>effects.push({kind:'CAMPAIGN_OPERATION',operation,operands,actor:'SELF',recipient:'SELF',literal:choice,sourceBindingId,semanticStatus:'OFFICIAL_SOURCE',runtimeSupport:'REQUIRES_RUNTIME_EXTENSION'});
    if(choice.includes('Caretaker'))campaign('REMOVE_CARETAKER',{from:'PLAY'});
    if(choice.includes('Quirk'))campaign('REMOVE_QUIRK',{choiceGroup:'WOUND_CARE'});
    if(choice.includes('reveal a Room'))campaign('REVEAL_ROOM',{quantity:1,trigger:'NEXT_DUNGEON'});
    if(choice.includes('Trinkets'))campaign('D10_TRINKET_CHOICE',{outcomes:[...choice.matchAll(/(\d+)-(\d+): (.*?)(?= \d+-\d+:|$)/g)].map(m=>({rollMin:Number(m[1]),rollMax:Number(m[2]),drawCount:Number(m[3].match(/Draw (\d+)/)![1]),levelOffset:m[3].includes('1 Level higher')?1:0,keep:m[3].includes('keep them')?'ALL':'CHOOSE_ONE',literal:m[3]}))});
    if(choice.includes('additional one'))campaign('DUNGEON_TILE_CHOICE',{trigger:'NEXT_DUNGEON_SETUP',additionalDrawCount:1,selection:'CHOOSE_ONE',literal:choice});
    return {literal:choice,effects,targets};
  });
  return {printedName:literal.replace(/^Hamlet Skill: /,'').split(/ Self| \[| \(| Choose| Pay| Draw| Remove/)[0],level,literal,
    timing:{firstActionOfDay:literal.includes('first action of a day'),dayEndsImmediately:literal.includes('Day ends immediately'),oncePerHamletPhase:literal.includes('once per Hamlet phase')},choices,
    delayedEffects:literal.includes('next Dungeon')?[{trigger:literal.includes('setup the Dungeon')?'NEXT_DUNGEON_SETUP':'NEXT_DUNGEON',literal,effects:choices.flatMap(c=>c.effects).filter(e=>e.kind==='CAMPAIGN_OPERATION'&&['REVEAL_ROOM','DUNGEON_TILE_CHOICE'].includes(e.operation)),storage:defer('C2B-SERIALIZATION',[literal])}]:[],
    preparationDays:heroId==='crusader'?defer('C2B-CRUSADER-PREPARATION',['Preparation Days -1','PRINTED_ABSENT']):absent(),
    semanticStatus:'OFFICIAL_SOURCE',deferredFields:heroId==='crusader'?[deferredIds['C2B-CRUSADER-PREPARATION']]:[]};
}

export function compileC2C() {
  const p=readArtifact('c2b-hero-profile-literals').profiles, s=readArtifact('c2b-hero-skill-literals').forms;
  const register=makeRegister(p,s);validateDeferredRecords(register);
  const bindings:any[]=[];const provenance:any[]=[];
  function bind(id:string,form:string,artifact:string,row:any,sources:any[]) {
    bindings.push({id,sourceFormId:form,sourceArtifact:artifact,literalDigest:digest(row)});
    provenance.push({id,sourceFormId:form,officialSources:sources,literalDigest:digest(row)});
  }
  // Rule bindings use the same locked official bytes reviewed by C2B.
  for (const [id,page,region] of [
    ['core:p19:skill-roll',19,'Accuracy and Skills without an Accuracy roll'],
    ['core:p20:self-effects',20,'Self Effects after roll before other effects; movement discrepancy separately deferred'],
    ['core:p20:target-effects',20,'Target Effects'],
    ['core:p21:condition-removal',21,'Condition removal'],
    ['core:p21:conditions-resistances',21,'Conditions and resistances'],
    ['core:p21:conditions',21,'Conditions'],
  ] as const) {
    const source={path:'docs/DD_EN_COREBOX_RULES.pdf',sha256:'9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae',page,region,authority:'OFFICIAL_RULEBOOK'};
    bind(id,'rulebook:p'+page,source.path,source,[source]);
  }
  const deferredFor=(id:string)=>register.filter(r=>r.affectedForms.includes(id)).map(r=>r.deferredId);
  const profiles:HeroProductionProfileDefinition[]=p.map((row:any)=>{
    const form=`${row.heroId}:profile:L${row.level}`,id='c2b:'+form;
    bind(id,form,'c2b-hero-profile-literals.json',row,row.forms.map((f:any)=>f.sourceRef));
    const variants:any={};
    for(const f of row.forms) {
      const vId=id+':'+f.form,fields=f.literalFields;
      bind(vId,form,'c2b-hero-profile-literals.json',f,[f.sourceRef]);
      variants[f.form==='HUMAN_FORM'?'human':f.form==='BEAST_FORM'?'beast':'default']={formVariant:f.form,sourceBindingId:vId,
        life:field(fields.life),dodge:field(fields.dodge),speed:field(fields.speed),movement:field(fields.movement),stances:{starting:field(fields.startingStances),available:field(fields.availableStances)},tags:field(fields.heroTypeTags),categoricalResistances:field(fields.resistances),immunities:field(fields.immunities),
        hamletAbility:fields.hamletAbility.printed==='ABSENT'?null:hamlet(fields.hamletAbility.literal,row.heroId,row.level,vId),printedFields:projectFields(fields),printedGlyphs:f.glyphs};
    }
    return {...versions,heroId:row.heroId,level:row.level,printedName:row.forms[0].printedHeroName,sourceBindingId:id,variants,contentSet:row.contentSet,semanticStatus:'OFFICIAL_SOURCE',deferredSemanticIds:deferredFor(form)};
  });
  const skills:HeroProductionSkillDefinition[]=s.map((row:any)=>{
    const form=`${row.skillId}:L${row.level}`,id='c2b:'+form;
    bind(id,form,'c2b-hero-skill-literals.json',row,[row.sourceFront,row.sourceBack]);
    for(const side of ['front','back'])bind(id+':'+side,form,'c2b-hero-skill-literals.json',row[side+'Literal'],[row[side==='front'?'sourceFront':'sourceBack']]);
    const back=row.backLiteral;
    return {...versions,heroId:row.heroId,skillId:row.skillId,printedName:row.printedName,level:row.level,physicalCardId:row.physicalCardId,sourceBindingId:id,
      actions:{front:action(row.frontLiteral,id+':front'),back:back.role==='GAMEPLAY_ACTION'?action(back,id+':back'):null},
      printedBack:{role:back.role,printedName:back.printedName,literal:back.manualGlyphAwareTranscription,printedGlyphs:back.glyphs,printedFields:projectFields({...back.numericFields,...back.glyphFields,textClauses:back.textClauses,formRestriction:back.formRestriction,selfEffects:back.selfEffects,targetEffects:back.targetEffects,specialClauses:back.specialClauses,movement:back.movement,conditions:back.conditions,stress:back.stress,timing:back.timing})},
      semanticStatus:'OFFICIAL_SOURCE',deferredSemanticIds:deferredFor(form)};
  });
  return {profiles,skills,bindings,provenance,register,policy:SOURCE_AMBIGUITY_DEFER_POLICY_V1};
}
