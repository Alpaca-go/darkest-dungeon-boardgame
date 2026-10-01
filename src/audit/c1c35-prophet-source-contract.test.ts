import { describe, expect, it } from 'vitest';
import { buildProphetContract, validatePrintedMap, verifyProphetContract } from '../../scripts/audit/c1c35-prophet-contract';

describe('C1C35 Prophet source contract and mandatory stop', () => {
  it('is deterministic, hash-bound and preserves the production freeze', () => {
    const a=buildProphetContract();
    expect(a).toEqual(buildProphetContract());
    expect(()=>verifyProphetContract(a)).not.toThrow();
    expect(a['source-closure'].items).toHaveLength(22);
    expect(a['source-closure'].blockers).toEqual(['tile','target-effect-glyph-binding']);
  });
  it('recovers the actual uneven printed mapping without enabling placement', () => {
    const a=buildProphetContract();
    const m=a['d10-area-map'];
    expect(m.mapping).toEqual({1:'ruins-tile-11:NW',2:'ruins-tile-11:NW',3:'ruins-tile-11:N',4:'ruins-tile-11:NE',
      5:'ruins-tile-11:W',6:'ruins-tile-11:C',7:'ruins-tile-11:E',8:'ruins-tile-11:E',9:'ruins-tile-11:SW',10:'ruins-tile-11:S'});
    expect(m.executable).toBe(false);
    expect(a['tile-contract'].areas.find((r:any)=>r.id==='ruins-tile-11:C').capacity).toMatchObject({status:'SOURCE_UNRESOLVED',value:null});
  });
  const mapMutations: [string,(m:any)=>void][] = [
    ['missing result',m=>m.entries.pop()],
    ['invalid Area',m=>m.entries[0].areaId='ruins-tile-11:UNKNOWN'],
    ['duplicate key',m=>m.entries[1].roll=1],
    ['malformed key',m=>m.entries[0].roll='1'],
    ['prototype Area',m=>m.entries[0].areaId='PROPHET_PROTOTYPE_ROOM:A'],
    ['topology source mismatch',m=>m.topologySource.sha256='forged'],
    ['topology page mismatch',m=>m.topologySource.page=14],
    ['malformed object key',m=>{m.mapping['01']=m.mapping['1'];delete m.mapping['1'];}],
    ['alternate representation',m=>m.mapping['1']='ruins-tile-11:N'],
  ];
  it.each(mapMutations)('rejects d10 %s',(name,mutate)=>{
    const a=buildProphetContract();mutate(a['d10-area-map']);
    expect(()=>validatePrintedMap(a['d10-area-map'],a['tile-contract'])).toThrow();
  });
  it('records separate Prophet rulings with choice and attack journal requirements',()=>{
    const a=buildProphetContract();const r=a['project-rulings'];
    expect(r).toMatchObject({ruleSetVersion:'C1C35-PROPHET-DIGITAL-DEFAULT-v1',canonical:false,inheritsNecromancerRulings:false,executionEnabled:false});
    expect(r.rulings[0]).toMatchObject({id:'crowded-area-tie',playerChoiceRequired:true,rngAllowed:false});
    expect(r.rulings[1].saveRepresentation).toContain('rubbleCursor');
    expect(r.rulings[1].saveRepresentation).toContain('pendingPewAttack');
  });
  const mutations: [string,(a:any)=>void][] = [
    ['guessed capacity',a=>a['tile-contract'].areas.find((r:any)=>r.id==='ruins-tile-11:C').capacity.value=4],
    ['promotion',a=>a['next-workstream-decision'].foundationExecutionAllowed=true],
    ['forged input hash',a=>a['source-closure'].inputHashes['docs/data/complete-edition/rule-source-policy.json']='forged'],
    ['omitted required field',a=>a['source-closure'].items.pop()],
    ['prototype definition',a=>a['production-definitions'].definitions.push({id:'prophet-prototype'})],
    ['false replay',a=>a['save-contract'].replayProof={passed:true}],
    ['hidden runtime acceptance',a=>a['runtime-capability-matrix'].executablePaths=1],
    ['cross-level numeric substitution',a=>a['source-closure'].items.find((r:any)=>r.id==='level-3-stats').value.life=79],
    ['unreviewed Rubble scope',a=>a['glyph-semantic-contract'].bindings.at(-1).targetScope='ALL_HEROES'],
    ['map substitution',a=>{a['d10-area-map'].entries[0].areaId='ruins-tile-11:N';a['d10-area-map'].mapping['1']='ruins-tile-11:N';}],
  ];
  it.each(mutations)('rejects %s',(name,mutate)=>{
    const a=buildProphetContract();mutate(a);expect(()=>verifyProphetContract(a)).toThrow();
  });
  it('does not claim tests that require Gate B or permit a selector route',()=>{
    const a=buildProphetContract();
    expect(a['foundation-proof']).toMatchObject({gateAPassed:false,gateBStarted:false,productionTestsPerformed:false,browserAcceptancePerformed:false});
    expect(a['production-definitions'].definitions).toEqual([]);
    expect(a['next-workstream-decision']).toMatchObject({outcome:'PROPHET_PRODUCTION_FOUNDATION_BLOCKED',status:'PROPHET_FOUNDATION_BLOCKED_ON_SPATIAL_SOURCE',controlledFoundationRouteAllowed:false,c1c36FullPathAllowed:false});
  });
});
