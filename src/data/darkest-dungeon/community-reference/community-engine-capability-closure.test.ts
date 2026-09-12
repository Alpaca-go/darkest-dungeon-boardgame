import { describe, expect, it } from 'vitest';
import { createCommunityCheckpoint, createCommunityFinalScenario, createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { drawDarkestDungeonQuest } from '../../../game-engine/campaign/act-four/draw-quest';
import { performFinalFormSispersion } from '../../../game-engine/campaign/act-four/final-forms/final-form-actions';
import {
  COMMUNITY_FINAL_TRANSITION_POLICY,
  COMMUNITY_GESTATING_SKILL_SELECTION,
  COMMUNITY_GUARDIAN_CRITICAL_POLICY,
  COMMUNITY_GUARDIAN_RESISTANCE_POLICY,
  COMMUNITY_GUARDIAN_VICTORY_POLICIES,
  resolveCommunityGuardianCondition,
  resolveCommunityGuardianCritical,
  rollCommunityQuestProvisions,
} from '../../../game-engine/campaign/act-four/community-engine-capabilities';
import { COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';
import { COMMUNITY_RUNTIME_FIELD_COVERAGE, validateCommunityRuntimeFieldCoverage } from './runtime-field-coverage';
import { executeMammothCystAction } from '../../../game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action';

describe('Phase 11A.3 source-backed engine capability closure', () => {
  it('closes exactly the six source-backed runtime blockers and preserves the six source gaps', () => {
    expect(COMMUNITY_RUNTIME_BLOCKERS).toHaveLength(11);
    expect(COMMUNITY_RUNTIME_BLOCKERS.filter((item) => item.classification === 'source-level')).toHaveLength(5);
    expect(COMMUNITY_RUNTIME_BLOCKERS.filter((item) => item.classification === 'runtime-only')).toHaveLength(6);
    expect(COMMUNITY_RUNTIME_BLOCKERS.map((item) => item.code)).not.toEqual(expect.arrayContaining([
      'GUARDIAN_RESISTANCE_ENGINE_UNSUPPORTED', 'GUARDIAN_CRIT_ENGINE_UNSUPPORTED',
      'QUEST_CARD_PROVISION_POLICY_ENGINE_UNSUPPORTED', 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED',
      'FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED', 'GUARDIAN_VICTORY_POLICY_ENGINE_UNSUPPORTED',
    ]));
  });

  it('projects every resistance and crit source field into an executable policy', () => {
    expect(validateCommunityRuntimeFieldCoverage()).toEqual([]);
    for (const path of ['resistances', 'crit']) {
      const entries = COMMUNITY_RUNTIME_FIELD_COVERAGE.filter((entry) => entry.sourcePath === path);
      expect(entries).toHaveLength(7);
      expect(entries.every((entry) => entry.classification === 'consumed')).toBe(true);
    }
  });

  it('applies categorical resistance, immunity, and ordinary duration semantics for all guardians', () => {
    for (const [requirementId, policy] of Object.entries(COMMUNITY_GUARDIAN_RESISTANCE_POLICY)) {
      for (const category of policy.resistantTo) {
        const input = category === 'shuffle' ? { movementDistance: 2 } : { effect: { type: category, amount: 3, durationTurns: 2 } };
        const result = resolveCommunityGuardianCondition(requirementId as keyof typeof COMMUNITY_GUARDIAN_RESISTANCE_POLICY, category, input as never);
        expect(result.outcome).toBe('resisted');
        expect(category === 'shuffle' ? result.movementDistance : result.effect?.durationTurns).toBe(1);
      }
      for (const category of policy.immuneTo) {
        const result = resolveCommunityGuardianCondition(requirementId as keyof typeof COMMUNITY_GUARDIAN_RESISTANCE_POLICY, category, category === 'shuffle' ? { movementDistance: 2 } : { effect: { type: category, amount: 2 } } as never);
        expect(result).toMatchObject({ outcome: 'immune', effect: null, movementDistance: null });
      }
    }
  });

  it('uses low-roll printed critical thresholds and printed critical damage for every guardian skill', () => {
    for (const [requirementId, skills] of Object.entries(COMMUNITY_GUARDIAN_CRITICAL_POLICY)) {
      for (const [skillId, printed] of Object.entries(skills)) {
        const result = resolveCommunityGuardianCritical(requirementId as keyof typeof COMMUNITY_GUARDIAN_CRITICAL_POLICY, skillId, 1, 10, 3);
        if (typeof printed.threshold === 'number' && printed.threshold > 0) {
          expect(result).toEqual({ hit: true, critical: true, roll: 1, damage: printed.damage });
        } else {
          expect(result).toEqual({ hit: true, critical: false, roll: 1, damage: 3 });
        }
        expect(resolveCommunityGuardianCritical(requirementId as keyof typeof COMMUNITY_GUARDIAN_CRITICAL_POLICY, skillId, 10, 0, 3).hit).toBe(false);
      }
    }
  });

  it('persists a Community Mammoth critical outcome before damage display and replays without RNG', () => {
    const base = createCommunityGuardianScenario(2);
    const initial = base.actFourState.mammothCystEncounterState!;
    const firstCard = initial.initiativeCards.find((card) => card.owner === 'mammoth-cyst')!;
    const summoned = executeMammothCystAction(base, firstCard.id, { mode: 'community-reference', rng: () => 0, now: 't-summon' });
    expect(summoned.ok).toBe(true);
    const afterSummon = summoned.campaign.actFourState.mammothCystEncounterState!;
    const attackCard = afterSummon.initiativeCards.find((card) => card.owner === 'mammoth-cyst' && card.id !== firstCard.id)!;
    const values = [0.5, 0]; // Digestion, then critical hit roll 1.
    const targetHeroId = summoned.campaign.heroes.find((hero) => hero.isAlive)!.instanceId;
    const first = executeMammothCystAction(summoned.campaign, attackCard.id, { mode: 'community-reference', targetHeroId, rng: () => values.shift()!, now: 't-attack' });
    expect(first.skillRoll).toMatchObject({ attackRoll: 1, hit: true, critical: true, resolvedDamage: 19 });
    const replay = executeMammothCystAction(first.campaign, attackCard.id, { mode: 'community-reference', targetHeroId, rng: () => { throw new Error('replay consumed RNG'); }, now: 't-replay' });
    expect(replay.ok).toBe(true);
    expect(replay.skillRoll).toEqual(first.skillRoll);
  });

  it('rolls two provisions per living hero, resolves wilds, caps at 16, and saves replay without RNG', () => {
    const direct = rollCommunityQuestProvisions({ food: 15, bandage: 0, potion: 0, torch: 0, tool: 0 }, 'policy', ['h1', 'h2'], () => 0.99, () => 'torch');
    expect(direct.ok).toBe(true);
    if (direct.ok) {
      expect(direct.record.dice).toHaveLength(4);
      expect(direct.record.dice.filter((die) => die.acceptedIntoPool)).toHaveLength(1);
      expect(Object.values(direct.provisions).reduce((sum, count) => sum + count, 0)).toBe(16);
    }
    const values = [0, ...Array(8).fill(0.99)];
    const first = drawDarkestDungeonQuest(createCommunityCheckpoint(), { mode: 'community-reference', rng: () => values.shift()!, chooseWildProvision: () => 'food' });
    expect(first.ok).toBe(true);
    expect(first.record?.provisionRoll?.dice).toHaveLength(8);
    const replay = drawDarkestDungeonQuest(first.campaign, { mode: 'community-reference', rng: () => { throw new Error('replay consumed RNG'); } });
    expect(replay.alreadyDrawn).toBe(true);
    expect(replay.record).toEqual(first.record);
  });

  it('executes the deterministic Gestating skill without a selection die and replays idempotently', () => {
    expect(COMMUNITY_GESTATING_SKILL_SELECTION).toEqual({ dieRollRequired: false, printedSkillNumber: 1, localSkillId: 'dispersion' });
    const base = createCommunityFinalScenario();
    const state = base.actFourState.finalFormRuntimeState!;
    const campaign = { ...base, actFourState: { ...base.actFourState, finalFormRuntimeState: { ...state, activeFormId: 'gestating-heart' as const } } };
    const first = performFinalFormSispersion(campaign, 1, { mode: 'community-reference', rng: () => 0 });
    expect(first.ok).toBe(true);
    const replay = performFinalFormSispersion(first.campaign, 1, { mode: 'community-reference', rng: () => { throw new Error('replay consumed RNG'); } });
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.record).toEqual(first.record);
  });

  it('freezes transition and all three guardian victory semantics as executable policies', () => {
    expect(COMMUNITY_FINAL_TRANSITION_POLICY).toMatchObject({ fixedOrder: true, questSelectedSkip: true, heartOfDarknessUnskippable: true, preserveEncounterRoom: true, preserveHeroLifeStressStance: true, rebuildInitiative: true });
    expect(COMMUNITY_GUARDIAN_VICTORY_POLICIES.templars.objective).toBe('all-boss-members-defeated');
    expect(COMMUNITY_GUARDIAN_VICTORY_POLICIES['mammoth-cyst'].cleanup).toBe('remove-linked-actors-on-boss-victory');
    expect(COMMUNITY_GUARDIAN_VICTORY_POLICIES['shuffling-horror'].cleanup).toBe('remove-linked-actors-on-boss-victory');
  });
});
