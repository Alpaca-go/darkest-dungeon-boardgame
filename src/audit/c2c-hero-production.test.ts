import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {HERO_PRODUCTION_PROFILES} from '../data/heroes/production-profiles';
import {HERO_PRODUCTION_SKILLS} from '../data/heroes/production-skills';
import {HERO_PRODUCTION_SOURCE_BINDINGS} from '../data/heroes/production-source-bindings';
import {HERO_PRODUCTION_DEFINITION_REGISTRY,HERO_PRODUCTION_SKILL_REGISTRY,getProductionHeroProfile,getProductionHeroSkill,getProductionSkillsByHero} from '../data/heroes/production-registry';
import {compileC2C,readArtifact,digest} from '../../scripts/audit/c2c-source-compiler';
import {validateProductionDefinitions,verifyC2CIsolation,buildC2CArtifacts} from '../../scripts/audit/c2c-hero-production';
import {validateDeferredRecords,validateForwardSemanticPolicy} from '../../scripts/audit/source-ambiguity-policy';
const c=compileC2C();
const skill=(id:string,level:1|2|3=1)=>getProductionHeroSkill(id,level)!;
const variant=(id:string,level:1|2|3=1)=>{const p=getProductionHeroProfile(id,level)!;return 'default' in p.variants?p.variants.default:p.variants.human;};
describe('C2C source-backed candidate definition layer',()=>{
  it('counts TypeScript records and every per-Hero identity without runtime selection',()=>{
    expect(Object.keys(HERO_PRODUCTION_DEFINITION_REGISTRY)).toHaveLength(18);
    expect(HERO_PRODUCTION_PROFILES).toHaveLength(54);expect(HERO_PRODUCTION_SKILLS).toHaveLength(378);
    expect(new Set(HERO_PRODUCTION_SKILLS.map(s=>s.skillId)).size).toBe(126);
    expect(Object.keys(HERO_PRODUCTION_SKILL_REGISTRY)).toHaveLength(378);
    for(const h of Object.keys(HERO_PRODUCTION_DEFINITION_REGISTRY)) {
      expect(HERO_PRODUCTION_DEFINITION_REGISTRY[h].profiles).toHaveLength(3);
      expect(HERO_PRODUCTION_DEFINITION_REGISTRY[h].skillIds).toHaveLength(7);
      for(const l of [1,2,3] as const)expect(getProductionSkillsByHero(h,l)).toHaveLength(7);
    }
  });
  it('represents each frozen source form exactly once and validates all compact bindings',()=>{
    validateProductionDefinitions(HERO_PRODUCTION_PROFILES,HERO_PRODUCTION_SKILLS,c.register);
    const ids=[...HERO_PRODUCTION_PROFILES,...HERO_PRODUCTION_SKILLS].map(d=>d.sourceBindingId);
    expect(new Set(ids).size).toBe(432);
    for(const d of readArtifact('c2b-hero-skill-literals').forms) {
      const b=HERO_PRODUCTION_SOURCE_BINDINGS.find(b=>b.id==='c2b:'+d.skillId+':L'+d.level)!;
      expect(b.literalDigest).toBe(digest(d));
      const a=skill(d.skillId,d.level).actions.front;
      for(const [name,f] of Object.entries(d.frontLiteral.numericFields) as [string,any][])expect(a.printedFields[name]).toEqual(f.printed==='ABSENT'?{presence:'PRINTED_ABSENT'}:{presence:'PRINTED_VALUE',value:f.literal});
      expect(a.literal).toBe(d.frontLiteral.manualGlyphAwareTranscription);
      expect(a.printedGlyphs).toEqual(d.frontLiteral.glyphs);
    }
  });
  it('preserves independent Level II and III structure rather than a progression formula',()=>{
    expect([1,2,3].map(l=>skill('shieldbreaker-puncture',l as 1|2|3).actions.front.targeting.range)).toEqual([{presence:'PRINTED_VALUE',value:'2'},{presence:'PRINTED_VALUE',value:'1-2'},{presence:'PRINTED_VALUE',value:'1-2'}]);
    expect(skill('shieldbreaker-serpent-sway',3).actions.front.targetEffects).toContainEqual(expect.objectContaining({kind:'CONDITION',conditionType:'protection',duration:{presence:'PRINTED_VALUE',value:2}}));
    expect(variant('crusader',2).life).toEqual({presence:'PRINTED_VALUE',value:24});
    expect(variant('crusader',3).dodge).toEqual({presence:'PRINTED_VALUE',value:2});
    expect(variant('crusader').speed).toEqual({presence:'PRINTED_ABSENT'});
  });
  it('keeps printed absence separate from zero and known omitted Accuracy rule',()=>{
    expect(skill('crusader-bulwark-of-faith').actions.front.printedFields.accuracy).toEqual({presence:'PRINTED_ABSENT'});
    expect(skill('crusader-bulwark-of-faith').actions.front.attack).toBeNull();
    expect(skill('crusader-bulwark-of-faith').actions.front.roll).toMatchObject({kind:'SKILL_ACCURACY',requiresRoll:false,accuracy:{presence:'PRINTED_ABSENT'},ruleBinding:'core:p19:skill-roll'});
    expect(skill('crusader-smite').actions.front.roll.requiresRoll).toBe(true);
    expect(variant('crusader').dodge).toEqual({presence:'PRINTED_VALUE',value:0});
  });
  it('separates healing Accuracy rolls from damage attacks at every independently printed level',()=>{
    for(const row of readArtifact('c2b-hero-skill-literals').forms.filter((r:any)=>r.frontLiteral.numericFields.heal.printed==='PRESENT')) {
      const a=skill(row.skillId,row.level).actions.front,n=row.frontLiteral.numericFields;
      expect(['heal','mixed']).toContain(a.kind);
      expect(a.attack).toBeNull();
      expect(a.healing!.wounds).toEqual({presence:'PRINTED_VALUE',value:n.heal.literal});
      expect(a.healing!.critWounds).toEqual({presence:n.critHeal.printed==='ABSENT'?'PRINTED_ABSENT':'PRINTED_VALUE',...(n.critHeal.printed==='PRESENT'?{value:n.critHeal.literal}:{})});
      expect(a.roll.accuracy).toEqual({presence:'PRINTED_VALUE',value:n.accuracy.literal});
    }
    expect(skill('crusader-battle-heal').actions.front.kind).toBe('heal');
    expect(skill('vestal-divine-grace').actions.front.kind).toBe('heal');
    expect(skill('hound-master-lick-wounds').actions.front.kind).toBe('heal');
  });
  it('does not invent a damage attack for non-damage control and support rolls',()=>{
    for(const row of readArtifact('c2b-hero-skill-literals').forms.filter((r:any)=>r.frontLiteral.numericFields.damage.printed==='ABSENT')) {
      expect(skill(row.skillId,row.level).actions.front.attack).toBeNull();
    }
    expect(skill('jester-inspiring-tune').actions.front.kind).toBe('support');
    expect(skill('hellion-barbaric-yawp').actions.front.kind).toBe('support');
    expect(skill('jester-inspiring-tune').actions.front.roll.requiresRoll).toBe(true);
  });
  it('binds every Profile statistic and printed Hamlet literal to its own physical face',()=>{
    for(const row of readArtifact('c2b-hero-profile-literals').profiles)for(const face of row.forms) {
      const p=getProductionHeroProfile(row.heroId,row.level)!;
      const v='default' in p.variants?p.variants.default:face.form==='HUMAN_FORM'?p.variants.human:p.variants.beast;
      for(const name of ['life','dodge','speed','movement'] as const)expect(v[name]).toEqual(face.literalFields[name].printed==='ABSENT'?{presence:'PRINTED_ABSENT'}:{presence:'PRINTED_VALUE',value:face.literalFields[name].literal});
      expect(v.hamletAbility?.literal??null).toBe(face.literalFields.hamletAbility.literal);
      expect(v.printedGlyphs).toEqual(face.glyphs);
    }
  });
  it('keeps Human and Beast variants at one campaign level and paired transition side effects',()=>{
    for(const l of [1,2,3] as const) {
      const p=getProductionHeroProfile('abomination',l)!;expect(Object.keys(p.variants)).toEqual(['human','beast']);
      if('human' in p.variants)expect(p.variants.human.sourceBindingId).not.toBe(p.variants.beast.sourceBindingId);
      const a=skill('abomination-transform-to-beast',l).actions;
      expect(a.front.activation.formRequirement).toBe('HUMAN');expect(a.back!.activation.formRequirement).toBe('BEAST');
      expect(a.front.selfEffects).toContainEqual(expect.objectContaining({kind:'TRANSFORM',from:'HUMAN',to:'BEAST',atomicOrdering:{semanticStatus:'DEFERRED_MANUAL_VALIDATION',deferredId:'C2C-DEFER-TRANSFORM-ATOMIC-ORDER',canonical:false,executionBinding:null,literalVariants:[a.front.literal]}}));
      expect(a.front.targetEffects).toContainEqual(expect.objectContaining({kind:'STRESS',amount:2}));
      expect(a.back!.targetEffects).toContainEqual(expect.objectContaining({kind:'STRESS',recipient:'ALL_ALLIES',amount:-1}));
    }
  });
  it('keeps Musketeer physically independent from Arbalest and mixed recipient effects separate',()=>{
    expect(skill('musketeer-aimed-shot').physicalCardId).not.toBe(skill('arbalest-sniper-shot').physicalCardId);
    const a=skill('musketeer-skeet-shot').actions.front;
    expect(a.targeting.scope).toBe('GROUP');expect(a.targeting.groups).toHaveLength(2);
    expect(a.targetEffects.filter(e=>e.kind==='CONDITION'&&e.operation==='REMOVE').every(e=>e.recipient==='HERO')).toBe(true);
    expect(a.targetEffects.find(e=>e.kind==='CONDITION'&&e.conditionType==='debuff')?.recipient).toBe('MONSTER');
  });
  it('models party scope and independent Self/Target collections without fixed party IDs',()=>{
    const actions=HERO_PRODUCTION_SKILLS.map(s=>s.actions.front).filter(a=>a.targeting.scope==='ALL_ALLIES');
    expect(actions.length).toBeGreaterThan(0);for(const a of actions)expect(a.targeting.targetCount).toEqual({kind:'all'});
    const a=skill('highwayman-point-blank-shot').actions.front;
    expect(a.selfEffects[0]).toMatchObject({kind:'MOVEMENT',actor:'SELF',type:'PUSH',distance:{presence:'PRINTED_VALUE',value:1},timingSemanticStatus:'DEFERRED_MANUAL_VALIDATION'});
    expect(a.targetEffects[0]).toMatchObject({kind:'MOVEMENT',actor:'TARGET',type:'PUSH',timingSemanticStatus:'OFFICIAL_SOURCE'});
  });
  it('keeps official transfer operation while deferring only stack semantics',()=>{
    expect(skill('flagellant-suffer').actions.front.targetEffects[0]).toMatchObject({kind:'CONDITION_TRANSFER',semanticStatus:'OFFICIAL_SOURCE',conditionTypes:['bleed','blight'],connective:'OR',quantity:'ALL',destination:'SELF',stackSemantics:{canonical:false,executionBinding:null}});
    expect(skill('flagellant-suffer').actions.front.selfEffects).toHaveLength(2);
  });
  it('keeps conditional and type bonuses outside base Damage and Guard distinct from Protection',()=>{
    expect(skill('crusader-smite').actions.front.targetEffects).toContainEqual(expect.objectContaining({kind:'DAMAGE_MODIFIER',predicate:expect.objectContaining({kind:'TYPE',values:['Unholy']})}));
    expect(skill('flagellant-punish').actions.front.targetEffects[0]).toMatchObject({kind:'DAMAGE_MODIFIER',predicate:{subject:'SELF',values:['bleed','blight'],connective:{semanticStatus:'DEFERRED_MANUAL_VALIDATION',executionBinding:null}}});
    expect(skill('leper-intimidate').actions.front.targetEffects.filter(e=>e.kind==='IGNORE_DEFENSE').map(e=>e.kind==='IGNORE_DEFENSE'?e.defense:null)).toEqual(['protection','guard']);
  });
  it('keeps both Crusader source variants and no executable Preparation Day guess',()=>{
    for(const l of [1,2,3] as const)expect(variant('crusader',l).hamletAbility!.preparationDays).toMatchObject({semanticStatus:'DEFERRED_MANUAL_VALIDATION',canonical:false,executionBinding:null,literalVariants:['Preparation Days -1','PRINTED_ABSENT']});
    const g=c.register.find(g=>g.heroId==='crusader')!;expect(new Set(g.officialSources.map(s=>s.authority))).toEqual(new Set(['OFFICIAL_RULEBOOK','OFFICIAL_PRINTED_COMPONENT']));
    expect(g.officialSources.some(s=>s.page===5)).toBe(true);
  });
  it('models Hamlet actor transitions, dice branches and delayed operations without delaying immediate Stress',()=>{
    const a=variant('occultist').hamletAbility!.choices[0];
    expect(a.effects[0]).toMatchObject({kind:'STRESS',actor:'SELF',amount:1});
    expect(a.effects[1]).toMatchObject({kind:'HEALING',recipient:'HERO',amount:2});
    expect(variant('arbalest').hamletAbility!.choices[0].effects.filter(e=>e.kind==='CAMPAIGN_OPERATION').map(e=>e.kind==='CAMPAIGN_OPERATION'?e.operands:null)).toEqual(expect.arrayContaining([expect.objectContaining({rollRange:'1-3',value:4}),expect.objectContaining({rollRange:'4-8',value:2}),expect.objectContaining({rollRange:'9-10',value:2})]));
    const bounty=variant('bounty-hunter').hamletAbility!;
    expect(bounty.choices[0].effects[0]).toMatchObject({kind:'STRESS',amount:1});
    expect(bounty.delayedEffects[0].effects).toHaveLength(1);
    expect(bounty.delayedEffects[0].effects[0]).toMatchObject({kind:'CAMPAIGN_OPERATION',operation:'REVEAL_ROOM'});
    expect(variant('shieldbreaker').hamletAbility!.choices[0].targets).toContainEqual({scope:'ALL_HEROES',count:{presence:'PRINTED_ABSENT'}});
  });
  it('maps all historical gaps, groups shared ambiguity and never promotes it to canonical',()=>{
    expect(c.register).toHaveLength(8);validateDeferredRecords(c.register);
    for(const g of readArtifact('c2b-hero-semantic-gap-register').gaps.filter((g:any)=>g.executionRequired))expect(c.register.some(r=>r.historicalGapId===g.gapId)).toBe(true);
    const a=buildC2CArtifacts().artifacts;
    expect(a['c2c-hero-semantic-resolution-matrix'].unclassified).toBe(0);
    expect(a['c2c-c2b-conflict-disposition'].conflicts).toHaveLength(2);
    expect(a['c2c-prototype-to-production-migration-map'].skills).toHaveLength(28);
    expect(a['c2c-prototype-to-production-migration-map'].skills.find((r:any)=>r.runtimeSkillId==='hellion-bash')).toMatchObject({productionSkillId:null,action:'REMOVE_ON_C2D_MIGRATION'});
  });
  it('keeps live files, selectors, save format, Thing and source corpus unchanged',()=>{
    expect(verifyC2CIsolation()).toMatchObject({liveRuntimeIntegrated:false,saveVersionChanged:false,selectorChanged:false});
    expect(buildC2CArtifacts().artifacts['c2c-next-workstream-decision']).toMatchObject({C2DStarted:false,ThingStatus:'SOURCE_ACQUISITION_HOLD',ThingRuntimeAuthorized:false});
    expect(readArtifact('c2b-hero-literal-closure-acceptance').outcome).toBe('HERO_LITERAL_CLOSURE_BLOCKED');
  },120000);
  it('freezes nested candidate records and has no prototype dependency',()=>{
    expect(Object.isFrozen(skill('crusader-smite').actions.front)).toBe(true);
    expect(()=>{(variant('crusader').life as any).value=42;}).toThrow();
    for(const name of ['profiles','skills','registry','source-bindings'])expect(readFileSync('src/data/heroes/production-'+name+'.ts','utf8')).not.toMatch(/SKILL_LEVEL_BONUS|HERO_LEVEL_PROFILES|from ['"]\.\.\/skills|from ['"]\.\.\/heroes/);
  });
  it('validates forward policy independently of Hero definitions',()=>{
    const ids=new Set(c.register.map(r=>r.deferredId));
    expect(()=>validateForwardSemanticPolicy({semanticStatus:'SOURCE_UNRESOLVED',blocksNextPhase:true},ids)).toThrow();
    const field=variant('crusader').hamletAbility!.preparationDays;
    expect(()=>validateForwardSemanticPolicy(field,ids)).not.toThrow();
    expect(()=>validateForwardSemanticPolicy({...field,canonical:true},ids)).toThrow();
    expect(()=>validateForwardSemanticPolicy({...field,executionBinding:'SELF_BEFORE_ATTACK_ROLL'},ids)).toThrow();
    expect(()=>validateForwardSemanticPolicy({...field,blocksNextPhase:true},ids)).toThrow();
    expect(()=>validateForwardSemanticPolicy(field,new Set())).toThrow();
  });
  const mutations:[string,(p:any[],s:any[],r:any[])=>void][]=[
    ['missing Profile',p=>p.pop()],['missing Skill',(_p,s)=>s.pop()],
    ['prototype numeric substituted',p=>p[0].variants.default.life.value=42],
    ['absence defaulted to zero',(_p,s)=>s[0].actions.front.printedFields.accuracy={presence:'PRINTED_VALUE',value:0}],
    ['Level I copied into Level II',(_p,s)=>s[1].actions=s[0].actions],
    ['Human Beast flattened',p=>delete p.find(p=>p.heroId==='abomination').variants.beast],
    ['all allies fixed at four',(_p,s)=>s.find(s=>s.actions.front.targeting.scope==='ALL_ALLIES').actions.front.targeting.targetCount={kind:'exact',value:4}],
    ['deferred canonical',(_p,_s,r)=>r[0].canonical=true],
    ['deferred blocks next phase',(_p,_s,r)=>r[0].blocksNextPhase=true],
    ['source provenance discarded',(_p,_s,r)=>r[0].officialSources=[]],
    ['manual test discarded',(_p,_s,r)=>r[0].manualTestScenario=''],
    ['source conflict dropped',(_p,_s,r)=>r.shift()],
    ['ignore defense discarded',(_p,s)=>s.find(s=>s.skillId==='leper-intimidate').actions.front.targetEffects.pop()],
  ];
  it.each(mutations)('rejects %s',(_n,mutate)=>{const p=structuredClone(c.profiles),s=structuredClone(c.skills),r=structuredClone(c.register);mutate(p,s,r);expect(()=>validateProductionDefinitions(p,s,r)).toThrow();});
});
