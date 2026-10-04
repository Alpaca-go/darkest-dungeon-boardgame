import {useState} from 'react';
import type {BattleState,BattleUnit} from '../../types';
import {useGameStore} from '../../store/useGameStore';
import {productionActionAvailable,productionSkillForActor,pendingProductionAction} from '../../game-engine/heroes/player-commands';
import LegacySkillBar from './legacy/SkillBar';
import ProductionSkillCard from '../skill/ProductionSkillCard';
interface Props {battle:BattleState;actor:BattleUnit;selectedSkillId:string|null;onSelectSkill:(id:string|null)=>void;onMove:(dir:-1|1)=>void;onEndTurn:()=>void}
export default function SkillBar(props:Props) {
 const [error,setError]=useState<string|null>(null);
 const c=useGameStore(s=>s.campaign),input=useGameStore(s=>s.productionHeroInput);
 if(!props.actor.productionIdentity||!c)return <LegacySkillBar {...props}/>;
 const pending=pendingProductionAction(c);
 return <section className="rounded border border-dd-border p-3"><p>{props.actor.name} · {props.actor.productionIdentity.form} · AP {props.battle.currentActionPoints}</p>
 <div className="grid grid-cols-3 gap-2">{props.actor.equippedSkillIds!.map(id=>{const skill=productionSkillForActor(props.actor,id);return <div key={id}><ProductionSkillCard skill={skill}/>{(['front','back'] as const).filter(face=>!!skill.actions[face]).map(face=><button key={face} data-testid={'skill-'+id+'-'+face} disabled={!productionActionAvailable(c,props.actor,id,face)} onClick={()=>setError(input({type:'START',actorId:props.actor.id,skillId:id,face}))}>{skill.actions[face]!.printedName} · {face}</button>)}</div>;})}</div>
 {error&&<p role="alert">{error}</p>}
 <button disabled={!!pending} data-testid="end-turn" onClick={props.onEndTurn}>结束回合</button></section>;
}
