import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { aggregateCapability, auditC3B, buildC3BArtifacts, verifyC3BBoundaries } from '../../scripts/audit/c3b-monster-definition-layer';
import { verifyC3AFrozen } from '../../scripts/audit/c3b-verify-c3a';
import { listProductionMonsterDefinitions, listProductionMonsterIdentities, getProductionMonsterDefinition,
  getProductionMonsterIdentity, getProductionMonsterForms, resolveProductionMonsterForm,
  getProductionMonsterAction } from '../data/monsters/production-monster-definition-registry';

const root='docs/data/complete-edition/';
const compact='src/data/monsters/production-monster-definitions.generated.json';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const artifacts=buildC3BArtifacts();

describe('C3B compact Monster definitions and classification boundary',()=>{
  it('reproduces compact definitions and all four audit artifacts from frozen C3A inputs',()=>{
    auditC3B(artifacts);
    for(const [path,value] of Object.entries(artifacts))expect(read(path)).toEqual(value);
    expect(listProductionMonsterDefinitions()).toEqual(artifacts[compact].definitions);
    expect(listProductionMonsterIdentities()).toEqual(artifacts[compact].identities);
  });
  it('keeps 71 identities, 77 forms and 175 actions with exact, deterministic resolution',()=>{
    expect(listProductionMonsterIdentities()).toHaveLength(71);
    expect(listProductionMonsterDefinitions()).toHaveLength(77);
    expect(listProductionMonsterDefinitions().flatMap(d=>d.actions)).toHaveLength(175);
    for(const i of listProductionMonsterIdentities()) {
      expect(getProductionMonsterIdentity(i.identityId)).toBe(i);
      for(const d of getProductionMonsterForms(i.identityId)) {
        expect(getProductionMonsterDefinition(d.definitionId)).toBe(d);
        expect(resolveProductionMonsterForm(i.identityId,d.level)).toBe(d);
        for(const a of d.actions)expect(getProductionMonsterAction(d.definitionId,a.actionId)).toBe(a);
      }
    }
    expect(getProductionMonsterForms('farmhand').map(d=>d.level)).toEqual([1,2]);
    expect(resolveProductionMonsterForm('farmhand',3)).toBeUndefined();
    expect(resolveProductionMonsterForm('farmhand',null)).toBeUndefined();
    expect(resolveProductionMonsterForm('absent',1)).toBeUndefined();
    expect(getProductionMonsterAction('bone-soldier','bone-arbalist:action-1')).toBeUndefined();
    expect(getProductionMonsterForms('absent')).toEqual([]);
  });
  it('freezes data so consumers cannot mutate registry resolution',()=>{
    expect(()=>{ (listProductionMonsterDefinitions()[0].profile as any).life=999; }).toThrow();
    expect(()=>{ (getProductionMonsterIdentity('farmhand')!.definitionIds as any).push('missing'); }).toThrow();
  });
  it('preserves every action field and every printed effect clause without runtime prose',()=>{
    const source=read(root+'c3a-monster-production-data.json');
    for(const r of source.records) {
      const d=getProductionMonsterDefinition(r.monsterId)!;
      for(const a of r.actions) {
        const result=getProductionMonsterAction(r.monsterId,a.actionId)!;
        for(const field of ['range','targets','targeting','attack','number','printedName'])expect((result as any)[field]).toEqual(a[field]);
        const clauses=a.printedEffects.flatMap((e:any)=>e.kind==='PRINTED_LITERAL'?e.text.split(';'):[e]);
        expect(result.effects).toHaveLength(clauses.length);
        expect(result.capability).toBe(aggregateCapability(result.requirements));
      }
      expect(d.selection).toEqual(r.selection.stanceBehavior);
    }
    expect(readFileSync(compact,'utf8')).not.toMatch(/PRINTED_LITERAL|printedText|sourceReferences|sha256|physicalCopyIds/);
  });
  it('preserves unresolved eligibility, card glyphs, summon timing and miniature supply',()=>{
    const gaps=read(root+'c3a-monster-source-gaps.json').issues;
    for(const g of gaps.filter((g:any)=>g.category==='UNRESOLVED_EFFECT_SEMANTIC'||g.category==='PHYSICAL_COPY_UNRESOLVED')) {
      const d=getProductionMonsterDefinition(g.monsterId)!;
      const requirements=[...d.definitionRequirements,...d.actions.flatMap(a=>a.requirements)];
      expect(requirements.some(r=>r.status==='DEFERRED_SEMANTIC'&&r.deferredIds.includes(g.id))).toBe(true);
    }
    const deferred=read(root+'c3b-deferred-disposition.json').issues;
    expect(deferred).toHaveLength(79);
    expect(deferred.filter((i:any)=>i.disposition==='RESOLVED_INFRASTRUCTURE').map((i:any)=>i.id)).toEqual(['C3A-0078']);
    expect(deferred.filter((i:any)=>i.disposition==='LEGACY_MISMATCH_PRESERVED')).toHaveLength(15);
  });
  it('groups only understood missing primitives, including gaps on otherwise deferred actions',()=>{
    const backlog=read(root+'c3b-monster-runtime-backlog.json');
    const missing=listProductionMonsterDefinitions().flatMap(d=>d.actions.flatMap(a=>a.requirements
      .filter(r=>r.status==='NEEDS_NEW_RUNTIME_PRIMITIVE').flatMap(r=>r.primitiveIds.map(p=>[p,a.actionId]))));
    expect(backlog.uniqueNewPrimitives).toBe(new Set(missing.map(m=>m[0])).size);
    for(const p of backlog.primitives)expect(p.affectedActions).toBe(new Set(missing.filter(m=>m[0]===p.primitiveId).map(m=>m[1])).size);
    expect(backlog.primitives.map((p:any)=>p.primitiveId)).not.toContain('summon');
    expect(backlog.primitives.map((p:any)=>p.primitiveId)).not.toContain('card-family-glyph');
  });
  it('fails closed on an unrecognized literal instead of guessing instructions',()=>{
    const source=read(root+'c3a-monster-production-data.json');
    source.records[0].actions[0].printedEffects=[{kind:'PRINTED_LITERAL',text:'Target: [unrecognized-glyph]',canonical:true,executable:false}];
    const result=buildC3BArtifacts(source)[compact].definitions[0].actions[0];
    expect(result.capability).toBe('DEFERRED_SEMANTIC');
    expect(result.effects[0].kind).toBe('DEFERRED');
    expect(result.effects[0].capability.reason).toContain('frozen C3A action');
  });
  it.each([
    ['duplicate form',(a:any)=>a[compact].definitions[1].definitionId=a[compact].definitions[0].definitionId],
    ['missing identity',(a:any)=>a[compact].definitions[0].identityId='missing'],
    ['dropped action',(a:any)=>a[compact].definitions[0].actions.pop()],
    ['guessed official life',(a:any)=>a[compact].definitions[0].profile.life++],
    ['unsupported action promoted',(a:any)=>a[compact].definitions.find((d:any)=>d.actions.some((x:any)=>x.capability==='DEFERRED_SEMANTIC')).actions.find((x:any)=>x.capability==='DEFERRED_SEMANTIC').capability='SUPPORTED_EXISTING_PRIMITIVE'],
    ['missing support evidence',(a:any)=>a[root+'c3b-monster-capability-matrix.json'].implementationEvidence['evidence-1'].implementationPaths=[]],
    ['invalid implementation symbol',(a:any)=>a[root+'c3b-monster-capability-matrix.json'].implementationEvidence['evidence-1'].implementationSymbols=['notAnImplementation']],
    ['lost issue',(a:any)=>a[root+'c3b-deferred-disposition.json'].issues.pop()],
    ['fabricated capability counts',(a:any)=>{a[root+'c3b-monster-capability-matrix.json'].counts.SUPPORTED_EXISTING_COMPOSITION--;a[root+'c3b-monster-capability-matrix.json'].counts.NO_RUNTIME_EFFECT++;}],
    ['incomplete primitive backlog',(a:any)=>a[root+'c3b-monster-runtime-backlog.json'].primitives[0].requirements.pop()],
    ['runtime silently enabled',(a:any)=>a[root+'c3b-monster-definition-status.json'].runtimeImplemented=true],
  ])('rejects %s',(_name,mutate)=>{
    const changed=structuredClone(artifacts);mutate(changed);expect(()=>auditC3B(changed)).toThrow('C3B:');
  });
  it('checks frozen input integrity, runtime import fence and minimal CI split',()=>{
    expect(verifyC3AFrozen()).toBeGreaterThan(6);
    expect(()=>verifyC3BBoundaries()).not.toThrow();
  });
});
