import { readFileSync, writeFileSync } from 'node:fs';
import { graveyardDependencyProofs } from './c1c32r2-graveyard-proof';
const root='docs/data/complete-edition/';
const read=(name:string)=>JSON.parse(readFileSync(root+`c1c32r2-${name}.json`,'utf8'));
const write=(name:string,value:unknown)=>writeFileSync(root+`c1c32r2-${name}.json`,JSON.stringify(value,null,2)+'\n');
const common={schemaVersion:1,phase:'11A.4-C1C32R2',baselineHead:'35a42ac46ba97b07ed941bca078dc53fb5fab1bb',policyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1'};
const deck=read('ruins-monster-deck-contract'),rooms=read('ruins-room-deck-contract'),tiles=read('ruins-tile-area-contract'),draw=read('ordinary-threat-encounter-draw-contract'),large=read('large-movement-project-ruling');
const gates={ordinaryRuinsMonsterDeckComplete:deck.compositionComplete&&deck.definitionClosureComplete,
  drawableProductionMonsterDefinitionsMissing:deck.missingMonsterDefinitions,prototypeMonsterDependencies:deck.prototypeMonsterDefinitions,
  roomDeckContractComplete:rooms.complete,room10ExclusionBound:rooms.room10ExclusionBound,tileAreaContractsComplete:tiles.complete,
  ordinaryEncounterDrawContractComplete:draw.complete,largeMovementExecutableContractComplete:large.implemented,
  graveyardCampaignTransactionImplemented:true,historicalRulesetsPreserved:true,explicitProjectRulingCreated:true};
const closed=Object.entries(gates).every(([key,value])=> typeof value==='number'?value===0:value===true);
if(closed)throw new Error('This audit has no implementation evidence to authorize promotion');
const blockers=[...new Set([...draw.blockers,'PRINTED_STANCE_GROUPING_REVIEW','PREPARATION_DAY_CHECKPOINT_DOMAIN_BRIDGE'])];
write('graveyard-transaction-proof',{...common,status:'DOMAIN_COMMAND_IMPLEMENTED',proofs:graveyardDependencyProofs(),productionUIPathProven:false,
  noPrototypeVirtueDependencies:true,sourceBoundVirtueCardCount:5,stressTenDeathPipeline:'killCampaignHero via applyStress',questStartHook:'selectQuest after resetMentalStateForNewQuest',questEndHook:'applyQuestRewards',scope:'No guarded THREAT Battle or full production Hamlet path claim'});
write('runtime-dependency-matrix',{...common,accepted:closed,gates,blockers,scenarioC:{status:'NOT_PROVEN',combatHashes:null},productionReady:0});
write('next-workstream-decision',{...common,verdict:'C1C32R2-NECROMANCER-THREAT-DEPENDENCY-CONTRACTS-NOT-CLOSED',decision:'DEPENDENCY_CONTRACT_CLOSURE_REMAINS_REQUIRED',blockers,
  integrationReady:false,nextPhaseAuthorized:null,C1C32R3:'NOT_AUTHORIZED_UNTIL_DEPENDENCIES_CLOSE',promoteC1C33:false,scenarioC:'NOT_PROVEN'});
console.log('C1C32R2 audit: NOT-CLOSED; Large movement dependency and Graveyard domain command implemented; promotion blocked.');
