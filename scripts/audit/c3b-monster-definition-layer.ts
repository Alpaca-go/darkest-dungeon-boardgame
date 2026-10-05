/** Offline transformation of accepted C3A data. Does not acquire sources or execute combat. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { ProductionMonsterRecord } from '../../src/data/monsters/production-monster-types';
import type { ProductionMonsterDefinition, ProductionMonsterIdentity, MonsterRequirement,
  MonsterRuntimeCapabilityStatus, CompactMonsterRequirement, CompactMonsterEffect, CompactMonsterAction } from '../../src/data/monsters/production-monster-definition-types';
import { C3B_BASELINE, verifyC3AFrozen } from './c3b-verify-c3a';

const root = 'docs/data/complete-edition/';
const compactPath = 'src/data/monsters/production-monster-definitions.generated.json';
const matrixPath = 'docs/data/complete-edition/c3b-monster-capability-matrix.json';
const backlogPath = 'docs/data/complete-edition/c3b-monster-runtime-backlog.json';
const dispositionPath = 'docs/data/complete-edition/c3b-deferred-disposition.json';
const statusPath = 'docs/data/complete-edition/c3b-monster-definition-status.json';
const read = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));
const check = (ok: unknown, message: string): void => { if (!ok) throw new Error('C3B: ' + message); };
const unique = <T>(values: T[]) => [...new Set(values)];
const engine = 'src/game-engine/';
const printed = engine + 'ruins/printed-effect-runtime.ts';
type Evidence = [string[], string[], string[], boolean?];
// Each entry was inspected in the accepted engine. Ruins-dependent reuse requires C3C adapters;
// it is composition evidence, never a claim that the new definitions are playable today.
const evidence: Record<string, Evidence> = {
  targeting: [['targeting'], [engine+'ruins/monster-runtime.ts'], ['selectRuinsMonsterTargets']],
  range: [['area-distance'], [engine+'ruins/monster-runtime.ts'], ['ruinsAreaDistance']],
  attack: [['attack-roll', 'damage'], [engine+'ruins/monster-runtime.ts', engine+'damage.ts'], ['resolveRuinsAttackValues', 'applyBattleUnitDamage'], true],
  stress: [['stress'], [printed], ['applyRuinsPrintedEffects'], true],
  light: [['light'], [printed], ['applyRuinsPrintedEffects'], true],
  heal: [['heal'], [engine+'healing.ts'], ['applyBattleUnitHealing']],
  condition: [['condition', 'condition-duration'], [engine+'status-effects.ts', engine+'ruins/condition-runtime.ts'], ['applyStatusEffectEvent', 'synchronizeRuinsConditions'], true],
  guard: [['guard'], [printed, engine+'ruins/monster-runtime.ts'], ['applyRuinsPrintedEffects', 'selectRuinsMonsterTargets'], true],
  riposte: [['riposte'], [printed, engine+'ruins/condition-runtime.ts'], ['applyRuinsPrintedEffects', 'applyRuinsEnemyDamage'], true],
  shuffle: [['spatial-displacement', 'stance-shuffle'], [printed, engine+'ruins/movement-runtime.ts'], ['ruinsDisplacementCandidates', 'shuffleStance', 'moveRuinsUnit'], true],
  disease: [['disease-draw', 'disease-infection'], [printed, engine+'diseases/draw-disease.ts'], ['applyRuinsPrintedEffects', 'drawDisease'], true],
  markedDamageBonus: [['marked-damage-bonus'], [engine+'ruins/monster-runtime.ts'], ['resolveRuinsAttackValues']],
  removeCondition: [['remove-condition'], [printed], ['applyRuinsPrintedEffects'], true],
};
function requirement(id: string, primitive: string, status?: MonsterRuntimeCapabilityStatus,
  reason?: string, deferredIds: string[] = []): MonsterRequirement {
  const e = evidence[primitive];
  const resolvedStatus = status ?? (e?.[3] ? 'SUPPORTED_EXISTING_COMPOSITION' : 'SUPPORTED_EXISTING_PRIMITIVE');
  const supported = resolvedStatus.startsWith('SUPPORTED_');
  check(!supported || e, 'support evidence missing ' + primitive);
  return { requirementId: id, status: resolvedStatus, primitiveIds: e && supported ? e[0] : primitive ? [primitive] : [],
    implementationPaths: supported ? e[1] : [], implementationSymbols: supported ? e[2] : [], deferredIds,
    reason: reason ?? (e?.[3] ? 'Reuse existing behavior through C3C context/sequence adapters; no dispatcher implemented.'
      : 'Existing callable primitive; C3C binding still required.') };
}
const precedence: MonsterRuntimeCapabilityStatus[] = ['DEFERRED_SEMANTIC', 'NEEDS_NEW_RUNTIME_PRIMITIVE',
  'SUPPORTED_EXISTING_COMPOSITION', 'SUPPORTED_EXISTING_PRIMITIVE', 'NO_RUNTIME_EFFECT'];
export function aggregateCapability(rs: readonly CompactMonsterRequirement[]): MonsterRuntimeCapabilityStatus {
  if (rs.some(r => r.status === 'DEFERRED_SEMANTIC')) return 'DEFERRED_SEMANTIC';
  if (rs.some(r => r.status === 'NEEDS_NEW_RUNTIME_PRIMITIVE')) return 'NEEDS_NEW_RUNTIME_PRIMITIVE';
  const supported = rs.filter(r => r.status.startsWith('SUPPORTED_'));
  if (supported.length > 1 || supported.some(r => r.status === 'SUPPORTED_EXISTING_COMPOSITION')) return 'SUPPORTED_EXISTING_COMPOSITION';
  return supported.length ? 'SUPPORTED_EXISTING_PRIMITIVE' : 'NO_RUNTIME_EFFECT';
}
function effectDescriptor(id: string, primitive: string, parameters: Record<string, string | number | boolean | null>,
  status?: MonsterRuntimeCapabilityStatus, reason?: string, deferredIds: string[] = []): CompactMonsterEffect {
  const capability = requirement(id, primitive, status, reason, deferredIds);
  if (capability.status === 'DEFERRED_SEMANTIC') return { kind: 'DEFERRED', deferredIds, reason: capability.reason, capability };
  return { kind: capability.status === 'NEEDS_NEW_RUNTIME_PRIMITIVE' ? 'NEW_PRIMITIVE'
    : capability.status === 'SUPPORTED_EXISTING_COMPOSITION' ? 'EXISTING_COMPOSITION' : 'KNOWN_PRIMITIVE',
    primitiveId: primitive, parameters, capability };
}

/** Strict authoring-only literal grammar. Every clause is consumed or preserved as deferred.
 * No glyph inference, supply/timing ruling, or gameplay prose parser is introduced. */
function transformEffects(r: ProductionMonsterRecord, a: ProductionMonsterRecord['actions'][number], gaps: any[]): CompactMonsterEffect[] {
  const result: CompactMonsterEffect[] = [];
  const add = (p: string, params: Record<string, string | number | boolean | null>, status?: MonsterRuntimeCapabilityStatus,
    reason?: string, ids: string[] = []) => result.push(effectDescriptor(`${a.actionId}:effect-${result.length+1}`, p, params, status, reason, ids));
  for (const effect of (a.printedEffects ?? []) as any[]) {
    if (effect.kind !== 'PRINTED_LITERAL') {
      const { type, ...params } = effect;
      check(evidence[type], 'unknown C3A typed effect ' + type);
      const primitive = type === 'condition' && ['guard', 'riposte'].includes(params.condition) ? params.condition : type;
      add(primitive, params); continue;
    }
    const match = /^(Self|Target): (.*)$/.exec(effect.text);
    const target = match?.[1] === 'Self' ? 'self' : 'target';
    for (const clause of (match?.[2] ?? effect.text).split(';').map((s: string) => s.trim())) {
      let m: RegExpExecArray | null;
      if ((m = /^\[(bleed|blight)\] (\d+) (\d+)t$/.exec(clause)))
        add('condition', {target, condition: m[1], amount: +m[2], turns: +m[3]});
      else if ((m = /^\[(stun|marked|buff|debuff|guard|riposte)\] (\d+)t$/.exec(clause))) {
        const condition = m[1] === 'marked' ? 'mark' : m[1];
        add(['guard','riposte'].includes(condition) ? condition : 'condition', {target, condition, amount: 1, turns: +m[2]});
      } else if ((m = /^\[(stress|light)\] ([+-]\d+)$/.exec(clause)))
        add(m[1], {target: m[1] === 'light' ? 'party' : target, amount: +m[2]});
      else if ((m = /^\[heal\] (\d+)$/.exec(clause))) add('heal', {target, amount: +m[1]});
      else if ((m = /^(Push|Pull) (\d+)$/.exec(clause))) add('shuffle', {target, direction: m[1].toLowerCase(), distance: +m[2]});
      else if ((m = /^\+(\d+) damage vs \[marked\]$/.exec(clause))) add('markedDamageBonus', {amount: +m[1]});
      else if (clause === '[disease]') add('disease', {target, acquisition:'DRAW_FROM_DECK'});
      else if ((m = /^\[protection\] (\d+)t$/.exec(clause)))
        add('timed-protection', {target, turns: +m[1]}, 'NEEDS_NEW_RUNTIME_PRIMITIVE', 'Static printed Protection exists; timed grant/expiry is not implemented.');
      else if ((m = /^(?:(after resolving the attack: |After the action is finished: ))?(\d+) \[wound\]$/.exec(clause)))
        add('self-wound-sequencing', {target, amount:+m[2], timing:m[1] ? 'AFTER_ACTION' : 'PRINTED_EFFECT'}, 'NEEDS_NEW_RUNTIME_PRIMITIVE',
          'Damage helper exists; non-enemy self-wound sequencing and reaction contract need a reusable primitive.');
      else {
        const p = clause.includes('[summon]') ? 'summon' : clause.includes('[printed-red-card-glyph]') ? 'card-family-glyph' : 'unresolved-effect';
        const ids = gaps.filter(g => g.monsterId === r.monsterId && (p === 'summon' ? g.field === 'summonTimingAndSupply'
          : g.field === `action-${a.number}.cardGlyphSemantic`)).map(g => g.id);
        add(p, {}, 'DEFERRED_SEMANTIC', p === 'summon' ? 'C3A summon timing and available supply remain unresolved.'
          : p === 'card-family-glyph' ? 'C3A printed red card glyph has no settled executable meaning.'
          : `Authoring clause not covered by the reviewed grammar; consult frozen C3A action ${a.actionId}.`, ids);
      }
    }
  }
  return result;
}

export function buildC3BArtifacts(source = read(root+'c3a-monster-production-data.json'), gaps = read(root+'c3a-monster-source-gaps.json')) {
  const records: ProductionMonsterRecord[] = source.records;
  const definitions: ProductionMonsterDefinition[] = records.map(r => {
    const profileKeys = ['life','speed','dodge','size','occupiedSpaces','stanceSlots','deployment','tags','resistances','immunities','protection'] as const;
    const profile = Object.fromEntries(profileKeys.map(k => [k, r.profile[k]])) as unknown as ProductionMonsterDefinition['profile'];
    const actions: CompactMonsterAction[] = r.actions.map(a => {
      const targeting = a.targeting as CompactMonsterAction['targeting'];
      const effects = transformEffects(r, a, gaps.issues);
      const all = a.targets === 'ALL_HEROES';
      const rs = [requirement(`${a.actionId}:targeting`, all ? 'all-heroes-targeting' : 'targeting',
        all ? 'NEEDS_NEW_RUNTIME_PRIMITIVE' : undefined, all ? 'Existing target selector restricts targets to one area; global all-Hero selection needs a primitive.' : undefined),
        requirement(`${a.actionId}:range`, a.range ? 'range' : '', a.range ? undefined : 'NO_RUNTIME_EFFECT',
          a.range ? undefined : 'No printed range constraint; absence preserved.'),
        requirement(`${a.actionId}:attack`, (a.attack as any).kind === 'ROLL' ? 'attack' : '',
          (a.attack as any).kind === 'ROLL' ? undefined : 'NO_RUNTIME_EFFECT', (a.attack as any).kind === 'ROLL' ? undefined : 'No printed attack roll.')];
      // Monster-specific priority spelling is a binding composition, not a new targeting algorithm.
      if (targeting.priority.endsWith(' Monster')) rs[0] = requirement(`${a.actionId}:targeting`, 'targeting', 'SUPPORTED_EXISTING_COMPOSITION',
        'Normalize printed Monster priority spelling and bind targetSide=monster to existing selector.');
      const requirements = [...rs, ...effects.map(e => e.capability)];
      return { actionId:a.actionId, number:a.number, printedName:a.printedName, range:a.range as CompactMonsterAction['range'],
        targets:a.targets as CompactMonsterAction['targets'], targeting, attack:a.attack as CompactMonsterAction['attack'],
        effects, requirements, capability:aggregateCapability(requirements) };
    });
    const definitionRequirements = gaps.issues.filter((g:any) => g.monsterId === r.monsterId
      && ['drawEligibleFromLevel','miniatureSupply'].includes(g.field)).map((g:any) => requirement(`${r.monsterId}:${g.field}`, g.field,
        'DEFERRED_SEMANTIC', g.reason, [g.id]));
    return { definitionId:r.monsterId, identityId:r.monsterId.replace(/-level-[12]$/, ''), printedName:r.printedName,
      contentSet:r.contentSet, group:r.group, level:r.printedLevel, profile, actions,
      selection:r.selection.stanceBehavior, definitionRequirements, sourceContentVersion:source.contentVersion };
  });
  const identities: ProductionMonsterIdentity[] = unique(definitions.map(d=>d.identityId)).map(identityId => {
    const forms = definitions.filter(d=>d.identityId===identityId);
    return {identityId, printedName:forms[0].printedName, contentSet:forms[0].contentSet, definitionIds:forms.map(d=>d.definitionId)};
  });
  const allActions = definitions.flatMap(d=>d.actions);
  const compactRequirement = (r: CompactMonsterRequirement): CompactMonsterRequirement => ({
    requirementId:r.requirementId,status:r.status,primitiveIds:r.primitiveIds,deferredIds:r.deferredIds,
    ...(r.status==='DEFERRED_SEMANTIC'?{reason:r.reason}:{}) });
  const compactDefinitions = definitions.map(d=>({...d,
    definitionRequirements:d.definitionRequirements.map(compactRequirement),
    actions:d.actions.map(a=>({...a,requirements:a.requirements.map(compactRequirement),
      effects:a.effects.map(e=>({...e,capability:compactRequirement(e.capability)}))})) }));
  // Deduplicate implementation evidence in the matrix rather than copying engine paths
  // and the same reuse explanation into hundreds of action/effect requirements.
  const implementationEvidence: Record<string, Omit<MonsterRequirement,'requirementId'|'primitiveIds'|'deferredIds'>> = {};
  const evidenceKeys = new Map<string,string>();
  const matrixRequirement = (requirement: CompactMonsterRequirement) => {
    const r=requirement as MonsterRequirement;
    const entry={status:r.status,implementationPaths:r.implementationPaths,implementationSymbols:r.implementationSymbols,reason:r.reason};
    const key=JSON.stringify(entry);
    let evidenceId=evidenceKeys.get(key);
    if(!evidenceId){evidenceId=`evidence-${evidenceKeys.size+1}`;evidenceKeys.set(key,evidenceId);implementationEvidence[evidenceId]=entry;}
    return {requirementId:r.requirementId,status:r.status,primitiveIds:r.primitiveIds,deferredIds:r.deferredIds,evidenceId};
  };
  const matrixDefinitions=definitions.map(d=>({definitionId:d.definitionId,identityId:d.identityId,level:d.level,
    definitionRequirements:d.definitionRequirements.map(matrixRequirement), actions:d.actions.map(a=>({actionId:a.actionId,status:a.capability,
      primitiveIds:unique(a.requirements.flatMap(r=>[...r.primitiveIds])),deferredIds:unique(a.requirements.flatMap(r=>[...r.deferredIds])),
      requirements:a.requirements.map(matrixRequirement)}))}));
  const counts = Object.fromEntries(precedence.map(status=>[status, allActions.filter(a=>a.capability===status).length]));
  const missing = definitions.flatMap(d=>d.actions.flatMap(a=>a.requirements.filter(r=>r.status==='NEEDS_NEW_RUNTIME_PRIMITIVE')
    .flatMap(r=>r.primitiveIds.map(primitiveId=>({primitiveId,definitionId:d.definitionId,actionId:a.actionId,requirementId:r.requirementId,reason:r.reason})))));
  const primitives = unique(missing.map(m=>m.primitiveId)).map(primitiveId=>({primitiveId,
    affectedActions:unique(missing.filter(m=>m.primitiveId===primitiveId).map(m=>m.actionId)).length,
    requirements:missing.filter(m=>m.primitiveId===primitiveId)})).sort((a,b)=>b.affectedActions-a.affectedActions||a.primitiveId.localeCompare(b.primitiveId));
  const disposition = gaps.issues.map((g:any)=>({ ...g, disposition: g.id === 'C3A-0078' ? 'RESOLVED_INFRASTRUCTURE'
    : g.category === 'LEGACY_DATA_MISMATCH' ? 'LEGACY_MISMATCH_PRESERVED'
    : g.category === 'PHYSICAL_COPY_UNRESOLVED' ? 'SOURCE_UNRESOLVED_PRESERVED'
    : g.category === 'DEFERRED_MANUAL_VALIDATION' ? 'CARRIED_TO_MANUAL_VALIDATION' : 'CARRIED_TO_C3C',
    c3bStatus:g.id==='C3A-0078'?'RESOLVED':'PRESERVED',
    resolution:g.id==='C3A-0078'?'C3-INFRA-01: main-only full release triggers and non-main development Fast Gate.':null }));
  const common = {phase:'11A.6-C3B', definitionVersion:'C3B-MONSTER-DEFINITIONS-v1', sourceContentVersion:source.contentVersion};
  return {
    [compactPath]: { ...common, runtimeImplemented:false, identities, definitions:compactDefinitions },
    [matrixPath]: { ...common, definitionForms:definitions.length, identityGroups:identities.length,
      actions:allActions.length, counts, aggregation:'Deferred > new primitive > composition > primitive > no effect; multiple supported requirements compose. Definition eligibility does not change action capability.',
      runtimeImplemented:false, implementationEvidence, definitions:matrixDefinitions },
    [backlogPath]: { ...common, next:'11A.6-C3C', uniqueNewPrimitives:primitives.length, primitives,
      deferredExcludedFromImplementation:unique(definitions.flatMap(d=>d.actions.flatMap(a=>a.requirements.filter(r=>r.status==='DEFERRED_SEMANTIC').flatMap(r=>[...r.deferredIds])))),
      integrationBoundary:'Existing Ruins/Boss behavior supplies reuse evidence only. C3C must bind generic contexts without modifying frozen runtimes or assuming definition eligibility.' },
    [dispositionPath]: { ...common, issueCount:disposition.length, issues:disposition },
    [statusPath]: { ...common,status:'COMPLETE',baseline:C3B_BASELINE,identityCount:identities.length,
      definitionCount:definitions.length,actionCount:allActions.length,capabilityClassifiedActions:allActions.length,unclassifiedActions:0,
      existingPrimitiveActions:counts.SUPPORTED_EXISTING_PRIMITIVE,existingCompositionActions:counts.SUPPORTED_EXISTING_COMPOSITION,
      needsNewPrimitiveActions:counts.NEEDS_NEW_RUNTIME_PRIMITIVE,deferredSemanticActions:counts.DEFERRED_SEMANTIC,
      noRuntimeEffectActions:counts.NO_RUNTIME_EFFECT,uniqueNewRuntimePrimitives:primitives.length,runtimeImplemented:false,next:'11A.6-C3C' },
  };
}

export function auditC3B(artifacts = buildC3BArtifacts()) {
  const source = read(root+'c3a-monster-production-data.json');
  const { definitions, identities } = artifacts[compactPath];
  check(definitions.length===77 && identities.length===71, '77 definitions / 71 identities');
  check(new Set(definitions.map(d=>d.definitionId)).size===77, 'unique definitions');
  check(new Set(identities.map(i=>i.identityId)).size===71, 'unique identities');
  const multi = identities.filter(i=>i.definitionIds.length>1);
  check(JSON.stringify(multi.map(i=>i.identityId).sort())===JSON.stringify(['farmhand','foreman','scarecrow','plow-horse','crystalline-aberration','sleepers-herald'].sort()), 'six multi-form identities');
  const seenActions = new Set<string>();
  for (const d of definitions) {
    const original = source.records.find((r:any)=>r.monsterId===d.definitionId);
    check(original && original.printedLevel===d.level && original.printedName===d.printedName, 'source definition binding');
    check(identities.filter(i=>i.definitionIds.includes(d.definitionId)).length===1, 'one identity per definition');
    const identity = identities.find(i=>i.identityId===d.identityId);
    check(identity?.definitionIds.includes(d.definitionId), 'resolvable identity');
    check(new Set(identity!.definitionIds.map(id=>definitions.find(d=>d.definitionId===id)?.level)).size===identity!.definitionIds.length, 'unambiguous identity level');
    check(JSON.stringify(d.selection)===JSON.stringify(original.selection.stanceBehavior), 'selection preservation');
    for (const [field,value] of Object.entries(d.profile)) check(JSON.stringify(value)===JSON.stringify(original.profile[field]), 'official profile value '+field);
    check(JSON.stringify(d.actions.map(a=>a.actionId))===JSON.stringify(original.actions.map((a:any)=>a.actionId)), 'action preservation');
    for (const b of Object.values(d.selection)) if (b.kind==='SKILL_TABLE') for (const row of b.rows) check(d.actions.some(a=>a.actionId===row.actionId),'stance reference');
    for (const a of d.actions) {
      check(!seenActions.has(a.actionId), 'unique action owner'); seenActions.add(a.actionId);
      const originalAction=original.actions.find((o:any)=>o.actionId===a.actionId);
      for (const field of ['range','targets','targeting','attack'] as const) check(JSON.stringify(a[field])===JSON.stringify(originalAction[field]), 'action field preservation '+field);
      check(a.capability===aggregateCapability(a.requirements), 'action classification');
      check(a.requirements.length>=3 && a.effects.every(e=>a.requirements.some(r=>JSON.stringify(r)===JSON.stringify(e.capability))), 'effect requirement coverage');
    }
    const auditDefinition=artifacts[matrixPath].definitions.find(m=>m.definitionId===d.definitionId)!;
    check(auditDefinition && auditDefinition.identityId===d.identityId && auditDefinition.level===d.level,'matrix definition binding');
    check(JSON.stringify(auditDefinition.actions.map(a=>a.actionId))===JSON.stringify(d.actions.map(a=>a.actionId)),'matrix action binding');
    for(const action of auditDefinition.actions)check(action.status===d.actions.find(a=>a.actionId===action.actionId)?.capability,'matrix action classification');
    const auditRequirements=[...auditDefinition.definitionRequirements,...auditDefinition.actions.flatMap(a=>a.requirements)]
      .map(r=>({...artifacts[matrixPath].implementationEvidence[r.evidenceId],...r}));
    for (const compactRequirement of [...d.definitionRequirements,...d.actions.flatMap(a=>a.requirements)]) {
      const r=auditRequirements.find(r=>r.requirementId===compactRequirement.requirementId)!;
      check(r && r.status===compactRequirement.status && JSON.stringify(r.primitiveIds)===JSON.stringify(compactRequirement.primitiveIds)
        && JSON.stringify(r.deferredIds)===JSON.stringify(compactRequirement.deferredIds),'runtime/audit requirement binding');
      check(precedence.includes(r.status) && r.reason.length>0, 'classified requirement');
      if (r.status.startsWith('SUPPORTED_')) {
        check(r.implementationPaths.length>0 && r.implementationSymbols.length>0, 'supported evidence');
        for (const path of r.implementationPaths) check(existsSync(path),'implementation path exists');
        for (const symbol of r.implementationSymbols) check(r.implementationPaths.some(path=>readFileSync(path,'utf8').includes('export function '+symbol+'(')), 'callable implementation symbol '+symbol);
      }
      if (r.status==='DEFERRED_SEMANTIC') check(compactRequirement.reason===r.reason && r.reason && r.deferredIds.every(id=>read(root+'c3a-monster-source-gaps.json').issues.some((g:any)=>g.id===id)), 'deferred reason/reference');
    }
  }
  check(seenActions.size===175, '175 actions');
  const issues = artifacts[dispositionPath].issues;
  check(issues.length===79 && new Set(issues.map((i:any)=>i.id)).size===79, '79 deferred issues');
  for (const g of read(root+'c3a-monster-source-gaps.json').issues) {
    const carried=issues.find((i:any)=>i.id===g.id);
    check(carried && Object.keys(g).every(k=>JSON.stringify(carried[k])===JSON.stringify(g[k])), 'original issue preserved');
  }
  check(issues.filter((i:any)=>i.disposition==='RESOLVED_INFRASTRUCTURE').length===1,'infrastructure only closure');
  check(issues.filter((i:any)=>i.disposition==='LEGACY_MISMATCH_PRESERVED').length===15,'15 legacy mismatches');
  const anchors=read(root+'c1c32r2a-ruins-monster-executable-definitions.json').definitions;
  check(anchors.length===24 && source.records.filter((r:any)=>anchors.some((a:any)=>a.canonicalId===r.monsterId)).flatMap((r:any)=>r.profile.physicalCopyIds).length===62,'Ruins 24/62');
  const matrix=artifacts[matrixPath];
  check(matrix.actions===175 && Object.values(matrix.counts).reduce((n,v)=>n+v,0)===175,'matrix counts');
  const actions=definitions.flatMap(d=>d.actions);
  for(const status of precedence)check(matrix.counts[status]===actions.filter(a=>a.capability===status).length,'derived capability count '+status);
  const state=artifacts[statusPath];
  check(state.identityCount===71 && state.definitionCount===77 && state.actionCount===175 && state.capabilityClassifiedActions===175
    && state.unclassifiedActions===0 && state.runtimeImplemented===false,'status inventory/runtime boundary');
  for(const [field,status] of Object.entries({existingPrimitiveActions:'SUPPORTED_EXISTING_PRIMITIVE',existingCompositionActions:'SUPPORTED_EXISTING_COMPOSITION',
    needsNewPrimitiveActions:'NEEDS_NEW_RUNTIME_PRIMITIVE',deferredSemanticActions:'DEFERRED_SEMANTIC',noRuntimeEffectActions:'NO_RUNTIME_EFFECT'}))
    check((state as any)[field]===matrix.counts[status],'status capability counts');
  const backlog=artifacts[backlogPath];
  const missing=actions.flatMap(a=>a.requirements.filter(r=>r.status==='NEEDS_NEW_RUNTIME_PRIMITIVE').flatMap(r=>r.primitiveIds.map(p=>[p,a.actionId])));
  check(backlog.uniqueNewPrimitives===new Set(missing.map(m=>m[0])).size && state.uniqueNewRuntimePrimitives===backlog.uniqueNewPrimitives,'derived primitive count');
  for(const primitive of backlog.primitives) {
    const ids=unique(missing.filter(m=>m[0]===primitive.primitiveId).map(m=>m[1])).sort();
    check(JSON.stringify(unique(primitive.requirements.map(r=>r.actionId)).sort())===JSON.stringify(ids)
      && primitive.affectedActions===ids.length,'backlog action coverage');
  }
}

export function verifyC3BBoundaries() {
  verifyC3AFrozen();
  const changes=execFileSync('git',['diff',C3B_BASELINE,'--name-only'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  const untracked=execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  const successor = existsSync(root+'c3e-monster-production-freeze.json');
  const successorPaths=new Set(['src/game-engine/battle.ts','src/game-engine/commands/ordinary-monsters.ts','src/game-engine/commands/battle.ts','src/game-engine/trinkets/battle-trinket-bridge.ts','src/game-engine/ruins/movement-runtime.ts','src/game-engine/heroes/production-runtime.ts','src/game-engine/dungeon.ts','src/game-engine/save.ts','src/types/index.ts','src/pages/BattlePage.tsx','src/pages/QuestSelectPage.tsx','src/store/useGameStore.ts','src/test-support/historical-baseline-setup.ts','src/components/trinkets/TrinketUseOverlay.tsx','playwright.c3e.config.ts']);
  check([...changes,...untracked].every(p=>successor && (successorPaths.has(p)||/^src\/audit\/c3[de]-|^scripts\/(audit|e2e)\/c3[de]-/.test(p)||p.startsWith(root+'c3d-')||p.startsWith(root+'c3e-')||p.startsWith('e2e/c3e-'))||p==='AGENTS.md'||p==='package.json'||['.github/workflows/release-gate.yml','.github/workflows/development-fast-gate.yml'].includes(p)||p.startsWith('src/data/monsters/production-monster-definition')
    ||p.startsWith('src/audit/c3b-')||p.startsWith('scripts/audit/c3b-')||p.startsWith(root+'c3b-')
    // C3C successor runtime files do not alter the accepted C3B data/evidence checks.
    ||p.startsWith('src/game-engine/monsters/')||p==='src/game-engine/monster-target-priority.ts'
    ||p==='src/game-engine/ruins/monster-runtime.ts'
    ||p.startsWith('src/audit/c3c-')||p.startsWith('scripts/audit/c3c-')||p.startsWith(root+'c3c-')), 'frozen/runtime scope unchanged');
  // Traverse every local import reachable from the runtime entry; reject even indirect audit imports.
  const visited=new Set<string>();
  function visit(path:string) {
    if(visited.has(path))return; visited.add(path);
    check(!path.startsWith('docs/')&&!path.startsWith('scripts/')&&!path.endsWith('/production-monster-registry.ts'),'runtime import fence '+path);
    const text=readFileSync(path,'utf8');
    check(!/node:|\brequire\s*\(|\bimport\s*\(|\bfrom\s*['"](?:fs|child_process|path)['"]/.test(text),'runtime Node/dynamic import fence');
    for(const match of text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      check(match[1].startsWith('.'),'runtime external import');
      const parts=path.split('/');parts.pop();
      for(const part of match[1].split('/')) if(part==='..')parts.pop();else if(part!=='.')parts.push(part);
      const resolved=parts.join('/'); visit(resolved.endsWith('.json')?resolved:resolved+'.ts');
    }
  }
  visit('src/data/monsters/production-monster-definition-registry.ts');
  const payload=readFileSync(compactPath,'utf8');
  check(!/"(?:printedText|sourceReferences|sourceBindingIds|sha256|physicalCopyIds|visualReview|relativePath)"/.test(payload),'compact audit metadata fence');
  const release=readFileSync('.github/workflows/release-gate.yml','utf8');
  const fast=readFileSync('.github/workflows/development-fast-gate.yml','utf8');
  check(/push:\s+branches: \[main\]/.test(release)&&/pull_request:\s+branches: \[main\]/.test(release),'main-only release gate');
  const oldRelease=execFileSync('git',['show',C3B_BASELINE+':.github/workflows/release-gate.yml'],{encoding:'utf8'}).replace(/\r\n/g,'\n');
  const compatibleRelease=release.replace(/\r\n/g,'\n').split('\n').filter(line=>!['      - run: npm run test:complete-edition-c3e','      - run: npm run test:e2e:monster-production','      - run: npm run verify:complete-edition-c3e'].includes(line)).join('\n');
  check(compatibleRelease.slice(compatibleRelease.indexOf('permissions:'))===oldRelease.slice(oldRelease.indexOf('permissions:')),'release logic preserved');
  check(/branches-ignore: \[main\]/.test(fast)&&!/(playwright|historical|validate:|npm test)/i.test(fast),'Fast Gate scope');
  const phaseTests=successor ? ['test:complete-edition-c3d','verify:complete-edition-c3d','test:complete-edition-c3e','verify:complete-edition-c3e'] : fast.includes('test:complete-edition-c3c')
    ? ['test:complete-edition-c3c','verify:complete-edition-c3c'] : ['verify:complete-edition-c3a','test:complete-edition-c3b'];
  for(const script of ['typecheck',...phaseTests,...(successor?[]:['verify:complete-edition-c3b']),'build'])check(fast.includes('npm run '+script),'Fast Gate '+script);
}
if(process.argv.includes('--write')||process.argv.includes('--verify')) {
  const artifacts=buildC3BArtifacts(); auditC3B(artifacts);
  for(const [path,value] of Object.entries(artifacts)) {
    if(process.argv.includes('--write'))writeFileSync(path,JSON.stringify(value,null,path===compactPath?undefined:2)+'\n');
    else check(JSON.stringify(read(path))===JSON.stringify(value),'artifact drift '+path);
  }
  verifyC3BBoundaries();
  console.log(JSON.stringify(artifacts[statusPath],null,2));
}
