import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildGateA, verifyGateA, hash, ruleSetVersion, capacityRulingId, sourceContractVersion, baseline } from './c1c35r2-gate-a';
import { resolveBossDefinition } from '../../src/game-engine/bosses/definitions';
import { assertHeroDodgeRuleSetVersion } from '../../src/game-engine/rules/hero-dodge';
import { validateProductionBossRoomStorage } from '../../src/game-engine/bosses/room-storage';
import { validateLargeMovementContract } from '../../src/game-engine/rules/large-movement-contract';
import { validateThreatCheckpoint } from '../../src/game-engine/bosses/threat-checkpoint';
import { verifyCurrentFreeze } from './historical-baseline';
import type { BattleState, CampaignState } from '../../src/types';

const root='docs/data/complete-edition/';
const read=(n:string)=>JSON.parse(readFileSync(root+n+'.json','utf8'));
const frozen=read('c1c33-necromancer-production-freeze-manifest');
const rejection=(run:()=>void) => { try { run(); return null; } catch(error) { return error instanceof Error ? error.message : String(error); } };
/** Actual shared production calls. These are compatibility probes, never simulated gameplay. */
export function probeFoundationDependencies() {
  const rows=[
    {id:'boss-definition-dispatch',path:'src/game-engine/bosses/definitions.ts',
      requirement:'Resolve Prophet Levels I–III under the explicit successor ruleset',
      failures:[1,2,3].map(level=>({level,error:rejection(()=>{resolveBossDefinition('prophet',level as 1|2|3,ruleSetVersion);})}))},
    {id:'hero-dodge-version',path:'src/game-engine/rules/hero-dodge.ts',
      requirement:'Shared source attack validates Hero Dodge using the encounter ruleset, without implicit Necromancer ruling inheritance',
      failures:[{error:rejection(()=>assertHeroDodgeRuleSetVersion(ruleSetVersion))}]},
    {id:'room-storage-tile-11',path:'src/game-engine/bosses/room-storage.ts',
      requirement:'Validate standard physical Room 11 / Ruins Tile 11 storage',
      failures:[{error:rejection(()=>validateProductionBossRoomStorage({bossRoomStorage:{lifecycle:'RESERVED',tileId:'ruins-tile-11',roomId:'ruins-room-11',encounterId:'prophet-review',roomCardId:44710}}))}]},
    {id:'threat-checkpoint-dispatch',path:'src/game-engine/bosses/threat-checkpoint.ts',
      requirement:'Validate source-bound Prophet Threat through the shared checkpoint lifecycle',
      failures:[{error:rejection(()=>{
        const campaign={id:'review-campaign',dungeon:{questRunId:'review-quest'},campaignProgress:{campaignLevel:1,activeThreatId:'prophet-threat-1',activeBossFamilyId:'prophet'}} as CampaignState;
        validateThreatCheckpoint(campaign,{ruleSetVersion,bossFamily:'prophet',bossLevel:1,checkpointContext:{schemaVersion:1,definitionVersion:ruleSetVersion,
          campaignId:'review-campaign',questRunId:'review-quest',campaignLevel:1,threatId:'prophet-threat-1',
          encounterId:'review-campaign:review-quest:prophet:1',battleId:'review-quest:boss'}} as Parameters<typeof validateThreatCheckpoint>[1]);
      })}]},
    {id:'shared-large-contract-version',path:'src/game-engine/rules/large-movement-contract.ts',
      requirement:'Bind Large occupancy to Prophet without adopting Necromancer overflow ruling',
      failures:[{error:rejection(()=>validateLargeMovementContract({largeMovementContract:{ruleSetVersion,rulingId:capacityRulingId,sequence:0,events:[],areas:[]}} as unknown as BattleState))}]},
  ];
  return rows.map(r=>({...r,status:r.failures.every(f=>f.error!==null)?'DEPENDENCY_CONTRACT_REJECTED':'REVIEW_REQUIRED',
    frozenBy:'C1C33 Necromancer production freeze',pathInFreeze:!!frozen.runtimeHashes[r.path],currentSha256:hash(r.path)}));
}

export function buildFoundationReview() {
  const a=buildGateA();
  const dependencies=probeFoundationDependencies();
  const source=read('c1c35-prophet-source-closure');
  const field=(id:string)=>source.items.find((r:any)=>r.id===id);
  const definitions=[1,2,3].map(level=>({family:'prophet',level,ruleSetVersion,sourceContractVersion,
    status:'SOURCE_BOUND_DEFINITION_REVIEW_ONLY',runtimeRegistered:false,
    battle:{...field(`level-${level}-battle`).value,physicalIdentity:field(`level-${level}-battle`).sourceReferences[0].physicalIdentity,
      sourceReferences:field(`level-${level}-battle`).sourceReferences},
    stats:field(`level-${level}-stats`).value,skills:field(`level-${level}-skill-table`).value,
    threat:{...field(`level-${level}-threat`).value,physicalIdentity:field(`level-${level}-threat`).sourceReferences[0].physicalIdentity,
      sourceReferences:field(`level-${level}-threat`).sourceReferences},
    room:field('room'),tileId:'ruins-tile-11',d10MapVersion:'C1C35-PROPHET-PRINTED-D10-v1',
    immunities:['stun','shuffle'],actionsPerRound:3,largeOccupiedSpaces:2,
  }));
  const common={schemaVersion:1,phase:'11A.4-C1C35R2',baseline,ruleSetVersion,sourceContractVersion,
    gateAPassed:true,productionFoundation:false,productionAccepted:false,runtimeImplemented:false,
    status:'PROPHET_PRODUCTION_FOUNDATION_BLOCKED',proofKind:'SOURCE_AND_EXECUTABLE_DEPENDENCY_REVIEW_NOT_RUNTIME_ACCEPTANCE',
    inputHashes:{...a.acceptance.inputHashes,
      [root+'c1c35-prophet-source-closure.json']:hash(root+'c1c35-prophet-source-closure.json'),
      [root+'c1c33-necromancer-production-freeze-manifest.json']:hash(root+'c1c33-necromancer-production-freeze-manifest.json'),
      ...Object.fromEntries(dependencies.map(r=>[r.path,r.currentSha256])),
      'src/game-engine/save.ts':hash('src/game-engine/save.ts'),
      'src/game-engine/component-monster-runtime.ts':hash('src/game-engine/component-monster-runtime.ts'),
      'scripts/audit/c1c35r2-gate-a.ts':hash('scripts/audit/c1c35r2-gate-a.ts'),
      'scripts/audit/c1c35r2-foundation-review.ts':hash('scripts/audit/c1c35r2-foundation-review.ts'),
      'src/audit/c1c35r2-prophet-gate-foundation-review.test.ts':hash('src/audit/c1c35r2-prophet-gate-foundation-review.test.ts'),
    },rulingReferences:a.acceptance.rulingReferences};
  const requiredTests=['Area C capacity 6 ruling identity','Prophet Large consumes 2','Prophet + 4 Heroes legal in C','capacity 7 rejected','Pews consume zero capacity',
    'official d10 mapping all 1–10','four physical Pew ownership','same Area may contain multiple Pews','shared RNG placement','save/reload placement',
    'ordinal 1','ordinal 2','ordinal 3','Crowded unique Area','Crowded tie PendingChoice','Crowded forged choice rejection','Crowded reload',
    'Rubble all-Hero Area target scope','same-Area double Pew attack','empty Area independent attack','Pew 1/4 reload','Pew 2/4 reload','Pew 3/4 reload',
    'stored-roll tamper rejection','target-set tamper rejection','causal replay rejection','Threat Level I','Threat Level II','Threat Level III',
    'Room reservation','Room return on termination','Room return on victory','prototype production reachability = 0'];
  return {
    'production-definitions':{...common,definitions,independentlyBoundLevels:true,levelDerivation:false,prototypeUsed:false},
    'runtime-contract':{...common,dependencies,
      sharedSaveReview:{path:'src/game-engine/save.ts',frozen:true,entry:'validateSaveFile',
        dispatch:'Boss runtime/history/checkpoint validation calls the frozen resolveBossDefinition; Prophet is unsupported.',
        productionSchema2ExtensionImplemented:false},
      disposition:'Stop affected promotion at dependency review. No alternate engine, identity substitution, implicit ruling adoption, or validator bypass.',
      repairScope:'Add and review an explicit shared successor dispatch/version extension compatible with the immutable Necromancer path; re-run C1C35R2 foundation before C1C36.'},
    'physical-pew-contract':{...common,dependency:'boss-definition-dispatch',physicalCopyCount:4,
      requiredPermanentCopyIds:['prophet-wooden-pew:1','prophet-wooden-pew:2','prophet-wooden-pew:3','prophet-wooden-pew:4'],
      idsAreRuntimeInstances:false,ownershipLedgerCreated:false,
      requiredModel:a.ruling.pew,requiredStates:['STORED','PLACED','RESOLVING','RESOLVED'],
      map:read('c1c35-prophet-d10-area-map').mapping,capacityRuling:a.ruling,
      victoryReturnVerified:false},
    'threat-contract':{...common,dependency:'threat-checkpoint-dispatch',definitions:definitions.map(d=>({level:d.level,threat:d.threat})),
      requiredHooks:[{level:1,trigger:'DUNGEON_ENTRY',stress:2,tavernRecoveryModifier:-1},
        {level:2,trigger:'SCOUTING',stress:1,tavernRecoveryModifier:-2},
        {level:3,trigger:'UNHOLY_MONSTER_SPAWN_IN_BATTLE',stress:1,tavernRecoveryModifier:-3}],
      eventHooksInstalled:false,crossQuestReplayVerified:false},
    'save-contract':{...common,dependency:'boss-definition-dispatch',schemaVersionRequired:2,productionSchemaExtended:false,
      authoritativeFields:read('c1c35r1-prophet-rubble-target-scope-ruling').saveExtension.authoritativeFields,
      requiredCheckpoints:['before first Pew','after 1/4','after 2/4','after 3/4','target/death interruption','after 4/4'],
      reloadVerified:false,silentRepairAllowed:false},
    'foundation-capability-matrix':{...common,rows:requiredTests.map(capability=>({capability,status:'NOT_RUNTIME_VERIFIED',accepted:false})),
      dependencyProbes:dependencies,executedProductionGameplayTests:0,
      productionPrototypeReachability:null,reachabilityReason:'No production Prophet entry was registered; zero runtime reachability is not claimed as acceptance.'},
    'foundation-proof':{...common,outcome:common.status,canonicalComplete:false,digitalExecutionContractComplete:true,
      dependencyProbesPassed:0,dependencyProbesRejected:dependencies.length,productionAcceptanceTestsPassed:0,
      failedInvariant:'Shared production APIs cannot bind the Prophet identity/ruleset/Room/Tile without an explicit successor dependency contract.',
      frozenPredecessorsRetained:true,browserAcceptancePerformed:false},
    'next-workstream-decision':{...common,outcome:common.status,c1c36Allowed:false,
      next:'Remain in C1C35R2: explicit shared successor dependency extension and foundation implementation, then all requested gameplay/save tests. C1C36 stays blocked.',
      sourceAcquisitionRequired:false,areaCCapacityDecisionRequired:false},
  };
}
export function validateFoundationReview(a:ReturnType<typeof buildFoundationReview>) {
  for(const artifact of Object.values(a)) if(artifact.productionFoundation || artifact.productionAccepted || artifact.runtimeImplemented
    || !artifact.gateAPassed || artifact.status!=='PROPHET_PRODUCTION_FOUNDATION_BLOCKED') throw new Error('False production promotion');
  if(a['next-workstream-decision'].c1c36Allowed || a['foundation-proof'].productionAcceptanceTestsPassed!==0) throw new Error('Unverified foundation acceptance');
  if(a['runtime-contract'].dependencies.some(d=>d.status!=='DEPENDENCY_CONTRACT_REJECTED'||!d.pathInFreeze)) throw new Error('Dependency review changed; re-evaluate foundation');
  if(a['foundation-capability-matrix'].rows.some(r=>r.accepted||r.status!=='NOT_RUNTIME_VERIFIED')) throw new Error('Contract test mislabeled production');
  for(const artifact of Object.values(a)) for(const [p,h] of Object.entries(artifact.inputHashes)) if(hash(p)!==h) throw new Error('Dependency hash drift: '+p);
}
export function verifyFoundationReview() {
  verifyGateA(); verifyCurrentFreeze();
  const a=buildFoundationReview(); validateFoundationReview(a);
  execFileSync('git',['diff','--exit-code',baseline,'--','src/game-engine','src/data','src/types','e2e','docs/DD_EN_COREBOX_RULES.pdf'],{stdio:'pipe'});
  for(const [n,value] of Object.entries(a)) {
    const path=root+'c1c35r2-'+(n==='next-workstream-decision'?'':'prophet-')+n+'.json';
    if(JSON.stringify(JSON.parse(readFileSync(path,'utf8')))!==JSON.stringify(value)) throw new Error('Foundation review artifact drift: '+path);
  }
  console.log('C1C35R2 review PASS: Gate A accepted; five actual shared dependency probes reject Prophet. PROPHET_PRODUCTION_FOUNDATION_BLOCKED; C1C36 prohibited.');
}
if(process.argv.includes('--write-r2')) {
  verifyGateA(); const a=buildFoundationReview(); validateFoundationReview(a);
  for(const [n,value] of Object.entries(a)) writeFileSync(root+'c1c35r2-'+(n==='next-workstream-decision'?'':'prophet-')+n+'.json',JSON.stringify(value,null,2)+'\n');
  verifyFoundationReview();
}
if(process.argv.includes('--verify-r2')) verifyFoundationReview();
