import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildProphetContract, digest, verifyProphetContract, type Artifacts } from './c1c35-prophet-contract';
import { compareCommunityTargetPriority } from '../../src/game-engine/campaign/act-four/community-monster-targeting';
import type { BattleUnit } from '../../src/types';

export const baseline='7b99c36c19159923799b3bda0180af9d8020ef82';
export const scopeVersion='C1C35R1-PROPHET-RUBBLE-TARGET-SCOPE-v1';
const root='docs/data/complete-edition/';
const read=(name:string):any=>JSON.parse(readFileSync(root+name+'.json','utf8'));
const common={schemaVersion:1,phase:'11A.4-C1C35R1',baseline,policyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',
  contractVersion:'C1C35R1-PROPHET-RESIDUAL-CONTRACT-v1',gameplayChanged:false,productionPromotion:false,runtimeImplementationAllowed:false};
export const saveFields=Object.freeze(['ruleSetVersion','orderedPhysicalCopyIds','rubbleCursor','pendingPewAttack.pewCopyId',
  'pendingPewAttack.areaId','pendingPewAttack.targetActorIds','pendingPewAttack.attackRoll','pendingPewAttack.phase',
  'pendingPewAttack.resolvedTargetIds','resolvedActionKeys','causalEvents','sharedRngCheckpoint','targetScopeRulingVersion']);

export function buildResidualContract():Artifacts {
  const prior=buildProphetContract();
  const pages=[...read('c1c35-locked-page-review').extracts,...read('c1c35r1-page-review-receipt').extracts];
  const refs=(name:string,number:number)=>pages.filter((e:any)=>e.sourceReference.relativePath.endsWith(name)&&e.sourceReference.page===number)
    .map((e:any)=>({...e.sourceReference,extractPath:e.path,extractSha256:e.sha256}));
  const tileRefs=refs('DD_COREBOX_TILES_FRONT.pdf',6);
  const facts={areaId:'ruins-tile-11:C',printedD10:6,adjacent:['ruins-tile-11:E','ruins-tile-11:N','ruins-tile-11:S','ruins-tile-11:W'],
    aggressiveMonsterPlacement:true,pewEligible:true,occupancyDots:'NOT_VISIBLY_PRINTED',numericCapacity:null};
  const reviewed=[
    {references:tileRefs,observation:'Ruins Tile 11 Area C has d10 6 and red Aggressive placement, but no visible occupancy dots.'},
    {references:refs('DD_COREBOX_TILES_BACK.pdf',6),observation:'Opposite print slot is Ruins Tile 10; not a second Prophet Tile or capacity source.'},
    {references:refs('DD_COREBOX_TILES_FRONT.pdf',14),observation:'Printed 11 is a different biome, different layout and roll groups; excluded from Ruins Tile 11.'},
    {references:refs('DD_EN_COREBOX_CARDS_63x88_rooms_FRONT.pdf',11),observation:'Room 11 illustrates the same Ruins Tile. No numeric Area C capacity appears.'},
    ...['DD_COREBOX_Paper_Insert_01.pdf','DD_COREBOX_Paper_Insert_02.pdf'].map(name=>{
      const f=read('c1c32r2-local-official-source-manifest').files.find((f:any)=>f.fileName===name);
      return {references:[{relativePath:f.relativePath,sha256:f.sha256,page:1}],
        observation:'Visually inspected decorative packaging insert and cut/fold outlines; no Prophet Room map, occupancy dots or capacity rule.'};
    }),
    ...[3,5,6,11,16,18,37,38,39].map(p=>({references:refs('DD_EN_COREBOX_RULES.pdf',p),
      observation:p===18?'Occupancy number/icon and movement limits; no absent-icon default.':p===37?'PvP capacity 1 rule applies to Arena only; not Prophet.':
        p===38||p===39?'Prophet setup, Pew placement and independent Area attacks; no numeric Area C capacity.':
        p===16?'Stance setup example uses Room 6, not Room 11; no transferable capacity.':'Contents, component or campaign setup illustration; no numeric Area C capacity.'})),
  ];
  const inputs=['rule-source-policy','c1c34-next-workstream-decision','c1c35-locked-page-review','c1c35-prophet-source-closure',
    'c1c35-prophet-tile-contract','c1c35-prophet-d10-area-map','c1c35-prophet-project-rulings','c1c35-prophet-glyph-semantic-contract',
    'c1c32r2-local-official-source-manifest','c1c19-rulebook-extracted-evidence','c1a-rulebook-evidence',
    'c1c35r1-locked-corpus-review-intake','c1c35r1-page-review-receipt'];
  const hashes=Object.fromEntries(inputs.map(n=>[root+n+'.json',digest(root+n+'.json')]));
  const pewIndependence={placementAuthority:'OFFICIAL_SOURCE',sourceReferences:[...tileRefs,...refs('DD_EN_COREBOX_RULES.pdf',38),...refs('DD_EN_COREBOX_RULES.pdf',39)],
    capacityCost:0,capacityRequiredForPewPlacement:false,d10SixPlacementLegal:true,
    componentModel:{authority:'PROJECT_RULING',canonical:false,basis:'Explicit C1C35R1 non-Actor component requirement',battleActor:false,hp:null,initiative:0,normallyTargetable:false},
    globalGate:'Legal source-contract placement does not authorize a runtime while Actor capacity is unresolved.'};
  const decision={...common,canonicalStatus:'SOURCE_UNRESOLVED',status:'CANONICAL_AREA_C_CAPACITY_UNRESOLVED',
    reviewedOfficialSources:reviewed,sourceHashes:hashes,observedFacts:{authority:'OFFICIAL_SOURCE',facts,sourceReferences:tileRefs},
    missingFact:'Numeric Actor occupancy capacity of ruins-tile-11:C; no authorized non-canonical representation exists.',
    runtimeImpact:{actorMovementAndOccupancy:'BLOCKED',prophetActorPlacementCapacityValidation:'BLOCKED',pewPlacement:'CAPACITY_INDEPENDENT_LEGAL',pewIndependence},
    candidateDigitalRepresentations:[
      {id:'BOUNDED_FOUR',capacity:4,authority:'PROJECT_RULING',canonical:false,adopted:false,authorized:false,versioned:true,
        tradeoff:'Bounds Actor occupancy at four spaces; Large Prophet consumes two, leaving two Hero spaces. This is not inferred from neighboring dots.'},
      {id:'BOUNDED_SIX',capacity:6,authority:'PROJECT_RULING',canonical:false,adopted:false,authorized:false,versioned:true,
        tradeoff:'Allows Large Prophet plus four normal Hero spaces; changes tactical occupancy and needs explicit project authorization.'},
      {id:'RETAIN_BLOCK',capacity:null,authority:'PROJECT_DECISION',canonical:false,adopted:true,authorized:true,
        tradeoff:'Preserve missing canonical capacity and prohibit production runtime.'},
    ],recommendedProjectRulingStatus:'NOT_AUTHORIZED_DECISION_REQUIRED',adoptedNumericCapacity:null,canonicalPromotion:false};
  const ruling={...common,rulingId:scopeVersion,version:scopeVersion,ruleSetVersion:'C1C35-PROPHET-DIGITAL-DEFAULT-v1',
    authority:'PROJECT_RULING',canonical:false,canonicalTargetScopeStatus:'SOURCE_UNRESOLVED',status:'EXECUTABLE_CONTRACT_ONLY',
    sourceReferences:[...refs('DD_EN_COREBOX_RULES.pdf',38),...refs('DD_EN_COREBOX_RULES.pdf',39)],
    officialFacts:['Pew Areas are attacked','one independent roll per Pew','multiple Pews in the same Area produce multiple attacks'],
    projectDecision:{targetScope:'ALL_LIVING_TARGETABLE_HEROES_IN_CURRENT_PEW_AREA',targetLimit:null,oneTransactionPerActivePhysicalPew:true,
      readAreaFrom:'authoritative Pew instance',freezeTargetSet:'at start of each Pew transaction; store IDs before roll',
      targetOrdering:{primitive:'compareCommunityTargetPriority',path:'src/game-engine/campaign/act-four/community-monster-targeting.ts',
        primitiveSha256:digest('src/game-engine/campaign/act-four/community-monster-targeting.ts'),keys:['authoritative stance','position','actor ID'],
        note:'Shared comparator already consumed by production component combat; implementation reuse is not rules authority.'},
      attackRollsPerPew:1,emptyAreaConsumesRoll:true,sameAreaPewsMerged:false,
      damagePipeline:'Shared attack/damage with per-target shared death windows; complete before cursor advance; printed level-specific damage from frozen C1C34.',
      subsequentPew:'Read its Area and collect current living targetable Heroes afresh; no reuse of prior Pew target snapshot.'},
    saveExtension:{extends:'C1C35 pew-attack-order-and-save without mutating its v1 artifact',extensionVersion:scopeVersion,
      authoritativeFields:[...saveFields],pinnedDependencyVersions:{pewOrder:'C1C35-PROPHET-DIGITAL-DEFAULT-v1',targetScope:scopeVersion,map:'C1C35-PROPHET-PRINTED-D10-v1'},
      phases:['TARGETS_PERSISTED','ROLL_PERSISTED','TARGET_WINDOWS_PENDING','COMPLETE'],
      reloadInvariants:{targetActorIds:'Exactly persisted IDs and order, no reselection from current board',attackRoll:'Preserve stored roll; no reroll',
        resolvedTargetIds:'Persist completed target windows; skip only already committed or explicitly journaled legal removal',
        remainingTargets:'Resume every unresolved frozen target in order',physicalCopyOrder:'Preserve explicit copy order',
        causalEvents:'No duplicated damage or death transaction IDs',sharedRngCheckpoint:'Continue stored shared stream; no Prophet-private RNG'},
      invalidSave:'Reject; never silently repair authoritative targets, roll, cursor, order or journal',productionSaveSchemaChanged:false},
    prototypeAsAuthority:false,runtimeImplemented:false};
  const rows=structuredClone(prior['source-closure'].items);
  for(const row of rows) {
    row.contractExecutable=['OFFICIAL_SOURCE','PROJECT_RULING'].includes(row.status);
    row.runtimeImplemented=false;
    if(row.id==='tile') {row.contractExecutable=false;row.reason=decision.missingFact;}
    if(row.id==='d10-area-mapping') row.reason='Frozen explicit printed map retained. Pew placement does not depend on Actor capacity; global runtime gate remains blocked.';
    if(row.id==='target-effect-glyph-binding') Object.assign(row,{status:'PROJECT_RULING',canonical:false,contractExecutable:true,
      value:{bindings:prior['glyph-semantic-contract'].bindings.map((b:any)=>b.field==='Rubble special target'?{...b,
        status:'PROJECT_RULING',authority:'PROJECT_RULING',canonical:false,canonicalStatus:'SOURCE_UNRESOLVED',
        targetScope:ruling.projectDecision.targetScope,rulingId:scopeVersion,contractExecutable:true}:b)},
      rulingReferences:[{id:scopeVersion,version:scopeVersion}],reason:'Official glyph semantics retained; missing Rubble Hero target count closed only for digital execution by explicit Prophet ruling.'});
  }
  const blockers=rows.filter((r:any)=>!r.contractExecutable).map((r:any)=>r.id);
  return {
    'residual-source-review':{...common,inputHashes:hashes,reviewedOfficialSources:reviewed,observedFacts:facts,
      reviewScope:{lockedLocalPdfs:read('c1c35r1-locked-corpus-review-intake').files.length,
        recursiveFolderPdfCount:243,folderCountIsNotReviewedOrLockedCount:true,
        setupAndComponentMaterial:'Locked Paper Inserts, Player Aids, Stance/Initiative and Rulebook scanned in the 24-entry manifest; no Area C numeric occurrence found.',
        otherHashBoundEvidence:'Existing C1C19/C1A official rulebook evidence retained; no absent-capacity rule recovered.',externalAcquisition:false,prototypeAsAuthority:false},
      capacityResult:'CANONICAL_AREA_C_CAPACITY_UNRESOLVED',canonicalTargetScope:'SOURCE_UNRESOLVED'},
    'area-c-capacity-decision':decision,'rubble-target-scope-ruling':ruling,
    'source-closure':{...common,inputHashes:hashes,requiredFieldCount:22,items:rows,blockers,
      frozenD10Map:prior['d10-area-map'],pewIndependence,gateAPassed:false,canonicalMissingFields:['ruins-tile-11:C.capacity','Rubble target scope'],
      executableMissingFields:['ruins-tile-11:C.capacity']},
    'gate-a-proof':{...common,proofKind:'CONTRACT_AUDIT_NOT_RUNTIME_ACCEPTANCE',requiredFields:22,closedExecutionFields:21,
      blockerIds:blockers,gateAPassed:false,canonicalCapacity:null,authorizedCapacityRuling:null,rubbleScopeClosedBy:scopeVersion,
      pewPlacementCapacityIndependent:true,productionSaveSchemaChanged:false,runtimeTestsPerformed:false,browserAcceptancePerformed:false},
    'next-workstream-decision':{...common,outcome:'PROPHET_GATE_A_BLOCKED_ON_AREA_C_CAPACITY',gateAPassed:false,
      blocker:'ruins-tile-11:C.capacity',c1c35r2Allowed:false,c1c36Allowed:false,
      next:'Explicitly authorize a versioned non-canonical Actor capacity representation, or recover an allowed official numeric binding. Re-run Gate A before any runtime implementation.'},
  };
}

export function validateResidualStructure(a:Artifacts) {
  const decision=a['area-c-capacity-decision'];
  if(decision.canonicalStatus!=='SOURCE_UNRESOLVED'||decision.adoptedNumericCapacity!==null||decision.canonicalPromotion) throw new Error('Unbound capacity promoted');
  if(decision.observedFacts.facts.numericCapacity!==null||decision.observedFacts.facts.occupancyDots!=='NOT_VISIBLY_PRINTED') throw new Error('Absence converted to capacity');
  if(decision.candidateDigitalRepresentations.some((c:any)=>c.capacity!==null&&(c.authority!=='PROJECT_RULING'||c.canonical||c.adopted||c.authorized))) throw new Error('Unapproved digital capacity');
  const r=a['rubble-target-scope-ruling'];
  if(r.authority!=='PROJECT_RULING'||r.canonical||r.version!==scopeVersion||r.canonicalTargetScopeStatus!=='SOURCE_UNRESOLVED') throw new Error('Ruling mislabeled official');
  const p=r.projectDecision;
  if(p.targetScope!=='ALL_LIVING_TARGETABLE_HEROES_IN_CURRENT_PEW_AREA'||p.targetLimit!==null||!p.oneTransactionPerActivePhysicalPew||p.sameAreaPewsMerged||p.attackRollsPerPew!==1||!p.emptyAreaConsumesRoll) throw new Error('Rubble scope/independence invalid');
  if(JSON.stringify(r.saveExtension.authoritativeFields)!==JSON.stringify(saveFields)||r.saveExtension.productionSaveSchemaChanged) throw new Error('Pending attack fields missing');
  const closure=a['source-closure'];
  if(closure.items.length!==22||new Set(closure.items.map((r:any)=>r.id)).size!==22||closure.blockers.join(',')!=='tile') throw new Error('Required fields/blockers invalid');
  if(JSON.stringify(closure.frozenD10Map)!==JSON.stringify(buildProphetContract()['d10-area-map'])) throw new Error('Frozen d10 mapping changed');
  if(closure.pewIndependence.capacityRequiredForPewPlacement||!closure.pewIndependence.d10SixPlacementLegal||closure.pewIndependence.capacityCost!==0) throw new Error('Actor capacity contaminated Pew placement');
  for(const artifact of Object.values(a)) if(artifact.productionPromotion!==false||artifact.runtimeImplementationAllowed!==false||artifact.gameplayChanged!==false) throw new Error('Unresolved Gate A promoted');
  if(a['next-workstream-decision'].outcome!=='PROPHET_GATE_A_BLOCKED_ON_AREA_C_CAPACITY'||a['gate-a-proof'].gateAPassed||a['source-closure'].gateAPassed) throw new Error('Gate A false acceptance');
}

export function verifyResidualContract(a:Artifacts) {
  validateResidualStructure(a);
  verifyProphetContract(buildProphetContract());
  const paths=execFileSync('git',['ls-tree','-r','--name-only',baseline,'docs/data/complete-edition','docs/reports/complete-edition','scripts/audit','src/audit'],{encoding:'utf8'}).trim().split(/\r?\n/)
    .filter(p=>p.includes('/c1c35-')||p.includes('/c1c35/')||p.includes('/run-c1c35-')||p.includes('/render-c1c35-'));
  for(const path of paths) if(!execFileSync('git',['show',`${baseline}:${path}`],{maxBuffer:16*1024*1024}).equals(readFileSync(path))) throw new Error('Frozen C1C35 checkpoint changed: '+path);
  execFileSync('git',['diff','--exit-code',baseline,'--','src/game-engine','src/data','src/types','e2e','docs/DD_EN_COREBOX_RULES.pdf'],{stdio:'pipe'});
  const manifest=read('c1c32r2-local-official-source-manifest');
  if(digest(root+'c1c35r1-locked-corpus-review-intake.json')!=='f05436dacf75d8d1924c8299b8524d46fe8591a5605b5d3e2a42bf484f242277'||
    digest(root+'c1c35r1-page-review-receipt.json')!=='a5352b209af8de2d39f618a3bcc321975ac8144272a20159273c6659ff4bf786') throw new Error('Residual reviewed receipts changed');
  const intake=read('c1c35r1-locked-corpus-review-intake');
  if(intake.files.length!==manifest.files.length||intake.files.some((r:any)=>!manifest.files.some((f:any)=>f.relativePath===r.relativePath&&f.sha256===r.sha256))) throw new Error('Locked intake mismatch');
  for(const e of read('c1c35r1-page-review-receipt').extracts) {
    if(digest(e.path)!==e.sha256||!manifest.files.some((f:any)=>f.relativePath===e.sourceReference.relativePath&&f.sha256===e.sourceReference.sha256&&f.pages.some((p:any)=>p.page===e.sourceReference.page))) throw new Error('Unbound reviewed page');
  }
  for(const [path,hash] of Object.entries(a['source-closure'].inputHashes)) {
    if(digest(path)!==hash) throw new Error('Input hash drift');
    if(!path.includes('c1c35r1-')&&createHash('sha256').update(execFileSync('git',['show',`${baseline}:${path}`],{maxBuffer:16*1024*1024})).digest('hex')!==hash) throw new Error('Frozen input changed');
  }
  if(JSON.stringify(a)!==JSON.stringify(buildResidualContract())) throw new Error('Residual contract drift');
}

// Audit oracle only: reuses ordering, with no RNG, damage, save migration or BattleState mutation.
export function expectedPewTargets(heroes:BattleUnit[],placements:Record<string,string>,targetableIds:string[],areaId:string) {
  return heroes.filter(h=>h.isAlive&&targetableIds.includes(h.id)&&placements[h.id]===areaId).sort(compareCommunityTargetPriority).map(h=>h.id);
}
export function validatePewReload(expected:any,reloaded:any) {
  for(const field of saveFields) {
    const lookup=(value:any)=>field.split('.').reduce((v,k)=>v?.[k],value);
    if(lookup(expected)===undefined||JSON.stringify(lookup(expected))!==JSON.stringify(lookup(reloaded))) throw new Error('Persisted attack changed: '+field);
  }
}
export function validatePewTransactions(expected:any[],actual:any[]) {
  if(expected.length!==actual.length) throw new Error('Merged/missing Pew transaction');
  for(let i=0;i<expected.length;i++) if(JSON.stringify(expected[i])!==JSON.stringify(actual[i])) throw new Error('Pew transaction targets/order/roll changed');
}
const filename=(n:string)=>(n==='next-workstream-decision'?'c1c35r1-':'c1c35r1-prophet-')+n;
if(process.argv.includes('--write-r1')||process.argv.includes('--verify-r1')) {
  const expected=buildResidualContract();
  const a=process.argv.includes('--write-r1')?expected:Object.fromEntries(Object.keys(expected).map(n=>[n,read(filename(n))]));
  verifyResidualContract(a);
  if(process.argv.includes('--write-r1')) for(const [n,value] of Object.entries(a)) writeFileSync(root+filename(n)+'.json',JSON.stringify(value,null,2)+'\n');
  console.log('C1C35R1 PASS: 21/22 executable contracts closed; PROPHET_GATE_A_BLOCKED_ON_AREA_C_CAPACITY; runtime unchanged.');
}
