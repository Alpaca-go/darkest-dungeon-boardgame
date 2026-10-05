import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../game-engine/campaign';
import { commitQuestSelection } from '../game-engine/commands/quest';
import { enterProductionBossRoom, applyBossFoundationInput } from '../game-engine/commands/boss-foundation';
import { explicitlyMigrateHeroDodgeToV2 } from '../game-engine/rules/hero-dodge-versioning';
import { HERO_DODGE_V2 } from '../game-engine/rules/hero-dodge';
import { productionBoneDefinitions, resolveProductionMonsterDefinition, validateBoneCombatDependency, inspectProductionBoneCombatDependency } from '../game-engine/bosses/component-adapters/bone-combat-adapter';
import { seededRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { preparePrintedMonsterTurn } from '../game-engine/component-monster-runtime';
import { advancePendingMonsterAttack, resolveTrinketOpportunity } from '../game-engine/trinkets/battle-trinket-bridge';
import { acquireTrinket } from '../game-engine/trinkets/acquire-trinket';
import { applyEffectsWithResistance, resolveShuffleCount } from '../game-engine/status-effects';
import { enterDungeonRoom } from '../game-engine/commands/dungeon';

function selected(level: 1|2|3 = 1, firstHero='crusader', heroLevel: 1|2|3=1): CampaignState {
  return withRuntimeSources(seededRuntimeSources(32), () => {
    let c = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), [firstHero,...['crusader','highwayman','vestal','hellion','leper'].filter(h=>h!==firstHero).slice(0,3)]));
    c.heroes[0].level=heroLevel;
    c.gamePhase = 'quest-select';
    c.campaignProgress.activeBossFamilyId='necromancer'; c.campaignProgress.activeThreatId=`necromancer-threat-level-${level}`;
    c.campaignProgress.campaignLevel=level; c.campaignProgress.act=level;
    c.campaignProgress.pendingThreatInitialization=false; c.campaignProgress.completedStandardQuestsThisAct=2; c.campaignProgress.bossQuestRequired=true;
    c = explicitlyMigrateHeroDodgeToV2(c,'C1C32-explicit-migration');
    const result = commitQuestSelection(c,'face-the-threat');
    if (!result.ok) throw new Error(`Production selector rejected ${result.error}`);
    return result.campaign;
  });
}
function entered(level: 1|2|3=1): CampaignState {
  const c = selected(level);
  let entered = enterProductionBossRoom(c,c.bossRoomStorage!.roomId);
  // Unit isolation prepares legal Hero movement through the production command; no combat definition fixtures.
  for(const hero of entered.battle!.heroes.slice(0,2)) {
    entered={...entered,battle:{...entered.battle!,activeActorId:hero.id,currentActionPoints:2}};
    entered=applyBossFoundationInput(entered,{type:'MOVE_HERO_AREA',heroId:hero.id,areaId:'centre'});
  }
  return entered;
}
function chooseAll(c: CampaignState): CampaignState {
  for(let n=0;c.battle?.bossEncounter?.pendingChoice && n<20;n++) {
    const p = c.battle.bossEncounter.pendingChoice;
    c=applyBossFoundationInput(c,{type:'CHOICE',choiceId:p.choiceId,selectedId:p.candidateIds.includes('centre') ? 'centre' : p.candidateIds.slice().sort()[0]});
  }
  return c;
}
function attack(c: CampaignState, skillRoll=1, attackRoll=1): CampaignState {
  const actorId=c.battle!.bossEncounter!.bossState.actorId!;
  c={...c,battle:{...c.battle!,activeActorId:actorId,initiativeOrder:[actorId,...c.battle!.heroes.map(h=>h.id)],initiativeIndex:0}};
  return chooseAll(applyBossFoundationInput(c,{type:'SKILL',skillRoll,attackRoll}));
}
function roundtrip(c: CampaignState): CampaignState {
  const snapshot = createSaveSnapshot(c);
  expect(validateSaveFile(snapshot)).toBeNull();
  const restored=restoreSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));
  expect(restored).toEqual(c);
  return restored;
}

describe('C1C32 source-bound production command and generic Monster integration',()=>{
  it('fails closed before an unbound ordinary Threat Battle can use prototype definitions',()=>{
    const c=selected();
    const room=c.dungeon!.rooms.find(r=>['lair','treasure','curio'].includes(r.sourceRoomToken ?? ''))!;
    const from=c.dungeon!.rooms.find(r=>r.adjacentRoomIds.includes(room.id))!;
    c.dungeon!.currentRoomId=from.id;
    const result=enterDungeonRoom(c,room.id);
    expect(result.error).toBe('necromancer-threat-domain-bridge-unbound');
    expect(result.campaign).toBe(c);expect(result.campaign.battle).toBeNull();
  });
  it('promotes four v2 definitions and retains v1 entry behavior',()=>{
    const defs=productionBoneDefinitions(HERO_DODGE_V2);
    expect(defs.map(d=>d.life)).toEqual([6,7,15,33]);
    expect(defs).toHaveLength(4);
    for(const d of defs) expect(validateBoneCombatDependency(inspectProductionBoneCombatDependency(d.definitionId)!)).toEqual([]);
    expect(resolveProductionMonsterDefinition('missing',HERO_DODGE_V2)).toBeUndefined();
    expect(productionBoneDefinitions()).toEqual([]);
    expect(defs[3].immunities).toContain('stun'); expect(defs[3].skills[1].targetStunTurns).toBe(2);
  });
  it('normal selector reserves one Room/checkpoint and restores without setup/RNG duplication',()=>{
    const c=roundtrip(selected());
    expect(c.bossEncounterCheckpoint!.ruleSetVersion).toBe(HERO_DODGE_V2);
    const version=c.bossEncounterCheckpoint!.rngState;
    expect(()=>explicitlyMigrateHeroDodgeToV2({...c,heroDodgeRuleSetSelection:undefined},'forbidden')).toThrow();
    const entered=enterProductionBossRoom(c,c.bossRoomStorage!.roomId);
    expect(entered.battle!.stagedIncomingAttacks).toBe(true);
    expect(entered.bossEncounterCheckpoint).toBeNull();
    expect(entered.bossRoomStorage!.lifecycle).toBe('IN_PLAY');
    expect(entered.battle!.bossEncounter!.events.filter(e=>e.eventType==='ENCOUNTER_SETUP')).toHaveLength(1);
    expect(entered.battle!.heroes.find(h=>h.heroDodgeBinding?.heroId==='vestal')!.heroDodgeBinding).toMatchObject({value:1,authority:'PROJECT_RULING'});
    expect(version).toBe(c.bossEncounterCheckpoint!.rngState);
    roundtrip(entered);
  });
  it('rejects a tampered saved Threat Hero Dodge binding before Room entry',()=>{
    const c=selected();
    const id=Object.keys(c.bossEncounterCheckpoint!.checkpointContext!.heroDodgeBindings!)[0];
    c.bossEncounterCheckpoint!.checkpointContext!.heroDodgeBindings![id].value=9;
    expect(()=>enterProductionBossRoom(c,c.bossRoomStorage!.roomId)).toThrow();
  });
  it('stages one shared Boss roll, resumes Hero 2 reaction without recommitting Hero 1, then summons a real Bone',()=>{
    let c=entered();
    const hero2=c.battle!.heroes[1];
    c=withRuntimeSources(seededRuntimeSources(321),()=>acquireTrinket(c,{trinketId:'community-trinket-core-camouflage-cloak',source:'loot',sourceEventId:'C1C32-loot',heroId:hero2.sourceId}).campaign);
    c=attack(c,6,1);
    expect(c.battle!.pendingMonsterAttack).toBeTruthy();
    c=advancePendingMonsterAttack(c);
    const pending=c.battle!.pendingMonsterAttack!;
    expect(pending.targetHeroUnitId).toBe(hero2.id);
    expect(pending.sourceAttack!.alreadyResolvedHeroes).toHaveLength(1);
    expect(pending.attackRoll).toBe(1);
    const firstHero=structuredClone(c.battle!.heroes[0]);
    const reloaded=roundtrip(c);
    const opp=c.pendingTrinketUseOpportunities.find(o=>o.status==='open')!;
    const a=chooseAll(resolveTrinketOpportunity(c,opp.id,'use').campaign);
    const b=chooseAll(resolveTrinketOpportunity(reloaded,opp.id,'use').campaign);
    expect(a).toEqual(b); expect(a.battle!.heroes[0]).toEqual(firstHero);
    expect(a.battle!.monsters.some(m=>m.sourceId==='bone-rabble' && m.maxHp===6)).toBe(true);
    expect(a.battle!.bossEncounter!.events.filter(e=>e.eventType==='TARGET_EFFECT')).toHaveLength(2);
  });
  it('executes a spawned Bone through generic seeded skill selection and reaction continuation',()=>{
    let c=chooseAll(advancePendingMonsterAttack(attack(entered(3),6,2)));
    const bone=c.battle!.monsters.find(m=>m.sourceId==='bone-spearman')!;
    expect(bone).toBeTruthy();
    c={...c,battle:{...c.battle!,activeActorId:bone.id,initiativeOrder:[bone.id,...c.battle!.heroes.map(h=>h.id)],initiativeIndex:0,pendingMonsterAttack:null}};
    const prepared=preparePrintedMonsterTurn(c.battle!,bone.id);
    expect(preparePrintedMonsterTurn(structuredClone(c.battle!),bone.id)).toEqual(prepared);
    c=chooseAll({...c,battle:prepared});
    expect(c.battle!.bossEncounter!.events.some(e=>e.eventType==='MONSTER_SKILL_SELECTED')).toBe(true);
    const restored=roundtrip(c);
    expect(advancePendingMonsterAttack(c)).toEqual(advancePendingMonsterAttack(restored));
  });
  it('binds Captain and Boss categorical immunity/resistance through generic resolver',()=>{
    const c=entered(2), boss=c.battle!.monsters[0];
    expect(applyEffectsWithResistance(boss,[{type:'stun',amount:1,durationTurns:2}]).blocked).not.toEqual([]);
    const captain=resolveProductionMonsterDefinition('bone-captain',HERO_DODGE_V2)!;
    const target={...boss,immunities:captain.immunities,categoricalResistances:['debuff','shuffle'] as const};
    const d=applyEffectsWithResistance({...target,categoricalResistances:[...target.categoricalResistances]},[{type:'debuff',amount:1,durationTurns:2}]);
    expect(d.unit.debuffs[0].durationTurns).toBe(1);
    expect(resolveShuffleCount({...target,categoricalResistances:[...target.categoricalResistances]},2)).toBe(1);
  });
});

describe('C1C32 production pinning and negative import boundaries',()=>{
  it('consumes the frozen resolver for all 24 actual production Hero bindings',()=>{
    for(const heroId of ['crusader','vestal','highwayman','hellion','leper','occultist','plague-doctor','grave-robber']) {
      for(const level of [1,2,3] as const) {
        const c=selected(1,heroId,level);
        const bound=enterProductionBossRoom(c,c.bossRoomStorage!.roomId);
        const hero=bound.battle!.heroes[0];
        expect(hero.heroDodgeBinding).toMatchObject({heroId,level,value:heroId==='crusader'?0:1,ruleSetVersion:HERO_DODGE_V2});
        expect(hero.bossCombatDodge).toBe(hero.heroDodgeBinding!.value);
      }
    }
  });
  it('rejects tampered executable Skills and Room ownership before load',()=>{
    const c=attack(entered(),6,2);
    const save=createSaveSnapshot(c);
    expect(validateSaveFile(save)).toBeNull();
    save.campaign.battle!.pendingMonsterAttack!.sourceAttack!.skill.accuracy+=1;
    expect(validateSaveFile(save)).toContain('locked executable definition');
    const room=createSaveSnapshot(selected());room.campaign.bossRoomStorage!.roomCardId=0;
    expect(validateSaveFile(room)).toContain('Room card mismatch');
  });
});
