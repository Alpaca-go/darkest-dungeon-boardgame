import { describe, expect, it } from 'vitest';
import { PRODUCTION_PROOF_REGISTRY } from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import {
  COMMUNITY_QUEST_CAPABILITIES,
  COMMUNITY_QUEST_RUNTIME_ADAPTERS,
  FAMILY_TRINKETS_ID,
  TAINTED_TRINKETS_ID,
} from '../data/community-reference/production-runtime';
import { getQuestPool, runtimeContentContext } from '../data/content-selector';
import { createNewCampaign } from './campaign';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { createQuestRuntimeState } from './quests/quest-runtime';

const registration = (id: string) => PRODUCTION_PROOF_REGISTRY[id];

function campaignAtLevel(level: 1 | 3) {
  const base = createNewCampaign('community-complete-edition');
  return { ...base, gamePhase: 'quest-select' as const, campaignLevel: level, campaignProgress: { ...base.campaignProgress, campaignLevel: level } };
}

describe.each([
  [TAINTED_TRINKETS_ID, 'TAINTED', ['QUEST_RULE_ROOM_SETUP', 'QUEST_RULE_QUEST_COMPLETION']],
  [FAMILY_TRINKETS_ID, 'FAMILY', ['QUEST_RULE_ROOM_SETUP', 'QUEST_RULE_TOKEN_INTERACTION', 'QUEST_RULE_QUEST_COMPLETION']],
] as const)('C1C-3 %s', (questId, label, primitives) => {
  productionProofTest(registration(`C1C3-${label}-RUNTIME`), () => {
    const adapter = COMMUNITY_QUEST_RUNTIME_ADAPTERS[questId];
    expect(adapter.requiredPrimitives).toEqual(expect.arrayContaining([...primitives]));
    expect(adapter.specialRules.every((rule) => rule.sourceReferences.some((ref) => ref !== 'manual')
      && rule.printedSpecialRuleIndex === 0)).toBe(true);
    expect(adapter.specialRules.length).toBeGreaterThan(0);
  });

  productionProofTest(registration(`C1C3-${label}-SAVE-REPLAY`), () => {
    const adapter = COMMUNITY_QUEST_RUNTIME_ADAPTERS[questId];
    const base = campaignAtLevel(questId === TAINTED_TRINKETS_ID ? 3 : 1);
    const fixture = {
      ...base,
      currentQuestId: questId,
      questStatus: 'active' as const,
      questRuntimeState: createQuestRuntimeState(adapter.definition),
    };
    const restored = restoreSaveSnapshot(createSaveSnapshot(fixture));
    expect(restored.questRuntimeState).toEqual(fixture.questRuntimeState);
  });

  productionProofTest(registration(`C1C3-${label}-SELECTOR`), () => {
    const level = questId === TAINTED_TRINKETS_ID ? 3 : 1;
    const region = questId === TAINTED_TRINKETS_ID ? 'cove' : 'warrens';
    const pool = getQuestPool({ ...runtimeContentContext(campaignAtLevel(level)), campaignLevel: level, enabledRegions: [region] });
    expect(pool.map((quest) => quest.id)).not.toContain(questId);
    expect(COMMUNITY_QUEST_CAPABILITIES.find((entry) => entry.definitionId === questId)).toMatchObject({
      sourceSemanticComplete: true,
      runtimeSemanticComplete: false,
      productionUiProofComplete: false,
      productionReady: false,
    });
  });
});

it('keeps the partial bindings deterministic while the production gate fails closed', () => {
  const rules = COMMUNITY_QUEST_RUNTIME_ADAPTERS[FAMILY_TRINKETS_ID].specialRules;
  expect(new Set(rules.map((rule) => rule.id)).size).toBe(rules.length);
  expect(rules.map((rule) => rule.trigger)).toEqual(['quest-start', 'token-interacted', 'quest-completed']);
});
