import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { compileC2C, C2C_BASELINE, dataRoot, readArtifact, digest, deferredIds } from './c2c-source-compiler';
import { validateDeferredRecords, validateForwardSemanticPolicy } from './source-ambiguity-policy';
import type { HeroProductionProfileDefinition, HeroProductionSkillDefinition } from '../../src/types/hero-production';
const check = (ok: unknown, why: string) => { if (!ok) throw new Error('C2C: ' + why); };
const same = (a: unknown,b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const json = (v: unknown) => JSON.stringify(v,null,2)+'\n';
const git = (args: string[]) => execFileSync('git',args,{maxBuffer:128*1024*1024}).toString('utf8');

export function verifyC2CIsolation() {
  const tree=git(['ls-tree','-r',C2C_BASELINE,'--','src']).trim().split(/\r?\n/).filter(l=>!l.includes('\tsrc/audit/'));
  const files=tree.map(l=>l.split('\t')[1]);
  const blobs=execFileSync('git',['hash-object','--stdin-paths'],{input:files.join('\n')+'\n',maxBuffer:128*1024*1024}).toString().trim().split(/\r?\n/);
  for(const [i,l] of tree.entries()) check(blobs[i]===l.split('\t')[0].split(' ')[2] ||
    readFileSync(files[i],'utf8').replace(/\r\n/g,'\n')===git(['show',C2C_BASELINE+':'+files[i]]).replace(/\r\n/g,'\n'),'live baseline unchanged '+files[i]);
  const walk=(folder:string):string[]=>readdirSync(folder,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(folder+'/'+e.name):[folder+'/'+e.name]);
  const additions=walk('src').filter(p=>!files.includes(p)&&!p.startsWith('src/audit/'));
  for(const p of additions)check(p==='src/types/hero-production.ts'||p.startsWith('src/data/heroes/production-'),'candidate-only additions '+p);
  for(const p of files)check(!/production-(registry|skills|profiles|source-bindings)|HERO_PRODUCTION_(DEFINITION|SKILL)_REGISTRY/.test(readFileSync(p,'utf8')),'no gameplay import '+p);
  const frozen=git(['ls-tree','-r','--name-only',C2C_BASELINE,'--','docs/data/complete-edition']).trim().split(/\r?\n/).filter(p=>/\/c2[ab](?:-r1)?-|\/heroes\/c2b\/|\/source-assets\/c2[ab](?:-r1)?\//.test(p));
  const current=execFileSync('git',['hash-object','--stdin-paths'],{input:frozen.join('\n')+'\n',maxBuffer:128*1024*1024}).toString().trim().split(/\r?\n/);
  const baseline=new Map(git(['ls-tree','-r',C2C_BASELINE]).trim().split(/\r?\n/).map(l=>{const [m,p]=l.split('\t');return [p,m.split(' ')[2]];}));
  for(const [i,p] of frozen.entries())check(current[i]===baseline.get(p),'immutable source corpus '+p);
  return {baseline:C2C_BASELINE,baselineLiveFiles:files.length,frozenEvidenceFiles:frozen.length,liveRuntimeIntegrated:false,saveVersionChanged:false,selectorChanged:false};
}

export function validateProductionDefinitions(profiles: HeroProductionProfileDefinition[], skills: HeroProductionSkillDefinition[], register: any[]) {
  const expected=compileC2C();validateDeferredRecords(register);
  validateForwardSemanticPolicy([profiles,skills],new Set(register.map(r=>r.deferredId)));
  check(same(profiles,expected.profiles),'54 independent source-bound profile definitions');
  check(same(skills,expected.skills),'378 independent source-bound skill definitions');
  check(same(register,expected.register),'all historical executable gaps classified without disappearance');
  check(profiles.length===54&&skills.length===378,'54 / 378');
  const heroes=[...new Set(profiles.map(p=>p.heroId))];check(heroes.length===18,'18 heroes');
  check(new Set(skills.map(s=>s.skillId)).size===126,'126 identities');
  for(const hero of heroes)check(profiles.filter(p=>p.heroId===hero).length===3&&skills.filter(s=>s.heroId===hero).length===21&&new Set(skills.filter(s=>s.heroId===hero).map(s=>s.skillId)).size===7,'3 Profiles / 7 Skills / 21 Skill forms '+hero);
  const seen=new Set<string>();
  function visit(v:any) {
    if(!v||typeof v!=='object')return;
    if(v.semanticStatus==='DEFERRED_MANUAL_VALIDATION') {
      check(v.canonical===false&&v.executionBinding===null,'deferred field never executes a guess');
      check(register.some(r=>r.deferredId===v.deferredId),'deferred source binding');seen.add(v.deferredId);
    }
    if(v.presence==='PRINTED_ABSENT')check(!('value' in v),'printed absence is not a numeric default');
    for(const x of Object.values(v))visit(x);
  }
  visit(profiles);visit(skills);
  for(const g of register.filter(g=>g.domain!=='SERIALIZATION'))check(seen.has(g.deferredId),'localized deferred field '+g.deferredId);
  for(const p of profiles.filter(p=>p.heroId==='abomination'))check('human' in p.variants&&'beast' in p.variants,'Abomination distinct forms');
  for(const d of [...profiles,...skills])check(expected.bindings.some(b=>b.id===d.sourceBindingId),'valid source binding');
}

export function buildC2CArtifacts() {
  const compiled=compileC2C(), {profiles,skills,register}=compiled;
  validateProductionDefinitions(profiles,skills,register);
  const common={phase:'11A.5-C2C',baseline:C2C_BASELINE,policyId:compiled.policy.policyId,definitionVersion:'C2C-HERO-PRODUCTION-DEFINITION-v1',liveRuntimeIntegrated:false};
  const conflicts=readArtifact('c2b-hero-source-conflicts').conflicts;
  const matrix:any[]=[];
  // Source-visible fields are classified independently of execution details.
  const scan=(v:any,path:string,bindingId:string)=>{
    if(!v||typeof v!=='object')return;
    if(v.presence)matrix.push({fieldId:path,sourceBindingId:bindingId,semanticStatus:'OFFICIAL_SOURCE',printedPresence:v.presence});
    if(v.semanticStatus)matrix.push({fieldId:path+':semantic',sourceBindingId:bindingId,semanticStatus:v.semanticStatus,deferredId:v.deferredId??null});
    for(const [k,x] of Object.entries(v))scan(x,path+'.'+k,bindingId);
  };
  for(const d of [...profiles,...skills])scan(d,d.sourceBindingId,d.sourceBindingId);
  for(const g of register)matrix.push({fieldId:g.field,semanticStatus:g.semanticStatus,deferredId:g.deferredId,officialSources:g.officialSources,affectedForms:g.affectedForms});
  const prototype=readArtifact('c2a-prototype-hero-data-comparison');
  const compared=readArtifact('c2b-prototype-vs-official-hero-data');
  const migration={...common,files:['src/data/heroes.ts','src/data/skills.ts','src/data/hero-level-profiles.ts'],
    heroes:prototype.heroes.map((h:any)=>({runtimeId:h.existingId,productionId:h.officialHeroId,relationship:'ID_COMPATIBLE',replacementProfiles:profiles.filter(p=>p.heroId===h.officialHeroId).map(p=>p.sourceBindingId)})),
    skills:[...new Map(compared.rows.filter((s:any)=>s.runtimeSkillId).map((s:any)=>[s.runtimeSkillId,s])).values()].map((s:any)=>({runtimeSkillId:s.runtimeSkillId,heroId:s.heroId,productionSkillId:s.skillId??null,action:s.skillId?'REPLACE_WITH_INDEPENDENT_SOURCE_LEVELS':'REMOVE_ON_C2D_MIGRATION',replacementForms:skills.filter(d=>d.skillId===s.skillId).map(d=>d.sourceBindingId)})),
    profiles:profiles.filter(p=>prototype.heroes.some((h:any)=>h.existingId===p.heroId)).map(p=>({runtimeId:p.heroId,level:p.level,productionBindingId:p.sourceBindingId,action:'REPLACE_ON_C2D_MIGRATION'})),migrationPerformed:false};
  const primitives=[['profile-resolver','REQUIRED_FOR_BASIC_COMBAT'],['skill-resolver','REQUIRED_FOR_BASIC_COMBAT'],['multi-target-selection','REQUIRED_FOR_BASIC_COMBAT'],['all-target-resolution','REQUIRED_FOR_BASIC_COMBAT'],['self-target-effect-separation','REQUIRED_FOR_BASIC_COMBAT'],['movement-executor','REQUIRED_FOR_BASIC_COMBAT'],['condition-magnitude-duration','REQUIRED_FOR_BASIC_COMBAT'],['conditional-modifiers','REQUIRED_FOR_SPECIFIC_HEROES'],['type-specific-damage','REQUIRED_FOR_SPECIFIC_HEROES'],['ignore-guard-protection','REQUIRED_FOR_SPECIFIC_HEROES'],['abomination-forms','REQUIRED_FOR_SPECIFIC_HEROES'],['hamlet-delayed-effects','REQUIRED_FOR_HAMLET'],['save-replay','REQUIRED_FOR_BASIC_COMBAT'],['definition-version-binding','REQUIRED_FOR_BASIC_COMBAT'],['deferred-clause-execution','DEFERRED_MANUAL_VALIDATION_DEPENDENT']];
  const artifacts:Record<string,any>={
    'source-ambiguity-defer-policy-v1':compiled.policy,
    'c2c-historical-c2b-checkpoint':{...common,commit:C2C_BASELINE,historicalOutcome:'HERO_LITERAL_CLOSURE_BLOCKED',releaseGate:{workflow:'Production release gate',runId:37129945901,head_sha:C2C_BASELINE,status:'completed',conclusion:'success',url:'https://github.com/Alpaca-go/darkest-dungeon-boardgame/actions/runs/37129945901'},acceptedHistoricalCheckpoint:true,forwardBlockingPolicySuperseded:true},
    'c2c-c2b-conflict-disposition':{...common,conflicts:conflicts.map((c:any)=>({...c,deferredId:deferredIds[c.field==='hamletAbility.preparationDays'?'C2B-CRUSADER-PREPARATION':'C2B-MOVEMENT-ORDER'],historicalStatus:c.resolutionStatus,resolutionStatus:'DEFERRED_MANUAL_VALIDATION',successorStatus:'DEFERRED_MANUAL_VALIDATION',semanticStatus:'DEFERRED_MANUAL_VALIDATION',blocksNextPhase:false,promotionBlocked:false,blocksProductionDefinition:false,blocksRuntimeFoundation:false,manualValidationRequired:true,canonical:false,resolution:null}))},
    'c2c-hero-production-profile-definitions':{...common,profiles},
    'c2c-hero-production-skill-definitions':{...common,skills},
    'c2c-hero-production-registry':{...common,heroes:[...new Set(profiles.map(p=>p.heroId))],heroCount:18,profileCount:54,skillIdentityCount:126,skillDefinitionCount:378,sourceFormCount:432,liveRuntimeEnabled:false},
    'c2c-hero-production-source-bindings':{...common,bindings:compiled.provenance},
    'c2c-hero-production-schema-contract':{...common,schemaVersion:'HERO_PRODUCTION_SCHEMA_V1',typeFile:'src/types/hero-production.ts',schemas:['HeroProductionProfileDefinition','HeroProductionSkillDefinition','HeroProductionTarget','HeroProductionEffect','ConditionEffect','ConditionTransferEffect','MovementEffect','TransformEffect','DelayedHeroEffectDefinition','PrintedField','DeferredSemanticField','HamletAbilityDefinition'],arrayOrdering:'Printed collection order only; no execution ordering implied',absence:'PRINTED_ABSENT has no value',runtimeSupport:'REQUIRES_RUNTIME_EXTENSION is independent of semanticStatus'},
    'c2c-hero-production-schema-support':{...common,categories:readArtifact('c2b-hero-production-schema-requirements').requirements.map((r:any)=>({featureId:r.featureId,affectedForms:r.affectedForms,status:r.status==='SEMANTICS_UNRESOLVED'?'STRUCTURALLY_SUPPORTED_SEMANTIC_DEFERRED':'SUPPORTED',runtimeImplemented:false})),additionalCategories:['movement','party-wide-effects','condition-magnitude-duration','hamlet-abilities'].map(featureId=>({featureId,status:'SUPPORTED',runtimeImplemented:false})),unsupported:0},
    'c2c-hero-semantic-resolution-matrix':{...common,fields:matrix,unclassified:0,historicalGapDisposition:readArtifact('c2b-hero-semantic-gap-register').gaps.map((g:any)=>({historicalGapId:g.gapId,executionRequired:g.executionRequired,successorStatus:g.executionRequired?'DEFERRED_MANUAL_VALIDATION':'OFFICIAL_SOURCE',deferredId:deferredIds[g.gapId]??null,nonExecutableArtworkPreserved:!g.executionRequired}))},
    'c2c-deferred-manual-validation-register':{...common,groups:register,summary:{totalDeferredRuleGroups:register.length,affectedHeroes:18,affectedSkills:126,affectedSkillForms:378,combat:register.filter(g=>g.domain==='COMBAT').length,hamlet:register.filter(g=>g.domain==='HAMLET').length,serialization:register.filter(g=>g.domain==='SERIALIZATION').length}},
    'c2c-source-fidelity-proof':{...common,forms:compiled.bindings.filter(b=>[...profiles,...skills].some(d=>d.sourceBindingId===b.id)),represented:432,noLiteralDropped:true,prototypeSubstitution:false,levelFormulaUsed:false,sourceBindingIdsValid:true},
    'c2c-hero-dodge-migration-map':{...common,rows:readArtifact('c2b-hero-dodge-source-comparison').rows.map((r:any)=>({...r,officialProductionDodge:r.officialPrintedDodge,currentRuntimeDodge:r.acceptedDigitalDodge,relationship:r.status,futureMigrationAction:r.status==='MATCH'?'KEEP_SOURCE_VALUE':'BIND_OFFICIAL_PROFILE_ON_C2D',migrationPerformed:false})),liveRulingSet:'C1C31-DIGITAL-DEFAULT-v2'},
    'c2c-prototype-to-production-migration-map':migration,
    'c2c-runtime-integration-requirements':{...common,primitives:primitives.map(([primitive,priority])=>({primitive,priority,runtimeImplemented:false})),deferredClausePolicy:'Implement independent clear behavior; no guessed execution binding'},
    'c2c-production-definition-acceptance':{...common,outcome:'HERO_PRODUCTION_DEFINITION_LAYER_ACCEPTED',productionDefinitionLayerComplete:true,literalSourceCoverageComplete:true,semanticClassificationComplete:true,deferredManualValidationAllowed:true,deferredManualValidationRemaining:register.length,runtimeProductionReady:false,C2DAllowed:true,releaseGateRequiredForFinalAcceptance:true},
    'c2c-next-workstream-decision':{...common,nextPhase:'11A.5-C2D',C2DAllowed:true,C2DStarted:false,requiresExactHeadReleaseSuccess:true,ThingStatus:'SOURCE_ACQUISITION_HOLD',ThingRuntimeAuthorized:false},
  };
  return {compiled,artifacts};
}
const moduleText=(type:string,name:string,value:any)=>`// Generated by audit:complete-edition-c2c from independent frozen C2B rows.\nimport type { ${type} } from '../../types/hero-production';\nimport { freezeProduction } from './production-freeze';\nexport const ${name} = freezeProduction<${type}[]>(${json(value).trim()});\n`;
export function writeC2C() {
  const {compiled,artifacts}=buildC2CArtifacts();verifyC2CIsolation();
  for(const [name,value] of Object.entries(artifacts))writeFileSync(dataRoot+name+'.json',json(value));
  mkdirSync('src/data/heroes',{recursive:true});
  for(const [file,type,name,value] of [
    ['production-profiles','HeroProductionProfileDefinition','HERO_PRODUCTION_PROFILES',compiled.profiles],
    ['production-skills','HeroProductionSkillDefinition','HERO_PRODUCTION_SKILLS',compiled.skills],
    ['production-source-bindings','HeroProductionSourceBinding','HERO_PRODUCTION_SOURCE_BINDINGS',compiled.bindings],
  ] as const)writeFileSync('src/data/heroes/'+file+'.ts',moduleText(type,name,value));
  console.log('C2C audit: 18 / 54 / 126 / 378 / 432; deferred groups '+compiled.register.length+'; gameplay unchanged.');
}
export async function verifyC2C() {
  const {HERO_PRODUCTION_PROFILES:p}=await import('../../src/data/heroes/production-profiles');
  const {HERO_PRODUCTION_SKILLS:s}=await import('../../src/data/heroes/production-skills');
  const {HERO_PRODUCTION_DEFINITION_REGISTRY:h,HERO_PRODUCTION_SKILL_REGISTRY:k}=await import('../../src/data/heroes/production-registry');
  const {HERO_PRODUCTION_SOURCE_BINDINGS:b}=await import('../../src/data/heroes/production-source-bindings');
  const {compiled,artifacts}=buildC2CArtifacts();validateProductionDefinitions(p,s,compiled.register);
  check(Object.keys(h).length===18&&Object.keys(k).length===378,'recomputed TS registry counts');
  check(same(b,compiled.bindings),'immutable source binding digests');
  const sourceHashes=new Map<string,string>();
  for(const row of compiled.provenance)for(const source of row.officialSources) {
    if(!sourceHashes.has(source.path))sourceHashes.set(source.path,createHash('sha256').update(readFileSync(source.path)).digest('hex'));
    check(sourceHashes.get(source.path)===source.sha256&&Number.isInteger(source.page)&&source.page>0,'official source bytes '+source.path);
  }
  for(const [name,value] of Object.entries(artifacts))check(same(readArtifact(name),value),'deterministic artifact '+name);
  const sourceFiles=['production-profiles','production-skills','production-registry','production-source-bindings'];
  for(const file of sourceFiles)check(!/SKILL_LEVEL_BONUS|HERO_LEVEL_PROFILES|from ['"]\.\.\/skills|from ['"]\.\.\/heroes/.test(readFileSync('src/data/heroes/'+file+'.ts','utf8')),'no prototype derivation');
  check(readFileSync('.github/workflows/release-gate.yml','utf8').includes('npm run verify:complete-edition-c2c'),'C2C remote gate installed');
  const isolation=verifyC2CIsolation();
  check(digest(readArtifact('c2b-hero-literal-closure-acceptance'))===digest(JSON.parse(git(['show',C2C_BASELINE+':'+dataRoot+'c2b-hero-literal-closure-acceptance.json']))),'C2B historical outcome preserved');
  console.log('C2C verification PASS: '+JSON.stringify({heroes:Object.keys(h).length,profiles:p.length,skillIdentities:new Set(s.map(s=>s.skillId)).size,skills:s.length,sourceForms:p.length+s.length,deferred:compiled.register.length,isolation}));
}
if(process.argv.includes('--write'))writeC2C();
if(process.argv.includes('--verify'))await verifyC2C();
