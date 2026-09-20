// Authored, per-card classification of the frozen literal panels. No text heuristic
// decides whether a rule qualifies an objective. Each selector owns source parameters.
const r=(category,keys,scope,trigger=null,relation=null)=>({category,keys:keys.split(' '),scope,trigger,relation});
const q=(keys,scope,trigger=null)=>r('objective-qualification',keys,scope,trigger,'qualification');
const c=(keys,scope,trigger=null)=>r('objective-completion',keys,scope,trigger,'completion');
const room=keys=>r('room-setup',keys,'objective-rooms');
const choose=keys=>r('room-selection',keys,'objective-rooms','enter-objective-room');
const spawn=(keys,scope='objective-rooms',trigger=null)=>r('monster-spawn',keys,scope,trigger);
const pool=(keys,scope)=>r('monster-pool',keys,scope);
const setup=keys=>r('quest-setup',keys,'quest-setup');
const curio=keys=>r('curio',keys,'curio-rooms');
const battle=()=>r('battle-start','roomType alwaysBattle','curio-rooms');
const blight=()=>r('hero-condition','trigger target conditions','killing-hero','hero-kills-cove-monster');
export const classifications={
 '445-2':[r('objective-completion','minimum','quest',null,'minimum-goal'),r('reward-modifier','goldPerLair','lairs','lair-cleared'),r('reward-modifier','exchange','quest-reward','after-quest')],
 '445-3':[room('rooms excludeRoomsFromOtherEncounters'),q('area actionCost collect','objective-room-green-area'),c('clearOnlyAfterCollection','objective-rooms','bones-collected')],
 '445-4':[battle(),spawn('drawMonster','curio-rooms','spawn-monsters-in-curio-room')],
 '445-5':[room('rooms excludeRoomsFromOtherEncounters'),choose('selection')],
 '445-8':[spawn('roomType spawn')],
 '445-9':[room('rooms excludeRoomsFromOtherEncounters'),setup('startingProvisions'),q('actionCost provisionCost feature','objective-room-fountain'),r('room-setup','disableUntilPurified','objective-room-fountain'),c('clearOnlyAfterPurified','objective-rooms','fountain-purified')],
 '445-10':[r('provision','setup','each-hero','after-provision-roll'),q('roomType provisionCost','dark-rooms','use-torch'),c('clearOnUse','dark-rooms','use-torch'),r('provision','alsoNormalProvisionEffect','dark-rooms','use-torch')],
 '445-11':[q('roomType provisionChoice provisionCost create','empty-rooms','use-torch-or-tool'),r('dungeon-setup','setup','dungeon')],
 '445-12':[spawn('roomType spawn.0.name spawn.0.count'),r('monster-stat-modifier','spawn.0.lifeBonus spawn.0.dodgeBonus','bone-captain-in-objective-room')],
 '445-13':[r('hero-stress','trigger target stress','all-heroes','unholy-monster-spawned')],
 '445-14':[pool('roomType excludeMonsterLevels','lairs')],
 '445-18':[setup('setup'),r('campaign-rule','returnToHamlet','boss-quest')],
 '445-19':[room('rooms setAsideAtStart'),choose('selection'),q('area actionCost collect counter','objective-room-area-A')],
 '445-20':[battle()],
 '445-21':[spawn('roomType spawnFirst remaining')],
 '445-22':[blight()],
 '445-23':[room('rooms'),choose('selection'),setup('setup'),q('area provisionCost limit purify','objective-room-red-area')],
 '445-24':[battle()],
 '445-25':[blight()],
 '445-26':[spawn('roomType spawnFirst additionalRandomMonsters')],
 '445-27':[room('rooms setAsideAtStart'),choose('selection'),pool('roomType monsterPool','objective-rooms')],
 '445-28':[battle(),r('curio','curioEffects','curio-rooms','after-curio-room-cleared')],
 '445-29':[battle(),r('curio','curioEffects','curio-rooms','after-curio-room-cleared')],
 '445-30':[blight()],
 '445-31':[room('rooms setAsideAtStart'),choose('selection'),spawn('roomType spawn'),pool('monsterPool','objective-rooms')],
 '445-32':[room('rooms'),q('area trigger rollRange replace collect maxPerShipwreck','objective-room-green-area','search-roll')],
 '445-33':[room('rooms'),setup('setup'),q('area actionCost limit cleanse','objective-room-red-area'),r('campaign-rule','hamletChoice','heroes-with-tainted-trinkets','return-to-hamlet')],
 '444-0':[r('room-selection','roomType roomFilter','objective-rooms'),r('loot','firstChestPerRoom','first-loot-chest-in-each-objective-room','loot-chest')],
 '444-2':[room('rooms'),choose('selection'),q('area actionCost collect','objective-room-area-A-red'),c('clearOnlyAfterCollection','objective-rooms','vial-filled')],
 '444-3':[r('room-clear-rule','roomType onClear','curio-rooms','curio-room-cleared'),curio('curioEffects torchCannotCounter')],
 '444-4':[pool('roomType monsterPool','lairs')],
 '444-5':[spawn('roomType spawn','lairs')],
 '444-8':[room('rooms'),choose('selection'),pool('roomType monsterPool','objective-rooms')],
 '444-9':[r('room-selection','roomFilter','objective-rooms'),r('monster-stat-modifier','roomType courtMonsterLifeBonus','court-monsters-in-objective-rooms'),r('loot','firstChest','first-chest-in-objective-room','loot-chest'),q('returnExchange.trinketLevel returnExchange.loseTrinkets returnExchange.recipient','quest-reward','return-to-hamlet'),r('reward-modifier','returnExchange.xpEach returnExchange.maxXp','trinket-return-xp','return-to-hamlet'),r('objective-completion','returnExchange.minimumObjectiveRoomsCleared','trinket-return-xp-eligibility',null,'minimum-goal')],
 '444-10':[room('rooms'),spawn('spawn')],
 '444-11':[r('hero-condition','trigger addToHit','heroes-hit-by-court-monsters','court-monster-hits-hero'),r('monster-stat-modifier','healAttacker','attacking-court-monster','court-monster-hits-hero')],
 '444-12':[r('dungeon-setup','setup','dungeon'),r('exploration','trigger replace resetVisited','cleared-room','leave-cleared-room')],
 '444-13':[room('rooms'),choose('selection'),spawn('spawn')],
 '444-14':[battle(),r('other','onClear','curio-rooms','curio-room-cleared'),curio('curioEffects torchCannotCounter')],
 '444-17':[r('room-selection','roomType roomFilter','lairs'),r('loot','firstChestPerLair','first-chest-per-lair','loot-chest'),q('returnExchange','quest-reward','return-to-hamlet')],
 '444-18':[room('rooms'),spawn('spawn','objective-rooms','battle-start')],
 '444-19':[room('rooms'),pool('monsterPool','objective-rooms')],
 '444-20':[room('rooms'),spawn('spawn randomAdditional'),r('battle-end','endBattleImmediatelyWhenKilled','objective-room-battle','swine-skiver-killed')],
 '444-21':[spawn('roomType spawn'),spawn('deathReplacements','objective-room-battle','named-carrion-eater-dies'),r('battle-end','endBattleAndSecureWhen','objective-room-battle','only-maggots-remain'),c('endBattleAndSecureWhen','objective-rooms','only-maggots-remain')],
 '444-22':[setup('startingProvisions'),r('battle-start','roomType provisionCost startBattle.room','empty-room-bait-encounter','spend-food-to-bait'),spawn('startBattle.spawn startBattle.d10 startBattle.additionalSizes','baited-swine-skiver-encounter','battle-start')],
 '444-24':[r('monster-stat-modifier','monsterPool immunity','warrens-monsters')],
 '444-25':[r('provision','trigger discardChosenProvision','party','leave-room')],
 '444-26':[spawn('roomType spawn','lairs'),r('monster-stat-modifier','warrensMonsterCritBonus','warrens-monsters-in-lairs')],
 '444-27':[room('rooms'),r('hero-condition','trigger gainDisease','hero-in-objective-room','hero-enters-deaths-door-in-this-room')],
 '444-28':[spawn('roomType spawn','lairs'),r('scouting','scoutingForbidden beforeAdvancing','quest','before-advancing'),r('exploration','movingToRevealedLair','revealed-lair','move-to-revealed-lair'),r('initiative','firstRoundInitiative','lair-battle-first-round')],
 '444-29':[spawn('roomType spawn','lairs'),r('monster-stat-modifier','firstFollowingMonster','first-monster-spawned-after-drummer'),r('monster-stat-modifier','onGuardedMonsterDeath','next-monster-in-stance-priority','guarded-monster-dies'),r('monster-stat-modifier','onDrummerActivation','all-monsters-in-lair','swine-drummer-activation')],
 '444-30':[room('rooms'),choose('selection'),q('objectiveRequires','objective-room-battle','battle-won')],
 '444-31':[room('rooms'),spawn('spawn','objective-rooms','battle-start')],
 '444-32':[room('rooms'),setup('startingProvisions'),q('area actionCost provisionCost disinfect','objective-room-red-area')],
 '444-33':[pool('roomType monsterPool','lairs')],
 '444-34':[r('initiative','trigger roll condition firstRoundInitiative','battle-first-round','battle-start')],
 '444-35':[spawn('roomType spawn')],
 '444-36':[pool('roomType monsterLevels','treasure-rooms')],
 '444-37':[r('dungeon-setup','setup','dungeon'),pool('roomType monsterPool','lairs')],
 '444-38':[room('rooms'),choose('selection'),spawn('spawn')],
 '444-39':[setup('startingProvisions'),r('room-selection','roomFilter','all-dungeon-rooms'),r('loot','chestLoot','loot-chests','loot-chest'),r('reward-modifier','returnGoldPerProvision','returned-provisions','return-to-hamlet')],
 '444-40':[room('rooms'),q('area actionCost provisionCost ignite cannotIgniteRound burnsAt','objective-room-oak'),spawn('onIgnitionRoundEnd','empty-stances','end-of-ignition-round'),c('clearIfBurnt','objective-room-oak','oak-burn-resolves')],
 '444-41':[spawn('roomType spawn.0.name spawn.0.count'),r('monster-stat-modifier','spawn.0.actionsPerRound','unclean-giant-in-objective-room'),r('initiative','spawn.0.additionalInitiativeCards','unclean-giant-in-objective-room')],
 '444-42':[r('hero-condition','trigger target conditions','all-heroes','weald-monster-spawned-in-battle')],
 '444-43':[r('hero-condition','trigger target conditions','all-heroes','monster-in-lair-killed')],
 '444-44':[r('hero-stress','trigger target stress','all-heroes','battle-round-start')]
};

export const semanticCategories=['quest-setup','dungeon-setup','room-setup','room-selection','room-clear-rule','monster-spawn','monster-pool','monster-stat-modifier','battle-start','battle-round','battle-end','initiative','hero-condition','hero-stress','hero-damage','exploration','scouting','provision','curio','loot','reward-modifier','campaign-rule','objective-qualification','objective-completion','other'];
const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
const paths=(v,p='')=>v!==null&&typeof v==='object'?Object.entries(v).flatMap(([k,x])=>paths(x,p?`${p}.${k}`:k)):[p];
export function classifySpecialRules(cell,printed,params) {
 if(!printed.length)return [];
 // All 66 frozen cards have one panel. New panels require authored classification,
 // not duplication of this panel's semantics onto a different printed source.
 if(printed.length!==1||!classifications[cell])throw Error(`Unreviewed rule panel: ${cell}`);
 const selected=classifications[cell].flatMap(s=>s.keys);
 for(const path of paths(params))if(!selected.some(k=>path===k||path.startsWith(k+'.')))throw Error(`Unclassified parameter ${cell}:${path}`);
 return classifications[cell].map(spec=>({
   printedText:printed[0],sourceRuleIndex:0,semanticCategory:spec.category,
   trigger:spec.trigger,scope:spec.scope,
   parameters:Object.fromEntries(spec.keys.map(key=>{const value=get(params,key);if(value===undefined)throw Error(`Missing ${cell}:${key}`);return [key.split('.').at(-1),value];})),
   affectsObjectiveCompletion:spec.relation!==null,
   objectiveBinding:spec.relation?{relation:spec.relation}:null,
   runtimeSupport:cell==='444-14'&&spec.keys.includes('onClear')?'SOURCE_UNRESOLVED':'RUNTIME_PRIMITIVE_UNSUPPORTED',
   sourceReference:{literalField:'printedSpecialRules.0',rulebook:cell==='445-18'?['S4:p30','S4:p35']:[]}
 }));
}
