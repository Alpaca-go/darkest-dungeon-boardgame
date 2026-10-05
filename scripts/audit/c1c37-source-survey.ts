import {createHash} from 'node:crypto';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';

const root='docs/data/complete-edition/';
const read=(name:string)=>JSON.parse(readFileSync(root+name+'.json','utf8'));
const digest=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
// Project estimates of engineering work, never source facts. Same weights as
// C1C34, freshly applied to the per-card locked records and current primitives.
const profiles:Record<string,{special:number;save:number;ui:number;battle:number;legacy:number;shared:number;mechanisms:string[]}>={
  'Thing from the stars':{special:1,save:2,ui:1,battle:3,legacy:0,shared:3,mechanisms:['Crystalline Aberration summon / physical deck membership']},
  Collector:{special:4,save:3,ui:2,battle:3,legacy:4,shared:6,mechanisms:['Collected actors','summon/placement ownership','Loot Chests']},
  Hag:{special:2,save:4,ui:3,battle:4,legacy:0,shared:4,mechanisms:['Cauldron Empty / Full','captive Hero lifecycle','attached two-unit lifecycle']},
  'The Sleeper':{special:2,save:3,ui:2,battle:4,legacy:0,shared:2,mechanisms:['form/state transitions; encounter model unbound']},
  'The Miller':{special:2,save:3,ui:2,battle:4,legacy:0,shared:2,mechanisms:['summoned actors; encounter model unbound']},
  Baron:{special:3,save:4,ui:3,battle:4,legacy:0,shared:3,mechanisms:['Pulsating Eggs']},
  'Brigand Pounder':{special:3,save:3,ui:2,battle:4,legacy:0,shared:4,mechanisms:['Reinforcements / support actors']},
  'Brigand Vvulf':{special:2,save:3,ui:2,battle:4,legacy:0,shared:3,mechanisms:["Time's Up / barrel mechanism"]},
  Countess:{special:3,save:4,ui:3,battle:5,legacy:0,shared:3,mechanisms:['Parasite Egg / state handling']},
  'Drowned Crew':{special:2,save:4,ui:3,battle:4,legacy:0,shared:3,mechanisms:['All Hands On Deck / attached actor']},
  Fanatic:{special:2,save:4,ui:3,battle:4,legacy:0,shared:3,mechanisms:['Sentence Rendered / captive mechanism']},
  'Garden Guardian':{special:3,save:4,ui:3,battle:4,legacy:4,shared:4,mechanisms:['One Body / multipart actors']},
  Shambler:{special:3,save:3,ui:2,battle:4,legacy:0,shared:4,mechanisms:['Absolute Darkness / Summon']},
  Shrieker:{special:2,save:3,ui:2,battle:4,legacy:0,shared:3,mechanisms:["Shrieker's Nest / Call the Murder"]},
  Siren:{special:1,save:4,ui:3,battle:5,legacy:0,shared:3,mechanisms:['Song of Desire / Hero control']},
  'Swine Prince':{special:2,save:3,ui:2,battle:4,legacy:0,shared:3,mechanisms:['Enraged Destruction / companion actor']},
  'The Flesh':{special:4,save:4,ui:3,battle:5,legacy:0,shared:3,mechanisms:['One Body / multipart form changes']},
  Viscount:{special:4,save:4,ui:3,battle:4,legacy:0,shared:3,mechanisms:['The Feast / auxiliary physical actors']},
};

export function buildBossSourceSurvey() {
  const inputs=['c1c24-boss-printed-definitions','c1c24-boss-crop-manifest','c1c19-rulebook-extracted-evidence',
    'c1c32r2-local-official-source-manifest','rule-source-policy','c1c37-locked-corpus-review-intake'];
  const cards=read(inputs[0]).cards as any[];
  if(cards.length!==231||new Set(cards.map(c=>c.family)).size!==20)throw new Error('Frozen Boss census identity drift');
  const common={schemaVersion:1,phase:'11A.4-C1C37',policyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',
    inputHashes:Object.fromEntries(inputs.map(n=>[root+n+'.json',digest(root+n+'.json')])),externalAcquisition:false,prototypeAsAuthority:false};
  const families=[...new Set<string>(cards.map(c=>c.family))].filter(f=>!['Necromancer','Prophet'].includes(f)).sort();
  const unresolved=(c:any)=>[
    ...(!c.literalComplete?[{field:'remainingPrintedDefinition',...c.remainingPrintedDefinition}]:[]),
    {field:'identityRelations.semanticEquivalence',...c.identityRelations.semanticEquivalence},
    ...Object.entries(c.preliminarySemantic).map(([field,value])=>({field:`preliminarySemantic.${field}`,...value as object})),
  ].filter(v=>v.status==='SOURCE_UNRESOLVED');
  const survey=families.map(family=>{
    const own=cards.filter(c=>c.family===family),profile=profiles[family];if(!profile)throw new Error('Unreviewed planning profile: '+family);
    const sides=own.flatMap(c=>c.sourceReferences.map((r:any)=>{
      if(r.status!=='SOURCE_BOUND'||digest(r.path)!==r.cropSha256)throw new Error('Locked crop drift: '+r.path);
      return {definitionId:c.definitionId,side:r.side,path:r.path,sha256:r.cropSha256,authority:'OFFICIAL_PRINTED_COMPONENT',transportIsAuthority:false};
    }));
    const slug=family.toLowerCase().replace(/^the /,'').replace(/ /g,'-');
    const runtimePaths=[`src/game-engine/${slug}/runtime.ts`,`src/data/bosses/${slug}-family.ts`,
      ...(family==='Garden Guardian'?['src/game-engine/campaign/act-four/community-guardian-battle.ts','src/game-engine/campaign/act-four/community-guardian-room-state.ts']:[])].filter(existsSync);
    return {family,physicalCardCount:own.length,subtypeCounts:Object.fromEntries([...new Set<string>(own.map(c=>c.subtype))].map(s=>[s,own.filter(c=>c.subtype===s).length])),
      sourceBoundSides:sides.length,allSourceSidesBound:own.every(c=>['front','back'].every(s=>c.sourceReferences.some((r:any)=>r.side===s&&r.status==='SOURCE_BOUND'))),
      literalComplete:own.filter(c=>c.literalComplete).length,semanticComplete:own.filter(c=>c.semanticComplete).length,
      unresolvedPrintedDefinitions:own.filter(c=>!c.literalComplete).map(c=>c.definitionId),sourceGapCount:own.reduce((sum,c)=>sum+unresolved(c).length,0),
      cards:own.map(c=>({definitionId:c.definitionId,cardId:c.cardId,subtype:c.subtype,printedName:c.printedName,printedLevel:c.printedLevel,
        literalStatus:c.literalStatus,semanticComplete:c.semanticComplete,sourceGapCount:unresolved(c).length})),sourceReferences:sides,
      specialPhysicalComponents:{status:'PLANNING_REVIEW_NOT_EXECUTABLE',mechanisms:profile.mechanisms,definitionReferences:own.map(c=>c.definitionId)},
      existingPrototypeRuntimeReuse:{paths:runtimePaths,fileHashes:Object.fromEntries(runtimePaths.map(p=>[p,digest(p)])),authority:false,productionPromotion:false,review:'Architecture only; no values or semantics imported'},
      sharedProductionPrimitiveReuse:['BattleState','shared damage / incoming reaction windows','saved seeded RNG / initiative','physical ownership ledgers','campaign transaction deduplication'],
      saveComplexity:profile.save,uiComplexity:profile.ui,newBattleSemantics:profile.battle,planningProfile:profile,
      complexityAuthority:'PROJECT_ESTIMATE',productionReady:false};
  });
  const weights={unresolvedDefinition:2,specialComponent:2,saveChange:2,newUi:2,newBattle:3,legacyReuse:-1,sharedReuse:-1};
  const ranking=survey.map(s=>{const p=s.planningProfile;return {family:s.family,physicalCards:s.physicalCardCount,literalComplete:s.literalComplete,
    unresolvedDefinitions:s.unresolvedPrintedDefinitions.length,sourceGaps:s.sourceGapCount,profile:p,
    planningCost:s.unresolvedPrintedDefinitions.length*2+p.special*2+p.save*2+p.ui*2+p.battle*3-p.legacy-p.shared,
    productionReady:false,estimateUncertainty:'Eligibility, external summon components and missing semantic fields can increase implementation cost'};}).sort((a,b)=>a.planningCost-b.planningCost||a.family.localeCompare(b.family));
  if(ranking[0].family!=='Thing from the stars')throw new Error('Selection changed: explicit new evidence review required');
  const selected=cards.filter(c=>c.family==='Thing from the stars');
  const refs=selected.flatMap(c=>c.sourceReferences.map((r:any)=>({path:r.path,sha256:r.cropSha256,side:r.side,authority:'OFFICIAL_PRINTED_COMPONENT'})));
  const field=(id:string,status:string,value:unknown,reason:string,sourceReferences:unknown[]=refs)=>({id,status,canonical:status==='OFFICIAL_SOURCE',
    value,reason,sourceReferences,executable:false});
  const sourceFields=selected.flatMap(c=>[
    field(`${c.definitionId}.identity`,'OFFICIAL_SOURCE',{cardId:c.cardId,name:c.printedName,subtype:c.subtype,printedLevel:c.printedLevel},'Locked printed component identity; absent Level is not filled from another card.',refs.filter(r=>c.sourceReferences.some((s:any)=>s.path===r.path))),
    field(`${c.definitionId}.literal`,c.literalComplete?'OFFICIAL_SOURCE':'SOURCE_UNRESOLVED',c.literalComplete?{front:c.frontLiteral,back:c.backLiteral}:null,
      c.literalComplete?'Existing hash-bound two-sided literal.':'Battle functional values/icons remain untranscribed; header text does not close this definition.'),
    ...unresolved(c).map(g=>field(`${c.definitionId}.${g.field}`,'SOURCE_UNRESOLVED',null,g.reason)),
  ]);
  const rulebook=read('c1c19-rulebook-extracted-evidence');
  const pages=rulebook.pages.filter((p:any)=>/thing from the stars|star thing|crystalline aberration/i.test(p.text));
  sourceFields.push(
    field('content-set','SOURCE_UNRESOLVED',null,'Expansion association is not canonically bound by the reviewed locked core rulebook/card fields; transport grouping is not eligibility authority.'),
    field('campaign-and-quest-eligibility','SOURCE_UNRESOLVED',null,'No locked clause currently binds this family to the campaign or a Quest pool.'),
    field('face-the-threat','SOURCE_UNRESOLVED',null,'Do not reuse the core Face the Threat route without a family-specific official clause.'),
    field('roaming-or-special-encounter','SOURCE_UNRESOLVED',null,'Flavor says wander; this is not an executable roaming encounter trigger.'),
    field('threat-model','SOURCE_UNRESOLVED',null,'No physical THREAT card among the three definitions; this does not prove Threat is absent from the encounter rules.'),
    field('room-and-tile-model','SOURCE_UNRESOLVED',null,'No bound objective Room, Tile, spatial map or stance placement contract.'),
    field('campaign-level-availability','SOURCE_UNRESOLVED',null,'Battle back prints I; Ability/identity print no Level. Never synthesize II/III or infer campaign availability.'),
    field('actions-per-round-literal','OFFICIAL_SOURCE',2,'Ability 41903 explicitly prints ACTIONS / Round: 2.'),
    field('return-to-stars-free-action-literal','OFFICIAL_SOURCE',{beforeFirstActionEachRound:true,skillNumber:3,atLeastOne:'Crystalline Aberration I'},'Printed Ability clause; target/placement/copy/skill effects remain unbound.'),
    field('summon-component-membership','SOURCE_UNRESOLVED',null,'Resolve Crystalline Aberration I and eligible Monster pool/copies from locked components before implementation.'),
    field('free-action-priority-and-interruption','PROJECT_RULING_REQUIRED',null,'Review official timing first; any remaining simultaneous ordering or resumed cursor decision requires an explicit versioned noncanonical ruling.'),
    field('pending-choice-save-and-causal-order','PROJECT_RULING_REQUIRED',null,'Project serialization contract must preserve candidates, causality, RNG and rule dependencies after source closure.'),
    field('victory-and-campaign-progression','SOURCE_UNRESOLVED',null,'Generic Boss death cannot establish this expansion encounter reward/progression model.'),
  );
  for(const id of ['life','dodge','type-tags','stance-and-size','resistances','immunities','skill-roll-table','Hero-entry-stance-map','Boss-placement','initiative-card-count','summon-capacity-and-overflow','physical-copy-supply'])
    sourceFields.push(field(id,'SOURCE_UNRESOLVED',null,'Required executable field lacks a reviewed family-specific source binding; do not borrow accepted core Boss values.'));
  for(const skill of ['Vorpal Strike','Weakening Shard','Return to the Stars'])for(const id of ['crit','critical-damage','accuracy','damage','range','target','target-count','effects','duration','effect-order'])
    sourceFields.push(field(`skill.${skill}.${id}`,'SOURCE_UNRESOLVED',null,'Skill name is reviewed header structure only; functional literal and glyph normalization remain open.'));
  const lockedManifest=read('c1c32r2-local-official-source-manifest');
  const lockedReview=read('c1c37-locked-corpus-review-intake');
  if(lockedReview.externalAcquisition||lockedReview.textSearchIsRulesAuthority||lockedReview.lockedManifestSha256!==digest(root+'c1c32r2-local-official-source-manifest.json')
    ||lockedReview.files.length!==lockedManifest.files.length||lockedManifest.files.some((f:any)=>!lockedReview.files.some((r:any)=>r.relativePath===f.relativePath&&r.sha256===f.sha256)))
    throw new Error('Current locked-corpus review receipt mismatch');
  return {
    'boss-family-source-survey':{...common,method:'RECOMPUTED_PER_PHYSICAL_CARD_AND_HASH_VERIFIED_SIDES',
      gapCountingPolicy:'Per-card unresolved remaining literal + semantic equivalence + preliminary semantic slots. The next-family field matrix separately decomposes executable feasibility fields.',
      excludedAcceptedFamilies:['Necromancer','Prophet'],families:survey,
      corpusScope:{lockedRulebookExtract:rulebook.source,lockedRulebookHash:rulebook.sourceSha256,matchingSelectedFamilyPages:pages.map((p:any)=>p.page),
        lockedOfficialManifestFiles:lockedManifest.files.map((f:any)=>({relativePath:f.relativePath,sha256:f.sha256})),
        freshLockedPdfReview:{receipt:'c1c37-locked-corpus-review-intake.json',fileCount:lockedReview.files.length,
          selectedFamilyTextHits:lockedReview.files.flatMap((f:any)=>f.textHits.filter((h:any)=>h.matchedTerms.some((t:string)=>/thing from the stars|star thing|crystalline aberration|colou?r of madness|farmstead/i.test(t)))),
          textSearchIsRulesAuthority:false,absenceOfTextHitProvesAbsenceOfRule:false},newSourceAcquisition:false}},
    'boss-family-reuse-ranking':{...common,method:'PLANNING_COST_V1_RECOMPUTED_C1C37',weights,scoreIsProjectEstimate:true,ranking,
      selectionScope:'SOURCE_CLOSURE_ONLY',comparison:['Thing from the stars','Collector','Hag'],historicalRankingUsedAsInput:false},
    'next-family-source-gap-matrix':{...common,family:'thing-from-the-stars',fields:sourceFields,
      genericContracts:['BattleState','damage','seeded RNG / initiative','physical ownership','PendingChoice / causal events / dependency identities','idempotent campaign transactions'],
      familySpecificContracts:['Quest / encounter eligibility','Threat lifecycle','campaign Levels','objective Room / Tile','summon membership and placements','victory progression'],
      runtimeImplementationAuthorized:false,missingSourcePolicy:{canonicalStatus:'SOURCE_UNRESOLVED',authority:'PROJECT_RULING',canonical:false,explicitVersionRequired:true}},
    'next-family-decision':{...common,selectedFamily:'thing-from-the-stars',selectionStatus:'SOURCE_CLOSURE_CANDIDATE',productionReady:false,runtimeImplementationAuthorized:false,
      previousCandidate:'thing-from-the-stars',selectionOverride:false,refreshedCounts:{physicalCards:3,literalComplete:2,unresolvedPrintedDefinitions:1,sourceGaps:52,allSourceSidesBound:true},
      rationale:'Smallest physical source surface and lowest recomputed planning cost; Collector reuse does not offset 12 partial definitions; Hag needs captive-Hero/Cauldron lifecycle.',
      unresolvedEligibilityIsNotAssumed:true,productionRegistryPromotion:false,nextPhase:'C1C38 — Thing from the Stars Official Source Closure & Production Feasibility',
      firstObjectives:['recover remaining Battle literal from locked crop','bind Battle / Ability / Boss identity','determine encounter / Quest model','bind Room / Tile requirements',
        'bind stats / skills / effects','review summon components','identify required project rulings','produce Gate A executable field matrix'],
      implementationGate:'Source review only until every required executable field and dependency is closed; no gameplay implementation or selector promotion authorized'},
  };
}
if(process.argv.includes('--write-survey')) {
  const artifacts=buildBossSourceSurvey();
  for(const [name,data] of Object.entries(artifacts))writeFileSync(root+'c1c37-'+name+'.json',JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify(artifacts['boss-family-reuse-ranking'].ranking.map(r=>({family:r.family,planningCost:r.planningCost,partialDefinitions:r.unresolvedDefinitions}))));
}
