import type { CampaignState } from '../types';
import { applyDefaultLoadout, createNewCampaign, selectParty, selectQuest } from '../game-engine/campaign';
import { COMMUNITY_QUEST_RUNTIME_ADAPTERS } from '../data/community-reference/production-runtime';

export function selectedCampaign(id: string): CampaignState {
  const definition = COMMUNITY_QUEST_RUNTIME_ADAPTERS[id].definition;
  const base = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  return selectQuest({ ...base, gamePhase: 'quest-select',
    enabledContentSets: ['core', 'crimson-court'],
    enabledRegions: ['ruins', 'warrens', 'crimson-court'],
    campaignProgress: { ...base.campaignProgress, campaignLevel: definition.dungeonLevel as 1 | 2 | 3 },
  }, id);
}

export function restCampaign(id = 'community-quest-ruins-lvl1-scout-ahead', budget?: number, capacity = 10): CampaignState {
  const selected = selectedCampaign(id);
  return { ...selected,
    dungeon: { ...selected.dungeon!, rooms: selected.dungeon!.rooms.map(r =>
      r.id === selected.dungeon!.currentRoomId ? { ...r, status: 'cleared' } : r) },
    heroes: selected.heroes.map((h, i) => ({ ...h, wounds: 0, stress: i === 0 ? capacity : 0 })),
    questRuntimeState: { ...selected.questRuntimeState!,
      restingPointsRemaining: budget ?? selected.questRuntimeState!.restingPointsRemaining },
  };
}

export function gameplay(c: CampaignState) {
  return { currentQuestId: c.currentQuestId, questStatus: c.questStatus, gamePhase: c.gamePhase,
    dungeon: c.dungeon, questRuntimeState: c.questRuntimeState, heroes: c.heroes };
}
