import { describe, expect } from 'vitest';
import type { CampaignState } from '../types';
import { FORTUNATE_ARMLET_ID, PRODUCTION_PROOF_REGISTRY } from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { generateDungeon } from './dungeon';
import { initBattle } from './battle';
import { beginHeroSkillAction, resolveTrinketOpportunity } from './trinkets/battle-trinket-bridge';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { setRandomSource } from './random';
import { COMMUNITY_IMPLEMENTED_TRINKETS, COMMUNITY_RUNTIME_TRINKETS } from '../data/community-reference/production-runtime';

function registration(proofId: string) {
  const found = PRODUCTION_PROOF_REGISTRY[proofId];
  if (!found) throw new Error(`Missing proof registration: ${proofId}`);
  return found;
}

function battleWithFortunate(): CampaignState {
  let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  campaign = acquireTrinket(campaign, {
    trinketId: FORTUNATE_ARMLET_ID, source: 'nomad-wagon',
    sourceEventId: 'c1c7-fortunate-positive', heroId: campaign.heroes[0].instanceId,
  }).campaign;
  campaign = { ...campaign, currentQuestId: 'c1c7-proof-quest', dungeon: generateDungeon('c1c7-proof-quest') };
  const initialized = initBattle(campaign, 'A');
  const unit = initialized.battle!.heroes.find((entry) => entry.sourceId === initialized.heroes[0].instanceId)!;
  return { ...initialized, battle: { ...initialized.battle!, activeActorId: unit.id,
    initiativeIndex: initialized.battle!.initiativeOrder.indexOf(unit.id), currentActionPoints: 2,
    pendingMentalCheck: false, status: 'active' } };
}

function beginAtRoll(roll: number) {
  const campaign = battleWithFortunate();
  setRandomSource(() => (roll - 0.5) / 10);
  try {
    const unit = campaign.battle!.heroes.find((entry) => entry.id === campaign.battle!.activeActorId)!;
    return beginHeroSkillAction(campaign, unit.equippedSkillIds![0], campaign.battle!.monsters[0].id);
  } finally { setRandomSource(null); }
}

describe('C1C-7 Fortunate Armlet positive slice', () => {
  productionProofTest(registration('C1C7-FORTUNATE-POSITIVE-RUNTIME'), () => {
    const missBoundary = beginAtRoll(9);
    const resolvedHit = resolveTrinketOpportunity(missBoundary.campaign,
      missBoundary.campaign.pendingTrinketUseOpportunities[0].id, 'use').campaign;
    expect(resolvedHit.battle?.battleLog.some((entry) => entry.message.includes('命中 +1'))).toBe(true);
    expect(resolvedHit.battle?.battleLog.some((entry) => entry.message.includes('暴击 +1'))).toBe(true);
    expect(resolvedHit.battle?.battleLog.some((entry) => entry.message.includes('掷 9（暴击） 命中'))).toBe(true);
    expect(resolvedHit.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
  });

  productionProofTest(registration('C1C7-FORTUNATE-POSITIVE-SAVE-REPLAY'), () => {
    const begun = beginAtRoll(9);
    const replay = restoreSaveSnapshot(createSaveSnapshot(begun.campaign));
    expect(replay.pendingTrinketUseOpportunities[0].trinketId).toBe(FORTUNATE_ARMLET_ID);
    const used = resolveTrinketOpportunity(replay, replay.pendingTrinketUseOpportunities[0].id, 'use').campaign;
    const completedReplay = restoreSaveSnapshot(createSaveSnapshot(used));
    expect(completedReplay.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
  });

  productionProofTest(registration('C1C7-FORTUNATE-POSITIVE-SELECTOR'), () => {
    const definition = COMMUNITY_IMPLEMENTED_TRINKETS.find((entry) => entry.id === FORTUNATE_ARMLET_ID);
    expect(definition?.runtimeContentMetadata?.sourceDefinitionId).toBe(FORTUNATE_ARMLET_ID);
    expect(COMMUNITY_RUNTIME_TRINKETS.some((entry) => entry.id === FORTUNATE_ARMLET_ID)).toBe(false);
  });
});
