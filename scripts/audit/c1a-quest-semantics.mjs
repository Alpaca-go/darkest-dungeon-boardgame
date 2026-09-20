// Source-domain normalization, never imports production quests or engine constants.
import {classifySpecialRules} from './c1ar-quest-classification.mjs';
const rules = {
 '445-2':{minimum:{roomType:'lair',count:1},goldPerLair:10,exchange:{gold:20,xp:1,recipient:'Heir',time:'after-quest'}},
 '445-3':{rooms:[7],area:'green',actionCost:2,collect:'bones',clearOnlyAfterCollection:true,excludeRoomsFromOtherEncounters:true},
 '445-4':{roomType:'curio',alwaysBattle:true,drawMonster:{level:2,count:1}},
 '445-5':{rooms:[4,8],selection:'random-each-entry',excludeRoomsFromOtherEncounters:true},
 '445-8':{roomType:'objective',spawn:[{name:'Bone Bearer',level:3,count:1}]},
 '445-9':{rooms:[3],startingProvisions:{potion:3,ifPossible:true},actionCost:2,provisionCost:{potion:1},feature:'Healing Fountain',disableUntilPurified:true,clearOnlyAfterPurified:true,excludeRoomsFromOtherEncounters:true},
 '445-10':{setup:'each-hero-may-convert-one-provision-to-torch',roomType:'dark',provisionCost:{torch:1},clearOnUse:true,alsoNormalProvisionEffect:true},
 '445-11':{setup:{fixed:{empty:3},remaining:'random-non-objective'},roomType:'empty',provisionChoice:['torch','tool'],provisionCost:1,create:'camp'},
 '445-12':{roomType:'objective',spawn:[{name:'Bone Captain',count:1,lifeBonus:20,dodgeBonus:2}]},
 '445-13':{trigger:'unholy-monster-spawned',target:'all-heroes',stress:1},
 '445-14':{roomType:'lair',excludeMonsterLevels:[1]},
 '445-18':{setup:'boss-quest-rulebook-p30',returnToHamlet:'forbidden-until-boss-defeated'},
 '445-19':{rooms:[2,5,8],setAsideAtStart:true,selection:'random-each-entry',area:'A',actionCost:2,collect:'sample',counter:{kind:'wound-tokens-on-quest-card',max:6}},
 '445-20':{roomType:'curio',alwaysBattle:true},
 '445-21':{roomType:'objective',spawnFirst:[{name:'Uca Major',count:1}],remaining:'normal-monster-deck'},
 '445-22':{trigger:'hero-kills-cove-monster',target:'killing-hero',conditions:[{type:'blight',amount:2,turns:3}]},
 '445-23':{rooms:[1,9],selection:'random-each-entry-return-after-encounter',setup:'may-convert-any-provision-to-potion',area:'red',provisionCost:{potion:1},limit:'once-per-battle',purify:'eldritch-sign'},
 '445-24':{roomType:'curio',alwaysBattle:true},
 '445-25':{trigger:'hero-kills-cove-monster',target:'killing-hero',conditions:[{type:'blight',amount:3,turns:3}]},
 '445-26':{roomType:'objective',spawnFirst:[{name:'Uca Major',count:1},{name:'Squiffy Ghast',count:1}],additionalRandomMonsters:1},
 '445-27':{rooms:[2,5,6,8],setAsideAtStart:true,selection:'random-each-entry',roomType:'objective',monsterPool:'cove-only'},
 '445-28':{roomType:'curio',alwaysBattle:true,curioEffects:'negative-only'},
 '445-29':{roomType:'curio',alwaysBattle:true,curioEffects:'negative-only'},
 '445-30':{trigger:'hero-kills-cove-monster',target:'killing-hero',conditions:[{type:'blight',amount:3,turns:4}]},
 '445-31':{rooms:[2,5,6,8],setAsideAtStart:true,selection:'random-each-entry',roomType:'objective',spawn:[{name:'Squiffy Ghast',count:1}],monsterPool:'cove-only'},
 '445-32':{rooms:[7],area:'green',trigger:'search-roll',rollRange:[4,8],replace:'chosen-provision',collect:'idol',maxPerShipwreck:1},
 '445-33':{rooms:[1,5,9],setup:{eachHeroRandomTrinketLevel:3,tainted:true,ifUnavailable:'taint-owned-trinket'},area:'red',actionCost:1,limit:'once-per-room',cleanse:'trinket',hamletChoice:[{gainNegativeQuirks:2,cleanse:true},{returnTrinketToOwnDeck:true}]},
 '444-0':{roomType:'objective',roomFilter:'has-loot',firstChestPerRoom:{replaceNormalLoot:'valuable'}},
 '444-2':{rooms:[2,3,4],selection:'random-then-discard-on-clear',area:'A-red',actionCost:2,collect:'blood-vial',clearOnlyAfterCollection:true},
 '444-3':{roomType:'curio',onClear:'desecrate-tomb',curioEffects:'negative-only',torchCannotCounter:true},
 '444-4':{roomType:'lair',monsterPool:'crimson-court-only'},
 '444-5':{roomType:'lair',spawn:[{name:'Crocodilian',level:3,count:1}]},
 '444-8':{rooms:[5,6,7],selection:'random-then-discard-on-clear',roomType:'objective',monsterPool:'crimson-court-only'},
 '444-9':{roomType:'objective',roomFilter:'has-loot-chests',courtMonsterLifeBonus:7,firstChest:{trinketLevel:2},returnExchange:{trinketLevel:2,xpEach:1,maxXp:3,loseTrinkets:true,minimumObjectiveRoomsCleared:1,recipient:'chosen-Heir'}},
 '444-10':{rooms:[6,7,8],spawn:[{name:'Courtesan',count:2},{name:'Chevalier',count:2}]},
 '444-11':{trigger:'court-monster-hits-hero',addToHit:{type:'bleed',amount:3,turns:3},healAttacker:4},
 '444-12':{setup:'random-rooms',trigger:'leave-cleared-room',replace:'random-face-down-room-token',resetVisited:true},
 '444-13':{rooms:[4,5,9],selection:'random-then-discard-on-clear',spawn:[{name:'Crocodilian',count:1},{name:'Adder',count:1}]},
 '444-14':{roomType:'curio',alwaysBattle:true,onClear:null,curioEffects:'negative-only',torchCannotCounter:true},
 '444-17':{roomType:'lair',roomFilter:'has-loot-chests',firstChestPerLair:{trinketLevel:2},returnExchange:{trinketLevel:2,acquiredThisDungeonOnly:true,maxTrinkets:3}},
 '444-18':{rooms:[8],spawn:[{name:'Large Carrion Eater',level:2,count:1}]},
 '444-19':{rooms:[6],monsterPool:'warrens-only'},
 '444-20':{rooms:[9],spawn:[{name:'Swine Skiver',level:3,count:1},{name:'Large Carrion Eater',count:1}],randomAdditional:{count:1,sizes:['normal','small']},endBattleImmediatelyWhenKilled:'Swine Skiver'},
 '444-21':{roomType:'objective',spawn:[{name:'Large Carrion Eater',count:1},{name:'Carrion Eater',count:2}],deathReplacements:[{from:'Large Carrion Eater',to:'Carrion Eater'},{from:'Carrion Eater',to:'Maggot'}],endBattleAndSecureWhen:'only-maggots-remain'},
 '444-22':{startingProvisions:{food:3},roomType:'empty',provisionCost:{food:1},startBattle:{room:'random',spawn:{name:'Swine Skiver',level:3,count:1},d10:[{range:[1,4],additional:2},{range:[5,8],additional:3},{range:[9,10],additional:0}],additionalSizes:['normal','small']}},
 '444-24':{monsterPool:'warrens',immunity:'all-conditions'},
 '444-25':{trigger:'leave-room',discardChosenProvision:1},
 '444-26':{roomType:'lair',spawn:[{name:'Swinetaur',count:1}],warrensMonsterCritBonus:1},
 '444-27':{rooms:[6],trigger:'hero-enters-deaths-door-in-this-room',gainDisease:1},
 '444-28':{roomType:'lair',spawn:[{name:'Swine Skiver',count:1}],scoutingForbidden:true,beforeAdvancing:'may-reveal-one-adjacent-room',movingToRevealedLair:'skip-exploration',firstRoundInitiative:'all-heroes-on-top'},
 '444-29':{roomType:'lair',spawn:[{name:'Swine Drummer',count:1}],firstFollowingMonster:{guardTurns:4},onGuardedMonsterDeath:'transfer-remaining-guard-to-next-stance-priority-monster',onDrummerActivation:{target:'all-monsters',independentBuffStacks:[2,2]}},
 '444-30':{rooms:[3,6,8],selection:'random-then-discard-on-secure',objectiveRequires:'win-with-at-least-one-unsmashed-necrotic-fungus'},
 '444-31':{rooms:[9],spawn:[{name:'Crone',level:2,count:1}]},
 '444-32':{rooms:[5],startingProvisions:{potion:3},area:'red',actionCost:1,provisionCost:{potion:1},disinfect:'oak'},
 '444-33':{roomType:'lair',monsterPool:'weald-only'},
 '444-34':{trigger:'battle-start',roll:'d10',condition:'roll-greater-than-light',firstRoundInitiative:'all-monsters-on-top'},
 '444-35':{roomType:'objective',spawn:[{name:'Hateful Virago',level:3,count:1}]},
 '444-36':{roomType:'treasure',monsterLevels:[2]},
 '444-37':{setup:{remaining:'random'},roomType:'lair',monsterPool:'weald-only'},
 '444-38':{rooms:[1,3,6],selection:'random-then-discard-on-secure',spawn:[{name:'Rabid Gnasher',count:3}]},
 '444-39':{startingProvisions:'no-normal-roll; allow-Survivalist-and-skills',roomFilter:'has-loot-chests',chestLoot:'roll-two-random-provisions-instead',returnGoldPerProvision:1},
 '444-40':{rooms:[5],area:'red',actionCost:1,provisionCost:{torch:1},ignite:'oak',cannotIgniteRound:4,burnsAt:'end-of-next-round',onIgnitionRoundEnd:'fill-empty-stances-with-new-monsters',clearIfBurnt:'even-with-monsters-at-end-round-four'},
 '444-41':{roomType:'objective',spawn:[{name:'Unclean Giant',count:1,actionsPerRound:2,additionalInitiativeCards:1}]},
 '444-42':{trigger:'weald-monster-spawned-in-battle',target:'all-heroes',conditions:[{type:'blight',amount:1,turns:2}]},
 '444-43':{trigger:'monster-in-lair-killed',target:'all-heroes',conditions:[{type:'blight',amount:2,turns:2},{type:'blight',amount:2,turns:2}]},
 '444-44':{trigger:'battle-round-start',target:'all-heroes',stress:1}
};

export function questSemantics(cell, printed) {
  const [,title,,, ,special,reward,roomRequirements] = printed;
  const params=rules[cell];
  if(special.length&&!params) throw Error(`No special rule semantics: ${cell}`);
  const boss=cell==='445-18';
  let entity,objectiveType,targetCount=1;
  if(boss) { entity='current-imminent-threat-boss'; objectiveType='defeat-boss'; }
  else if(/2 Rooms|Two Rooms/.test(reward)) {entity='room';objectiveType='clear-rooms';targetCount=2;}
  else if(/Lair/.test(reward)) {entity='lair';objectiveType='clear-rooms';}
  else if(/Objective Room/.test(reward)) {entity='objective-room';objectiveType='clear-rooms';}
  else if(/Curio Room/.test(reward)) {entity='curio-room';objectiveType='clear-rooms';}
  else if(/Treasure Room/.test(reward)) {entity='treasure-room';objectiveType='clear-rooms';}
  else if(/killed|slain/i.test(reward)) {entity=reward.split('/')[1].replace(/killed\.|slain\./ig,'').trim();objectiveType='kill-entity';}
  else if(/20\[gold\]/.test(reward)) {entity='gold-donated-to-heir';objectiveType='return-resource';targetCount=20;}
  else {
    const entities={'445-3':['bones','collect',1],'445-9':['fountain','purify',1],'445-10':['dark-room','illuminate-and-clear',1],'445-11':['camp','establish',1],'445-19':['sample','collect',2],'445-23':['eldritch-sign','purify',1],'445-32':['idol','find',1],'445-33':['trinket','cleanse',1],'444-0':['valuable','return-resource',1],'444-2':['blood-vial','return-resource',1],'444-9':['level-2-trinket','return-resource',1],'444-17':['level-2-trinket-acquired-in-this-dungeon','return-resource',1],'444-30':['necrotic-fungus','collect-and-return',1],'444-32':['oak','disinfect',1],'444-39':['provision','return-resource',2],'444-40':['infected-oak','burn',1]};
    const found=entities[cell];if(!found)throw Error(`Unknown objective: ${title}`);[entity,objectiveType,targetCount]=found;
  }
  const specialRules=classifySpecialRules(cell,special,params);
  const bindings=relation=>specialRules.flatMap((rule,index)=>rule.objectiveBinding?.relation===relation?[{specialRule:index,relation}]:[]);
  const objective={objectiveType,targetCount,targetEntity:entity,
    qualificationRules:bindings('qualification'),completionRules:bindings('completion'),
    countMeaning:'one-XP-unit; not an invented mandatory full-quest threshold',
    minimumQuestGoal:params?.minimum?{...params.minimum,scope:'quest',rules:bindings('minimum-goal')}:cell==='444-9'?{roomType:'objective',count:1,scope:'trinket-return-xp-eligibility',rules:bindings('minimum-goal')}:null,
    xpUnit:{amount:boss?3:1,targetEntity:entity,targetCount,basis:boss?'boss-defeated':'printed-reward-rate',mandatoryQuestThreshold:false}};
  const rewards=[{kind:'xp',amount:boss?3:1,per:boss?'boss-defeated':{targetEntity:entity,count:targetCount},cap:{amount:3,source:'S4:p14,p29'},timing:'quest-end; granted-to-each-eligible-hero'}];
  if(cell==='445-2') rewards.push({kind:'gold',amount:10,per:'lair-cleared',timing:'on-clear'});
  if(cell==='444-39') rewards.push({kind:'gold',amount:1,per:'provision-returned',timing:'return-to-hamlet'});
  if(['444-9','444-17'].includes(cell))rewards.push({kind:'trinket',level:2,count:1,timing:'first-eligible-chest-per-room',sourceRule:0});
  if(cell==='445-33')rewards.push({kind:'trinket',level:3,count:1,target:'each-hero',timing:'setup',condition:'tainted; see special rule',sourceRule:0});
  const unresolvedFields=cell==='444-14'?[`specialRules.${specialRules.findIndex(r=>'onClear' in r.parameters)}.parameters.onClear`]:[];
  const dynamic=Object.values(roomRequirements).includes('?');
  return {objective,rewards,roomCount:dynamic?null:Object.values(roomRequirements).reduce((a,b)=>a+b,0),dungeonStructure:{roomTokens:roomRequirements,placement:boss?'boss-objective-among-edge-rooms':dynamic?'see-special-setup-rule':'shuffle-on-layout-room-slots',randomRemainder:dynamic,roomCountBasis:dynamic?'selected-layout; not a fixed card number':'sum-of-printed-room-tokens'},specialRules,unresolvedFields,
    runtimeSupport:{classification:unresolvedFields.length?'SOURCE_UNRESOLVED':'RUNTIME_PRIMITIVE_UNSUPPORTED',existingCandidates:objectiveType==='clear-rooms'&&entity==='room'?['QuestObjectiveDefinition:clear-room-count']:[],missingCapabilities:['Complete room-token composition and printed firewood/resting-point setup are not represented by ordinary QuestDefinition',...(special.length?['Quest-specific policies require new adapters/primitives']:[]),'Repeated per-unit XP must not be replaced by unrelated prototype objectives'],productionIntegration:'not-integrated'}};
}
