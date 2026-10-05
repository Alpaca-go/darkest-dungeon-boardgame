import { createHash } from 'node:crypto';
import type { CampaignState } from '../../src/types';
import { createNewCampaign, selectParty, applyDefaultLoadout } from '../../src/game-engine/campaign';
import { seededRuntimeSources, withRuntimeSources } from '../../src/game-engine/runtime-sources';
import { explicitlyMigrateHeroDodgeToV2 } from '../../src/game-engine/rules/hero-dodge-versioning';
import { commitQuestSelection } from '../../src/game-engine/commands/quest';
import { enterProductionBossRoom, applyBossFoundationInput } from '../../src/game-engine/commands/boss-foundation';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../../src/game-engine/save';
import { advancePendingMonsterAttack, resolveTrinketOpportunity } from '../../src/game-engine/trinkets/battle-trinket-bridge';
import { acquireTrinket } from '../../src/game-engine/trinkets/acquire-trinket';
import { preparePrintedMonsterTurn } from '../../src/game-engine/component-monster-runtime';
import { commitBattleVictory } from '../../src/game-engine/commands/battle';

const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function start(): CampaignState {
  let c=applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),['crusader','highwayman','vestal','hellion']));
  c.gamePhase='quest-select';
  c.campaignProgress.activeBossFamilyId='necromancer';c.campaignProgress.activeThreatId='necromancer-threat-level-1';
  c.campaignProgress.pendingThreatInitialization=false;c.campaignProgress.completedStandardQuestsThisAct=2;c.campaignProgress.bossQuestRequired=true;
  return c;
}
function choose(c:CampaignState):CampaignState {
  for(let guard=0;c.battle?.bossEncounter?.pendingChoice && guard<30;guard++) {
    const p=c.battle.bossEncounter.pendingChoice;
    c=applyBossFoundationInput(c,{type:'CHOICE',choiceId:p.choiceId,selectedId:p.candidateIds.includes('centre')?'centre':p.candidateIds.slice().sort()[0]});
  }
  if(c.battle?.bossEncounter?.pendingChoice)throw new Error('Command proof unresolved choice');
  return c;
}
/** These are real-component command integration proofs, with explicit unit controls, NOT full-path acceptance. */
function combat():CampaignState {
  const selection=commitQuestSelection(explicitlyMigrateHeroDodgeToV2(start(),'C1C32-proof-migration'),'face-the-threat');
  if(!selection.ok)throw new Error('Normal selector failed: '+selection.error);
  let c=enterProductionBossRoom(selection.campaign,selection.campaign.bossRoomStorage!.roomId);
  for(const hero of c.battle!.heroes.slice(0,2)) {
    c={...c,battle:{...c.battle!,activeActorId:hero.id,currentActionPoints:2}};
    c=applyBossFoundationInput(c,{type:'MOVE_HERO_AREA',heroId:hero.id,areaId:'centre'});
  }
  const actor=c.battle!.bossEncounter!.bossState.actorId!;
  c={...c,battle:{...c.battle!,activeActorId:actor,initiativeOrder:[actor,...c.battle!.heroes.map(h=>h.id)],initiativeIndex:0}};
  return c;
}
function checkpoint(name:string,initial:CampaignState,preSave:CampaignState,finish:(c:CampaignState)=>CampaignState) {
  const save=createSaveSnapshot(preSave);
  const error=validateSaveFile(save);if(error)throw new Error(name+': '+error);
  const reload=restoreSaveSnapshot(JSON.parse(JSON.stringify(save)));
  if(hash(preSave)!==hash(reload))throw new Error(name+': reload differs');
  const final=finish(preSave),afterReload=finish(reload);
  if(hash(final)!==hash(afterReload))throw new Error(name+': continuation differs');
  const finalSave=createSaveSnapshot(final);
  if(validateSaveFile(finalSave) || hash(restoreSaveSnapshot(JSON.parse(JSON.stringify(finalSave))))!==hash(final))
    throw new Error(name+': final-state save differs');
  const e=final.battle?.bossEncounter ?? final.bossEncounterHistory?.at(-1) ?? final.bossEncounterCheckpoint;
  return {scenario:name,status:'PASS',classification:'REAL_COMPONENT_COMMAND_INTEGRATION_ISOLATION',productionAcceptance:false,
    syntheticCombatDefinitionDependencies:0,explicitUnitControls:name==='E'?[]:[
      'prepared pre-Boss campaign progression, actor and initiative; not a full normal-path claim',
      ...(name==='A'?['supplied Boss skillRoll=6 and attackRoll=2']:[]),
      ...(name==='B'?['granted a locked printed reaction Trinket to the actual selected target after preparing the attack']:[]),
      ...(name==='D'?['MONSTER_DAMAGE 77 fault injection to exercise the real victory transaction']:[]),
    ],
    initialStateHash:hash(initial),preSaveHash:hash(preSave),saveHash:hash(save),reloadedHash:hash(reload),finalStateHash:hash(final),
    eventSequenceHash:hash(e?.events ?? []),ruleSetVersion:e?.ruleSetVersion ?? final.heroDodgeRuleSetSelection?.ruleSetVersion,
    eventCount:e?.events.length ?? 0,postResolutionSaveHash:hash(finalSave)};
}
export function commandIntegrationProofs() {
  return withRuntimeSources(seededRuntimeSources(32032),()=>{
    const initial=combat();
    let a=choose(applyBossFoundationInput(initial,{type:'SKILL',skillRoll:6,attackRoll:2}));
    a=choose(advancePendingMonsterAttack(a));
    if(!a.battle!.monsters.some(m=>m.sourceId==='bone-rabble'&&m.maxHp===6))throw new Error('Real Bone summon absent');
    const A=checkpoint('A',initial,a,c=>c);
    let b=structuredClone(a);
    const bone=b.battle!.monsters.find(m=>m.sourceId==='bone-rabble')!;
    b={...b,battle:{...b.battle!,activeActorId:bone.id,initiativeOrder:[bone.id,...b.battle!.heroes.map(h=>h.id)],initiativeIndex:0}};
    const Binitial=structuredClone(b);
    b=choose({...b,battle:preparePrintedMonsterTurn(b.battle!,bone.id)});
    if (!b.battle?.pendingMonsterAttack) throw new Error('B: actual Bone incoming attack not reached');
    const target=b.battle.heroes.find(h=>h.id===b.battle!.pendingMonsterAttack!.targetHeroUnitId)!;
    b=acquireTrinket(b,{trinketId:'community-trinket-core-camouflage-cloak',source:'loot',sourceEventId:'C1C32-proof-loot',heroId:target.sourceId}).campaign;
    b=advancePendingMonsterAttack(b);
    if (!b.pendingTrinketUseOpportunities.some(o=>o.status==='open')) throw new Error('B: actual incoming reaction not reached');
    const B=checkpoint('B',Binitial,b,c=>{
      const opp=c.pendingTrinketUseOpportunities.find(o=>o.status==='open');
      return choose(opp?resolveTrinketOpportunity(c,opp.id,'decline').campaign:advancePendingMonsterAttack(c));
    });
    let d=applyBossFoundationInput(a,{type:'MONSTER_DAMAGE',amounts:{[a.battle!.bossEncounter!.bossState.actorId!]:77}});
    const D=checkpoint('D',a,d,c=>{
      const result=commitBattleVictory(c);if(!result.ok)throw new Error('Campaign victory transaction failed');
      if(commitBattleVictory(result.campaign).campaign!==result.campaign)throw new Error('Campaign cleanup is not idempotent');
      return result.campaign;
    });
    const legacy=start();const migrated=explicitlyMigrateHeroDodgeToV2(legacy,'C1C32-proof-E');
    const selected=commitQuestSelection(migrated,'face-the-threat');if(!selected.ok)throw new Error('Explicit migration selector failed');
    const E=checkpoint('E',legacy,selected.campaign,c=>c);
    return [A,B,{scenario:'C',status:'NOT_PROVEN',classification:'PRODUCTION_THREAT_DOMAIN_BRIDGE_REQUIRED',productionAcceptance:false,
      syntheticCombatDefinitionDependencies:0,initialStateHash:null,preSaveHash:null,saveHash:null,reloadedHash:null,finalStateHash:null,eventSequenceHash:null,
      ruleSetVersion:'C1C31-DIGITAL-DEFAULT-v2',reason:'Reanimation belongs to THREAT, never ABILITY. The ordinary source-bound Threat Battle command has not been completed.'},D,E];
  });
}
