import { readFileSync, writeFileSync } from 'node:fs';
import { c1c32rRoomStorageProofs } from './c1c32r-room-storage-proof';
const prefix='docs/data/complete-edition/';
const common={schemaVersion:1,phase:'11A.4-C1C32R',baselineHead:'75fe2e71e6670ddeea0c5df890d329f4914e5566',
  policyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',productionReady:0,foundationAccepted:false,allCapabilityGatesImplemented:false};
const manifest=JSON.parse(readFileSync(prefix+'c1c32r-local-official-source-manifest.json','utf8'));
const blockers=[
  {id:'PRODUCTION_THREAT_DOMAIN_BRIDGE',status:'BLOCKED',requiredDependencies:[
    'Ordinary location Monster physical deck with all drawn definitions executable',
    'Ordinary Room card draw/exclusion, tile geometry, Stance start Areas and effects',
    'Checkpoint attachment to ordinary guarded Battle without a new encounter or seed'],
    evidence:['src/game-engine/commands/dungeon.ts','src/game-engine/battle.ts','src/game-engine/bosses/component-adapters/bone-combat-adapter.ts'],
    sourceSearchResult:'Local printed PDFs found. Full ordinary definitions and board adapters are not implemented; four Bone summon definitions are not a substitute for the location deck.'},
  {id:'LARGE_FULL_AREA_CAPACITY_CONTRACT',status:'SOURCE_UNRESOLVED',sourceFile:'DD_EN_COREBOX_RULES.pdf',page:24,
    example:{capacity:4,occupied:4,incomingLargeSlots:2,singleNormalDisplacedSlots:1,result:5},
    reason:'Printed one-character displacement and the frozen two-slot model need an explicit compatible executable contract. No new ruling or overcapacity exception has been invented.'},
  {id:'GRAVEYARD_CAMPAIGN_TRANSACTION',status:'BLOCKED',sourceFile:'DD_EN_COREBOX_RULES.pdf',page:34,
    reason:'Printed effect confirmed. Production building command, next-Quest Virtue lifecycle and forced-day bridge remain absent.'}];
const data:Record<string,unknown>={
  'necromancer-production-threat-domain-bridge':{...common,status:'BLOCKED',blockers,historicalContractsModified:false,selectorGuardRetained:true},
  'necromancer-threat-battle-proof':{...common,status:'NOT_PROVEN',ordinaryProductionCommandImplemented:false,syntheticAcceptanceDependencies:0},
  'necromancer-large-movement-proof':{...common,status:'SOURCE_UNRESOLVED',review:manifest.observations.find((o:{componentId:string})=>o.componentId==='large-movement'),runtimeChanged:false},
  'necromancer-reanimation-proof':{...common,scenario:'C',status:'NOT_PROVEN',side:'THREAT',initialStateHash:null,preSaveHash:null,saveHash:null,reloadedHash:null,finalStateHash:null,eventSequenceHash:null,ruleSetVersion:'C1C31-DIGITAL-DEFAULT-v2',reason:'No ordinary production Threat Battle. No fixture was counted as Scenario C.'},
  'necromancer-graveyard-transaction-proof':{...common,status:'BLOCKED',printedEffectConfirmed:true,productionTransactionImplemented:false,forcedChoiceAlreadyPersists:true},
  'necromancer-room-storage-proof':{...common,status:'PARTIAL',normalVictoryInherited:'C1C32 scoped command proof',terminationAndReloadProofs:c1c32rRoomStorageProofs(),
    implemented:['Quest termination returns Room ownership','Campaign Over returns Room ownership','Boss voluntary leave/retreat rejected','Boss failure does not advance campaign','durable receipt with identity and contract validation'],fullProductionLifecycleProven:false},
  'necromancer-production-save-replay-proof':{...common,status:'PARTIAL',roomTermination:c1c32rRoomStorageProofs(),scenarioC:'NOT_PROVEN',browserNormalPath:'PRODUCT_FAILURE',historicalProofArtifactsModified:false},
  'necromancer-runtime-capability-matrix':{...common,capabilities:{coreBossDefinitions:'IMPLEMENTED',BoneCombatDefinitions:'IMPLEMENTED',HeroDodgeBinding:'IMPLEMENTED',IncomingAttackReaction:'IMPLEMENTED',BossResistanceIntegration:'IMPLEMENTED',BoneSkillExecutor:'PARTIAL',NormalSelectorEntry:'PARTIAL',ThreatCheckpointResume:'PARTIAL',HamletEffectBridge:'BLOCKED',RoomStorage:'PARTIAL',SaveReplayProduction:'PARTIAL',CaptainProductionInjection:'NOT_PROVEN',LargeOccupancyMovement:'SOURCE_UNRESOLVED',ThreatReanimation:'NOT_PROVEN'}},
  'next-workstream-decision':{...common,verdict:'C1C32R-NECROMANCER-RUNTIME-FOUNDATION-NOT-FINALIZED',decision:'NECROMANCER_RUNTIME_DEPENDENCY_CONTRACT_REVIEW_REQUIRED',nextWorkstream:'Continue C1C32R after executable dependency closure',promoteC1C33:false,blockers:blockers.map(b=>b.id)}
};
for(const [name,value] of Object.entries(data))writeFileSync(prefix+'c1c32r-'+name+'.json',JSON.stringify(value,null,2)+'\n');
console.log('C1C32R audit generated: NOT_FINALIZED; storage termination proof PASS; C1C33 blocked.');
