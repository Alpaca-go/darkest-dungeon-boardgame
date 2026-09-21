import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import {
  C1C2_ADAPTER_ONLY_QUEST_IDS,
  C1C2_SPECIAL_RULE_QUEST_IDS,
  PRODUCTION_PROOF_REGISTRY,
} from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_RUNTIME_ADAPTERS,
  COMMUNITY_RUNTIME_QUESTS,
} from '../data/community-reference/production-runtime';
import { getQuestPool, runtimeContentContext } from '../data/content-selector';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { commitQuestSelection, enterDungeonRoom } from './commands';
import { commitBattleRetreat } from './commands/battle';
import { applyQuestRuleEffects, evaluateQuestRules } from './quests/quest-special-rule-runtime';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { finishQuest } from './quest-result';

const QUEST_ID = C1C2_SPECIAL_RULE_QUEST_IDS[0];
const PARTY = ['crusader', 'highwayman', 'vestal', 'plague-doctor'];
const registration = (id: string) => PRODUCTION_PROOF_REGISTRY[id];

function levelThreeCampaign(): CampaignState {
  const base = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), PARTY));
  return {
    ...base,
    campaignLevel: 3,
    campaignProgress: { ...base.campaignProgress, campaignLevel: 3 },
  };
}

function selectedCampaign(): CampaignState {
  const result = commitQuestSelection(levelThreeCampaign(), QUEST_ID);
  if (!result.ok) throw new Error(result.error ?? 'selection failed');
  return result.campaign;
}

describe('C1C-2 adapter-only Quest review', () => {
  productionProofTest(registration('C1C2-ADAPTER-RUNTIME'), () => {
    for (const id of C1C2_ADAPTER_ONLY_QUEST_IDS) {
      const adapter = COMMUNITY_QUEST_RUNTIME_ADAPTERS[id];
      const capability = COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === id)!;
      expect(adapter.questDefinitionId).toBe(id);
      expect(adapter.specialRules).toEqual([]);
      expect(adapter.definition.runtimeContentMetadata).toMatchObject({ contentSet: 'crimson-court', region: 'crimson-court' });
      expect(capability.adapterComplete).toBe(true);
      expect(capability.semanticComplete).toBe(false);
      expect(capability.productionReady).toBe(false);
    }
  });

  productionProofTest(registration('C1C2-ADAPTER-SAVE-REPLAY'), () => {
    for (const id of C1C2_ADAPTER_ONLY_QUEST_IDS) {
      const adapter = COMMUNITY_QUEST_RUNTIME_ADAPTERS[id];
      const state = adapter.setup({
        definitionId: id, questInstanceId: `${id}:proof`, counters: {}, flags: {},
        selectedRoomIds: [], setAsideRoomIds: [], processedRuleTransactionIds: [], pendingRuleChoice: null,
      });
      expect(structuredClone(state)).toEqual(state);
    }
  });

  productionProofTest(registration('C1C2-ADAPTER-SELECTOR'), () => {
    const context = runtimeContentContext(levelThreeCampaign());
    expect(getQuestPool({ ...context, enabledContentSets: ['crimson-court'], enabledRegions: ['crimson-court'] }))
      .toEqual([]);
  });
});

describe('C1C-2 typed provision special rule', () => {
  productionProofTest(registration('C1C2-SPECIAL-RULE-RUNTIME'), () => {
    const adapter = COMMUNITY_QUEST_RUNTIME_ADAPTERS[QUEST_ID];
    expect(adapter.specialRules).toEqual([expect.objectContaining({
      id: 'deep-in-the-warrens-discard-after-leave', trigger: 'leave-room',
      effects: [{ type: 'discard-chosen-provision', amount: 1 }],
    })]);
    let campaign = selectedCampaign();
    const moved = enterDungeonRoom(campaign, 'A');
    expect(moved.ok).toBe(true);
    campaign = moved.campaign;
    const beforeFood = campaign.provisions.food;
    const pending = campaign.questRuntimeState?.pendingRuleChoice;
    expect(pending?.transactionId).toContain('deep-in-the-warrens-discard-after-leave');
    const applied = applyQuestRuleEffects(campaign, pending!.transactionId, 'food');
    expect(applied.ok).toBe(true);
    expect(applied.campaign.provisions.food).toBe(beforeFood - 1);
    expect(applied.campaign.questRuntimeState).toMatchObject({
      pendingRuleChoice: null,
      counters: { provisionsDiscardedByQuestRules: 1 },
    });
  });

  productionProofTest(registration('C1C2-SPECIAL-RULE-SAVE-REPLAY'), () => {
    const initial = selectedCampaign();
    expect(initial.questRuntimeState?.pendingRuleChoice).toBeNull();
    const moved = enterDungeonRoom(initial, 'A').campaign;
    const beforeEffect = restoreSaveSnapshot(createSaveSnapshot(moved));
    expect(beforeEffect.questRuntimeState?.pendingRuleChoice).toEqual(moved.questRuntimeState?.pendingRuleChoice);
    const transactionId = beforeEffect.questRuntimeState!.pendingRuleChoice!.transactionId;
    const committed = applyQuestRuleEffects(beforeEffect, transactionId, 'torch').campaign;
    const afterEffect = restoreSaveSnapshot(createSaveSnapshot(committed));
    expect(afterEffect.questRuntimeState).toEqual(committed.questRuntimeState);
    expect(afterEffect.provisions).toEqual(committed.provisions);
    const duplicateTrigger = evaluateQuestRules(afterEffect, { trigger: 'leave-room', triggerInstanceId: 'start->A' });
    expect(duplicateTrigger).toEqual(afterEffect);
    const completed = finishQuest(afterEffect, 'left');
    expect(restoreSaveSnapshot(createSaveSnapshot(completed)).questRuntimeState).toEqual(completed.questRuntimeState);
  });

  productionProofTest(registration('C1C2-SPECIAL-RULE-SELECTOR'), () => {
    const context = runtimeContentContext(levelThreeCampaign());
    const pool = getQuestPool({ ...context, campaignLevel: 3, enabledRegions: ['warrens'] });
    expect(pool.map((quest) => quest.id)).toContain(QUEST_ID);
    expect(COMMUNITY_RUNTIME_QUESTS.find((quest) => quest.id === QUEST_ID)).toBeDefined();
  });

  it('fails closed for wrong transactions, empty provisions, and movement before resolution', () => {
    const moved = enterDungeonRoom(selectedCampaign(), 'A').campaign;
    expect(applyQuestRuleEffects(moved, 'wrong', 'food')).toMatchObject({ ok: false, error: 'wrong-transaction' });
    expect(enterDungeonRoom(moved, 'B')).toMatchObject({ ok: false, error: 'pending-quest-rule-choice' });
    const empty = { ...moved, provisions: { food: 0, bandage: 0, potion: 0, torch: 0, tool: 0 } };
    expect(applyQuestRuleEffects(empty, moved.questRuntimeState!.pendingRuleChoice!.transactionId, 'food'))
      .toMatchObject({ ok: false, error: 'insufficient-provision' });
  });

  it('returns a round-limit defeat to dungeon through the production retreat command', () => {
    const battleCampaign = enterDungeonRoom(selectedCampaign(), 'A').campaign;
    const defeated = { ...battleCampaign, battle: { ...battleCampaign.battle!, status: 'defeat' as const } };
    const result = commitBattleRetreat(defeated);
    expect(result.ok).toBe(true);
    expect(result.campaign).toMatchObject({ gamePhase: 'dungeon-explore', battle: null });
  });
});
