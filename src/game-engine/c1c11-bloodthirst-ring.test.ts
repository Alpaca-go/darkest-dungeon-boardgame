import { afterEach, describe, expect, it } from 'vitest';
import type { BattleState, BattleUnit, CampaignState } from '../types';
import { BLOODTHIRST_RING_ID, CAMOUFLAGE_CLOAK_ID, PRODUCTION_PROOF_REGISTRY } from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { generateDungeon } from './dungeon';
import { initBattle, prepareMonsterAttackResolution } from './battle';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { advancePendingMonsterAttack, resolveTrinketOpportunity } from './trinkets/battle-trinket-bridge';
import { useTrinket } from './trinkets/use-trinket';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { setRandomSource } from './random';
import { applyStatusEffectEvent, resolveStartOfTurnConditions } from './status-effects';

function registration(proofId: string) {
  const found = PRODUCTION_PROOF_REGISTRY[proofId];
  if (!found) throw new Error(`Missing proof registration: ${proofId}`);
  return found;
}

function hitOpportunity(options: { attackRoll?: number; addCamouflage?: boolean; forceMiss?: boolean } = {}): CampaignState {
  let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  campaign = { ...campaign, currentQuestId: 'c1c11-proof', dungeon: generateDungeon('c1c11-proof') };
  campaign = initBattle(campaign, 'A');
  const monster = campaign.battle!.monsters[0];
  const selectedTarget = campaign.battle!.heroes[1];
  const heroes = campaign.battle!.heroes.map((hero) => ({
    ...hero, hp: 99, maxHp: 99,
    ...(hero.id === selectedTarget.id ? {
      immunities: [], categoricalResistances: [],
      resistances: { stun: 0, bleed: 0, blight: 0, disease: 0, debuff: 0, move: 0 },
    } : {}),
  }));
  const monsters = campaign.battle!.monsters.map((unit, index) => index === 0
    ? { ...unit, isAlive: true, hp: Math.max(1, unit.hp) }
    : { ...unit, isAlive: false, hp: 0 });
  let battle: BattleState = {
    ...campaign.battle!, heroes, monsters, activeActorId: monster.id, initiativeIndex: 0,
    initiativeOrder: [monster.id, ...heroes.map((hero) => hero.id)], pendingMonsterAttack: null,
    stagedIncomingAttacks: true, status: 'active',
  };
  setRandomSource(() => 0);
  battle = prepareMonsterAttackResolution(battle, monster.id);
  battle = { ...battle, pendingMonsterAttack: {
    ...battle.pendingMonsterAttack!, targetHeroUnitId: selectedTarget.id,
    skillId: 'bone-soldier-cleave', attackRoll: options.attackRoll ?? 1,
  } };
  campaign = { ...campaign, heroes: campaign.heroes.map((hero) => hero.instanceId === selectedTarget.sourceId
    ? { ...hero, level: 2 as const }
    : hero) };
  campaign = acquireTrinket({ ...campaign, battle }, {
    trinketId: BLOODTHIRST_RING_ID, source: 'debug', sourceEventId: 'c1c11-ring', heroId: selectedTarget.sourceId,
  }).campaign;
  if (options.addCamouflage) campaign = acquireTrinket(campaign, {
    trinketId: CAMOUFLAGE_CLOAK_ID, source: 'debug', sourceEventId: 'c1c11-cloak', heroId: selectedTarget.sourceId,
  }).campaign;
  campaign = {
    ...campaign,
    heroes: campaign.heroes.map((hero) => hero.instanceId === selectedTarget.sourceId ? {
      ...hero, equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: 'negative' as const })),
    } : hero),
  };
  if (options.forceMiss) campaign = { ...campaign, battle: { ...campaign.battle!, pendingMonsterAttack: {
    ...campaign.battle!.pendingMonsterAttack!, stage: 'hero-hit-window', hit: false, crit: false, baseDamage: 0,
  } } };
  return advancePendingMonsterAttack(campaign);
}

function target(campaign: CampaignState) {
  const pending = campaign.battle!.pendingMonsterAttack!;
  return campaign.battle!.heroes.find((unit) => unit.id === pending.targetHeroUnitId)!;
}

function withResistance(campaign: CampaignState, kind: 'none' | 'immunity' | 'categorical' | 'percentage'): CampaignState {
  const selected = target(campaign);
  const heroes: BattleUnit[] = campaign.battle!.heroes.map((unit): BattleUnit =>
    unit.id === selected.id ? {
      ...unit, bleed: 0, conditionDurations: {}, immunities: kind === 'immunity' ? ['bleed'] : [],
      categoricalResistances: kind === 'categorical' ? ['bleed'] : [],
      resistances: { ...unit.resistances!, bleed: kind === 'percentage' ? 100 : 0 },
    } : unit);
  return { ...campaign, battle: { ...campaign.battle!, heroes } };
}

afterEach(() => setRandomSource(null));

describe('C1C-11 Bloodthirst Ring hero-hit bleed runtime', () => {
  productionProofTest(registration('C1C11-BLOODTHIRST-NEGATIVE-RUNTIME'), () => {
    let campaign = withResistance(hitOpportunity(), 'none');
    const opportunity = campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    expect(opportunity).toMatchObject({ useWindow: 'before-incoming-damage-applied', heroId: target(campaign).sourceId });
    expect(opportunity.preview).toContain('bleed');
    expect(opportunity.preview).toContain('3');
    expect(opportunity.preview).toContain('2 回合');
    setRandomSource(() => 0.99);
    const result = useTrinket(campaign, opportunity.id);
    const applied = target(result.campaign);
    expect(result.error).toBeNull();
    expect(applied).toMatchObject({ bleed: 3, conditionDurations: { bleed: 2 } });
    expect(result.campaign.battle?.statusEffectEvents?.at(-1)).toMatchObject({
      targetId: applied.id, effects: [{ type: 'bleed', amount: 3, durationTurns: 2 }], blocked: [],
    });

    const tickOne = resolveStartOfTurnConditions(applied);
    expect(tickOne.unit).toMatchObject({ hp: applied.hp - 3, bleed: 3, conditionDurations: { bleed: 1 } });
    const tickTwo = resolveStartOfTurnConditions(tickOne.unit);
    expect(tickTwo.unit).toMatchObject({ hp: applied.hp - 6, bleed: 0, conditionDurations: { bleed: 0 } });
  });

  productionProofTest(registration('C1C11-BLOODTHIRST-NEGATIVE-SAVE-REPLAY'), () => {
    const opened = restoreSaveSnapshot(createSaveSnapshot(hitOpportunity()));
    const opportunity = opened.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    setRandomSource(() => 0.99);
    const used = useTrinket(opened, opportunity.id).campaign;
    const saved = restoreSaveSnapshot(createSaveSnapshot(used));
    const event = saved.battle!.statusEffectEvents!.at(-1)!;
    const before = target(saved);
    expect(applyStatusEffectEvent(saved.battle!, event.targetId, event.effects, event.eventId)).toBe(saved.battle);
    expect(target(saved)).toEqual(before);
    expect(saved.heroes.find((hero) => hero.instanceId === before.sourceId)?.equippedTrinkets[0].currentSide).toBe('positive');
  });

  it.each([
    ['immunity', 'immune'], ['percentage', 'resisted'],
  ] as const)('blocks bleed through shared %s handling', (kind, reason) => {
    const campaign = withResistance(hitOpportunity(), kind);
    setRandomSource(() => 0);
    const used = useTrinket(campaign, campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!.id).campaign;
    expect(target(used).bleed).toBe(0);
    expect(used.battle!.statusEffectEvents!.at(-1)!.blocked[0].reason).toBe(reason);
  });

  it('categorical resistance shortens 2 to 1 without changing magnitude 3', () => {
    const campaign = withResistance(hitOpportunity(), 'categorical');
    const used = useTrinket(campaign, campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!.id).campaign;
    expect(target(used)).toMatchObject({ bleed: 3, conditionDurations: { bleed: 1 } });
    expect(used.battle!.statusEffectEvents!.at(-1)!.blocked[0]).toMatchObject({
      durationReducedFrom: 2, durationReducedTo: 1,
    });
  });

  it('opens only after a real hit and keeps two distinct trinket opportunities', () => {
    const hit = hitOpportunity({ addCamouflage: true });
    expect(hit.pendingTrinketUseOpportunities.filter((entry) => entry.status === 'open')).toHaveLength(2);
    const miss = hitOpportunity({ forceMiss: true });
    expect(miss.pendingTrinketUseOpportunities.filter((entry) => entry.status === 'open')).toHaveLength(0);
    expect(miss.battle?.pendingMonsterAttack).toBeNull();
  });

  it('declining resumes the frozen hit without applying bleed', () => {
    const campaign = hitOpportunity();
    const opportunity = campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    const resolved = resolveTrinketOpportunity(campaign, opportunity.id, 'decline').campaign;
    const selected = resolved.battle!.heroes.find((unit) => unit.sourceId === opportunity.heroId)!;
    expect(resolved.battle?.pendingMonsterAttack).toBeNull();
    expect(selected.bleed).toBe(0);
  });

  it('periodic bleed at Death\'s Door uses the shared deathblow path', () => {
    const campaign = hitOpportunity();
    const opportunity = campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    const applied = target(useTrinket(campaign, opportunity.id).campaign);
    const deathsDoor = { ...applied, hp: 0, atDeathsDoor: true, bleed: 3, conditionDurations: { ...applied.conditionDurations, bleed: 2 } };
    setRandomSource(() => 0);
    const tick = resolveStartOfTurnConditions(deathsDoor);
    expect(tick).toMatchObject({ deathblowRolled: true, deathblowRoll: 1, deathblowResult: 'dead', heroDied: true });
    expect(tick.unit).toMatchObject({ isAlive: false, deathCause: 'deathblow-periodic', deathblowRollCount: deathsDoor.deathblowRollCount + 1 });
  });
});
