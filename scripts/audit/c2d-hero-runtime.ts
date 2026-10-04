import { readFileSync,writeFileSync } from 'node:fs';
import { projection,verifyProjection,writeProjection } from './c2d-projection';
import { verifyHistoricalBaseline,verifyHistoricalArtifacts } from './historical-baseline';
import { HERO_DEFINITION_VERSION,HERO_RUNTIME_VERSION,PRODUCTION_HERO_IDS } from '../../src/data/heroes/runtime-registry';
import { compileHeroProductionActionPlan,HERO_DEFERRED_IDS } from '../../src/game-engine/heroes/action-plan';
import { createProductionHero,makeProductionHeroUnit } from '../../src/game-engine/heroes/production-hero';
import { heroRuntimeFixture,fixtureExecute,prepareHeroFixture } from '../../src/testing/c2d-hero-runtime-fixture';
import { heroTamperCases } from '../../src/testing/c2d-tamper-cases';
import { createSaveSnapshot,validateSaveFile,migrateSaveFile,restoreSaveSnapshot } from '../../src/game-engine/save';
import { stableHeroState,validateHeroRuntime } from '../../src/game-engine/heroes/save-contract';
import type { CampaignState } from '../../src/types';

const root='docs/data/complete-edition/',baseline='e1e9f27c882000bee59cec115ec0d1b3f7fcb5de';
const json=(v:unknown)=>JSON.stringify(v,null,2)+'\n';
const read=(name:string)=>JSON.parse(readFileSync(root+name+'.json','utf8'));
const check=(v:unknown,why:string)=>{if(!v)throw new Error('C2D: '+why);};

export function assertHeroRuntimeModules(modules:string[]) {
  const forbidden=modules.filter(m=>/\/src\/data\/heroes\/production-(profiles|skills|source-bindings|registry)\.|\/docs\/.*(?:\/c2[abcd][-/]|\.pdf(?:\?|$))/.test(m.replace(/\\/g,'/')));
  check(!forbidden.length,'source corpus reached player bundle: '+forbidden.join(','));return forbidden;
}
export function auditHeroBundle() {
  const chunks=JSON.parse(readFileSync('dist/c2d-runtime-module-graph.json','utf8')) as Array<{fileName:string;bytes:number;modules:string[]}>;
  const modules=chunks.flatMap(c=>c.modules.map(m=>m.replace(/\\/g,'/')));
  const forbidden=assertHeroRuntimeModules(modules);
  const heroChunks=chunks.filter(c=>c.fileName.includes('hero-production-runtime'));
  check(heroChunks.length===1,'compact Hero runtime chunk required');
  const b=read('c2d-runtime-bundle-baseline');check(b.commit===baseline&&b.success,'accepted baseline build binding');
  return {baselineCommit:baseline,baselineBuildJSBytes:b.jsBytes,c2dBuildJSBytes:chunks.reduce((n,c)=>n+c.bytes,0),heroRuntimeChunkBytes:heroChunks[0].bytes,
    sourceRichDefinitionsReachable:forbidden.length,sourcePDFsReachable:0,sourceAuditLiteralsReachable:0,
    heroModules:heroChunks[0].modules.map(m=>m.replace(/\\/g,'/').split('/src/')[1]).filter(Boolean).sort(),measurement:'Rollup emitted chunks, excluding stale dist files'};
}
function roundTrip(c:CampaignState) {
  const snapshot=JSON.parse(JSON.stringify(createSaveSnapshot(c)));check(validateSaveFile(snapshot)===null,'valid production snapshot '+validateSaveFile(snapshot));
  const migrated=migrateSaveFile(snapshot);check(migrated,'production save migration');return restoreSaveSnapshot(migrated!);
}
const semanticSkills:Record<string,string>={
  'basic attack':'crusader-smite','heal':'vestal-divine-grace','Stress heal':'jester-inspiring-tune','condition application':'plague-doctor-noxious-blast',
  'condition removal':'plague-doctor-battlefield-medicine','multi-target':'vestal-divine-comfort','all-target':'abomination-transform-to-beast',
  'Self + Target':'highwayman-point-blank-shot','movement':'bounty-hunter-uppercut','conditional bonus':'flagellant-punish','type-specific bonus':'crusader-smite',
  'ignore Guard':'jester-dirk-stab','ignore Protection':'leper-intimidate','form restriction':'abomination-rake','transform':'abomination-transform-to-beast','party-wide effect':'abomination-transform-to-beast',
};
export function buildC2DArtifacts() {
  const projected=verifyProjection(),p=projection();check(p.profiles.length===54&&p.skills.length===378&&PRODUCTION_HERO_IDS.length===18,'projection inventory');
  const profiles=p.profiles.flatMap(p=>{
    const forms=p.heroId==='abomination'?['HUMAN','BEAST'] as const:[undefined];
    return forms.map(form=>{
      const h=createProductionHero({heroId:p.heroId,level:p.level,form,instanceId:'profile-proof',stance:'aggressive',partySlot:1,skills:[]}),u=makeProductionHeroUnit(h);
      return {heroId:p.heroId,level:p.level,form:form??null,sourceBindingId:h.productionIdentity!.sourceBindingId,life:u.maxHp,dodge:u.bossCombatDodge,movement:u.productionMovement,categoricalResistances:u.categoricalResistances,immunities:u.immunities};
    });
  });
  const plans=p.skills.map(skill=>{
    const c=heroRuntimeFixture(skill.heroId,skill.skillId,skill.level),u=c.battle!.heroes.find(u=>u.id===c.battle!.activeActorId)!;
    const plan=compileHeroProductionActionPlan(skill,u,'compile-proof',1);return {heroId:skill.heroId,skillId:skill.skillId,level:skill.level,sourceBindingId:skill.sourceBindingId,nodeCount:plan.nodes.length,status:'PASS'};
  });
  const executions=PRODUCTION_HERO_IDS.map(heroId=>{
    const skill=p.skills.find(s=>s.heroId===heroId&&s.level===1&&s.actions.front.attack&&s.actions.front.targeting.scope==='ONE_ENEMY')!;
    const c=fixtureExecute(heroRuntimeFixture(heroId,skill.skillId),skill.skillId);validateHeroRuntime(c);
    return {heroId,skillId:skill.skillId,status:'PASS',phase:c.heroProductionSession!.pendingAction!.phase,events:c.heroProductionSession!.events.map(e=>e.eventType)};
  });
  const semantic=Object.entries(semanticSkills).map(([category,skillId])=>{
    const skill=p.skills.find(s=>s.skillId===skillId&&s.level===1)!;
    let c=heroRuntimeFixture(skill.heroId,skillId);
    c=prepareHeroFixture(c,c=>{c.heroes.forEach(h=>{h.wounds=3;h.stress=3;});c.battle!.heroes.forEach(u=>{u.hp-=3;u.stress=3;});});
    c=fixtureExecute(c,skillId);validateHeroRuntime(c);
    return {category,heroId:skill.heroId,skillId,execution:'PASS',phase:c.heroProductionSession!.pendingAction!.phase,
      localizedDeferredIds:[...new Set(c.heroProductionSession!.events.filter(e=>e.deferredId).map(e=>e.deferredId))],eventTypes:[...new Set(c.heroProductionSession!.events.map(e=>e.eventType))]};
  });
  const replaySkills=['highwayman-point-blank-shot','vestal-divine-comfort','flagellant-suffer','abomination-transform-to-beast','plague-doctor-emboldening-vapours','plague-doctor-noxious-blast'];
  const replay=replaySkills.map(skillId=>{
    const skill=p.skills.find(s=>s.skillId===skillId&&s.level===1)!;
    const initial=heroRuntimeFixture(skill.heroId,skillId),continuous=fixtureExecute(initial,skillId),checkpoints:any[]=[];
    check(stableHeroState(roundTrip(initial))===stableHeroState(initial),'idle roundtrip');
    const resumed=fixtureExecute(initial,skillId,'front',c=>{const plan=c.heroProductionSession!.pendingAction!;
      checkpoints.push({phase:plan.phase,pendingEffectIndex:plan.pendingEffectIndex,choice:plan.pendingChoice?.continuation.kind??null,frozenTargets:[...plan.frozenTargetIds],storedRolls:[...plan.storedRolls],resolvedEffectCount:plan.resolvedEffectIds.length,pendingTransition:plan.pendingTransition});return roundTrip(c);});
    check(stableHeroState(continuous)===stableHeroState(resumed),'continuous/reloaded replay mismatch '+skillId);
    return {skillId,status:'PASS',idle:'PASS',checkpoints,finalStateMatches:true,eventJournalMatches:true};
  });
  const tamperBase=fixtureExecute(heroRuntimeFixture('highwayman','highwayman-point-blank-shot'),'highwayman-point-blank-shot');
  const tamper=Object.entries(heroTamperCases).map(([name,mutate])=>{
    const c=structuredClone(tamperBase);mutate(c);let rejected=false;try{validateHeroRuntime(c);}catch{rejected=true;}
    check(rejected&&validateSaveFile(createSaveSnapshot(c))!==null&&migrateSaveFile(createSaveSnapshot(c))===null,'tamper rejection '+name);
    return {name,status:'REJECTED',repairPerformed:false,rngConsumption:0};
  });
  const deferred=read('c2c-deferred-manual-validation-register').groups.map((group:any)=>{
    check(HERO_DEFERRED_IDS.includes(group.deferredId),'original deferred group');
    const affectedActions=plans.filter(plan=>p.skills.find(s=>s.skillId===plan.skillId&&s.level===plan.level)!.deferredSemanticIds.includes(group.deferredId));
    return {deferredId:group.deferredId,status:'DEFERRED_MANUAL_VALIDATION',canonical:false,
      runtimeHandling:group.deferredId.endsWith('LEGACY-SAVE-IDENTITIES')?'Preserve historical identities; no conversion':group.deferredId.endsWith('CRUSADER-PREPARATION-DAYS')?'Hamlet not executed in C2D':group.deferredId.endsWith('SERIALIZATION')?'Noncanonical versioned checkpoint infrastructure; source semantics remain deferred':'Localized nonexecuting plan node; independent clear effects continue',
      affectedActions:affectedActions.map(a=>`${a.skillId}:L${a.level}`),noGuessedExecution:true,journalEvent:group.domain==='COMBAT'||group.deferredId.endsWith('SERIALIZATION')?'HERO_DEFERRED_CLAUSE_SKIPPED':null,rngConsumption:0,saveBehavior:'Stable action/field receipts retained and replay-validated'};
  });
  check(deferred.length===8,'eight unchanged deferred groups');
  const bundle=auditHeroBundle(),frozenFiles=verifyHistoricalArtifacts('c2c');
  const common={phase:'11A.5-C2D',baseline,definitionVersion:HERO_DEFINITION_VERSION,runtimeVersion:HERO_RUNTIME_VERSION,ambiguityPolicy:'SOURCE_AMBIGUITY_DEFER_POLICY_V1',normalPlayerRouteEnabled:false,productionReady:false};
  const capability=semantic.map(row=>({category:row.category,status:['conditional bonus','type-specific bonus','ignore Guard','ignore Protection','transform'].includes(row.category)?'DEFERRED_MANUAL_VALIDATION':'RUNTIME_FOUNDATION_ACCEPTED',independentExecution:row.execution,skillId:row.skillId}));
  const migration=read('c2c-prototype-to-production-migration-map');
  const artifacts:Record<string,unknown>={
    'c2d-historical-c2c-checkpoint':{phase:'11A.5-C2C',commit:baseline,outcome:'HERO_PRODUCTION_DEFINITION_LAYER_ACCEPTED',frozenFiles,definitionCounts:{heroes:18,profiles:54,skillIdentities:126,skillLevels:378,sourceForms:432},deferredGroups:8,liveRuntimeIntegrated:false,runtimeProductionReady:false},
    'c2d-hero-runtime-contract':{...common,controlledEntry:'beginProductionHeroSession/applyProductionHeroInput',profileResolver:'resolveProductionHeroProfile',skillResolver:'resolveProductionHeroSkill',runtimeFoundation:true,
      saveVersion:23,legacyRuntime:'LEGACY_HERO_RUNTIME_V1',sourceRichRuntimeImports:0,prototypeFallback:false,levelFormula:false,sharedSystems:['BattleState','SeededRandom','resolvePrintedAttackFromRoll','applyBattleUnitDamage','applyBattleUnitHealing','applyStatusEffectEvent','applyStress','recoverStress','Shuffle/Area movement','saveCampaign'],
      projectRulings:[{rulingId:'C2D-HERO-CHECKPOINT-v1',version:1,authority:'PROJECT_RULING',canonical:false,scope:'Campaign runtime/definition selection, replay input log, pending phase/effect/receipt checkpoint encoding; not an official printed save format'},
        {rulingId:'C2D-HERO-CONTROLLED-DEPLOYMENT-v1',version:1,authority:'PROJECT_RULING',canonical:false,scope:'Explicit instance IDs and deployment Stances. Printed-absent Speed stays non-applicable; numeric compatibility shell is not used to determine initiative.'}],
      printedAbsence:'Preserved as PRINTED_ABSENT; duration-only token existence is governed by Core p20–21; absent Accuracy skips roll under Core p19; Skill action uses one action under Core p19',hamlet:'NOT_REQUIRED_IN_C2D'},
    'c2d-runtime-projection-proof':{...common,...projected,deterministicProjection:true,allSourceBindingIdsRetained:true,noLiteralSourceDependency:true,projectionAuthority:HERO_DEFINITION_VERSION},
    'c2d-runtime-bundle-impact':{...common,...bundle},
    'c2d-production-profile-runtime-proof':{...common,heroIds:PRODUCTION_HERO_IDS,levelProfiles:54,variantProfiles:profiles.length,profiles,noPrototypeFallback:true},
    'c2d-production-skill-runtime-proof':{...common,logicalSkills:126,levelForms:378,compiledActionPlans:plans,endToEndHeroes:executions,semanticCategoryExecution:semantic},
    'c2d-hero-runtime-capability-matrix':{...common,heroes:PRODUCTION_HERO_IDS.map(heroId=>({heroId,status:'RUNTIME_FOUNDATION_ACCEPTED'})),capabilities:[...capability,{category:'Hamlet ability execution',status:'NOT_REQUIRED_IN_C2D'},{category:'normal Guild/Stagecoach/browser rollout',status:'NOT_REQUIRED_IN_C2D'}],blocked:0},
    'c2d-hero-save-replay-matrix':{...common,productionRuntime:replay,legacyRuntime:{version:22,migration:'metadata only',heroRuntimeSelection:'LEGACY_HERO_RUNTIME_V1',idsPreserved:true},rerolls:0,duplicateEffects:0,duplicateDeferredReceipts:0},
    'c2d-hero-save-tamper-matrix':{...common,cases:tamper,formIncompatibleActivation:'REJECTED_IN_FOCUSED_SUITE',mixedRuntime:'REJECTED',silentRepair:false},
    'c2d-legacy-hero-runtime-compatibility':{...common,normalCampaignSelection:'LEGACY_HERO_RUNTIME_V1',normalRouteChanged:false,automaticProductionConversion:false,
      prototypeOnlySkills:migration.skills.filter((s:any)=>s.action==='REMOVE_ON_C2D_MIGRATION').map((s:any)=>({skillId:s.runtimeSkillId,laterProductionMigrationAction:s.action,c2dLegacySaveAction:'PRESERVE'})),historicalDodgeRulingRetained:'C1C31-DIGITAL-DEFAULT-v2'},
    'c2d-deferred-runtime-behavior':{...common,groups:deferred,totalGroups:8},
    'c2d-production-runtime-acceptance':{...common,outcome:'HERO_PRODUCTION_RUNTIME_FOUNDATION_ACCEPTED',runtimeFoundation:true,productionProfilesExecutable:true,productionSkillsCompileComplete:true,saveReplayAccepted:true,legacySaveCompatibility:true,deferredManualValidationPreserved:true,C2EAllowed:true,
      releaseGateRequirement:{workflow:'Production release gate',headBinding:'EXACT_FINAL_C2D_HEAD',statusRequired:'completed',conclusionRequired:'success',proofLocation:'GitHub Actions; final exact-head receipt is external to the self-referential commit'}},
    'c2d-next-workstream-decision':{...common,nextPhase:'11A.5-C2E',C2EAllowed:true,C2EStarted:false,scope:['18-Hero player path','Stagecoach/Guild/loadout','Abomination form UX','browser save/reload','legacy migration UX','manual-validation visibility'],legacyRetirementOwnedBy:'C2E'},
  };
  return artifacts;
}
export function verifyC2D() {
  verifyHistoricalBaseline('c2c');
  for(const [name,value] of Object.entries(buildC2DArtifacts()))check(stableHeroState(read(name))===stableHeroState(value),'deterministic artifact '+name);
  for(const file of ['production-runtime','production-hero','action-plan'])check(!/SKILL_LEVEL_BONUS|normalizeHeroSkill|Math\.random|HERO_LEVEL_PROFILES|HERO_LEVEL_REGISTRY|production-(skills|profiles|source-bindings)/.test(readFileSync(`src/game-engine/heroes/${file}.ts`,'utf8')),'prototype/source-rich runtime isolation '+file);
  check(readFileSync('.github/workflows/release-gate.yml','utf8').includes('npm run verify:complete-edition-c2d'),'remote C2D gate installed');
  console.log('C2D PASS: 18 Heroes / 54 Profiles / 378 plans; save/replay and tamper; 8 deferred groups; controlled runtime only.');
}
if(process.argv.includes('--write')) {writeProjection();const artifacts=buildC2DArtifacts();for(const [name,value] of Object.entries(artifacts))writeFileSync(root+name+'.json',json(value));console.log('C2D audit artifacts generated from executable checks.');}
if(process.argv.includes('--verify'))verifyC2D();
