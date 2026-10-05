import {targetSummary} from '../skill/ProductionSkillCard';
import {useState} from 'react';
import type {CampaignState} from '../../types';
import {useGameStore} from '../../store/useGameStore';
import {pendingProductionAction,productionSkillForActor} from '../../game-engine/heroes/player-commands';
export default function ProductionHeroActionPanel({campaign:c}:{campaign:CampaignState}) {
 const input=useGameStore(s=>s.productionHeroInput),[selected,setSelected]=useState<string[]>([]),[error,setError]=useState<string|null>(null),p=pendingProductionAction(c);
 if(!p)return null;
 const actor=c.battle!.heroes.find(h=>h.id===p.heroActorId)!,skill=productionSkillForActor(actor,p.skillId),choice=p.pendingChoice;
 const targets=choice?.continuation.kind==='hero-production'&&choice.continuation.field==='targets';
 return <section data-testid="production-action" data-phase={p.phase} className="border border-emerald-500 p-3 space-y-2">
 <p>{skill.printedName} · {p.phase} · Roll {p.storedRolls.join(', ')||'—'}</p>
 {p.deferredEventIds.length>0&&<p>Manual validation pending · ambiguous clauses skipped</p>}
 {targets&&<><p>Choose targets · {targetSummary(skill.actions[p.face]!)}</p>{choice!.candidateIds.map(id=><label key={id} className="block"><input type="checkbox" data-testid={'target-'+id} checked={selected.includes(id)} onChange={()=>setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])}/>{[...c.battle!.heroes,...c.battle!.monsters].find(u=>u.id===id)!.name}</label>)}<button data-testid="production-confirm-targets" onClick={()=>setError(input({type:'TARGETS',targetIds:selected}))}>确认目标</button></>}
 {choice&&!targets&&choice.candidateIds.map(id=>{const split=id.indexOf(':');return <button key={id} data-testid="production-movement-choice" onClick={()=>setError(input({type:'MOVEMENT_CHOICE',direction:id.slice(0,split) as 'PUSH'|'PULL',destinationId:id.slice(split+1)}))}>{id}</button>;})}
 {!choice&&<button data-testid="production-advance" onClick={()=>setError(input({type:'ADVANCE'}))}>继续技能结算</button>}
 {error&&<p role="alert">{error}</p>}
 </section>;
}
