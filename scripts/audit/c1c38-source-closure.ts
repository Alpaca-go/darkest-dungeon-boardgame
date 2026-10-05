/** Source-only Gate A assessment. This module is never imported by production. */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, existsSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {verifyHistoricalBaseline} from './historical-baseline';
import {productionBossFamilyRegistry} from '../../src/game-engine/bosses/definitions';
import {productionBossCapabilities, productionBossPlayerRouteEnabled} from '../../src/game-engine/bosses/production-capabilities';

export const C1C38_BASELINE = '3ea7854b33dbfaf6dcbd85e3fb5bf86ffc55b0d3';
const root = 'docs/data/complete-edition/';
const assets = root+'source-assets/c1c38/';
const read = (name: string) => JSON.parse(readFileSync(root+name+'.json','utf8').replace(/^\uFEFF/,''));
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const assert = (ok: unknown, message: string) => {if (!ok) throw new Error('C1C38: '+message);};
type Status = 'OFFICIAL_SOURCE' | 'SOURCE_UNRESOLVED' | 'PROJECT_RULING_REQUIRED' | 'PROJECT_RULING';
type Ref = {path: string; sha256: string; side?: string; page?: number; location?: string; authority: string; applicability?: string};
export interface Field {
  id: string; category: string; status: Status; authority: string; canonical: boolean;
  sourceReferences: Ref[]; literal: unknown; normalizedValue: unknown;
  executionRequired: boolean; contractExecutable: boolean; blocking: boolean; notes: string;
}
const common = {schemaVersion:1,phase:'11A.4-C1C38',policyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',
  contractVersion:'C1C38-THING-SOURCE-CONTRACT-v1',baseline:C1C38_BASELINE,
  runtimeImplemented:false,productionReady:false,playerRouteEnabled:false};

export function buildC1C38Artifacts(): Record<string, any> {
  const cards = read('c1c24-boss-printed-definitions').cards.filter((c:any)=>c.family==='Thing from the stars');
  assert(cards.length===3,'exact selected physical cards');
  const refs = (id: number): Ref[] => cards.find((c:any)=>c.cardId===id).sourceReferences.map((r:any)=>{
    assert(hash(r.path)===r.cropSha256,'locked card hash '+r.path);
    return {path:r.path,sha256:r.cropSha256,side:r.side,authority:'OFFICIAL_PRINTED_COMPONENT'};
  });
  const A=refs(41903), B=refs(43703), I=refs(41902);
  const discovery=read('source-assets/c1c38/locked-corpus-discovery');
  assert(hash(discovery.lockedManifest)===discovery.lockedManifestSha256,'locked manifest binding');
  const manifest=read('c1c32r2-local-official-source-manifest');
  assert(discovery.files.length===manifest.files.length+1,'complete locked corpus');
  for(const entry of manifest.files)assert(discovery.files.some((f:any)=>f.relativePath===entry.relativePath&&f.sha256===entry.sha256),'corpus PDF binding');
  const review=read('source-assets/c1c38/visual-review');
  const pages = (numbers: number[]): Ref[] => numbers.map(page=>{
    const record=review.rulebookPages.find((p:any)=>p.page===page);
    assert(record && hash(record.path)===record.sha256,'reviewed page binding '+page);
    assert(record.pdfSha256===discovery.files[21].sha256&&record.pdfRelativePath===discovery.files[21].relativePath,'original rulebook page provenance');
    return {...record,authority:'OFFICIAL_RULEBOOK',applicability:'SHARED_LEGEND_OR_RULE_ONLY; DOES_NOT_ESTABLISH_THING_ENCOUNTER_ELIGIBILITY'};
  });
  const fields: Field[] = [];
  const field=(id:string,category:string,status:Status,value:unknown,literal:unknown,sourceReferences:Ref[],notes='',required=true): Field=>{
    const canonical=status==='OFFICIAL_SOURCE';
    const row={id,category,status,authority:canonical?'OFFICIAL_SOURCE':status==='SOURCE_UNRESOLVED'?'NONE':'PROJECT_RULING',canonical,
      sourceReferences,literal,normalizedValue:value,executionRequired:required,
      contractExecutable:canonical,blocking:required&&!canonical,notes};
    fields.push(row);return row;
  };
  const official=(id:string,category:string,value:unknown,literal:unknown,r:Ref[],notes='',required=true)=>field(id,category,'OFFICIAL_SOURCE',value,literal,r,notes,required);
  const unknown=(id:string,category:string,notes:string,r:Ref[]=[],literal:unknown=null)=>field(id,category,'SOURCE_UNRESOLVED',null,literal,r,notes);
  const digital=(id:string,category:string,notes:string)=>field(id,category,'PROJECT_RULING_REQUIRED',null,null,[],notes);
  const group=(category:string)=>fields.filter(f=>f.category===category);

  for(const c of cards) official(`identity.${c.cardId}`,'IDENTITY',{
    definitionId:c.definitionId,cardId:c.cardId,subtype:c.subtype,printedName:c.printedName,
    printedLevel:c.printedLevel.status==='PRINTED_ABSENT'?null:c.printedLevel.value,
    printedLevelStatus:c.printedLevel.status},c.backLiteral,refs(c.cardId),
    'Physical transport identity is a locator only. Missing Roman Level is not borrowed from another card.');
  const transcript=read('source-assets/c1c38/battle-visual-transcription');
  const literal={...common,definitionId:'ce-boss-43703-0cd9e0',cardId:43703,
    authority:'OFFICIAL_PRINTED_COMPONENT',sourceImages:B,sourceHashes:Object.fromEntries(B.map(r=>[r.path,r.sha256])),
    frontLiteral:transcript.frontLiteral,backLiteral:'BOSS\n[LEVEL:I]',
    fieldTranscription:transcript.fields,confidencePerField:Object.fromEntries(transcript.fields.map((f:any)=>[f.id,f.confidence])),
    visualReviewStatus:'FRONT_AND_BACK_DIRECTLY_REVIEWED',ocrAssistanceUsed:false,
    literalStatus:'LITERAL_COMPLETE',semanticNormalization:false,
    absencePolicy:'PRINTED_ABSENT is a literal observation, never a numeric zero or synthesized value.'};
  official('ability.actionsPerRound','ACTION_SCHEDULER',2,'ACTIONS / Round: 2',A);
  official('ability.trigger','ACTION_SCHEDULER','BEFORE_FIRST_NORMAL_ACTION','Before its first action of each round',A);
  official('ability.frequency','ACTION_SCHEDULER','ONCE_PER_ROUND','Before its first action of each round',A);
  official('ability.freeSkill','ACTION_SCHEDULER',3,'[SKILL_NUMBER:3] Return to the Stars',A);
  official('ability.consumesNormalAction','ACTION_SCHEDULER',false,'as a free action',A);
  digital('scheduler.interruptionAndResume','ACTION_SCHEDULER','Version a free-action cursor before normal action #1; no resumed-array-order default.');
  digital('scheduler.reactionDeathOrdering','ACTION_SCHEDULER','Preserve reaction windows and a death/victory checkpoint after self effects; simultaneous ties need review.');
  official('actor.life','ACTOR_STATS',130,'130 inside orange Life frame',B.concat(pages([24])));
  official('actor.dodge','ACTOR_STATS',2,'2 over yellow Dodge glyph',B.concat(pages([19,24])));
  official('actor.speed','ACTOR_STATS',2,'two blue footprint squares',B.concat(pages([24])));
  official('actor.tags','ACTOR_TAGS',['Eldritch'],'Eldritch - Large',B.concat(pages([24])));
  official('actor.size','ACTOR_STATS','Large','Eldritch - Large',B);
  official('actor.areaFootprint','ACTOR_STATS',2,'large-sized monsters take up two spaces in an Area',B.concat(pages([24])),
    'Bound to the reviewed locked print-rulebook p24; not inherited from Prophet.');
  official('actor.postureFootprint','MONSTER_POSTURE',2,'Large Monsters occupy two slots on the Stance Tracker',B.concat(pages([17])));
  official('actor.resistances','ACTOR_STATS',['Blight','Debuff'],'green dotted drop; orange double down-chevron',B.concat(pages([21])));
  official('actor.immunities','ACTOR_STATS',['Stun'],'three yellow diamonds',B.concat(pages([21])));
  official('actor.resistanceSemantics','ACTOR_STATS','REDUCE_PRINTED_CONDITION_DURATION_BY_ONE_TURN','Resistances',pages([21]));
  official('actor.immunitySemantics','ACTOR_STATS','NEGATE_MATCHING_CONDITION','Immunities',pages([21]));
  unknown('actor.eldritchTagGameplay','ACTOR_TAGS','Printed Eldritch identity is bound; encounter-specific tag interactions cannot be borrowed from videogame or other Bosses.',B);
  unknown('actor.unprintedResistanceDefaults','ACTOR_STATS','No numeric zero is synthesized for absent resistance fields; any future adapter must model listed conditions.',B);
  official('skills.table','SKILL_TABLE',[{rollMin:1,rollMax:5,skill:1},{rollMin:6,rollMax:10,skill:2}],
    '[1] 1-5; [2] 6-10',B.concat(pages([21,24])));
  official('skills.normalReturnToStarsEntry','SKILL_TABLE',false,'Printed normal table contains only 1 and 2',B);
  official('skills.normalEligibleStances','STANCE',['Aggressive','Defensive','Ranged','Support'],
    'four colored Monster Stance panels, one shared 1/2 roll table; right-hand panels gray',B.concat(pages([12,24])),
    'Eligibility icons do not specify starting placement.');
  unknown('skills.returnExclusiveTrigger','SKILL_TABLE','Not in the printed normal table; absence does not prove no other encounter-specific trigger exists.',A.concat(B));
  const skill=(name:string,category:string,number:number,values:number[],target:string,count:number,range:number)=>{
    official(`${category}.name`,category,name,name,B);
    official(`${category}.number`,category,number,number,B);
    for(const [index,key] of ['crit','criticalDamage','accuracy','damage'].entries())official(`${category}.${key}`,category,values[index],values[index],B.concat(pages([19,20])));
    official(`${category}.range`,category,range,'curved Range arrow '+range,B.concat(pages([19])));
    official(`${category}.targetSide`,category,'HERO','yellow Hero head glyph',B.concat(pages([19])));
    official(`${category}.targetPriority`,category,target,target,B.concat(pages([24])));
    official(`${category}.targetCount`,category,count,`${count} yellow Hero head glyph(s)`,B.concat(pages([19])));
    official(`${category}.rollRange`,category,number===1?[1,5]:[6,10],number===1?'1-5':'6-10',B);
    official(`${category}.movement`,category,{maxAreas:2,rule:'MOVE_TO_EXACT_SKILL_RANGE_OR_SKIP_REST_OF_TURN'},
      'Speed; Check Range',B.concat(pages([24])));
    official(`${category}.targetTie`,category,'STANCE_PRIORITY_AGGRESSIVE_TO_SUPPORT','prioritize by Stance',pages([19,24]));
    official(`${category}.effectPhases`,category,['ROLL_IF_PRINTED','SELF_EFFECTS','DAMAGE','TARGET_EFFECTS'],
      'Self Effects before any other effects; Target Effects after any other effects',pages([19,20]));
  };
  skill('Vorpal Strike','VORPAL_STRIKE',1,[2,16,11,11],'Closest',1,1);
  skill('Weakening Shard','WEAKENING_SHARD',2,[2,4,11,2],'Furthest',1,2);
  official('VORPAL_STRIKE.glyphEffects','VORPAL_STRIKE',[{effect:'Stress',amount:2,phase:'TARGET'}],
    'target-effect arrow, Stress +2',B.concat(pages([20,21])));
  official('VORPAL_STRIKE.duration','VORPAL_STRIKE','PRINTED_ABSENT','no duration printed for Stress',B);
  official('WEAKENING_SHARD.glyphEffects','WEAKENING_SHARD',[
    {effect:'Stun',turns:2},{effect:'Blight',amount:4,turns:2},{effect:'Stress',amount:1},{effect:'Debuff',turns:3}],
    'target arrow: [yellow diamonds] 2t, 4[green drop] 2t, [Stress]+1, [orange down-chevron]3t',B.concat(pages([20,21])));
  official('WEAKENING_SHARD.duration','WEAKENING_SHARD',{stun:2,blight:2,debuff:3},'2t; 2t; 3t',B.concat(pages([20,21])));
  digital('WEAKENING_SHARD.samePhaseSerialization','EFFECT_ORDER','Printed target effects share a phase; version replay serialization without inventing additional attacks.');
  const R='RETURN_TO_THE_STARS';
  official(`${R}.name`,R,'Return to the Stars','Return to the Stars',B);
  official(`${R}.number`,R,3,3,B.concat(A));
  official(`${R}.timing`,R,'BEFORE_FIRST_NORMAL_ACTION_EACH_ROUND','as a free action',A);
  for(const key of ['crit','criticalDamage','accuracy','damage'])official(`${R}.${key}Printed`,R,'PRINTED_ABSENT',
    `No ${key} stat line printed for skill 3`,B,'Absence is not zero; the Self 5 wound glyph is a separate effect.');
  official(`${R}.accuracyRoll`,R,'NO_ROLL_WHEN_NO_ACC_PRINTED','If a Skill has no Acc value, then no roll is required',B.concat(pages([19])));
  official(`${R}.range`,R,2,'curved arrow 2',B.concat(pages([19])));
  official(`${R}.targetSide`,R,'HERO','yellow Hero head glyphs',B.concat(pages([19])));
  official(`${R}.targetScope`,R,'CROWDED_AREA','Crowded',B.concat(pages([24])));
  official(`${R}.targetCount`,R,4,'four yellow Hero head glyphs',B.concat(pages([19])));
  official(`${R}.printedGlyphs`,R,['SELF_ARROW','WOUND_TOKEN','BLIGHT','BLEED','TARGET_ARROW','STRESS','SUMMON'],
    'Self 5[wound], remove [green drop][red drop]; target [Stress]+2, [skull/red down-arrow]',B);
  official(`${R}.selfWounds`,R,5,'Self 5[wound token]',B.concat(pages([19,20])),
    'Five Wounds on self; not Heal 5, not Attack Damage 5. Separate effect from absent attack Damage line.');
  official(`${R}.removeConditions`,R,['ALL_BLIGHT_STACKS','ALL_BLEED_STACKS'],
    'remove [green drop][red drop]',B.concat(pages([21])));
  official(`${R}.stress`,R,2,'target arrow [Stress]+2',B.concat(pages([20,21])));
  official(`${R}.duration`,R,'PRINTED_ABSENT','no t duration in Skill 3',B);
  official(`${R}.movement`,R,{maxAreas:2,rule:'MOVE_TO_EXACT_RANGE_OR_SKIP_REST_OF_TURN'},'Range 2; two Speed squares',B.concat(pages([24])));
  official(`${R}.summonClause`,R,cards.find((c:any)=>c.cardId===41903).frontLiteral,
    'summon as many monsters as possible if the Monster Posture track is not full, including at least one Crystalline Aberration I',A);
  official(`${R}.effectPhases`,R,['SELF_EFFECTS_BEFORE_OTHER_EFFECTS','TARGET_EFFECTS_LAST'],
    'Self Effects; Target Effects',B.concat(pages([20])));
  digital(`${R}.samePhaseSerialization`,'EFFECT_ORDER','Version the order of self Wounds/removal and target Stress/summon, including self-death interruption; shared phase rules alone do not decide all cursor behavior.');
  unknown(`${R}.crowdedAreaTie`,'TARGETING','Core p24 gives Stance priority for qualifying characters; equal Crowded Areas require a reviewed encounter target rule or digital candidate policy.',pages([24]));

  const encounterIds: Record<string,string> = {
    contentSet:'CONTENT_ELIGIBILITY',campaignEligibility:'CONTENT_ELIGIBILITY',questEligibility:'CONTENT_ELIGIBILITY',
    encounterType:'ENCOUNTER_MODEL',FaceTheThreatApplicable:'ENCOUNTER_MODEL',ThreatModel:'ENCOUNTER_MODEL',
    campaignLevelModel:'CAMPAIGN_MODEL',RoomModel:'ROOM_TILE',TileModel:'ROOM_TILE',HeroEntryModel:'PLACEMENT',
    BossPlacementModel:'PLACEMENT',startingStance:'STANCE',initiativeModel:'INITIATIVE',victoryModel:'VICTORY',
    campaignConsequence:'CAMPAIGN_MODEL',questProgression:'CAMPAIGN_MODEL',reward:'REWARD',escapeOrFailure:'VICTORY',cleanup:'CLEANUP'};
  for(const [id,category] of Object.entries(encounterIds))unknown(`encounter.${id}`,category,
    'No reviewed locked official clause binds this family-specific model. Core Boss examples, flavor wander, crystal emblem and transport grouping do not establish applicability.',
    (id==='contentSet'?B:pages([16,25,30,31])).concat(I));
  official('posture.capacity','MONSTER_POSTURE',4,'four Stance slots',pages([12,17]));
  official('posture.distinctFromArea','MONSTER_POSTURE',true,'Stance Tracker slots vs Areas on Room Tile',pages([17,24,31]));
  official('summon.minimumAberration','SUMMON_POOL',1,'including at least one Crystalline Aberration I',A,
    'Conditional on Monster Posture track not being full; no guarantee is invented when physical supply is exhausted.');
  official('summon.minimumCondition','SUMMON_POOL','TRACK_NOT_FULL','if the Monster Posture track is not full',A);
  official('summon.genericFullTrack','MONSTER_POSTURE','SUMMON_IGNORED','the invocation is ignored if the track is already full',pages([31]),
    'Shared printed rule only. Other Skill 3 self/Stress effects are not canceled by this clause.');
  official('summon.genericPlacement','PLACEMENT','FIRST_EMPTY_STANCE_AND_CORRESPONDING_TILE_AREA_UNLESS_OVERRIDDEN',
    'first empty Stance Slot; corresponding Area; unless the Boss specifies otherwise',pages([31]),
    'Source-bound shared rule, but actual Tile/Area identity and any special override remain unresolved.');
  official('summon.genericInitiative','INITIATIVE','SHUFFLE_CARD_INTO_REMAINING_DECK_CAN_ACT_THIS_ROUND',
    'shuffle an Initiative Card for the Monster into the Initiative Deck; act during the round',pages([31]));
  official('initiative.genericMultipleActions','INITIATIVE','INITIATIVE_CARDS_EQUAL_ACTIONS_PER_ROUND',
    'check how many actions/round the Boss has and add that many Monster Initiative Cards',pages([30]),
    'Shared rule only; final Thing initiative setup must be confirmed by its encounter rules.');
  unknown('initiative.freeActionSeparateEntry','INITIATIVE','The Ability binds a free action before action #1; no encounter-specific component instruction establishes a separate initiative card.',A.concat(pages([30])));
  official('summon.genericAreaDisplacement','PLACEMENT',{
    hero:'nearest available Area',monstersOnly:'players choose one to move to nearest available Area'},
    'Monster Summoning displacement',pages([31]),'Not a Necromancer overflow ruling. Missing Thing Tile prevents execution.');
  for(const id of ['eligiblePool','otherEligibleMonsters','poolLevel','duplicateDefinitions','countAlgorithm','mandatoryAberrationSelection',
    'exactlyOneVacancy','multipleVacancies','noAberrationSupply','alreadyPresentAberration','multipleAberrationCopies','priorityAndOverflow',
    'activeCopiesReduceSupply','copyReturnDestination'])unknown(`summon.${id}`,'SUMMON_POOL',
      'Ability quantifier plus generic p31 cannot establish eligible physical pool/copies or special supply priority.',A.concat(pages([31])));
  for(const id of ['aberrationCopies','otherMonsterCopies','initiativeComponents','specialTokens','bossMiniature'])unknown(`physical.${id}`,'PHYSICAL_SUPPLY',
    'No official component census binds finite production supply. TTS object counts are transport inventory only.');
  digital('physical.ownershipLedger','PHYSICAL_SUPPLY','After source supply is bound, record unique physical IDs, duplicate rejection and return transactions.');
  const aberration=read('source-assets/c1c38/aberration-intake');
  official('aberration.requiredPrintedLevel','CRYSTALLINE_ABERRATION','I','Crystalline Aberration I',A);
  official('aberration.levelICardLiteral','CRYSTALLINE_ABERRATION',aberration.cards[0],
    aberration.cards[0].frontLiteral,aberration.cards[0].sourceReferences);
  unknown('aberration.productionDefinition','CRYSTALLINE_ABERRATION',
    'Level I literal is available. No executable definition exists; whole-table All Heroes scope, delayed self-death, content set and supply need contract closure.',aberration.cards[0].sourceReferences);
  unknown('aberration.physicalCopySupply','PHYSICAL_SUPPLY','Two transport card records with printed Levels I/II do not prove official Level I copy or figure counts.');
  official('aberration.minimumEligibleMembership','CRYSTALLINE_ABERRATION',true,'including at least one Crystalline Aberration I',A);
  unknown('aberration.otherPoolMembership','CRYSTALLINE_ABERRATION','At-least-one clause binds this required member, not the remaining summon pool.');
  for(const id of ['round','normalActionOrdinal','freeActionPending','summonTransaction','summonCursor','candidatePhysicalCopies',
    'selectedCopies','placementCursor','postureOccupancy','pendingTargetSelection','pendingAttack','rngCheckpoint','causalEvents','encounterLifecycle',
    'rulingVersion','staleChoiceRejection','reloadBehavior','transactionIdentity'])digital(`save.${id}`,'SAVE_REPLAY',
      'Future production persistence proposal only; preserve PendingChoice candidates, causal IDs, stored rolls and versioned execution dependencies.');

  const glyphs=[
    ['dodge','yellow silhouette square','DODGE',[19,24]],['speed','blue footprint square repeated twice','SPEED',[24]],
    ['life','orange Life frame','LIFE',[24]],['range','curved arrow','EXACT_AREA_RANGE',[19]],
    ['hero-target','yellow head repeated 1/1/4','HERO_TARGET_COUNT',[19]],['damage','red bolt','ATTACK_DAMAGE_OR_CRITICAL_DAMAGE',[19,20]],
    ['self-arrow','bent arrow above Self','SELF_EFFECTS_BEFORE_OTHER_EFFECTS',[20]],
    ['target-arrow','bent arrow preceding effect list','TARGET_EFFECTS_AFTER_OTHER_EFFECTS',[20]],
    ['wound','orange outline black heart token','WOUND_TOKEN',[19,20]],['stress','black arch/white stress face','STRESS',[21]],
    ['blight','green dotted drop','BLIGHT',[21]],['bleed','red drop','BLEED',[21]],['stun','three yellow diamonds','STUN',[21]],
    ['debuff','orange double downward chevron','DEBUFF',[21]],['summon','white skull on red downward arrow','SUMMON',[31]],
    ['aggressive','red crossed blades','AGGRESSIVE_STANCE',[12]],['defensive','red shield','DEFENSIVE_STANCE',[12]],
    ['ranged','red diagonal slashes','RANGED_STANCE',[12]],['support','red banner','SUPPORT_STANCE',[12]],
    ['turn-duration','t suffix','TURN_DURATION_STACKS',[20,21]],
  ].map(([id,literal,semantic,ps])=>({id,literal,status:'OFFICIAL_SOURCE',canonical:true,
    normalizedSemantic:semantic,sourceReferences:B.concat(pages(ps as number[])),
    engineDurationRepresentation:'Separate future execution representation; printed t remains per-condition stack.'}));
  glyphs.push({id:'crystal-emblem',literal:'teal crystal banner',status:'SOURCE_UNRESOLVED',canonical:false,
    normalizedSemantic:null as any,sourceReferences:B,engineDurationRepresentation:'Not a duration; no official content-set legend found.'});

  const candidateRows=fields.filter(f=>f.status==='PROJECT_RULING_REQUIRED').map(f=>({
    candidateId:'C1C38-DIGITAL-CANDIDATE-v1:'+f.id,fieldId:f.id,canonical:false,status:'PROJECT_RULING_REQUIRED',
    sourceGap:f.notes,whySourceCannotDecide:'Printed physical game rules do not specify digital persistence/serialization.',
    proposedExecutionBehavior:f.id.startsWith('save.')?'Persist immutable cursor/candidates/event parent/version and resume once.':'Explicit causal checkpoints and source-appropriate choice candidates.',
    alternatives:['versioned explicit PendingChoice when source leaves player choice','versioned deterministic serialization preserving printed phases'],
    effectsOnDeterminism:'No array-order or RNG reroll default.',saveReplayImplication:'Same pending candidates, roll, physical ownership and event parent survive reload.',
    compatibilityRisk:'Keep C1C28/C1C31 and Prophet ruling sets unchanged; no copied family ruling.',needsApproval:true,approved:false}));
  const reuseItems: Array<[string,string,string,string]>=[
    ['BattleState','src/types/index.ts','REUSE_AS_IS','Shared state envelope; new fields need explicit versioned extension.'],
    ['Actor','src/types/index.ts','REUSE_AS_IS','BattleUnit identity and damage state.'],
    ['damage','src/game-engine/damage.ts','REUSE_AS_IS','Shared damage once source-bound skill semantics are closed.'],
    ['Hero Dodge','src/game-engine/rules/hero-dodge.ts','REUSE_AS_IS','Dependency selection must be explicit; do not equate Boss version with Hero Dodge.'],
    ['reaction windows','src/game-engine/bosses/foundation.ts','REQUIRES_GENERALIZATION','Retain shared hooks; existing execution dispatch contains Necromancer summon semantics.'],
    ['conditions','src/game-engine/ruins/condition-runtime.ts','REUSE_AS_IS','Printed condition stack primitives; source duration differs from save cursor.'],
    ['initiative','src/game-engine/initiative.ts','REQUIRES_GENERALIZATION','Simple generic order is not multiple-actions Boss activation; review shared Boss ordering.'],
    ['seeded RNG','src/game-engine/runtime-sources.ts','REUSE_AS_IS','Saved seed/checkpoint and deterministic draw helpers.'],
    ['PendingChoice','src/types/boss-runtime.ts','REQUIRES_GENERALIZATION','Preserve existing candidate/causal/version shape; add summon-copy and free-action continuations.'],
    ['physical ownership','src/game-engine/ruins/physical-supply.ts','REQUIRES_GENERALIZATION','Existing finite ledger is Necromancer/bone-specific; bind independent supply first.'],
    ['save/replay','src/game-engine/save.ts','REQUIRES_GENERALIZATION','Reviewed family dispatcher and tamper contract required.'],
    ['campaign transactions','src/game-engine/campaign/campaign-orchestrator.ts','REUSE_AS_IS','Idempotent transaction helper; campaign consequence is not yet known.'],
    ['Monster Posture representation','src/types/boss-runtime.ts','REQUIRES_GENERALIZATION','Stance slots/large footprint must be distinct from Area occupancy.'],
    ['summon executor','src/game-engine/bosses/foundation.ts','REQUIRES_GENERALIZATION','Current spawn helpers include Necromancer counts/rulings; cannot directly dispatch Thing.'],
    ['encounter storage','src/game-engine/bosses/room-storage.ts','REQUIRES_GENERALIZATION','Currently tied to face-the-threat and reserved objective Room. Roomless model only after source establishes it.'],
    ['before-first-action free scheduler','src/types/boss-runtime.ts','NEW_PRIMITIVE_REQUIRED','Explicit pending/free/resumed state before first normal activation; future work only.'],
  ];
  const reuse=reuseItems.map(([primitive,path,classification,finding])=>{
    assert(existsSync(path),'reuse evidence '+path);return {primitive,path,
      sha256NormalizedLF:createHash('sha256').update(readFileSync(path,'utf8').replace(/\r\n/g,'\n')).digest('hex'),
      hashBasis:'LF_NORMALIZED_ENGINEERING_SOURCE_TEXT_ONLY',classification,finding,
      authority:'ENGINEERING_ASSESSMENT',canonical:false,implemented:false};});
  const sourceBlockers=fields.filter(f=>f.status==='SOURCE_UNRESOLVED'&&f.blocking);
  const request=sourceBlockers.map(f=>({missingField:f.id,whyRequired:f.notes,
    lockedSourcesAlreadyInspected:{cardSides:6,corpusReview:'c1c38-thing-locked-corpus-review.json',references:f.sourceReferences},
    exactOfficialDocumentOrComponentLikelyRequired:f.id.startsWith('aberration.')||f.id.startsWith('physical.')?
      'Official Crystalline Aberration Level I component/copy census and encounter summon-pool component list':
      f.id.startsWith('encounter.')?'Official Thing from the Stars encounter/setup/eligibility rules, associated Room/Tile or explicit special-encounter board instructions':
      f.id.startsWith('summon.')?'Official Return to the Stars summon-pool, finite supply and selection/overflow instructions':
      'Official Thing from the Stars special combat rules or applicable official glyph/default clarification',
    documentTitleConfirmed:false,projectRulingProhibited:true,runtimeImpact:'Blocks affected executable field and Gate A; no replacement physical content.'}));
  const dependency=[...sourceBlockers.map(f=>({id:f.id,kind:'SOURCE',blocking:true,notes:f.notes})),
    ...candidateRows.map(c=>({id:c.fieldId,kind:'PROJECT_RULING',blocking:true,notes:c.sourceGap})),
    ...reuse.filter(r=>r.classification!=='REUSE_AS_IS').map(r=>({id:r.primitive,kind:'SHARED_RUNTIME',blocking:false,notes:r.finding})),
    {id:'encounter-ui',kind:'UI',blocking:false,notes:'Conditional on official encounter route; show copy/placement choices if applicable.'},
    {id:'persistence',kind:'SAVE',blocking:false,notes:'Versioned free-action/summon cursors and validation after source closure.'},
    {id:'ownership',kind:'PHYSICAL_OWNERSHIP',blocking:true,notes:'Source-bound finite supply and independent copy ownership required.'}];
  const outcome='THING_SOURCE_CLOSURE_BLOCKED';
  const decision={...common,outcome,gateAPassed:false,runtimeImplementationAuthorized:false,sourceAcquisitionRequired:true,
    next:'OFFICIAL_SOURCE_INTAKE_FOR_THING_ENCOUNTER_AND_SUMMON_SUPPLY; C1C39 remains blocked',
    sourceBlockerIds:sourceBlockers.map(f=>f.id),projectRulingCandidateIds:candidateRows.map(c=>c.candidateId),
    productionModelBound:false,sourceCardClosureComplete:true,
    rationale:'Readable Boss cards do not close encounter eligibility, reward/cleanup or the eligible finite summon pool. Additional locked Aberration literals do not establish physical supply.'};
  const closedRefs=cards.flatMap((c:any)=>refs(c.cardId));
  const outputs: Record<string,any>={
    'historical-c1c37-freeze':{...common,phase:'C1C37',commit:C1C38_BASELINE,outcome:'C1C37-SUCCESSOR-REBASELINE-ACCEPTED',
      remoteReleaseGate:read('source-assets/c1c38/predecessor-release-gate'),freezeScope:'COMMITTED_C1C37_ARTIFACT_BYTES_AND_ACCEPTANCE_IDENTITY',successorRuntimeByteFreeze:false},
    'thing-battle-literal':literal,
    'thing-ability-semantic-contract':{...common,definitionId:'ce-boss-41903-274696',literal:cards.find((c:any)=>c.cardId===41903).frontLiteral,
      fields:group('ACTION_SCHEDULER').concat(fields.filter(f=>f.id.startsWith('summon.minimum')))},
    'thing-boss-identity-contract':{...common,definitionId:'ce-boss-41902-d93a01',frontLiteral:cards.find((c:any)=>c.cardId===41902).frontLiteral,
      backLiteral:'BOSS',fields:group('IDENTITY'),flavorIsEncounterTrigger:false},
    'thing-battle-semantic-contract':{...common,definitionId:'ce-boss-43703-0cd9e0',literalArtifact:'c1c38-thing-battle-literal.json',
      fields:fields.filter(f=>['ACTOR_STATS','ACTOR_TAGS','STANCE','SKILL_TABLE','VORPAL_STRIKE','WEAKENING_SHARD',R,'EFFECT_ORDER','TARGETING'].includes(f.category))},
    'thing-glyph-semantic-contract':{...common,glyphs},
    'thing-encounter-model':{...common,fields:fields.filter(f=>f.id.startsWith('encounter.')),numberOfProductionLevels:'SOURCE_UNRESOLVED',
      sourceBoundBattleLevels:['I'],synthesizedLevels:[],encounterStorageMode:'SOURCE_UNRESOLVED',roomlessModelEstablished:false},
    'thing-return-to-stars-summon-contract':{...common,fields:fields.filter(f=>['SUMMON_POOL','MONSTER_POSTURE','INITIATIVE','PHYSICAL_SUPPLY'].includes(f.category)
      || f.category===R || f.category==='ACTION_SCHEDULER' || f.id.startsWith('save.') || f.id==='summon.genericPlacement' || f.id==='summon.genericAreaDisplacement'),
      placementRuleIsShared:true,actualPlacementExecutable:false,cleanup:fields.find(f=>f.id==='encounter.cleanup')},
    'crystalline-aberration-dependency':{...common,status:'SOURCE_UNRESOLVED',blocksGateA:true,
      productionDefinition:'SOURCE_UNRESOLVED',literalDefinitionAvailable:true,physicalCopySupply:'SOURCE_UNRESOLVED',eligibleSummonMembership:'BOUND',
      eligibilityScope:'Required Level I member only; remaining pool SOURCE_UNRESOLVED',intake:aberration,
      fields:fields.filter(f=>f.id.startsWith('aberration.')),sourceContentSet:'SOURCE_UNRESOLVED',productionRegistered:false},
    'thing-executable-field-matrix':{...common,fields,gateAPassed:false,
      summary:{total:fields.length,official:fields.filter(f=>f.canonical).length,sourceUnresolved:sourceBlockers.length,projectRulingRequired:candidateRows.length,acceptedProjectRulings:0}},
    'thing-project-ruling-candidates':{...common,candidates:candidateRows,acceptedRulings:[],
      prohibitedSubstitutes:['missing HP','missing Accuracy','missing Damage','missing Room','missing Tile','missing Monster definition','missing eligibility','missing physical copy count','missing Level II/III','missing reward']},
    'thing-runtime-reuse-matrix':{...common,authority:'ENGINEERING_ASSESSMENT',legacyReuse:0,assessmentComplete:true,items:reuse,
      prototypeReview:{searchedPaths:['src/game-engine','src/data','src/types','src/pages','src/components'],
        terms:['thing.from.the.stars','crystalline aberr'],matches:0,legacyFound:false,prototypeFound:false,authority:'NONE'}},
    'thing-production-dependency-matrix':{...common,dependencies:dependency},
    'thing-production-feasibility':{...common,sourceContractComplete:false,digitalExecutionContractComplete:false,productionModelBound:false,
      runtimeReuseAssessmentComplete:true,sharedRuntimeChangesRequired:true,newUiRequired:true,newSaveStateRequired:true,
      sourceAcquisitionRequired:true,projectRulingsRequired:true,runtimeImplementationAuthorized:false,
      changesConditionalOnSourceModel:true,sourceCardClosureComplete:true,futurePersistenceFields:group('SAVE_REPLAY'),
      futureTamperChecks:['wrong Boss card','wrong Ability card','wrong Battle card','wrong Level','wrong content set','wrong encounter type',
        'forged Monster Posture occupancy','duplicate physical summoned copy','illegal Crystalline Aberration supply','wrong skill table',
        'changed stored roll','changed target set','RNG rollback','ruling version mismatch'],outcome},
    'thing-missing-official-source-request':{...common,sourceAcquisitionRequired:true,externalAcquisitionPerformed:false,
      runtimeImplementationAuthorized:false,requests:request,documentTitlePolicy:'Exact required component/clause identified; no unverified expansion title is asserted.'},
    'next-workstream-decision':decision,
    'thing-locked-corpus-review':{...common,manifest:discovery.lockedManifest,manifestSha256:discovery.lockedManifestSha256,
      discoveryReceipt:assets+'locked-corpus-discovery.json',discoveryReceiptSha256:hash(assets+'locked-corpus-discovery.json'),
      fileCount:discovery.files.length,pageCount:discovery.files.reduce((n:number,f:any)=>n+f.pageCount,0),
      searchedTerms:discovery.searchedTerms,files:review.files,rulebookPages:review.rulebookPages,
      visualReviewScope:review.scope,textMissProvesAbsence:false,externalAcquisition:false,
      finding:'Shared core rule legends bound. No reviewed source identifies Thing encounter model or finite summon pool/supply. This is a closure blocker, not proof that those rules do not exist.'},
    'thing-source-closure':{...common,outcome,selectedPhysicalCardCount:3,selectedSourceBoundSides:6,
      cards:cards.map((c:any)=>({definitionId:c.definitionId,cardId:c.cardId,subtype:c.subtype,physicalIdentity:c.sourceReferences[0].physicalIdentity,
        printedLevel:c.printedLevel,frontReviewed:true,backReviewed:true,hashVerified:true,literalStatus:'LITERAL_COMPLETE',sourceReferences:refs(c.cardId)})),
      selectedSourceReferences:closedRefs,battleLiteralStatus:'CLOSED',allAcceptedOfficialFieldIds:fields.filter(f=>f.canonical).map(f=>f.id),
      unresolvedFieldIds:sourceBlockers.map(f=>f.id),projectRulingCandidateIds:candidateRows.map(c=>c.candidateId),acceptedProjectRulings:[],
      additionalComponentDependencies:['c1c38-crystalline-aberration-dependency.json'],rulebookReferences:review.rulebookPages,
      sourceAcquisitionRequired:true,runtimeImplementationAuthorized:false,externalAcquisitionPerformed:false,
      acceptedSourcePolicySha256:hash(root+'rule-source-policy.json'),productionPrototypeReachability:0,legacyReuse:0},
  };
  return outputs;
}

export function validateC1C38Artifacts(outputs: Record<string,any>): void {
  const expected=buildC1C38Artifacts();
  assert(Object.keys(outputs).sort().join()===Object.keys(expected).sort().join(),'complete artifact set');
  for(const [name,value] of Object.entries(expected))assert(JSON.stringify(outputs[name])===JSON.stringify(value),'source contract drift '+name);
  const matrix=outputs['thing-executable-field-matrix'];
  assert(new Set(matrix.fields.map((f:Field)=>f.id)).size===matrix.fields.length,'unique field IDs');
  for(const f of matrix.fields as Field[]) {
    assert(['OFFICIAL_SOURCE','SOURCE_UNRESOLVED','PROJECT_RULING_REQUIRED','PROJECT_RULING'].includes(f.status),'field status');
    assert(f.canonical===(f.status==='OFFICIAL_SOURCE'),'canonical classification');
    if(f.canonical)assert(f.sourceReferences.length>0,'source references '+f.id);
    else assert(f.normalizedValue===null&&!f.contractExecutable,'unresolved value cannot default '+f.id);
    assert(f.blocking===(f.executionRequired&&!f.contractExecutable),'blocking calculus '+f.id);
  }
  assert(!matrix.gateAPassed&&matrix.fields.some((f:Field)=>f.blocking),'Gate A fail-closed');
  assert(!productionBossFamilyRegistry.has('thing-from-the-stars'),'no registry promotion');
  assert(!productionBossCapabilities.some(c=>c.familyId==='thing-from-the-stars'),'no capability promotion');
  assert(!productionBossPlayerRouteEnabled('thing-from-the-stars','C1C38-THING-SOURCE-CONTRACT-v1'),'normal route closed');
  const gate=read('source-assets/c1c38/predecessor-release-gate');
  assert(gate.name==='Production release gate'&&gate.head_sha===C1C38_BASELINE&&gate.status==='completed'&&gate.conclusion==='success','activation gate');
  for(const card of outputs['crystalline-aberration-dependency'].intake.cards)for(const ref of card.sourceReferences as Ref[])
    assert(hash(ref.path)===ref.sha256,'Aberration crop hash');
  for(const s of outputs['crystalline-aberration-dependency'].intake.sheetBindings)
    assert(hash(s.path)===s.sha256,'Aberration original sheet hash');
}

export function verifyC1C38() {
  verifyHistoricalBaseline('c1c37');
  const files=readdirSync(root).filter(n=>n.startsWith('c1c38-')&&n.endsWith('.json'));
  const recorded=Object.fromEntries(files.map(n=>[n.slice(6,-5),read(n.slice(0,-5))]));
  validateC1C38Artifacts(recorded);
  // C1C38 is explicitly source-only. Future phases can change shared runtime after their own gate.
  execFileSync('git',['diff','--exit-code',C1C38_BASELINE,'--','src/game-engine','src/data','src/types','src/components','src/pages'],{stdio:'pipe'});
  console.log('C1C38 source research: PASS; THING_SOURCE_CLOSURE_BLOCKED; Gate A false; runtime implementation unauthorized.');
}
if(process.argv.includes('--write')) {
  const artifacts=buildC1C38Artifacts();validateC1C38Artifacts(artifacts);
  for(const [name,data] of Object.entries(artifacts))writeFileSync(root+'c1c38-'+name+'.json',JSON.stringify(data,null,2)+'\n');
  console.log('C1C38 source-only artifacts written; no gameplay implementation.');
}
if(process.argv.includes('--verify'))verifyC1C38();
