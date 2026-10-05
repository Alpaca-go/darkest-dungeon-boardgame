import {describe,it,expect} from 'vitest';
import {prophetContractFixture,runSharedDispatchProbes,sharedSaveProbe,threatShell} from '../../scripts/audit/c1c35r2a-dispatch-probes';
import {resolveBossDefinition,encounterRuleDependencies} from '../game-engine/bosses/definitions';
import {PROPHET_RULE_SET_VERSION,PROPHET_ACTOR_CAPACITY_VERSION} from '../game-engine/prophet/production-definition';
import {assertHeroDodgeRuleSetVersion} from '../game-engine/rules/hero-dodge';
import {validateProductionBossRoomStorage,returnProductionBossRoomOnTermination} from '../game-engine/bosses/room-storage';
import {validateThreatCheckpoint} from '../game-engine/bosses/threat-checkpoint';
import {validateBossSaveContracts,validateBossBattleContracts} from '../game-engine/bosses/save-dispatch';
import {createSaveSnapshot,validateSaveFile,restoreSaveSnapshot} from '../game-engine/save';
import {bindBossEncounter,applyBossRuntimeInput} from '../game-engine/bosses/foundation';
import {validateActorOccupancy} from '../game-engine/rules/actor-occupancy';
import {verifyNecromancerCompatibility} from '../../scripts/audit/c1c35r2a-necromancer-compatibility';
import {auditProductionPrototypeReachability} from '../../scripts/audit/c1c35r2a-prototype-reachability';
import type {CampaignState} from '../types';
import {readFileSync} from 'node:fs';

describe('C1C35R2A shared production dispatch',()=>{
  it('passes all five real dependency probes without gameplay promotion',()=>{
    expect(runSharedDispatchProbes().map(r=>r.status)).toEqual(Array(5).fill('PASS'));
  });
  it.each([1,2,3] as const)('round trips Level %i infrastructure checkpoints through the shared save schema',level=>{
    expect(sharedSaveProbe(level).status).toBe('PASS');
  });
  it('preserves every captured Necromancer definition/save/replay/campaign/ownership/RNG result',()=>{
    expect(()=>verifyNecromancerCompatibility()).not.toThrow();
  },120000);
  it('rejects Prophet ruleset passed directly to Hero Dodge',()=>{
    expect(()=>assertHeroDodgeRuleSetVersion(PROPHET_RULE_SET_VERSION)).toThrow('Unsupported Hero Dodge');
  });
  it.each(['unknown','__proto__','constructor'])('rejects unknown family %s',family=>{
    expect(()=>resolveBossDefinition(family,1,PROPHET_RULE_SET_VERSION)).toThrow('Unsupported Boss family');
  });
  it('rejects cross-family Room ownership in both directions',()=>{
    const p=prophetContractFixture();p.bossRoomStorage!.tileId='tile-10';p.bossRoomStorage!.roomCardId=44709;
    expect(()=>validateProductionBossRoomStorage(p)).toThrow();
    const states=JSON.parse(readFileSync('docs/data/complete-edition/c1c33-browser-level1-replay-states.json','utf8')) as Array<{point:string;campaign:CampaignState}>;
    const n=structuredClone(states.find(s=>s.point==='after-face-the-threat-selection')!.campaign);
    n.bossRoomStorage!.tileId='ruins-tile-11';n.bossRoomStorage!.roomCardId=44710;
    expect(()=>validateProductionBossRoomStorage(n)).toThrow();
  });
  const forgeries: Array<[string,(c:CampaignState)=>void]>=[
    ['family substitution',c=>{c.bossEncounterCheckpoint!.bossFamily='necromancer';}],
    ['physical card substitution',c=>{c.bossEncounterCheckpoint!.definition.battleCardId=46601;}],
    ['dependency absence',c=>{delete c.bossEncounterCheckpoint!.ruleDependencies;}],
    ['Hero Dodge version',c=>{c.bossEncounterCheckpoint!.ruleDependencies!.heroDodgeRuleSetVersion=PROPHET_RULE_SET_VERSION;}],
    ['overflow inheritance',c=>{c.bossEncounterCheckpoint!.ruleDependencies!.actorOccupancyRuleSetVersion='C1C32R2-LARGE-SINGLE-DISPLACEMENT-OVERFLOW-v1';}],
    ['boss level',c=>{c.bossEncounterCheckpoint!.bossLevel=2;}],
    ['campaign identity',c=>{c.id='forged';}],
    ['quest identity',c=>{c.dungeon!.questRunId='forged';}],
    ['Threat identity',c=>{c.campaignProgress.activeThreatId='forged';}],
    ['encounter identity',c=>{c.bossEncounterCheckpoint!.checkpointContext!.encounterId='forged';}],
    ['battle identity',c=>{c.bossEncounterCheckpoint!.checkpointContext!.battleId='forged';}],
    ['definition version',c=>{c.bossEncounterCheckpoint!.checkpointContext!.definitionVersion='forged';}],
    ['event sequence',c=>{c.bossEncounterCheckpoint!.eventSequence++;}],
    ['Hero binding',c=>{Object.values(c.bossEncounterCheckpoint!.checkpointContext!.heroDodgeBindings!)[0].value++;}],
    ['Hero binding absence',c=>{delete c.bossEncounterCheckpoint!.checkpointContext!.heroDodgeBindings;}],
    ['physical event identity',c=>{const e=c.bossEncounterCheckpoint!;e.eventSequence=1;e.events=[{eventId:e.checkpointContext!.battleId+':event:1',eventType:'ENCOUNTER_SETUP',sourceCardId:46601,authority:'OFFICIAL_SOURCE',actor:null,targets:[],result:{},parentEventId:null,ruleSetVersion:e.ruleSetVersion}];}],
  ];
  it.each(forgeries)('rejects forged %s before save/reload',(_name,mutate)=>{
    const c=prophetContractFixture();mutate(c);
    expect(()=>validateBossSaveContracts(c)).toThrow();
    const save=createSaveSnapshot(c);
    expect(validateSaveFile(save)).not.toBeNull();expect(()=>restoreSaveSnapshot(save)).toThrow();
  });
  it('cannot run the Necromancer executor with registered Prophet definitions',()=>{
    const c=prophetContractFixture(),b=threatShell(c);
    expect(()=>bindBossEncounter({...b,bossEncounter:undefined},b.bossEncounter!.definition,1)).toThrow('foundation acceptance');
    expect(()=>applyBossRuntimeInput(b,{type:'ENTER_BOSS_ROOM'})).toThrow('foundation acceptance');
  });
  it('rejects Prophet large overflow contracts and capacity seven',()=>{
    const b=threatShell(prophetContractFixture());
    b.largeMovementContract={ruleSetVersion:'C1C32R2-THREAT-DEPENDENCIES-v3'} as never;
    expect(()=>validateBossBattleContracts(b)).toThrow();delete b.largeMovementContract;
    b.actorOccupancy={ruleSetVersion:'C1C32R2-LARGE-SINGLE-DISPLACEMENT-OVERFLOW-v1',placements:{},occupiedSpaces:{}};
    expect(()=>validateActorOccupancy(b)).toThrow();
    b.actorOccupancy.ruleSetVersion=PROPHET_ACTOR_CAPACITY_VERSION;
    expect(()=>validateActorOccupancy(b)).not.toThrow();
    expect(encounterRuleDependencies(b.bossEncounter!).heroDodgeRuleSetVersion).toBe('C1C31-DIGITAL-DEFAULT-v2');
  });
  it('validates settled Threat identity without installing Prophet lifecycle hooks',()=>{
    const c=prophetContractFixture();expect(()=>validateThreatCheckpoint(c,c.bossEncounterCheckpoint!)).not.toThrow();
  });
  it('checks actual Actor identities, costs and capacity without counting Pew markers',()=>{
    const states=JSON.parse(readFileSync('docs/data/complete-edition/c1c33-browser-level1-replay-states.json','utf8')) as Array<{point:string;campaign:CampaignState}>;
    const template=states.find(s=>s.point==='boss-battle-active')!.campaign.battle!;
    const b=threatShell(prophetContractFixture());b.heroes=structuredClone(template.heroes);
    b.monsters=[{...structuredClone(template.monsters[0]),id:'prophet-contract-actor'}];
    const e=b.bossEncounter!;e.bossState.actorId=b.monsters[0].id;
    e.placements=Object.fromEntries([...b.heroes,...b.monsters].map(a=>[a.id,'ruins-tile-11:C']));
    b.actorOccupancy={ruleSetVersion:PROPHET_ACTOR_CAPACITY_VERSION,placements:{...e.placements},
      occupiedSpaces:Object.fromEntries([...b.heroes,...b.monsters].map(a=>[a.id,a.side==='hero'?1:2]))};
    expect(()=>validateActorOccupancy(b)).not.toThrow();
    const extra={...structuredClone(b.heroes[0]),id:'extra-contract-hero'};b.heroes.push(extra);
    e.placements[extra.id]='ruins-tile-11:C';b.actorOccupancy.placements[extra.id]='ruins-tile-11:C';b.actorOccupancy.occupiedSpaces[extra.id]=1;
    expect(()=>validateActorOccupancy(b)).toThrow('capacity exceeded');
    b.heroes.pop();delete e.placements[extra.id];delete b.actorOccupancy.placements[extra.id];delete b.actorOccupancy.occupiedSpaces[extra.id];
    b.actorOccupancy.occupiedSpaces[e.bossState.actorId!]=1;
    expect(()=>validateActorOccupancy(b)).toThrow('binding mismatch');
  });
  it('proves prototype modules have zero production runtime import reachability',()=>{
    expect(auditProductionPrototypeReachability().productionPrototypeReachability).toBe(0);
  });
  it('pins dependency versions on returned Room receipts as well as active saves',()=>{
    const returned=returnProductionBossRoomOnTermination(prophetContractFixture(),'incomplete');
    expect(()=>validateBossSaveContracts(returned)).not.toThrow();
    returned.bossRoomReturnHistory![0].encounter.ruleDependencies!.actorOccupancyRuleSetVersion='C1C32R2-LARGE-SINGLE-DISPLACEMENT-OVERFLOW-v1';
    expect(()=>validateProductionBossRoomStorage(returned)).toThrow('dependency binding mismatch');
    expect(()=>validateBossSaveContracts(returned)).toThrow('dependency binding mismatch');
  });
});
