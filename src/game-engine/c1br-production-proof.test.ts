import { describe, expect } from 'vitest';
import type { CampaignState } from '../types';
import {
  ACCURACY_STONE_ID,
  CRITICAL_STONE_ID,
  PRODUCTION_PROOF_REGISTRY,
} from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { generateDungeon } from './dungeon';
import { initBattle } from './battle';
import { beginHeroSkillAction, resolveTrinketOpportunity } from './trinkets/battle-trinket-bridge';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { setRandomSource } from './random';
import {
  filterCommunityTrinketCandidates,
  runtimeContentContext,
} from '../data/content-selector';
import { COMMUNITY_RUNTIME_TRINKETS } from '../data/community-reference/production-runtime';

function registration(proofId: string) {
  const found = PRODUCTION_PROOF_REGISTRY[proofId];
  if (!found) throw new Error(`Missing proof registration: ${proofId}`);
  return found;
}

function battleWith(trinketId: string): CampaignState {
  let campaign = applyDefaultLoadout(selectParty(
    createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor'],
  ));
  campaign = acquireTrinket(campaign, {
    trinketId,
    source: 'nomad-wagon',
    sourceEventId: `proof-acquisition:${trinketId}`,
    heroId: campaign.heroes[0].instanceId,
  }).campaign;
  campaign = { ...campaign, currentQuestId: 'proof-quest', dungeon: generateDungeon('proof-quest') };
  const initialized = initBattle(campaign, 'A');
  const unit = initialized.battle!.heroes.find((entry) => entry.sourceId === initialized.heroes[0].instanceId)!;
  return {
    ...initialized,
    battle: {
      ...initialized.battle!, activeActorId: unit.id,
      initiativeIndex: initialized.battle!.initiativeOrder.indexOf(unit.id),
      currentActionPoints: 2, pendingMentalCheck: false, status: 'active',
    },
  };
}

function beginAtRoll(campaign: CampaignState, roll: number) {
  setRandomSource(() => (roll - 0.5) / 10);
  try {
    const unit = campaign.battle!.heroes.find((entry) => entry.id === campaign.battle!.activeActorId)!;
    const monster = campaign.battle!.monsters[0];
    return beginHeroSkillAction(campaign, unit.equippedSkillIds![0], monster.id);
  } finally {
    setRandomSource(null);
  }
}

describe('C1B-R2 executable production proofs', () => {
  productionProofTest(registration('C1BR-PA-ACCURACY-RUNTIME'), () => {
    const begun = beginAtRoll(battleWith(ACCURACY_STONE_ID), 9);
    expect(begun.paused).toBe(true);
    expect(begun.campaign.battle?.pendingAction?.attackRoll).toBe(9);
    expect(begun.campaign.pendingTrinketUseOpportunities[0].useWindow).toBe('after-attack-roll-before-hit-resolution');
    const resolved = resolveTrinketOpportunity(
      begun.campaign,
      begun.campaign.pendingTrinketUseOpportunities[0].id,
      'use',
    );
    expect(resolved.campaign.battle?.battleLog.some((entry) => entry.message.includes('命中 +1'))).toBe(true);
    expect(resolved.campaign.battle?.battleLog.some((entry) => entry.message.includes('掷 9 命中'))).toBe(true);
    expect(resolved.campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
  });

  productionProofTest(registration('C1BR-PA-CRITICAL-RUNTIME'), () => {
    const begun = beginAtRoll(battleWith(CRITICAL_STONE_ID), 8);
    expect(begun.paused).toBe(true);
    expect(begun.campaign.battle?.pendingAction?.attackRoll).toBe(8);
    expect(begun.campaign.pendingTrinketUseOpportunities[0].useWindow).toBe('after-attack-roll-before-hit-resolution');
    const resolved = resolveTrinketOpportunity(
      begun.campaign,
      begun.campaign.pendingTrinketUseOpportunities[0].id,
      'use',
    );
    expect(resolved.campaign.battle?.battleLog.some((entry) => entry.message.includes('暴击 +2'))).toBe(true);
    expect(resolved.campaign.battle?.battleLog.some((entry) => entry.message.includes('掷 8（暴击）'))).toBe(true);
    expect(resolved.campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
  });

  productionProofTest(registration('C1BR-CS-TRINKET-METADATA'), () => {
    const definitions = COMMUNITY_RUNTIME_TRINKETS.filter((entry) =>
      entry.id === ACCURACY_STONE_ID || entry.id === CRITICAL_STONE_ID,
    );
    expect(definitions).toHaveLength(2);
    for (const definition of definitions) {
      expect(definition.runtimeContentMetadata).toEqual({
        sourceDefinitionId: definition.id,
        contentSet: 'core',
        region: null,
        sourceOrigin: 'community-complete-edition',
      });
    }
    const context = runtimeContentContext(createNewCampaign('community-complete-edition'));
    expect(filterCommunityTrinketCandidates(definitions, context).map((entry) => entry.id).sort()).toEqual([
      ACCURACY_STONE_ID,
      CRITICAL_STONE_ID,
    ]);
    expect(filterCommunityTrinketCandidates(definitions, { ...context, enabledContentSets: [] })).toEqual([]);
  });

  for (const [proofId, trinketId, roll] of [
    ['C1BR-SAVE-ACCURACY-SIDE-REPLAY', ACCURACY_STONE_ID, 9],
    ['C1BR-SAVE-CRITICAL-SIDE-REPLAY', CRITICAL_STONE_ID, 8],
  ] as const) {
    productionProofTest(registration(proofId), () => {
      const begun = beginAtRoll(battleWith(trinketId), roll);
      const pausedReplay = restoreSaveSnapshot(createSaveSnapshot(begun.campaign));
      expect(pausedReplay.battle?.pendingAction?.attackRoll).toBe(roll);
      expect(pausedReplay.pendingTrinketUseOpportunities).toHaveLength(1);
      expect(pausedReplay.pendingTrinketUseOpportunities[0].trinketId).toBe(trinketId);
      const resolved = resolveTrinketOpportunity(
        pausedReplay,
        pausedReplay.pendingTrinketUseOpportunities[0].id,
        'use',
      ).campaign;
      const replayed = restoreSaveSnapshot(createSaveSnapshot(resolved));
      expect(replayed.heroes[0].equippedTrinkets[0].trinketId).toBe(trinketId);
      expect(replayed.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
    });
  }
});
