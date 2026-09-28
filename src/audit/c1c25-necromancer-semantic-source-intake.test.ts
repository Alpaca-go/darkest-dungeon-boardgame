import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildArtifacts, decide, load, root, unresolvedLeaves, validateArtifacts, verifyAssets, verifyScope } from '../../scripts/audit/c1c25-contract';

const a=buildArtifacts();
const cards=a['c1c25-necromancer-card-semantic-contracts.json'].cards;
const composition=a['c1c25-necromancer-encounter-composition.json'].levels;
const capabilities=a['c1c25-necromancer-runtime-capability-matrix.json'];
const card=(id:number)=>cards.find((d:any)=>d.cardId===id);
describe('C1C25 locked Necromancer semantic source intake',()=>{
  it('keeps exactly all nine C1C24 physical identities and both literals without regressions',()=>{
    const original=load('c1c24-boss-printed-definitions.json').cards.filter((d:any)=>d.family==='Necromancer');
    expect(cards).toHaveLength(9);
    expect(cards.map((d:any)=>d.physicalIdentity)).toEqual(original.map((d:any)=>d.physicalIdentity));
    expect(new Set(cards.map((d:any)=>d.physicalIdentity)).size).toBe(9);
    for(const d of cards){const old=original.find((x:any)=>x.definitionId===d.definitionId);expect(d.printedLiteral).toEqual({front:old.frontLiteral,back:old.backLiteral});expect(d.literalComplete).toBe(true);}
    expect(cards.every((d:any)=>d.family==='Necromancer')).toBe(true);
  });
  it('reconstructs unique per-level identity / Threat-Ability / Battle sets from explicit source relationships',()=>{
    expect(composition.map((c:any)=>c.level)).toEqual([1,2,3]);
    const allIds=composition.flatMap((c:any)=>[c.bossIdentityPhysicalId,c.threatPhysicalId,c.battlePhysicalId]);
    expect(new Set(allIds).size).toBe(9);expect(allIds.sort()).toEqual(cards.map((d:any)=>d.physicalIdentity).sort());
    for(const c of composition){
      expect(c.abilitySide).toEqual({physicalIdentity:c.threatPhysicalId,side:'front'});
      expect(c.relationEvidence.some((r:any)=>r.kind==='SOURCE_CONTAINER')).toBe(true);
      expect(c.relationEvidence.some((r:any)=>r.kind==='PRINTED_COMPONENT')).toBe(true);
      expect(c.relationEvidence.some((r:any)=>r.kind==='LOCKED_CORE_RULEBOOK'&&r.page===11)).toBe(true);
      expect(c.coreCopyCounts.value).toEqual({bossIdentity:1,threatAbility:1,battle:1});
    }
  });
  it('distinguishes absent narrative stats from exact per-level Battle stats',()=>{
    for(const id of [42000,42001,42002]){expect(card(id).HP).toMatchObject({status:'PRINTED_ABSENT',value:null});expect(card(id).cardLocalSemanticComplete).toBe(true);expect(card(id).semanticComplete).toBe(false);}
    expect([46037,46038,46039].map(id=>card(id).stats.value.HP)).toEqual([77,103,144]);
    expect([46037,46038,46039].map(id=>card(id).stats.value.speed)).toEqual([0,1,3]);
    expect(card(46037).stats.value.immunityTokens).toEqual(['THREE_YELLOW_DIAMONDS']);
  });
  it('models sourced physical flip and passive expiry, rather than inferring a reversible state machine',()=>{
    for(const id of [42003,42004,42005]){
      const c=card(id);expect(c.abilitySideRelation.value).toMatchObject({physicalFlip:true,threatAndAbilitySimultaneous:false});
      expect(c.abilitySideRelation.sourceReferences.some((r:any)=>r.page===30)).toBe(true);
      expect(c.trigger.status).toBe('BOUND');expect(c.expiry.status).toBe('BOUND');
      expect(c.expiry.value.every((x:any)=>x.expiry.includes('flip'))).toBe(true);
    }
    expect(card(42003).effect.value[0].duration).toBe('permanent removal');
    expect(card(42004).effect.value[0].trigger).toBe('start of first Battle in this Dungeon');
    expect(card(42005).effect.value[0].effect).toContain('no space: ignore');
  });
  it('gates every lowest-roll clause with an explicit null tie rule and no fabricated fallback',()=>{
    for(const id of [42004,42005]){
      const c=card(id);expect(c.target.value.some((x:any)=>x.target.includes('LOWEST_ROLL_TARGET'))).toBe(true);
      expect(c.tieRule).toMatchObject({status:'SOURCE_UNRESOLVED',value:null,category:'LOWEST_ROLL_HERO_TIE_UNRESOLVED'});
      expect(c.semanticComplete).toBe(false);
    }
    expect(card(46037).tieRule.category).toBe('TARGET_TIE_UNRESOLVED');
  });
  it('maps attack fields to printed Skill sections and binds attack/self/target branches',()=>{
    for(const id of [46037,46038,46039]){
      const c=card(id);expect(c.effect.value.map((s:any)=>s.range)).toEqual([1,2,2]);
      expect(c.effect.value.map((s:any)=>s.targetCount)).toEqual([2,2,4]);
      expect(c.effect.value.every((s:any)=>c.printedLiteral.front.includes(s.literalBinding.section))).toBe(true);
      expect(c.attackSelection.value.table).toEqual([{rollMin:1,rollMax:3,skill:1},{rollMin:4,rollMax:6,skill:2},{rollMin:7,rollMax:10,skill:3}]);
      expect(c.effectOrder.sourceReferences.some((r:any)=>r.page===20)).toBe(true);
      expect(c.successBranch.value).toContain('Miss: still Self Push 1');
      expect(c.summonMultiplicity.value).toBeNull();expect(c.semanticComplete).toBe(false);
    }
    expect(card(46039).effect.value[0]).toMatchObject({accuracy:12,critDamage:16,damage:10});
  });
  it('binds real Bone identities independently, preserving printed monster Levels and finite candidate copies',()=>{
    const bones=a['c1c25-necromancer-bone-source-binding.json'].units;
    expect(bones.map((b:any)=>b.name)).toEqual(['Bone Rabble','Bone Soldier','Bone Spearman','Bone Courtier','Bone Defender','Bone Captain']);
    for(const b of bones)expect(b.bindings.length).toBeGreaterThan(0);
    expect(composition.map((c:any)=>c.monsterSummons.value.printedMonsterLevel)).toEqual(['I','I','II']);
    expect(bones.find((b:any)=>b.name==='Bone Courtier').summonEligibility).toBe('NOT_NAMED_BY_NECROMANCER_SUMMON_RULE');
    expect(bones.find((b:any)=>b.name==='Bone Defender').summonEligibility).toBe('NOT_NAMED_BY_NECROMANCER_SUMMON_RULE');
    expect(bones.find((b:any)=>b.name==='Bone Captain').bindings.map((b:any)=>b.cardId)).toEqual([46111,46600]);
    expect(a['c1c25-necromancer-bone-source-binding.json'].missingName.alias.value).toBeNull();
  });
  it('retains Rabble / Rubble discrepancy without silently normalizing either source',()=>{
    const d=a['c1c25-necromancer-source-discrepancies.json'].discrepancies[0];
    expect(d.topic).toBe('BONE_RABBLE_VS_BONE_RUBBLE');expect(d.status).toBe('UNRESOLVED');
    expect(d.printedSource.literal).toBe('Bone Rabble');expect(d.rulebookSource.region).toBe('Bone Rubble');
    expect(d.precedence).toMatchObject({category:'SOURCE_PRECEDENCE_UNRESOLVED',value:null});
  });
  it('uses explicit full-Stance suppression and keeps Room occupancy displacement separate',()=>{
    const summons=a['c1c25-necromancer-summon-contract.json'].levels;
    for(const s of summons){expect(s.fullStanceBehavior.value).toContain('SUPPRESS_SUMMON');expect(s.fullStanceBehavior.sourceReferences[0].literal).toContain('does not take effect');expect(s.fullRoomBehavior.sourceReferences[0].page).toBe(31);expect(s.roomCapacityFallback.status).toBe('SOURCE_UNRESOLVED');}
    expect(a['c1c25-necromancer-source-discrepancies.json'].discrepancies[1]).toMatchObject({status:'RESOLVED_BY_EXPLICIT_SCOPE',ruling:'SUPPRESS_SUMMON'});
  });
  it('binds Room 10 on the correct side, layout, starting places, setup and cleanup',()=>{
    const room=a['c1c25-necromancer-room-contract.json'];
    expect(room.tile.value).toMatchObject({number:10,side:'ImageSecondaryURL'});
    expect(room.areas.value).toHaveLength(8);expect(room.areas.value.map((r:any)=>r.capacity)).toEqual([3,4,3,4,2,2,2,4]);
    expect(room.areas.value.find((r:any)=>r.id==='bottom').heroStart).toHaveLength(4);
    expect(room.areas.value.find((r:any)=>r.id==='top')).toMatchObject({highGround:true,monsterStart:['Aggressive']});
    expect(room.printedRoomRule.status).toBe('PRINTED_ABSENT');
    expect(a['c1c25-necromancer-setup-contract.json'].levels).toHaveLength(3);
    expect(a['c1c25-necromancer-cleanup-contract.json'].bossCardDestination.value).toBeNull();
  });
  it('registers every unresolved leaf across cards and external contracts with null values and source evidence',()=>{
    const reg=a['c1c25-necromancer-source-gap-register.json'].sourceGaps;
    const seen:string[]=[];
    for(const [artifact,body]of Object.entries(a)){
      if(/(source-gap-register|runtime-capability|family-completeness|runtime-roi|next-workstream|source-manifest)\.json$/.test(artifact))continue;
      for(const g of unresolvedLeaves(body)){const id=artifact+':'+g.field;seen.push(id);expect(reg.find((r:any)=>r.gapId===id)).toMatchObject({category:g.category,blockerKind:'SOURCE',resolutionValue:null});expect(g.sourceReferences.length).toBeGreaterThan(0);}
    }
    expect(seen.sort()).toEqual(reg.map((g:any)=>g.gapId).sort());expect(new Set(seen).size).toBe(seen.length);
    expect(reg.every((g:any)=>g.category!=='ENGINE_BINDING_MISSING'&&!g.terminal)).toBe(true);
  });
  it('requires bound external dependencies and exact consumers before candidate / Ready promotion',()=>{
    expect(capabilities.family).toMatchObject({physicalCards:9,literalComplete:9,semanticComplete:0,sourceGated:9,runtimeCandidate:0,productionReady:0,externalDependenciesResolved:5});
    for(const c of capabilities.cards)expect(c).toMatchObject({semanticComplete:false,sourceGated:true,engineConsumerAvailable:false,adapterAvailable:false,targetSelectorAvailable:false,summonRuntimeAvailable:false,saveReplayProof:false,productionRuntimeProof:false,productionUiProof:false,runtimeCandidate:false,productionReady:false});
    const deps=a['c1c25-necromancer-external-dependencies.json'].dependencies;
    expect(deps.find((d:any)=>d.dependencyId==='BONE_SUMMON_CARDS').status).toBe('PARTIAL');
    expect(deps.find((d:any)=>d.dependencyId==='ROOM_CARD').status).toBe('BOUND');
    expect(deps.find((d:any)=>d.dependencyId==='ROOM_TILE').status).toBe('BOUND');
  });
  it('derives source closure continuation from capability and whole-family ROI, never selects another family',()=>{
    const roi=a['c1c25-necromancer-runtime-roi-matrix.json'];
    expect(a['c1c25-next-workstream-decision.json']).toMatchObject(decide(capabilities,roi));
    expect(decide(capabilities,roi)).toMatchObject({selectedFamily:'Necromancer',outcome:'NECROMANCER_SOURCE_CLOSURE_CONTINUATION',runtimeFoundationSelected:false,terminalBlockersProven:false});
    expect(decide({...capabilities,family:{...capabilities.family,semanticComplete:9}},roi).runtimeFoundationSelected).toBe(false);
    expect(roi.family.expectedWholeContentReadyGain).toBe(0);
  });
  it('excludes mock and videogame authority and reports inaccessible FAQ honestly',()=>{
    const table=a['c1c25-necromancer-source-precedence.json'].table;
    for(const kind of ['MOCK_PROTOTYPE','VIDEOGAME'])expect(table.find((r:any)=>r.kind===kind).authority).toBe('EXCLUDED');
    const search=load('c1c25-source-search-evidence.json');expect(search.videogameAsEvidence).toBe(false);expect(search.runtimeAsEvidence).toBe(false);
    expect(search.candidates.every((c:any)=>!c.authorityForMechanics)).toBe(true);
    expect(search.candidates[0].status).toBe('LOCATED_ACCESS_UNAVAILABLE');
  });
  it('freezes all accepted census / readiness totals and historical failures',()=>{
    const m=a['c1c25-necromancer-source-manifest.json'];
    expect(m.baselineFrozenReady).toEqual({coreTrinket:'15/37',standardQuest:'3/75',hamletEventLiteral:16,hamletEventCardLocalSemantic:5,hamletEventReady:0,bossEncounterCensus:278,ordinaryBossCensus:231,bossFamilies:20,BATTLE:114,THREAT:51,ABILITY:12,BOSS_IDENTITY:54});
    expect(m.historicalE2EFailures).toEqual(['C1C13 reload retry exhaustion','C1C12 reload retry exhaustion','C1C11 reload retry exhaustion','C1C3 selector click timeout']);
    expect(load('c1c24-boss-printed-definitions.json').cards).toHaveLength(231);
  });
  it('rebuilds original Bone / Room crops and locks tile side and all core crop bytes',async()=>{await verifyAssets();},120_000);
  it('reproduces every persisted artifact',()=>{for(const [name,expected]of Object.entries(a))expect(JSON.parse(readFileSync(root+name,'utf8'))).toEqual(expected);validateArtifacts(a);});
  it.each(['src/game-engine/battle.ts','src/data/bosses/necromancer-family.ts','src/components/BossSelector.tsx','src/game-engine/campaign/act-four/runtime.ts','docs/data/complete-edition/c1c24-boss-printed-definitions.json'])('rejects forbidden modification %s',(path)=>{expect(()=>verifyScope([path])).toThrow('audit-only scope');});
  const mutations:Array<[string,(x:any)=>void]>=[
    ['tenth card',x=>x['c1c25-necromancer-card-semantic-contracts.json'].cards.push(cards[0])],
    ['swapped physical identity',x=>x['c1c25-necromancer-card-semantic-contracts.json'].cards[0].physicalIdentity=cards[1].physicalIdentity],
    ['literal regression',x=>x['c1c25-necromancer-card-semantic-contracts.json'].cards[0].literalComplete=false],
    ['tie-based semantic promotion',x=>x['c1c25-necromancer-card-semantic-contracts.json'].cards.find((c:any)=>c.cardId===42004).semanticComplete=true],
    ['invented flip relation',x=>x['c1c25-necromancer-card-semantic-contracts.json'].cards.find((c:any)=>c.cardId===42003).abilitySideRelation.value.physicalFlip=false],
    ['campaign-level summon default',x=>x['c1c25-necromancer-encounter-composition.json'].levels[1].monsterSummons.value.printedMonsterLevel='II'],
    ['silent Rabble typo fix',x=>x['c1c25-necromancer-source-discrepancies.json'].discrepancies.pop()],
    ['generic full-Stance replacement',x=>x['c1c25-necromancer-summon-contract.json'].levels[0].fullStanceBehavior.value='replace existing monster'],
    ['Room primary-side swap',x=>x['c1c25-necromancer-room-contract.json'].tile.value.side='ImageURL'],
    ['omitted Room dependency',x=>x['c1c25-necromancer-external-dependencies.json'].dependencies.splice(2,1)],
    ['omitted gap',x=>x['c1c25-necromancer-source-gap-register.json'].sourceGaps.pop()],
    ['mock source authority',x=>x['c1c25-necromancer-card-semantic-contracts.json'].cards[0].sourceReferences[0].kind='MOCK_PROTOTYPE'],
    ['counterfeit runtime candidate',x=>x['c1c25-necromancer-runtime-capability-matrix.json'].cards[0].runtimeCandidate=true],
    ['counterfeit Ready',x=>x['c1c25-necromancer-runtime-capability-matrix.json'].family.productionReady=9],
    ['detached runtime decision',x=>x['c1c25-next-workstream-decision.json'].outcome='NECROMANCER_RUNTIME_FOUNDATION_SELECTED'],
  ];
  it.each(mutations)('rejects %s',(_label,mutate)=>{const changed=structuredClone(a);mutate(changed);expect(()=>validateArtifacts(changed)).toThrow('source-derived artifact drift');});
});
