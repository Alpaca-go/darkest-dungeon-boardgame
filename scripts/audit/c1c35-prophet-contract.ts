import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { verifyCurrentFreeze } from './historical-baseline';

const root = 'docs/data/complete-edition/';
export const baseline = '051c2c400d391543f5c436cbaa141a54bdf19ac1';
export const ruleSetVersion = 'C1C35-PROPHET-DIGITAL-DEFAULT-v1';
const read = (name: string): any => JSON.parse(readFileSync(root + name + '.json', 'utf8'));
export const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const common = { schemaVersion: 1, phase: '11A.4-C1C35', baseline,
  predecessor: 'C1C34-SUCCESSOR-BINDING-v1', policyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1',
  ruleSetVersion, foundationExecutionAllowed: false, gameplayChanged: false, productionPromotion: false };
export type Artifacts = Record<string, any>;

export function buildProphetContract(): Artifacts {
  const predecessor = read('c1c34-prophet-source-rebaseline');
  const review = read('c1c35-locked-page-review');
  const page = (name: string, number: number, location: string) => {
    const extract = review.extracts.find((e: any) => e.sourceReference.relativePath.endsWith(name) && e.sourceReference.page === number);
    if (!extract) throw new Error('Missing reviewed page');
    return { ...extract.sourceReference, location, extractPath: extract.path, extractSha256: extract.sha256 };
  };
  const tileSource = page('DD_COREBOX_TILES_FRONT.pdf', 6, 'Printed Ruins Tile 11; north at printed 11; excludes crop marks');
  const roomSource = page('DD_EN_COREBOX_CARDS_63x88_rooms_FRONT.pdf', 11, 'Printed Room 11 miniature Tile illustration');
  const rule = (p: number, location: string) => page('DD_EN_COREBOX_RULES.pdf', p, location);
  const source = (field: string) => ({ ...tileSource, location: `${tileSource.location}; ${field}` });
  const id = (label: string) => `ruins-tile-11:${label}`;
  // Labels are project identifiers for directly observed printed regions, not prototype coordinates.
  const regions: [string, number | null, number[]][] = [
    ['NW',4,[1,2]], ['N',3,[3]], ['NE',3,[4]], ['W',3,[5]],
    ['C',null,[6]], ['E',4,[7,8]], ['SW',3,[9]], ['S',3,[10]],
  ];
  const edges = [['NW','N'],['N','NE'],['NW','W'],['N','C'],['NE','E'],
    ['W','C'],['C','E'],['W','SW'],['W','S'],['C','S'],['E','S'],['SW','S']];
  const missingCapacity = 'Area C (printed d10 6) has no visible occupancy dots. The locked rulebook p18 identifies occupancy icons but supplies no numeric default for an unmarked Area. Absence is not authority for zero, infinity, four, or a prototype value.';
  const tile = { ...common, status:'SOURCE_UNRESOLVED', canonical:false, tileId:'ruins-tile-11', roomId:'ruins-room-11',
    spatialRelationToRoom11:{status:'OFFICIAL_SOURCE',value:'Room 11 depicts the same printed Tile 11',sourceReferences:[tileSource,roomSource]},
    tileIdentity:{status:'OFFICIAL_SOURCE',value:11,sourceReferences:[tileSource]},
    areas:regions.map(([label,capacity,rolls]) => ({ id:id(label),printedRolls:rolls,
      identity:{status:'OFFICIAL_SOURCE',sourceReferences:[source(`region bearing ${rolls.join('/')}`)]},
      capacity:{status:capacity === null ? 'SOURCE_UNRESOLVED':'OFFICIAL_SOURCE',value:capacity,
        sourceReferences:[source(`occupancy dots in ${label}`),rule(18,'Move / Occupancy number/icon')],
        ...(capacity === null ? {reason:missingCapacity}: {})},
      adjacent:edges.filter(e=>e.includes(label)).map(e=>id(e.find(v=>v!==label)!)).sort(),
      adjacencySourceReferences:[source(`shared printed boundaries of ${label}`)] })),
    stancePositions:{status:'OFFICIAL_SOURCE',heroes:{aggressive:id('NE'),defensive:id('S'),ranged:id('S'),support:id('W')},
      monsters:{aggressive:id('C'),defensive:null,ranged:null,support:null},
      absentMonsterStances:'Not printed; no invented fallback',sourceReferences:[source('yellow Hero / red Monster Stance icons')]},
    prophetPlacement:{status:'OFFICIAL_SOURCE',areaId:id('C'),sourceReferences:[source('red Aggressive icon'),rule(38,'Prophet setup step 2')]},
    pewEligibleAreas:{status:'OFFICIAL_SOURCE',areaIds:regions.map(([label])=>id(label)),sourceReferences:[tileSource,rule(38,'Prophet first turn')]},
    unresolvedFields:['areas.ruins-tile-11:C.capacity'], reason:missingCapacity,
    nonCanonicalDigitalBoardRepresentation:null, executable:false };
  const map = { ...common,status:'OFFICIAL_SOURCE',canonical:true,executable:false,tileId:tile.tileId,
    mapVersion:'C1C35-PROPHET-PRINTED-D10-v1',sourceReferences:[tileSource,roomSource],
    entries:regions.flatMap(([label,,rolls])=>rolls.map(roll=>({roll,areaId:id(label)}))).sort((a,b)=>a.roll-b.roll),
    mapping:Object.fromEntries(regions.flatMap(([label,,rolls])=>rolls.map(roll=>[String(roll),id(label)]))),
    topologySource:{relativePath:tileSource.relativePath,sha256:tileSource.sha256,page:6},
    executionBlocker:'Tile capacity contract is incomplete; observed mapping alone does not enable placement.' };
  const glyph = (field: string, printedGlyph: string, semantic: any, pages: number[], primitive: string, timing: string, scope: string, save: string) => ({
    field,printedGlyph,normalizedSemantic:semantic,status:'OFFICIAL_SOURCE',authority:'OFFICIAL_SOURCE',canonical:true,
    sourceReferences:pages.map(p=>rule(p,field)),printedReferences:predecessor.items.filter((r:any)=>r.id.endsWith('-battle')).flatMap((r:any)=>r.sourceReferences),
    runtimePrimitive:primitive,timing,targetScope:scope,saveRequirement:save,executable:false });
  const glyphs: any[] = [
    glyph('Crowded','Crowded','Area with most Heroes', [24], 'shared target selection','before movement/range','Hero Areas','persist tied candidates'),
    glyph('range','curved range arrow + 1',{kind:'EXACT',distance:1},[19,24],'shared distance/movement','after target selection','selected Area','selected Area and movement decisions'),
    glyph('target-count','two / four yellow Hero icons',{eyeOnYou:2,fulminate:4,order:'Aggressive to Support'},[19,24],'shared Hero targets','before attack','Heroes in selected Area','ordered target identities'),
    glyph('Stress','black Stress +1',{type:'stress',amount:1},[20,21],'shared stress transaction','target effect after hit damage','hit targets','causal effect transaction'),
    glyph('Stun','yellow three diamonds 2t',{type:'stun',turns:2},[20,21],'shared conditions','target effect after hit; ticks at target turn start','hit targets','condition stacks and remaining turns'),
    glyph('Blight','green droplet 1/2/3 3t',{type:'blight',levelAmounts:[1,2,3],turns:3},[20,21],'shared conditions','target effect after hit; simultaneous condition wounds at turn start','hit targets','independent condition stacks'),
    glyph('immunities','yellow diamonds / cyan double chevron',{stun:true,shuffle:true},[21],'shared immunity filter','condition application','Prophet','source-bound immunities'),
    glyph('Unholy','Unholy',{tag:'Unholy'},[24],'shared Monster tags','classification','Prophet','definition identity and level'),
    glyph('Large','Large',{occupiedSpaces:2},[24],'shared capacity/displacement','movement/end of turn','Prophet Area','occupancy / displacement choice'),
    glyph('critical-and-damage','Crit / lightning / Acc',{valuesFrom:'independent C1C34 per-level reviewed card rows',oneRollPerArea:true},[19,20,24],'shared attack/damage','roll then individual hit comparison; critical stress window','selected Heroes','shared RNG cursor / damage causal events'),
    {field:'Rubble special target',printedGlyph:'Special; no Hero count or range printed',normalizedSemantic:{areas:'each Pew Area',rolls:'one per Pew',sameArea:'can attack twice'},
      status:'SOURCE_UNRESOLVED',authority:'SOURCE_UNRESOLVED',canonical:false,
      sourceReferences:[rule(38,'Prophet third turn'),rule(39,'Prophet continuation')],
      runtimePrimitive:'shared attack/damage',timing:'ordinal 3 after placement',targetScope:null,
      saveRequirement:'explicit target set per independent Pew attack',executable:false,
      reason:'Special rules identify attacked Areas and independent rolls, but no explicit number of affected Heroes is printed. A versioned all-Hero target-scope ruling is needed before execution; no inference from a visual icon.'},
  ];
  const rulings = { ...common,authority:'PROJECT_RULING',canonical:false,canonicalStatus:'SOURCE_UNRESOLVED',
    inheritsNecromancerRulings:false,executionEnabled:false,rulings:[
      {id:'crowded-area-tie',version:ruleSetVersion,authority:'PROJECT_RULING',canonical:false,
        qualifies:'Count living targetable Heroes by Area; maximum positive count across the bound Tile, before range movement; no Heroes means no target.',
        candidateGeneration:'All maximum-count valid Tile Areas; preserve count and actor identities used to generate candidates.',
        tie:'One candidate resolves directly; multiple require explicit player PendingChoice.',playerChoiceRequired:true,rngAllowed:false,
        stableOrdering:'Ascending Area ID using code-point comparison; ordering is display only, never implicit selection.',
        saveRepresentation:['ruleSetVersion','choiceId','actionKey','candidateAreaIds','candidateHeroIds','occupancySnapshot','selectedAreaId'],
        invalidSelection:'Reject missing candidates, unknown selection, stale occupancy, forged actor IDs, wrong action key/version; no RNG consumed.'},
      {id:'pew-attack-order-and-save',version:ruleSetVersion,authority:'PROJECT_RULING',canonical:false,
        attackOrdering:'Physical copy ordinal 1, 2, 3, 4 explicitly, independent of array/storage order.',
        sameArea:'Each active Pew gets an independent attack/roll even when another Pew has attacked that Area.',
        cursor:'0..4 completed Pew transactions; pendingPewAttack stores copy ordinal, targets, roll and phase.',
        damageTransaction:'Use shared attack/damage; freeze target order by authoritative Hero Stance then stable actor ID; journal transaction ID before cursor advancement.',
        deathWindows:'Resolve shared death/Death Door and stress windows for each target before next target; complete all targets before next Pew.',
        conditionWindows:'Apply target effects only on hit after damage; generic condition ticks remain at actor turn start, not at Pew boundaries.',
        interruption:'Persist pending attack phase, resolved target IDs, RNG cursor and causal events when shared PendingChoice interrupts.',
        resume:'Continue uncommitted target/phase from journal; never reroll a stored roll or repeat committed damage/death events.',
        removedInvalidTarget:'A legally removed dead Hero is skipped with causal event; forged/unknown Area, copy or actor fails validation. Empty Area still consumes its Pew attack roll.',
        roundReset:'Require prior sequence complete; reuse four physical copy IDs, atomically clear old placements and assign four new shared-stream rolls; no stale ownership.',
        victory:'Cancel remaining attacks, return all four physical Pews once, retain causal journal.',
        dependencies:['source-bound complete Tile','explicit Rubble target-scope contract','shared RNG/transaction primitives'],
        saveRepresentation:['ruleSetVersion','orderedPhysicalCopyIds','rubbleCursor','pendingPewAttack','resolvedActionKeys','causalEvents','shared RNG checkpoint']},
    ] };
  const rows = structuredClone(predecessor.items);
  for (const row of rows) {
    row.executable = false;
    if(row.id==='d10-area-mapping') Object.assign(row,{status:'OFFICIAL_SOURCE',canonical:true,value:map.mapping,sourceReferences:map.sourceReferences,reason:map.executionBlocker});
    if(row.id==='tile') Object.assign(row,{status:'SOURCE_UNRESOLVED',canonical:false,value:null,sourceReferences:[tileSource,rule(18,'Occupancy icon')],reason:missingCapacity});
    if(['crowded-area-tie','pew-attack-order-and-save'].includes(row.id)) Object.assign(row,{status:'PROJECT_RULING',canonical:false,value:rulings.rulings.find(r=>r.id===row.id),sourceReferences:[],reason:'Explicit Prophet-only versioned contract; not runtime implementation or official rule.'});
    if(row.id==='target-effect-glyph-binding') Object.assign(row,{reason:glyphs[glyphs.length-1].reason});
  }
  const blockers = rows.filter((r:any)=>!['OFFICIAL_SOURCE','PROJECT_RULING'].includes(r.status)).map((r:any)=>r.id);
  const paths = read('c1c34-prophet-production-dependency-matrix').executionPaths.map((p:any)=>({...p,executable:false,status:'BLOCKED_GATE_A',
    unresolvedDependencies:p.requiredFields.filter((f:string)=>blockers.includes(f)),gateARequired:true}));
  const inputNames = ['rule-source-policy','c1c34-prophet-source-rebaseline','c1c34-next-workstream-decision',
    'c1c34-prophet-production-dependency-matrix','c1c32r2-local-official-source-manifest','c1c35-locked-page-review'];
  const inputHashes = Object.fromEntries(inputNames.map(n=>[root+n+'.json',digest(root+n+'.json')]));
  return {
    'source-closure':{...common,inputHashes,requiredFieldCount:22,items:rows,blockers,externalAcquisition:false,prototypeAsAuthority:false,
      gateA:{passed:false,stopReason:'PROPHET_FOUNDATION_BLOCKED_ON_SPATIAL_SOURCE',secondaryStopReason:'PROPHET_FOUNDATION_BLOCKED_ON_SEMANTIC_SOURCE'},gateB:{started:false}},
    'tile-contract':tile, 'd10-area-map':map,
    'glyph-semantic-contract':{...common,status:'SOURCE_UNRESOLVED',bindings:glyphs,unresolvedFields:['Rubble special target.targetScope']},
    'project-rulings':rulings,
    'production-definitions':{...common,status:'NOT_CREATED_GATE_A_BLOCKED',definitions:[],
      levelSourceCandidates:[1,2,3].map(level=>({level,status:'SOURCE_REVIEW_ONLY',items:rows.filter((r:any)=>r.id.startsWith(`level-${level}-`))})),
      prohibitedFallbacks:['PROPHET_PROTOTYPE_ROOM','Phase 9C values','prototype RNG','migrateProphetSave','repairProphetRuntime']},
    'runtime-capability-matrix':{...common,executionPaths:paths,executablePaths:0,
      deferredAcceptance:['shared RNG only','three ordinals','four physical Pews','same-Area double attack','Crowded PendingChoice','Rubble cursor',
        'ordinal 1 reload','ordinal 2 choice reload','Pew 1/4 reload','Pew 3/4 reload','Threat Level I/II/III','victory cleanup']},
    'save-contract':{...common,status:'NOT_IMPLEMENTED_GATE_A_BLOCKED',productionSaveSchemaChanged:false,silentRepairAllowed:false,
      requiredFailClosedChecks:['ruleset mismatch','tile/map mismatch','invalid Pew count','duplicate Pew ownership','invalid Area','placement roll mismatch',
        'invalid action ordinal','duplicate resolved action','invalid Rubble cursor','missing PendingChoice candidates','forged choice','RNG continuation mismatch','Threat identity mismatch','Room identity mismatch'],
      rulingReferences:rulings.rulings.map(r=>({id:r.id,version:r.version})),replayProof:null},
    'foundation-proof':{...common,status:'BLOCKED_NOT_RUNTIME_PROOF',gateAPassed:false,gateBStarted:false,
      sourceReview:'Locked Tile front p6 and Room front p11 inspected; d10 mapping recovered; central capacity and Rubble target scope remain unresolved.',
      immutableNecromancerCommit:'e1fcfac0692eb91c5710552ac93e3bacb25f0240',productionTestsPerformed:false,browserAcceptancePerformed:false},
    'next-workstream-decision':{...common,outcome:'PROPHET_PRODUCTION_FOUNDATION_BLOCKED',
      status:'PROPHET_FOUNDATION_BLOCKED_ON_SPATIAL_SOURCE',secondaryStatus:'PROPHET_FOUNDATION_BLOCKED_ON_SEMANTIC_SOURCE',blockers,
      next:'Resolve Tile C capacity from allowed locked authority or explicitly authorize a non-canonical digital board representation; then close Rubble target scope and re-run Gate A.',
      c1c36FullPathAllowed:false,productionReady:false,productionAccepted:false,unrestrictedSelectorAllowed:false,controlledFoundationRouteAllowed:false},
  };
}

// Array form detects duplicate keys before conversion to an object can discard them.
export function validatePrintedMap(map: any, tile: any) {
  if(map.entries.length!==10) throw new Error('Exactly ten d10 entries required');
  const seen = new Set<number>();
  for(const entry of map.entries) {
    if(!Number.isInteger(entry.roll)||entry.roll<1||entry.roll>10||seen.has(entry.roll)) throw new Error('Duplicate/malformed d10 key');
    seen.add(entry.roll);
    if(!tile.areas.some((a:any)=>a.id===entry.areaId)||!entry.areaId.startsWith('ruins-tile-11:')) throw new Error('Invalid/prototype Area');
    if(map.mapping[String(entry.roll)]!==entry.areaId) throw new Error('Map representation mismatch');
  }
  if(Object.keys(map.mapping).length!==10||Object.keys(map.mapping).some(k=>! /^(10|[1-9])$/.test(k))) throw new Error('Malformed map keys');
  const topology = tile.tileIdentity.sourceReferences[0];
  if(map.tileId!==tile.tileId||map.topologySource.sha256!==topology.sha256||map.topologySource.page!==topology.page||map.topologySource.relativePath!==topology.relativePath) throw new Error('Topology/map source mismatch');
}

export function verifyProphetContract(artifacts: Artifacts) {
  verifyCurrentFreeze();
  execFileSync('git',['diff','--exit-code',baseline,'--','src/game-engine','src/data','src/types','e2e','docs/DD_EN_COREBOX_RULES.pdf'],{stdio:'pipe'});
  const reviewedPagesHash='3a4cd07d7ed12a434f63cb2650c1530f2261c30c38da02974c90ad1ca6075b06';
  if(digest(root+'c1c35-locked-page-review.json')!==reviewedPagesHash) throw new Error('C1C35 page review receipt changed');
  const locked = read('c1c32r2-local-official-source-manifest');
  const review = read('c1c35-locked-page-review');
  for(const extract of review.extracts) {
    const original = locked.files.find((f:any)=>f.relativePath===extract.sourceReference.relativePath);
    if(!original||original.sha256!==extract.sourceReference.sha256||!original.pages.some((p:any)=>p.page===extract.sourceReference.page)) throw new Error('Extract not bound to locked page');
    if(digest(extract.path)!==extract.sha256) throw new Error('Reviewed page bytes changed');
  }
  const closure=artifacts['source-closure'];
  const expectedIds=read('c1c34-next-workstream-decision').contract.requiredFields;
  if(closure.items.length!==22||new Set(closure.items.map((r:any)=>r.id)).size!==22||expectedIds.some((id:string)=>!closure.items.some((r:any)=>r.id===id))) throw new Error('22 required fields not accounted for');
  for(const artifact of Object.values(artifacts)) if(artifact.foundationExecutionAllowed!==false||artifact.gameplayChanged!==false||artifact.productionPromotion!==false) throw new Error('Blocked foundation promoted');
  const tile=artifacts['tile-contract'];
  validatePrintedMap(artifacts['d10-area-map'],tile);
  if(tile.status!=='SOURCE_UNRESOLVED'||tile.areas.find((a:any)=>a.id==='ruins-tile-11:C').capacity.value!==null) throw new Error('Unmarked capacity guessed');
  if(artifacts['production-definitions'].definitions.length||artifacts['runtime-capability-matrix'].executablePaths||artifacts['save-contract'].replayProof) throw new Error('False runtime proof');
  for(const [path,hash] of Object.entries(closure.inputHashes)) {
    if(digest(path)!==hash) throw new Error('Source input hash drift');
    if(!path.endsWith('c1c35-locked-page-review.json')) {
      const frozen=execFileSync('git',['show',`${baseline}:${path}`],{maxBuffer:16*1024*1024});
      if(createHash('sha256').update(frozen).digest('hex')!==hash) throw new Error('Predecessor source modified');
    }
  }
  // Compare reviewed values only after independent identity/hash/gate/map checks.
  const expected=buildProphetContract();
  if(JSON.stringify(artifacts)!==JSON.stringify(expected)) throw new Error('C1C35 deterministic contract drift');
}

if(process.argv.includes('--write')||process.argv.includes('--verify')) {
  const expected=buildProphetContract();
  const artifacts=process.argv.includes('--write')?expected:Object.fromEntries(Object.keys(expected).map(n=>[n,read((n==='next-workstream-decision'?'c1c35-':'c1c35-prophet-')+n)]));
  verifyProphetContract(artifacts);
  if(process.argv.includes('--write')) for(const [name,value] of Object.entries(artifacts)) writeFileSync(root+(name==='next-workstream-decision'?'c1c35-':'c1c35-prophet-')+name+'.json',JSON.stringify(value,null,2)+'\n');
  console.log('C1C35 contract audit PASS; PROPHET_FOUNDATION_BLOCKED_ON_SPATIAL_SOURCE; production gameplay unchanged.');
}
