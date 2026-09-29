import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { productionBoneDefinitions } from '../../src/game-engine/bosses/component-adapters/bone-combat-adapter';
import { resolveHeroDodge } from '../../src/game-engine/rules/hero-dodge';
import { resolveBossDefinition } from '../../src/game-engine/bosses/definitions';
import { commandIntegrationProofs } from './c1c32-production-proof';

export const root='docs/data/complete-edition/';
export const baselineHead='e0158c0af8c1e84a0c861f74ca67c436b6f5ae67';
const version='C1C31-DIGITAL-DEFAULT-v2';
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
export function frozenInputs() {
  const paths=readdirSync(root).filter(n=>/^c1c(?:2[0-9]|30|31|31r)-.*\.json$/.test(n)).map(n=>root+n);
  paths.push(root+'rule-source-policy.json',root+'c1c19-rulebook-extracted-evidence.json','src/game-engine/necromancer/contract-adapter.ts');
  return Object.fromEntries(paths.sort().map(path=>{
    const previous=execFileSync('git',['show',baselineHead+':'+path],{maxBuffer:64*1024*1024}).toString().replace(/\r\n/g,'\n');
    const current=readFileSync(path,'utf8').replace(/\r\n/g,'\n');
    if(current!==previous)throw new Error('Frozen canonical/ruling input changed: '+path);
    return [path,hash(current)];
  }));
}
export function buildArtifacts():Record<string,unknown> {
  const bones=productionBoneDefinitions(version);
  const heroes=['crusader','vestal','highwayman','hellion','leper','occultist','plague-doctor','grave-robber']
    .flatMap(heroId=>([1,2,3] as const).map(level=>resolveHeroDodge({heroId,level,ruleSetVersion:version})));
  const bosses=([1,2,3] as const).map(level=>resolveBossDefinition('necromancer',level,version));
  for(const bone of bones)for(const ref of bone.sourceReferences)if(hash(readFileSync(ref.path))!==ref.sha256)throw new Error('Locked printed source changed: '+ref.path);
  const proofs=commandIntegrationProofs();
  const common={schemaVersion:1,phase:'11A.4-C1C32',baselineHead,ruleSourcePolicyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',externalSourceAcquisition:false,
    ruleSetVersion:version,frozenInputSha256:frozenInputs(),foundationAccepted:false,productionReady:0};
  const capabilities={coreBossDefinitions:'IMPLEMENTED',BoneCombatDefinitions:'IMPLEMENTED',HeroDodgeBinding:'IMPLEMENTED',BoneSkillExecutor:'PARTIAL',
    NormalSelectorEntry:'PARTIAL',ThreatCheckpointResume:'PARTIAL',HamletEffectBridge:'BLOCKED',IncomingAttackReaction:'IMPLEMENTED',RoomStorage:'PARTIAL',
    BossResistanceIntegration:'IMPLEMENTED',SaveReplayProduction:'PARTIAL'};
  const blocker={id:'PRODUCTION_THREAT_DOMAIN_BRIDGE',classification:'ENGINEERING',affectedCapabilities:['BoneSkillExecutor','NormalSelectorEntry','ThreatCheckpointResume','HamletEffectBridge','RoomStorage','SaveReplayProduction'],
    missingDependencies:[
      'Ordinary Dungeon Threat Battle has no source-bound production encounter command; prototype encounters remain outside Boss Room.',
      'Level II Captain placement and Large movement through crowded Areas are not closed by the generic production path.',
      'Preparation Day forcedHeroId has no Graveyard command/campaign transaction consumer.',
      'A/B/D/E command-isolation proofs do not prove full normal-path replay; C Reanimation on THREAT is not proven.'
    ],stopAffectedPromotion:true,ruleReviewReopened:false,dodgeBlockers:0,stanceSourceBlockers:0};
  const data:Record<string,unknown>={
    'production-definition-binding':{...common,count:bones.length,definitions:bones,normalSummonPool:bones.filter(b=>b.ordinaryNecromancerSummonPool).map(b=>b.definitionId),captainThreatOnly:true},
    'hero-dodge-runtime-binding':{...common,requiredPairs:24,official:heroes.filter(h=>h.authority==='OFFICIAL_SOURCE').length,projectRuling:heroes.filter(h=>h.authority==='PROJECT_RULING').length,missing:0,bindings:heroes,
      attackConsumer:'src/game-engine/component-monster-runtime.ts:resolveSourceAttackDodge',migration:'explicit pre-encounter only; existing Battle/checkpoint rejected'},
    'runtime-capability-matrix':{...common,coreBossDefinitionCount:new Set(bosses.flatMap(b=>[b.bossIdentityCardId,b.threatAbilityCardId,b.battleCardId])).size,boneDefinitionCount:bones.length,capabilities,allCapabilityGatesImplemented:false,blocker},
    'production-runtime-proof':{...common,classification:'REAL_COMPONENT_COMMAND_INTEGRATION_ISOLATION',productionAcceptance:false,syntheticCombatDefinitionDependencies:0,
      scenarios:proofs,fullBrowserPath:'PRODUCT_FAILURE',reason:blocker.missingDependencies},
    'production-save-replay-proof':{...common,scenarios:proofs,fullProductionReplayPassed:false,requiredHashFields:['initialStateHash','preSaveHash','saveHash','reloadedHash','finalStateHash','eventSequenceHash','ruleSetVersion'],
      nullHashesMean:'NOT_PROVEN; no substitute fixture hash',savedPendingFields:['parentEventId','targetHeroUnitId','rolls','modifiers','alreadyResolvedHeroes','remainingHeroes','sourceSkill','ruleSetVersion']},
    'room-storage-proof':{...common,owner:'CampaignState.bossRoomStorage',card:'locked definition roomCardId',tile:'tile-10',lifecycle:['RESERVED','IN_PLAY','RETURNED'],
      importValidation:'src/game-engine/bosses/room-storage.ts',commandCleanupProof:proofs.find(p=>p.scenario==='D'),fullRoomDeckIntegrationAcceptance:false},
    'reaction-proof':{...common,sharedAttackRoll:true,perHeroReactionCursor:true,isolatedSaveAfterHero1BeforeHero2:'PASS',causalEventsPreserved:true,
      tests:'src/audit/c1c32-necromancer-runtime-finalization.test.ts',fullBrowserReactionAcceptance:false},
    'contract-review':{...common,contract:'C1C28-DIGITAL-DEFAULT-v1',inheritedWithoutMutation:true,heroDodgeOverrideOnly:version,requiredDependencyReview:blocker,
      unresolvedRulePolicy:'SOURCE_UNRESOLVED remains canonical; no new PROJECT_RULING and no runtime guess',reanimationSide:'THREAT',reanimationNeverMovedToAbility:true},
    'next-workstream-decision':{...common,decision:'NECROMANCER_RUNTIME_ENGINEERING_BLOCKER_REVIEW',verdict:'C1C32-NECROMANCER-RUNTIME-FOUNDATION-NOT-FINALIZED',
      nextWorkstream:'Complete PRODUCTION_THREAT_DOMAIN_BRIDGE before C1C33 promotion',blocker,allCapabilityGatesImplemented:false,fullProductionAcceptance:false}
  };
  return Object.fromEntries(Object.entries(data).map(([suffix,value])=>['c1c32-necromancer-'+suffix+'.json',value]));
}
