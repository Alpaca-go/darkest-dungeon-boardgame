import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import {
  DARK_BRACER_ID, PRODUCTION_PROOF_REGISTRY, SOLAR_BRACER_ID,
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
  COMMUNITY_RUNTIME_TRINKETS, COMMUNITY_TRINKET_RUNTIME_ADAPTERS,
} from '../data/community-reference/production-runtime';
import { filterCommunityTrinketCandidates, runtimeContentContext } from '../data/content-selector';

function registration(proofId: string) {
  const found = PRODUCTION_PROOF_REGISTRY[proofId];
  if (!found) throw new Error(`Missing proof registration: ${proofId}`);
  return found;
}

function attackBattle(trinketId: string, side: 'positive' | 'negative', light: number): CampaignState {
  let campaign = applyDefaultLoadout(selectParty(
    createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor'],
  ));
  campaign = acquireTrinket(campaign, {
    trinketId, source: 'nomad-wagon', sourceEventId: `c1c6:${trinketId}:${side}`,
    heroId: campaign.heroes[0].instanceId,
  }).campaign;
  campaign = {
    ...campaign,
    heroes: campaign.heroes.map((hero, index) => index === 0
      ? { ...hero, equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: side })) }
      : hero),
    currentQuestId: 'c1c6-proof', dungeon: generateDungeon('c1c6-proof'), light,
  };
  const initialized = initBattle(campaign, 'A');
  const actor = initialized.battle!.heroes.find((unit) => unit.sourceId === initialized.heroes[0].instanceId)!;
  return {
    ...initialized,
    battle: {
      ...initialized.battle!, light, activeActorId: actor.id,
      initiativeIndex: initialized.battle!.initiativeOrder.indexOf(actor.id),
      currentActionPoints: 2, pendingMentalCheck: false, status: 'active',
      monsters: initialized.battle!.monsters.map((monster) => ({ ...monster, hp: 99, maxHp: 99, isAlive: true })),
    },
  };
}

function begin(campaign: CampaignState, roll: number, damageRandom = 0.5, skillId = 'crusader-smite') {
  const values = [(roll - 0.5) / 10, damageRandom];
  setRandomSource(() => values.shift() ?? 0.99);
  try {
    return beginHeroSkillAction(campaign, skillId, campaign.battle!.monsters[0].id);
  } finally {
    setRandomSource(null);
  }
}

describe('C1C-6 Dark and Solar Bracer staged attack resolution', () => {
  for (const [label, trinketId, positiveLight, negativeLight] of [
    ['DARK', DARK_BRACER_ID, 3, 3],
    ['SOLAR', SOLAR_BRACER_ID, 3, 3],
  ] as const) {
    productionProofTest(registration(`C1C6-${label}-BRACER-RUNTIME`), () => {
      const positive = begin(attackBattle(trinketId, 'positive', positiveLight), 8);
      expect(positive.paused).toBe(true);
      expect(positive.campaign.battle?.pendingAction?.stage).toBe('post-roll-window');
      const usedPositive = resolveTrinketOpportunity(
        positive.campaign, positive.campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!.id, 'use',
      ).campaign;
      expect(usedPositive.battle?.battleLog.some((entry) => entry.message.includes('掷 8（暴击）'))).toBe(true);
      expect(usedPositive.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
      expect(usedPositive.battle?.pendingAction).toBeNull();

      const negative = begin(attackBattle(trinketId, 'negative', negativeLight), 5, 0.75, 'crusader-holy-lance');
      expect(negative.paused).toBe(true);
      expect(negative.campaign.battle?.pendingAction).toMatchObject({
        stage: 'pre-damage-window', hit: true, crit: false,
      });
      expect(negative.campaign.battle?.pendingAction?.baseDamage).toBeGreaterThan(0);
      const targetBefore = negative.campaign.battle!.monsters[0];
      const usedNegative = resolveTrinketOpportunity(
        negative.campaign, negative.campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!.id, 'use',
      ).campaign;
      const targetAfter = usedNegative.battle!.monsters[0];
      expect(targetAfter.hp).toBe(targetBefore.hp);
      expect(targetAfter.bleed).toBeGreaterThan(0); // hit remains true; on-hit effects survive zero damage
      expect(usedNegative.battle?.battleLog.some((entry) => entry.message.includes('造成 0 伤害'))).toBe(true);
    });

    productionProofTest(registration(`C1C6-${label}-BRACER-SAVE-REPLAY`), () => {
      const begun = begin(attackBattle(trinketId, 'negative', negativeLight), 5, 0, 'crusader-holy-lance');
      const frozenDamage = begun.campaign.battle!.pendingAction!.baseDamage;
      const replay = restoreSaveSnapshot(createSaveSnapshot(begun.campaign));
      expect(replay.battle?.pendingAction?.baseDamage).toBe(frozenDamage);
      setRandomSource(() => 0.99);
      let resolved: CampaignState;
      try {
        resolved = resolveTrinketOpportunity(
          replay, replay.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!.id, 'decline',
        ).campaign;
      } finally {
        setRandomSource(null);
      }
      expect(resolved.battle?.battleLog.some((entry) => entry.message.includes(`造成 ${frozenDamage} 伤害`))).toBe(true);
      const stale = resolveTrinketOpportunity(resolved, replay.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!.id, 'use');
      expect(stale.error).not.toBeNull();
      expect(stale.campaign).toBe(resolved);
    });

    productionProofTest(registration(`C1C6-${label}-BRACER-SELECTOR`), () => {
      const definition = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[trinketId].definition;
      expect(definition.positiveSide.useWindows).toEqual(['after-attack-roll-before-hit-resolution']);
      expect(definition.negativeSide.modifiers).toEqual([{ type: 'damage', operation: 'set', amount: 0 }]);
      const context = runtimeContentContext(createNewCampaign('community-complete-edition'));
      expect(filterCommunityTrinketCandidates(COMMUNITY_RUNTIME_TRINKETS, context).some((entry) => entry.id === trinketId)).toBe(true);
    });
  }

  it('does not open the hit window for a miss and does open it for a crit or native zero damage', () => {
    const miss = begin(attackBattle(DARK_BRACER_ID, 'negative', 4), 9);
    expect(miss.paused).toBe(false);
    expect(miss.campaign.pendingTrinketUseOpportunities.some((entry) => entry.status === 'open')).toBe(false);

    const crit = begin(attackBattle(DARK_BRACER_ID, 'negative', 4), 10);
    expect(crit.campaign.battle?.pendingAction).toMatchObject({ stage: 'pre-damage-window', hit: true, crit: true });

    const nativeZero = {
      ...crit.campaign,
      battle: { ...crit.campaign.battle!, pendingAction: { ...crit.campaign.battle!.pendingAction!, baseDamage: 0 } },
    };
    expect(nativeZero.pendingTrinketUseOpportunities.some((entry) => entry.status === 'open')).toBe(true);
  });

  it.each([
    [DARK_BRACER_ID, 'positive', 4, false], [DARK_BRACER_ID, 'negative', 2, false],
    [SOLAR_BRACER_ID, 'positive', 2, false], [SOLAR_BRACER_ID, 'negative', 4, false],
  ] as const)('rejects wrong light for %s %s', (trinketId, side, light, expectedPaused) => {
    const result = begin(attackBattle(trinketId, side, light), side === 'positive' ? 8 : 5);
    expect(result.paused).toBe(expectedPaused);
  });

  it.each([0, 2, 3, 4, 6])('uses inclusive mirrored light predicates at light %i', (light) => {
    const darkPositive = begin(attackBattle(DARK_BRACER_ID, 'positive', light), 8);
    const solarPositive = begin(attackBattle(SOLAR_BRACER_ID, 'positive', light), 8);
    expect(darkPositive.paused).toBe(light <= 3);
    expect(solarPositive.paused).toBe(light >= 3);
    const darkNegative = begin(attackBattle(DARK_BRACER_ID, 'negative', light), 5);
    const solarNegative = begin(attackBattle(SOLAR_BRACER_ID, 'negative', light), 5);
    expect(darkNegative.paused).toBe(light >= 3);
    expect(solarNegative.paused).toBe(light <= 3);
  });
});
