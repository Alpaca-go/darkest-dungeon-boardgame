import type { CampaignState } from '../types';
import { COMMUNITY_QUEST_RUNTIME_ADAPTERS } from '../data/community-reference/production-runtime';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../game-engine/campaign';
import { generateDungeonForQuest, moveToRoom, scoutDungeon } from '../game-engine/dungeon';
import { createQuestRuntimeState } from '../game-engine/quests/quest-runtime';
import { createSaveSnapshot, type SaveFile } from '../game-engine/save';
import { setRandomSource } from '../game-engine/random';

const QUEST_ID = 'community-quest-ruins-lvl1-scout-ahead';

/**
 * A schema-valid Production save fixture. Recoverable Stress and the cleared Room are produced
 * through the real Scout and movement commands; no Hero or Rest runtime field is injected.
 */
export function createC1C1R3RestE2ESave(): SaveFile {
  const base = applyDefaultLoadout(selectParty(
    createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'hellion'],
  ));
  const quest = COMMUNITY_QUEST_RUNTIME_ADAPTERS[QUEST_ID].definition;
  let campaign: CampaignState = {
    ...base,
    currentQuestId: QUEST_ID,
    questStatus: 'active',
    gamePhase: 'dungeon-explore',
    dungeon: generateDungeonForQuest(quest),
    questRuntimeState: createQuestRuntimeState(quest),
  };
  setRandomSource(() => 0.9);
  try {
    campaign = scoutDungeon(campaign);
    campaign = moveToRoom(campaign, 'A');
    campaign = scoutDungeon(campaign);
  } finally {
    setRandomSource(null);
  }
  return createSaveSnapshot(campaign);
}
