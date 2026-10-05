import {describe,it,expect} from 'vitest';
import {buildC1C38Artifacts,validateC1C38Artifacts} from '../../scripts/audit/c1c38-source-closure';

describe('C1C38 source-only closure guard',()=>{
  const baseline=buildC1C38Artifacts();
  it('accepts reviewed source research with a blocked Gate A and exactly six selected sides',()=>{
    expect(()=>validateC1C38Artifacts(baseline)).not.toThrow();
    expect(baseline['thing-source-closure'].selectedSourceBoundSides).toBe(6);
    expect(baseline['next-workstream-decision'].outcome).toBe('THING_SOURCE_CLOSURE_BLOCKED');
  });
  const attacks:Array<[string,(a:typeof baseline)=>void]>=[
    ['videogame life',a=>{a['thing-executable-field-matrix'].fields.find((f:any)=>f.id==='actor.life').normalizedValue=200;}],
    ['missing accuracy as zero',a=>{a['thing-battle-semantic-contract'].fields.find((f:any)=>f.id==='RETURN_TO_THE_STARS.accuracyPrinted').normalizedValue=0;}],
    ['synthesized level',a=>{a['thing-encounter-model'].synthesizedLevels=['II'];}],
    ['assumed Face the Threat',a=>{a['thing-encounter-model'].fields.find((f:any)=>f.id==='encounter.FaceTheThreatApplicable').normalizedValue=true;}],
    ['synthetic Room',a=>{a['thing-encounter-model'].fields.find((f:any)=>f.id==='encounter.RoomModel').normalizedValue='prototype-room';}],
    ['transport copy census',a=>{a['crystalline-aberration-dependency'].physicalCopySupply=3;}],
    ['prototype as official',a=>{a['thing-executable-field-matrix'].fields.find((f:any)=>f.id==='summon.eligiblePool').status='OFFICIAL_SOURCE';}],
    ['source blocker disguised as ruling',a=>{a['thing-executable-field-matrix'].fields.find((f:any)=>f.id==='encounter.reward').status='PROJECT_RULING';}],
    ['silent ruling approval',a=>{a['thing-project-ruling-candidates'].candidates[0].approved=true;}],
    ['runtime promotion',a=>{a['next-workstream-decision'].runtimeImplementationAuthorized=true;}],
    ['omitted dependency artifact',a=>{delete a['crystalline-aberration-dependency'];}],
  ];
  it.each(attacks)('rejects %s',(_name,mutate)=>{
    const changed=structuredClone(baseline);mutate(changed);
    expect(()=>validateC1C38Artifacts(changed)).toThrow(/C1C38:/);
  });
});
