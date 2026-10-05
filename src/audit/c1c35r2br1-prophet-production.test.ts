import {describe,it,expect} from 'vitest';
import {prophetFoundationCampaign,prophetCommand,finishProphetAttack,roundTripProphet} from '../../scripts/audit/c1c35r2br1-fixture';
import {prophetProductionDefinition,PROPHET_RULE_SET_VERSION} from '../game-engine/prophet/production-definition';
import {resolveBossHeroStartingArea,BOSS_ENTRY_STANCES} from '../game-engine/bosses/hero-entry';
import {resolveBossDefinition} from '../game-engine/bosses/definitions';
import {prophetD10Area,validateProphetProduction} from '../game-engine/prophet/production-runtime';
import {returnProductionBossRoomOnTermination,validateProductionBossRoomStorage} from '../game-engine/bosses/room-storage';
import {validateBossSaveContracts} from '../game-engine/bosses/save-dispatch';
import {commitBossFoundationVictory} from '../game-engine/commands/boss-foundation';
import {validateActorOccupancy} from '../game-engine/rules/actor-occupancy';
import {createSaveSnapshot,validateSaveFile,restoreSaveSnapshot} from '../game-engine/save';
import {applyProphetThreatEvent} from '../game-engine/prophet/production-threat';
import {advanceTurn} from '../game-engine/battle';
import {SeededRandom} from '../game-engine/runtime-sources';
import {auditProductionPrototypeReachability} from '../../scripts/audit/c1c35r2a-prototype-reachability';
import tile from '../../docs/data/complete-edition/c1c35-prophet-tile-contract.json';
import type {CampaignState} from '../types';
import {createRuinsDrawState,drawOrdinaryRuinsEncounter} from '../game-engine/ruins/encounter-draw';
import {beginOrdinaryRuinsBattle} from '../game-engine/ruins/battle-runtime';
import {ruinsMonster} from '../game-engine/ruins/source-registry';
import {RUINS_V6} from '../types/ruins-executable';
import {recoverStress} from '../game-engine/stress';
import {checkEnd} from '../game-engine/battle';
import {applyBattleUnitDamage} from '../game-engine/damage';

const p=(c:CampaignState)=>c.battle!.bossEncounter!.prophetProduction!;
function seedFor(skill:1|2){for(let seed=0;seed<1000;seed++){const rng=new SeededRandom(seed);for(let i=0;i<10;i++)rng.next();if((Math.floor(rng.next()*10)+1<=5?1:2)===skill)return seed;}throw new Error('No seed');}
function ordinal3(level:1|2|3,seed=35){let c=prophetFoundationCampaign(level,seed);c=prophetCommand(c,{type:'SKILL',actionOrdinal:1});
  c=prophetCommand(c,{type:'SKILL',actionOrdinal:2});if(c.battle!.bossEncounter!.pendingChoice)c=prophetCommand(c,{type:'CHOICE',choiceId:c.battle!.bossEncounter!.pendingChoice!.choiceId,selectedId:p(c).crowdedChoice!.candidateAreaIds[0]});
  return finishProphetAttack(c);}
function placementSeed(predicate:(rolls:number[])=>boolean){for(let seed=0;seed<10000;seed++){
  const r=new SeededRandom(seed);for(let i=0;i<6;i++)r.next();const rolls=Array.from({length:4},()=>Math.floor(r.next()*10)+1);
  if(predicate(rolls))return seed;}throw new Error('No placement seed');}

describe('C1C35R2B-R1 official Hero entry and production transactions',()=>{
  it('binds the already official source map, without a new ruling',()=>{
    expect(tile.stancePositions.status).toBe('OFFICIAL_SOURCE');
    expect(prophetProductionDefinition(1).heroStartingStanceAreas).toEqual(tile.stancePositions.heroes);
  });
  it.each(BOSS_ENTRY_STANCES)('resolves source-bound %s individually',stance=>{
    expect(resolveBossHeroStartingArea(prophetProductionDefinition(1),stance)).toBe(tile.stancePositions.heroes[stance]);
    expect(resolveBossHeroStartingArea(resolveBossDefinition('necromancer',1,'C1C31-DIGITAL-DEFAULT-v2'),stance)).toBe('bottom');
  });
  it('rejects unknown Stance, absent map, foreign Area and Prophet single-Area fallback',()=>{
    const d=prophetProductionDefinition(1);
    expect(()=>resolveBossHeroStartingArea(d,'unknown' as never)).toThrow();
    expect(()=>resolveBossHeroStartingArea({...d,heroStartingStanceAreas:undefined,heroStartArea:'ruins-tile-11:S'},'aggressive')).toThrow();
    expect(()=>resolveBossHeroStartingArea({...d,heroStartingStanceAreas:{...d.heroStartingStanceAreas!,aggressive:'foreign'}},'aggressive')).toThrow();
  });
  it.each([1,2,3] as const)('executes Level %i source definitions, live entry, shared save and Room cleanup',level=>{
    const reserved=prophetFoundationCampaign(level,35,false);
    expect(reserved.bossEncounterCheckpoint!.rngState).toBe(new SeededRandom(35).snapshot());
    expect(reserved.bossRoomStorage).toMatchObject({roomCardId:44710,tileId:'ruins-tile-11',lifecycle:'RESERVED'});
    expect(()=>validateProductionBossRoomStorage(roundTripProphet(reserved))).not.toThrow();
    for(const mutate of [(f:CampaignState)=>{f.heroes[0].stance='support';},
      (f:CampaignState)=>{f.bossEncounterCheckpoint!.prophetProduction!.entryBindings={};},
      (f:CampaignState)=>{f.bossEncounterCheckpoint!.prophetProduction!.pews[0].physicalCopyId='foreign-copy';}]){
      const forged=structuredClone(reserved);mutate(forged);expect(validateSaveFile(createSaveSnapshot(forged))).not.toBeNull();}
    const c=prophetFoundationCampaign(level);
    expect(c.bossRoomStorage!.lifecycle).toBe('IN_PLAY');expect(c.battle!.monsters).toHaveLength(1);
    expect(c.battle!.bossEncounter!.definition.skills).toHaveLength(3);
    for(const hero of c.battle!.heroes)expect(c.battle!.bossEncounter!.placements[hero.id]).toBe(tile.stancePositions.heroes[hero.stance]);
    expect(Object.values(p(c).entryBindings).filter(x=>x.areaId==='ruins-tile-11:S')).toHaveLength(2);
    expect(c.battle!.actorOccupancy!.occupiedSpaces[c.battle!.monsters[0].id]).toBe(2);
    expect(c.battle!.initiativeOrder.filter(id=>id===c.battle!.monsters[0].id)).toHaveLength(3);
    expect(roundTripProphet(c)).toEqual(c);
    for(const reason of ['incomplete','failed'] as const){const returned=returnProductionBossRoomOnTermination(c,reason);expect(returned.bossRoomStorage!.lifecycle).toBe('RETURNED');
      expect(returnProductionBossRoomOnTermination(returned,reason)).toBe(returned);expect(()=>validateBossSaveContracts(returned)).not.toThrow();}
  });
  it('uses every official printed D10 mapping including duplicate NW/E',()=>{
    expect(Array.from({length:10},(_,i)=>prophetD10Area(i+1))).toEqual(['NW','NW','N','NE','W','C','E','E','SW','S'].map(a=>'ruins-tile-11:'+a));
  });
  it('commits four shared placement rolls atomically and reuses IDs next round',()=>{
    let c=prophetFoundationCampaign();const before=c.battle!.bossEncounter!.rngState,ids=p(c).pews.map(w=>w.physicalCopyId);
    c=prophetCommand(c,{type:'SKILL',actionOrdinal:1});const rng=new SeededRandom(0);rng.restore(before);for(let i=0;i<4;i++)expect(p(c).pews[i].placementRoll).toBe(Math.floor(rng.next()*10)+1);
    expect(c.battle!.bossEncounter!.rngState).toBe(rng.snapshot());expect(roundTripProphet(c)).toEqual(c);
    c=prophetCommand(c,{type:'SKILL',actionOrdinal:2});c=finishProphetAttack(c);
    c=prophetCommand(c,{type:'SKILL',actionOrdinal:3});c=finishProphetAttack(c);
    while(p(c).rubbleCursor<4){c=prophetCommand(c,{type:'PROPHET_NEXT_PEW'});c=finishProphetAttack(c);}
    c=prophetCommand(c,{type:'PROPHET_ROUND'});c=prophetCommand(c,{type:'SKILL',actionOrdinal:1});expect(p(c).pews.map(w=>w.physicalCopyId)).toEqual(ids);
  });
  it.each([1,2,3] as const)('executes Eye on You and Fulminate through shared damage/condition pipeline at Level %i',level=>{
    for(const selected of [1,2] as const){let c=prophetFoundationCampaign(level,seedFor(selected));c=prophetCommand(c,{type:'SKILL',actionOrdinal:1});
      c=prophetCommand(c,{type:'SKILL',actionOrdinal:2});expect(p(c).skillSelection!.selectedSkill).toBe(selected);
      expect(c.battle!.pendingMonsterAttack!.sourceAttack!.skill.applyEffects![0]).toMatchObject(selected===1?{type:'stun',durationTurns:2}:{type:'blight',durationTurns:3,amount:level});
      c=finishProphetAttack(roundTripProphet(c));expect(p(c).actionOrdinal).toBe(3);expect(p(c).attacks[0].resolvedTargetIds).toEqual(p(c).attacks[0].targetActorIds);
    }
  });
  it.each([1,2,3] as const)('persists every Rubble checkpoint, targets, roll, damage and death interruption at Level %i',level=>{
    let c=ordinal3(level);const before=c.battle!.bossEncounter!.rngState;
    c=prophetCommand(c,{type:'SKILL',actionOrdinal:3});
    for(let ordinal=1;ordinal<=4;ordinal++){
      if(c.battle!.pendingMonsterAttack){c=roundTripProphet(c);c=prophetCommand(c,{type:'PROPHET_ATTACK_FREEZE'});expect(roundTripProphet(c)).toEqual(c);c=finishProphetAttack(c);}
      expect(p(c).rubbleCursor).toBe(ordinal);expect(roundTripProphet(c)).toEqual(c);
      if(ordinal<4)c=prophetCommand(c,{type:'PROPHET_NEXT_PEW'});
    }
    const rubble=p(c).attacks.filter(a=>a.physicalOrdinal);expect(rubble.map(a=>a.physicalOrdinal)).toEqual([1,2,3,4]);
    const rng=new SeededRandom(0);rng.restore(before);for(const tx of rubble){expect(tx.attackRoll).toBe(Math.floor(rng.next()*10)+1);}
    expect(c.battle!.bossEncounter!.definition.skills[2].damage).toBe([9,12,16][level-1]);
    expect(()=>prophetCommand(c,{type:'SKILL',actionOrdinal:3})).toThrow();
    expect(()=>prophetCommand(c,{type:'PROPHET_ATTACK_COMMIT'})).toThrow();
  });
  it('rejects ordinal skips and premature round advance without mutation',()=>{
    const c=prophetFoundationCampaign(),before=JSON.stringify(c);
    expect(()=>prophetCommand(c,{type:'SKILL',actionOrdinal:3})).toThrow();expect(()=>prophetCommand(c,{type:'PROPHET_ROUND'})).toThrow();expect(JSON.stringify(c)).toBe(before);
  });
  it('keeps Actor capacity separate from four Pew markers',()=>{
    const c=prophetFoundationCampaign(),b=c.battle!,e=b.bossEncounter!;
    for(const a of [...b.heroes,...b.monsters]){e.placements[a.id]='ruins-tile-11:C';b.actorOccupancy!.placements[a.id]='ruins-tile-11:C';}
    expect(()=>validateActorOccupancy(b)).not.toThrow();
    const extra={...b.heroes[0],id:'overflow'};b.heroes.push(extra);e.placements[extra.id]='ruins-tile-11:C';b.actorOccupancy!.placements[extra.id]='ruins-tile-11:C';b.actorOccupancy!.occupiedSpaces[extra.id]=1;
    expect(()=>validateActorOccupancy(b)).toThrow('capacity');
  });
  it('retains shared automatic Boss initiative without duplicate physical actors',()=>{
    const c=prophetFoundationCampaign();const b=advanceTurn(c.battle!);expect(b.monsters).toHaveLength(1);expect(b.round).toBe(1);
  });
  it('executes all three Boss turns through shared initiative and resumes into round two',()=>{
    let c=prophetFoundationCampaign();let guard=0;
    while(c.battle!.bossEncounter!.round===1){if(guard++>40)throw new Error('Scheduler stalled');
      c=finishProphetAttack(c);c={...c,battle:advanceTurn(c.battle!)};c=roundTripProphet(c);}
    expect(p(c).resolvedActionKeys.filter(k=>k.includes(':round:1:'))).toHaveLength(3);
    expect(c.battle!.boss!.currentRound).toBe(2);
    expect(c.battle!.initiativeOrder.filter(id=>id===c.battle!.monsters[0].id)).toHaveLength(3);
  });
  it('commits victory cleanup through campaign transactions once',()=>{
    let c=ordinal3(1);c=prophetCommand(c,{type:'MONSTER_DAMAGE',amounts:{[c.battle!.monsters[0].id]:999}});
    expect(c.battle!.status).toBe('victory');expect(p(c).returnedPewIds).toHaveLength(4);
    c=commitBossFoundationVictory(c);expect(c.bossRoomStorage!.lifecycle).toBe('RETURNED');expect(c.bossEncounterHistory!.at(-1)!.cleanupState.completed).toBe(true);
    expect(commitBossFoundationVictory(c)).toBe(c);expect(()=>validateBossSaveContracts(c)).not.toThrow();
  });
  it('uses zero prototype production imports',()=>{expect(auditProductionPrototypeReachability().productionPrototypeReachability).toBe(0);});
  it('dedupes the source-bound Dungeon entry Threat',()=>{
    const c=prophetFoundationCampaign(1,35,false);expect(c.heroes.map(h=>h.stress)).toEqual([2,2,2,2]);
    expect(applyProphetThreatEvent(c,{type:'DUNGEON_ENTRY',transactionId:`${c.dungeon!.questRunId}:dungeon-entry`})).toBe(c);
    expect(()=>applyProphetThreatEvent(c,{type:'DUNGEON_ENTRY',transactionId:'forged-second-entry'})).toThrow('causal transaction');
  });
  it('applies Level II scouting stress once per causal transaction',()=>{
    const c=prophetFoundationCampaign(2,35,false);const next=applyProphetThreatEvent(c,{type:'SCOUTING',transactionId:'shared-scout-1'});
    expect(next.heroes.map(h=>h.stress)).toEqual([1,1,1,1]);expect(applyProphetThreatEvent(roundTripProphet(next),{type:'SCOUTING',transactionId:'shared-scout-1'})).toEqual(next);
  });
  it('persists an actual Crowded tie with no random tie selection and rejects stale candidates',()=>{
    let c=prophetFoundationCampaign(1,35,true,{deadHero:1});
    c=prophetCommand(c,{type:'SKILL',actionOrdinal:1});c=prophetCommand(c,{type:'SKILL',actionOrdinal:2});
    const choice=c.battle!.bossEncounter!.pendingChoice!;
    expect(choice.candidateIds).toHaveLength(3);expect(p(c).crowdedChoice!.selectedAreaId).toBeNull();
    expect(roundTripProphet(c)).toEqual(c);
    for(const mutate of [(x:CampaignState)=>{x.battle!.bossEncounter!.pendingChoice!.candidateIds.push('foreign');},
      (x:CampaignState)=>{p(x).crowdedChoice!.round++;},(x:CampaignState)=>{p(x).crowdedChoice!.occupancySnapshot={};}]){
      const f=structuredClone(c);mutate(f);expect(validateSaveFile(createSaveSnapshot(f))).not.toBeNull();}
    expect(()=>prophetCommand(c,{type:'CHOICE',choiceId:choice.choiceId,selectedId:'foreign'})).toThrow();
    const before=c.battle!.bossEncounter!.rngState;
    c=prophetCommand(c,{type:'CHOICE',choiceId:choice.choiceId,selectedId:'ruins-tile-11:NE'});
    expect(c.battle!.bossEncounter!.rngState).toBe(before); // NE is outside printed Range 1: no attack draw either.
    expect(()=>prophetCommand(c,{type:'CHOICE',choiceId:choice.choiceId,selectedId:'ruins-tile-11:NE'})).toThrow();
  });
  it('executes two independent S Pews against both living Heroes, using physical ordinal despite reversed storage',()=>{
    const seed=placementSeed(rolls=>rolls.filter(r=>r===10).length>=2);
    let c=ordinal3(1,seed);p(c).pews.reverse();expect(roundTripProphet(c)).toEqual(c);
    c=prophetCommand(c,{type:'SKILL',actionOrdinal:3});c=finishProphetAttack(c);
    while(p(c).rubbleCursor<4){c=prophetCommand(c,{type:'PROPHET_NEXT_PEW'});c=finishProphetAttack(roundTripProphet(c));}
    const rubble=p(c).attacks.filter(a=>a.physicalOrdinal);expect(rubble.map(a=>a.physicalOrdinal)).toEqual([1,2,3,4]);
    const same=rubble.filter(a=>a.areaId==='ruins-tile-11:S');expect(same.length).toBeGreaterThanOrEqual(2);
    for(const tx of same){expect(tx.targetActorIds).toHaveLength(2);expect(tx.resolvedTargetIds).toEqual(tx.targetActorIds);}
    expect(new Set(same.map(a=>a.transactionId)).size).toBe(same.length);
  });
  it('consumes all four independent attack draws when every Pew Area is empty',()=>{
    let c=ordinal3(1,placementSeed(rolls=>rolls.every(r=>![4,5,10].includes(r))));const r=new SeededRandom(0);r.restore(c.battle!.bossEncounter!.rngState);
    c=prophetCommand(c,{type:'SKILL',actionOrdinal:3});while(p(c).rubbleCursor<4)c=prophetCommand(c,{type:'PROPHET_NEXT_PEW'});
    for(const tx of p(c).attacks.filter(a=>a.physicalOrdinal)){expect(tx.targetActorIds).toEqual([]);expect(tx.attackRoll).toBe(Math.floor(r.next()*10)+1);}
    expect(c.battle!.bossEncounter!.rngState).toBe(r.snapshot());expect(roundTripProphet(c)).toEqual(c);
  });
  it('cancels a pending Rubble window on victory and returns all four components on termination',()=>{
    let c=ordinal3(1,placementSeed(rolls=>rolls[0]===10));c=prophetCommand(c,{type:'SKILL',actionOrdinal:3});
    expect(c.battle!.pendingMonsterAttack).toBeTruthy();
    const terminated=returnProductionBossRoomOnTermination(roundTripProphet(c),'failed');
    expect(terminated.bossRoomReturnHistory![0].encounter.prophetProduction!.returnedPewIds).toHaveLength(4);
    expect(()=>validateBossSaveContracts(terminated)).not.toThrow();
    c=prophetCommand(c,{type:'MONSTER_DAMAGE',amounts:{[c.battle!.monsters[0].id]:999}});
    expect(c.battle!.pendingMonsterAttack).toBeNull();expect(p(c).pendingPewAttack).toBeNull();expect(p(c).returnedPewIds).toHaveLength(4);
    expect(()=>prophetCommand(c,{type:'PROPHET_NEXT_PEW'})).toThrow();expect(roundTripProphet(c)).toEqual(c);
  });
  it('cancels future actions when shared damage defeats the Prophet actor',()=>{
    let c=ordinal3(1,placementSeed(rolls=>rolls[0]===10));c=prophetCommand(c,{type:'SKILL',actionOrdinal:3});
    c.battle!.monsters[0]=applyBattleUnitDamage(c.battle!.monsters[0],999).unit;c={...c,battle:checkEnd(c.battle!)};
    expect(c.battle!.status).toBe('victory');expect(p(c).returnedPewIds).toHaveLength(4);expect(c.battle!.pendingMonsterAttack).toBeNull();
    expect(roundTripProphet(c)).toEqual(c);
  });
  it('reloads inside a real Death Door target window without repeating deathblow or committed damage',()=>{
    const seed=placementSeed(rolls=>rolls[0]===10);let c=prophetFoundationCampaign(3,seed,true,{deathDoorHero:2});
    c=prophetCommand(c,{type:'SKILL',actionOrdinal:1});c=prophetCommand(c,{type:'SKILL',actionOrdinal:2});c=finishProphetAttack(c);
    c=prophetCommand(c,{type:'SKILL',actionOrdinal:3});expect(p(c).pendingPewAttack!.targetActorIds).toHaveLength(2);
    c=prophetCommand(c,{type:'PROPHET_ATTACK_FREEZE'});c=prophetCommand(c,{type:'PROPHET_ATTACK_COMMIT'});
    const direct=finishProphetAttack(c),restored=finishProphetAttack(roundTripProphet(c));expect(restored).toEqual(direct);
    expect(direct.battle!.heroes[2].deathblowRollCount).toBeGreaterThan(0);
    expect(()=>prophetCommand(direct,{type:'PROPHET_ATTACK_COMMIT'})).toThrow();
  });
  it('applies Level III from actual source-bound Ruins spawn transactions, ignores forged caller tags and dedupes reload',()=>{
    let c=prophetFoundationCampaign(3,35,false,{ruinsV6:true});
    const stances=Object.fromEntries(c.heroes.map(h=>[h.instanceId,h.stance]));
    let draw=createRuinsDrawState(3,0,RUINS_V6);
    for(let seed=0;seed<1000;seed++){draw=drawOrdinaryRuinsEncounter(createRuinsDrawState(3,seed,RUINS_V6),'prophet-threat-spawn',stances);
      const tags=draw.encounters[0].monsters.map(m=>ruinsMonster(m.definitionId,RUINS_V6).tags.includes('Unholy'));
      if(tags.some(Boolean)&&tags.some(x=>!x))break;}
    c=beginOrdinaryRuinsBattle({...c,ruinsDrawState:draw},'prophet-threat-spawn');
    const unholy=c.battle!.monsters.filter(m=>ruinsMonster(m.sourceId,RUINS_V6).tags.includes('Unholy'));
    const other=c.battle!.monsters.find(m=>!ruinsMonster(m.sourceId,RUINS_V6).tags.includes('Unholy'))!;
    expect(other).toBeTruthy();expect(unholy.length).toBeGreaterThan(0);expect(c.heroes.map(h=>h.stress)).toEqual(Array(4).fill(unholy.length));
    expect(applyProphetThreatEvent(c,{type:'MONSTER_SPAWN',transactionId:`${c.battle!.battleId}:spawn:${other.id}`,actorId:other.id,tags:['Unholy']})).toBe(c);
    expect(()=>applyProphetThreatEvent(c,{type:'MONSTER_SPAWN',transactionId:'forged-second-spawn',actorId:unholy[0].id,tags:[]})).toThrow('causal transaction');
    const saved=roundTripProphet(c);expect(applyProphetThreatEvent(saved,{type:'MONSTER_SPAWN',
      transactionId:`${c.battle!.battleId}:spawn:${unholy[0].id}`,actorId:unholy[0].id,tags:[]})).toEqual(saved);
    const forged=structuredClone(c);forged.activeThreatRuntime!.consumedOnceKeys=[];expect(validateSaveFile(createSaveSnapshot(forged))).not.toBeNull();
  });
  it.each([1,2,3] as const)('uses printed Tavern modifier at Level %i',level=>{
    const c=prophetFoundationCampaign(level,35,false);for(const h of c.heroes)h.stress=10;
    expect(recoverStress(c,{heroId:c.heroes[0].instanceId,amount:5,sourceType:'exploration',sourceId:'tavern',questId:c.currentQuestId!}).campaign.heroes[0].stress).toBe(5+level);
  });
  const tamper:Array<[string,(c:CampaignState)=>void]>=[
    ['family',c=>{c.battle!.bossEncounter!.bossFamily='necromancer';}],['level',c=>{c.battle!.bossEncounter!.bossLevel=2;}],
    ['battle card',c=>{c.battle!.bossEncounter!.battleCardId++;}],['Threat card',c=>{c.battle!.bossEncounter!.threatAbilityCardId++;}],
    ['Room card',c=>{c.bossRoomStorage!.roomCardId++;}],['Tile',c=>{c.bossRoomStorage!.tileId='wrong';}],
    ['Hero Dodge',c=>{c.battle!.bossEncounter!.ruleDependencies!.heroDodgeRuleSetVersion=PROPHET_RULE_SET_VERSION;}],
    ['Area C ruling',c=>{c.battle!.actorOccupancy!.ruleSetVersion='wrong';}],['Prophet footprint',c=>{c.battle!.actorOccupancy!.occupiedSpaces[c.battle!.monsters[0].id]=1;}],
    ['Pew count',c=>{p(c).pews.pop();}],['Pew duplicate ID',c=>{p(c).pews[1].physicalCopyId=p(c).pews[0].physicalCopyId;}],
    ['Pew ordinal',c=>{p(c).pews[1].ordinal=1;}],['Pew Area',c=>{p(c).pews[0].areaId='foreign';}],
    ['roll',c=>{p(c).pews[0].placementRoll=p(c).pews[0].placementRoll===1?2:1;}],
    ['ordinal',c=>{p(c).actionOrdinal=3;}],['cursor',c=>{p(c).rubbleCursor=9 as never;}],
    ['RNG rollback',c=>{c.battle!.bossEncounter!.rngState--;}],['RNG skip',c=>{c.battle!.bossEncounter!.rngState++;}],
    ['Hero stance',c=>{c.battle!.heroes[0].stance='support';}],['entry Area',c=>{c.battle!.bossEncounter!.placements[c.battle!.heroes[0].id]='ruins-tile-11:S';}],
    ['missing stance map',c=>{delete c.battle!.bossEncounter!.definition.heroStartingStanceAreas;}],
    ['foreign stance Area',c=>{c.battle!.bossEncounter!.definition.heroStartingStanceAreas!.support='foreign';}],
    ['unknown Hero stance',c=>{c.battle!.heroes[0].stance='unknown' as never;}],
    ['duplicate action key',c=>{p(c).resolvedActionKeys.push(p(c).resolvedActionKeys[0]);}],
    ['duplicate causal event',c=>{c.battle!.bossEncounter!.events.push(c.battle!.bossEncounter!.events[0]);}],
    ['Boss ruleset',c=>{c.battle!.bossEncounter!.ruleSetVersion='wrong';}],
    ['Necromancer overflow',c=>{c.battle!.largeMovementContract={ruleSetVersion:'C1C32R2-THREAT-DEPENDENCIES-v3'} as never;}],
    ['extra Boss initiative',c=>{c.battle!.initiativeOrder.push(c.battle!.monsters[0].id);}],
    ['lost Boss initiative',c=>{c.battle!.initiativeOrder.splice(c.battle!.initiativeOrder.indexOf(c.battle!.monsters[0].id),1);}],
    ['uncommitted Hero HP',c=>{c.battle!.heroes[0].hp--;}],
    ['uncommitted Boss stats',c=>{c.battle!.monsters[0].bossCombatDodge=c.battle!.monsters[0].bossCombatDodge!+1;}],
  ];
  it.each(tamper)('rejects %s through the shared save importer',(_label,mutate)=>{
    let c=prophetFoundationCampaign();c=prophetCommand(c,{type:'SKILL',actionOrdinal:1});mutate(c);
    const save=createSaveSnapshot(c);expect(validateSaveFile(save)).not.toBeNull();expect(()=>restoreSaveSnapshot(save)).toThrow();
  });
  it('rejects stored attack target/roll forgery before resuming shared damage',()=>{
    let c=ordinal3(1,placementSeed(rolls=>rolls[0]===10));c=prophetCommand(c,{type:'SKILL',actionOrdinal:3});
    while(!p(c).pendingPewAttack&&p(c).rubbleCursor<4)c=prophetCommand(c,{type:'PROPHET_NEXT_PEW'});
    expect(p(c).pendingPewAttack).toBeTruthy();
    for(const mutate of [(f:CampaignState)=>{p(f).pendingPewAttack!.attackRoll=p(f).pendingPewAttack!.attackRoll===1?2:1;},
      (f:CampaignState)=>{p(f).pendingPewAttack!.targetActorIds.reverse();},
      (f:CampaignState)=>{p(f).pendingPewAttack!.physicalOrdinal=2;},
      (f:CampaignState)=>{p(f).pendingPewAttack!.currentTargetIndex++;},
      (f:CampaignState)=>{p(f).pendingPewAttack!.transactionId='forged';}]){
      const forged=structuredClone(c);mutate(forged);expect(()=>validateProphetProduction(forged.battle!)).toThrow();
      expect(validateSaveFile(createSaveSnapshot(forged))).not.toBeNull();
    }
  });
});
