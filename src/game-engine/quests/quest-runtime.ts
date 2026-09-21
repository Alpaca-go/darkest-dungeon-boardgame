import type { CampaignState, DungeonRoom, QuestDefinition } from '../../types';
import { getQuestById } from '../../data/quests';

export interface QuestXpEvaluation {
  qualifiedUnitCount: number;
  xpUnitsEarned: number;
  xpEarned: number;
}

export function evaluateQuestXpUnits(quest: QuestDefinition, qualifiedUnitCount: number): QuestXpEvaluation {
  const unit = quest.xpUnit;
  if (!unit) return { qualifiedUnitCount: 0, xpUnitsEarned: 0, xpEarned: 0 };
  const normalized = Math.max(0, Math.floor(qualifiedUnitCount));
  const xpUnitsEarned = Math.floor(normalized / Math.max(1, unit.unitSize));
  const uncapped = xpUnitsEarned * Math.max(0, unit.xpPerUnit);
  const xpEarned = unit.maximumXp === null ? uncapped : Math.min(unit.maximumXp, uncapped);
  return { qualifiedUnitCount: normalized, xpUnitsEarned, xpEarned };
}

export function calculateQuestXpReward(campaign: CampaignState): QuestXpEvaluation | null {
  const quest = getQuestById(campaign.currentQuestId ?? '');
  if (!quest?.xpUnit) return null;
  const selected = new Set(campaign.questRuntimeState?.selectedRoomIds ?? []);
  const qualified = (campaign.dungeon?.rooms ?? []).filter((room) => {
    if (selected.size > 0 ? !selected.has(room.id) : room.status !== 'cleared') return false;
    return quest.xpUnit!.targetEntity === 'room' || room.sourceRoomToken === 'lair';
  }).length;
  return evaluateQuestXpUnits(quest, qualified);
}

export function createQuestRuntimeState(quest: QuestDefinition): CampaignState['questRuntimeState'] {
  if (!quest.xpUnit || !quest.dungeonComposition) return null;
  return {
    definitionId: quest.id,
    counters: { qualifiedUnitCount: 0, xpUnitsEarned: 0, xpEarned: 0 },
    flags: { objectiveComplete: false },
    selectedRoomIds: [],
    setAsideRoomIds: [],
    qualifiedUnitCount: 0,
    xpUnitsEarned: 0,
    xpEarned: 0,
    firewoodTokensRemaining: quest.firewoodSetup?.tokens ?? 0,
    restingPointsRemaining: quest.firewoodSetup?.restingPoints ?? 0,
    restingPointsSpent: 0,
  };
}

export interface QuestRestResult {
  ok: boolean;
  campaign: CampaignState;
  error: RestAllocationError | null;
}

export type RestRecoveryResource = 'life' | 'stress';

export interface RestAllocationEntry {
  /** Campaign Hero instance id (the source calls the target a Hero). */
  heroId: string;
  resource: RestRecoveryResource;
  points: number;
}

export interface RestAllocation {
  allocations: RestAllocationEntry[];
}

export type RestAllocationError =
  | 'REST_NOT_COMMUNITY_QUEST'
  | 'REST_NOT_IN_DUNGEON_EXPLORE'
  | 'REST_NOT_IN_CLEARED_ROOM'
  | 'REST_NO_FIREWOOD'
  | 'REST_NO_RESTING_POINTS'
  | 'REST_ALLOCATION_INVALID_POINTS'
  | 'REST_ALLOCATION_INVALID_RESOURCE'
  | 'REST_ALLOCATION_UNKNOWN_HERO'
  | 'REST_ALLOCATION_DEAD_HERO'
  | 'REST_ALLOCATION_EXCEEDS_BUDGET'
  | 'REST_ALLOCATION_INCOMPLETE_BUDGET'
  | 'REST_ALLOCATION_EXCEEDS_RECOVERY_CAP';

export interface RestAllocationValidation {
  ok: boolean;
  error: RestAllocationError | null;
  availablePoints: number;
  spentPoints: number;
}

/** Pure, fail-closed validation for a player-authored Rest allocation. */
export function validateRestAllocation(
  campaign: CampaignState,
  allocation: RestAllocation,
): RestAllocationValidation {
  const state = campaign.questRuntimeState;
  const current = campaign.dungeon?.rooms.find((room) => room.id === campaign.dungeon?.currentRoomId);
  const budget = state?.restingPointsRemaining ?? 0;
  const invalid = (error: RestAllocationError, spentPoints = 0): RestAllocationValidation => ({
    ok: false,
    error,
    availablePoints: budget,
    spentPoints,
  });

  if (campaign.runtimeContentProfile !== 'community-complete-edition'
    || !state
    || state.definitionId !== campaign.currentQuestId) {
    return invalid('REST_NOT_COMMUNITY_QUEST');
  }
  if (campaign.gamePhase !== 'dungeon-explore') return invalid('REST_NOT_IN_DUNGEON_EXPLORE');
  if (!current || current.status !== 'cleared') return invalid('REST_NOT_IN_CLEARED_ROOM');
  if (!state || (state.firewoodTokensRemaining ?? 0) <= 0) return invalid('REST_NO_FIREWOOD');
  if (budget <= 0) return invalid('REST_NO_RESTING_POINTS');
  if (!allocation || !Array.isArray(allocation.allocations)) return invalid('REST_ALLOCATION_INVALID_POINTS');

  const requestedByHeroAndResource = new Map<string, number>();
  let spentPoints = 0;
  for (const entry of allocation.allocations) {
    if (!entry || !Number.isInteger(entry.points) || entry.points < 0) {
      return invalid('REST_ALLOCATION_INVALID_POINTS', spentPoints);
    }
    if (entry.resource !== 'life' && entry.resource !== 'stress') {
      return invalid('REST_ALLOCATION_INVALID_RESOURCE', spentPoints);
    }
    const hero = campaign.heroes.find((candidate) => candidate.instanceId === entry.heroId);
    if (!hero) return invalid('REST_ALLOCATION_UNKNOWN_HERO', spentPoints);
    if (hero.dead || !hero.isAlive) return invalid('REST_ALLOCATION_DEAD_HERO', spentPoints);
    spentPoints += entry.points;
    if (spentPoints > budget) return invalid('REST_ALLOCATION_EXCEEDS_BUDGET', spentPoints);
    const key = `${entry.heroId}:${entry.resource}`;
    const requested = (requestedByHeroAndResource.get(key) ?? 0) + entry.points;
    const recoverable = entry.resource === 'life' ? hero.wounds : hero.stress;
    if (requested > recoverable) return invalid('REST_ALLOCATION_EXCEEDS_RECOVERY_CAP', spentPoints);
    requestedByHeroAndResource.set(key, requested);
  }

  if (spentPoints !== budget) return invalid('REST_ALLOCATION_INCOMPLETE_BUDGET', spentPoints);

  return { ok: true, error: null, availablePoints: budget, spentPoints };
}

/**
 * Atomically commits the allocation chosen by the players. One point recovers one Life
 * (represented by removing one Wound) or one Stress. Confirming ends the Rest and discards
 * one Firewood. The source-backed full-budget gate requires every printed point to be allocated.
 */
export function commitRestAtCamp(campaign: CampaignState, allocation: RestAllocation): QuestRestResult {
  const validation = validateRestAllocation(campaign, allocation);
  if (!validation.ok) return { ok: false, campaign, error: validation.error };

  const state = campaign.questRuntimeState!;
  const recovery = new Map<string, { life: number; stress: number }>();
  for (const entry of allocation.allocations) {
    const current = recovery.get(entry.heroId) ?? { life: 0, stress: 0 };
    current[entry.resource] += entry.points;
    recovery.set(entry.heroId, current);
  }
  const heroes = campaign.heroes.map((hero) => {
    const chosen = recovery.get(hero.instanceId);
    if (!chosen) return hero;
    return {
      ...hero,
      wounds: hero.wounds - chosen.life,
      stress: hero.stress - chosen.stress,
    };
  });
  const totalSpent = (state.restingPointsSpent ?? 0) + validation.spentPoints;
  return {
    ok: true,
    campaign: {
      ...campaign,
      heroes,
      questRuntimeState: {
        ...state,
        firewoodTokensRemaining: (state.firewoodTokensRemaining ?? 0) - 1,
        restingPointsRemaining: 0,
        restingPointsSpent: totalSpent,
        counters: { ...state.counters, restingPointsSpent: totalSpent },
      },
    },
    error: null,
  };
}

export function recordQuestQualificationEvent(campaign: CampaignState, room: DungeonRoom): CampaignState {
  const quest = getQuestById(campaign.currentQuestId ?? '');
  const state = campaign.questRuntimeState;
  if (!quest?.xpUnit || !state || state.definitionId !== quest.id) return campaign;
  const qualifies = quest.xpUnit.targetEntity === 'room' || room.sourceRoomToken === 'lair';
  if (!qualifies || state.selectedRoomIds.includes(room.id)) return campaign;
  const selectedRoomIds = [...state.selectedRoomIds, room.id];
  const evaluated = evaluateQuestXpUnits(quest, selectedRoomIds.length);
  return {
    ...campaign,
    questRuntimeState: {
      ...state,
      selectedRoomIds,
      qualifiedUnitCount: evaluated.qualifiedUnitCount,
      xpUnitsEarned: evaluated.xpUnitsEarned,
      xpEarned: evaluated.xpEarned,
      counters: { ...state.counters, ...evaluated },
    },
  };
}
