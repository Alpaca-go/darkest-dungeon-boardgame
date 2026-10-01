import {describe,it,expect} from 'vitest';
import {buildGateA,validateGateAStructure,verifyGateA,capacityRulingId,ruleSetVersion} from '../../scripts/audit/c1c35r2-gate-a';
import {buildFoundationReview,validateFoundationReview,verifyFoundationReview,probeFoundationDependencies} from '../../scripts/audit/c1c35r2-foundation-review';

describe('C1C35R2 Gate A and fail-closed shared dependency review',()=>{
  it('closes all execution fields while retaining missing canonical capacity and scope',()=>{
    const a=buildGateA();expect(()=>verifyGateA()).not.toThrow();
    expect(a.acceptance).toMatchObject({requiredFieldCount:22,closedExecutionFields:22,executionBlockers:[],
      canonicalComplete:false,digitalExecutionContractComplete:true,gateAPassed:true,ruleSetVersion});
    expect(a.ruling).toMatchObject({id:capacityRulingId,actorCapacity:6,authority:'PROJECT_RULING',canonical:false,canonicalCapacity:null});
    expect(a.acceptance.rulingReferences.map(r=>r.version)).toEqual(['C1C35-PROPHET-DIGITAL-DEFAULT-v1',
      'C1C35R1-PROPHET-RUBBLE-TARGET-SCOPE-v1',capacityRulingId]);
  });
  const mutations:[string,(a:any)=>void][]=[
    ['official capacity',(a:any)=>a.ruling.authority='OFFICIAL_SOURCE'],
    ['canonical capacity',(a:any)=>a.ruling.canonicalCapacity=6],
    ['different numeric value',(a:any)=>a.ruling.actorCapacity=4],
    ['wrong ruling identity',(a:any)=>a.ruling.id='unversioned'],
    ['Pew actor',(a:any)=>a.ruling.pew.battleActor=true],
    ['Pew occupancy',(a:any)=>a.ruling.pew.capacityCost=1],
    ['unresolved execution row',(a:any)=>a.acceptance.items[0].contractExecutable=false],
    ['removed execution row',(a:any)=>a.acceptance.items.pop()],
    ['duplicate execution row',(a:any)=>a.acceptance.items[1]=a.acceptance.items[0]],
    ['implicit Necromancer inheritance',(a:any)=>a.acceptance.inheritsNecromancerRulings=true],
    ['ruling hash substitution',(a:any)=>a.acceptance.rulingReferences[0].sha256='forged'],
    ['canonical completeness promotion',(a:any)=>a.acceptance.canonicalComplete=true],
  ];
  it.each(mutations)('rejects %s',(name,mutate)=>{const a=buildGateA();mutate(a);expect(()=>validateGateAStructure(a)).toThrow();});
  it('executes real shared APIs and captures their unsupported identity/version failures',()=>{
    const rows=probeFoundationDependencies();expect(rows).toHaveLength(5);
    expect(rows.every(r=>r.pathInFreeze&&r.status==='DEPENDENCY_CONTRACT_REJECTED')).toBe(true);
    expect(rows[0].failures.map(r=>r.error)).toEqual(['Unsupported Boss family','Unsupported Boss family','Unsupported Boss family']);
    expect(rows[1].failures[0].error).toContain('Unsupported Hero Dodge ruleSetVersion');
    expect(rows[2].failures[0].error).toBe('Production Room storage invalid');
    expect(rows[3].failures[0].error).toBe('Unsupported Boss family');
    expect(rows[4].failures[0].error).toBe('Invalid Large contract provenance');
  });
  it('keeps independently printed levels and Threat sides bound without deriving stats',()=>{
    const a=buildFoundationReview();expect(a).toEqual(buildFoundationReview());
    expect(a['production-definitions'].definitions.map(d=>[d.level,d.stats.life,d.stats.dodge,d.battle.cardId,d.threat.cardId]))
      .toEqual([[1,79,0,46604,42009],[2,106,1,46605,42010],[3,151,3,46606,42011]]);
    expect(a['production-definitions'].definitions.every(d=>d.battle.physicalIdentity&&d.threat.physicalIdentity&&!d.runtimeRegistered)).toBe(true);
  });
  it('retains exact Pew map and independent printed Threat modifiers as contracts, not runtime proof',()=>{
    const a=buildFoundationReview();
    expect(a['physical-pew-contract'].map).toEqual({'1':'ruins-tile-11:NW','2':'ruins-tile-11:NW','3':'ruins-tile-11:N',
      '4':'ruins-tile-11:NE','5':'ruins-tile-11:W','6':'ruins-tile-11:C','7':'ruins-tile-11:E','8':'ruins-tile-11:E',
      '9':'ruins-tile-11:SW','10':'ruins-tile-11:S'});
    expect(a['threat-contract'].requiredHooks.map(h=>[h.level,h.stress,h.tavernRecoveryModifier])).toEqual([[1,2,-1],[2,1,-2],[3,1,-3]]);
    expect(a['save-contract'].reloadVerified).toBe(false);
  });
  it('verifies frozen predecessors and refuses to promote unexecuted foundation capabilities',()=>{
    expect(()=>verifyFoundationReview()).not.toThrow();
    const a=buildFoundationReview();expect(a['foundation-proof']).toMatchObject({gateAPassed:true,productionFoundation:false,
      productionAccepted:false,outcome:'PROPHET_PRODUCTION_FOUNDATION_BLOCKED',productionAcceptanceTestsPassed:0});
    expect(a['foundation-capability-matrix'].rows.every(r=>!r.accepted&&r.status==='NOT_RUNTIME_VERIFIED')).toBe(true);
    expect(a['next-workstream-decision'].c1c36Allowed).toBe(false);
    a['foundation-proof'].productionFoundation=true;expect(()=>validateFoundationReview(a)).toThrow('False production promotion');
  });
});
