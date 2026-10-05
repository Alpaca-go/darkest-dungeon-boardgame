/** C3A offline authoring and FAST-GATE. No runtime imports or external acquisition. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { reviewedPrints } from './c3a-reviewed-print';
import type { ProductionMonsterRecord, MonsterSourceReference, MonsterStanceBehavior } from '../../src/data/monsters/production-monster-types';

export const C3A_BASELINE = 'b983cea103e2a50e4ad9ba68357bb924a77483a8';
const root = 'docs/data/complete-edition/';
const read = (path: string): any => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const hash = (path: string) => createHash('sha256').update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const slug = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const check = (ok: unknown, reason: string): void => { if (!ok) throw new Error('C3A: ' + reason); };
const stances = ['aggressive','defensive','ranged','support'];
const sets: Record<string, string> = { COREBOX:'core', CRIMSONCourt:'crimson-court', WARRENS:'warrens', COVE:'cove', WEALD:'weald', COM:'color-of-madness' };
// Classification boundary only, using the frozen Boss inventory and official component faces.
// A face outside this list or the ordinary review is an omission and fails the census.
const excludedRoles: Record<string, string> = {};
for(const names of [
  ['BOSS_IDENTITY','Prophet','Fanatic','Necromancer','The Collector','Countess','Garden Guardian','Viscount','Baron','Brigand Vvulf','Swine Prince','Shambler','Siren','Drowned Crew','Shrieker','Hag','Brigand Pounder','The Miller','Thing from the Stars','The Sleeper','Master Webber'],
  ['BOSS_ADD_OR_COMPONENT','Pyre','Collected Highwayman','Collected Man-at-Arms','Collected Vestal','Emaciated Body','Body','Bloodstuffed Body','Blood Fount','Stone Shield','Wilbur','Flesh Head','Flesh Bone','Flesh Heart','Flesh Butt','Shambler Tentacle','Drowned Anchorman','Shrieker’s Nest','Cauldron Empty','Brigand Matchman','Frozen Farmhand','Focus Point/Abberation'],
  ['SPECIAL_FINAL_ENCOUNTER_COMPONENT','Perfect Reflection','Imperfect Reflection','Templar Warlord','Templar Impaler','Mammoth Cyst','Shuffling Horror','Ancestor 2','Gestating Heart','Heart of Darkness','White Cell Stalk','Ancestor 1','Sleeper’s Dream'],
  ['CURIO_SPAWN_COMPONENT','Spawn Curios'],
]) for(const name of names.slice(1))excludedRoles[name]=names[0];
const frozen = ['c1c32r2-ruins-monster-definitions.json','c1c32r2a-ruins-monster-executable-definitions.json','c1c32r2-ruins-monster-deck-contract.json','c1c32r2a-ruins-monster-effect-contract.json'];
const common = { schemaVersion:1, phase:'11A.6-C3A', policyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1', baseline:C3A_BASELINE };
const archivePath = root+'source-assets/c1c38r1/repository-source-inventory.json';
const receiptPath = root+'c3a-monster-print-extracts.json';

/** Imports hash-verified scratch extraction once; checked-in receipts support offline CI. */
export function intakeC3APrints(): void {
  const extracted = read('tmp/c3a/extracted.json');
  const archive = read(archivePath);
  const accepted = read(root+frozen[1]).definitions;
  const files = extracted.filter((f:any) => !f.fileName.includes('BOARD')).map((f:any) => {
    check(archive.archiveFiles.some((s:any) => s.path.endsWith('/'+f.relativePath) && s.sha256===f.sha256), 'unlocked PDF '+f.fileName);
    const set = Object.keys(sets).find(k=>f.fileName.includes('DD_EN_'+k+'_CARDS'));
    const large = /140x140/.test(f.fileName);
    const observations = f.pages.map((p:any) => {
      const review = reviewedPrints.find(r=>r.set===set && (large ? r.largePages?.includes(p.page) : p.page>=r.page && p.page<=r.end) && !f.fileName.includes('_ADD'));
      const anchor = accepted.find((r:any)=>r.sourceReferences.some((s:any)=>s.relativePath===f.relativePath&&s.page===p.page));
      // Repeated Ruins copies have the same exact extracted face; this matches only printed text.
      const anchorFace = !large && !f.fileName.includes('_ADD') ? accepted.find((r:any)=>p.text.split('\n').filter((t:string)=>t.trim()===r.printedName).length>=2 && p.page<=62) : null;
      const nameSpan = p.spans.find((s:any)=>s.font==='DwarvenAxeBB'&&s.size>=14&&s.bbox[1]<50&&/[A-Za-z]/.test(s.text));
      const monsterId = review ? slug(review.name)+(review.set==='COM'?'-level-'+review.level:'') : anchor?.canonicalId ?? anchorFace?.canonicalId ?? null;
      const classification = review||anchor||anchorFace ? (large?'ORDINARY_COMBAT_PANEL':'ORDINARY_DECK_CARD') : 'BOSS_OR_SPECIAL_COMPONENT_EXCLUDED';
      const printedName=(review?.name??anchor?.printedName??anchorFace?.printedName??nameSpan?.text??'Spawn Curios').trim();
      check(monsterId||excludedRoles[printedName],'unclassified printed component '+printedName);
      return { page:p.page, monsterId, printedName, classification, excludedRole:monsterId?null:excludedRoles[printedName],
        textSha256:digest(p.text), printedText: review && (large?p.page===review.largePages?.[0]:p.page===review.page) ? p.text : null };
    });
    return { relativePath:f.relativePath, fileName:f.fileName, sha256:f.sha256, pageCount:f.pages.length, observations };
  });
  writeFileSync(receiptPath, JSON.stringify({...common, archiveInventory:archivePath, archiveInventorySha256:hash(archivePath),
    externalAcquisition:false, excludedOldVersions:true, textExtractionIsNotSemanticAuthority:true,
    authorityBasis:'Publisher print content, corroborated by accepted official intake. Archive and transport paths are locators only.',
    visualReviewScope:'New ordinary representative front faces, combat panels, profile glyphs, skill glyphs and stance tables. Identical text copies are count locators, not separate visual-review claims.',
    copyCountBasis:'Printed ordinary deck-card faces only. Large combat panels are companion components, not extra draw copies. Miniature/summon supply is separate and unresolved where not previously bound.',
    files},null,2)+'\n');
}

export function buildC3AArtifacts(): Record<string, any> {
  const receipt = read(receiptPath);
  const archive = read(archivePath);
  const ruins = read(root+frozen[1]).definitions;
  const originalRuins = read(root+frozen[0]).definitions;
  const records: ProductionMonsterRecord[] = [];
  const issues: any[] = [];
  const bindings: MonsterSourceReference[] = [];
  const issue = (monsterId: string | null, category: string, field: string, reason: string, extra: object = {}) => {
    const id = 'C3A-'+String(issues.length+1).padStart(4,'0');
    issues.push({id,monsterId,category,field,reason,status:'DEFERRED',
      sourceStatus:category==='UNRESOLVED_EFFECT_SEMANTIC'||category==='PHYSICAL_COPY_UNRESOLVED'?'SOURCE_UNRESOLVED':category==='DEFERRED_MANUAL_VALIDATION'?'DEFERRED_MANUAL_VALIDATION':'NOT_APPLICABLE',
      blocksC3A:false,recommendedPhase:category==='RUNTIME_NOT_IMPLEMENTED'?'C3C':'C3B',...extra});
    return id;
  };
  const reference = (relativePath:string, page:number, monsterId:string, location:string, visualReview:boolean): MonsterSourceReference => {
    const s = archive.archiveFiles.find((f:any)=>f.path.endsWith('/'+relativePath));
    check(s,'source reference absent from lock: '+relativePath);
    const ref: MonsterSourceReference = {bindingId:monsterId+':'+(relativePath.includes('_BACK')?'back':'front')+':'+digest(relativePath).slice(0,8)+':p'+page,
      relativePath,fileName:relativePath.split('/').pop()!,sha256:s.sha256,page,location,componentId:monsterId,sourceClass:'OFFICIAL_PRINTED_COMPONENT',visualReview};
    check(page>=1&&page<=s.pageCount,'source page bounds');
    if (!bindings.some(b=>b.bindingId===ref.bindingId)) bindings.push(ref);
    return ref;
  };
  for (const d of ruins) {
    const refs = d.sourceReferences.map((s:any)=>reference(s.relativePath,s.page,d.canonicalId,s.location,s.visualReview));
    const sourceBindingIds = refs.map((s:MonsterSourceReference)=>s.bindingId);
    records.push({monsterId:d.canonicalId,printedName:d.printedName,contentSet:'core',group:d.group,printedLevel:d.printedLevel,drawEligibleFromLevel:d.drawEligibleFromLevel,
      sourceStatus:'OFFICIAL_BOUND',sourceBindingIds,
      profile:{monsterId:d.canonicalId,size:d.size,occupiedSpaces:d.occupiedSpaces,stanceSlots:d.stanceSlots,life:d.life,speed:d.speed,dodge:d.dodge,deployment:d.deployment,
        tags:d.tags,resistances:d.resistances,immunities:d.immunities,protection:d.printedProtection,copyCount:d.copyCount,physicalCopyIds:d.physicalCopyIds,
        sourceCardIds:originalRuins.find((r:any)=>r.canonicalId===d.canonicalId).sourceCardIds,sourceBindingIds,status:'SOURCE_BOUND',unresolvedFields:[],printedAbsences:[]},
      actions:d.skills.map((s:any)=>({monsterId:d.canonicalId,number:s.number,actionId:d.canonicalId+':action-'+s.number,printedName:s.name,
        range:s.range,targets:s.targets,targeting:{...s.targeting,targetSide:s.targetSide},attack:s.attack,
        printedEffects:s.effects,printedText:null,sourceBindingIds,semanticStatus:'SOURCE_BOUND',unresolvedFields:[],printedAbsences:[]})),
      selection:{monsterId:d.canonicalId,status:'SOURCE_BOUND',sourceBindingIds,stanceBehavior:Object.fromEntries(Object.entries(d.stanceBehavior).map(([stance,b]:[string,any])=>
        [stance,b.kind==='SKILL_TABLE'?{kind:b.kind,rows:b.rows.map((r:any)=>({min:r.min,max:r.max,actionId:d.canonicalId+':action-'+r.skill}))}:b]))},
      sourceReferences:refs,printedText:originalRuins.find((r:any)=>r.canonicalId===d.canonicalId).printedText??null});
    for (const m of originalRuins.find((r:any)=>r.canonicalId===d.canonicalId).sourceMismatches??[]) issue(d.canonicalId,'LEGACY_DATA_MISMATCH',m.field,
      'Accepted historical value differs from official print; frozen rule sets remain unchanged.',{historicalValue:m.historicalValue,officialValue:m.officialValue,affectedRulesets:m.affectedRulesets});
  }
  for (const r of reviewedPrints) {
    const monsterId=slug(r.name)+(r.set==='COM'?'-level-'+r.level:'');
    const deck = receipt.files.find((f:any)=>f.fileName.includes('DD_EN_'+r.set+'_CARDS_70_120_monsters')&&!f.fileName.includes('_ADD'));
    const panel = r.largePages ? receipt.files.find((f:any)=>f.fileName.includes('DD_EN_'+r.set+'_CARDS_140x140')) : null;
    const face = (panel??deck).observations.find((p:any)=>p.page===(r.largePages?.[0]??r.page));
    check(face?.monsterId===monsterId&&face.printedText,'reviewed face identity');
    const sourceRefs=[reference(deck.relativePath,r.page,monsterId,'whole ordinary deck-card front',true),
      reference(deck.relativePath.replace('_FRONT','_BACK'),r.page,monsterId,'paired printed back; page locator, not runtime level inference',false)];
    if(panel) for(const p of r.largePages!) sourceRefs.push(reference(panel.relativePath,p,monsterId,'large ordinary combat panel',p===r.largePages![0]));
    const sourceBindingIds=sourceRefs.map(s=>s.bindingId);
    const header=face.printedText.split('\n').find((s:string)=>/Front|Back/.test(s)&&/Human|Beast|Unholy|Eldritch/.test(s));
    // Swinetaur medium header wraps; combat panels carry the complete printed header.
    check(header,'printed taxonomy '+monsterId);
    const size=header.includes('Large')?'LARGE':header.includes('Small')?'SMALL':'NORMAL';
    const actions=r.actions.map((a, index)=>{
      const [printedName,range,targets,priority,attack,effects]=a;
      const unresolvedFields=effects.some(e=>/printed-red-card-glyph/.test(e))?['cardGlyphSemantic']:[];
      if(unresolvedFields.length) issue(monsterId,'UNRESOLVED_EFFECT_SEMANTIC','action-'+(index+1)+'.cardGlyphSemantic',
        'Printed card glyph is preserved. Card-family dispatch/acquisition semantics are not promoted by C3A.',{sourceBindingIds});
      return {monsterId,number:index+1,actionId:monsterId+':action-'+(index+1),printedName,
        range:range===null?null:{kind:'EXACT',distance:range},targets,
        targeting:{priority:priority.replace('Marked -> ',''),markedFirst:priority.startsWith('Marked'),
          targetSide:priority==='Self'?'self':priority.includes('Monster')?'monster':'hero'},
        attack:Array.isArray(attack)?{kind:'ROLL',accuracy:attack[0],damage:attack[1],crit:attack[2],critDamage:attack[3]}:
          typeof attack==='number'?{kind:'ACCURACY_ONLY',accuracy:attack}:{kind:'PRINTED_ABSENT'},
        printedEffects:effects.map(text=>({kind:'PRINTED_LITERAL',text,canonical:true,executable:false})),printedText:null,
        sourceBindingIds,semanticStatus:unresolvedFields.length?'SOURCE_PARTIAL' as const:'SOURCE_BOUND' as const,unresolvedFields,
        printedAbsences:[...(range===null?['range']:[]),...(targets===null?['targetCount']:[]),...(attack===null?['attack']:[])]};
    });
    const stanceBehavior=Object.fromEntries(r.stances.map((token,index):[string,MonsterStanceBehavior]=>{
      if(token==='-') return [stances[index],{kind:'NO_ACTION'}];
      if(['a','d','r','s'].includes(token)) return [stances[index],{kind:'INHERITS',stance:stances[['a','d','r','s'].indexOf(token)]}];
      return [stances[index],{kind:'SKILL_TABLE',rows:token.split(',').map(part=>{
        const [skill,range]=part.split(':');const [min,max]=range?range.split('-').map(Number):[1,10];
        return {min,max,actionId:monsterId+':action-'+skill};
      })}];
    }));
    const physicalCopyIds=Array.from({length:r.end-r.page+1},(_,i)=>'c3a-print:'+digest(deck.relativePath).slice(0,12)+':p'+(r.page+i));
    records.push({monsterId,printedName:r.name,contentSet:sets[r.set],group:r.set==='COREBOX'?'DARKEST_DUNGEON':sets[r.set].toUpperCase().replace(/-/g,'_'),
      printedLevel:r.level,drawEligibleFromLevel:null,sourceStatus:'OFFICIAL_BOUND',sourceBindingIds,
      profile:{monsterId,size,occupiedSpaces:size==='LARGE'?2:1,stanceSlots:size==='LARGE'?2:1,life:r.life,speed:r.speed,dodge:r.dodge,
        deployment:header.includes('Back')?'BACK':'FRONT',tags:header.split(' - ').filter((s:string)=>!['Front','Back','Small','Large'].includes(s)),
        resistances:r.resistances,immunities:r.immunities,protection:r.protection??false,copyCount:physicalCopyIds.length,physicalCopyIds,
        sourceCardIds:[],sourceBindingIds,status:'SOURCE_BOUND',unresolvedFields:[],printedAbsences:r.speed===null?['speed']:[]},
      actions,selection:{monsterId,status:'SOURCE_BOUND',sourceBindingIds,stanceBehavior},sourceReferences:sourceRefs,printedText:face.printedText});
    issue(monsterId,'UNRESOLVED_EFFECT_SEMANTIC','drawEligibleFromLevel','Printed level is captured. Eligibility/deck mixing across content sets is not inferred from card level.',{sourceBindingIds});
    if(r.set==='COM'&&r.name==='Crystalline Aberration')issue(monsterId,'PHYSICAL_COPY_UNRESOLVED','miniatureSupply',
      'One printed deck-card face per level is counted here. Available summon/miniature supply remains SOURCE_UNRESOLVED under the frozen C1C38R1 contract; print page count cannot settle it.',{sourceBindingIds});
    if(r.actions.some(a=>a[5].some(e=>/summon/.test(e))))issue(monsterId,'UNRESOLVED_EFFECT_SEMANTIC','summonTimingAndSupply',
      'Printed summon identity and amount are retained; supply exhaustion, placement, and timing await a separate source/ruling review.',{sourceBindingIds});
  }
  // Prototype comparisons are explicit exceptions, never an input to official data.
  const prototype = [{id:'bone-soldier',maxHp:20,speed:3},{id:'bone-arbalist',maxHp:14,speed:5},{id:'bone-courtier',maxHp:18,speed:4}];
  for(const p of prototype) {
    const official=records.find(r=>r.monsterId===p.id)!;
    for(const [field,old,value] of [['maxHp/life',p.maxHp,official.profile.life],['speed',p.speed,official.profile.speed]])
      if(old!==value) issue(p.id,'LEGACY_DATA_MISMATCH',String(field),'Phase 3 simplified prototype differs from official production content; prototype remains untouched.',{historicalValue:old,officialValue:value,legacyPath:'src/data/monsters.ts'});
    issue(p.id,'LEGACY_DATA_MISMATCH','skillsAndTargeting','Prototype skill names and simplified closest/random target rules are not the printed actions/tables. No runtime migration.',{legacyPath:'src/data/monster-skills.ts'});
  }
  issue(null,'RUNTIME_NOT_IMPLEMENTED','generalizedMonsterRuntime','C3A exports content only. Existing accepted Ruins runtime is preserved; generalized ordinary Monster execution is a C3C successor task.');
  issue(null,'PARTIAL_SOURCE','developmentCI','C3-INFRA-01: Current branch-push workflow runs historical Production release validation. Split a development fast gate in the tooling workstream; no push or CI rewrite is needed for this local content baseline.',{recommendedPhase:'INFRA'});
  issue(null,'DEFERRED_MANUAL_VALIDATION','repeatedCopyGlyphVariance',
    'Representative new front faces and large panels were visually transcribed. Repeated deck pages bind printed identity and copy count; full glyph/art variance review of every repeated copy is deferred. Text equality alone does not prove graphical equality.');
  const census=records.map(r=>({monsterId:r.monsterId,printedName:r.printedName,contentSet:r.contentSet,group:r.group,level:r.printedLevel,size:r.profile.size,copyCount:r.profile.copyCount,
    physicalCopyIds:r.profile.physicalCopyIds,profileStatus:r.profile.status,
    actionStatus:r.actions.every(a=>a.unresolvedFields.length===0)?'SOURCE_BOUND':'SOURCE_PARTIAL',
    actionDataStatus:'SOURCE_BOUND',stanceStatus:r.selection.status,sourceStatus:r.sourceStatus,sourceBindingIds:r.sourceBindingIds,
    legacyRuntimeStatus:ruins.some((d:any)=>d.canonicalId===r.monsterId)?'ACCEPTED_RUINS_RUNTIME_PRESERVED':'NOT_MIGRATED',
    productionRuntimeStatus:'NOT_IMPLEMENTED_IN_C3A',deferredIds:issues.filter(g=>g.monsterId===r.monsterId).map(g=>g.id)}));
  const counts={monsterCount:records.length,physicalCopyCount:records.reduce((n,r)=>n+(r.profile.copyCount??0),0),
    sourceBound:records.filter(r=>r.sourceStatus==='OFFICIAL_BOUND').length,sourcePartial:records.filter(r=>r.sourceStatus==='SOURCE_PARTIAL').length,
    sourceUnresolved:records.filter(r=>r.sourceStatus==='SOURCE_UNRESOLVED').length,
    profileComplete:records.filter(r=>r.profile.status==='SOURCE_BOUND').length,
    actionDataComplete:records.filter(r=>r.actions.length>0&&r.actions.every(a=>a.printedEffects!==null)).length,
    stanceDataComplete:records.filter(r=>r.selection.status==='SOURCE_BOUND').length,deferred:issues.length,legacyMismatchCount:issues.filter(i=>i.category==='LEGACY_DATA_MISMATCH').length};
  return {
    'c3a-monster-source-census.json':{...common,mode:'CONTENT_FIRST_FAST_GATE',copyCountBasis:receipt.copyCountBasis,
      sourceInventoryReceipt:receiptPath,sourceInventoryReceiptSha256:hash(receiptPath),monsters:census,
      excludedComponents:receipt.files.flatMap((f:any)=>f.observations.filter((p:any)=>p.classification==='BOSS_OR_SPECIAL_COMPONENT_EXCLUDED').map((p:any)=>
        ({relativePath:f.relativePath,sha256:f.sha256,page:p.page,printedName:p.printedName,role:p.excludedRole,reason:'Excluded from ordinary deck census by frozen Boss/special component identity; no rules or runtime re-audit.'})))},
    'c3a-monster-production-data.json':{...common,contentVersion:'C3A-MONSTER-CONTENT-v1',runtimeImplemented:false,prototypeSource:false,records,sourceBindings:bindings},
    'c3a-monster-source-gaps.json':{...common,issues},
    'c3a-monster-status.json':{...common,status:'COMPLETE',verdict:'C3A_MONSTER_DATA_REBASELINED',...counts,runtimeImplemented:false,productionAcceptance:false,next:'11A.6-C3B',
      countUnit:'canonical printed identity plus printed level form',actionDataCompleteMeaning:'Printed skill literals captured; does not assert executable semantics.',
      ruinsPreserved:{canonicalCount:ruins.length,physicalCopyCount:ruins.reduce((n:number,d:any)=>n+d.copyCount,0),runtimeChanged:false},
      frozenInputSha256:Object.fromEntries(frozen.map(f=>[root+f,hash(root+f)])),reviewInputSha256:{[archivePath]:hash(archivePath),[receiptPath]:hash(receiptPath),'scripts/audit/c3a-reviewed-print.ts':hash('scripts/audit/c3a-reviewed-print.ts')},
      bossChanged:false,heroChanged:false,fullRegressionExecuted:false,fullPlaywrightExecuted:false}
  };
}

export function auditC3A(data: any, census: any, gaps: any, receipt: any): void {
  const records=data.records as ProductionMonsterRecord[];
  const anchors=read(root+frozen[1]).definitions;
  check(new Set(records.map(r=>r.monsterId)).size===records.length,'duplicate canonical identity');
  const copies=records.flatMap(r=>r.profile.physicalCopyIds);
  check(new Set(copies).size===copies.length,'duplicate physicalCopyId');
  check(data.runtimeImplemented===false&&data.prototypeSource===false,'content boundary');
  const refs=new Map<string,MonsterSourceReference>(data.sourceBindings.map((s:MonsterSourceReference)=>[s.bindingId,s]));
  check(refs.size===data.sourceBindings.length,'duplicate source binding');
  const archive=read(archivePath);
  const expectedPrints=archive.archiveFiles.filter((s:any)=>/monster.*_FRONT(?:_ADD)?\.pdf$/i.test(s.path)&&!s.path.includes('Old_Version')&&!s.path.includes('BOARD'));
  check(expectedPrints.length===receipt.files.length&&expectedPrints.every((s:any)=>receipt.files.some((f:any)=>s.path.endsWith('/'+f.relativePath)&&s.sha256===f.sha256&&s.pageCount===f.pageCount)),'locked Monster print file coverage');
  for(const ref of refs.values()) {
    check(ref.relativePath&&ref.fileName&&/^[a-f0-9]{64}$/.test(ref.sha256)&&ref.location&&ref.componentId&&ref.page>0&&typeof ref.visualReview==='boolean','provenance fields');
    check(ref.sourceClass==='OFFICIAL_PRINTED_COMPONENT','authority');
    check(archive.archiveFiles.some((s:any)=>s.path.endsWith('/'+ref.relativePath)&&s.sha256===ref.sha256&&ref.page<=s.pageCount),'unlocked binding');
  }
  check(census.monsters.length===records.length,'census/data count mismatch');
  for(const r of records) {
    check(r.profile.monsterId===r.monsterId&&r.selection.monsterId===r.monsterId,'profile/selection owner');
    check(r.profile.copyCount===null||r.profile.copyCount===r.profile.physicalCopyIds.length,'copy count');
    for(const physicalId of r.profile.physicalCopyIds.filter(id=>id.startsWith('c3a-print:'))) {
      const [,fileHash,pageLabel]=physicalId.split(':');
      const file=receipt.files.find((f:any)=>digest(f.relativePath).slice(0,12)===fileHash);
      check(file?.observations.some((p:any)=>p.page===Number(pageLabel.slice(1))&&p.monsterId===r.monsterId&&p.classification==='ORDINARY_DECK_CARD'),'physical copy source locator');
    }
    for(const id of [...r.sourceBindingIds,...r.profile.sourceBindingIds,...r.selection.sourceBindingIds,...r.actions.flatMap(a=>a.sourceBindingIds)])
      check(refs.has(id)&&refs.get(id)!.componentId===r.monsterId,'unresolvable source-bound ID');
    check(r.sourceStatus!=='OFFICIAL_BOUND'||r.sourceReferences.some(s=>s.visualReview),'unreviewed source-bound identity');
    const actions=new Set(r.actions.map(a=>a.actionId));
    check(actions.size===r.actions.length&&r.actions.every(a=>a.monsterId===r.monsterId),'action identity/owner');
    for(const [stance,behavior] of Object.entries(r.selection.stanceBehavior)) {
      if(behavior.kind==='SKILL_TABLE') {
        check(behavior.rows.every(row=>actions.has(row.actionId)&&row.min>=1&&row.max<=10&&row.min<=row.max),'unbound stance action');
        const die=behavior.rows.flatMap(row=>Array.from({length:row.max-row.min+1},(_,i)=>row.min+i));
        check(die.join(',')==='1,2,3,4,5,6,7,8,9,10','d10 coverage');
      }
      let current=stance;const visited=new Set<string>();
      while(r.selection.stanceBehavior[current]?.kind==='INHERITS') {
        check(!visited.has(current),'cyclic stance inheritance');visited.add(current);
        current=(r.selection.stanceBehavior[current] as {kind:'INHERITS';stance:string}).stance;
      }
      check(r.selection.stanceBehavior[current],'missing inherited stance');
    }
    const row=census.monsters.find((m:any)=>m.monsterId===r.monsterId);
    check(row&&row.copyCount===r.profile.copyCount&&row.sourceStatus===r.sourceStatus,'census identity/profile mismatch');
    for(const field of [...r.profile.unresolvedFields,...r.actions.flatMap(a=>a.unresolvedFields)])
      check(gaps.issues.some((g:any)=>g.monsterId===r.monsterId&&g.field.includes(field)),'unregistered unresolved field');
    if(r.sourceStatus==='SOURCE_UNRESOLVED')check(gaps.issues.some((g:any)=>g.monsterId===r.monsterId&&g.category==='MISSING_SOURCE'),'unregistered unresolved source');
  }
  for(const g of gaps.issues)check(g.reason&&g.status==='DEFERRED'&&g.blocksC3A===false&&g.recommendedPhase,'deferred reason/phase');
  for(const f of receipt.files) {
    check(f.observations.length===f.pageCount&&new Set(f.observations.map((p:any)=>p.page)).size===f.pageCount,'source page census incomplete');
    for(const p of f.observations) {
      if(p.classification==='BOSS_OR_SPECIAL_COMPONENT_EXCLUDED') {
        check(!p.monsterId,'Boss imported as ordinary Monster');
        check(excludedRoles[p.printedName]===p.excludedRole,'unclassified excluded face');
      }
      else check(records.some(r=>r.monsterId===p.monsterId),'ordinary source face omitted');
    }
  }
  for(const r of records.filter(r=>!anchors.some((d:any)=>d.canonicalId===r.monsterId))) {
    const observed=receipt.files.flatMap((f:any)=>f.observations).filter((p:any)=>p.monsterId===r.monsterId&&p.classification==='ORDINARY_DECK_CARD').length;
    check(observed===r.profile.copyCount,'source-derived physical count');
  }
  for(const d of anchors) {
    const r=records.find(r=>r.monsterId===d.canonicalId);
    check(r&&r.profile.copyCount===d.copyCount&&JSON.stringify(r.profile.physicalCopyIds)===JSON.stringify(d.physicalCopyIds),'Ruins 24/62 anchor');
    for(const field of ['life','speed','dodge','size','occupiedSpaces','stanceSlots','deployment','tags','resistances','immunities'])
      check(JSON.stringify((r!.profile as any)[field])===JSON.stringify(d[field]),'Ruins printed field preservation '+field);
  }
}

if(process.argv.includes('--intake'))intakeC3APrints();
if(process.argv.includes('--write')||process.argv.includes('--verify')) {
  const artifacts=buildC3AArtifacts();
  auditC3A(artifacts['c3a-monster-production-data.json'],artifacts['c3a-monster-source-census.json'],artifacts['c3a-monster-source-gaps.json'],read(receiptPath));
  for(const [name,value] of Object.entries(artifacts)) {
    if(process.argv.includes('--write'))writeFileSync(root+name,JSON.stringify(value,null,2)+'\n');
    else check(JSON.stringify(read(root+name))===JSON.stringify(value),'artifact drift '+name);
  }
  // Targeted compatibility check: no frozen source/runtime/Hero/Boss edits since accepted HEAD.
  for(const path of [...frozen.map(f=>root+f),'src/game-engine/ruins/source-registry.ts','src/data/monsters.ts','src/data/monster-skills.ts']) {
    const original=execFileSync('git',['show',C3A_BASELINE+':'+path],{encoding:'utf8'}).replace(/\r\n/g,'\n');
    check(original===readFileSync(path,'utf8').replace(/\r\n/g,'\n'),'frozen input changed '+path);
  }
  const trackedChanges=execFileSync('git',['diff',C3A_BASELINE,'--name-only'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  check(trackedChanges.every(path=>path==='package.json'||path.startsWith('src/data/monsters/')||path.startsWith('scripts/audit/c3a')||path.startsWith('src/audit/c3a')||path.startsWith(root+'c3a-')),'out-of-scope frozen/runtime edit');
  console.log(JSON.stringify(artifacts['c3a-monster-status.json'],null,2));
}
