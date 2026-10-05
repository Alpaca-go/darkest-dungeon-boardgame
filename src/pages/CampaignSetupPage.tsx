import {Navigate,useNavigate} from 'react-router-dom';
import {useGameStore} from '../store/useGameStore';
import {HERO_PLAYER_REGISTRY,isProductionCampaign} from '../data/heroes/player-registry';
import LegacySetup from './legacy/CampaignSetupPage';
import ProductionHeroCard from '../components/hero/ProductionHeroCard';
export default function CampaignSetupPage() {
 const navigate=useNavigate(), c=useGameStore(s=>s.campaign), choose=useGameStore(s=>s.chooseHero), next=useGameStore(s=>s.proceedToLoadout), deployment=useGameStore(s=>s.setSetupStance);
 if(!c)return <Navigate to="/"/>;if(!isProductionCampaign(c))return <LegacySetup/>;
 return <main className="p-6 max-w-5xl mx-auto space-y-4"><h1>战役设置 · 选择英雄</h1>
 <p data-testid="hero-pool">Complete Edition Hero Pool · 18 / 18 Heroes</p>
 <p>选择恰好 4 名英雄 · {c.heroes.length}/4。英雄池与初始 Stance：Manual validation pending</p>
 <div className="grid grid-cols-3 gap-2">{HERO_PLAYER_REGISTRY.map(h=><button key={h.heroId} data-testid={'choose-'+h.heroId} disabled={c.heroes.length===4&&!c.heroes.some(v=>v.heroId===h.heroId)} onClick={()=>choose(h.heroId)} className="border border-dd-border p-3">{h.printedName}{c.heroes.some(v=>v.heroId===h.heroId)?' ✓':''} · Life {h.profile.life.presence==='PRINTED_VALUE'?h.profile.life.value:'—'}</button>)}</div>
 {c.heroes.map(h=><div key={h.instanceId}><ProductionHeroCard hero={h}/><label>Deployment Stance <select data-testid={'stance-'+h.heroId} value={h.stance} onChange={event=>deployment(h.instanceId,event.target.value as typeof h.stance)}>{['aggressive','defensive','ranged','support'].map(s=><option key={s}>{s}</option>)}</select></label></div>)}
 <button disabled={c.heroes.length!==4} onClick={()=>{next();navigate('/loadout');}}>继续（技能配置）</button></main>;
}
