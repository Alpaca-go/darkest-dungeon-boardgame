import { describe, expect, it } from 'vitest';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { drawDarkestDungeonMonster } from '../../../game-engine/campaign/act-four/content-runtime';
import { runMonsterTurn } from '../../../game-engine/battle';
import { executeMammothCystAction } from '../../../game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action';
import { resolveSummonDisplacementChoice, summonWhiteCellStalk } from '../../../game-engine/bosses/mammoth-cyst/summon-white-cell-stalk';
import { getCommunityHeroRoomArea } from '../../../game-engine/campaign/act-four/community-guardian-room-state';
import {
  communityAttack,
  deployShufflingSummons,
  noRng,
  reload,
  scriptedD10,
  scenario,
  summon,
  targetId,
} from './capability-test-support';
import { setRandomSource } from '../../../game-engine/random';

describe('Community Guardian / Room R1 save-replay matrix (WP-6)', () => {
  it('SR-R1-01 Body Slam after Pit Toss continuous and reload preserve Area/Pit/Bleed/Stun', () => {
    const { result, heroId, campaign } = communityAttack('templars-impaler', 6, 1);
    const placement = getCommunityHeroRoomArea(result, heroId);
    const event = result.communityAttackEvents!.at(-1)!;
    expect(placement?.pitId).toBe(event.pitTossAreaId);
    expect(result.heroes.find((unit) => unit.id === heroId)!.bleed).toBeGreaterThan(0);
    expect(result.heroes.find((unit) => unit.id === heroId)!.stunned).toBeGreaterThan(0);

    const restored = reload({ ...campaign, battle: result });
    setRandomSource(noRng);
    expect(getCommunityHeroRoomArea(restored.battle!, heroId)).toEqual(placement);
    expect(restored.battle!.communityRoomState).toEqual(result.communityRoomState);
    expect(restored.battle!.communityAttackEvents).toEqual(result.communityAttackEvents);
    const hero = restored.battle!.heroes.find((unit) => unit.id === heroId)!;
    expect(hero.bleed).toBe(result.heroes.find((unit) => unit.id === heroId)!.bleed);
    expect(hero.stunned).toBe(result.heroes.find((unit) => unit.id === heroId)!.stunned);

    const replay = runMonsterTurn(restored.battle!, targetId(restored, 'templars-impaler'));
    expect(replay.communityAttackEvents).toEqual(result.communityAttackEvents);
    expect(getCommunityHeroRoomArea(replay, heroId)).toEqual(placement);
  });

  it('SR-R1-02 Mammoth no-space pending choice survives reload without reroll or duplicate summon', () => {
    const campaign = createCommunityGuardianScenario(2);
    const state = campaign.actFourState.mammothCystEncounterState!;
    const card = state.initiativeCards.find((item) => item.owner === 'mammoth-cyst')!;
    const area = state.snapshot.room.stanceAreaMap.ranged!;
    const filled = {
      ...state,
      heroPlacements: campaign.heroes.map((hero) => ({ heroId: hero.instanceId, areaId: area })),
    };
    const checkpoint = { ...campaign, actFourState: { ...campaign.actFourState, mammothCystEncounterState: filled } };
    const pending = summonWhiteCellStalk(checkpoint, {
      mode: 'community-reference',
      sourceActionEventId: card.id,
      rng: () => 0,
      now: '2026-09-12T00:00:00.000Z',
    });
    expect(pending.pendingChoice).not.toBeNull();
    const choice = pending.pendingChoice!;
    const beforeActors = pending.state!.actorStates.filter((actor) => actor.owner === 'white-cell-stalk').length;

    const restored = reload(pending.campaign);
    const restoredPending = restored.actFourState.mammothCystEncounterState!.pendingDisplacementChoice!;
    expect(restoredPending.heroCandidateIds).toEqual(choice.heroCandidateIds);
    expect(restoredPending.destinationAreaIds).toEqual(choice.destinationAreaIds);
    expect(restored.actFourState.mammothCystEncounterState!.actorStates.filter((actor) => actor.owner === 'white-cell-stalk')).toHaveLength(beforeActors);

    const resolveOpts = {
      heroId: restoredPending.heroCandidateIds[0] ?? restoredPending.heroId!,
      areaId: restoredPending.destinationAreaIds[0],
      mode: 'community-reference' as const,
      rng: () => 0.25,
      now: '2026-09-12T00:00:01.000Z',
    };
    const resolved = resolveSummonDisplacementChoice(restored, resolveOpts);
    expect(resolved.ok, resolved.reason ?? '').toBe(true);
    expect(resolved.state!.pendingDisplacementChoice).toBeNull();
    expect(resolved.state!.actorStates.filter((actor) => actor.owner === 'white-cell-stalk' && actor.isAlive)).toHaveLength(1);

    const continuous = resolveSummonDisplacementChoice(pending.campaign, {
      ...resolveOpts,
      heroId: choice.heroCandidateIds[0] ?? choice.heroId!,
      areaId: choice.destinationAreaIds[0],
    });
    expect(resolved.state!.heroPlacements).toEqual(continuous.state!.heroPlacements);
    expect(resolved.state!.actorStates.map((actor) => ({ owner: actor.owner, areaId: actor.areaId, isAlive: actor.isAlive }))).toEqual(
      continuous.state!.actorStates.map((actor) => ({ owner: actor.owner, areaId: actor.areaId, isAlive: actor.isAlive })),
    );
  });

  it('SR-R1-03 Teleport complete survives reload with Area/Stress/event receipt', () => {
    const campaign = summon();
    const state = campaign.actFourState.mammothCystEncounterState!;
    const card = state.initiativeCards.find((item) => item.owner === 'white-cell-stalk')!;
    const heroId = campaign.heroes[0].instanceId;
    const rolls = [8, 1, 9];
    const result = executeMammothCystAction(campaign, card.id, {
      mode: 'community-reference',
      targetHeroId: heroId,
      rng: () => {
        const roll = rolls.shift();
        if (roll === undefined) throw new Error('Teleport used unexpected extra RNG');
        return (roll - 0.5) / 10;
      },
      now: '2026-09-12T00:00:04.000Z',
    });
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.teleportation).not.toBeNull();
    expect(result.stressDealt).toBe(2);

    const restored = reload(result.campaign);
    expect(restored.actFourState.mammothCystEncounterState!.heroPlacements.find((p) => p.heroId === heroId)?.areaId)
      .toBe(result.teleportation!.targetAreaId);
    expect(restored.actFourState.mammothCystEncounterState!.processedTransactionIds)
      .toEqual(result.state!.processedTransactionIds);
    expect(restored.actFourState.mammothCystEncounterState!.heroPlacements)
      .toEqual(result.state!.heroPlacements);
    setRandomSource(noRng);
    expect(() => executeMammothCystAction(restored, card.id, {
      mode: 'community-reference',
      targetHeroId: heroId,
      rng: noRng,
      now: '2026-09-12T00:00:05.000Z',
    })).not.toThrow();
  });

  it('SR-R1-04 Undulations complete survives reload without RNG re-consumption', () => {
    const campaign = deployShufflingSummons();
    const before = campaign.battle!;
    const livingIds = before.heroes.filter((hero) => hero.isAlive).map((hero) => hero.id).sort();
    scriptedD10(9);
    const result = runMonsterTurn(before, targetId(campaign, 'shuffling-horror'));
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('undulations');
    expect(event.undulationsAfter).not.toBeNull();

    const restored = reload({ ...campaign, battle: result });
    setRandomSource(noRng);
    expect(restored.battle!.heroes.filter((hero) => hero.isAlive).map((hero) => hero.id).sort()).toEqual(livingIds);
    expect(restored.battle!.heroes.map((hero) => ({ id: hero.id, stance: hero.stance }))).toEqual(
      result.heroes.map((hero) => ({ id: hero.id, stance: hero.stance })),
    );
    expect(restored.battle!.communityAttackEvents!.at(-1)!.undulationsAfter).toEqual(event.undulationsAfter);
    const replay = runMonsterTurn(restored.battle!, targetId(restored, 'shuffling-horror'));
    expect(replay.communityAttackEvents).toEqual(result.communityAttackEvents);
    expect(replay.heroes.map((hero) => ({ id: hero.id, stance: hero.stance }))).toEqual(
      result.heroes.map((hero) => ({ id: hero.id, stance: hero.stance })),
    );
  });

  it('SR-R1-05 Echoing complete survives reload with Priest/Growth/initiative opportunities', () => {
    const campaign = scenario('shuffling-horror');
    scriptedD10(1);
    const result = runMonsterTurn(campaign.battle!, targetId(campaign, 'shuffling-horror'));
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('echoing-disassembly');
    expect(event.summonedRoles).toEqual(['cultist-priest', 'malignant-growth']);

    const restored = reload({ ...campaign, battle: result });
    setRandomSource(noRng);
    expect(restored.battle!.monsters.some((unit) => unit.sourceId === 'community-dd-cultist-priest' && unit.isAlive)).toBe(true);
    expect(restored.battle!.monsters.some((unit) => unit.sourceId === 'community-dd-malignant-growth' && unit.isAlive)).toBe(true);
    expect(restored.battle!.monsters.map((unit) => ({ sourceId: unit.sourceId, stance: unit.stance, isAlive: unit.isAlive }))).toEqual(
      result.monsters.map((unit) => ({ sourceId: unit.sourceId, stance: unit.stance, isAlive: unit.isAlive })),
    );
    expect(restored.battle!.initiativeOrder).toEqual(result.initiativeOrder);
    const replay = runMonsterTurn(restored.battle!, targetId(restored, 'shuffling-horror'));
    expect(replay.communityAttackEvents).toEqual(result.communityAttackEvents);
  });

  it('SR-R1-06 Physical deck partially filled and completed survives reload', () => {
    const campaign = createCommunityGuardianScenario(0);
    const filled = drawDarkestDungeonMonster(campaign, () => 0);
    expect(filled.ok).toBe(true);
    const deck = filled.campaign.actFourState.contentRuntime!.physicalMonsterDeck!;
    expect(deck.activePlacements).toHaveLength(4);

    const restored = reload(filled.campaign);
    const restoredDeck = restored.actFourState.contentRuntime!.physicalMonsterDeck!;
    expect(restoredDeck.drawPile).toEqual(deck.drawPile);
    expect(restoredDeck.inBattle).toEqual(deck.inBattle);
    expect(restoredDeck.activePlacements).toEqual(deck.activePlacements);
    expect(restoredDeck.fillHistory).toEqual(deck.fillHistory);
    expect(restoredDeck.drawHistory).toEqual(deck.drawHistory);
  });
});
