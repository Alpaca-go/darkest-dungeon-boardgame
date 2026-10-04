import type {RuntimeSkill, RuntimeAction, RuntimeEffect} from '../../types/hero-runtime';
import type {PrintedField} from '../../types/hero-production';
function value<T>(f:PrintedField<T>|undefined) {if(!f||f.presence!=='PRINTED_VALUE') return '—';return Array.isArray(f.value)?f.value.join(', '):typeof f.value==='object'?JSON.stringify(f.value):String(f.value);}
function effect(e:RuntimeEffect):string {
 switch(e.kind) {
  case 'CONDITION':return `${e.operation} ${e.conditionType} ${value(e.magnitude)} (${value(e.duration)} turns)`;
  case 'MOVEMENT':return `${e.type} ${value(e.distance)}${e.alternative?` or ${e.alternative.direction} ${e.alternative.distance}`:''}`;
  case 'TRANSFORM':return `${e.from} → ${e.to}: manual validation pending`;
  case 'DAMAGE_MODIFIER':return `${e.amount} Damage when ${e.predicate.subject} ${e.predicate.values.join(' / ')}`;
  case 'IGNORE_DEFENSE':return `Ignore ${e.defense}`;
  case 'CONDITION_TRANSFER':return `Transfer ${e.conditionTypes.join(' / ')} to Self`;
  default:return `${e.kind} ${'amount' in e?e.amount:''}`;
 }
}
export function targetSummary(a:RuntimeAction):string {
 const count=(v:{kind:string;value?:number})=>v.kind==='all'?'all':`${v.kind==='upTo'?'up to ':''}${v.value}`;
 const side=(s:string)=>s==='HERO'?'allies':'enemies';
 return a.targeting.groups.length?a.targeting.groups.map(g=>`${count(g.targetCount)} ${side(g.side)}`).join(' and '):a.targeting.scope==='SELF'?'Self':`${a.targeting.targetCount?count(a.targeting.targetCount):''} ${a.targeting.scope==='ALL_ALLIES'?'allies':'enemies'}`;
}
function ActionFields({a}:{a:RuntimeAction}) {return <div className="text-xs space-y-1">
 <p>Accuracy {value(a.roll.accuracy)} · Damage {value(a.attack?.damage)} · Crit {value(a.roll.crit)} · Crit Damage {value(a.attack?.critDamage)}</p>
 <p>Heal {value(a.healing?.wounds)} · Stress {value(a.healing?.stress)} · Range {value(a.targeting.range)}</p>
 <p>Targets {targetSummary(a)} · Stances {value(a.activation.usableFromStances)} · Form {a.activation.formRequirement}</p>
 <p>Self effects: {a.selfEffects.map(effect).join('; ')||'—'}</p>
 <p>Target effects: {a.targetEffects.map(effect).join('; ')||'—'}</p>
 </div>;}
export default function ProductionSkillCard({skill,equipped,disabled,onClick}:{skill:RuntimeSkill;equipped?:boolean;disabled?:boolean;onClick?:()=>void}) {
 return <section data-testid={'production-skill-'+skill.skillId} data-level={skill.level} className="rounded border border-dd-border p-3 space-y-2">
 <button type="button" disabled={disabled} onClick={onClick} className="font-bold" data-testid={'equip-'+skill.skillId}>{skill.printedName} · {['','I','II','III'][skill.level]} {equipped?'✓':''}</button>
 <ActionFields a={skill.actions.front}/>
 {skill.actions.back&&<details><summary>{skill.actions.back.printedName}</summary><ActionFields a={skill.actions.back}/></details>}
 {skill.deferredSemanticIds.length>0&&<span data-testid="manual-validation" className="block text-xs text-amber-400">Manual validation pending</span>}
 </section>;
}
