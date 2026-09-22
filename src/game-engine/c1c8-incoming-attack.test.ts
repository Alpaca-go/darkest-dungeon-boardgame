import { afterEach, describe, expect, it } from 'vitest';
import type { BattleState, CampaignState } from '../types';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { generateDungeon } from './dungeon';
import { initBattle, prepareMonsterAttackResolution } from './battle';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { advancePendingMonsterAttack, resolveTrinketOpportunity } from './trinkets/battle-trinket-bridge';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { setRandomSource } from './random';
import { getMonsterSkillById } from '../data/monster-skills';

const PADLOCK = 'community-trinket-core-protective-padlock';
const CLOAK = 'community-trinket-core-camouflage-cloak';

function stagedAttack(attackRoll = 1, damageRandom = 0, trinketId = PADLOCK): CampaignState {
  let campaign = applyDefaultLoadout(selectParty(
    createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor'],
  ));
  campaign = { ...campaign, currentQuestId: 'c1c8-proof', dungeon: generateDungeon('c1c8-proof') };
  campaign = initBattle(campaign, 'A');
  const monster = campaign.battle!.monsters[0];
  const heroes = campaign.battle!.heroes.map((hero) => ({ ...hero, hp: 99, maxHp: 99 }));
  const monsters = campaign.battle!.monsters.map((unit, index) => index === 0
    ? { ...unit, isAlive: true, hp: Math.max(1, unit.hp) }
    : { ...unit, isAlive: false, hp: 0 });
  let battle: BattleState = {
    ...campaign.battle!, heroes, monsters, activeActorId: monster.id, initiativeIndex: 0,
    initiativeOrder: [monster.id, ...heroes.map((hero) => hero.id)], pendingMonsterAttack: null,
    stagedIncomingAttacks: true, status: 'active' as const,
  };
  const values = [(attackRoll - 0.5) / 10, damageRandom];
  setRandomSource(() => values.shift() ?? 0);
  battle = prepareMonsterAttackResolution(battle, monster.id);
  const target = battle.heroes.find((hero) => hero.id === battle.pendingMonsterAttack!.targetHeroUnitId)!;
  campaign = { ...campaign, battle };
  campaign = acquireTrinket(campaign, {
    trinketId, source: 'debug', sourceEventId: `c1c8:${trinketId}:${attackRoll}:${damageRandom}`,
    heroId: target.sourceId,
  }).campaign;
  return campaign;
}

afterEach(() => setRandomSource(null));

describe('C1C-8 staged incoming monster attack', () => {
  it('keeps incoming-attack and hero-hit-by-attack as distinct ordered windows', () => {
    const incoming = stagedAttack();
    expect(incoming.battle?.pendingMonsterAttack).toMatchObject({
      stage: 'incoming-attack-window', hit: null, baseDamage: null,
    });
    const hitWindow = advancePendingMonsterAttack(incoming);
    expect(hitWindow.battle?.pendingMonsterAttack).toMatchObject({ stage: 'hero-hit-window', hit: true });
    expect(hitWindow.pendingTrinketUseOpportunities.filter((entry) => entry.status === 'open'))
      .toHaveLength(1);
    expect(hitWindow.pendingTrinketUseOpportunities[0].useWindow).toBe('before-incoming-damage-applied');
  });

  it.each([[1, 1], [2, 1], [3, 2], [4, 2], [5, 3]])(
    'Protective Padlock transforms frozen damage %i to %i',
    (baseDamage, expected) => {
      let campaign = advancePendingMonsterAttack(stagedAttack());
      const pending = campaign.battle!.pendingMonsterAttack!;
      const targetId = pending.targetHeroUnitId;
      campaign = { ...campaign, battle: { ...campaign.battle!, pendingMonsterAttack: { ...pending, baseDamage } } };
      const before = campaign.battle!.heroes.find((hero) => hero.id === targetId)!.hp;
      const opportunity = campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
      const resolved = resolveTrinketOpportunity(campaign, opportunity.id, 'use').campaign;
      const after = resolved.battle!.heroes.find((hero) => hero.id === targetId)!.hp;
      expect(before - after).toBe(expected);
      expect(resolved.battle?.battleLog.some((entry) => entry.message.includes(`造成 ${expected} 伤害`))).toBe(true);
    },
  );

  it('skips the hero-hit window on a miss', () => {
    const staged = stagedAttack(9);
    const campaign = { ...staged, battle: { ...staged.battle!, pendingMonsterAttack: {
      ...staged.battle!.pendingMonsterAttack!, skillId: 'bone-soldier-bash', attackRoll: 9,
    } } };
    const resolved = advancePendingMonsterAttack(campaign);
    expect(resolved.pendingTrinketUseOpportunities.some((entry) => entry.status === 'open')).toBe(false);
    expect(resolved.battle?.pendingMonsterAttack).toBeNull();
    expect(resolved.battle?.battleLog.some((entry) => entry.message.includes('未命中'))).toBe(true);
  });

  it('Camouflage Cloak Dodge +2 changes the production hit outcome', () => {
    let campaign = stagedAttack(1, 0, CLOAK);
    const skillId = campaign.battle!.pendingMonsterAttack!.skillId;
    const accuracy = getMonsterSkillById(skillId)?.accuracy ?? 7;
    // Put the frozen roll exactly on the unmodified Accuracy boundary.
    campaign = { ...campaign, battle: { ...campaign.battle!, pendingMonsterAttack: {
      ...campaign.battle!.pendingMonsterAttack!, attackRoll: accuracy,
    } } };
    const incoming = advancePendingMonsterAttack(campaign);
    const opportunity = incoming.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    expect(opportunity.useWindow).toBe('before-incoming-hit-resolution');
    const used = resolveTrinketOpportunity(incoming, opportunity.id, 'use').campaign;
    expect(used.battle?.battleLog.some((entry) => entry.message.includes('未命中'))).toBe(true);
    expect(used.pendingTrinketUseOpportunities.some((entry) => entry.useWindow === 'before-incoming-damage-applied' && entry.status === 'open')).toBe(false);
  });

  it('persists attack and damage RNG across reload before declining', () => {
    const opened = advancePendingMonsterAttack(stagedAttack(1, 0.5));
    const frozen = opened.battle!.pendingMonsterAttack!;
    const replay = restoreSaveSnapshot(createSaveSnapshot(opened));
    expect(replay.battle?.pendingMonsterAttack).toMatchObject({
      attackRoll: frozen.attackRoll, baseDamage: frozen.baseDamage,
    });
    setRandomSource(() => 0.99);
    const opportunity = replay.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    const resolved = resolveTrinketOpportunity(replay, opportunity.id, 'decline').campaign;
    expect(resolved.battle?.battleLog.some((entry) => entry.message.includes(`掷 ${frozen.attackRoll}`)
      && entry.message.includes(`造成 ${frozen.baseDamage} 伤害`))).toBe(true);
  });

  it('offers only the attacked Hero\'s Trinkets and guards the physical card across stages', () => {
    const campaign = advancePendingMonsterAttack(stagedAttack());
    const pending = campaign.battle!.pendingMonsterAttack!;
    const opportunity = campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    const target = campaign.battle!.heroes.find((hero) => hero.id === pending.targetHeroUnitId)!;
    expect(opportunity.heroId).toBe(target.sourceId);
    expect(pending.processedTrinketInstanceIds).toContain(opportunity.trinketInstanceId);
  });
});
