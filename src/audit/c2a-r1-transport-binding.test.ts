import {describe,it,expect} from 'vitest';
import {buildC2AR1Artifacts,validateC2AR1Artifacts,verifyRuntimeBoundary} from '../../scripts/audit/c2a-r1-transport-binding';
const a=buildC2AR1Artifacts();
describe('C2A-R1 transport closure with immutable identity evidence',()=>{
  it('accepts 139 demonstrated relations with no remaining gaps',()=>{validateC2AR1Artifacts(a);expect(a['source-gap-register'].counts).toMatchObject({starting:139,closed:139,remaining:0});});
  it('preserves 18 groups, 199 owners, 36 PvP, 37 profiles, 126 skills and 378 forms',()=>{
    expect(Object.keys(a).filter(k=>k.startsWith('heroes/'))).toHaveLength(18);
    expect(a['hero-physical-census'].objects).toHaveLength(199);
    expect(a['hero-physical-census'].officialPrintedObjects).toHaveLength(451);
    expect(a['profile-transport-binding'].entries).toHaveLength(37);
    expect(a['skill-back-transport-binding'].entries).toHaveLength(102);
    expect(a['hero-skill-level-form-map']).toMatchObject({frontBound:378,backBound:378,stateIndexIsLevelAuthority:false});
    for(const h of Object.values(a).filter((v:any)=>v.previousCensusStatus) as any[]){expect(h.skills).toHaveLength(7);expect(h.skillStates).toHaveLength(21);expect(h.censusStatus).toBe('CENSUS_COMPLETE');}
  });
  it('keeps three separate Abomination Human / Beast pairs and transformation back names',()=>{
    const p=a['profile-transport-binding'].entries.filter((p:any)=>p.heroId==='abomination');
    expect(p.map((p:any)=>[p.printedFrontLevel,p.printedBackLevel]).sort()).toEqual([['I','I'],['II','II'],['III','III']]);
    expect(p.every((p:any)=>p.frontRole==='HUMAN_FORM'&&p.backRole==='BEAST_FORM')).toBe(true);
    expect(a['heroes/abomination'].skillStates.filter((f:any)=>f.printedName==='Transform to Beast').map((f:any)=>f.printedBackName)).toEqual(['Transform to Human','Transform to Human','Transform to Human']);
  });
  it('keeps runtime source, Thing hold and Boss successor gates frozen',()=>{
    verifyRuntimeBoundary();const d=a['next-workstream-decision'];
    expect(d).toMatchObject({ThingStatus:'SOURCE_ACQUISITION_HOLD',ThingRuntimeAuthorized:false,necromancerSuccessorCompatibility:'PASS',prophetSuccessorCompatibility:'PASS',bossSuccessorCompatibility:'PASS',C2BPerformed:false});
  });
  const attacks:[string,(a:any)=>void][]=[
    ['CardID-only Profile mapping',a=>a['profile-transport-binding'].entries[0].reviewBasis='CardID-only'],
    ['array-order Profile mapping',a=>a['profile-transport-binding'].entries[0].reviewBasis='array order'],
    ['state-index Level mapping',a=>a['hero-skill-level-form-map'].forms[0].mappingBasis='state index'],
    ['missing atlas treated as match',a=>a['skill-back-transport-binding'].entries[0].transportBackHash=null],
    ['back inferred only from front',a=>a['skill-back-transport-binding'].entries[0].reviewBasis='front identity'],
    ['Abomination back renamed to front',a=>{const f=a['skill-back-transport-binding'].entries.find((f:any)=>f.printedBackName==='Transform to Human');f.printedBackName='Transform to Beast';}],
    ['candidate treated as proven',a=>a['profile-transport-binding'].entries[0].visualReview='CANDIDATE_EXISTS'],
    ['prototype stats promoted',a=>a['heroes/crusader'].prototypePromoted=true],
    ['runtime registry modified',a=>a['hero-source-census-acceptance'].runtimeModified=true],
    ['Skill front remapped',a=>a['hero-skill-level-form-map'].forms[0].officialSource.page++],
    ['discarded owner',a=>a['hero-physical-census'].objects.pop()],
    ['silent gap deletion',a=>a['source-gap-register'].counts.starting--],
    ['similarity II overrides visibly printed III',a=>a['profile-transport-binding'].entries.find((p:any)=>p.transportGuid==='1bc8a5').officialFront.page=22],
    ['Thing promotion',a=>a['next-workstream-decision'].ThingRuntimeAuthorized=true],
    ['Boss gate weakened',a=>a['next-workstream-decision'].bossSuccessorCompatibility='SKIPPED'],
    ['C2B numerical normalization',a=>a['hero-skill-level-form-map'].forms[0].damage=99],
  ];
  it.each(attacks)('rejects %s',(_label,mutate)=>{const copy=structuredClone(a);mutate(copy);expect(()=>validateC2AR1Artifacts(copy)).toThrow(/C2A-R1:/);});
});
