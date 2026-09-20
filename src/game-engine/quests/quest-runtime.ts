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
