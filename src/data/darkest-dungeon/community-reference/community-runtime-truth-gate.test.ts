import { describe, expect, it } from 'vitest';
import { executeMammothCystAction } from '../../../game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action';
import { summonWhiteCellStalk } from '../../../game-engine/bosses/mammoth-cyst/summon-white-cell-stalk';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';
import {
  COMMUNITY_RUNTIME_FIELD_COVERAGE,
  COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT,
  COMMUNITY_RUNTIME_PROJECTION_PROOFS,
  validateCommunityRuntimeProjectionProofs,
} from './runtime-field-coverage';

const cloneEnvironment = () => structuredClone(COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT);
const mismatch = (environment = COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT) => validateCommunityRuntimeProjectionProofs(COMMUNITY_RUNTIME_PROJECTION_PROOFS, environment);
const jsonRoundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('Community Runtime Acceptance Truth Gate adversarial mutations', () => {
  it('T01 runtime Guardian HP mutation fails', () => { const env = cloneEnvironment(); env.templarImpaler.stats!.maxHp += 1; expect(mismatch(env)).toContain('runtime semantic mismatch tierB-templars-impaler.maxHp'); });
  it('T02 runtime d10 mapping mutation fails', () => { const env = cloneEnvironment(); env.templarImpaler.skills[0].d10Rolls = [10]; expect(mismatch(env).some(error => error.includes('tierB-templars-impaler.d10SkillTable'))).toBe(true); });
  it('T03 removing runtime Pit Bleed fails', () => { const env = cloneEnvironment(); env.templarsRoom.spikedPits[0].entryEffects = env.templarsRoom.spikedPits[0].entryEffects.filter(effect => effect.condition !== 'bleed'); expect(mismatch(env)).toContain('runtime semantic mismatch tierB-templars-room.pitEntryEffects.bleed'); });
  it('T04 runtime Mammoth stance map mutation fails', () => { const env = cloneEnvironment(); env.mammothRoom.stanceAreaMap.aggressive = 'r11-C'; expect(mismatch(env)).toContain('runtime semantic mismatch tierB-mammoth-cyst-room.spawnAreaPolicy.stanceToArea'); });
  it('T05 Final vacant-stance fill is consumed by the Community d10 table', () => { const proof = COMMUNITY_RUNTIME_PROJECTION_PROOFS.find(item => item.requirementId === 'tierB-ancestor-first-form' && item.sourcePath === 'vacantStanceFillSource')!; expect(proof.classification).toBe('consumed'); expect(proof.blockerCode).toBeNull(); });
  it('T06 removing a Monster physical instance fails', () => { const env = cloneEnvironment(); env.profile.monsterComposition[0].physicalInstances.pop(); expect(mismatch(env)).toContain('runtime semantic mismatch tierB-darkest-dungeon-monster-deck.deckComposition'); });
  it('T07 editing ledger runtimeValueHash cannot manufacture PASS', () => { const ledger = structuredClone(COMMUNITY_RUNTIME_FIELD_COVERAGE); ledger.find(entry => entry.classification === 'consumed')!.runtimeValueHash = 'forged'; const env = cloneEnvironment(); env.templarImpaler.stats!.maxHp += 1; expect(validateCommunityRuntimeProjectionProofs(COMMUNITY_RUNTIME_PROJECTION_PROOFS, env)).not.toEqual([]); });
  it('T08 consumed entry without runtimeSelector fails', () => { const altered = COMMUNITY_RUNTIME_PROJECTION_PROOFS.map((proof, index) => index === 0 ? { ...proof, classification: 'consumed' as const, runtimeSelector: undefined } : proof); expect(validateCommunityRuntimeProjectionProofs(altered).some(error => error.includes('missing runtime selector'))).toBe(true); });
  it('T09 compound parent consumed above blocked child fails', () => {
    // 伪造「父 consumed + 子 blocker」组合，验证门禁仍生效（WP-7 关闭后 noSpace 自身已不再是 blocker）。
    const leaf = COMMUNITY_RUNTIME_PROJECTION_PROOFS.find((proof) => proof.sourcePath === 'spawnAreaPolicy.noSpace')!;
    const blockedChild = {
      ...leaf,
      classification: 'engine-unsupported-blocker' as const,
      blockerCode: 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED' as const,
      runtimeSelector: undefined,
      runtimeSelectorId: undefined,
    };
    const parent = {
      ...leaf,
      sourcePath: 'spawnAreaPolicy',
      classification: 'consumed' as const,
      runtimeSelectorId: 'forged.parent',
      runtimeSelector: () => leaf.sourceSelector(),
    };
    const withoutLeaf = COMMUNITY_RUNTIME_PROJECTION_PROOFS.filter((proof) => proof !== leaf);
    expect(validateCommunityRuntimeProjectionProofs([...withoutLeaf, blockedChild, parent]).some((error) => error.includes('compound parent consumed'))).toBe(true);
  });
  it('T10 active blocker without dependency metadata fails', () => { const blockers = COMMUNITY_RUNTIME_BLOCKERS.map((blocker, index) => index === 0 ? { ...blocker, runtimeDependency: '' } : blocker); expect(validateCommunityRuntimeProjectionProofs(COMMUNITY_RUNTIME_PROJECTION_PROOFS, COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT, blockers).some(error => error.includes('metadata incomplete'))).toBe(true); });
});

describe('Mammoth source-confirmed effects and deterministic closure', () => {
  it('T11 Revivify heals self through the shared actor-healing primitive', () => {
    const original = createCommunityGuardianScenario(2); const state = original.actFourState.mammothCystEncounterState!;
    const first = state.initiativeCards.find(card => card.owner === 'mammoth-cyst')!;
    const summoned = summonWhiteCellStalk(original, { mode: 'community-reference', sourceActionEventId: first.id, rng: () => 0 });
    const s = summoned.state!; const cyst = s.actorStates.find(actor => actor.owner === 'mammoth-cyst')!; const wounded = { ...s, actorStates: s.actorStates.map(actor => actor.actorId === cyst.actorId ? { ...actor, hp: actor.hp - 20 } : actor) };
    const campaign = { ...summoned.campaign, actFourState: { ...summoned.campaign.actFourState, mammothCystEncounterState: wounded } }; const card = wounded.initiativeCards.find(item => item.owner === 'mammoth-cyst' && item.id !== first.id)!;
    const result = executeMammothCystAction(campaign, card.id, { mode: 'community-reference', rng: () => 0.99 });
    expect(result.ok).toBe(true); expect(result.skill?.specialEffect).toEqual({ type: 'heal-monster', amount: 15, target: 'self' }); expect(result.state!.actorStates.find(actor => actor.actorId === cyst.actorId)!.hp).toBe(cyst.hp - 5);
  });
  it('T12 Reconstitute heals the selected ally', () => {
    const original = createCommunityGuardianScenario(2); const first = original.actFourState.mammothCystEncounterState!.initiativeCards.find(card => card.owner === 'mammoth-cyst')!;
    const summoned = summonWhiteCellStalk(original, { mode: 'community-reference', sourceActionEventId: first.id, rng: () => 0 }); const s = summoned.state!; const cyst = s.actorStates.find(actor => actor.owner === 'mammoth-cyst')!; const wounded = { ...s, actorStates: s.actorStates.map(actor => actor.actorId === cyst.actorId ? { ...actor, hp: actor.hp - 20 } : actor) };
    const campaign = { ...summoned.campaign, actFourState: { ...summoned.campaign.actFourState, mammothCystEncounterState: wounded } }; const card = wounded.initiativeCards.find(item => item.owner === 'white-cell-stalk')!;
    const result = executeMammothCystAction(campaign, card.id, { mode: 'community-reference', targetMonsterActorId: cyst.actorId, rng: () => 0 });
    expect(result.ok).toBe(true); expect(result.skill?.specialEffect).toEqual({ type: 'heal-monster', amount: 14, target: 'ally' }); expect(result.state!.actorStates.find(actor => actor.actorId === cyst.actorId)!.hp).toBe(cyst.hp - 6);
  });
  it('T13 healing save/replay is identical', () => {
    const original = createCommunityGuardianScenario(2); const first = original.actFourState.mammothCystEncounterState!.initiativeCards.find(card => card.owner === 'mammoth-cyst')!; const summoned = summonWhiteCellStalk(original, { mode: 'community-reference', sourceActionEventId: first.id, rng: () => 0 }); const s = summoned.state!; const cyst = s.actorStates.find(actor => actor.owner === 'mammoth-cyst')!; const wounded = { ...s, actorStates: s.actorStates.map(actor => actor.actorId === cyst.actorId ? { ...actor, hp: actor.hp - 20 } : actor) }; const checkpoint = { ...summoned.campaign, actFourState: { ...summoned.campaign.actFourState, mammothCystEncounterState: wounded } }; const card = wounded.initiativeCards.find(item => item.owner === 'mammoth-cyst' && item.id !== first.id)!;
    const a = executeMammothCystAction(checkpoint, card.id, { mode: 'community-reference', rng: () => 0.99, now: '2026-01-01T00:00:00.000Z' }); const b = executeMammothCystAction(jsonRoundTrip(checkpoint), card.id, { mode: 'community-reference', rng: () => 0.99, now: '2026-01-01T00:00:00.000Z' }); expect({ roll: b.skillRoll?.roll, skill: b.skill?.id, actors: b.state?.actorStates }).toEqual({ roll: a.skillRoll?.roll, skill: a.skill?.id, actors: a.state?.actorStates });
  });
  it('T14 full spawn Area enters no-space displacement (player choice) without RNG or summon', () => {
    const campaign = createCommunityGuardianScenario(2);
    const state = campaign.actFourState.mammothCystEncounterState!;
    const card = state.initiativeCards.find(item => item.owner === 'mammoth-cyst')!;
    const area = state.snapshot.room.stanceAreaMap.ranged!;
    // 用真实英雄填满 spawn Area（capacity=4 == party size），触发 rulebook:31 位移。
    const filled = {
      ...state,
      heroPlacements: campaign.heroes.map((hero) => ({ heroId: hero.instanceId, areaId: area })),
    };
    const checkpoint = { ...campaign, actFourState: { ...campaign.actFourState, mammothCystEncounterState: filled } };
    const result = summonWhiteCellStalk(checkpoint, {
      mode: 'community-reference',
      sourceActionEventId: card.id,
      rng: () => { throw new Error('RNG consumed'); },
    });
    expect(result.ok).toBe(false);
    expect(result.blockerCode).toBeUndefined();
    expect(result.record).toBeNull();
    expect(result.pendingChoice).not.toBeNull();
    expect(result.pendingChoice!.kind).toBe('summon-hero-displacement');
    expect(result.pendingChoice!.heroCandidateIds).toEqual([...campaign.heroes.map((h) => h.instanceId)].sort());
    expect(result.pendingChoice!.destinationAreaIds.length).toBeGreaterThan(0);
    expect(result.state!.pendingDisplacementChoice).toEqual(result.pendingChoice);
    expect(result.state!.summonHistory).toEqual([]);
  });
  it('T15 no-space player-choice state survives save/reload identically', () => {
    const campaign = createCommunityGuardianScenario(2);
    const state = campaign.actFourState.mammothCystEncounterState!;
    const card = state.initiativeCards.find(item => item.owner === 'mammoth-cyst')!;
    const area = state.snapshot.room.stanceAreaMap.ranged!;
    const filled = {
      ...state,
      heroPlacements: campaign.heroes.map((hero) => ({ heroId: hero.instanceId, areaId: area })),
    };
    const checkpoint = { ...campaign, actFourState: { ...campaign.actFourState, mammothCystEncounterState: filled } };
    const options = { mode: 'community-reference' as const, sourceActionEventId: card.id, rng: () => 0, now: '2026-09-12T00:00:00.000Z' };
    const a = summonWhiteCellStalk(checkpoint, options);
    const b = summonWhiteCellStalk(jsonRoundTrip(checkpoint), options);
    // id / createdAt 由 createId 生成，两次独立召唤允许不同；语义字段必须一致。
    const semantic = (choice: NonNullable<typeof a.pendingChoice>) => ({
      kind: choice.kind,
      transactionId: choice.transactionId,
      sourceActionEventId: choice.sourceActionEventId,
      heroCandidateIds: choice.heroCandidateIds,
      monsterCandidateIds: choice.monsterCandidateIds,
      destinationAreaIds: choice.destinationAreaIds,
      spawnStance: choice.spawnStance,
      spawnAreaId: choice.spawnAreaId,
      remainingSteps: choice.remainingSteps,
    });
    expect(a.pendingChoice).not.toBeNull();
    expect(semantic(a.pendingChoice!)).toEqual(semantic(b.pendingChoice!));
    expect(a.record).toBeNull();
    expect(b.record).toBeNull();
  });
});
