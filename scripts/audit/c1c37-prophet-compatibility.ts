import {createHash} from 'node:crypto';
import {copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {buildFoundationArtifacts} from './c1c35r2br1-foundation';
import {verifyHistoricalBaseline} from './historical-baseline';
import {resolveBossDefinition,resolveEncounterRuleDependencies} from '../../src/game-engine/bosses/definitions';
import {createNewCampaign,selectParty,applyDefaultLoadout} from '../../src/game-engine/campaign';
import {explicitlyMigrateHeroDodgeToV2} from '../../src/game-engine/rules/hero-dodge-versioning';
import {selectProductionRuinsV6} from '../../src/game-engine/commands/necromancer-production-entry';
import {commitQuestSelection,commitLeaveDungeon,commitReturnToHamlet} from '../../src/game-engine/commands/quest';
import {getQuestPool,getBossQuestPool,runtimeContentContext} from '../../src/data/content-selector';
import {PRODUCTION_FACE_THE_THREAT_QUEST} from '../../src/data/quests/production-face-the-threat';
import {seededRuntimeSources,withRuntimeSources} from '../../src/game-engine/runtime-sources';
import {createSaveSnapshot,restoreSaveSnapshot,validateSaveFile} from '../../src/game-engine/save';
import {prophetTavernRecoveryModifier} from '../../src/game-engine/prophet/production-threat';
import {recoverStress} from '../../src/game-engine/stress';
import type {CampaignState} from '../../src/types';

export const C1C36_ACCEPTED_COMMIT='87f123b881fbbc44d79c312fe1aebb34eadea240';
export const prophetCompatibilityVersion='C1C37-PROPHET-SUCCESSOR-COMPATIBILITY-v1';
const file='docs/data/complete-edition/c1c37-prophet-successor-compatibility.json';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error(message);};

export function prophetPrerequisite(level:1|2|3):CampaignState {
  let c=applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),['crusader','leper','highwayman','vestal']));
  // This scenario reproduces the accepted v22 legacy save family, not a new C2D campaign.
  c.saveVersion=22; delete c.heroRuntimeSelection;
  c.gamePhase='quest-select';c=selectProductionRuinsV6(explicitlyMigrateHeroDodgeToV2(c,'c1c37-compatibility-dodge'));
  c.act=level;c.campaignLevel=level;
  Object.assign(c.campaignProgress,{act:level,campaignLevel:level,activeBossFamilyId:'prophet',defeatedBossFamilyIds:level===3?['necromancer','hag']:level===2?['necromancer']:[]});
  return c;
}
function trip(c:CampaignState):CampaignState {
  const save=createSaveSnapshot(c);assert(validateSaveFile(save)===null,'Prophet current save rejected');
  const restored=restoreSaveSnapshot(JSON.parse(JSON.stringify(save)));
  assert(JSON.stringify(restored)===JSON.stringify(c),'Prophet full save/restore drift');return restored;
}
export function captureProphetCompatibility() {
  // Execute existing production proofs on HEAD. Freeze behavioral outputs from
  // accepted C1C36, never source hashes of the evolving shared runtime.
  const foundation=buildFoundationArtifacts();
  const proofNames=['production-state-contract','ordinal1-proof','ordinal2-proof','rubble-proof','threat-runtime-proof','room-lifecycle-proof','tamper-matrix'] as const;
  const proofs=Object.fromEntries(proofNames.map(n=>[n,hash(foundation[n].proof)]));
  const levels=withRuntimeSources(seededRuntimeSources(3736),()=> ([1,2,3] as const).map(level=>{
    let c=prophetPrerequisite(level);const checkpoints:unknown[]=[];
    for(let q=0;q<2;q++){
      c.gamePhase='quest-select';const quest=getQuestPool(runtimeContentContext(c))[0];
      const selected=commitQuestSelection(c,quest.id);assert(selected.ok,'Source Standard selection lost');c=trip(selected.campaign);
      checkpoints.push({point:`standard-${q}`,stateHash:hash(c)});
      c=commitLeaveDungeon(c).campaign;
      c=trip(commitReturnToHamlet(c,{questId:quest.id,questRunId:c.dungeon!.questRunId,questOutcome:c.lastQuestResult!.outcome}).campaign);
      checkpoints.push({point:`archived-${q}`,stateHash:hash(c)});
    }
    c.gamePhase='quest-select';assert(getBossQuestPool(runtimeContentContext(c)).includes(PRODUCTION_FACE_THE_THREAT_QUEST),'Shared printed Boss selector lost');
    const selected=commitQuestSelection(c,'face-the-threat');assert(selected.ok,'Prophet player entry lost');c=trip(selected.campaign);
    assert(c.prophetQuestThreatHistory?.length===2 && c.bossRoomStorage?.lifecycle==='RESERVED','Cross-Quest / Room ownership lost');
    const forged=structuredClone(c);forged.prophetQuestThreatHistory![0].questRunId='forged';
    assert(validateSaveFile(createSaveSnapshot(forged))!==null,'Cross-Quest forged receipt accepted');
    const tavern=structuredClone(c);tavern.heroes[0].stress=9;
    const input={heroId:tavern.heroes[0].instanceId,amount:5,sourceType:'hamlet-event' as const,sourceId:'tavern',questId:c.currentQuestId!};
    const activeRecovery=recoverStress(tavern,input).campaign.heroes[0].stress;
    tavern.activeThreatRuntime!.active=false;
    const inactiveRecovery=recoverStress(tavern,input).campaign.heroes[0].stress;
    assert(activeRecovery===4+level&&inactiveRecovery===4,'Tavern active/deactivated behavior drift');
    return {level,definition:resolveBossDefinition('prophet',level,'C1C35R2-PROPHET-DIGITAL-DEFAULT-v1'),
      dependencies:resolveEncounterRuleDependencies('prophet','C1C35R2-PROPHET-DIGITAL-DEFAULT-v1'),
      tavernModifier:prophetTavernRecoveryModifier(level),tavern:{activeRecovery,inactiveRecovery},checkpoints,reservedStateHash:hash(c),crossQuestTamperRejected:true};
  }));
  return {schemaVersion:1,version:prophetCompatibilityVersion,baseline:C1C36_ACCEPTED_COMMIT,
    captureProtocol:'DETACHED_ACCEPTED_C1C36_BEHAVIORAL_OUTPUTS',status:'PASS',
    requiredCoverage:['Levels I / II / III','Boss ruleset identity','Hero Dodge v2','stance-aware Hero entry','Room 11 / Tile 11','Area C capacity 6',
      'four physical Pews','ordinal 1 placement','ordinal 2 Skill','Crowded PendingChoice','ordinal 3 Rubble','Threat I / II / III',
      'Tavern modifiers','cross-Quest receipts','save/replay','victory cleanup','campaign progression','tamper rejection'],proofs,levels};
}
export function verifyProphetCompatibility() {
  const actual=captureProphetCompatibility(),expected=JSON.parse(readFileSync(file,'utf8'));
  assert(JSON.stringify(actual)===JSON.stringify(expected),'Prophet successor differs from accepted C1C36 behavioral outputs');return actual;
}
export function verifyProphetCaptureOrigin(write=false) {
  verifyHistoricalBaseline('c1c36',[],checkout=>{
    const script='scripts/audit/c1c37-prophet-compatibility.ts';copyFileSync(script,resolve(checkout,script));
    execFileSync(process.execPath,[resolve('node_modules/vite-node/vite-node.mjs'),script,'--capture-c1c36'],{cwd:checkout,stdio:'pipe',maxBuffer:16*1024*1024});
    const bytes=readFileSync(resolve(checkout,file));
    if(write)writeFileSync(file,bytes);else assert(bytes.equals(readFileSync(file)),'Prophet compatibility expectation origin drift');
  });
}
if(process.argv.includes('--capture-c1c36')) {
  execFileSync('git',['diff','--exit-code',C1C36_ACCEPTED_COMMIT,'--','src/game-engine','src/data','src/types'],{stdio:'pipe'});
  writeFileSync(file,JSON.stringify(captureProphetCompatibility(),null,2)+'\n');
}
if(process.argv.includes('--capture-origin'))verifyProphetCaptureOrigin(true);
if(process.argv.includes('--verify-origin'))verifyProphetCaptureOrigin();
if(process.argv.includes('--verify-compatibility')){verifyProphetCompatibility();console.log('PROPHET_SUCCESSOR_COMPATIBILITY: PASS');}
