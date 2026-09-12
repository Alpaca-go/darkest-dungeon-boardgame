import type { ActiveEffect, ProvisionPool, StatusEffectType } from '../../../types';
import type { CommunityProvisionFace, CommunityQuestProvisionDieRecord, CommunityQuestProvisionRecord } from '../../../types/act-four';
import { requirement } from '../../../data/darkest-dungeon/community-reference/normalized';

export type CommunityConditionCategory = StatusEffectType | 'shuffle';

type ResistanceSource = { resistantTo: CommunityConditionCategory[]; immuneTo: CommunityConditionCategory[] };
type CriticalSource = Record<string, { threshold: number | 'not printed'; damage: number | 'not printed' }>;

const GUARDIAN_REQUIREMENT_IDS = [
  'tierB-templars-impaler',
  'tierB-templars-warlord',
  'tierB-mammoth-cyst',
  'tierB-white-cell-stalk',
  'tierB-shuffling-horror',
  'tierB-cultist-priest',
  'tierB-malignant-growth',
] as const;

export const COMMUNITY_GUARDIAN_RESISTANCE_POLICY = Object.fromEntries(
  GUARDIAN_REQUIREMENT_IDS.map((requirementId) => [
    requirementId,
    requirement(requirementId).fields.resistances.value as ResistanceSource,
  ]),
) as Record<(typeof GUARDIAN_REQUIREMENT_IDS)[number], ResistanceSource>;

export const COMMUNITY_GUARDIAN_CRITICAL_POLICY = Object.fromEntries(
  GUARDIAN_REQUIREMENT_IDS.map((requirementId) => [
    requirementId,
    requirement(requirementId).fields.crit.value as CriticalSource,
  ]),
) as Record<(typeof GUARDIAN_REQUIREMENT_IDS)[number], CriticalSource>;

export interface CommunityConditionResolution {
  outcome: 'applied' | 'resisted' | 'immune';
  effect: ActiveEffect | null;
  movementDistance: number | null;
}

/** Core Rulebook pp.20-21: resistance shortens a Condition by one turn, immunity negates it. */
export function resolveCommunityGuardianCondition(
  requirementId: keyof typeof COMMUNITY_GUARDIAN_RESISTANCE_POLICY,
  category: CommunityConditionCategory,
  input: { effect?: ActiveEffect; movementDistance?: number },
): CommunityConditionResolution {
  const policy = COMMUNITY_GUARDIAN_RESISTANCE_POLICY[requirementId];
  if (policy.immuneTo.includes(category)) return { outcome: 'immune', effect: null, movementDistance: null };
  const resistant = policy.resistantTo.includes(category);
  if (category === 'shuffle') {
    const distance = Math.max(0, (input.movementDistance ?? 0) - (resistant ? 1 : 0));
    return { outcome: resistant ? 'resisted' : 'applied', effect: null, movementDistance: distance };
  }
  if (!input.effect) throw new Error(`Condition ${category} requires an effect payload`);
  const durationTurns = Math.max(0, (input.effect.durationTurns ?? input.effect.amount) - (resistant ? 1 : 0));
  return {
    outcome: resistant ? 'resisted' : 'applied',
    effect: durationTurns === 0 ? null : { ...input.effect, durationTurns },
    movementDistance: null,
  };
}

export interface CommunityCriticalResolution {
  hit: boolean;
  critical: boolean;
  roll: number;
  damage: number;
}

/** Core Rulebook pp.19-20: a hit roll at or below printed Crit causes printed Critical Damage. */
export function resolveCommunityGuardianCritical(
  requirementId: keyof typeof COMMUNITY_GUARDIAN_CRITICAL_POLICY,
  localSkillId: string,
  roll: number,
  accuracy: number,
  normalDamage: number,
): CommunityCriticalResolution {
  if (!Number.isInteger(roll) || roll < 1 || roll > 10) throw new Error(`Invalid d10 roll: ${roll}`);
  const printed = COMMUNITY_GUARDIAN_CRITICAL_POLICY[requirementId][localSkillId];
  if (!printed) throw new Error(`Missing Community critical source: ${requirementId}.${localSkillId}`);
  const hit = roll <= accuracy;
  const critical = hit && typeof printed.threshold === 'number' && roll <= printed.threshold;
  const damage = critical && typeof printed.damage === 'number' ? printed.damage : hit ? normalDamage : 0;
  return { hit, critical, roll, damage };
}

const PROVISION_FACES: CommunityProvisionFace[] = ['food', 'bandage', 'potion', 'torch', 'tool', 'wild'];
export const COMMUNITY_QUEST_PROVISION_POLICY = {
  cardSpecificOverride: 'none printed',
  dicePerHero: 2,
  wildChoice: true,
  commonPoolMaximum: 16,
} as const;

export function rollCommunityQuestProvisions(
  current: ProvisionPool,
  policyId: string,
  heroIds: string[],
  rng: () => number,
  chooseWild?: (heroId: string, dieIndex: 0 | 1) => keyof ProvisionPool,
): { ok: true; provisions: ProvisionPool; record: CommunityQuestProvisionRecord } | { ok: false; reason: string } {
  const provisions = { ...current };
  const dice: CommunityQuestProvisionDieRecord[] = [];
  for (const heroId of heroIds) {
    for (const dieIndex of [0, 1] as const) {
      const roll = Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
      const rolledFace = PROVISION_FACES[roll - 1];
      const selectedFace = rolledFace === 'wild' ? chooseWild?.(heroId, dieIndex) : rolledFace;
      if (!selectedFace) return { ok: false, reason: `Wild Provision choice required for ${heroId} die ${dieIndex + 1}` };
      const acceptedIntoPool = Object.values(provisions).reduce((sum, count) => sum + count, 0) < 16;
      if (acceptedIntoPool) provisions[selectedFace] += 1;
      dice.push({ heroId, dieIndex, roll, rolledFace, selectedFace, acceptedIntoPool });
    }
  }
  return { ok: true, provisions, record: { policyId, dice, poolMaximum: 16 } };
}

export const COMMUNITY_FINAL_TRANSITION_POLICY = {
  fixedOrder: true,
  questSelectedSkip: true,
  heartOfDarknessUnskippable: true,
  preserveEncounterRoom: true,
  preserveHeroLifeStressStance: true,
  rebuildInitiative: true,
} as const;

export const COMMUNITY_GESTATING_SKILL_SELECTION = {
  dieRollRequired: false,
  printedSkillNumber: 1,
  localSkillId: 'dispersion',
} as const;

export const COMMUNITY_GUARDIAN_VICTORY_POLICIES = {
  templars: { objective: 'all-boss-members-defeated', cleanup: 'none', roundLimit: 'not-counted' },
  'mammoth-cyst': { objective: 'boss-defeated', cleanup: 'remove-linked-actors-on-boss-victory', roundLimit: 'not-counted' },
  'shuffling-horror': { objective: 'boss-defeated', cleanup: 'remove-linked-actors-on-boss-victory', roundLimit: 'not-counted' },
} as const;
