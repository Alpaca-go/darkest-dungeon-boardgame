import {describe,it,expect} from 'vitest';
import {validateCapabilityPromotion,recognizedCompatibilityVersions} from '../../scripts/audit/c1c37-successor';
import {verifyProphetCompatibility} from '../../scripts/audit/c1c37-prophet-compatibility';
import {verifyNecromancerCompatibility} from '../../scripts/audit/c1c35r2a-necromancer-compatibility';
import {verifyHistoricalBaseline} from '../../scripts/audit/historical-baseline';
import {buildBossSourceSurvey} from '../../scripts/audit/c1c37-source-survey';
import {auditBuiltProductionIsolation} from '../../scripts/audit/c1c37-production-isolation';
import {productionBossPlayerRouteEnabled,productionBossCapabilities} from '../game-engine/bosses/production-capabilities';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';

describe('C1C37 independent historical and current successor gates',()=>{
  it('preserves immutable C1C36 identity, bytes and ancestry without historical browser replay',()=>verifyHistoricalBaseline('c1c36'));
  it('retains the complete accepted Necromancer compatibility suite',()=>expect(verifyNecromancerCompatibility().levels).toHaveLength(3));
  it('reproduces accepted Prophet behavior on current HEAD',()=>expect(verifyProphetCompatibility().levels).toHaveLength(3),120_000);
  it('recognizes every enabled production family/version',()=>{validateCapabilityPromotion();expect(Object.keys(recognizedCompatibilityVersions).sort()).toEqual(['necromancer','prophet']);});
  it.each(['unknown','thing-from-the-stars','collector','hag'])('fails closed for %s',family=>{
    expect(productionBossPlayerRouteEnabled(family,'C1C35R2-PROPHET-DIGITAL-DEFAULT-v1')).toBe(false);
    expect(()=>validateCapabilityPromotion([...productionBossCapabilities,{familyId:family,bossRuleSetVersions:['v1'],playerRouteEnabled:true}])).toThrow();
  });
  it.each(['necromancer','prophet'])('rejects unrecognized enabled %s version',family=>{
    expect(productionBossPlayerRouteEnabled(family,'unknown-v1')).toBe(false);
    expect(()=>validateCapabilityPromotion(productionBossCapabilities.map(c=>c.familyId===family?{...c,bossRuleSetVersions:['unknown-v1']}:c))).toThrow();
  });
  it('surveys all 18 remaining families and selects exactly one source-only candidate',()=>{
    const a=buildBossSourceSurvey(),families=a['boss-family-source-survey'].families;
    expect(families).toHaveLength(18);expect(families.some(f=>['Necromancer','Prophet'].includes(f.family))).toBe(false);
    expect(a['boss-family-reuse-ranking'].ranking[0]).toMatchObject({family:'Thing from the stars',physicalCards:3,literalComplete:2,unresolvedDefinitions:1,sourceGaps:52,planningCost:16});
    expect(a['next-family-decision']).toMatchObject({selectedFamily:'thing-from-the-stars',productionReady:false,runtimeImplementationAuthorized:false,productionRegistryPromotion:false});
    const fields=a['next-family-source-gap-matrix'].fields;
    for(const id of ['face-the-threat','campaign-level-availability','room-and-tile-model','threat-model'])expect(fields.find(f=>f.id===id)).toMatchObject({status:'SOURCE_UNRESOLVED',canonical:false,value:null,executable:false});
  });
  it('checks forbidden debug controls in a dynamically reachable child chunk',()=>{
    const scratch=mkdtempSync(join(tmpdir(),'dd-c1c37-chunk-'));
    try{
      mkdirSync(join(scratch,'assets'));writeFileSync(join(scratch,'index.html'),'<script src="/assets/index.js"></script>');
      writeFileSync(join(scratch,'assets/index.js'),'import("./child.js")');writeFileSync(join(scratch,'assets/child.js'),'const forbidden="inject-rubble";');
      expect(()=>auditBuiltProductionIsolation(scratch)).toThrow('Forbidden production chunk');
      writeFileSync(join(scratch,'assets/child.js'),'export const ok=1;');expect(auditBuiltProductionIsolation(scratch).reachableChunks).toHaveLength(2);
    }finally{if(!resolve(scratch).startsWith(resolve(tmpdir())+sep))throw new Error('Unsafe test cleanup');rmSync(scratch,{recursive:true,force:true});}
  });
});
