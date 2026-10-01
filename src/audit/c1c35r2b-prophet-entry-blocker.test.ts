import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {blockerDisposition} from '../../scripts/audit/c1c35r2br1-foundation';
import {historicalBaselines,verifyHistoricalArtifacts} from '../../scripts/audit/historical-baseline';

describe('C1C35R2B invalid blocker disposition and retained failed history',()=>{
  it('corrects the assessment without inventing a ruling',()=>{
    expect(blockerDisposition).toMatchObject({assessmentDisposition:'INVALID_BLOCKER_RUNTIME_MODEL_GAP',sourceWasAvailable:true,newProjectRulingRequired:false});
  });
  it('retains the failed artifact as history, without treating it as current source authority',()=>{
    const path='docs/data/complete-edition/c1c35r2b-prophet-production-foundation-acceptance.json';
    expect(readFileSync(path).equals(execFileSync('git',['show',`${blockerDisposition.failedHistoryCommit}:${path}`]))).toBe(true);
    expect(JSON.parse(readFileSync(path,'utf8')).productionFoundation).toBe(false);
  });
  it('pins R2A-R and checks both predecessor artifact families against raw Git blobs',()=>{
    expect(historicalBaselines.c1c35r2ar.commit).toBe('007712ab6aec2c814fa31e06cf5fe05b21a30879');
    expect(verifyHistoricalArtifacts('c1c35r2ar')).toBeGreaterThan(0);
  });
});
