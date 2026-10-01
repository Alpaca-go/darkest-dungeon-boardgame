import { describe, expect, it } from 'vitest';
import { probeHeroEntryBlocker, verifyFoundationArtifacts } from '../../scripts/audit/c1c35r2b-foundation';
import { historicalBaselines, verifyHistoricalArtifacts } from '../../scripts/audit/historical-baseline';

describe('C1C35R2B fail-closed Hero entry dependency',()=>{
  it.each([1,2,3] as const)('rejects Level %i bind, entry and forged coordinate without state/RNG mutation',level=>{
    expect(probeHeroEntryBlocker(level)).toMatchObject({level,heroStartArea:null,mutation:false,rngConsumption:0,callerCoordinateRejected:true});
  });
  it('pins R2A-R and checks both predecessor artifact families against raw Git blobs',()=>{
    expect(historicalBaselines.c1c35r2ar.commit).toBe('007712ab6aec2c814fa31e06cf5fe05b21a30879');
    expect(verifyHistoricalArtifacts('c1c35r2ar')).toBeGreaterThan(0);
  });
  it('never promotes blocked artifacts or authorizes C1C36',()=>{
    const artifacts=verifyFoundationArtifacts();
    for(const data of Object.values(artifacts)) expect(data).toMatchObject({productionFoundation:false,productionAccepted:false,c1c36Allowed:false});
    expect(artifacts['foundation-capability-matrix'].rows.every(r=>r.status==='BLOCKED')).toBe(true);
  });
});
