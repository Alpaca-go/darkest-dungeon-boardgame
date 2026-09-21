import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import { PRODUCTION_PROOF_REGISTRY } from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_RUNTIME_ADAPTERS,
  FAMILY_TRINKETS_ID,
  TAINTED_TRINKETS_ID,
} from '../data/community-reference/production-runtime';
import { getQuestPool, runtimeContentContext } from '../data/content-selector';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { commitQuestSelection } from './commands';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { finishQuest } from './quest-result';
import { interactWithQuestToken, QUEST_RULE_TRANSACTION_LIMIT } from './quests/quest-special-rule-runtime';

const PARTY = ['crusader', 'highwayman', 'vestal', 'plague-doctor'];
const registration = (id: string) => PRODUCTION_PROOF_REGISTRY[id];

function campaignAtLevel(level: 1 | 3): CampaignState {
  const base = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), PARTY));
  return { ...base, gamePhase: 'quest-select', campaignLevel: level, campaignProgress: { ...base.campaignProgress, campaignLevel: level } };
}

function selected(id: string): CampaignState {
  const result = commitQuestSelection(campaignAtLevel(id === TAINTED_TRINKETS_ID ? 3 : 1), id);
  if (!result.ok) throw new Error(result.error ?? 'selection failed');
  return result.campaign;
}

/** Positions the engine at its own persisted setup output; interaction remains a production command. */
function atToken(campaign: CampaignState, index: number): CampaignState {
  const token = campaign.questRuntimeState!.questTokens![index];
  return {
    ...campaign,
    dungeon: {
      ...campaign.dungeon!,
      currentRoomId: token.roomId,
      rooms: campaign.dungeon!.rooms.map((room) => room.id === token.roomId ? { ...room, status: 'cleared' as const } : room),
    },
  };
}

function consume(campaign: CampaignState, count: number): CampaignState {
  let next = campaign;
  for (let step = 0; step < count; step += 1) {
    const index = next.questRuntimeState!.questTokens!.findIndex((token) => token.status === 'available');
    const result = interactWithQuestToken(atToken(next, index));
    expect(result.ok).toBe(true);
    next = result.campaign;
  }
  return next;
}

describe.each([
  [TAINTED_TRINKETS_ID, 'TAINTED', ['QUEST_RULE_ROOM_SETUP', 'QUEST_RULE_QUEST_COMPLETION']],
  [FAMILY_TRINKETS_ID, 'FAMILY', ['QUEST_RULE_ROOM_SETUP', 'QUEST_RULE_TOKEN_INTERACTION', 'QUEST_RULE_QUEST_COMPLETION']],
] as const)('C1C-3 %s', (questId, label, primitives) => {
  productionProofTest(registration(`C1C3-${label}-RUNTIME`), () => {
    const campaign = selected(questId);
    const adapter = COMMUNITY_QUEST_RUNTIME_ADAPTERS[questId];
    expect(adapter.requiredPrimitives).toEqual(expect.arrayContaining([...primitives]));
    expect(adapter.specialRules.every((rule) => rule.sourceReferences.some((ref) => ref !== 'manual')
      && rule.printedSpecialRuleIndex === 0)).toBe(true);
    expect(campaign.questRuntimeState?.roomSetup?.selectedRoomIds).toHaveLength(3);
    expect(campaign.questRuntimeState?.questTokens).toHaveLength(3);
    const partial = consume(campaign, 2);
    expect(partial.dungeon?.objectiveComplete).toBe(false);
    expect(finishQuest(partial, 'left').lastQuestResult?.outcome).toBe('incomplete');
    const complete = consume(partial, 1);
    expect(complete.dungeon?.objectiveComplete).toBe(true);
    expect(finishQuest(complete, 'left').lastQuestResult).toMatchObject({ outcome: 'completed', xpPerHero: 3 });
    expect((complete.questRuntimeState?.processedRuleTransactionIds ?? []).length).toBeLessThanOrEqual(QUEST_RULE_TRANSACTION_LIMIT);
  });

  productionProofTest(registration(`C1C3-${label}-SAVE-REPLAY`), () => {
    const setup = selected(questId);
    const afterOne = consume(setup, 1);
    const restored = restoreSaveSnapshot(createSaveSnapshot(afterOne));
    expect(restored.questRuntimeState).toEqual(afterOne.questRuntimeState);
    const duplicate = interactWithQuestToken(atToken(restored, 0));
    expect(duplicate).toMatchObject({ ok: false, error: 'already-consumed' });
    const complete = consume(restored, 2);
    const completedReload = restoreSaveSnapshot(createSaveSnapshot(complete));
    expect(completedReload.dungeon?.objectiveComplete).toBe(true);
    expect(interactWithQuestToken(atToken(completedReload, 0))).toMatchObject({ ok: false, error: 'already-complete' });
  });

  productionProofTest(registration(`C1C3-${label}-SELECTOR`), () => {
    const level = questId === TAINTED_TRINKETS_ID ? 3 : 1;
    const region = questId === TAINTED_TRINKETS_ID ? 'cove' : 'warrens';
    const pool = getQuestPool({ ...runtimeContentContext(campaignAtLevel(level)), campaignLevel: level, enabledRegions: [region] });
    expect(pool.map((quest) => quest.id)).toContain(questId);
    expect(COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === questId)).toMatchObject({ productionReady: true });
  });
});

it('fails closed before room clear and uses deterministic setup transactions', () => {
  const first = selected(FAMILY_TRINKETS_ID);
  const second = selected(FAMILY_TRINKETS_ID);
  expect(first.questRuntimeState?.roomSetup?.tokenPlacement.map((entry) => entry.roomId))
    .toEqual(second.questRuntimeState?.roomSetup?.tokenPlacement.map((entry) => entry.roomId));
  const token = first.questRuntimeState!.questTokens![0];
  const blocked = {
    ...first,
    dungeon: { ...first.dungeon!, currentRoomId: token.roomId },
  };
  expect(interactWithQuestToken(blocked)).toMatchObject({ ok: false, error: 'room-condition-invalid' });
});
