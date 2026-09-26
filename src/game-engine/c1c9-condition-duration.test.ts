import { afterEach, describe, expect, it } from 'vitest';
import type { BattleState, CampaignState } from '../types';
import { CAMOUFLAGE_CLOAK_ID, PRODUCTION_PROOF_REGISTRY } from '../audit/production-proof-registry';
import { productionProofTest } from '../test-support/production-proof-test';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { generateDungeon } from './dungeon';
import { initBattle, prepareMonsterAttackResolution } from './battle';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { advancePendingMonsterAttack } from './trinkets/battle-trinket-bridge';
import { useTrinket } from './trinkets/use-trinket';
import { createSaveSnapshot, restoreSaveSnapshot } from './save';
import { setRandomSource } from './random';
import { applyStatusEffectEvent, tickStun } from './status-effects';

function registration(proofId: string) {
  const found = PRODUCTION_PROOF_REGISTRY[proofId];
  if (!found) throw new Error(`Missing proof registration: ${proofId}`);
  return found;
}

function conditionOpportunity(): CampaignState {
  // Keep battle initialization from applying random conditions before this proof's attack.
  setRandomSource(() => 0);
  let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  campaign = { ...campaign, currentQuestId: 'c1c9-proof', dungeon: generateDungeon('c1c9-proof') };
  campaign = initBattle(campaign, 'A');
  const monster = campaign.battle!.monsters[0];
  const heroes = campaign.battle!.heroes.map((hero) => ({ ...hero, hp: 99, maxHp: 99 }));
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
  const target = battle.heroes.find((hero) => hero.id === battle.pendingMonsterAttack!.targetHeroUnitId)!;
  campaign = acquireTrinket({ ...campaign, battle }, {
    trinketId: CAMOUFLAGE_CLOAK_ID, source: 'debug', sourceEventId: 'c1c9-cloak', heroId: target.sourceId,
  }).campaign;
  campaign = {
    ...campaign,
    heroes: campaign.heroes.map((hero) => hero.instanceId === target.sourceId ? {
      ...hero,
      equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: 'negative' as const })),
    } : hero),
  };
  return advancePendingMonsterAttack(campaign);
}

function target(campaign: CampaignState) {
  const pending = campaign.battle!.pendingMonsterAttack!;
  return campaign.battle!.heroes.find((unit) => unit.id === pending.targetHeroUnitId)!;
}

afterEach(() => setRandomSource(null));

describe('C1C-9 Trinket condition duration runtime', () => {
  productionProofTest(registration('C1C9-CAMOUFLAGE-CONDITION-RUNTIME'), () => {
    const campaign = conditionOpportunity();
    const opportunity = campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    expect(opportunity).toMatchObject({ useWindow: 'before-incoming-damage-applied', heroId: target(campaign).sourceId });
    expect(opportunity.preview).toContain('stun');
    expect(opportunity.preview).toContain('1 回合');

    setRandomSource(() => 0.99);
    const result = useTrinket(campaign, opportunity.id);
    const applied = target(result.campaign);
    expect(result.error).toBeNull();
    expect(applied.stunned).toBe(1);
    expect(applied.conditionDurations?.stun).toBe(1);
    expect(result.campaign.battle?.statusEffectEvents?.at(-1)).toMatchObject({
      targetId: applied.id,
      effects: [{ type: 'stun', amount: 1, durationTurns: 1 }],
      blocked: [],
    });
    expect(tickStun(applied)).toMatchObject({ stunned: 0, conditionDurations: { stun: 0 } });
  });

  productionProofTest(registration('C1C9-CAMOUFLAGE-CONDITION-SAVE-REPLAY'), () => {
    const opened = restoreSaveSnapshot(createSaveSnapshot(conditionOpportunity()));
    const opportunity = opened.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    setRandomSource(() => 0.99);
    const used = useTrinket(opened, opportunity.id).campaign;
    const saved = restoreSaveSnapshot(createSaveSnapshot(used));
    const event = saved.battle!.statusEffectEvents!.at(-1)!;
    const before = target(saved);
    const replayed = applyStatusEffectEvent(saved.battle!, event.targetId, event.effects, event.eventId);
    expect(replayed).toBe(saved.battle);
    expect(target({ ...saved, battle: replayed })).toEqual(before);
    expect(saved.heroes.find((hero) => hero.instanceId === before.sourceId)?.equippedTrinkets[0].currentSide).toBe('positive');
  });

  it.each(['immunity', 'categorical resistance', 'percentage resistance'] as const)('reuses shared %s handling', (_label) => {
    let campaign = conditionOpportunity();
    const selected = target(campaign);
    campaign = { ...campaign, battle: { ...campaign.battle!, heroes: campaign.battle!.heroes.map((unit) =>
      unit.id === selected.id ? {
        ...unit, stunned: 0, conditionDurations: {}, immunities: _label === 'immunity' ? ['stun'] : [],
        categoricalResistances: _label === 'categorical resistance' ? ['stun'] : [],
        resistances: _label === 'percentage resistance'
          ? { stun: 100, bleed: 0, blight: 0, disease: 0, debuff: 0, move: 0 }
          : { stun: 0, bleed: 0, blight: 0, disease: 0, debuff: 0, move: 0 },
      } : unit) } };
    setRandomSource(() => 0);
    const opportunity = campaign.pendingTrinketUseOpportunities.find((entry) => entry.status === 'open')!;
    const used = useTrinket(campaign, opportunity.id).campaign;
    expect(used.battle!.statusEffectEvents!.at(-1)!.blocked[0].reason).toBe(_label === 'immunity' ? 'immune' : 'resisted');
    expect(target(used).stunned).toBe(0);
    if (_label === 'categorical resistance') {
      expect(used.battle!.statusEffectEvents!.at(-1)!.blocked[0]).toMatchObject({
        durationReducedFrom: 1, durationReducedTo: 0,
      });
    }
  });
});
