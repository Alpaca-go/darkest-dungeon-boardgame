import { afterEach, describe, expect, it } from 'vitest';
import type { CampaignState, Stance } from '../types';
import { LEVEL3_STANCE_RING_SPECS, PRODUCTION_PROOF_REGISTRY } from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { generateDungeon } from './dungeon';
import { initBattle, prepareHeroAttackResolution } from './battle';
import { beginHeroSkillAction, resolveTrinketOpportunity } from './trinkets/battle-trinket-bridge';
import { currentRuntimeStance, openTrinketWindow } from './trinkets/trinket-opportunities';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { setRandomSource } from './random';
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../data/community-reference/production-runtime';
import source from '../data/community-reference/trinkets/data.json' with { type: 'json' };
import { compareTrinketSemanticPayload } from '../audit/trinket-semantic-coverage';

const stances: Stance[] = ['aggressive', 'defensive', 'ranged', 'support'];

function fixture(id: string, side: 'positive' | 'negative', stance: Stance, blocker = false): CampaignState {
  let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  const heroId = campaign.heroes[0].instanceId;
  campaign = { ...campaign, heroes: campaign.heroes.map((hero) => hero.instanceId === heroId
    ? { ...hero, level: 2 as const, stance: 'aggressive' as const } : hero) };
  for (const trinketId of [id, ...(blocker ? ['community-trinket-core-critical-stone'] : [])]) {
    campaign = acquireTrinket(campaign, { trinketId, source: 'debug', sourceEventId: `c1c15:${trinketId}`,
      heroId }).campaign;
  }
  campaign = { ...campaign, heroes: campaign.heroes.map((hero) => hero.instanceId === heroId ? {
    ...hero, equippedTrinkets: hero.equippedTrinkets.map((card) => card.trinketId === id ? { ...card, currentSide: side } : card),
  } : hero), currentQuestId: 'c1c15-proof', dungeon: generateDungeon('c1c15-proof') };
  campaign = initBattle(campaign, 'A');
  const actor = campaign.battle!.heroes.find((unit) => unit.sourceId === heroId)!;
  return { ...campaign, battle: { ...campaign.battle!,
    heroes: campaign.battle!.heroes.map((unit) => unit.id === actor.id ? { ...unit, stance } : unit),
    activeActorId: actor.id, initiativeIndex: campaign.battle!.initiativeOrder.indexOf(actor.id),
    currentActionPoints: 2, pendingMentalCheck: false, status: 'active',
    monsters: campaign.battle!.monsters.map((monster) => ({ ...monster, hp: 99, maxHp: 99, isAlive: true })),
  } };
}

function begin(campaign: CampaignState, roll: number) {
  setRandomSource(() => (roll - 0.5) / 10);
  try { return beginHeroSkillAction(campaign, 'crusader-smite', campaign.battle!.monsters[0].id); }
  finally { setRandomSource(null); }
}
function ringOpportunity(campaign: CampaignState, id: string) {
  return campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open' && entry.trinketId === id);
}
afterEach(() => setRandomSource(null));

describe('C1C15 Level 3 stance ring family', () => {
  for (const ring of LEVEL3_STANCE_RING_SPECS) {
    productionProofTest(PRODUCTION_PROOF_REGISTRY[`C1C15-${ring.key}-RING-RUNTIME`], () => {
      const positiveFixture = fixture(ring.definitionId, 'positive', ring.stance);
      expect(prepareHeroAttackResolution(positiveFixture.battle!, positiveFixture.battle!.activeActorId!, 'crusader-smite',
        { accuracy: 0, crit: 0, damage: 0, healing: 0 }, 8)).toMatchObject({ hit: true, crit: false });
      const positive = begin(positiveFixture, 8);
      expect(positive.paused).toBe(true);
      expect(positive.campaign.battle?.pendingAction).toMatchObject({ stage: 'post-roll-window', attackRoll: 8 });
      const physicalId = positive.campaign.heroes[0].equippedTrinkets[0].instanceId;
      setRandomSource(() => { throw new Error('Critical must not reroll'); });
      const used = resolveTrinketOpportunity(positive.campaign, ringOpportunity(positive.campaign, ring.definitionId)!.id, 'use');
      expect(used.error).toBeNull();
      expect(used.campaign.battle?.battleLog.some((entry) => entry.message.includes('掷 8（暴击） 命中'))).toBe(true);
      expect(used.campaign.heroes[0].equippedTrinkets[0]).toMatchObject({ instanceId: physicalId, currentSide: 'negative' });

      setRandomSource(null);
      const negativeFixture = fixture(ring.definitionId, 'negative', stances.find((stance) => stance !== ring.stance)!);
      expect(prepareHeroAttackResolution(negativeFixture.battle!, negativeFixture.battle!.activeActorId!, 'crusader-smite',
        { accuracy: 0, crit: 0, damage: 0, healing: 0 }, 7)).toMatchObject({ hit: true, crit: false });
      const negative = begin(negativeFixture, 7);
      expect(negative.paused).toBe(true);
      setRandomSource(() => { throw new Error('Miss must not reroll'); });
      const missed = resolveTrinketOpportunity(negative.campaign, ringOpportunity(negative.campaign, ring.definitionId)!.id, 'use');
      expect(missed.error).toBeNull();
      expect(missed.campaign.battle?.battleLog.some((entry) => entry.message.includes('掷 7 未命中'))).toBe(true);
      expect(missed.campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
    });

    productionProofTest(PRODUCTION_PROOF_REGISTRY[`C1C15-${ring.key}-RING-SAVE-REPLAY`], () => {
      for (const [side, stance, roll, bonus] of [
        ['positive', ring.stance, 8, 'critBonus'],
        ['negative', stances.find((value) => value !== ring.stance)!, 7, 'accuracyBonus'],
      ] as const) {
        const begun = begin(fixture(ring.definitionId, side, stance, true), roll).campaign;
        const ringUse = ringOpportunity(begun, ring.definitionId)!;
        const physicalId = ringUse.trinketInstanceId;
        const before = restoreSaveSnapshot(createSaveSnapshot(begun));
        expect(before.battle?.pendingAction?.attackRoll).toBe(roll);
        expect(before.battle?.heroes.find((unit) => unit.sourceId === before.heroes[0].instanceId)?.stance).toBe(stance);
        expect(ringOpportunity(before, ring.definitionId)?.trinketInstanceId).toBe(physicalId);
        const used = resolveTrinketOpportunity(before, ringOpportunity(before, ring.definitionId)!.id, 'use').campaign;
        expect(used.battle?.pendingAction?.[bonus]).toBe(side === 'positive' ? 4 : -2);
        expect(used.heroes[0].equippedTrinkets[0].instanceId).toBe(physicalId);
        expect(used.heroes[0].equippedTrinkets[0].currentSide).toBe(side === 'positive' ? 'negative' : 'positive');
        const after = restoreSaveSnapshot(createSaveSnapshot(used));
        expect(after.battle?.pendingAction?.[bonus]).toBe(side === 'positive' ? 4 : -2);
        expect(after.processedTrinketEventIds).toEqual(used.processedTrinketEventIds);
        expect(after.trinketUseRecords).toEqual(used.trinketUseRecords);
        expect(resolveTrinketOpportunity(after, ringUse.id, 'use').error).not.toBeNull();
        const blockerOpportunity = after.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
        const finished = resolveTrinketOpportunity(after, blockerOpportunity.id, 'decline').campaign;
        expect(finished.battle?.pendingAction).toBeNull();
        expect(finished.battle?.battleLog.filter((entry) => entry.message.includes(`使用 Smite，掷 ${roll}`))).toHaveLength(1);
      }
    });

    productionProofTest(PRODUCTION_PROOF_REGISTRY[`C1C15-${ring.key}-RING-SELECTOR`], () => {
      const capability = COMMUNITY_TRINKET_CAPABILITIES.find((entry) => entry.definitionId === ring.definitionId)!;
      expect(capability.productionReady).toBe(true);
      expect(capability.trinketSemanticObligations?.every((side) => side.runtimeSliceSemanticComplete && side.implementationStatus === 'IMPLEMENTED')).toBe(true);
      for (const stance of stances) for (const side of ['positive', 'negative'] as const) {
        const campaign = fixture(ring.definitionId, side, stance);
        expect(currentRuntimeStance(campaign, campaign.heroes[0].instanceId)).toBe(stance);
        const result = begin(campaign, 8);
        const expected = side === 'positive' ? stance === ring.stance : stance !== ring.stance;
        expect(Boolean(ringOpportunity(result.campaign, ring.definitionId))).toBe(expected);
      }
    });
  }

  it('reads changed BattleUnit stance instead of the campaign snapshot and never auto-uses', () => {
    const defender = LEVEL3_STANCE_RING_SPECS[0];
    const campaign = fixture(defender.definitionId, 'positive', 'defensive');
    expect(campaign.heroes[0].stance).toBe('aggressive');
    const result = begin(campaign, 8);
    expect(ringOpportunity(result.campaign, defender.definitionId)).toBeDefined();
    expect(result.campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
    const declined = resolveTrinketOpportunity(result.campaign, ringOpportunity(result.campaign, defender.definitionId)!.id, 'decline').campaign;
    expect(declined.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
    const negative = begin(fixture(defender.definitionId, 'negative', 'defensive'), 8);
    expect(ringOpportunity(negative.campaign, defender.definitionId)).toBeUndefined();
  });

  it('rejects wrong stance, polarity, magnitude, window, missing and extra conditions', () => {
    for (const ring of LEVEL3_STANCE_RING_SPECS) {
      const data = source.find((entry) => entry.id === ring.definitionId)!;
      const base = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[ring.definitionId].definition;
      for (const side of ['positive', 'negative'] as const) {
        const expected = side === 'positive' ? data.positiveSide : data.negativeSide;
        const mutate = (change: (copy: typeof base) => void) => {
          const copy = structuredClone(base); change(copy);
          return compareTrinketSemanticPayload(expected, side === 'positive' ? copy.positiveSide : copy.negativeSide).runtimeSliceSemanticComplete;
        };
        const get = (copy: typeof base) => side === 'positive' ? copy.positiveSide : copy.negativeSide;
        expect(mutate((copy) => { const cond = get(copy).canUse!.find((item) => item.type === 'stance')!;
          if (cond.type === 'stance') cond.value = stances.find((value) => value !== ring.stance)!; })).toBe(false);
        expect(mutate((copy) => { const cond = get(copy).canUse!.find((item) => item.type === 'stance')!;
          if (cond.type === 'stance') cond.negated = !cond.negated; })).toBe(false);
        expect(mutate((copy) => { get(copy).modifiers[0].amount += 1; })).toBe(false);
        expect(mutate((copy) => { get(copy).modifiers[0].amount -= 1; })).toBe(false);
        expect(mutate((copy) => { get(copy).useWindows = ['before-damage-applied']; })).toBe(false);
        expect(mutate((copy) => { get(copy).canUse = get(copy).canUse!.filter((item) => item.type !== 'stance'); })).toBe(false);
        expect(mutate((copy) => { get(copy).canUse!.push({ type: 'incoming-hit-not-critical' }); })).toBe(false);
      }
    }
  });

  it('keeps physical copies independent, enforces once per turn, and blocks another action while paused', () => {
    const ring = LEVEL3_STANCE_RING_SPECS[0];
    let campaign = fixture(ring.definitionId, 'positive', ring.stance);
    campaign = acquireTrinket(campaign, { trinketId: ring.definitionId, source: 'debug',
      sourceEventId: 'c1c15-second-physical-copy', heroId: campaign.heroes[0].instanceId }).campaign;
    const begun = begin(campaign, 8).campaign;
    const copies = begun.pendingTrinketUseOpportunities.filter((entry) => entry.trinketId === ring.definitionId);
    expect(copies).toHaveLength(2);
    expect(new Set(copies.map((entry) => entry.trinketInstanceId)).size).toBe(2);
    const forbidden = beginHeroSkillAction(begun, 'crusader-smite', begun.battle!.monsters[0].id);
    expect(forbidden.error).not.toBeNull();
    expect(forbidden.campaign).toBe(begun);
    const used = resolveTrinketOpportunity(begun, copies[0].id, 'use').campaign;
    expect(used.heroes[0].equippedTrinkets.find((entry) => entry.instanceId === copies[0].trinketInstanceId)?.currentSide).toBe('negative');
    expect(used.heroes[0].equippedTrinkets.find((entry) => entry.instanceId === copies[1].trinketInstanceId)?.currentSide).toBe('positive');
    const finished = resolveTrinketOpportunity(used, copies[1].id, 'decline').campaign;
    const otherStance: CampaignState = { ...finished, battle: { ...finished.battle!,
      heroes: finished.battle!.heroes.map((unit) => unit.sourceId === finished.heroes[0].instanceId
        ? { ...unit, stance: 'ranged' as const } : unit) } };
    expect(openTrinketWindow(otherStance, { window: 'after-attack-roll-before-hit-resolution',
      heroId: finished.heroes[0].instanceId, eventId: 'same-turn-next-attack' }).opened).toHaveLength(0);
    expect(currentRuntimeStance({ ...campaign, battle: null }, campaign.heroes[0].instanceId)).toBe('aggressive');
    expect(currentRuntimeStance(campaign, 'missing-hero')).toBeNull();
  });
});
