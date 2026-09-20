// Semantic interpretation only. Original wording lives in literal-observations.json.
// This is a source-domain IR, deliberately not TrinketDefinition or executable effects.
const op = (kind, parameters={}) => ({kind,...parameters});
const modifier = (stat,amount) => op('modify',{stat,amount});
const condition = (condition,turns,amount=null) => op('apply-condition-stack',{condition,turns,amount});
const s = (trigger,target,effects,conditions=[]) => ({trigger,useWindow:'declare-when-applicable',target,modifiers:effects.filter(x=>x.kind==='modify'),effects:effects.filter(x=>x.kind!=='modify'),conditions,semanticNotes:[],unresolvedFields:[]});
const self = (...effects) => s('voluntary-declaration','equipped-hero',effects);
const attack = (stat,amount,conditions=[]) => s('hero-skill-resolution','skill', [modifier(stat,amount)],conditions);
const hit = (...effects) => s('hero-hit-by-attack','equipped-hero',effects);
const stress = n => self(op('change-stress',{amount:n}));
const stance = (value,negated=false) => ({kind:'stance',value,negated});
const light = (operator,value=3) => ({kind:'light',operator,value});
const charm = (type,turns,amount=null) => [s('hero-skill-hits','skill-target',[condition(type,turns,amount)]),s('hero-causes-condition','condition-being-caused',[op('modify-condition-duration',{turns:-1})])];
export function trinketSemantics(cell) {
  const m = {
    '453-0':[attack('accuracy',1),attack('accuracy',-1)],
    '453-1':[attack('accuracy',2,[stance('ranged')]),attack('accuracy',-1)],
    '453-2':charm('bleed',2,2), '453-3':charm('blight',2,2),
    '453-4':[s('scout','equipped-hero',[op('prevent-stress',{source:'scouting'})]),self(op('change-light',{amount:-1}))],
    '453-5':[attack('crit',2),attack('accuracy',-2)],
    '453-6':[attack('damage',3),s('hero-takes-damage','equipped-hero',[op('suffer-wounds',{amount:2})])],
    '453-7':charm('debuff',2),
    '453-8':[attack('accuracy',2,[stance('support')]),attack('accuracy',-1)],
    '453-9':[self(op('choose-one',{options:[modifier('movement',1),modifier('dodge',1)]})),self(op('choose-one',{options:[modifier('movement',-1),modifier('dodge',-1)]}))],
    '453-10':charm('stun',1),
    '453-11':[s('exploration-die-result','exploration-die',[op('ignore-result',{options:['trap','hunger']})]),s('exploration-die-result','exploration-die',[op('replace-result',{from:'not-trap',to:'trap'})])],
    '453-12':[attack('accuracy',2,[stance('aggressive')]),attack('accuracy',-1)],
    '453-13':[attack('accuracy',2,[stance('defensive')]),attack('accuracy',-1)],
    '453-14':[self(op('consume-provision',{provision:'food',amount:1}),op('heal',{amount:10})),hit(condition('bleed',2,3))],
    '453-15':[s('disease-acquired','new-disease',[op('discard-disease',{immediately:true})]),self(modifier('movement',-2))],
    '453-16':[stress(-3),hit(op('convert-incoming-hit-to-critical'))],
    '453-17':[stress(-2),self(modifier('dodge',-2))],
    '453-18':[s('incoming-attack','equipped-hero',[modifier('dodge',2)],[light('>=')]),hit(condition('stun',1))],
    '453-19':[s('hero-heals','healing-delivered',[modifier('healing',2)]),s('hero-is-healed','healing-received',[modifier('healing',-4)])],
    '453-20':[attack('crit',2,[light('<=')]),s('hero-skill-hits','skill',[op('set-damage',{amount:0})],[light('>=')])],
    '453-21':[hit(op('scale-incoming-damage',{factor:0.5,rounding:'up'})),self(modifier('movement',-1))],
    '453-22':[s('hero-is-healed','equipped-hero',[op('receive-healing',{amount:4,operation:null})]),hit(condition('bleed',3,1))],
    '453-23':[s('camping','party-provisions',[op('roll-provision-dice',{count:2})]),s('scout','equipped-hero',[op('change-stress',{amount:1})])],
    '453-24':[s('hero-skill-resolution','skill',[modifier('accuracy',1),modifier('crit',1)]),stress(1)],
    '453-25':[attack('crit',2,[light('>=')]),s('hero-skill-hits','skill',[op('set-damage',{amount:0})],[light('<=')])],
    '453-26':[self(op('gain-action',{count:1})),stress(1)],
    '453-27':[s('voluntary-declaration','equipped-hero',[op('change-stress',{amount:-9})],[light('<=')]),s('resolve-test-result-determined','equipped-hero',[modifier('virtue-chance',-2)],[light('<=')])],
    '453-28':[self(modifier('dodge',5)),self(op('consume-provision',{provision:'food',amount:1,applyNormalBenefit:false}))],
    '453-29':[self(op('heal',{amount:9})),stress(2)],
    '453-30':[attack('crit',4,[stance('ranged')]),attack('accuracy',-2,[stance('ranged',true)])],
    '453-31':[attack('crit',4,[stance('aggressive')]),attack('accuracy',-2,[stance('aggressive',true)])],
    '453-32':[attack('crit',4,[stance('defensive')]),attack('accuracy',-2,[stance('defensive',true)])],
    '453-33':[attack('crit',4,[stance('support')]),attack('accuracy',-2,[stance('support',true)])],
    '453-34':[s('voluntary-declaration','equipped-hero',[op('change-stress',{amount:-3})],[light('>=')]),s('resolve-test-result-determined','equipped-hero',[modifier('virtue-chance',-2)],[light('>=')])],
    '453-35':[stress(-4),self(op('suffer-damage',{amount:6}))],
    '453-36':[s('voluntary-declaration','self-and-heroes-in-same-area',[op('heal',{amount:6})]),self(op('change-light',{amount:-2}))],
    '453-37':[s('voluntary-declaration','all-heroes',[op('remove-all-condition-stacks',{conditions:['bleed','blight','debuff','stun','mark']})]),self(op('gain-quirk',{polarity:'negative',count:1}))],
    '466-0':[self(op('heal',{amount:20})),self(op('discard-resource',{resource:'printed-crystal',count:1}))],
    '466-1':[s('hero-skill-hits','skill-target',[condition('stun',2)]),stress(2)],
    '466-2':[self(condition('buff',3),condition('buff',2),condition('buff',1)),s('voluntary-declaration','all-four-heroes',[op('change-stress',{amount:2})])],
    '466-3':[s('before-skill-roll','skill-and-equipped-hero',[modifier('crit',6),modifier('damage',6),op('heal',{amount:6,target:'equipped-hero'})]),self(op('discard-resource',{resource:'printed-crystal',count:1}))],
    '466-4':[self(op('gain-action',{count:1})),self(op('discard-resource',{resource:'printed-crystal',count:1}))],
    '466-5':[self(op('remove-all-condition-stacks',{conditions:['blight','bleed','mark']})),self(condition('debuff',1))],
    '466-6':[self(condition('protection',3)),self(condition('bleed',3,1))],
    '466-7':[self(condition('protection',2),condition('guard',2)),stress(2)],
    '466-8':[s('targeted-by-attack','equipped-hero',[modifier('dodge',3)]),s('voluntary-declaration','next-hero-skill',[modifier('accuracy',-1)])],
    '466-9':[attack('crit',2),s('hero-attack-misses','equipped-hero',[op('suffer-wounds',{amount:3})])],
    '466-10':[stress(-9),self(condition('blight',3,2))]
  };
  const result=m[cell]; if(!result) throw Error(`No semantic interpretation: ${cell}`);
  if(cell==='453-22') { result[0].unresolvedFields=['effects.0.operation']; result[0].semanticNotes.push('Printed receive healing 4 has no plus sign. Additional versus replacement healing is not independently resolved; do not invent +4.'); }
  if(cell==='453-12') result[0].semanticNotes.push('Printed duplicate Acc is preserved in literal evidence; only one +2 numerical modifier is printed.');
  if(cell==='466-2') result[0].semanticNotes.push('Three independent Buff stacks (3t, 2t, 1t); never collapse to one 6t stack.');
  return result;
}

export function classifyTrinket(side) {
  const gaps=[];
  const candidates=[];
  for(const m of side.modifiers) {
    if(['accuracy','crit','damage','healing','dodge'].includes(m.stat)) candidates.push(`ActiveModifierDefinition:${m.stat}`);
    else gaps.push(`No TrinketModifierType:${m.stat}`);
  }
  for(const e of side.effects) {
    const candidate=({'heal':'heal-self','change-stress':e.amount<0?'recover-stress-self':'stress-self','change-light':'change-light','consume-provision':'consume-provision','suffer-damage':'damage-self'})[e.kind];
    if(candidate) candidates.push(`ActiveEffectDefinition:${candidate}`);
    else if(e.kind==='apply-condition-stack') { candidates.push('shared applyStatusEffectEvent'); gaps.push('ActiveEffectDefinition cannot express independent magnitude and turns / non-self target'); }
    else gaps.push(`No exact active trinket primitive:${e.kind}`);
  }
  if(side.conditions.some(c=>c.kind==='stance')) gaps.push('TrinketUseCondition has no stance predicate');
  if(side.target==='self-and-heroes-in-same-area'||side.target==='all-four-heroes'||side.target==='all-heroes') gaps.push('ActiveEffectDefinition only addresses self; group/area targeting needs adapter');
  // WIRED_WINDOWS is not equivalent to the type union. Unwired or arbitrary timing
  // cannot be certified by merely finding an enum member.
  if(side.trigger!=='before-skill-roll')gaps.push(`Exact applicable timing ${side.trigger} is not fully exposed by WIRED_WINDOWS (before-attack-roll, hero-turn-start, room-entered)`);
  return {classification:side.unresolvedFields.length?'SOURCE_UNRESOLVED':gaps.length?'RUNTIME_PRIMITIVE_UNSUPPORTED':candidates.length>1?'NEEDS_COMPOSITE_EXISTING_PRIMITIVES':'SUPPORTED_EXISTING_PRIMITIVES',existingCandidates:[...new Set(candidates)],missingCapabilities:[...new Set(gaps)],productionIntegration:'not-integrated'};
}
