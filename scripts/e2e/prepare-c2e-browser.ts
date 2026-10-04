import {mkdirSync,writeFileSync} from 'node:fs';
import {HERO_PLAYER_REGISTRY,playerSkills} from '../../src/data/heroes/player-registry';
import {playerGuildFixture,playerReplacementFixture,playerOrdinaryFixture,playerBossFixture} from '../../src/testing/c2e-player-fixtures';
import {heroRuntimeFixture,prepareHeroFixture} from '../../src/testing/c2d-hero-runtime-fixture';
import {createSaveSnapshot} from '../../src/game-engine/save';
import {createNewCampaign,selectParty,applyDefaultLoadout} from '../../src/game-engine/campaign';
import {startGuildVisit} from '../../src/game-engine/hamlet/guild';
const guild=playerGuildFixture();
const activeGuild=startGuildVisit(guild,guild.heroes[0].instanceId);
const legacy=applyDefaultLoadout(selectParty(createNewCampaign(),['crusader','vestal','highwayman','hellion']));delete legacy.heroRuntimeSelection;legacy.saveVersion=22;
const synthetic=(id:string,skill:string,seed=31)=>{let c=heroRuntimeFixture(id,skill,1,seed);if(id==='bounty-hunter')c=prepareHeroFixture(c,draft=>{const map=draft.battle!.largeMovementContract!;map.areas.find(a=>a.id==='A0')!.capacity=1;const from=map.placements[draft.battle!.monsters[0].id],n=Number(from.slice(1));map.areas.push({id:'branch',capacity:8,adjacent:[from,`A${Math.max(0,n-2)}`]});for(const area of map.areas.filter(a=>a.id===from||a.id===`A${Math.max(0,n-2)}`))area.adjacent.push('branch');});return createSaveSnapshot(c);};
mkdirSync('pw-out',{recursive:true});writeFileSync('pw-out/c2e-browser-fixtures.json',JSON.stringify({
 inventory:HERO_PLAYER_REGISTRY.map(h=>({heroId:h.heroId,printedName:h.printedName,skills:playerSkills({...guild.heroes[0],heroId:h.heroId,skillLevels:{}}).map(s=>({skillId:s.skillId,name:s.printedName,targeting:Object.fromEntries(Object.entries(s.actions).filter(([,a])=>a).map(([face,a])=>[face,a!.targeting]))}))})),
 necromancer:createSaveSnapshot(playerBossFixture('necromancer')),prophet:createSaveSnapshot(playerBossFixture('prophet')),guild:createSaveSnapshot(activeGuild),replacement:createSaveSnapshot(playerReplacementFixture()),ordinary:createSaveSnapshot(playerOrdinaryFixture()),
 legacy:{...createSaveSnapshot(legacy),version:22},multi:synthetic('vestal','vestal-divine-comfort'),movement:synthetic('bounty-hunter','bounty-hunter-come-hither',3),abomination:synthetic('abomination','abomination-transform-to-beast'),
},null,2));
