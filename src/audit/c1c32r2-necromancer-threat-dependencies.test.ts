import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { applyDefaultLoadout, createNewCampaign, selectParty, selectQuest } from '../game-engine/campaign';
import { commitQuestSelection } from '../game-engine/commands/quest';
import { applyBossThreatCheckpointInput } from '../game-engine/commands/boss-foundation';
import { explicitlyMigrateHeroDodgeToV2 } from '../game-engine/rules/hero-dodge-versioning';
import { seededRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';
import { applyNecromancerPreparationDayGraveyard, activateGraveyardForNextQuest, expireGraveyardAtQuestEnd } from '../game-engine/campaign/necromancer-graveyard';
import { applyStress } from '../game-engine/stress';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { beginLargeMovement, bindLargeMovementContract, resolveLargeDisplacement, validateLargeMovementContract } from '../game-engine/rules/large-movement-contract';
import { THREAT_DEPENDENCY_V3 } from '../types/necromancer-dependencies';
import { fixtureUnit, foundationFixture } from '../game-engine/bosses/foundation-test-fixture';
import { resolveTurnStartMentalEffect } from '../game-engine/mental-effects';
import { makeHeroUnit } from '../game-engine/battle';
import type { CampaignState, BattleState } from '../types';

const read = (name: string) => JSON.parse(fs.readFileSync(`docs/data/complete-edition/c1c32r2-${name}.json`, 'utf8'));
function preparation(level: 2 | 3): CampaignState {
  return withRuntimeSources(seededRuntimeSources(32322), () => {
    let c = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), ['crusader','highwayman','vestal','hellion']));
    c.gamePhase = 'quest-select';
    Object.assign(c.campaignProgress, { campaignLevel: level, act: level, activeBossFamilyId: 'necromancer',
      activeThreatId: `necromancer-threat-level-${level}`, pendingThreatInitialization: false,
      completedStandardQuestsThisAct: 2, bossQuestRequired: true });
    c = explicitlyMigrateHeroDodgeToV2(c, 'C1C32R2-dependency-isolation');
    const selected = commitQuestSelection(c, 'face-the-threat');
    if (!selected.ok) throw new Error(selected.error!);
    c = selected.campaign;
    c = applyBossThreatCheckpointInput(c, { type: 'PREPARATION_DAY', rolls: Object.fromEntries(c.heroes.map((h,i) => [`u_${h.instanceId}`,i+1])) });
    // Command isolation: no claim that existing UI has a preparation checkpoint bridge.
    return { ...c, gamePhase: 'hamlet', hamlet: { ...c.hamlet, currentDay: 1 } };
  });
}
function roundtrip(c: CampaignState) {
  const save = createSaveSnapshot(c);
  expect(validateSaveFile(save)).toBeNull();
  const restored = restoreSaveSnapshot(JSON.parse(JSON.stringify(save)));
  expect(restored).toEqual(c);
  return restored;
}
function largeBoard(): BattleState {
  const heroes = ['target','h1','h2','h3'].map((id,i) => fixtureUnit(id,'hero',i+1));
  const monsters = [fixtureUnit('large','monster')];
  const battle: BattleState = { battleId:'dependency-fixture',sourceRoomId:'synthetic-contract-isolation',status:'active',round:1,maxRounds:4,heroes,monsters,
    initiativeOrder:[],initiativeIndex:-1,activeActorId:null,currentActionPoints:0,selectedSkillId:null,selectedTargetId:null,battleLog:[],rewards:{gold:0} };
  return bindLargeMovementContract(battle,THREAT_DEPENDENCY_V3,{areas:[
    {id:'full',capacity:4,adjacent:['start','other']},{id:'start',capacity:2,adjacent:['full']},{id:'other',capacity:2,adjacent:['full']},
  ], placements:{target:'full',h1:'full',h2:'full',h3:'full',large:'start'},occupiedSpaces:{target:1,h1:1,h2:1,h3:1,large:2}});
}
describe('C1C32R2 physical intake gates (no production combat acceptance)', () => {
  it('accounts for all 24 families and 62 copies including Common, Large and Small', () => {
    const deck = read('ruins-monster-deck-contract');
    expect(deck.compositionComplete).toBe(true); expect(deck.identities).toHaveLength(24);
    expect(deck.physicalCopies).toBe(62);
    expect(deck.countsByCampaignLevel).toEqual([{level:1,copies:42},{level:2,copies:53},{level:3,copies:62}]);
    expect(deck.identities.some((m: {canonicalId:string}) => m.canonicalId === 'cultist-brawler')).toBe(true);
    expect(deck.largeProxyCardsAreExtraCopies).toBe(false);
  });
  it('does not let source intake or prototype definitions masquerade as executable completeness', () => {
    const deck = read('ruins-monster-deck-contract'), definitions = read('ruins-monster-definitions');
    expect(deck.prototypeMonsterDefinitions).toBe(0); expect(deck.syntheticMonsterDefinitions).toBe(0);
    expect(deck.missingMonsterDefinitions).toBe(23); expect(definitions.executableDefinitions).toBe(1);
    expect(definitions.definitions.every((m: {executable:boolean;blockers:string[]}) => m.executable || m.blockers.length > 0)).toBe(true);
    expect(definitions.sourceMismatches.every((m: {status:string;source:{sha256:string}}) => m.status === 'SOURCE_MISMATCH' && m.source.sha256.length === 64)).toBe(true);
    expect(definitions.definitions.find((m:{canonicalId:string})=>m.canonicalId==='bone-captain').acceptedDefinitionReference).toBeDefined();
  });
  it('binds Room/tile identity and keeps Room 10 out of proposed ordinary draws', () => {
    const rooms = read('ruins-room-deck-contract'), tiles = read('ruins-tile-area-contract');
    expect(rooms.ordinaryDrawPool).toHaveLength(9); expect(rooms.ordinaryDrawPool).not.toContain('ruins-room-10');
    expect(rooms.room10ExclusionBound).toBe(true); expect(tiles.tiles).toHaveLength(9);
    for (const tile of tiles.tiles) expect(rooms.rooms.find((r:{tileId:string})=>r.tileId===tile.tileId).roomNumber).toBe(tile.roomNumber);
    expect(tiles.room10GeometryReused).toBe(false); expect(tiles.complete).toBe(false);
  });
  it('specifies RNG boundaries and saved physical results without pretending a runnable draw exists', () => {
    const draw = read('ordinary-threat-encounter-draw-contract');
    expect(draw.reloadRedraw).toBe(false); expect(draw.complete).toBe(false);
    expect(draw.storedResultFields).toEqual(expect.arrayContaining(['monsterCopyIds','placements','initiativeDeck','rngAfter']));
    expect(draw.status).toBe('SPECIFIED_NOT_EXECUTABLE');
  });
});
describe('C1C32R2 generic Large ruling command isolation', () => {
  it('keeps two-space footprint and persists all non-Target displacement choices', () => {
    const before = largeBoard(), waiting = beginLargeMovement(before,'large','target','full');
    expect(waiting.largeMovementContract!.pendingChoice!.candidateIds).toHaveLength(6);
    expect(waiting.largeMovementContract!.pendingChoice!.candidateIds.every(id => !id.includes('target'))).toBe(true);
    expect(waiting.largeMovementContract!.placements).toEqual(before.largeMovementContract!.placements);
    const p = waiting.largeMovementContract!.pendingChoice!;
    const direct = resolveLargeDisplacement(waiting,p.choiceId,p.candidateIds[0]);
    const resumed = resolveLargeDisplacement(JSON.parse(JSON.stringify(waiting)),p.choiceId,p.candidateIds[0]);
    expect(resumed).toEqual(direct); expect(direct.largeMovementContract!.overflow).toHaveLength(1);
    expect(direct.largeMovementContract!.occupiedSpaces.large).toBe(2);
    expect(() => validateLargeMovementContract(direct)).not.toThrow();
  });
  it('does not choose a random destination or mutate placements when no destination is legal', () => {
    const b = largeBoard(); b.largeMovementContract!.areas.forEach(a => { a.adjacent=[]; });
    const result = beginLargeMovement(b,'large','target','full');
    expect(result.largeMovementContract!.pendingChoice).toBeNull();
    expect(result.largeMovementContract!.placements).toEqual(b.largeMovementContract!.placements);
    expect(result.largeMovementContract!.events.at(-1)?.type).toBe('LARGE_MOVEMENT_BLOCKED');
  });
  it('rejects forged candidates, overflow and wrong versions', () => {
    const b = beginLargeMovement(largeBoard(),'large','target','full');
    expect(() => resolveLargeDisplacement(b,b.largeMovementContract!.pendingChoice!.choiceId,'["target","other"]')).toThrow();
    const corrupt = structuredClone(b); corrupt.largeMovementContract!.pendingChoice!.candidateIds.pop();
    expect(() => validateLargeMovementContract(corrupt)).toThrow();
    const full = largeBoard(); full.largeMovementContract!.placements.large='full';
    expect(() => validateLargeMovementContract(full)).toThrow('overflow');
    expect(() => bindLargeMovementContract(largeBoard(),'C1C31-DIGITAL-DEFAULT-v2',largeBoard().largeMovementContract!)).toThrow();
  });
  it('never rewrites historical v1/v2 Boss encounters', () => {
    const b = foundationFixture(); const bytes = JSON.stringify(b);
    expect(() => bindLargeMovementContract(b,THREAT_DEPENDENCY_V3,largeBoard().largeMovementContract!)).toThrow();
    expect(JSON.stringify(b)).toBe(bytes); expect(b.largeMovementContract).toBeUndefined();
  });
  it('persists a Large displacement choice through the real campaign save validator', () => {
    let c=applyDefaultLoadout(selectParty(createNewCampaign(),['crusader','highwayman','vestal','hellion']));
    c=withRuntimeSources(seededRuntimeSources(323),()=>selectQuest({...c,gamePhase:'quest-select'},'scout-ahead'));
    const b=largeBoard(), s=b.largeMovementContract!;
    const old=b.heroes.map(h=>h.id);
    b.heroes=c.heroes.map((h,i)=>makeHeroUnit(h,i,c));
    old.forEach((id,i)=>{s.placements[b.heroes[i].id]=s.placements[id];s.occupiedSpaces[b.heroes[i].id]=1;delete s.placements[id];delete s.occupiedSpaces[id];});
    const waiting=beginLargeMovement(b,'large',b.heroes[0].id,'full');
    c={...c,gamePhase:'battle',battle:waiting};
    const restored=roundtrip(c), p=waiting.largeMovementContract!.pendingChoice!;
    expect(resolveLargeDisplacement(restored.battle!,p.choiceId,p.candidateIds[0]))
      .toEqual(resolveLargeDisplacement(waiting,p.choiceId,p.candidateIds[0]));
  });
  it('supports direct two-space movement and refuses migration after initiative starts', () => {
    const b=largeBoard(); b.largeMovementContract!.areas.find(a=>a.id==='other')!.capacity=3;
    const moved=beginLargeMovement(b,'large','target','other');
    expect(moved.largeMovementContract!.placements.large).toBe('other');
    expect(moved.largeMovementContract!.pendingChoice).toBeNull();
    const active=structuredClone(b);delete active.largeMovementContract;active.initiativeIndex=0;
    expect(()=>bindLargeMovementContract(active,THREAT_DEPENDENCY_V3,b.largeMovementContract!)).toThrow();
  });
});
describe('C1C32R2 Graveyard transaction isolation and real lifecycle hooks', () => {
  it('Level II forces the selected Hero but permits declining the next-Quest effect', () => {
    const c=preparation(2), applied=applyNecromancerPreparationDayGraveyard(c,false);
    expect(applied.heroes[0].hasActedToday).toBe(true); expect(applied.heroes[1].hasActedToday).toBe(false);
    expect(applied.necromancerGraveyardReceipts![0]).toMatchObject({useEffect:false,lifecycle:'GUARD_ONLY',virtueId:null});
    expect(applied.gold).toBe(c.gold); roundtrip(applied);
  });
  it('Level III permits guard duty and forbids using the effect', () => {
    const c=preparation(3);
    expect(() => applyNecromancerPreparationDayGraveyard(c,true)).toThrow();
    const applied=roundtrip(applyNecromancerPreparationDayGraveyard(c,false));
    expect(applied.necromancerGraveyardReceipts![0].threatLevel).toBe(3);
    expect(applied.heroes[0].virtueId).toBe(c.heroes[0].virtueId);
  });
  it('draws once, persists provenance and remains idempotent after reload', () => {
    const c=preparation(2), applied=roundtrip(applyNecromancerPreparationDayGraveyard(c,true));
    expect(applyNecromancerPreparationDayGraveyard(applied,true)).toBe(applied);
    expect(applied.necromancerGraveyardReceipts).toHaveLength(1);
    expect(applied.processedCampaignTransactionIds).toContain(applied.necromancerGraveyardReceipts![0].transactionId);
    expect(() => applyNecromancerPreparationDayGraveyard(applied,false)).toThrow('conflicts');
    expect(applied.gold).toBe(c.gold); expect(applied.heroes.map(h=>h.wounds)).toEqual(c.heroes.map(h=>h.wounds));
  });
  it('activates on the next Quest, survives save and kills on first Stress 10 without Resolve Test', () => {
    const c=applyNecromancerPreparationDayGraveyard(preparation(2),true);
    const active=roundtrip(activateGraveyardForNextQuest(c));
    const hero=active.heroes[0];
    expect(hero.virtueId).toBe(c.necromancerGraveyardReceipts![0].virtueId);
    const killed=withRuntimeSources(seededRuntimeSources(10),()=>applyStress(active,{heroId:hero.instanceId,amount:10,sourceType:'debug',questId:active.currentQuestId!}));
    expect(killed.campaign.heroes[0].dead).toBe(true); expect(killed.result.resolveTest).toBeUndefined();
    expect(killed.campaign.deathRecords.at(-1)?.sourceSkillId).toBe('official-graveyard-stress-10');
  });
  it('expires at Quest end and preserves consumed history', () => {
    const active=activateGraveyardForNextQuest(applyNecromancerPreparationDayGraveyard(preparation(2),true));
    const expired=roundtrip(expireGraveyardAtQuestEnd(active));
    expect(expired.necromancerGraveyardReceipts![0].lifecycle).toBe('EXPIRED');
    expect(expireGraveyardAtQuestEnd(expired)).toBe(expired);
  });
  it('rejects missing forced-Hero and ruleset provenance', () => {
    const missing=preparation(2); missing.bossEncounterCheckpoint!.threatState.forcedHeroId='u_missing';
    expect(()=>applyNecromancerPreparationDayGraveyard(missing,true)).toThrow();
    const wrong=preparation(2); wrong.bossEncounterCheckpoint!.checkpointContext!.definitionVersion='wrong';
    expect(()=>applyNecromancerPreparationDayGraveyard(wrong,true)).toThrow();
    const switched=preparation(2); switched.bossEncounterCheckpoint!.threatState.forcedHeroId=`u_${switched.heroes[1].instanceId}`;
    expect(()=>applyNecromancerPreparationDayGraveyard(switched,true)).toThrow('causal provenance');
    const acted=preparation(2);acted.heroes[0].hasActedToday=true;
    expect(()=>applyNecromancerPreparationDayGraveyard(acted,false)).toThrow();
    const late=preparation(2);late.hamlet.currentDay=2;
    expect(()=>applyNecromancerPreparationDayGraveyard(late,false)).toThrow();
  });
  it('the actual Quest-selection hook activates after mental reset without redrawing', () => {
    const source=applyNecromancerPreparationDayGraveyard(preparation(2),true);
    // Clean, legacy Standard Quest harness tests the lifecycle hook; no Threat Battle claim.
    let c=selectParty(createNewCampaign(),['crusader','highwayman','vestal','hellion']);
    c={...c,id:source.id,heroes:source.heroes,necromancerGraveyardReceipts:source.necromancerGraveyardReceipts,gamePhase:'quest-select'};
    const next=withRuntimeSources(seededRuntimeSources(99),()=>selectQuest(c,'scout-ahead'));
    expect(next.necromancerGraveyardReceipts![0].targetQuestRunId).toBe(next.dungeon!.questRunId);
    expect(next.heroes[0].resolveState).toBe('virtuous');
    expect(next.heroes[0].virtueId).toBe(source.necromancerGraveyardReceipts![0].virtueId);
  });
  it.each(['stalwart','courageous','focused','powerful','vigorous'])('executes source-bound Graveyard Virtue %s through shared pipelines', name => {
    const c=activateGraveyardForNextQuest(applyNecromancerPreparationDayGraveyard(preparation(2),true));
    const id=`official-graveyard:${name}`;
    c.necromancerGraveyardReceipts![0].virtueId=id;
    c.heroes=c.heroes.map((h,i)=>({...h,stress:4,wounds:i===0?8:0,...(i===0?{virtueId:id}: {})}));
    const heroes=c.heroes.map((h,i)=>makeHeroUnit(h,i,c));
    c.battle={...largeBoard(),largeMovementContract:undefined,heroes,monsters:[],activeActorId:heroes[0].id,initiativeIndex:0,pendingMentalCheck:true};
    c.gamePhase='battle';
    const rng={next:()=>0};
    const result=withRuntimeSources({...seededRuntimeSources(1),random:rng},()=>resolveTurnStartMentalEffect(c));
    expect(result.triggered).toBe(true); expect(result.cardId).toBe(id);
    if(name==='focused') expect(result.campaign.battle!.heroes[0].buffs.some(b=>b.type==='buff' && b.durationTurns===2)).toBe(true);
    if(name==='powerful') expect(result.campaign.battle!.heroes.every(h=>h.buffs.some(b=>b.type==='buff' && b.durationTurns===2))).toBe(true);
    if(name==='vigorous') expect(result.campaign.battle!.heroes[0].hp).toBe(heroes[0].hp+3*c.heroes[0].level);
    if(name==='stalwart') expect(result.campaign.heroes[0].stress).toBe(2);
    if(name==='courageous') expect(result.campaign.heroes.every(h=>h.stress===3)).toBe(true);
  });
});
