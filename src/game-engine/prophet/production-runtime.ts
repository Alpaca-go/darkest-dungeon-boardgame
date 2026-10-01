import type {BattleState,MonsterSkillDefinition} from '../../types';
import type {BossRuntimeInput,BossEncounterState} from '../../types/boss-runtime';
import type {ProphetProductionState,ProphetAttackTransaction} from '../../types/prophet-production';
import mapJson from '../../../docs/data/complete-edition/c1c35-prophet-d10-area-map.json?raw';
import {SeededRandom} from '../runtime-sources';
import {rollD10,shuffleWithRng} from '../campaign/act-four/rng';
import {areaDistance,recordBossRuntimeEvent,withBossEncounterSources,createBossRuntimeChoice,freshUnit} from '../bosses/foundation';
import {resolveBossHeroStartingArea,BOSS_ENTRY_STANCES} from '../bosses/hero-entry';
import {resolveEncounterRuleDependencies} from '../bosses/definitions';
import {validateActorOccupancy} from '../rules/actor-occupancy';
import {startSourceMonsterAttack} from '../component-monster-runtime';
import {freezePendingMonsterAttack,commitPendingMonsterAttackResolution,advanceTurn} from '../battle';
import {PROPHET_RULE_SET_VERSION,PROPHET_ACTOR_CAPACITY_VERSION} from './production-definition';
import {applyBattleUnitDamage} from '../damage';

const mapping=JSON.parse(mapJson) as {entries:Array<{roll:number;areaId:string}>};
let commandDepth=0;
export function isExecutingProphetCommand():boolean{return commandDepth>0;}
export function prophetD10Area(roll:number):string {
  if(!Number.isInteger(roll)||roll<1||roll>10)throw new Error('Invalid Prophet printed D10');
  const value=mapping.entries.find(e=>e.roll===roll)?.areaId;
  if(!value)throw new Error('Prophet printed D10 map unbound');
  return value;
}
const state=(b:BattleState)=>{const p=b.bossEncounter?.prophetProduction;if(!p)throw new Error('Prophet gameplay requires production foundation acceptance');return p;};
const key=(b:BattleState)=>`${b.battleId}:round:${b.bossEncounter!.round}:ordinal:${state(b).actionOrdinal}`;
const orderHeroes=(b:BattleState,area:string)=>b.heroes.filter(h=>h.isAlive&&b.bossEncounter!.placements[h.id]===area)
  .sort((a,z)=>BOSS_ENTRY_STANCES.indexOf(a.stance)-BOSS_ENTRY_STANCES.indexOf(z.stance)||a.id.localeCompare(z.id)).map(h=>h.id);

export function initializeProphetProduction(b:BattleState):void {
  const e=b.bossEncounter!;
  e.ruleDependencies=resolveEncounterRuleDependencies(e.bossFamily,e.ruleSetVersion);
  const p:ProphetProductionState={schemaVersion:1,ruleSetVersion:PROPHET_RULE_SET_VERSION,d10MapVersion:'C1C35-PROPHET-PRINTED-D10-v1',
    areaCapacityRuleVersion:PROPHET_ACTOR_CAPACITY_VERSION,rubbleTargetRuleVersion:'C1C35R1-PROPHET-RUBBLE-TARGET-SCOPE-v1',
    actionOrdinal:1,pews:([1,2,3,4] as const).map(ordinal=>({physicalCopyId:`${b.battleId}:wooden-pew:${ordinal}`,ordinal,areaId:null,
      placementRoll:null,placementRound:null,lifecycle:'STORED'})),rubbleCursor:0,entryBindings:{},placementTransactions:[],
    pendingPewAttack:null,attacks:[],resolvedActionKeys:[],returnedPewIds:[],replayOrigin:null,commands:[]};
  e.prophetProduction=p;
  sealProphetReplayOrigin(b);
}
export function sealProphetReplayOrigin(b:BattleState):void {
  const p=state(b);
  if(p.commands.length)throw new Error('Cannot reset live Prophet replay origin');
  p.entryBindings=Object.fromEntries(b.heroes.map(h=>[h.id,{stance:h.stance,areaId:resolveBossHeroStartingArea(b.bossEncounter!.definition,h.stance)}]));
  const origin=structuredClone(b);origin.bossEncounter!.prophetProduction!.replayOrigin=null;
  p.replayOrigin=origin;
}
export function prophetSkillSnapshot(b:BattleState,number:number):MonsterSkillDefinition {
  const e=b.bossEncounter!,skill=e.definition.skills.find(s=>s.number===number);
  if(!skill)throw new Error('Source-bound Prophet Skill absent');
  return {id:`official:${e.battleCardId}:skill:${number}`,monsterId:`prophet-level-${e.bossLevel}`,name:skill.name,
    usableFromPositions:[1,2,3,4],validTargetPositions:[1,2,3,4],targetSide:'enemy',accuracy:skill.accuracy,
    minDamage:skill.damage as number,maxDamage:skill.critDamage as number,stress:skill.stress,
    ...(skill.applyEffects?{applyEffects:structuredClone(skill.applyEffects)}:{}),description:'Source-bound Prophet production semantics'};
}
function syncOccupancy(b:BattleState):void {
  const e=b.bossEncounter!;
  b.actorOccupancy={ruleSetVersion:PROPHET_ACTOR_CAPACITY_VERSION,placements:{...e.placements},
    occupiedSpaces:Object.fromEntries([...b.heroes,...b.monsters].map(a=>[a.id,a.side==='hero'?1:2]))};
  validateActorOccupancy(b);
}
function settleAction(b:BattleState):void {
  const e=b.bossEncounter!,p=state(b),actionKey=key(b);
  if(p.resolvedActionKeys.includes(actionKey))throw new Error('Prophet action already committed');
  p.resolvedActionKeys.push(actionKey);
  recordBossRuntimeEvent(b,'PROPHET_ACTION_COMPLETE',{actionKey,round:e.round,ordinal:p.actionOrdinal});
  if(p.actionOrdinal<3)p.actionOrdinal=(p.actionOrdinal+1) as 2|3;
  else e.bossState.lastActionRound=e.round;
  e.phase='BATTLE_ACTIVE';
}
function startAttack(b:BattleState,number:number,areaId:string,targets:string[],rng:()=>number,pewOrdinal:1|2|3|4|null,parent:string):void {
  const p=state(b),e=b.bossEncounter!,attackRoll=rollD10(rng);
  const transactionId=key(b)+(pewOrdinal?`:pew:${pewOrdinal}`:':normal');
  if(p.attacks.some(a=>a.transactionId===transactionId))throw new Error('Duplicate Prophet attack transaction');
  const tx:ProphetAttackTransaction={transactionId,physicalCopyId:pewOrdinal?p.pews.find(w=>w.ordinal===pewOrdinal)!.physicalCopyId:null,
    physicalOrdinal:pewOrdinal,areaId,targetActorIds:targets.slice(),skillNumber:number,attackRoll,phase:'ROLL_COMMITTED',
    currentTargetIndex:0,resolvedTargetIds:[],parentEventId:parent};
  p.pendingPewAttack=tx;
  recordBossRuntimeEvent(b,'PROPHET_ATTACK_COMMITTED',{...tx},targets,pewOrdinal?'pew-attack-order-and-save':undefined,parent);
  if(!targets.length){finishAttack(b);return;}
  const skill=e.definition.skills.find(s=>s.number===number)!;
  Object.assign(b,startSourceMonsterAttack(b,e.bossState.actorId!,targets,attackRoll,{skill:prophetSkillSnapshot(b,number),
    criticalEnabled:true,criticalThreshold:skill.crit as number,criticalDamage:skill.critDamage as number,targetPush:0,
    remainingHeroes:[],alreadyResolvedHeroes:[],successfulHits:[],parentEventId:parent,targetAreaId:areaId,summonDefinitionId:null,skillNumber:number}));
}
function finishAttack(b:BattleState):void {
  const p=state(b),tx=p.pendingPewAttack!;tx.phase='COMPLETE';
  p.attacks.push(structuredClone(tx));p.pendingPewAttack=null;
  recordBossRuntimeEvent(b,'PROPHET_ATTACK_COMPLETE',{transactionId:tx.transactionId,physicalOrdinal:tx.physicalOrdinal},tx.targetActorIds,undefined,tx.parentEventId);
  if(tx.physicalOrdinal){p.pews.find(w=>w.ordinal===tx.physicalOrdinal)!.lifecycle='RESOLVED';p.rubbleCursor=tx.physicalOrdinal;
    if(p.rubbleCursor===4)settleAction(b);
  }else settleAction(b);
}
/** Invoked only after the shared damage/condition/death window has committed this target. */
export function finishProphetTarget(b:BattleState,hit:boolean):BattleState {
  const p=state(b),pending=b.pendingMonsterAttack!,tx=p.pendingPewAttack!,source=pending.sourceAttack!;
  if(tx.targetActorIds[tx.currentTargetIndex]!==pending.targetHeroUnitId||tx.resolvedTargetIds.includes(pending.targetHeroUnitId))throw new Error('Prophet target replay');
  recordBossRuntimeEvent(b,hit?'TARGET_EFFECT':'TARGET_MISSED',{transactionId:tx.transactionId,attackRoll:tx.attackRoll,hit,crit:pending.crit,
    damage:pending.baseDamage,hero:structuredClone(b.heroes.find(h=>h.id===pending.targetHeroUnitId))},[pending.targetHeroUnitId],undefined,tx.parentEventId);
  tx.resolvedTargetIds.push(pending.targetHeroUnitId);tx.currentTargetIndex++;tx.phase='RESOLVING_TARGET';
  b.pendingMonsterAttack=null;
  if(tx.currentTargetIndex<tx.targetActorIds.length){Object.assign(b,startSourceMonsterAttack(b,pending.monsterUnitId,
    tx.targetActorIds.slice(tx.currentTargetIndex),tx.attackRoll,{...source,alreadyResolvedHeroes:tx.resolvedTargetIds.slice(),
      successfulHits:hit?[...source.successfulHits,pending.targetHeroUnitId]:source.successfulHits}));}
  else finishAttack(b);
  return b;
}
function crowded(b:BattleState):Record<string,string[]> {
  return Object.fromEntries(b.bossEncounter!.definition.areas.map(a=>[a.id,orderHeroes(b,a.id)]));
}
function normalAttack(b:BattleState,area:string,rng:()=>number):void {
  const e=b.bossEncounter!,p=state(b),selection=p.skillSelection!,skill=e.definition.skills.find(s=>s.number===selection.selectedSkill)!;
  if(areaDistance(e.definition,e.placements[e.bossState.actorId!],area)!==skill.range){
    recordBossRuntimeEvent(b,'SKILL_OUT_OF_RANGE',{actionKey:selection.actionKey,areaId:area,range:skill.range},[],undefined,selection.parentEventId);settleAction(b);return;}
  startAttack(b,skill.number,area,orderHeroes(b,area).slice(0,skill.targetCount),rng,null,selection.parentEventId);
}
function nextPew(b:BattleState,rng:()=>number):void {
  const p=state(b),e=b.bossEncounter!;
  if(p.actionOrdinal!==3||p.rubbleCursor>=4||p.pendingPewAttack||b.pendingMonsterAttack||e.pendingChoice)throw new Error('Rubble cursor cannot advance');
  const ordinal=(p.rubbleCursor+1) as 1|2|3|4,w=p.pews.find(w=>w.ordinal===ordinal)!;
  if(w.lifecycle!=='PLACED'||!w.areaId)throw new Error('Current physical Pew ownership invalid');
  b.activeActorId=e.bossState.actorId;
  w.lifecycle='RESOLVING';
  const parent=recordBossRuntimeEvent(b,'PEW_ATTACK_STARTED',{physicalCopyId:w.physicalCopyId,physicalOrdinal:ordinal,areaId:w.areaId},[],
    'C1C35R1-PROPHET-RUBBLE-TARGET-SCOPE-v1');
  startAttack(b,3,w.areaId,orderHeroes(b,w.areaId),rng,ordinal,parent);
}
export function returnProphetPews(b:BattleState):void {
  const e=b.bossEncounter!,p=state(b);
  e.pendingChoice=null;b.pendingMonsterAttack=null;p.pendingPewAttack=null;
  for(const w of p.pews){if(!p.returnedPewIds.includes(w.physicalCopyId))p.returnedPewIds.push(w.physicalCopyId);
    w.lifecycle='STORED';w.areaId=null;w.placementRoll=null;w.placementRound=null;}
}
function raw(b:BattleState,input:BossRuntimeInput,rng:()=>number):BattleState {
  const e=b.bossEncounter!,p=state(b);
  if(input.type==='CLEANUP'){
    if(!e.cleanupState.completed){returnProphetPews(b);e.cleanupState.completed=true;e.bossState.storage='BOSS_ENCOUNTER_STORAGE';e.phase='COMPLETE';
      recordBossRuntimeEvent(b,'ENCOUNTER_CLEANUP',{returnedPewIds:p.returnedPewIds.slice()});}return b;}
  if(e.phase==='COMPLETE'||e.phase==='VICTORY')throw new Error('Prophet future actions cancelled');
  if(input.type==='ENTER_BOSS_ROOM'){
    if(e.side!=='THREAT')throw new Error('Already entered Boss Room');
    for(const hero of b.heroes)e.placements[hero.id]=resolveBossHeroStartingArea(e.definition,hero.stance);
    const id=`${b.battleId}:boss`,number=e.bossLevel;
    const boss={...freshUnit({definitionId:`prophet-level-${number}`,sourceCardId:e.battleCardId,dataAuthority:'OFFICIAL_SOURCE',
      ruleSetVersion:e.ruleSetVersion,life:e.definition.stats.HP,speed:0,large:true,occupiedSlots:2,tags:e.definition.stats.type,skillIds:[]},id,1),
      name:'Prophet',bossCombatDodge:e.definition.stats.dodge,immunities:['stun','shuffle']};
    boss.equippedTrinketInstanceIds=[];
    b.pendingAction=null;b.pendingRuleEvents=[];b.pendingDiseaseInfections=[];
    b.monsters=[boss];e.bossState.actorId=id;e.placements[id]=e.definition.bossStartArea;e.side='ABILITY';e.phase='BATTLE_ACTIVE';
    b.round=1;e.round=1;b.stagedIncomingAttacks=true;b.roundLimitEnabled=false;b.roundLimitPolicy='not-counted';
    b.boss={isBossBattle:true,bossActorId:id,bossDefinitionId:boss.sourceId,bossFamilyId:'prophet',threatId:`prophet-threat-level-${number}`,
      actionsPerRound:3,bossInitiativeCardIds:[],roundLimitEnabled:false,currentRound:1,bossDefeated:false,victoryResolved:false,
      summonHistory:[],bossRevealTransactionId:`${b.battleId}:reveal`,bossVictoryTransactionId:null,actionSelections:[]};
    syncOccupancy(b);
    b.initiativeOrder=shuffleWithRng(rng,[...b.heroes.filter(h=>h.isAlive).map(h=>h.id),id,id,id]);
    b.initiativeIndex=-1;b.activeActorId=null;
    recordBossRuntimeEvent(b,'BOSS_BATTLE_STARTED',{areaId:e.definition.bossStartArea,entryBindings:p.entryBindings,actionsPerRound:3});return b;
  }
  if(e.side!=='ABILITY')throw new Error('Prophet Boss Room not entered');
  if(input.type==='PROPHET_ADVANCE_TURN')return advanceTurn(b);
  if(input.type==='PROPHET_ATTACK_FREEZE'){
    if(b.pendingMonsterAttack?.stage!=='incoming-attack-window')throw new Error('Attack freeze replay');return freezePendingMonsterAttack(b);}
  if(input.type==='PROPHET_ATTACK_COMMIT'){
    if(b.pendingMonsterAttack?.stage!=='hero-hit-window')throw new Error('Damage commit replay');return commitPendingMonsterAttackResolution(b);}
  if(input.type==='MONSTER_DAMAGE'||input.type==='DEATHS'){
    const boss=b.monsters.find(m=>m.id===e.bossState.actorId)!;
    const amount=input.type==='DEATHS'?(input.instanceIds.includes(boss.id)?boss.maxHp:0):input.amounts[boss.id];
    if(!Number.isFinite(amount)||amount<0)throw new Error('Invalid Prophet damage');
    Object.assign(boss,applyBattleUnitDamage(boss,amount).unit);
    recordBossRuntimeEvent(b,'PROPHET_DAMAGE',{amount,hp:boss.hp},[boss.id]);
    if(!boss.isAlive){returnProphetPews(b);e.phase='VICTORY';b.status='victory';b.initiativeOrder=[];b.activeActorId=null;
      b.boss!.bossDefeated=true;recordBossRuntimeEvent(b,'BOSS_DEFEATED',{futureActionsCancelled:true});}return b;
  }
  if(b.pendingMonsterAttack||p.pendingPewAttack)throw new Error('Finish stored Prophet attack before another command');
  if(input.type==='CHOICE'){
    const c=e.pendingChoice,s=p.crowdedChoice;
    if(!c||!s||input.choiceId!==c.choiceId||s.choiceId!==c.choiceId||s.actionKey!==key(b)||p.actionOrdinal!==2
      ||s.round!==e.round||s.ruleSetVersion!==e.ruleSetVersion||!s.candidateAreaIds.includes(input.selectedId)
      ||JSON.stringify(crowded(b))!==JSON.stringify(s.occupancySnapshot))throw new Error('Stale or forged Prophet Crowded choice');
    s.selectedAreaId=input.selectedId;e.pendingChoice=null;
    recordBossRuntimeEvent(b,'CHOICE_COMMITTED',{choiceId:c.choiceId,areaId:input.selectedId},[], 'crowded-area-tie',c.createdAtEventId);
    normalAttack(b,input.selectedId,rng);return b;
  }
  if(e.pendingChoice)throw new Error('Resolve Prophet PendingChoice first');
  if(input.type==='PROPHET_NEXT_PEW'){nextPew(b,rng);return b;}
  if(input.type==='PROPHET_ROUND'){
    if(!p.resolvedActionKeys.includes(key(b))||p.actionOrdinal!==3||p.rubbleCursor!==4)throw new Error('New round before ordinal 3 completion');
    e.round++;b.round=e.round;p.actionOrdinal=1;
    b.boss!.currentRound=e.round;
    const id=e.bossState.actorId!;b.initiativeOrder=shuffleWithRng(rng,[...b.heroes.filter(h=>h.isAlive).map(h=>h.id),id,id,id]);
    b.initiativeIndex=-1;recordBossRuntimeEvent(b,'PROPHET_ROUND_STARTED',{round:e.round});return b;
  }
  if(input.type==='MOVE_HERO_AREA'){
    const hero=b.heroes.find(h=>h.id===input.heroId&&h.isAlive);
    if(!hero||b.activeActorId!==hero.id||b.currentActionPoints<1||!e.definition.areas.some(a=>a.id===input.areaId)
      ||areaDistance(e.definition,e.placements[hero.id],input.areaId)>hero.speed)throw new Error('Illegal Hero Area movement');
    e.placements[hero.id]=input.areaId;syncOccupancy(b);b.currentActionPoints--;
    recordBossRuntimeEvent(b,'HERO_AREA_MOVED',{areaId:input.areaId},[hero.id]);return b;
  }
  if(input.type!=='SKILL')throw new Error('Unsupported Prophet production input');
  if(input.skillRoll!==undefined||input.attackRoll!==undefined||input.round!==undefined&&input.round!==e.round
    ||input.actionOrdinal!==undefined&&input.actionOrdinal!==p.actionOrdinal||p.resolvedActionKeys.includes(key(b)))throw new Error('Invalid Prophet ordinal/round or injected RNG');
  b.activeActorId=e.bossState.actorId;
  e.phase='BATTLE_RESOLVING';
  if(p.actionOrdinal===1){
    if(p.placementTransactions.length&&p.rubbleCursor!==4)throw new Error('Previous Rubble incomplete');
    const copies=[];
    for(const w of p.pews.slice().sort((a,z)=>a.ordinal-z.ordinal)){
      const before=(getSharedRngState());const roll=rollD10(rng),after=getSharedRngState(),areaId=prophetD10Area(roll);
      Object.assign(w,{areaId,placementRoll:roll,placementRound:e.round,lifecycle:'PLACED'});
      copies.push({physicalCopyId:w.physicalCopyId,physicalOrdinal:w.ordinal,roll,areaId,rngBefore:before,rngAfter:after});
    }
    p.placementTransactions.push({actionKey:key(b),round:e.round,copies});p.rubbleCursor=0;
    recordBossRuntimeEvent(b,'PEWS_PLACED',p.placementTransactions[p.placementTransactions.length-1]);settleAction(b);return b;
  }
  if(p.actionOrdinal===2){
    if(p.skillSelection?.actionKey===key(b))throw new Error('Ordinal 2 already started');
    const skillRoll=rollD10(rng),selectedSkill=skillRoll<=5?1:2;
    const parentEventId=recordBossRuntimeEvent(b,'SKILL_ROLLED',{skillRoll,skillNumber:selectedSkill,actionKey:key(b)});
    p.skillSelection={skillRoll,selectedSkill,actionKey:key(b),round:e.round,ordinal:2,parentEventId};
    const snapshot=crowded(b),maximum=Math.max(0,...Object.values(snapshot).map(ids=>ids.length));
    const candidates=Object.keys(snapshot).filter(area=>maximum>0&&snapshot[area].length===maximum);
    if(!candidates.length){settleAction(b);return b;}
    if(candidates.length===1){normalAttack(b,candidates[0],rng);return b;}
    createBossRuntimeChoice(b,'CHOICE_TARGET_AREA',candidates,{kind:'prophet-crowded',actionKey:key(b),parentEventId},'crowded-area-tie',parentEventId);
    p.crowdedChoice={choiceId:e.pendingChoice!.choiceId,actionKey:key(b),round:e.round,ordinal:2,ruleSetVersion:e.ruleSetVersion,
      candidateAreaIds:candidates,candidateHeroIds:candidates.flatMap(a=>snapshot[a]),occupancySnapshot:snapshot,selectedAreaId:null};return b;
  }
  if(p.rubbleCursor!==0)throw new Error('Rubble action already started');nextPew(b,rng);return b;
}
import {getRuntimeSources} from '../runtime-sources';
function getSharedRngState():number {const source=getRuntimeSources().random;if(!(source instanceof SeededRandom))throw new Error('Shared seeded RNG required');return source.snapshot();}

/** Source transaction boundary. A rejected command leaves its input and shared RNG untouched. */
export function applyProphetRuntimeInput(battle:BattleState,input:BossRuntimeInput,validate=true):BattleState {
  if(isExecutingProphetCommand())return withBossEncounterSources(structuredClone(battle),(b,rng)=>raw(b,input,rng));
  const boss=battle.monsters.find(m=>m.id===battle.bossEncounter!.bossState.actorId);
  if(validate)validateProphetProduction(battle,input.type==='DEATHS'&&!!boss&&!boss.isAlive&&boss.hp===0&&input.instanceIds.includes(boss.id));
  if(input.type==='CLEANUP'&&battle.bossEncounter!.cleanupState.completed)return battle;
  let result:BattleState;
  commandDepth++;
  try{result=withBossEncounterSources(structuredClone(battle),(b,rng)=>raw(b,input,rng),!validate);}finally{commandDepth--;}
  state(result).commands.push(structuredClone(input));result.bossEncounter!.inputs.push(structuredClone(input));
  if(validate)validateProphetProduction(result);
  return result;
}
/** Replay from the committed shared origin rejects altered rolls, candidates, cursor, RNG and ownership. */
export function validateProphetProduction(b:BattleState,committedBossDeath=false):void {
  const e=b.bossEncounter!,p=state(b);
  if(p.schemaVersion!==1||p.ruleSetVersion!==PROPHET_RULE_SET_VERSION||p.d10MapVersion!=='C1C35-PROPHET-PRINTED-D10-v1'
    ||p.areaCapacityRuleVersion!==PROPHET_ACTOR_CAPACITY_VERSION||p.rubbleTargetRuleVersion!=='C1C35R1-PROPHET-RUBBLE-TARGET-SCOPE-v1'
    ||p.pews.length!==4||new Set(p.pews.map(w=>w.physicalCopyId)).size!==4||p.pews.map(w=>w.ordinal).sort().join(',')!=='1,2,3,4'
    ||p.pews.some(w=>w.physicalCopyId!==`${b.battleId}:wooden-pew:${w.ordinal}`)
    ||![1,2,3].includes(p.actionOrdinal)||![0,1,2,3,4].includes(p.rubbleCursor)||new Set(p.resolvedActionKeys).size!==p.resolvedActionKeys.length)
    throw new Error('Invalid Prophet production state/ownership');
  if(!p.replayOrigin)throw new Error('Prophet replay origin absent');
  if(e.side==='THREAT'){
    if(Object.keys(p.entryBindings).length!==p.replayOrigin.heroes.length)throw new Error('Threat Hero entry coverage missing');
    if(p.commands.length||p.actionOrdinal!==1||p.rubbleCursor!==0||p.pendingPewAttack||p.attacks.length||p.placementTransactions.length
      ||p.resolvedActionKeys.length||p.returnedPewIds.length||p.pews.some(w=>w.lifecycle!=='STORED'||w.areaId!==null||w.placementRoll!==null))throw new Error('Unentered Prophet components mutated');
    for(const [id,binding] of Object.entries(p.entryBindings))if(binding.areaId!==resolveBossHeroStartingArea(e.definition,binding.stance)
      ||!p.replayOrigin.heroes.some(h=>h.id===id&&h.stance===binding.stance))throw new Error('Threat Hero entry binding mismatch');
    return;
  }
  const origin=structuredClone(p.replayOrigin);state(origin).replayOrigin=structuredClone(p.replayOrigin);
  let replay=origin;
  for(const command of p.commands)replay=applyProphetRuntimeInput(replay,command,false);
  const projection=(s:BattleState)=>{
    const x=s.bossEncounter!,t=structuredClone(state(s));t.replayOrigin=null;t.pews.sort((a,z)=>a.ordinal-z.ordinal);
    return {state:t,round:x.round,side:x.side,phase:x.phase,placements:x.placements,rngState:x.rngState,clockCursor:x.clockCursor,idCursor:x.idCursor,
      events:x.events,eventSequence:x.eventSequence,pendingChoice:x.pendingChoice,bossState:x.bossState,cleanupCompleted:x.cleanupState.completed,
      checkpointContext:x.checkpointContext,occupancy:s.actorOccupancy,pendingMonsterAttack:s.pendingMonsterAttack??null,
      heroes:s.heroes,monsters:s.monsters.map(m=>committedBossDeath&&m.id===x.bossState.actorId?{...m,hp:0,isAlive:false}:m),initiativeOrder:s.initiativeOrder,initiativeIndex:s.initiativeIndex,
      bossMetadata:s.boss,pendingRuleEvents:s.pendingRuleEvents??[]};
  };
  if(JSON.stringify(projection(b))!==JSON.stringify(projection(replay)))throw new Error('Prophet save/replay transaction mismatch: '+Object.keys(projection(b)).filter(k=>JSON.stringify((projection(b) as Record<string,unknown>)[k])!==JSON.stringify((projection(replay) as Record<string,unknown>)[k])).join(','));
  for(const h of b.heroes){const binding=p.entryBindings[h.id];if(!binding||h.stance!==binding.stance)throw new Error('Hero Stance changed without transaction');}
  if(e.side==='ABILITY')validateActorOccupancy(b);
}

export function validateProphetArchivedEncounter(e:BossEncounterState):void {
  if(!e.prophetProduction)return;
  const p=e.prophetProduction;
  if(!p.replayOrigin)throw new Error('Archived Prophet origin absent');
  let replay=structuredClone(p.replayOrigin);state(replay).replayOrigin=structuredClone(p.replayOrigin);
  for(const input of p.commands)replay=applyProphetRuntimeInput(replay,input,false);
  replay.bossEncounter=structuredClone(e);
  const receipt=p.campaignFinalizationReceipt;
  if(receipt){
    if(!e.cleanupState.roomCleaned||e.cleanupState.campaignTransactionId!==receipt.transactionId
      ||JSON.stringify(receipt.after)!==JSON.stringify({rngState:e.rngState,clockCursor:e.clockCursor,idCursor:e.idCursor}))throw new Error('Prophet campaign finalization checkpoint mismatch');
    Object.assign(replay.bossEncounter,receipt.before);
    delete state(replay).campaignFinalizationReceipt;
  }
  validateProphetProduction(replay);
}
