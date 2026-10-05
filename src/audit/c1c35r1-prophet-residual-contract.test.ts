import { describe, expect, it } from 'vitest';
import { buildResidualContract, expectedPewTargets, scopeVersion, validatePewReload, validatePewTransactions,
  validateResidualStructure, verifyResidualContract } from '../../scripts/audit/c1c35r1-prophet-contract';
import type { BattleUnit } from '../types';

describe('C1C35R1 residual contracts (audit only)',()=>{
  it('preserves frozen evidence and accounts for all 22 fields deterministically',()=>{
    const a=buildResidualContract();expect(a).toEqual(buildResidualContract());
    expect(()=>verifyResidualContract(a)).not.toThrow();
    expect(a['gate-a-proof']).toMatchObject({requiredFields:22,closedExecutionFields:21,gateAPassed:false});
    expect(a['source-closure'].blockers).toEqual(['tile']);
    expect(a['source-closure'].items.find((r:any)=>r.id==='target-effect-glyph-binding')).toMatchObject({status:'PROJECT_RULING',canonical:false,contractExecutable:true});
  });
  it('keeps Pew d10=6 eligibility independent of unresolved Actor capacity',()=>{
    const a=buildResidualContract();
    expect(a['source-closure'].pewIndependence).toMatchObject({capacityCost:0,capacityRequiredForPewPlacement:false,d10SixPlacementLegal:true});
    expect(a['area-c-capacity-decision']).toMatchObject({canonicalStatus:'SOURCE_UNRESOLVED',adoptedNumericCapacity:null});
  });
  it('isolates artifact field lists so rejected mutations cannot weaken later validation',()=>{
    const changed=buildResidualContract();changed['rubble-target-scope-ruling'].saveExtension.authoritativeFields.splice(5,1);
    expect(()=>validateResidualStructure(changed)).toThrow();
    expect(buildResidualContract()['rubble-target-scope-ruling'].saveExtension.authoritativeFields).toContain('pendingPewAttack.targetActorIds');
  });
  const mutations:[string,(a:any)=>void][]=[
    ['capacity presented as official',a=>a['area-c-capacity-decision'].canonicalStatus='OFFICIAL_SOURCE'],
    ['prototype capacity source',a=>a['area-c-capacity-decision'].adoptedNumericCapacity={value:4,source:'PROPHET_PROTOTYPE_ROOM'}],
    ['absence means zero',a=>a['area-c-capacity-decision'].observedFacts.facts.numericCapacity=0],
    ['unlimited without authorization',a=>a['area-c-capacity-decision'].candidateDigitalRepresentations[0]={capacity:'infinity',authority:'OFFICIAL_SOURCE',canonical:true,adopted:true}],
    ['changed d10 map',a=>a['source-closure'].frozenD10Map.mapping['6']='ruins-tile-11:N'],
    ['one Hero per Pew',a=>a['rubble-target-scope-ruling'].projectDecision.targetLimit=1],
    ['first Hero only',a=>a['rubble-target-scope-ruling'].projectDecision.targetScope='FIRST_HERO_IN_AREA'],
    ['merged same-Area Pews',a=>a['rubble-target-scope-ruling'].projectDecision.sameAreaPewsMerged=true],
    ['capacity-dependent Pew rejection',a=>a['source-closure'].pewIndependence.capacityRequiredForPewPlacement=true],
    ['ruling presented as official',a=>a['rubble-target-scope-ruling'].canonical=true],
    ['unresolved promotion',a=>a['next-workstream-decision'].runtimeImplementationAllowed=true],
    ['false Gate A',a=>a['gate-a-proof'].gateAPassed=true],
    ['missing target persistence',a=>a['rubble-target-scope-ruling'].saveExtension.authoritativeFields.splice(5,1)],
  ];
  it.each(mutations)('rejects %s',(name,mutate)=>{const a=buildResidualContract();mutate(a);expect(()=>validateResidualStructure(a)).toThrow();});

  const hero=(id:string,stance:string,position:number,isAlive=true)=>({id,stance,position,isAlive} as BattleUnit);
  const heroes=[hero('support','support',4),hero('dead','aggressive',1,false),hero('front','aggressive',1),
    hero('defense','defensive',3),hero('ranged','ranged',2),hero('other','aggressive',1),hero('untargetable','aggressive',1)];
  const placements=Object.fromEntries(heroes.map(h=>[h.id,h.id==='other'?'ruins-tile-11:N':'ruins-tile-11:C']));
  const targetable=heroes.filter(h=>h.id!=='untargetable').map(h=>h.id);
  it('freezes every living targetable Hero using the existing shared order, independent of array order',()=>{
    expect(expectedPewTargets(heroes,placements,targetable,'ruins-tile-11:C')).toEqual(['front','ranged','defense','support']);
    expect(expectedPewTargets([...heroes].reverse(),placements,targetable,'ruins-tile-11:C')).toEqual(['front','ranged','defense','support']);
    expect(expectedPewTargets(heroes,placements,targetable,'ruins-tile-11:S')).toEqual([]);
  });
  it('requires independent same-Area transactions and recalculates only for the next Pew',()=>{
    const secondHeroes=heroes.map(h=>h.id==='front'?{...h,isAlive:false}:h);
    const expected=[{pewCopyId:'pew-1',areaId:'ruins-tile-11:C',targetActorIds:expectedPewTargets(heroes,placements,targetable,'ruins-tile-11:C'),attackRoll:2},
      {pewCopyId:'pew-2',areaId:'ruins-tile-11:C',targetActorIds:expectedPewTargets(secondHeroes,placements,targetable,'ruins-tile-11:C'),attackRoll:8},
      {pewCopyId:'pew-3',areaId:'ruins-tile-11:S',targetActorIds:[],attackRoll:6}];
    expect(()=>validatePewTransactions(expected,structuredClone(expected))).not.toThrow();
    for(const mutate of [
      (a:any[])=>a.splice(1,1),
      (a:any[])=>a[0].targetActorIds.splice(1),
      (a:any[])=>a[1].targetActorIds.push('front'),
      (a:any[])=>a[2].attackRoll=null,
      (a:any[])=>a.reverse(),
    ]) {const changed=structuredClone(expected);mutate(changed);expect(()=>validatePewTransactions(expected,changed)).toThrow();}
  });
  const snapshot=()=>({ruleSetVersion:'C1C35-PROPHET-DIGITAL-DEFAULT-v1',targetScopeRulingVersion:scopeVersion,
    orderedPhysicalCopyIds:['pew-1','pew-2','pew-3','pew-4'],rubbleCursor:1,
    pendingPewAttack:{pewCopyId:'pew-2',areaId:'ruins-tile-11:C',targetActorIds:['front','ranged','defense','support'],attackRoll:8,
      phase:'TARGET_WINDOWS_PENDING',resolvedTargetIds:['front']},
    resolvedActionKeys:['round1:ordinal1','round1:ordinal2'],causalEvents:[{id:'pew2:front:damage'},{id:'pew2:front:death'}],
    sharedRngCheckpoint:{state:84723,drawCount:6}});
  it('accepts byte-equivalent reload without consulting the current board or RNG',()=>{
    const saved=snapshot();expect(()=>validatePewReload(saved,JSON.parse(JSON.stringify(saved)))).not.toThrow();
  });
  const reloadMutations:[string,(a:any)=>void][]=[
    ['reroll',a=>a.pendingPewAttack.attackRoll=1],
    ['reselected target set',a=>a.pendingPewAttack.targetActorIds=['ranged']],
    ['changed target order',a=>a.pendingPewAttack.targetActorIds.reverse()],
    ['skipped unresolved target',a=>a.pendingPewAttack.resolvedTargetIds.push('ranged')],
    ['repeat committed damage',a=>a.causalEvents.push({id:'pew2:front:damage'})],
    ['repeat death event',a=>a.causalEvents.push({id:'pew2:front:death'})],
    ['changed Pew order',a=>a.orderedPhysicalCopyIds.reverse()],
    ['changed shared RNG',a=>a.sharedRngCheckpoint.drawCount++],
    ['missing stored roll',a=>delete a.pendingPewAttack.attackRoll],
    ['wrong scope version',a=>a.targetScopeRulingVersion='C1C28-DIGITAL-DEFAULT-v1'],
  ];
  it.each(reloadMutations)('rejects reload %s',(name,mutate)=>{
    const saved=snapshot();const changed=structuredClone(saved);mutate(changed);expect(()=>validatePewReload(saved,changed)).toThrow();
  });
});
