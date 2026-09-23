import { afterEach, describe, expect, it } from 'vitest';
import type { BattleState, CampaignState } from '../types';
import {
  BLOODTHIRST_RING_ID, BOOK_OF_HOLINESS_ID, PRODUCTION_PROOF_REGISTRY, PROTECTIVE_PADLOCK_ID,
} from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { generateDungeon } from './dungeon';
import { initBattle, prepareMonsterAttackResolution } from './battle';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { advancePendingMonsterAttack, resolveTrinketOpportunity } from './trinkets/battle-trinket-bridge';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { setRandomSource } from './random';
import { getMonsterSkillById } from '../data/monster-skills';

function openedAttack(extraTrinket?: string, alreadyCritical = false, miss = false): CampaignState {
  let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  campaign = { ...campaign, currentQuestId: 'c1c13-proof', dungeon: generateDungeon('c1c13-proof') };
  campaign = initBattle(campaign, 'A');
  const monster = campaign.battle!.monsters[0];
  const selected = campaign.battle!.heroes[1];
  const heroes = campaign.battle!.heroes.map((hero) => ({
    ...hero, hp: 30, maxHp: 30, stress: 0, quirkIds: [],
    ...(hero.id === selected.id ? {
      immunities: [], categoricalResistances: [],
      resistances: { stun: 0, bleed: 0, blight: 0, disease: 0, debuff: 0, move: 0 },
    } : {}),
  }));
  const monsters = campaign.battle!.monsters.map((unit, index) => index === 0
    ? { ...unit, isAlive: true, hp: Math.max(1, unit.hp) } : { ...unit, isAlive: false, hp: 0 });
  let battle: BattleState = {
    ...campaign.battle!, heroes, monsters, activeActorId: monster.id, initiativeIndex: 0,
    initiativeOrder: [monster.id, ...heroes.map((hero) => hero.id)], pendingMonsterAttack: null,
    stagedIncomingAttacks: true, status: 'active',
  };
  setRandomSource(() => 0);
  battle = prepareMonsterAttackResolution(battle, monster.id);
  battle = { ...battle, pendingMonsterAttack: {
    ...battle.pendingMonsterAttack!, stage: 'hero-hit-window', targetHeroUnitId: selected.id,
    skillId: 'bone-soldier-cleave', attackRoll: 5, hit: !miss, crit: alreadyCritical,
    baseDamage: miss ? 0 : alreadyCritical ? 7 : 2, diseaseRoll: null, criticalOverride: null,
  } };
  campaign = { ...campaign, battle, heroes: campaign.heroes.map((hero) => hero.instanceId === selected.sourceId
    ? { ...hero, level: 2 as const } : hero) };
  for (const trinketId of [BOOK_OF_HOLINESS_ID, ...(extraTrinket ? [extraTrinket] : [])]) {
    campaign = acquireTrinket(campaign, {
      trinketId, source: 'debug', sourceEventId: `c1c13:${trinketId}`, heroId: selected.sourceId,
    }).campaign;
  }
  campaign = { ...campaign, heroes: campaign.heroes.map((hero) => hero.instanceId === selected.sourceId ? {
    ...hero, equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({
      ...trinket, currentSide: trinket.trinketId === PROTECTIVE_PADLOCK_ID ? 'positive' as const : 'negative' as const,
    })),
  } : hero) };
  return advancePendingMonsterAttack(campaign);
}

function open(campaign: CampaignState, trinketId: string) {
  return campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open' && entry.trinketId === trinketId)!;
}

function targetHp(campaign: CampaignState, targetId: string): number {
  return campaign.battle!.heroes.find((hero) => hero.id === targetId)!.hp;
}

function decideAll(campaign: CampaignState, order: string[], decisions: Record<string, 'use' | 'decline'>): CampaignState {
  let next = campaign;
  for (const id of order) next = resolveTrinketOpportunity(next, open(next, id).id, decisions[id]).campaign;
  return next;
}

afterEach(() => setRandomSource(null));

describe('C1C-13 Book of Holiness incoming Critical conversion', () => {
  productionProofTest(PRODUCTION_PROOF_REGISTRY['C1C13-HOLINESS-CRITICAL-RUNTIME'], () => {
    const campaign = openedAttack();
    const frozen = campaign.battle!.pendingMonsterAttack!;
    const before = targetHp(campaign, frozen.targetHeroUnitId);
    setRandomSource(() => { throw new Error('conversion must not consume RNG'); });
    const resolved = resolveTrinketOpportunity(campaign, open(campaign, BOOK_OF_HOLINESS_ID).id, 'use').campaign;
    expect(before - targetHp(resolved, frozen.targetHeroUnitId)).toBe(getMonsterSkillById(frozen.skillId)!.maxDamage);
    expect(resolved.battle?.battleLog.at(-1)?.message).toContain('转化为暴击');
    expect(resolved.battle?.pendingStressEvents).toHaveLength(4);
    expect(frozen).toMatchObject({ crit: false, baseDamage: 2, criticalOverride: null });
  });

  it('decline preserves the original frozen ordinary-hit damage and card side', () => {
    const campaign = openedAttack(); const frozen = campaign.battle!.pendingMonsterAttack!;
    const before = targetHp(campaign, frozen.targetHeroUnitId);
    const resolved = resolveTrinketOpportunity(campaign, open(campaign, BOOK_OF_HOLINESS_ID).id, 'decline').campaign;
    expect(before - targetHp(resolved, frozen.targetHeroUnitId)).toBe(2);
    expect(resolved.heroes.find((hero) => hero.instanceId === open(campaign, BOOK_OF_HOLINESS_ID).heroId)
      ?.equippedTrinkets.find((t) => t.trinketId === BOOK_OF_HOLINESS_ID)?.currentSide).toBe('negative');
    expect(resolved.battle?.battleLog.at(-1)?.message).not.toContain('暴击');
  });

  it('does not open on a miss or an already-Critical attack', () => {
    expect(openedAttack(undefined, false, true).pendingTrinketUseOpportunities.filter((x) => x.status === 'open')).toHaveLength(0);
    expect(openedAttack(undefined, true).pendingTrinketUseOpportunities.filter((x) => x.status === 'open')).toHaveLength(0);
  });

  productionProofTest(PRODUCTION_PROOF_REGISTRY['C1C13-HOLINESS-CRITICAL-SAVE-REPLAY'], () => {
    const beforeUse = restoreSaveSnapshot(createSaveSnapshot(openedAttack()));
    expect(beforeUse.battle?.pendingMonsterAttack).toMatchObject({ crit: false, baseDamage: 2, criticalOverride: null });
    const opportunity = open(beforeUse, BOOK_OF_HOLINESS_ID);
    const usedOnly = resolveTrinketOpportunity({
      ...beforeUse,
      pendingTrinketUseOpportunities: [...beforeUse.pendingTrinketUseOpportunities, {
        ...opportunity, id: 'hold-open', trinketInstanceId: 'synthetic-blocker', trinketId: 'synthetic-blocker',
      }],
    }, opportunity.id, 'use').campaign;
    expect(usedOnly.battle?.pendingMonsterAttack).toMatchObject({ crit: false, baseDamage: 2, criticalOverride: 'force-critical' });
    const replay = restoreSaveSnapshot(createSaveSnapshot(usedOnly));
    expect(replay.battle?.pendingMonsterAttack).toMatchObject({ crit: false, baseDamage: 2, criticalOverride: 'force-critical' });
    expect(replay.heroes.find((hero) => hero.instanceId === opportunity.heroId)?.equippedTrinkets
      .find((t) => t.trinketId === BOOK_OF_HOLINESS_ID)?.currentSide).toBe('positive');
  });

  productionProofTest(PRODUCTION_PROOF_REGISTRY['C1C13-HOLINESS-CRITICAL-COMPOSITION'], () => {
    const run = (order: string[]) => {
      const campaign = openedAttack(PROTECTIVE_PADLOCK_ID);
      const frozen = campaign.battle!.pendingMonsterAttack!;
      const before = targetHp(campaign, frozen.targetHeroUnitId);
      const resolved = decideAll(campaign, order, {
        [BOOK_OF_HOLINESS_ID]: 'use', [PROTECTIVE_PADLOCK_ID]: 'use',
      });
      return before - targetHp(resolved, frozen.targetHeroUnitId);
    };
    expect(run([BOOK_OF_HOLINESS_ID, PROTECTIVE_PADLOCK_ID])).toBe(4);
    expect(run([PROTECTIVE_PADLOCK_ID, BOOK_OF_HOLINESS_ID])).toBe(4);

    const coexist = openedAttack(BLOODTHIRST_RING_ID);
    expect(coexist.pendingTrinketUseOpportunities.filter((x) => x.status === 'open')).toHaveLength(2);
    const resolved = decideAll(coexist, [BOOK_OF_HOLINESS_ID, BLOODTHIRST_RING_ID], {
      [BOOK_OF_HOLINESS_ID]: 'use', [BLOODTHIRST_RING_ID]: 'use',
    });
    const selected = resolved.battle!.heroes.find((hero) => hero.sourceId === open(coexist, BOOK_OF_HOLINESS_ID).heroId)!;
    expect(selected).toMatchObject({ bleed: 3, conditionDurations: { bleed: 2 } });
  });

  it('reuses the shared Death\'s Door damage path', () => {
    let campaign = openedAttack(); const pending = campaign.battle!.pendingMonsterAttack!;
    campaign = { ...campaign, battle: { ...campaign.battle!, heroes: campaign.battle!.heroes.map((hero) =>
      hero.id === pending.targetHeroUnitId ? { ...hero, hp: 3 } : hero) } };
    const resolved = resolveTrinketOpportunity(campaign, open(campaign, BOOK_OF_HOLINESS_ID).id, 'use').campaign;
    expect(resolved.battle!.heroes.find((hero) => hero.id === pending.targetHeroUnitId)).toMatchObject({ hp: 0, atDeathsDoor: true, isAlive: true });
  });
});
