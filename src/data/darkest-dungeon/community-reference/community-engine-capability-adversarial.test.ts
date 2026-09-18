import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { capabilityAssessments, EXPECTED_TEST_IDS, resolveTestReference, SUITES, testCounts, validateEvidenceBinding, validateTestGroup, type TestRow } from '../../../../scripts/audit/community-engine-final-acceptance-contract';
import { runProductionMutation } from '../../../../scripts/audit/community-engine-production-mutations';
import { COMMUNITY_RUNTIME_FIELD_COVERAGE } from './runtime-field-coverage';
import { COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';
import { createCommunityCheckpoint } from '../../../testing/scenarios/community-runtime-scenario';
import { drawDarkestDungeonQuest } from '../../../game-engine/campaign/act-four/draw-quest';
import { executeMammothCystAction } from '../../../game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action';
import { advanceTurn, endHeroTurn, heroSkillActionError, heroUseSkill } from '../../../game-engine/battle';
import { attack, noRng, reload, scenario } from './capability-test-support';
import { seededRuntimeSources, setRuntimeSources, setRandomSource } from '../../../game-engine/random';

// Synthetic metadata tests rejection logic and is never published as execution evidence.
const fixtureRows = (): TestRow[] => Object.entries(EXPECTED_TEST_IDS).flatMap(([group, ids]) => ids.map(id => ({ file: `/${SUITES[group as keyof typeof SUITES]}`, title: `${id} fixture`, fullName: `${id} fixture`, status: 'passed' })));
beforeEach(() => { setRuntimeSources(seededRuntimeSources(1203)); setRandomSource(() => 0.49); });
afterEach(() => setRandomSource(null));
describe('Community final acceptance rejects false green proofs', () => {
  it('A01 rejects a nonexistent triage file', () => expect(() => resolveTestReference('missing.test.ts:missing', [], () => false)).toThrow('Missing test file'));
  it('A02 rejects a nonexistent named test in a real file', () => expect(() => resolveTestReference(`${SUITES.production}:missing`, fixtureRows())).toThrow('named test'));
  it('A03 rejects an accepted capability without production proof', () => expect(capabilityAssessments(fixtureRows().filter(row => !row.title.startsWith('P-quest-provision '))).errors.join()).toContain('P-quest-provision'));
  it('A04 rejects an accepted capability without whole-save proof', () => expect(capabilityAssessments(fixtureRows().filter(row => !row.title.startsWith('SR-quest-provision '))).errors.join()).toContain('SR-quest-provision'));
  it('A05 removed blocker is not implementation evidence', () => {
    const forged = COMMUNITY_RUNTIME_FIELD_COVERAGE.map(leaf => leaf.classification === 'consumed' ? leaf : { ...leaf, classification: 'engine-unsupported-blocker' as const, blockerCode: 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED' as const, runtimeSelector: undefined, runtimeSelectorId: null });
    expect(capabilityAssessments(fixtureRows(), forged, COMMUNITY_RUNTIME_BLOCKERS.filter(blocker => blocker.code !== 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED')).errors).toContain('final-skill: unsupported semantic has no active blocker');
  });
  it('A06 fewer discovered tests cannot pass with exit zero', () => { const rows = fixtureRows().filter(row => row.file.endsWith(SUITES.production)).slice(1); expect(validateTestGroup(rows, EXPECTED_TEST_IDS.production)).toContain('discovered != expected'); });
  it('A07 skipped test is not a completed proof', () => { const rows = fixtureRows().filter(row => row.file.endsWith(SUITES.production)); rows[0].status = 'pending'; expect(validateTestGroup(rows, EXPECTED_TEST_IDS.production)).toContain('skipped != 0'); });
  it('A08 todo test is not a completed proof', () => { const rows = fixtureRows().filter(row => row.file.endsWith(SUITES.production)); rows[0].status = 'todo'; expect(testCounts(rows, rows.length).todo).toBe(1); expect(validateTestGroup(rows, EXPECTED_TEST_IDS.production)).toContain('todo != 0'); });
  it('A09 wrong implementation SHA or publication parent fails', () => expect(validateEvidenceBinding({ verifiedImplementationHead: 'wrong', expectedHead: 'a'.repeat(40), evidencePublicationParent: 'a'.repeat(40), official: {}, freshOfficial: {} })).toContain('Implementation HEAD / publication parent mismatch'));
  it('A10 Official exact truth must come from the fresh artifact', () => expect(validateEvidenceBinding({ verifiedImplementationHead: 'a', expectedHead: 'a', evidencePublicationParent: 'a', official: { runId: 'old' }, freshOfficial: { runId: 'fresh' } })).toContain('Official truth differs from fresh artifact'));
  it('A11 source-gap removal without evidence stays rejected', () => {
    // Phase 11A.4R1 WP-5：TEMPLARS_AREA_ADJACENCY_UNRESOLVED 已关闭（几何派生拓扑），
    // 其余来源级 blocker 保持显式。
    const remaining = ['TEMPLARS_PIT_EXIT_RULE_UNRESOLVED', 'COME_UNTO_YOUR_MAKER_UNRESOLVED', 'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED'];
    expect(remaining.every(code => COMMUNITY_RUNTIME_BLOCKERS.some(blocker => blocker.code === code))).toBe(true);
    const mutant = COMMUNITY_RUNTIME_BLOCKERS.filter(blocker => blocker.code !== 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED').map(blocker => blocker.code as string);
    expect(remaining.filter(code => !mutant.includes(code))).toEqual(['TEMPLARS_PIT_EXIT_RULE_UNRESOLVED']);
  });
  it('A12 removing the production Mammoth critical hook fails the real attack case', () => {
    const result = runProductionMutation('src/game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action.ts', 'const outcome = resolveCommunityGuardianCritical(requirementId, localSkillId, hitRoll, skill.accuracy, normalDamage);', 'const outcome = { hit: true, critical: false, damage: normalDamage };', 'P-critical-mammoth-cyst-6');
    expect(result.discovered, result.diagnostics).toBe(1); expect(result.failed, result.diagnostics).toBe(1); expect(result.exitCode).not.toBe(0);
  }, 100_000);
  it('A13 helper policies cannot conceal a production resistance bypass', () => {
    const result = runProductionMutation('src/game-engine/status-effects.ts', 'const result = applyEffectsWithResistance(target, effects);', 'const result = { unit: target, blocked: [] };', 'P-resistance-mammoth-cyst-blight');
    expect(result.discovered, result.diagnostics).toBe(1); expect(result.failed, result.diagnostics).toBe(1); expect(result.exitCode).not.toBe(0);
  }, 100_000);
  for (const [id, property, resolver, test] of [
    ['A14', 'templarsEncounterState', 'resolveTemplarsEncounterVictory', 'P-victory-templars'],
    ['A15', 'mammothCystEncounterState', 'resolveMammothCystEncounterVictory', 'P-victory-mammoth'],
    ['A16', 'shufflingHorrorEncounterState', 'resolveShufflingHorrorEncounterVictory', 'P-victory-shuffling'],
  ]) it(`${id} removing ${property} production victory wiring fails the real path`, () => {
    const result = runProductionMutation('src/game-engine/campaign/act-four/community-guardian-battle.ts', `if (state.${property}) return ${resolver}(next);`, `if (state.${property}) return { ok: true, campaign: next, reason: null };`, test);
    expect(result.discovered, result.diagnostics).toBe(1); expect(result.failed, result.diagnostics).toBe(1); expect(result.exitCode).not.toBe(0);
  }, 100_000);
  it('A17 removing the production Templars critical hook fails the real attack case', () => {
    // Phase 11A.4R1 WP-4：critical hook 现位于 hero-attack 三元分支（self/ally 技能无攻击骰）。
    const result = runProductionMutation('src/game-engine/campaign/act-four/community-guardian-combat.ts', ': resolveCommunityGuardianCritical(requirementId, localSkill, attackRoll, skill.accuracy ?? 7, skill.minDamage ?? 0);', ': { hit: true, critical: false, damage: skill.minDamage ?? 0 };', 'P-critical-templars-impaler-5');
    expect(result.discovered, result.diagnostics).toBe(1); expect(result.failed, result.diagnostics).toBe(1); expect(result.exitCode).not.toBe(0);
  }, 100_000);
  it('A18 removing the production Shuffling critical hook fails the real attack case', () => {
    const result = runProductionMutation('src/game-engine/campaign/act-four/community-guardian-combat.ts', ': resolveCommunityGuardianCritical(requirementId, localSkill, attackRoll, skill.accuracy ?? 7, skill.minDamage ?? 0);', ': { hit: true, critical: false, damage: 0 };', 'P-critical-shuffling-horror-5');
    expect(result.discovered, result.diagnostics).toBe(1); expect(result.failed, result.diagnostics).toBe(1); expect(result.exitCode).not.toBe(0);
  }, 100_000);
  it('A19 a transition policy constant cannot replace production transition and save proof', () => {
    const forged = COMMUNITY_RUNTIME_FIELD_COVERAGE.map(leaf => leaf.requirementId === 'tierB-ancestor-room' && leaf.sourcePath === 'roomEffects' ? { ...leaf, runtimeSelectorId: null, runtimeSelector: undefined } : leaf);
    expect(capabilityAssessments(fixtureRows(), forged).errors.some((error) => error.includes('final-transition'))).toBe(true);
  });
  it('A20 a Final selection constant cannot replace a full printed-skill matrix', () => {
    const forged = COMMUNITY_RUNTIME_FIELD_COVERAGE.map(leaf => /skillIds|d10SkillTable|impendingDoomD10SkillMap|vacantStanceFillSource/.test(leaf.sourcePath) ? { ...leaf, runtimeSelectorId: null, runtimeSelector: undefined } : leaf);
    expect(capabilityAssessments(fixtureRows(), forged).errors.some((error) => error.includes('final-skill'))).toBe(true);
  });
  it('A21 missing or invalid Wild choice leaves the real Quest transaction unchanged', () => {
    for (const choice of [undefined, (() => 'invalid')]) {
      const campaign = createCommunityCheckpoint(); const copy = structuredClone(campaign); const rolls = [0, 0.99];
      const result = drawDarkestDungeonQuest(campaign, { mode: 'community-reference', rng: () => rolls.shift()!, chooseWildProvision: choice as never });
      expect(result.ok).toBe(false); expect(result.campaign).toEqual(copy); expect(campaign).toEqual(copy);
    }
  });
  it('A22 a saved critical event cannot be redirected to another Hero', () => {
    const first = attack('mammoth-cyst', 6, 1); const restored = reload(first.result.campaign); setRandomSource(noRng);
    const result = executeMammothCystAction(restored, first.cardId, { mode: 'community-reference', targetHeroId: restored.heroes[1].instanceId, rng: noRng });
    expect(result.ok).toBe(false); expect(result.reason).toContain('target mismatch'); expect(result.campaign).toBe(restored);
  });
  it('A23 shuffle resistance reduces movement instead of blocking the skill', () => {
    const campaign = scenario('mammoth-cyst'); let battle = advanceTurn(campaign.battle!);
    for (let step = 0; step < 8 && battle.heroes.find(unit => unit.id === battle.activeActorId)!.position > 2; step++) battle = endHeroTurn(battle, battle.activeActorId!);
    const actor = battle.activeActorId!; const target = battle.monsters[0].id;
    expect(heroSkillActionError(battle, actor, 'hellion-bash', target)).toBeNull();
    const result = heroUseSkill(battle, actor, 'hellion-bash', target);
    expect(result.currentActionPoints).toBeLessThan(battle.currentActionPoints);
    expect(result.monsters.find(unit => unit.id === target)!.position).toBe(battle.monsters.find(unit => unit.id === target)!.position);
  });
});
