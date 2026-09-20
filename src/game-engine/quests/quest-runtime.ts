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
  error: 'not-in-cleared-room' | 'no-firewood' | 'no-resting-points' | null;
}

/**
 * Minimal production Rest command. The party confirms one Rest session, spends one printed
 * Firewood token, and deterministically applies the complete printed point budget: Stress first,
 * then Wounds, round-robin across living Heroes. Unneeded points are intentionally forfeited.
 */
export function restAtCamp(campaign: CampaignState): QuestRestResult {
  const state = campaign.questRuntimeState;
  const current = campaign.dungeon?.rooms.find((room) => room.id === campaign.dungeon?.currentRoomId);
  if (campaign.gamePhase !== 'dungeon-explore' || !current || current.status !== 'cleared') {
    return { ok: false, campaign, error: 'not-in-cleared-room' };
  }
  if (!state || (state.firewoodTokensRemaining ?? 0) <= 0) return { ok: false, campaign, error: 'no-firewood' };
  const budget = state.restingPointsRemaining ?? 0;
  if (budget <= 0) return { ok: false, campaign, error: 'no-resting-points' };
  const heroes = campaign.heroes.map((hero) => ({ ...hero }));
  const living = heroes.filter((hero) => hero.isAlive && !hero.dead);
  let spent = 0;
  for (let point = 0; point < budget && living.length > 0; point += 1) {
    const candidates = living.filter((hero) => hero.stress > 0 || hero.wounds > 0);
    if (candidates.length === 0) break;
    const hero = candidates[point % candidates.length];
    if (hero.stress > 0) hero.stress -= 1;
    else hero.wounds = Math.max(0, hero.wounds - 1);
    spent += 1;
  }
  return {
    ok: true,
    campaign: {
      ...campaign,
      heroes,
      questRuntimeState: {
        ...state,
        firewoodTokensRemaining: (state.firewoodTokensRemaining ?? 0) - 1,
        restingPointsRemaining: 0,
        restingPointsSpent: (state.restingPointsSpent ?? 0) + spent,
        counters: { ...state.counters, restingPointsSpent: (state.restingPointsSpent ?? 0) + spent },
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
