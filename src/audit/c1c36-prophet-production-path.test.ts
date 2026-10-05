import { describe, expect, it } from 'vitest';
import { createNewCampaign, selectParty, applyDefaultLoadout } from '../game-engine/campaign';
import { explicitlyMigrateHeroDodgeToV2 } from '../game-engine/rules/hero-dodge-versioning';
import { selectProductionRuinsV6 } from '../game-engine/commands/necromancer-production-entry';
import { getBossQuestPool, getQuestPool, runtimeContentContext } from '../data/content-selector';
import { PRODUCTION_FACE_THE_THREAT_QUEST } from '../data/quests/production-face-the-threat';
import { PRODUCTION_NECROMANCER_QUEST } from '../data/quests/production-necromancer-quest';
import { prophetProductionDependencyGate } from '../game-engine/prophet/production-dependency-gate';
import { productionBossQuestEntryError } from '../game-engine/bosses/production-dependency-gate';
import { commitQuestSelection, commitLeaveDungeon, commitReturnToHamlet } from '../game-engine/commands/quest';
import { scoutDungeon } from '../game-engine/dungeon';
import { createSaveSnapshot, validateSaveFile, restoreSaveSnapshot } from '../game-engine/save';
import { seededRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';
import { HERO_DODGE_V2 } from '../game-engine/rules/hero-dodge';
import { PROPHET_RULE_SET_VERSION } from '../game-engine/prophet/production-definition';
import type { CampaignState } from '../types';
import { resumeBossFoundation, applyBossFoundationInput, commitBossFoundationVictory } from '../game-engine/commands/boss-foundation';
import { advanceTurn, legalTargetsForActor } from '../game-engine/battle';
import { beginHeroSkillAction, advancePendingMonsterAttack } from '../game-engine/trinkets/battle-trinket-bridge';
import { migrateSaveFile } from '../game-engine/save';
import { enterProductionOrdinaryThreat } from '../game-engine/ruins/production-threat-runtime';
import { ruinsMonster } from '../game-engine/ruins/source-registry';
import { applyProphetThreatEvent } from '../game-engine/prophet/production-threat';

function prerequisite(level:1|2|3=1): CampaignState {
  let c=applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),['crusader','leper','highwayman','vestal']));
  c.gamePhase='quest-select';
  c=explicitlyMigrateHeroDodgeToV2(c,'c1c36-dodge');
  c=selectProductionRuinsV6(c);
  c.act=level;c.campaignLevel=level;
  Object.assign(c.campaignProgress,{act:level,campaignLevel:level,activeBossFamilyId:'prophet',
    defeatedBossFamilyIds:level===3?['necromancer','hag']:level===2?['necromancer']:[]});
  return c;
}
const trip=(c:CampaignState)=>{const s=createSaveSnapshot(c);expect(validateSaveFile(s)).toBeNull();expect(restoreSaveSnapshot(s)).toEqual(c);return c;};
function entered():CampaignState{
  let c=prerequisite();
  for(let i=0;i<2;i++){
    c.gamePhase='quest-select';c=commitQuestSelection(c,getQuestPool(runtimeContentContext(c))[0].id).campaign;
    const questId=c.currentQuestId!;c=commitLeaveDungeon(c).campaign;
    c=commitReturnToHamlet(c,{questId,questRunId:c.dungeon!.questRunId,questOutcome:c.lastQuestResult!.outcome}).campaign;
  }
  c.gamePhase='quest-select';const selected=commitQuestSelection(c,'face-the-threat');expect(selected.ok,selected.error??'').toBe(true);c=selected.campaign;
  c=resumeBossFoundation(c,c.bossRoomStorage!.roomId);
  for(let n=0;n<50;n++){
    const b=c.battle!,e=b.bossEncounter!;
    if(b.heroes.some(h=>h.id===b.activeActorId))return c;
    if(e.pendingChoice)c=applyBossFoundationInput(c,{type:'CHOICE',choiceId:e.pendingChoice.choiceId,selectedId:e.pendingChoice.candidateIds[0]});
    else if(b.pendingMonsterAttack)c=advancePendingMonsterAttack(c,false,true);
    else if(e.phase==='BATTLE_RESOLVING'&&e.prophetProduction!.actionOrdinal===3&&e.prophetProduction!.rubbleCursor<4)c=applyBossFoundationInput(c,{type:'PROPHET_NEXT_PEW'});
    else c={...c,battle:advanceTurn(b)};
  }
  throw new Error('No player turn');
}
describe('C1C36 production player entry and cross-Quest Threat ownership',()=>{
  it('returns a settled player Boss to Hamlet without advancing a second Act or repeating XP',()=>withRuntimeSources(seededRuntimeSources(3616),()=>{
    let c=entered();const boss=c.battle!.monsters[0],questRunId=c.dungeon!.questRunId;
    // Node transaction test only; browser acceptance defeats the Boss through visible Hero skills.
    c=applyBossFoundationInput(c,{type:'MONSTER_DAMAGE',amounts:{[boss.id]:boss.maxHp}});
    c=trip(commitBossFoundationVictory(c));expect(c.campaignProgress.act).toBe(2);
    const progress=structuredClone(c.campaignProgress);
    c=commitLeaveDungeon(c).campaign;expect(c.lastQuestResult!.outcome).toBe('completed');
    const input={questId:'face-the-threat',questRunId,questOutcome:c.lastQuestResult!.outcome};
    c=trip(commitReturnToHamlet(c,input).campaign);expect(c.campaignProgress).toEqual(progress);
    expect(commitReturnToHamlet(c,input).campaign).toEqual(c);
  }));
  it('preserves the pending next-Act Threat draw when the previous Threat was defeated',()=>{
    const c=prerequisite();Object.assign(c.campaignProgress,{activeThreatId:'prophet-threat-level-1',
      defeatedThreatIds:['prophet-threat-level-1'],pendingThreatInitialization:true});
    expect(migrateSaveFile(createSaveSnapshot(c))?.campaign.campaignProgress.pendingThreatInitialization).toBe(true);
  });
  it('preserves a current Death’s Door Hero instead of applying legacy one-HP migration',()=>{
    const c=prerequisite();c.heroes[0].wounds=c.heroes[0].maxLife;c.heroes[0].atDeathsDoor=true;
    const migrated=migrateSaveFile(createSaveSnapshot(c));
    expect(migrated?.campaign.heroes[0].wounds).toBe(c.heroes[0].maxLife);
    expect(migrated?.campaign.heroes[0].atDeathsDoor).toBe(true);
  });
  it('creates complete production metadata before sealing the replay origin',()=>withRuntimeSources(seededRuntimeSources(3610),()=>{
    const c=entered(),s=createSaveSnapshot(c),m=migrateSaveFile(s);
    expect(m?.campaign).toEqual(c);expect(validateSaveFile(m)).toBeNull();
  }));
  it('records a normal staged Hero attack and rejects a forged prepared roll',()=>withRuntimeSources(seededRuntimeSources(3611),()=>{
    let c=entered();
    const actor=c.battle!.heroes.find(h=>h.id===c.battle!.activeActorId)!;
    const id=actor.equippedSkillIds!.find(id=>legalTargetsForActor(c.battle!,id).some(target=>c.battle!.monsters.some(m=>m.id===target)))!;
    expect(id).toBeTruthy();
    const action=beginHeroSkillAction(c,id,c.battle!.monsters[0].id);expect(action.error).toBeNull();c=trip(action.campaign);
    expect(c.battle!.bossEncounter!.prophetProduction!.commands.some(x=>x.type==='PROPHET_HERO_ATTACK_ROLL')).toBe(true);
    const tamper=structuredClone(c);tamper.battle!.bossEncounter!.rngState^=1;
    expect(validateSaveFile(createSaveSnapshot(tamper))).not.toBeNull();
  }));
  it('shares one locked printed Quest object across families',()=>{
    expect(PRODUCTION_FACE_THE_THREAT_QUEST).toBe(PRODUCTION_NECROMANCER_QUEST);
    expect(PRODUCTION_FACE_THE_THREAT_QUEST).toMatchObject({roomCount:8,firewoodSetup:{tokens:1,restingPoints:12}});
  });
  it.each([1,2,3] as const)('separates Boss and Hero dependency identities at Level %i',level=>{
    const c=prerequisite(level),context=runtimeContentContext(c);
    expect(context.bossRuleSetVersion).toBe(PROPHET_RULE_SET_VERSION);expect(context.heroDodgeRuleSetVersion).toBe(HERO_DODGE_V2);
    expect(getBossQuestPool(context).filter(q=>q.id==='face-the-threat')).toEqual([PRODUCTION_FACE_THE_THREAT_QUEST]);
    expect(prophetProductionDependencyGate(c,level).status).toBe('ENTRY_ALLOWED');
  });
  it('preserves Necromancer selection and closes unknown families',()=>{
    const c=prerequisite();c.campaignProgress.activeBossFamilyId='necromancer';
    expect(getBossQuestPool(runtimeContentContext(c))).toContain(PRODUCTION_NECROMANCER_QUEST);
    c.campaignProgress.activeBossFamilyId='unknown';expect(getBossQuestPool(runtimeContentContext(c))).not.toContain(PRODUCTION_NECROMANCER_QUEST);
    expect(productionBossQuestEntryError(c,'face-the-threat')).toBe('production-boss-family-unaccepted');
  });
  it.each(['hero-dodge','ruins','room'] as const)('rejects missing %s dependency',field=>{
    const c=prerequisite();
    if(field==='hero-dodge')delete c.heroDodgeRuleSetSelection;
    if(field==='ruins')delete c.ruinsRuleSetSelection;
    if(field==='room')c.bossRoomStorage={roomId:'foreign',roomCardId:44710,tileId:'ruins-tile-11',encounterId:'foreign',lifecycle:'RESERVED'};
    expect(prophetProductionDependencyGate(c,1).enabled).toBe(false);
  });
  it('archives and rebinds two Level I Standard Quests, then reserves source Room 11 with the same Threat',()=>withRuntimeSources(seededRuntimeSources(3601),()=>{
    let c=prerequisite();let threat:CampaignState['activeThreatRuntime']=null;
    for(let i=0;i<2;i++){
      c.gamePhase='quest-select';const q=getQuestPool(runtimeContentContext(c))[0];
      const before=c.heroes.map(h=>h.stress);const selected=commitQuestSelection(c,q.id);expect(selected.ok).toBe(true);c=trip(selected.campaign);
      if(!threat)threat=structuredClone(c.activeThreatRuntime);else expect(c.activeThreatRuntime?.drawTransactionId).toBe(threat.drawTransactionId);
      expect(c.heroes.map(h=>h.stress)).toEqual(before.map(n=>n+2));
      c=commitLeaveDungeon(c).campaign;
      c=trip(commitReturnToHamlet(c,{questId:q.id,questRunId:c.dungeon!.questRunId,questOutcome:c.lastQuestResult!.outcome}).campaign);
      expect(c.prophetQuestThreatHistory).toHaveLength(i+1);expect(c.necromancerQuestThreatHistory).toBeUndefined();
      expect(c.activeThreatRuntime?.active).toBe(true);expect(c.bossEncounterCheckpoint).toBeNull();
    }
    c.gamePhase='quest-select';const selected=commitQuestSelection(c,'face-the-threat');expect(selected.ok).toBe(true);c=trip(selected.campaign);
    expect(c.bossRoomStorage).toMatchObject({roomCardId:44710,tileId:'ruins-tile-11',lifecycle:'RESERVED'});
    expect(c.activeThreatRuntime?.consumedOnceKeys).toHaveLength(3);
    expect(c.bossEncounterCheckpoint?.checkpointContext?.consumedOnceKeys).toHaveLength(1);
    const forged=structuredClone(c);forged.prophetQuestThreatHistory![0].checkpoint.checkpointContext!.consumedOnceKeys=[];
    expect(validateSaveFile(createSaveSnapshot(forged))).not.toBeNull();
  }));
  it('real Scout applies base Stress plus Level II Threat once and reload preserves the receipt',()=>withRuntimeSources(seededRuntimeSources(3602),()=>{
    let c=prerequisite(2);c=commitQuestSelection(c,getQuestPool(runtimeContentContext(c))[0].id).campaign;
    const before=c.heroes.map(h=>h.stress);c=trip(scoutDungeon(c));
    expect(c.heroes.map(h=>h.stress)).toEqual(before.map(n=>n+2));expect(c.activeThreatRuntime?.consumedOnceKeys).toHaveLength(1);
    expect(scoutDungeon(c)).toBe(c);
  }));
  it('binds Level III receipts to real drawn physical Monsters and ignores caller tags',()=>withRuntimeSources(seededRuntimeSources(3603),()=>{
    let c=prerequisite(3);c=commitQuestSelection(c,getQuestPool(runtimeContentContext(c))[0].id).campaign;
    const room=c.dungeon!.rooms.find(r=>r.sourceRoomToken==='lair')!;
    // Node integration Room-entry seam; the browser proof separately travels the generated route.
    c.dungeon!.currentRoomId=room.id;c=trip(enterProductionOrdinaryThreat(c,room.id));
    const drawn=c.ruinsDrawState!.encounters.find(e=>e.encounterId===c.battle!.ruinsContext!.encounterId)!;
    for(const physical of drawn.monsters){
      const actorId=`ruins:${drawn.encounterId}:${physical.copyId}`,transactionId=`${c.battle!.battleId}:spawn:${actorId}`;
      const unholy=ruinsMonster(physical.definitionId,'C1C32R2C-R-DIGITAL-DEFAULT-v6').tags.includes('Unholy');
      const once=`${c.bossEncounterCheckpoint!.checkpointContext!.encounterId}:prophet-threat:${transactionId}`;
      expect(c.activeThreatRuntime!.consumedOnceKeys.includes(once)).toBe(unholy);
      expect(applyProphetThreatEvent(c,{type:'MONSTER_SPAWN',transactionId,actorId,tags:unholy?[]:['Unholy']})).toBe(c);
    }
    expect(()=>applyProphetThreatEvent(c,{type:'MONSTER_SPAWN',transactionId:'forged',actorId:c.battle!.monsters[0].id,tags:['Unholy']})).toThrow();
  }));
});
