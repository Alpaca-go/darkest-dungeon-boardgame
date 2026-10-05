import {readFileSync, writeFileSync, copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolveBossDefinition} from '../../src/game-engine/bosses/definitions';
import {compareProductionReplay} from './c1c32r3r-replay';
import type {CampaignState} from '../../src/types';
import {createSaveSnapshot,validateSaveFile,restoreSaveSnapshot} from '../../src/game-engine/save';
import {verifyHistoricalBaseline} from './historical-baseline';

export const compatibilityVersion = 'C1C35R2A-NECROMANCER-SUCCESSOR-COMPATIBILITY-v1';
export const baseline = '101c27c8c15fcb93802f956f399c37ed9c38a2e9';
const path = 'docs/data/complete-edition/c1c35r2a-necromancer-successor-compatibility.json';
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex');
export function captureNecromancerCompatibility() {
  const read = (name: string) => JSON.parse(readFileSync(`docs/data/complete-edition/${name}.json`, 'utf8'));
  const levels = [1,2,3].map(level => {
    const states = read(`c1c33-browser-level${level}-replay-states`) as Array<{point: string; campaign: CampaignState}>;
    const extras = level === 1 ? [] : ['settled','archived'].map(key => ({point:`standard-level-${level}-${key}`, campaign:read(`c1c33-standard-level${level}-observation`)[key] as CampaignState}));
    return {level, definitions:['C1C28-DIGITAL-DEFAULT-v1','C1C31-DIGITAL-DEFAULT-v2'].map(version => resolveBossDefinition('necromancer',level as 1|2|3,version)),
      checkpoints:[...states,...extras].map(({point,campaign}) => ({...compareProductionReplay(point,campaign),
        campaignResultHash:hash(campaign.campaignProgress), roomOwnershipHash:hash(campaign.bossRoomStorage),
        heroBindingsHash:hash(campaign.battle?.bossEncounter?.checkpointContext?.heroDodgeBindings ?? campaign.bossEncounterCheckpoint?.checkpointContext?.heroDodgeBindings),
        rngHash:hash(campaign.battle?.bossEncounter?.rngState ?? campaign.bossEncounterCheckpoint?.rngState),
      }))};
  });
  const states=read('c1c33-browser-level2-replay-states') as Array<{point:string;campaign:CampaignState}>;
  const tamperRejection=['family','Room ownership','Threat linkage','Hero binding','event version'].map(kind=>{
    const c=structuredClone(states.find(s=>s.point==='after-face-the-threat-selection')!.campaign),e=c.bossEncounterCheckpoint!;
    if(kind==='family')e.bossFamily='prophet';
    if(kind==='Room ownership')c.bossRoomStorage!.tileId='forged';
    if(kind==='Threat linkage')c.campaignProgress.activeThreatId='forged';
    if(kind==='Hero binding')Object.values(e.checkpointContext!.heroDodgeBindings!)[0].value++;
    if(kind==='event version')e.events[0].ruleSetVersion='forged';
    const save=createSaveSnapshot(c),validationRejected=validateSaveFile(save)!==null;
    let restoreRejected=false;try{restoreSaveSnapshot(save);}catch{restoreRejected=true;}
    if(!validationRejected || !restoreRejected)throw new Error('Necromancer tamper rejection lost: '+kind);
    return {kind,validationRejected,restoreRejected};
  });
  return {schemaVersion:1, version:compatibilityVersion, baseline, captureProtocol:'ACCEPTED_BASELINE_BEFORE_SHARED_API_CHANGES',
    requiredCoverage:['Levels I / II / III definition','Hero Dodge','active Threat checkpoint','ordinary Threat Battle','Captain injection','Reanimation','Preparation Day',
      'Room 10 reservation / RESERVED → IN_PLAY → RETURNED','Boss entry / Battle / victory','save → reload','tamper rejection','campaign progression','physical ownership','RNG continuation'],
    levels,tamperRejection};
}
/** Reproduce the frozen outputs with accepted source bytes; never allow HEAD to generate its own expectations. */
export function verifyCompatibilityCaptureOrigin(write=false) {
  verifyHistoricalBaseline('c1c35r2',[],checkout=>{
    const script='scripts/audit/c1c35r2a-necromancer-compatibility.ts';
    copyFileSync(script,resolve(checkout,script));
    execFileSync(process.execPath,[resolve('node_modules/vite-node/vite-node.mjs'),script,'--capture-baseline'],{cwd:checkout,stdio:'pipe',maxBuffer:16*1024*1024});
    const bytes=readFileSync(resolve(checkout,path));
    if(write)writeFileSync(path,bytes);
    else if(!bytes.equals(readFileSync(path)))throw new Error('Compatibility expectations are not accepted baseline outputs');
  });
}
export function verifyNecromancerCompatibility() {
  const expected = JSON.parse(readFileSync(path,'utf8'));
  const actual = captureNecromancerCompatibility();
  if (JSON.stringify(actual)!==JSON.stringify(expected)) throw new Error('Necromancer successor behavior differs from frozen baseline outputs');
  return actual;
}
if (process.argv.includes('--capture-baseline')) {
  // Recapture is legal only with the original production bytes. A successor cannot bless its own drift.
  execFileSync('git',['diff','--exit-code',baseline,'--','src/game-engine','src/data','src/types'],{stdio:'pipe'});
  writeFileSync(path,JSON.stringify(captureNecromancerCompatibility(),null,2)+'\n');
}
if (process.argv.includes('--verify-compatibility')) { verifyNecromancerCompatibility(); console.log(compatibilityVersion+': PASS'); }
if (process.argv.includes('--capture-immutable-origin')) verifyCompatibilityCaptureOrigin(true);
if (process.argv.includes('--verify-immutable-origin')) verifyCompatibilityCaptureOrigin();
