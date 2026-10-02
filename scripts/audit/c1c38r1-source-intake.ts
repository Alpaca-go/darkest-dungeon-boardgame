/** Official-source intake only; never imported by production. */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {verifyHistoricalBaseline, verifyHistoricalArtifacts} from './historical-baseline';
import {productionBossFamilyRegistry} from '../../src/game-engine/bosses/definitions';
import {productionBossCapabilities, productionBossPlayerRouteEnabled} from '../../src/game-engine/bosses/production-capabilities';

export const C1C38R1_BASELINE='dcf017cb2065440251caad8d31075b99bc6355e0';
const root='docs/data/complete-edition/';
const assets=root+'source-assets/c1c38r1/';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error('C1C38R1: '+message);};
const common={schemaVersion:1,phase:'11A.4-C1C38R1',baseline:C1C38R1_BASELINE,intakeDate:'2026-10-02',
  policyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',contractVersion:'C1C38R1-OFFICIAL-INTAKE-v1',
  runtimeImplemented:false,runtimeImplementationAuthorized:false,productionReady:false,playerRouteEnabled:false,gateAPassed:false,C1C39Allowed:false};

export function buildC1C38R1Artifacts():Record<string,any>{
  const predecessor=read(root+'c1c38-thing-executable-field-matrix.json');
  const inventory=read(assets+'repository-source-inventory.json');
  const visualReview=read(assets+'official-visual-review.json');
  const sources:any[]=[];
  const source=(id:string,file:string,title:string,type:string,pages:number[],scope:string,originalFile=file)=>{
    const original=inventory.archiveFiles.find((f:any)=>f.path.endsWith('/'+originalFile));
    assert(original,'inventory source '+originalFile);
    const path=assets+file;
    const entry={sourceId:id,officialTitle:title,publisher:'Mythic Games',sourceType:type,originalLocation:original.path,
      originalSha256:original.sha256,path,sha256:hash(path),pageCount:file===originalFile?original.pageCount:6,
      originalPageCount:original.pageCount,relevantPages:pages,pageSheetCard:pages.map(page=>({page,originalPage:file===originalFile?page:page+189})),
      intakeDate:common.intakeDate,downloadDate:null,acquisition:'EXISTING_LOCAL_OFFICIAL_PRINT_ARCHIVE',authority:type,
      authorityBasis:'Publisher print content, expansion rules credits and packaging copyright; archive directory and transport are locators only.',
      scope,fieldsSupported:[] as string[]};
    if(file===originalFile)assert(entry.sha256===original.sha256,'unchanged official PDF '+file);
    const reviewed=visualReview.pdfBindings.find((b:any)=>b.path===path);
    assert(reviewed&&reviewed.sha256===entry.sha256,'visual review PDF lock '+file);
    sources.push(entry);return entry;
  };
  source('COM-RULES','DD_EN_COM_RULES.pdf','The Color of Madness — Expansion Rulebook','OFFICIAL_RULEBOOK',[1,2,3,4,5,6,7,8],
    'Standalone Color of Madness session, its Boss Fight phase and printed components; not main campaign integration.');
  source('COM-BOX','DD_EN_COM_BOX.pdf','The Color of Madness — Box print','OFFICIAL_PRINTED_COMPONENT',[2],
    'Standalone mode explicitly outside main campaign; aggregate components only. Box token total conflicts with rules list.');
  source('COM-ROOM3','DD_COM_TILES_FRONT.pdf','The Color of Madness — Boss Room tile fronts','OFFICIAL_PRINTED_COMPONENT',[2],
    'Physical crystal-emblem Room 3, areas, entry stance icons; not a fabricated RoomStorage card.');
  source('COM-MONSTERS','DD_EN_COM_CARDS_70_120_monsters_Curio_Spawn_FRONT.pdf','The Color of Madness — Monster/Curio Spawn card fronts','OFFICIAL_PRINTED_COMPONENT',[8,18],
    'Crystalline Aberration I and II printed definitions only; page count is not available miniature/copy supply.');
  source('COM-ABILITY','DD_EN_COM_CARDS_70_120_Boss_Abilities_FRONT.pdf','The Color of Madness — Boss Ability/Identity card fronts','OFFICIAL_PRINTED_COMPONENT',[3,4],
    'Independent official print corroborates frozen Thing Identity/Ability; does not replace C1C38 literals.');
  source('COM-BATTLE','DD_EN_COM_CARDS_140x140_monster_large_FRONT.pdf','The Color of Madness — Large Monster/Boss card fronts','OFFICIAL_PRINTED_COMPONENT',[4],
    'Independent official print corroborates frozen single Thing Battle; no new Thing Levels.');
  source('CORE-ELDRITCH','core-eldritch-skill-pages.pdf','Core box — Sacrificial Stab and Abyssal Artillery I–III','OFFICIAL_PRINTED_COMPONENT',[1,2,3,4,5,6],
    'Only explicit printed damage bonuses versus Eldritch; no videogame taxonomy behavior.','DD_EN_COREBOX_CARDS_44x68_SKILLS_FRONT.pdf');
  const refs=(id:string,pages:number[])=>pages.map(page=>{
    const s=sources.find(s=>s.sourceId===id);assert(s.relevantPages.includes(page),'reviewed applicable page');
    return {sourceId:id,path:s.path,sha256:s.sha256,page,originalPage:id==='CORE-ELDRITCH'?page+189:page,authority:s.authority,applicability:s.scope};
  });
  const core=(pages:number[])=>{
    const review=read(root+'source-assets/c1c38/visual-review.json');
    return pages.map(page=>({...review.rulebookPages.find((r:any)=>r.page===page),authority:'OFFICIAL_RULEBOOK',
      applicability:'COM rules p2 and p7 expressly apply core combat; family-specific COM p8 overrides campaign context.'}));
  };
  const fields=structuredClone(predecessor.fields) as any[];
  const official=(id:string,value:unknown,literal:unknown,references:any[],reason:string)=>{
    const f=fields.find(f=>f.id===id);assert(f?.status==='SOURCE_UNRESOLVED','only former source blocker '+id);
    Object.assign(f,{status:'OFFICIAL_SOURCE',authority:'OFFICIAL_SOURCE',canonical:true,normalizedValue:value,literal,
      sourceReferences:references,contractExecutable:true,blocking:false,notes:reason});
    for(const r of references){const s=sources.find(s=>s.sourceId===r.sourceId);if(s&&!s.fieldsSupported.includes(id))s.fieldsSupported.push(id);}
  };
  const com=(pages:number[])=>refs('COM-RULES',pages);
  const standalone=com([2,4,7,8]).concat(refs('COM-BOX',[2]));
  official('actor.eldritchTagGameplay',{interactions:[{skills:['Sacrificial Stab','Abyssal Artillery'],levels:['I','II','III'],damageBonus:[1,2,3],condition:'versus Eldritch'}],otherInteractions:'NOT_ESTABLISHED'},
    '+1 / +2 / +3 [Damage] vs Eldritch',refs('CORE-ELDRITCH',[1,2,3,4,5,6]),'Explicit board-game Hero skills match the printed Eldritch tag; no universal tag bonus.');
  official('encounter.contentSet','THE_COLOR_OF_MADNESS','The Color of Madness; Thing listed among expansion Bosses',com([2,3,8]),'Content binding comes from named rulebook sections and printed components.');
  official('encounter.campaignEligibility','STANDALONE_OUTSIDE_MAIN_CAMPAIGN','This game mode is not part of the main campaign',standalone,'Packaging explicitly excludes main campaign; no imported Threat lifecycle.');
  official('encounter.questEligibility','STANDALONE_SESSION_FINAL_BOSS','You do not use it to expand the core game with new Quests and Monsters',com([2,4,7,8]),'Final phase follows Onslaught then Resting; no campaign Quest selector.');
  official('encounter.encounterType','EXPANSION_SPECIAL_ENCOUNTER','Onslaught phase, Resting phase and Boss Fight phase',com([4,7,8]),'Exactly one source-supported classification: standalone expansion final Boss fight.');
  official('encounter.FaceTheThreatApplicable',false,'standalone session; not part of the main campaign',standalone,'Canonical scope excludes main-campaign Face the Threat preparation; ordinary combat rules still apply.');
  official('encounter.ThreatModel','NO_THREAT_FIRST_TWO_PHASES_COMBAT_ABILITY_FINAL_PHASE','boss does not have any threat ability that applies during the first two phases, only a combat ability ... final phase',com([4,8]),'No active main campaign Threat state is established.');
  official('encounter.campaignLevelModel',{model:'STANDALONE_FINAL_BOSS',sourceBoundThingBattleLevels:['I'],heroesStartLevel:1,heroAndSkillLevelUp:'SHARDS'},
    'all Heroes start at Level 1; pick a Boss at random ... all its necessary components; Level Up with Shards',com([4,7,8]).concat(refs('COM-BATTLE',[4])),
    'Single standalone Boss setup and existing Level I print; no campaign-dependent Thing II/III cards synthesized.');
  official('encounter.RoomModel',{model:'DEDICATED_EXPANSION_BOSS_ROOM',physicalRoom:3,emblem:'CRYSTAL'},
    'Find the Thing’s Room ... room [crystal] 3',com([8]).concat(refs('COM-ROOM3',[2])),'Dedicated official tile; this does not create a campaign RoomStorage record.');
  official('encounter.TileModel',{file:'DD_COM_TILES_FRONT.pdf',page:2,room:3},'crystal emblem 3',refs('COM-ROOM3',[2]).concat(com([8])),'Tile identity bound by matching printed number/emblem and explicit Thing setup.');
  official('encounter.HeroEntryModel','ROOM3_PRINTED_HERO_STANCE_AREAS','Place each Hero’s miniature on the Area indicated, according to the Hero’s Stance',com([2,7,8]).concat(core([16]),refs('COM-ROOM3',[2])),
    'Expansion expressly adopts core Boss combat; Room 3 supplies Hero entry icons. Do not use Onslaught entry marker for Boss room.');
  official('encounter.BossPlacementModel','ROOM3_AREA_CORRESPONDING_TO_AGGRESSIVE_STANCE','its miniature in the corresponding Area on the board',com([8]).concat(refs('COM-ROOM3',[2])),
    'Explicit Thing instruction, independently bound to official Room 3.');
  official('encounter.startingStance','Aggressive','Place the Thing’s Card on the Aggressive Stance',com([8]),'Family-specific instruction, no inference from other Bosses.');
  official('encounter.initiativeModel',{bossInitiativeCards:2,shuffleInto:'INITIATIVE_DECK',coreCombat:true},'Shuffle two Initiative Cards for it into the Initiative Deck',com([7,8]),'Free Skill precedes the first turn; normal Boss initiative remains two cards.');
  official('encounter.victoryModel',{trigger:'THING_DEFEATED',endsFightImmediately:true,partyVictorious:true,summonsMustAlsoDie:false},
    'When The Thing From the Stars is defeated, the fight ends and party is victorious!',com([4,8]),'Explicit family-specific immediate ending; no extra kill-all-summons requirement.');
  official('encounter.campaignConsequence','STANDALONE_SESSION_RESULT_NO_MAIN_CAMPAIGN_PROGRESSION','This game mode is not part of the main campaign',standalone,'No main campaign defeatedBossFamilyIds or Quest progression applies.');
  official('encounter.questProgression','ONSLAUGHT_THEN_RESTING_THEN_BOSS_FIGHT_THEN_SESSION_RESULT','three phases ... party is victorious',standalone,'Standalone phase progression; not campaign Quest completion.');
  official('initiative.freeActionSeparateEntry',false,'Shuffle two Initiative Cards ... At the start of its first turn ... Skill for free',com([8]),'Two prescribed Boss Initiative entries include the first-turn free Skill; no third entry for that Skill.');
  official('physical.initiativeComponents',{borrowedCorePool:{heroCards:4,monsterCards:4},thingSetupCards:2},
    'Take the 8 Initiative Cards (4 Heroes and 4 Monsters); Shuffle two Initiative Cards for it',com([4,8]),'Printed core borrowing instruction and Thing setup; no TTS-object census.');
  official('physical.bossMiniature',{thingMiniatures:1},'Thing from the Stars [one miniature pictured/listed]',com([3]).concat(refs('COM-BOX',[2])),
    'Official miniature list has one Thing, and all listed miniatures sum to packaging total 26.');
  const aberration=read(root+'c1c38-crystalline-aberration-dependency.json').intake.cards.find((c:any)=>c.cardId===43107);
  official('aberration.productionDefinition',{kind:'SOURCE_DEFINITION_ONLY',cardId:43107,contentSet:'THE_COLOR_OF_MADNESS',printedLevel:'I',
    literal:aberration.frontLiteral,targetScope:'ALL_HEROES',targetCount:'ALL',selfTiming:'AFTER_ACTION_FINISHED',selfWounds:10,
    runtimeSerialization:'DEFERRED_UNAPPROVED',physicalSupply:'SOURCE_UNRESOLVED'},aberration.frontLiteral,
    refs('COM-MONSTERS',[8]).concat(com([2,3,7]),core([19,20,21,24])),
    'Source definition is complete: printed All Heroes covers all Heroes, not one Hero per Area; 10 self Wounds after action finishes. Missing printed stats remain PRINTED_ABSENT. Physical supply and save representation remain separate blockers. Sleeper Focus Point rules on p8 are not applied to Crystalline Aberration.');
  const crowded=fields.find(f=>f.id==='RETURN_TO_THE_STARS.crowdedAreaTie');
  Object.assign(crowded,{status:'PROJECT_RULING_REQUIRED',authority:'PROJECT_RULING',canonical:false,
    normalizedValue:null,contractExecutable:false,blocking:true,sourceReferences:core([24]).concat(com([8])),
    notes:'Reviewed core targeting prioritizes qualifying characters by Stance, but gives no explicit tie among equally Crowded Areas. COM Thing section supplies no Area tie override. Candidate only; unapproved in R1.'});
  const gapsNotes:Record<string,string>={
    'actor.unprintedResistanceDefaults':'Core p21 and Monster anatomy p24 define listed symbols, but no explicit omitted-symbol default; preserve absence without numeric zero.',
    'skills.returnExclusiveTrigger':'COM p8 corroborates the first-turn free trigger. Neither it nor the Ability proves exclusivity against every additional trigger; retain conservative contract.',
    'encounter.reward':'COM p6 grants two Shards per Monster kill. Thing defeat gives victory, but terminal reward/loot handling (including Room 3 chest markers) is not fully specified.',
    'encounter.escapeOrFailure':'COM p4 explicitly ends the session in defeat if a Hero dies. Full escape/retreat handling remains unspecified; no campaign retreat imported.',
    'encounter.cleanup':'COM p8 ends the fight on Thing defeat; destination/reuse of surviving summons, physical cards and tokens is not stated.',
    'physical.aberrationCopies':'COM p3 binds two miniature pieces shared across Levels; print pp8/18 bind one stat-card print slot per Level. Neither establishes two Level I physical combat copies nor simultaneous eligibility.',
    'aberration.physicalCopySupply':'Two Aberration miniatures and Level I/II stat prints are bound; how those pieces share Level-specific active copies and return supply remains unresolved.',
    'physical.otherMonsterCopies':'COM p3 binds finite miniature counts by named Monster. Which definitions Return can summon, and Level-specific card/miniature ownership remain unresolved.',
    'physical.specialTokens':'Rules p3 lists 44 Shards,22 Healing Crystals,8 Focus Point/Aberration,10 Curio,1 Light,14 Buff (=99). Box p2 says 33 Tokens; scope/count conflict remains open.',
  };
  for(const f of fields.filter(f=>f.status==='SOURCE_UNRESOLVED')){
    f.notes=gapsNotes[f.id]??'COM p8 names a Level I Aberration spawn; frozen official Ability requires as many Monsters as possible including at least one Aberration I. No rule explicitly closes other members, pool Levels, count/selection precedence, exhaustion, active-copy sharing, overflow or return destination. No silent source precedence or unrestricted pool.';
  }
  const former:any[]=predecessor.fields.filter((f:any)=>f.status==='SOURCE_UNRESOLVED');
  const transitions=former.map((old:any)=>{
    const f=fields.find(f=>f.id===old.id);
    return {id:f.id,previousStatus:old.status,newStatus:f.status,newSource:f.status==='OFFICIAL_SOURCE'?f.sourceReferences:[],
      sourcesReviewed:f.sourceReferences.concat(com([2,3,4,7,8])),reason:f.notes,canonical:f.canonical,executionRequired:f.executionRequired,blocking:f.blocking};
  });
  const summary={total:fields.length,official:fields.filter(f=>f.status==='OFFICIAL_SOURCE').length,
    sourceUnresolved:fields.filter(f=>f.status==='SOURCE_UNRESOLVED').length,projectRulingRequired:fields.filter(f=>f.status==='PROJECT_RULING_REQUIRED').length,projectRuling:0};
  const accounting={startingOfficial:86,startingSourceUnresolved:46,startingProjectRulingRequired:23,startingProjectRuling:0,final:summary,
    sourceFieldsClosed:transitions.filter(t=>t.newStatus==='OFFICIAL_SOURCE').length,sourceFieldsDeferredToUnapprovedRuling:1,executionIrrelevantFields:0};
  sources.find(s=>s.sourceId==='COM-ABILITY').fieldsSupported.push('ability.actionsPerRound','ability.trigger','ability.freeSkill','ability.consumesNormalAction','summon.minimumAberration');
  sources.find(s=>s.sourceId==='COM-BATTLE').fieldsSupported.push('actor.life','actor.dodge','actor.speed','actor.tags','actor.size','actor.resistances','actor.immunities','skills.table');
  const conflicts=[
    {id:'RETURN_SUMMON_SCOPE',authority:'OFFICIAL_SOURCE_CONTRACT_REVIEW_REQUIRED',canonicalResolution:false,
      sources:com([8]).concat(refs('COM-ABILITY',[4])),literals:['will spawn a Level 1 Crystalline Abberation','summon as many monsters as possible ... including at least one Crystalline Aberration I'],
      review:'Minimum I member is compatible; exhaustive pool/count and precedence are not resolved. Do not replace the frozen Ability quantifier or claim exactly one total spawn.',blocksPromotion:true},
    {id:'TOKEN_CENSUS_SCOPE',authority:'OFFICIAL_SOURCE_CONTRACT_REVIEW_REQUIRED',canonicalResolution:false,
      sources:com([3]).concat(refs('COM-BOX',[2])),literals:['44 + 22 + 8 + 10 + 1 + 14 tokens','33 Tokens'],
      review:'Record both publisher counts; do not choose a total or infinite supply.',blocksPromotion:true},
  ];
  const external=[
    {date:common.intakeDate,location:'https://mythicgames.net/',result:'Redirected to unrelated skilletruf.net gambling content; rejected. No official board-game file acquired.',authority:'NONE'},
    {date:common.intakeDate,location:'https://www.darkestdungeon.com/',result:'Domain-restricted search for publisher board-game/files yielded no usable official supplement. No download.',authority:'NONE'},
  ];
  const remaining=fields.filter(f=>f.status==='SOURCE_UNRESOLVED');
  const requests=[
    {sourceGroup:'THING_SUMMON_AND_SHARED_PHYSICAL_SUPPLY',blockedFields:remaining.filter(f=>f.id.startsWith('summon.')||f.id.startsWith('physical.')||f.id==='aberration.physicalCopySupply'||f.id==='aberration.otherPoolMembership').map(f=>f.id),
      officialSourceNeeded:'Official printed Thing summon-pool/setup/component sheet establishing eligible definitions and Levels, finite Level I copies, shared miniatures, selection/exhaustion, active-copy and return rules; an official printed source that resolves the rulebook/Ability summon wording and token census scope.',
      repositorySourcesAlreadyReviewed:['COM-RULES pp2–8','COM-ABILITY p4','COM-MONSTERS pp8,18','COM-BOX p2','core summoning p31','complete repository/archive inventory'],
      externalOfficialSourcesReviewed:external,whyProjectRulingCannotReplaceIt:'Missing eligible physical content and finite ownership supply cannot be invented as a digital choice.'},
    {sourceGroup:'STANDALONE_ENDING_ESCAPE_AND_REWARD',blockedFields:remaining.filter(f=>f.id.startsWith('encounter.')).map(f=>f.id),
      officialSourceNeeded:'Official printed standalone Boss Fight ending/retreat/reward/cleanup instructions for Thing Room 3, including chest markers and return destinations for surviving summons.',
      repositorySourcesAlreadyReviewed:['COM-RULES pp4,6,7,8','COM-ROOM3 p2','COM-BOX p2','core p16,24,31'],externalOfficialSourcesReviewed:external,
      whyProjectRulingCannotReplaceIt:'Victory trigger is closed, but physical rewards, escape and cleanup instructions cannot be substituted by campaign Boss architecture.'},
    {sourceGroup:'GENERIC_COMBAT_DEFAULTS_AND_TRIGGER_BOUNDARY',blockedFields:remaining.filter(f=>f.id.startsWith('actor.')||f.id.startsWith('skills.')).map(f=>f.id),
      officialSourceNeeded:'Official printed symbol-default rule and complete Thing trigger boundary (if such printed material exists). Keep exclusive trigger conservative unless officially established.',
      repositorySourcesAlreadyReviewed:['core pp19–24','COM-RULES p8','COM-ABILITY p4','COM-BATTLE p4'],externalOfficialSourcesReviewed:external,
      whyProjectRulingCannotReplaceIt:'R1 may document an unapproved digital candidate, but may not claim absence/default/exclusivity as an official rule.'},
  ];
  const select=(predicate:(f:any)=>boolean)=>fields.filter(predicate);
  const decision={...common,outcome:'THING_OFFICIAL_SOURCE_INTAKE_PARTIAL',sourceBlockersRemaining:summary.sourceUnresolved,
    sourceAcquisitionRequired:true,accounting,productionModelBound:false,encounterModel:'EXPANSION_SPECIAL_ENCOUNTER',
    digitalRulingClosureAuthorized:false,C1C38R2Allowed:false,requiredNext:'Obtain remaining official summon/supply and end-of-session instructions; contract review must resolve source scope discrepancies before affected promotion.',
    acceptedProjectRulings:[],gateAFailureReason:'Remaining canonical physical/source blockers plus 24 unapproved digital fields. R1 never authorizes gameplay.'};
  return {
    'historical-c1c38-freeze':{...common,phase:'C1C38',commit:C1C38R1_BASELINE,outcome:'THING_SOURCE_CLOSURE_BLOCKED',freezeScope:'ALL_COMMITTED_C1C38_ARTIFACTS_SOURCE_ASSETS_SCRIPTS_TESTS_AND_REPORTS_BYTE_FOR_BYTE'},
    'official-source-intake-manifest':{...common,sources,externalSourcesReviewed:external,externalFilesAcquired:[],
      visualReviewReceipt:{path:assets+'official-visual-review.json',sha256:hash(assets+'official-visual-review.json')},
      policyApplication:'User C1C38R1 explicitly authorizes additional official print intake; frozen policy JSON is unchanged.',
      discoveryInventory:{path:assets+'repository-source-inventory.json',sha256:hash(assets+'repository-source-inventory.json'),
        archiveFiles:inventory.archiveFiles.length,archivePDFs:243,archivePDFPages:4334,previouslyUnindexedPDFs:219,repositoryMedia:inventory.repositoryMedia.length,
        repositorySourceMetadata:inventory.repositorySourceMetadata.length,
        visualReviewScope:'COM rules all eight pages; Room 3; packaging p2; Aberration I/II; Thing Identity/Ability/Battle; core combat pages16,19,20,21,24,31; Eldritch skills I–III. Other archive text hits are discovery only.',
        noTextHitIsNotAbsenceProof:true},applicabilityExpansionIsPerField:true},
    'thing-special-combat-source-closure':{...common,fields:select(f=>f.id.startsWith('actor.')||f.id.startsWith('skills.')||f.id==='initiative.freeActionSeparateEntry'||f.id==='RETURN_TO_THE_STARS.crowdedAreaTie'),
      newRulingCandidates:[{candidateId:'C1C38R2-CROWDED-AREA-TIE',fieldId:crowded.id,approved:false,canonical:false,version:null,chosenBehavior:null}],
      originalDigitalCandidatesUnchanged:true},
    'thing-encounter-source-closure':{...common,fields:select(f=>f.id.startsWith('encounter.')),encounterModel:'EXPANSION_SPECIAL_ENCOUNTER',
      contentSet:'THE_COLOR_OF_MADNESS',mainCampaignApplicable:false,synthesizedLevels:[],sourceBoundBattleLevels:['I'],
      failureFact:{heroDeath:'SESSION_DEFEAT',sources:com([4])},rewardFact:{monsterKillShards:2,sources:com([6]),scope:'Generic kill reward; terminal reward/loot remains unresolved.'}},
    'return-to-stars-source-closure':{...common,fields:select(f=>f.id.startsWith('summon.')||f.id.startsWith('posture.')||f.id.startsWith('RETURN_TO_THE_STARS.')||f.id.startsWith('ability.')||f.id.startsWith('initiative.')),
      frozenSelfWounds:5,frozenTargetStress:2,eligiblePool:'SOURCE_UNRESOLVED',countAlgorithm:'SOURCE_UNRESOLVED',conflicts:[conflicts[0]],contractRulingReview:'REQUIRED_STOP_AFFECTED_PROMOTION'},
    'crystalline-aberration-source-closure':{...common,fields:select(f=>f.id.startsWith('aberration.')),sourceDefinition:fields.find(f=>f.id==='aberration.productionDefinition').normalizedValue,
      productionRegistered:false,allHeroesScope:'ALL_HEROES_NOT_ONE_PER_AREA',delayedSelfEffect:{wounds:10,timing:'AFTER_ACTION_FINISHED',saveCursor:'DEFERRED_UNAPPROVED'},
      levelIIDoesNotCreateThingLevelII:true,miniatureCountIsNotLevelICopyCount:true},
    'physical-component-census':{...common,fields:select(f=>f.category==='PHYSICAL_SUPPLY'),
      officialMiniatureList:{crystallineAberration:2,plowHorse:2,frozenFarmhand:2,farmhand:4,foreman:4,scarecrow:4,sleepersHerald:4,sleepersDream:1,miller:1,sleeper:1,thing:1,total:26,sources:com([3]).concat(refs('COM-BOX',[2]))},
      aberrationCardPrintSlots:{levelI:1,levelII:1,source:refs('COM-MONSTERS',[8,18]),authority:'OFFICIAL_PRINTED_DEFINITIONS_ONLY',levelICopySupply:'SOURCE_UNRESOLVED'},
      rulebookTokenList:{shards:44,healingCrystals:22,focusPointAberration:8,curio:10,light:1,buff:14,total:99,sources:com([3])},
      boxTokenTotal:33,conflicts:[conflicts[1]],transportObjectCountsAccepted:false,infiniteSupplyAllowed:false},
    'thing-executable-field-matrix':{...common,fields,transitions,summary,accounting},
    'source-gap-register':{...common,gaps:remaining.map(f=>({id:f.id,status:f.status,canonical:false,executionRequired:f.executionRequired,blocking:f.blocking,reason:f.notes})),
      conflicts,unapprovedDigitalFields:fields.filter(f=>f.status==='PROJECT_RULING_REQUIRED').map(f=>f.id),sourceBlockersRemaining:summary.sourceUnresolved},
    'missing-official-source-request':{...common,requests,sourceAcquisitionRequired:true,exactDocumentTitlesNotInvented:true,unresolvedFieldCoverage:remaining.map(f=>f.id)},
    'source-intake-decision':decision,
    'next-workstream-decision':{...decision,next:'CONTINUE_OFFICIAL_SOURCE_INTAKE_AND_CONTRACT_REVIEW',C1C39:'BLOCKED',C1C38R2:'NOT_AUTHORIZED_WHILE_PHYSICAL_CONTENT_UNRESOLVED'},
  };
}

export function validateC1C38R1Artifacts(outputs:Record<string,any>):void{
  const expected=buildC1C38R1Artifacts();
  assert(Object.keys(outputs).sort().join()===Object.keys(expected).sort().join(),'complete artifact set');
  for(const [name,value] of Object.entries(expected))assert(JSON.stringify(outputs[name])===JSON.stringify(value),'evidence/contract drift '+name);
  const matrix=outputs['thing-executable-field-matrix'];
  const original=read(root+'c1c38-thing-executable-field-matrix.json');
  assert(matrix.fields.length===155 && new Set(matrix.fields.map((f:any)=>f.id)).size===155,'155 unique original fields');
  assert(matrix.transitions.length===46,'all 46 former source blockers accounted');
  for(const f of matrix.fields){
    const old=original.fields.find((o:any)=>o.id===f.id);assert(old,'no new/disappeared field');
    if(old.status!=='SOURCE_UNRESOLVED')assert(JSON.stringify(f)===JSON.stringify(old),'frozen official/digital field '+f.id);
    assert(f.canonical===(f.status==='OFFICIAL_SOURCE'),'canonical classification');
    assert(f.blocking===(f.executionRequired&&!f.contractExecutable),'blocking calculation');
    if(f.canonical){assert(f.sourceReferences.length,'official reference '+f.id);for(const r of f.sourceReferences)assert(hash(r.path)===r.sha256,'source hash '+r.path);}
    else assert(f.normalizedValue===null&&!f.contractExecutable,'no guessed missing behavior '+f.id);
  }
  const counts=matrix.summary;
  assert(counts.official+counts.sourceUnresolved+counts.projectRulingRequired+counts.projectRuling===155&&counts.projectRuling===0,'status conservation / no approvals');
  const candidates=outputs['thing-special-combat-source-closure'].newRulingCandidates;
  assert(candidates.every((c:any)=>!c.approved&&!c.canonical&&c.chosenBehavior===null),'new tie candidate unapproved');
  assert(!productionBossFamilyRegistry.has('thing-from-the-stars'),'no Thing registry promotion');
  assert(!productionBossCapabilities.some(c=>c.familyId==='thing-from-the-stars'),'no Thing capability promotion');
  assert(!productionBossPlayerRouteEnabled('thing-from-the-stars',common.contractVersion),'player route false');
  const covered=outputs['missing-official-source-request'].requests.flatMap((r:any)=>r.blockedFields).sort();
  assert(covered.join()===matrix.fields.filter((f:any)=>f.status==='SOURCE_UNRESOLVED').map((f:any)=>f.id).sort().join(),'exact grouped missing-source coverage');
  for(const source of outputs['official-source-intake-manifest'].sources)assert(hash(source.path)===source.sha256,'intake PDF hash');
}

export function verifyC1C38R1(){
  verifyHistoricalBaseline('c1c38');verifyHistoricalBaseline('c1c37');
  const names=readdirSync(root).filter(n=>n.startsWith('c1c38r1-')&&n.endsWith('.json'));
  const outputs=Object.fromEntries(names.map(n=>[n.slice(8,-5),read(root+n)]));
  validateC1C38R1Artifacts(outputs);
  assert(verifyHistoricalArtifacts('c1c38')>0,'frozen evidence exists');
  execFileSync('git',['diff','--exit-code',C1C38R1_BASELINE,'--','src/game-engine','src/data','src/types','src/components','src/pages'],{stdio:'pipe'});
  const workflow=readFileSync('.github/workflows/release-gate.yml','utf8');
  assert(workflow.includes('npm run verify:complete-edition-c1c38r1'),'Production release gate step');
  console.log('C1C38R1: PASS; '+outputs['source-intake-decision'].outcome+'; '+JSON.stringify(outputs['thing-executable-field-matrix'].summary)+'; Gate A false; runtime unauthorized.');
}
if(process.argv.includes('--write')){
  const outputs=buildC1C38R1Artifacts();validateC1C38R1Artifacts(outputs);
  for(const [name,value] of Object.entries(outputs))writeFileSync(root+'c1c38r1-'+name+'.json',JSON.stringify(value,null,2)+'\n');
  console.log('C1C38R1 official-source successor artifacts written.');
}
if(process.argv.includes('--verify'))verifyC1C38R1();
