import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { auditC3A, buildC3AArtifacts } from '../../scripts/audit/c3a-monster-census';
import { PRODUCTION_MONSTER_CONTENT } from '../data/monsters/production-monster-registry';
import { validateRuinsSourceContracts } from '../game-engine/ruins/source-registry';

const root='docs/data/complete-edition/';
const read=(name:string)=>JSON.parse(readFileSync(root+name,'utf8'));
const artifacts=buildC3AArtifacts();
const data=artifacts['c3a-monster-production-data.json'];
const census=artifacts['c3a-monster-source-census.json'];
const gaps=artifacts['c3a-monster-source-gaps.json'];
const receipt=read('c3a-monster-print-extracts.json');
const audit=(changedData=data,changedCensus=census,changedGaps=gaps,changedReceipt=receipt)=>auditC3A(changedData,changedCensus,changedGaps,changedReceipt);

describe('C3A source-rich ordinary Monster content boundary',()=>{
  it('reproduces checked-in artifacts deterministically from locked receipts and visual transcription',()=>{
    for(const [name,value] of Object.entries(artifacts))expect(read(name)).toEqual(value);
    expect(()=>audit()).not.toThrow();
    expect(PRODUCTION_MONSTER_CONTENT).toEqual(data.records);
  });
  it('preserves the accepted Ruins 24/62 source registry',()=>{
    expect(()=>validateRuinsSourceContracts()).not.toThrow();
    const ids=read('c1c32r2a-ruins-monster-executable-definitions.json').definitions.map((d:any)=>d.canonicalId);
    const anchors=data.records.filter((r:any)=>ids.includes(r.monsterId));
    expect(anchors).toHaveLength(24);
    expect(anchors.flatMap((r:any)=>r.profile.physicalCopyIds)).toHaveLength(62);
    expect(data.records.find((r:any)=>r.monsterId==='bone-soldier').profile.life).toBe(7);
  });
  it('keeps level forms, printed absences, paired panels and deferred semantics explicit',()=>{
    const forms=data.records.filter((r:any)=>r.printedName==='Crystalline Aberration');
    expect(forms.map((r:any)=>r.printedLevel)).toEqual([1,2]);
    expect(forms.every((r:any)=>r.profile.speed===null&&r.profile.printedAbsences.includes('speed'))).toBe(true);
    expect(forms.every((r:any)=>gaps.issues.some((g:any)=>g.monsterId===r.monsterId&&g.field==='miniatureSupply'))).toBe(true);
    expect(data.records.find((r:any)=>r.monsterId==='uca-major').profile.copyCount).toBe(2);
    expect(census.excludedComponents.some((p:any)=>p.printedName==='Master Webber')).toBe(true);
    expect(gaps.issues.filter((g:any)=>g.category==='LEGACY_DATA_MISMATCH').length).toBeGreaterThan(0);
  });
  it.each([
    ['duplicate canonical ID',(d:any)=>d.records[1].monsterId=d.records[0].monsterId],
    ['duplicate physical copy',(d:any)=>d.records[1].profile.physicalCopyIds[0]=d.records[0].profile.physicalCopyIds[0]],
    ['copy count mismatch',(d:any)=>d.records[0].profile.copyCount++],
    ['dangling action owner',(d:any)=>d.records[0].actions[0].monsterId='missing'],
    ['dangling source binding',(d:any)=>d.records[0].sourceBindingIds.push('missing')],
    ['unlocked source hash',(d:any)=>d.sourceBindings[0].sha256='0'.repeat(64)],
    ['prototype promoted',(d:any)=>d.prototypeSource=true],
    ['dangling stance action',(d:any)=>d.records[0].selection.stanceBehavior.ranged.rows[0].actionId='missing'],
    ['cyclic inheritance',(d:any)=>d.records[0].selection.stanceBehavior.ranged={kind:'INHERITS',stance:'aggressive'}],
    ['missing d10 interval',(d:any)=>d.records[0].selection.stanceBehavior.ranged.rows[0].max=9],
    ['unregistered unresolved source',(d:any)=>d.records[0].sourceStatus='SOURCE_UNRESOLVED'],
    ['unregistered unresolved field',(d:any)=>d.records[0].profile.unresolvedFields.push('unknown')],
  ])('rejects %s',(_name,mutate)=>{
    const changed=structuredClone(data);mutate(changed);expect(()=>audit(changed)).toThrow('C3A:');
  });
  it('rejects unresolved issues without a reason',()=>{
    const changed=structuredClone(gaps);changed.issues[0].reason='';expect(()=>audit(data,census,changed)).toThrow('deferred reason');
  });
  it('rejects accidentally importing a Boss-only face',()=>{
    const changed=structuredClone(receipt);
    changed.files.flatMap((f:any)=>f.observations).find((p:any)=>p.classification==='BOSS_OR_SPECIAL_COMPONENT_EXCLUDED').monsterId=data.records[0].monsterId;
    expect(()=>audit(data,census,gaps,changed)).toThrow('Boss imported');
  });
  it('rejects incomplete source-page accounting',()=>{
    const changed=structuredClone(receipt);changed.files[0].observations.pop();
    expect(()=>audit(data,census,gaps,changed)).toThrow('source page census incomplete');
  });
});
