import type {HeroInstance} from '../../types';
import {playerHero} from '../../data/heroes/player-registry';
export default function ProductionHeroCard({hero}:{hero:HeroInstance}) {
 const p=playerHero(hero.heroId,hero.level,hero.productionIdentity!.form).profile;
 return <section data-testid={'production-profile-'+hero.heroId} className="rounded border border-dd-border p-3">
 <strong>{hero.name}</strong><p>Level {['','I','II','III'][hero.level]} · {hero.productionIdentity!.form}</p>
 <p>Life {hero.maxLife-hero.wounds}/{hero.maxLife} · Wounds {hero.wounds} · Dodge {p.dodge.presence==='PRINTED_VALUE'?p.dodge.value:'—'}</p>
 <p>Movement {p.movement.presence==='PRINTED_VALUE'?p.movement.value.count:'—'} · Stance {hero.stance}</p>
 <p>Resistance {p.categoricalResistances.presence==='PRINTED_VALUE'?p.categoricalResistances.value.join(', '):'—'} · Immunity {p.immunities.presence==='PRINTED_VALUE'?p.immunities.value.join(', '):'—'}</p>
 <p className="text-xs text-amber-400">Deployment and expansion pool: Manual validation pending</p>
 {hero.heroId==='crusader'&&<p className="text-xs text-amber-400">Hamlet preparation ability: Manual validation pending; ambiguous adjustment skipped.</p>}
 </section>;
}
