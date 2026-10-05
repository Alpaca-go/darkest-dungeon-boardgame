import {mkdirSync,writeFileSync} from 'node:fs';
import {explicitPlayerBattle,dungeonPlayerPrerequisite} from '../../src/audit/c3e-player-fixture';
import {createSaveSnapshot,validateSaveFile} from '../../src/game-engine/save';
import {advancePendingMonsterAttack} from '../../src/game-engine/trinkets/battle-trinket-bridge';
import {acquireTrinket} from '../../src/game-engine/trinkets/acquire-trinket';
const cases:Record<string,unknown>={dungeon:createSaveSnapshot(dungeonPlayerPrerequisite())};
for(const [name,id,index,move] of [
 ['movement','bone-soldier',0,true],['allHeroes','crystalline-aberration-level-1',0,false],
 ['protection','manservant',2,false],['explicit','swine-slasher',0,true],['deferred','supplicant',0,false]
] as const)cases[name]=createSaveSnapshot(explicitPlayerBattle(id,index,move));
for(const [name,trinketId] of [['incomingHit','community-trinket-core-camouflage-cloak'],['incomingDamage','community-trinket-core-protective-padlock']] as const) {
 let c=explicitPlayerBattle();const target=c.battle!.heroes.find(h=>h.id===c.battle!.pendingMonsterAttack!.targetHeroUnitId)!;
 c=acquireTrinket(c,{trinketId,heroId:target.sourceId,source:'debug',sourceEventId:'c3e:'+name}).campaign;
 for(let i=0;i<3&&!c.pendingTrinketUseOpportunities.some(o=>o.status==='open');i++)c=advancePendingMonsterAttack(c,false,true);
 cases[name]=createSaveSnapshot(c);
}
for(const [name,save] of Object.entries(cases)){const error=validateSaveFile(save);if(error)throw new Error(name+': '+error);}
mkdirSync('pw-out',{recursive:true});writeFileSync('pw-out/c3e-browser-fixtures.json',JSON.stringify(cases));
console.log('C3E real-player / controlled-manifest snapshots prepared');
