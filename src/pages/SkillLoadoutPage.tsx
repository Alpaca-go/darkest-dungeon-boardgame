import {useState} from 'react';
import {Navigate,useNavigate} from 'react-router-dom';
import {useGameStore} from '../store/useGameStore';
import {isProductionCampaign,playerSkills} from '../data/heroes/player-registry';
import {getHeroSkillSlots} from '../game-engine/progression/upgrade-core';
import {isLoadoutComplete} from '../game-engine/campaign';
import LegacyLoadout from './legacy/SkillLoadoutPage';
import ProductionSkillCard from '../components/skill/ProductionSkillCard';
import ProductionHeroCard from '../components/hero/ProductionHeroCard';
export default function SkillLoadoutPage() {
 const [idx,setIdx]=useState(0),navigate=useNavigate(),c=useGameStore(s=>s.campaign),equip=useGameStore(s=>s.equipSkill),defaults=useGameStore(s=>s.applyDefaultLoadout),next=useGameStore(s=>s.proceedToQuests);
 if(!c)return <Navigate to="/"/>;if(!isProductionCampaign(c))return <LegacyLoadout/>;if(c.heroes.length!==4)return <Navigate to="/setup"/>;
 const h=c.heroes[Math.min(idx,c.heroes.length-1)],slots=getHeroSkillSlots(h);
 return <main className="p-6 max-w-5xl mx-auto space-y-4"><h1>技能配置</h1><p>Loadout {slots} slots · Manual validation pending (provisional product policy)</p>
 <nav>{c.heroes.map((v,i)=><button key={v.instanceId} data-testid={'loadout-hero-'+v.heroId} onClick={()=>setIdx(i)}>{v.name} · {v.equippedSkillIds.length}/{getHeroSkillSlots(v)}</button>)}</nav>
 <ProductionHeroCard hero={h}/><p>7 official Skills</p><button onClick={defaults}>使用默认配置（全部英雄）</button>
 <div className="grid grid-cols-2 gap-2">{playerSkills(h).map(s=><ProductionSkillCard key={s.skillId} skill={s} equipped={h.equippedSkillIds.includes(s.skillId)} disabled={h.equippedSkillIds.length>=slots&&!h.equippedSkillIds.includes(s.skillId)} onClick={()=>equip(h.heroId,s.skillId)}/>)}</div>
 <button disabled={!isLoadoutComplete(c)} onClick={()=>{next();navigate('/quests');}}>继续（任务选择）</button></main>;
}
