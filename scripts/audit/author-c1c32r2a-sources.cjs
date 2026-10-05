// Offline authoring only. Runtime consumes discriminated objects, never intake tokens.
const fs = require('node:fs');
const dir = 'docs/data/complete-edition/';
const read = name => JSON.parse(fs.readFileSync(dir + name + '.json', 'utf8'));
const write = (name, value) => fs.writeFileSync(dir + 'c1c32r2a-' + name + '.json', JSON.stringify({schemaVersion:1, phase:'11A.4-C1C32R2A', baselineHead:'624a2b5c20b9f40ee9e87ac103780cb9eb3c2053', policyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1', ...value},null,2)+'\n');
const v4 = 'C1C32R2A-DIGITAL-DEFAULT-v4';
const stances = ['aggressive','defensive','ranged','support'];
const src = refs => refs.map(s=>({...s,visualReview:true}));
const ruleSource=(page,location,componentId)=>({sourceClass:'OFFICIAL_SOURCE',relativePath:'DARKEST_DUNGEON_PRINT_EN_WAVE 1/MG_DD_01_EN_COREBOX_Print/DD_EN_COREBOX_RULES.pdf',fileName:'DD_EN_COREBOX_RULES.pdf',sha256:'4c0bf3471bd0264443044b656b58d5a2d54c94b397aee19a049d20c0978e0125',page,location,componentId,visualReview:true});
const historical=read('c1c32r2-ruins-monster-definitions');
const corrections=[];
function effect(token) {
 const [target,kind,a,b]=token.split(':');
 switch(kind) {
 case 'stress': case 'light': return {type:kind,target,amount:+a};
 case 'push': case 'pull': return {type:'shuffle',target,direction:kind,distance:+a};
 case 'damageBonusVsMarked': return {type:'markedDamageBonus',amount:+a};
 case 'heal': return {type:'heal',target,amount:+a};
 case 'healAllWounds': return {type:'heal',target,amount:'ALL_WOUNDS'};
 case 'remove': return {type:'removeCondition',target,condition:a};
 case 'diseaseRoll': return {type:'disease',target,acquisition:'DRAW_FROM_DECK'};
 case 'marked': case 'stun': case 'buff': case 'debuff': case 'guard': case 'riposte':
  return {type:'condition',target,condition:kind==='marked'?'mark':kind,amount:1,turns:+a.replace('t','')};
 case 'bleed': case 'blight': return {type:'condition',target,condition:kind,amount:+a,turns:+b.replace('t','')};
 default: throw Error('Unreviewed intake token '+token);
 }
}
const grouping={
 'bone-soldier':['ranged','ranged',null,null], 'bone-courtier':[null,null,'support',null],
 'bone-arbalist':['defensive',null,'support',null], 'bone-defender':['defensive',null,'support',null],
 'bone-captain':['defensive',null,'support',null], 'bone-spearman':['defensive',null,'support',null],
 'bone-bearer':[null,null,'support',null], 'cultist-brawler':['defensive',null,'support',null],
 'cultist-acolyte':[null,'support','support',null], 'brigand-cutthroat':['defensive',null,null,null],
 'brigand-fusilier':[null,'support','support',null], 'brigand-bloodletter':[null,null,'support',null],
 'maggot':['support','support','support',null], 'webber':['support','support','support',null],
 'spitter':['defensive',null,'support',null], 'bone-rabble':['ranged','ranged',null,null],
 'madman':['support','support','support',null], 'pliskin':['defensive',null,'support',null],
 'ghoul':['defensive',null,'support',null], 'gargoyle':['ranged','ranged',null,null],
 'rattler':['ranged','ranged',null,null], 'brigand-raider':['defensive',null,null,null],
 'brigand-hunter':[null,'support','support',null], 'adder':['defensive',null,null,null]
};
// Adder's Aggressive and Defensive share the table printed after Defensive.
const definitions=historical.definitions.map(original=>{
 const d=structuredClone(original);
 if(d.canonicalId==='bone-captain') {
  const b=read('c1c31-necromancer-bone-definition-proof').bones.find(b=>b.monsterId==='bone-captain');
  d.skills=b.skills.map(s=>({...s,effects:[...(s.targetPush?['target:push:'+s.targetPush]:[]),...(s.targetStunTurns?['target:stun:'+s.targetStunTurns+'t']:[])],sourceReferences:d.sourceReferences}));
  d.stanceSelections={aggressive:null,defensive:[{min:1,max:6,skill:1},{min:7,max:10,skill:2}],ranged:null,support:[{min:1,max:10,skill:2}]};
 }
 function correct(skill,field,value){const s=d.skills.find(s=>s.number===skill);corrections.push({componentId:d.canonicalId,skill,field,historicalValue:s[field],officialValue:value,sourceReferences:src(d.sourceReferences)});s[field]=value;}
 if(d.canonicalId==='spitter'){correct(1,'damage',4);correct(1,'critDamage',6);}
 if(d.canonicalId==='madman')correct(2,'effects',['target:debuff:2t','target:stress:2']);
 if(d.canonicalId==='brigand-hunter')correct(2,'accuracy',9);
 if(d.canonicalId==='adder'){correct(1,'range',2);d.stanceSelections.defensive=d.stanceSelections.aggressive;}
 const stanceBehavior=Object.fromEntries(stances.map((s,i)=>[s,grouping[d.canonicalId][i]?{kind:'INHERITS',stance:grouping[d.canonicalId][i]}:{kind:'SKILL_TABLE',rows:d.stanceSelections[s]}]));
 if(Object.values(stanceBehavior).some(s=>s.kind==='SKILL_TABLE'&&!s.rows))throw Error('Missing stance '+d.canonicalId);
 const header=d.printedText?.match(/(?:Unholy|Human|Beast)[^\n]*/)?.[0]??'Unholy - Front - Large';
 return {canonicalId:d.canonicalId,printedName:d.printedName,group:d.group,printedLevel:d.printedLevel,drawEligibleFromLevel:d.drawEligibleFromLevel,
  size:d.size,occupiedSpaces:d.occupiedSpaces,stanceSlots:d.stanceSlots,life:d.life,speed:d.speed,dodge:d.dodge,copyCount:d.copyCount,physicalCopyIds:d.physicalCopyIds,
  deployment:header.includes('Back')?'BACK':'FRONT',tags:header.split(' - ').filter(t=>!['Front','Back','Large','Small'].includes(t.trim())),
  printedProtection:d.printedProtection,resistances:d.resistances??['push-pull'],immunities:d.immunities??['stun','bleed'],
  status:'SOURCE_BOUND_TYPED_CANDIDATE',executable:false,unresolvedFields:[],stanceBehavior,
  skills:d.skills.map(s=>({number:s.number,name:s.name,range:s.targeting==='Self'?{kind:'SELF'}:{kind:'EXACT',distance:s.range},targets:s.targets,
   targetSide:s.targeting==='Self'?'self':s.targeting.includes('Monster')?'monster':'hero',
   targeting:{priority:s.targeting.replace('Marked -> ','').replace(' Monster',''),markedFirst:s.targeting.startsWith('Marked')},
   attack:s.accuracy===null?{kind:'AUTOMATIC'}:{kind:'ROLL',accuracy:s.accuracy,damage:s.damage,crit:s.crit,critDamage:s.critDamage},
   effects:s.effects.map(effect),sourceReferences:src(d.sourceReferences)})),sourceReferences:src(d.sourceReferences)};
});
write('ruins-monster-executable-definitions',{ruleSetVersion:v4,definitions,sourceCorrections:corrections,counts:{identities:24,physicalCopies:62,eligibleCopies:[42,53,62]},diseaseIconReview:{canonical:'Disease acquisition draws a Disease (official p27); no infection probability printed',historicalToken:'target:diseaseRoll',runtimeType:'disease',sourceStatus:'OFFICIAL_SOURCE',sourceReferences:[ruleSource(27,'Diseases: yellow disease icon and acquisition paragraph','disease-acquisition')]}});
write('ruins-stance-binding',{ruleSetVersion:v4,visualReview:true,bindings:definitions.map(d=>({componentId:d.canonicalId,stanceBehavior:d.stanceBehavior,sourceReferences:d.sourceReferences}))});
write('official-bone-source-rebaseline',{ruleSetVersion:v4,authority:'OFFICIAL_PRINTED_COMPONENT',changes:historical.definitions.flatMap(d=>(d.sourceMismatches??[]).map(m=>({...m,status:'RESOLVED_BY_SUCCESSOR_VERSION',source:{...m.source,visualReview:true}}))),additionalIntakeCorrections:corrections,historicalVersionsUnchanged:true});
write('ruleset-v4',{ruleSetVersion:v4,inherits:'C1C32R2-DIGITAL-DEFAULT-v3',ancestorVersions:['C1C31-DIGITAL-DEFAULT-v2','C1C28-DIGITAL-DEFAULT-v1'],changes:['OFFICIAL_BONE_REBASELINE','VISUALLY_REVIEWED_ORDINARY_COMPONENTS'],largeMovementRuling:'C1C32R2-LARGE-SINGLE-DISPLACEMENT-OVERFLOW-v1',heroDodgeResolverVersion:'C1C31-DIGITAL-DEFAULT-v2',historicalReplayMigration:false});
write('ruleset-migration',{ruleSetVersion:v4,policyId:'C1C32R2A-PRE-ENCOUNTER-EXPLICIT-MIGRATION-v1',allowed:'BEFORE_ENCOUNTER_INITIALIZATION',rejected:['ACTIVE_BATTLE','THREAT_CHECKPOINT','SAVED_BOSS_ENCOUNTER','HISTORICAL_REPLAY','PENDING_ATTACK','PENDING_PLACEMENT'],legacySavesRemainPinned:true});
const deck=read('c1c32r2-ruins-room-deck-contract');
write('ruins-room-deck-final',{complete:true,ordinaryDrawPool:deck.ordinaryDrawPool,bossRoomExclusions:deck.bossRoomExclusions,room10ExclusionBound:true,rooms:deck.rooms.map(r=>({componentId:r.componentId,roomNumber:r.roomNumber,classification:r.roomNumber===10?'RESERVED_BOSS_ONLY':r.roomNumber>9?'BOSS_ONLY_EXCLUDED':'ORDINARY_DRAW_ELIGIBLE',sourceReferences:src(r.sourceReferences)})),sourceReferences:src(deck.sourceReferences),exclusionAuthority:'Official p15: objective Quest Rooms set aside, p30 unique Boss Room setup, printed BOSS classification; excludes 10–13 from ordinary Ruins draw.'});
// Coordinates are normalized to the printed tile face (crop marks excluded), north at the printed Room number.
const geometries=[
 // [area label,capacity,elevation,glyphs,polygon], edges, Hero A/D/R/S, Monster A/D/R/S
 {a:[['NW',4,0,[],[[0,0],[.33,0],[.33,.33],[0,.33]]],['N',3,0,[],[[.33,0],[.78,0],[.78,.16],[.33,.16]]],['NE',3,0,['red','loot'],[[.78,0],[1,0],[1,.44],[.78,.44]]],['W',3,0,[],[[.1,.33],[.33,.33],[.33,.8],[.1,.8]]],['C',3,0,[],[[.33,.27],[.78,.27],[.78,.44],[.33,.44]]],['LOW',2,-1,[],[[.38,.44],[.74,.44],[.74,.68],[.38,.68]]],['E',3,0,[],[[.78,.44],[1,.44],[1,.8],[.78,.8]]],['SW',2,0,['red','loot'],[[0,.8],[.33,.8],[.33,1],[0,1]]],['S',3,0,[],[[.33,.8],[.78,.8],[.78,1],[.33,1]]],['SE',2,0,[],[[.78,.8],[1,.8],[1,1],[.78,1]]]],e:['NW-N','NW-W','N-NE','NE-C','NE-E','W-C','C-LOW','W-SW','E-SE','SW-S','S-SE'],h:['SW','NE','SW','NE'],m:['SE','W','LOW','W']},
 {a:[['N',2,0,['loot'],[[.22,0],[.78,0],[.78,.1],[.22,.1]]],['NW',2,0,['loot'],[[0,.1],[.22,.1],[.22,.44],[0,.44]]],['W',3,0,[],[[0,.44],[.22,.44],[.22,1],[.1,1],[.1,.66],[0,.66]]],['MID',3,0,[],[[.22,.1],[.46,.1],[.46,.44],[.55,.44],[.55,.55],[.22,.55]]],['C',4,0,[],[[.46,.22],[.78,.22],[.78,.66],[.55,.66],[.55,.44],[.46,.44]]],['NE',2,0,['loot'],[[.78,.1],[1,.1],[1,.44],[.78,.44]]],['E',3,0,[],[[.78,.44],[1,.44],[1,1],[.9,1],[.9,.66],[.78,.66]]],['S',4,0,['red'],[[.22,.66],[.78,.66],[.78,1],[.22,1]]]],e:['N-MID','NW-MID','NW-W','W-MID','MID-C','C-NE','NE-E','C-E','C-S'],h:['S','S','S','S'],m:['C','C','NE','MID']},
 {a:[['NW',2,1,[],[[0,0],[.2,0],[.2,.33],[0,.33]]],['N',4,0,[],[[.2,0],[.8,0],[.8,.33],[.2,.33]]],['NE',2,1,[],[[.8,0],[1,0],[1,.33],[.8,.33]]],['W',3,0,[],[[0,.38],[.44,.38],[.44,.52],[.33,.52],[.33,.56],[0,.56]]],['E',3,0,[],[[.56,.38],[1,.38],[1,.56],[.67,.56],[.67,.52],[.56,.52]]],['LOW_W',3,0,[],[[0,.56],[.33,.56],[.33,.9],[0,.9]]],['FOUNTAIN',3,0,['green'],[[.33,.56],[.67,.56],[.67,.9],[.33,.9]]],['LOW_E',3,0,[],[[.67,.56],[1,.56],[1,.9],[.67,.9]]],['SW',2,0,[],[[0,.9],[.33,.9],[.33,1],[0,1]]],['SE',2,0,[],[[.67,.9],[1,.9],[1,1],[.67,1]]]],e:['NW-N','N-NE','N-W','N-E','W-LOW_W','E-LOW_E','LOW_W-FOUNTAIN','FOUNTAIN-LOW_E','LOW_W-SW','LOW_E-SE'],h:['SW','SE','SE','SW'],m:['W','E','NE','NW']},
 {a:[['NW',2,1,['loot'],[[0,0],[.22,0],[.22,.22],[.2,.22],[.2,.33],[0,.33]]],['N',4,0,[],[[.22,0],[.67,0],[.67,.22],[.22,.22]]],['NE',3,0,['loot'],[[.8,0],[1,0],[1,.33],[.8,.33]]],['W',3,0,[],[[0,.38],[.2,.38],[.2,.22],[.44,.22],[.44,.33],[.33,.33],[.33,.56],[0,.56]]],['CIRCLE',3,0,['red:A'],[[.33,.33],[.67,.33],[.67,.67],[.33,.67]]],['E',2,0,[],[[.8,.33],[1,.33],[1,.56],[.8,.56]]],['PIT_W',4,0,['red:B'],[[0,.56],[.33,.56],[.33,.67],[.44,.67],[.44,.78],[0,.78]]],['PIT_E',2,0,['red:B'],[[.44,.67],[.67,.67],[.67,.56],[1,.56],[1,.78],[.44,.78]]],['SW',3,0,[],[[0,.78],[.33,.78],[.33,1],[0,1]]],['S',3,0,[],[[.33,.78],[.67,.78],[.67,1],[.33,1]]],['SE',3,0,[],[[.67,.78],[1,.78],[1,1],[.67,1]]]],e:['NW-N','N-W','W-CIRCLE','W-PIT_W','CIRCLE-PIT_W','CIRCLE-PIT_E','NE-E','E-PIT_E','PIT_W-PIT_E','PIT_W-SW','PIT_W-S','PIT_E-S','PIT_E-SE','SW-S','S-SE'],h:['S','S','SE','SW'],m:['CIRCLE','NE','NW','CIRCLE']},
 {a:[['NW',4,0,['red'],[[0,0],[.5,0],[.5,.33],[.33,.33],[.33,.22],[.22,.22],[.22,.33],[0,.33]]],['NE',4,0,['green'],[[.58,0],[1,0],[1,.33],[.58,.33]]],['W',3,0,['red'],[[0,.33],[.22,.33],[.22,.78],[0,.78]]],['MID',2,0,[],[[.33,.33],[.56,.33],[.56,.56],[.33,.56]]],['E',3,0,[],[[.56,.33],[1,.33],[1,.56],[.56,.56]]],['SW',2,0,['red'],[[0,.78],[.22,.78],[.22,1],[0,1]]],['S',2,0,['red'],[[.33,.56],[.56,.56],[.56,1],[.33,1]]],['SE',2,0,['red','loot'],[[.67,.56],[1,.56],[1,1],[.67,1]]]],e:['NW-W','NW-MID','NE-E','MID-E','MID-S','E-SE','W-SW'],h:['SW','S','SW','S'],m:['NW','E','NW','NE']},
 {a:[['NW',2,0,[],[[.22,.1],[.46,.1],[.46,.33],[.22,.33]]],['N',4,0,[],[[.46,0],[.8,0],[.8,.33],[.46,.33]]],['NE',3,0,[],[[.8,0],[1,0],[1,.33],[.8,.33]]],['W',2,0,['loot'],[[0,.33],[.22,.33],[.22,.56],[0,.56]]],['CHEST',4,0,['green:A'],[[.22,.33],[.7,.33],[.7,.67],[.22,.67]]],['HIDE',2,0,['green:B'],[[.7,.46],[.9,.46],[.9,.67],[.7,.67]]],['STEM',3,0,[],[[.46,.67],[.7,.67],[.7,.88],[.46,.88]]],['SW',3,0,[],[[0,.8],[.33,.8],[.33,1],[0,1]]],['S',3,0,[],[[.33,.8],[.46,.8],[.46,.88],[.7,.88],[.7,1],[.33,1]]],['SE',2,0,[],[[.7,.8],[1,.8],[1,1],[.7,1]]]],e:['NW-N','NW-CHEST','N-NE','N-CHEST','W-CHEST','CHEST-HIDE','CHEST-STEM','STEM-S','SW-S','S-SE'],h:['SW','NE','SW','NE'],m:['N','CHEST','S','NW']},
 {a:[['NW',2,0,['loot'],[[0,0],[.22,0],[.22,.22],[0,.22]]],['N',2,0,[],[[.22,0],[.46,0],[.46,.22],[.22,.22]]],['NE',4,0,[],[[.46,0],[1,0],[1,.22],[.46,.22]]],['TOMB',3,0,['green'],[[0,.33],[.22,.33],[.22,.22],[.46,.22],[.46,.33],[.56,.33],[.56,.56],[0,.56]]],['E',4,0,[],[[.56,.33],[1,.33],[1,.7],[.56,.7]]],['MID',2,0,[],[[.33,.56],[.56,.56],[.56,.78],[.33,.78]]],['SW',3,0,[],[[0,.78],[.33,.78],[.33,1],[0,1]]],['S',2,0,[],[[.33,.78],[.56,.78],[.56,1],[.33,1]]],['SE',3,0,['loot'],[[.56,.78],[1,.78],[1,1],[.56,1]]]],e:['NW-N','N-NE','N-TOMB','TOMB-E','TOMB-MID','E-MID','MID-S','SW-S','S-SE'],h:['SW','NE','NE','NE'],m:['SE','TOMB','NW','TOMB']},
 {a:[['NW',4,0,[],[[0,0],[.56,0],[.56,.16],[.33,.16],[.33,.22],[0,.22]]],['NE',3,0,['loot'],[[.78,0],[1,0],[1,.22],[.78,.22]]],['W',3,0,[],[[0,.22],[.33,.22],[.33,.44],[0,.44]]],['CIRCLE',4,0,['red'],[[.33,.22],[.78,.22],[.78,.44],[.33,.44]]],['E',2,0,[],[[.78,.22],[1,.22],[1,.44],[.78,.44]]],['LOW_W',3,0,[],[[0,.44],[.22,.44],[.22,.78],[0,.78]]],['MID',2,0,['loot'],[[.33,.44],[.56,.44],[.56,.67],[.33,.67]]],['LOW_E',3,0,[],[[.78,.44],[1,.44],[1,.78],[.78,.78]]],['SW',4,0,[],[[0,.78],[.56,.78],[.56,1],[0,1]]],['SE',3,0,[],[[.67,.78],[1,.78],[1,1],[.67,1]]]],e:['NW-W','W-CIRCLE','CIRCLE-E','NE-E','W-LOW_W','CIRCLE-MID','E-LOW_E','LOW_W-SW','LOW_E-SE'],h:['SW','SW','SE','SE'],m:['E','W','NW','NE']},
 {a:[['N',4,0,['red'],[[.33,0],[.67,0],[.67,.33],[.33,.33]]],['NW',3,0,['loot'],[[.1,.1],[.33,.1],[.33,.33],[.1,.33]]],['NE',2,0,['loot'],[[.67,.1],[.9,.1],[.9,.33],[.67,.33]]],['W',3,0,[],[[0,.33],[.22,.33],[.22,.67],[0,.67]]],['C',4,0,['red'],[[.33,.33],[.67,.33],[.67,.67],[.33,.67]]],['E',3,0,[],[[.78,.33],[1,.33],[1,.67],[.78,.67]]],['SW',2,0,[],[[.1,.67],[.33,.67],[.33,.9],[.1,.9]]],['S',4,0,[],[[.33,.67],[.67,.67],[.67,1],[.33,1]]],['SE',2,0,[],[[.67,.67],[.9,.67],[.9,.9],[.67,.9]]]],e:['NW-N','N-NE','N-C','NW-W','NE-E','W-SW','SW-S','C-S','S-SE','E-SE'],h:['S','S','S','S'],m:['C','C','NW','NE']}
];
// Thin dark lines between printed Areas are borders; black voids are not traversable.
// Every edge above was visually reviewed; no Room 10 graph is used.
const oldTiles=read('c1c32r2-ruins-tile-area-contract').tiles;
const tiles=geometries.map((g,i)=>{const n=i+1;const refs=src(oldTiles[i].sourceReferences).map(s=>({...s,page:n%2?s.page:n/2+1,location:'printed Tile '+n+'; north-up; crop marks excluded'}));
 const id=label=>'ruins-tile-'+n+':'+label;
 const edges=g.e.map(e=>e.split('-'));
 return {tileId:'ruins-tile-'+n,roomNumber:n,side:n%2?'front':'back',sourceReferences:refs,
  areas:g.a.map(([label,capacity,elevation,glyphs,boundary])=>({id:id(label),location:label,boundary,capacity,elevation,glyphs,adjacent:edges.flatMap(([a,b])=>a===label?[id(b)]:b===label?[id(a)]:[]),sourceReferences:refs.map(s=>({...s,location:s.location+'; Area '+label}))})),
  heroStartingStanceAreas:Object.fromEntries(stances.map((s,j)=>[s,id(g.h[j])])),monsterStartingStanceAreas:Object.fromEntries(stances.map((s,j)=>[s,id(g.m[j])]))};});
write('ruins-tile-area-definitions',{tiles,visualReview:true,coordinateSystem:'normalized printed face, north at Room number',historicalBackPageCorrection:{historical:[1,2,3,4],official:[2,3,4,5],excludedPage1:'OLD_ROAD_TILE_0'},tileAreaContractsComplete:false,reviewStatus:'TRANSCRIBED_REQUIRES_TOPOLOGY_VALIDATION'});
const rule=(id,trigger,areas,side,effects,extra={})=>({id,trigger,areas,side,effects,actionCost:0,oncePerBattle:false,requiresNoMonsters:false,...extra});
const cond=(condition,amount,turns)=>({type:'condition',target:'target',condition,amount,turns});
const rs=[
 [rule('cornered','END_TURN',['NE','SW'],'hero',[{type:'stress',target:'target',amount:1}])],
 [rule('unholy-aura','PASSIVE',['S'],'hero',[{type:'healingProhibited'}])],
 [rule('healing-waters','END_TURN',['FOUNTAIN'],'hero',[{type:'heal',target:'target',amount:3}])],
 [rule('circle-of-power','END_TURN',['CIRCLE'],'monster',[{type:'heal',target:'target',amount:4}]),...['END_TURN','SHUFFLED_INTO'].map(t=>rule('spiked-pit-'+t,t,['PIT_W','PIT_E'],'all',[{type:'damage',amount:3},cond('bleed',1,3)]))],
 [rule('stressful-darkness','END_TURN',['NW','W','SW','S','SE'],'hero',[{type:'stress',target:'target',amount:1}]),rule('beacon-of-light','END_TURN',['NE'],'hero',[{type:'stress',target:'target',amount:-1}])],
 [rule('loot-chest','INTERACT',['CHEST'],'hero',[{type:'drawTrinket'}],{actionCost:2,oncePerBattle:true}),rule('hide-and-heal','INTERACT',['HIDE'],'hero',[{type:'stress',target:'target',amount:2},{type:'heal',target:'target',amount:'ALL_WOUNDS'}],{actionCost:1,requiresNoMonsters:true})],
 [rule('ancestors-glory','PASSIVE',['TOMB'],'hero',[{type:'immunity',conditions:['blight','bleed','debuff','stun','mark','push-pull']},...['blight','bleed','debuff','stun','mark','push-pull'].map(condition=>({type:'removeCondition',target:'target',condition}))])],
 [rule('the-invokers','LAST_MONSTER_MOVE',[],'monster',[{type:'moveTowards',areaId:'CIRCLE'}]),rule('invoking-abyss','ROUND_END',['CIRCLE'],'monster',[{type:'stress',target:'party',amount:2}])],
 [rule('feeling-the-presence','END_TURN',['N','C'],'hero',[{type:'quirkStressAndHealing',stressPerNegative:1,healPerPositivePerLevel:1}])]
];
write('ruins-room-effect-definitions',{rooms:rs.map((rules,i)=>({roomNumber:i+1,rules:rules.map(r=>({...r,areas:r.areas.map(a=>'ruins-tile-'+(i+1)+':'+a),effects:r.effects.map(e=>e.type==='moveTowards'?{...e,areaId:'ruins-tile-'+(i+1)+':'+e.areaId}:e)})),sourceReferences:src(deck.rooms[i].sourceReferences)})),visualReview:true});
write('ruins-monster-effect-contract',{ruleSetVersion:v4,schema:'src/types/ruins-executable.ts:PrintedEffect',runtimeStrings:false,executorBound:false,sourceReferences:[...src(read('c1c32r2-ordinary-threat-encounter-draw-contract').sourceReferences),ruleSource(20,'Skill self/target effect timing','printed-effect-timing'),ruleSource(21,'Condition definitions, stacks, Guard, Riposte, Protection, resistance and immunity','printed-conditions'),ruleSource(27,'Disease icon and acquisition','disease-acquisition')],effectTypes:[...new Set(definitions.flatMap(d=>d.skills.flatMap(s=>s.effects.map(e=>e.type))))],timing:{self:'BEFORE_TARGET_EFFECTS_EVEN_ON_MISS_IGNORE_RESISTANCE',target:'AFTER_DAMAGE_ON_HIT',noAccuracy:'AUTOMATIC_NO_ROLL',light:'ONCE_PER_SKILL_AFTER_SUCCESS'},guard:'MANDATORY_TARGET_PRIORITY',riposte:'HALF_INCOMING_ATTACK_DAMAGE_CEIL_BEFORE_PROTECTION'});
