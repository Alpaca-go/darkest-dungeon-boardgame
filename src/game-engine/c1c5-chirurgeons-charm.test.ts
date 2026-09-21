import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import { CHIRURGEONS_CHARM_ID, PRODUCTION_PROOF_REGISTRY } from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { generateDungeon } from './dungeon';
import { initBattle } from './battle';
import { beginHeroSkillAction, resolveTrinketOpportunity } from './trinkets/battle-trinket-bridge';
import { openTrinketWindow } from './trinkets/trinket-opportunities';
import { createSaveSnapshot, migrateCampaignToV19, restoreSaveSnapshot } from './save';
import { COMMUNITY_RUNTIME_TRINKETS, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../data/community-reference/production-runtime';
import { filterCommunityTrinketCandidates, runtimeContentContext } from '../data/content-selector';

function registration(proofId: string) {
  const found = PRODUCTION_PROOF_REGISTRY[proofId];
  if (!found) throw new Error(`Missing proof registration: ${proofId}`);
  return found;
}

function healingBattle(owner: 'healer' | 'target', side: 'positive' | 'negative' = 'positive'): CampaignState {
  let campaign = applyDefaultLoadout(selectParty(
    createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor'],
  ));
  const ownerIndex = owner === 'healer' ? 0 : 1;
  campaign = acquireTrinket(campaign, {
    trinketId: CHIRURGEONS_CHARM_ID,
    source: 'nomad-wagon', sourceEventId: `c1c5:${owner}:${side}`,
    heroId: campaign.heroes[ownerIndex].instanceId,
  }).campaign;
  campaign = {
    ...campaign,
    heroes: campaign.heroes.map((hero, index) => index === ownerIndex
      ? { ...hero, equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: side })) }
      : hero),
    currentQuestId: 'c1c5-proof', dungeon: generateDungeon('c1c5-proof'),
  };
  const initialized = initBattle(campaign, 'A');
  const healer = initialized.battle!.heroes.find((unit) => unit.sourceId === initialized.heroes[0].instanceId)!;
  const target = initialized.battle!.heroes.find((unit) => unit.sourceId === initialized.heroes[1].instanceId)!;
  return {
    ...initialized,
    battle: {
      ...initialized.battle!,
      heroes: initialized.battle!.heroes.map((unit) => unit.id === target.id ? { ...unit, hp: unit.maxHp - 12 } : unit),
      activeActorId: healer.id,
      initiativeIndex: initialized.battle!.initiativeOrder.indexOf(healer.id),
      currentActionPoints: 2, pendingMentalCheck: false, status: 'active',
    },
  };
}

function beginHeal(campaign: CampaignState) {
  const target = campaign.battle!.heroes.find((unit) => unit.sourceId === campaign.heroes[1].instanceId)!;
  return beginHeroSkillAction(campaign, 'crusader-battle-heal', target.id);
}

function healingBattleWithBothSides(): CampaignState {
  let campaign = healingBattle('healer');
  campaign = acquireTrinket(campaign, {
    trinketId: CHIRURGEONS_CHARM_ID, source: 'nomad-wagon', sourceEventId: 'c1c5:target:negative',
    heroId: campaign.heroes[1].instanceId,
  }).campaign;
  campaign = {
    ...campaign,
    heroes: campaign.heroes.map((hero, index) => index === 1
      ? { ...hero, equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: 'negative' as const })) }
      : hero),
  };
  return campaign;
}

describe('C1C-5 Chirurgeon\'s Charm production behavior', () => {
  productionProofTest(registration('C1C5-CHIRURGEONS-RUNTIME'), () => {
    const positive = beginHeal(healingBattle('healer'));
    expect(positive.paused).toBe(true);
    expect(positive.campaign.pendingHealingAction?.stage).toBe('healer-window');
    expect(positive.campaign.pendingTrinketUseOpportunities[0].useWindow).toBe('before-healing-delivered-resolution');
    const positiveResolved = resolveTrinketOpportunity(positive.campaign, positive.campaign.pendingTrinketUseOpportunities[0].id, 'use').campaign;
    const positiveTarget = positiveResolved.battle!.heroes.find((unit) => unit.sourceId === positiveResolved.heroes[1].instanceId)!;
    expect(positiveTarget.maxHp - positiveTarget.hp).toBe(2); // base 8 + delivered 2

    const negative = beginHeal(healingBattle('target', 'negative'));
    expect(negative.campaign.pendingHealingAction?.stage).toBe('target-window');
    const negativeResolved = resolveTrinketOpportunity(negative.campaign, negative.campaign.pendingTrinketUseOpportunities[0].id, 'use').campaign;
    const negativeTarget = negativeResolved.battle!.heroes.find((unit) => unit.sourceId === negativeResolved.heroes[1].instanceId)!;
    expect(negativeTarget.maxHp - negativeTarget.hp).toBe(8); // base 8 + received -4
  });

  productionProofTest(registration('C1C5-CHIRURGEONS-SAVE-REPLAY'), () => {
    const begun = beginHeal(healingBattle('healer'));
    const replay = restoreSaveSnapshot(createSaveSnapshot(begun.campaign));
    expect(replay.pendingHealingAction).toEqual(begun.campaign.pendingHealingAction);
    expect(replay.pendingTrinketUseOpportunities).toHaveLength(1);
    const once = resolveTrinketOpportunity(replay, replay.pendingTrinketUseOpportunities[0].id, 'use').campaign;
    const stale = resolveTrinketOpportunity(once, replay.pendingTrinketUseOpportunities[0].id, 'use');
    expect(stale.error).not.toBeNull();
    expect(stale.campaign).toBe(once);
  });

  productionProofTest(registration('C1C5-CHIRURGEONS-SELECTOR'), () => {
    const definition = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[CHIRURGEONS_CHARM_ID].definition;
    expect(definition?.positiveSide.useWindows).toEqual(['before-healing-delivered-resolution']);
    expect(definition?.negativeSide.useWindows).toEqual(['before-healing-received-resolution']);
    const context = runtimeContentContext(createNewCampaign('community-complete-edition'));
    expect(filterCommunityTrinketCandidates(COMMUNITY_RUNTIME_TRINKETS, context).some((entry) => entry.id === CHIRURGEONS_CHARM_ID)).toBe(false);
  });

  it('does not offer the same physical card twice on a self-heal', () => {
    const campaign = healingBattle('healer');
    const hero = campaign.heroes[0];
    const instanceId = hero.equippedTrinkets[0].instanceId;
    const first = openTrinketWindow(campaign, {
      window: 'before-healing-delivered-resolution', heroId: hero.instanceId,
      eventId: 'self-heal:delivered', rootEventId: 'self-heal',
    });
    expect(first.opened).toHaveLength(1);
    const flipped = {
      ...first.campaign,
      heroes: first.campaign.heroes.map((entry, index) => index === 0
        ? { ...entry, equippedTrinkets: entry.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: 'negative' as const })) }
        : entry),
    };
    const second = openTrinketWindow(flipped, {
      window: 'before-healing-received-resolution', heroId: hero.instanceId,
      eventId: 'self-heal:received', rootEventId: 'self-heal', excludedTrinketInstanceIds: [instanceId],
    });
    expect(second.opened).toHaveLength(0);
  });

  it('fails closed for wrong/stale opportunities and invalidated actions', () => {
    const begun = beginHeal(healingBattle('healer')).campaign;
    expect(resolveTrinketOpportunity(begun, 'wrong-opportunity', 'use').campaign).toBe(begun);
    const opportunity = begun.pendingTrinketUseOpportunities[0];
    const staleEvent = {
      ...begun,
      pendingTrinketUseOpportunities: begun.pendingTrinketUseOpportunities.map((entry) => entry.id === opportunity.id
        ? { ...entry, eventId: 'stale-event' }
        : entry),
    };
    expect(resolveTrinketOpportunity(staleEvent, opportunity.id, 'use').error).toBe('治疗饰品机会已失效。');

    const invalidAction = { ...begun, battle: { ...begun.battle!, activeActorId: begun.battle!.heroes[1].id } };
    const invalidResult = resolveTrinketOpportunity(invalidAction, opportunity.id, 'use');
    expect(invalidResult.error).toBe('治疗动作已失效。');
    expect(invalidResult.campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
  });

  it('fails closed when the owner died, lost the card, or the card already flipped', () => {
    const begun = beginHeal(healingBattle('healer')).campaign;
    const opportunity = begun.pendingTrinketUseOpportunities[0];
    const ownerDead = {
      ...begun,
      heroes: begun.heroes.map((hero, index) => index === 0 ? { ...hero, isAlive: false, dead: true } : hero),
    };
    expect(resolveTrinketOpportunity(ownerDead, opportunity.id, 'use').campaign).toBe(ownerDead);
    const lost = { ...begun, heroes: begun.heroes.map((hero, index) => index === 0 ? { ...hero, equippedTrinkets: [] } : hero) };
    expect(resolveTrinketOpportunity(lost, opportunity.id, 'use').campaign).toBe(lost);
    const flipped = {
      ...begun,
      heroes: begun.heroes.map((hero, index) => index === 0
        ? { ...hero, equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: 'negative' as const })) }
        : hero),
    };
    expect(resolveTrinketOpportunity(flipped, opportunity.id, 'use').campaign).toBe(flipped);
  });

  it('declines without flipping and reloads safely after resolution', () => {
    const begun = beginHeal(healingBattle('healer')).campaign;
    const declined = resolveTrinketOpportunity(begun, begun.pendingTrinketUseOpportunities[0].id, 'decline').campaign;
    expect(declined.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
    expect(declined.heroes[0].equippedTrinkets[0].usedTurnId).toBeNull();
    const target = declined.battle!.heroes.find((unit) => unit.sourceId === declined.heroes[1].instanceId)!;
    expect(target.maxHp - target.hp).toBe(4);
    const replay = restoreSaveSnapshot(createSaveSnapshot(declined));
    expect(replay.pendingHealingAction).toBeNull();
    expect(replay.battle).toEqual(declined.battle);
  });

  it('persists the deterministic healer-to-receiver checkpoint', () => {
    const begun = beginHeal(healingBattleWithBothSides()).campaign;
    expect(begun.pendingHealingAction?.stage).toBe('healer-window');
    const afterHealer = resolveTrinketOpportunity(begun, begun.pendingTrinketUseOpportunities[0].id, 'use').campaign;
    expect(afterHealer.pendingHealingAction?.stage).toBe('target-window');
    expect(afterHealer.pendingHealingAction?.healingModifier).toBe(2);
    const replay = restoreSaveSnapshot(createSaveSnapshot(afterHealer));
    expect(replay.pendingTrinketUseOpportunities).toHaveLength(2); // used healer record + open receiver opportunity
    const receiverOpportunity = replay.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    const resolved = resolveTrinketOpportunity(replay, receiverOpportunity.id, 'use').campaign;
    const target = resolved.battle!.heroes.find((unit) => unit.sourceId === resolved.heroes[1].instanceId)!;
    expect(target.maxHp - target.hp).toBe(6); // 12 - (8 + 2 - 4)
  });

  it('drops an invalid staged healing root and its orphan opportunities on restore', () => {
    const begun = beginHeal(healingBattle('healer')).campaign;
    const eventId = begun.pendingHealingAction!.eventId;
    const corrupted = {
      ...begun,
      pendingHealingAction: { ...begun.pendingHealingAction!, actorUnitId: '', baseAmount: Number.NaN },
    };
    const restored = migrateCampaignToV19(corrupted);
    expect(restored.pendingHealingAction).toBeNull();
    expect(restored.pendingTrinketUseOpportunities.some((entry) => entry.rootEventId === eventId)).toBe(false);
  });
});
