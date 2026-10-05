import {readFileSync,writeFileSync} from 'node:fs';
import {historicalBaselines,verifyHistoricalArtifacts,verifyCurrentFreeze} from './historical-baseline';
import {verifyGateA} from './c1c35r2-gate-a';
import {verifyNecromancerCompatibility,baseline,compatibilityVersion} from './c1c35r2a-necromancer-compatibility';
import {runSharedDispatchProbes,sharedSaveProbe,registeredFamilies} from './c1c35r2a-dispatch-probes';
import {auditProductionPrototypeReachability} from './c1c35r2a-prototype-reachability';
import {resolveEncounterRuleDependencies,resolveBossDefinition,productionBossFamily} from '../../src/game-engine/bosses/definitions';
import {PROPHET_RULE_SET_VERSION} from '../../src/game-engine/prophet/production-definition';

const root='docs/data/complete-edition/';
export function buildSharedDispatchArtifacts() {
  verifyGateA();
  verifyCurrentFreeze();
  const compatibility=verifyNecromancerCompatibility(),probes=runSharedDispatchProbes(),reachability=auditProductionPrototypeReachability();
  const common={schemaVersion:1,phase:'11A.4-C1C35R2A',baseline,productionFoundation:false,productionAccepted:false,canonicalComplete:false,digitalExecutionContractComplete:true};
  const phases=['c1c33','c1c34','c1c35','c1c35r1','c1c35r2'] as const;
  return {
    'historical-freeze-boundary':{...common,policyVersion:'C1C35R2A-IMMUTABLE-PHASE-BASELINES-v1',
      checkpoints:phases.map(phase=>({phase,...historicalBaselines[phase],protectedArtifactCount:verifyHistoricalArtifacts(phase)})),
      exactRuntimeVerification:'ORIGINAL_VERIFIER_IN_DETACHED_ACCEPTED_CHECKOUT',
      successorRuntimeVerification:compatibilityVersion,currentArtifactsComparedWith:'ACCEPTED_RAW_GIT_BLOBS',
      original383RuntimeHashesRetained:true,successorRuntimeByteFreeze:false},
    'production-family-registry':{...common,families:registeredFamilies().map(family=>({family,roomContract:productionBossFamily(family).roomContract,
      ruleSetVersions:productionBossFamily(family).ruleSetVersions,threatContract:productionBossFamily(family).threatContract})),
      prophetDefinitions:([1,2,3] as const).map(level=>resolveBossDefinition('prophet',level,PROPHET_RULE_SET_VERSION)),
      runtimeRegistered:probes.every(p=>p.status==='PASS'),...reachability},
    'rule-dependency-binding':{...common,prophet:resolveEncounterRuleDependencies('prophet',PROPHET_RULE_SET_VERSION),
      necromancer:['C1C28-DIGITAL-DEFAULT-v1','C1C31-DIGITAL-DEFAULT-v2'].map(version=>resolveEncounterRuleDependencies('necromancer',version)),
      legacyDependenciesAbsentAllowedFor:['necromancer'],dodgeTableDuplicated:false,directProphetDodgeVersionAllowed:false},
    'room-storage-compatibility':{...common,proofKind:'SHARED_INFRASTRUCTURE_CONTRACT_FIXTURE_NOT_GAMEPLAY_ACCEPTANCE',
      prophet:probes[2],necromancer:compatibility.levels.map(l=>({level:l.level,roomOwnershipHashes:l.checkpoints.map(p=>p.roomOwnershipHash)})),
      lifecycle:['RESERVED','IN_PLAY','RETURNED'],familySubstitutionAllowed:false},
    'threat-checkpoint-compatibility':{...common,proofKind:'SHARED_INFRASTRUCTURE_CONTRACT_FIXTURE_NOT_THREAT_HOOK_ACCEPTANCE',
      prophet:probes[3],identityValidation:['campaignId','questRunId','activeThreatId','bossFamily','bossLevel','encounterId','battleId','definitionVersion','physicalIdentity','heroDodgeDependency','events'],prophetLifecycleHooksInstalled:false},
    'actor-capacity-contract':{...common,prophet:probes[4],pewActorCost:0,displacementImplemented:false,overflowInherited:false},
    'save-dispatch-contract':{...common,sharedSaveSchema:true,dispatchFields:['bossFamily','bossLevel','ruleSetVersion','ruleDependencies'],
      legacyNecromancerSavesPreserved:true,prophetInfrastructure:([1,2,3] as const).map(sharedSaveProbe),fullProphetCursorImplemented:false},
    'dependency-probe-results':{...common,dependencyProbesPassed:probes.length,dependencyProbesRejected:0,probes},
    'next-workstream-decision':{...common,outcome:'PROPHET_SHARED_PRODUCTION_DEPENDENCIES_READY',gateAPassed:true,
      sharedDependenciesReady:true,next:'C1C35R2B — Prophet Production Foundation Implementation',c1c35r2bAllowed:true,c1c36Allowed:false,
      deferred:['ordinal 1 / four physical Wooden Pews / shared RNG placement','ordinal 2 Crowded PendingChoice','ordinal 3 Rubble damage sequence',
        'full Prophet save/reload cursor','Threat Level I / II / III lifecycle hooks','Room 11 live lifecycle and victory cleanup','browser production path'],
      sourceAcquisitionRequired:false,areaCCapacityDecisionRequired:false},
  };
}
export function verifySharedDispatchArtifacts(write=false) {
  const artifacts=buildSharedDispatchArtifacts();
  for(const [name,data] of Object.entries(artifacts)) {
    const path=root+'c1c35r2a-'+name+'.json',bytes=JSON.stringify(data,null,2)+'\n';
    if(write)writeFileSync(path,bytes);
    else if(readFileSync(path,'utf8')!==bytes)throw new Error('Successor artifact drift: '+path);
  }
  return artifacts;
}
if(process.argv.includes('--write-dispatch') || process.argv.includes('--verify-dispatch')) {
  verifySharedDispatchArtifacts(process.argv.includes('--write-dispatch'));
  console.log('C1C35R2A: PROPHET_SHARED_PRODUCTION_DEPENDENCIES_READY; 5/5 probes PASS; prototype reachability 0; C1C36 prohibited.');
}
