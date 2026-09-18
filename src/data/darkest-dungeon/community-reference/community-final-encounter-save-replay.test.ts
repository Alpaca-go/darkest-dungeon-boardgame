import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  beginCommunityFinalEncounter,
  driveCommunityFinalToForm,
  driveCommunityFinalToHeartWithForecast,
  driveCommunityFinalUntil,
  finalReady,
  noRng,
  reload,
  scriptedD10,
} from './capability-test-support';
import { prepareFinalEncounter } from '../../../game-engine/campaign/act-four/prepare-final-encounter';
import { startFinalEncounter } from '../../../game-engine/campaign/act-four/final-form-sequence';
import { transitionToNextFinalForm } from '../../../game-engine/campaign/act-four/transition-final-form';
import { setupFinalFormRuntime } from '../../../game-engine/campaign/act-four/final-forms/final-form-runtime';
import {
  applyCommunityFinalHeroSkill,
  communityFinalFormUnit,
  runCommunityFinalFormTurn,
} from '../../../game-engine/campaign/act-four/community-final-combat';
import { seededRuntimeSources, setRandomSource, setRuntimeSources } from '../../../game-engine/random';

beforeEach(() => { setRuntimeSources(seededRuntimeSources(1203)); setRandomSource(() => 0.49); });
afterEach(() => setRandomSource(null));

/** 语义状态向量：reload 会为 BattleUnit 补默认字段（如 equippedTrinketInstanceIds），只比较战斗语义字段。 */
function heroVectors(campaign: ReturnType<typeof beginCommunityFinalEncounter>) {
  return campaign.battle!.heroes.map((unit) => ({
    id: unit.id,
    hp: unit.hp,
    maxHp: unit.maxHp,
    stress: unit.stress,
    stance: unit.stance,
    position: unit.position,
    isAlive: unit.isAlive,
    atDeathsDoor: unit.atDeathsDoor,
    bleed: unit.bleed,
    blight: unit.blight,
    stunned: unit.stunned,
    marked: unit.marked,
    conditionDurations: unit.conditionDurations ?? null,
    buffs: unit.buffs,
    debuffs: unit.debuffs,
  }));
}

describe('Community Final encounter save/replay matrix', () => {
  it('FR-SR-01 Final Provision complete → reload', () => {
    const first = prepareFinalEncounter(finalReady(), { mode: 'community-reference', rng: () => 0, chooseWild: () => 'food' });
    expect(first.ok).toBe(true);
    const restored = reload(first.campaign);
    setRandomSource(noRng);
    const replay = prepareFinalEncounter(restored, { mode: 'community-reference', rng: noRng, chooseWild: () => 'torch' });
    expect(replay.alreadyPrepared).toBe(true);
    expect(replay.provisionRecord).toEqual(first.provisionRecord);
  });

  it('FR-SR-02 Ancestor 1 initial Reflections allocated → reload does not reroll stance', () => {
    const started = beginCommunityFinalEncounter(2);
    const stances = started.actFourState.finalFormRuntimeState?.runtimes['ancestor-first-form'];
    expect(stances?.kind).toBe('ancestor-first-form');
    const snapshot = stances?.kind === 'ancestor-first-form' ? stances.reflections.map((item) => ({ id: item.id, stance: item.stance, kind: item.kind })) : [];
    const restored = reload(started);
    setRandomSource(noRng);
    const again = startFinalEncounter(restored, { mode: 'community-reference', rng: noRng });
    expect(again.alreadyStarted).toBe(true);
    const setup = setupFinalFormRuntime(
      restored.actFourState.finalFormRuntimeState,
      restored.actFourState.finalEncounterState!.id,
      'ancestor-first-form',
      { mode: 'community-reference', rng: () => 0.99 },
    );
    expect(setup.alreadySetUp).toBe(true);
    const after = setup.state?.runtimes['ancestor-first-form'];
    expect(after?.kind === 'ancestor-first-form' ? after.reflections.map((item) => ({ id: item.id, stance: item.stance, kind: item.kind })) : []).toEqual(snapshot);
  });

  it('FR-SR-03 Ancestor vacant stance d10 fill → reload does not consume d10 again', () => {
    let campaign = beginCommunityFinalEncounter(2);
    const imperfect = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('imperfect'))!;
    campaign = applyCommunityFinalHeroSkill({
      ...campaign,
      battle: {
        ...campaign.battle!,
        activeActorId: campaign.battle!.heroes[0].id,
        currentActionPoints: 1,
        monsters: campaign.battle!.monsters.map((unit) => unit.id === imperfect.id ? { ...unit, hp: 1 } : unit),
      },
    }, campaign.battle!.heroes[0].id, 'crusader-holy-lance', imperfect.id).campaign;
    scriptedD10(2, 1);
    const first = runCommunityFinalFormTurn(campaign, communityFinalFormUnit(campaign.battle!, 'ancestor-first-form')!.id);
    const history = first.campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-first-form'];
    const restored = reload(first.campaign);
    setRandomSource(noRng);
    const replay = runCommunityFinalFormTurn(restored, communityFinalFormUnit(restored.battle!, 'ancestor-first-form')!.id);
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-first-form']).toEqual(history);
  });

  it('FR-SR-04 Time Heals All complete → reload does not repeat heal', () => {
    let campaign = beginCommunityFinalEncounter(2);
    const patient = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('perfect'))!;
    campaign = { ...campaign, battle: { ...campaign.battle!, monsters: campaign.battle!.monsters.map((unit) => unit.id === patient.id ? { ...unit, hp: patient.hp - 12 } : unit) } };
    const first = runCommunityFinalFormTurn(campaign, communityFinalFormUnit(campaign.battle!, 'ancestor-first-form')!.id);
    const hp = first.campaign.battle!.monsters.find((unit) => unit.id === patient.id)!.hp;
    const restored = reload(first.campaign);
    setRandomSource(noRng);
    const replay = runCommunityFinalFormTurn(restored, communityFinalFormUnit(restored.battle!, 'ancestor-first-form')!.id);
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.campaign.battle!.monsters.find((unit) => unit.id === patient.id)!.hp).toBe(hp);
  });

  it('FR-SR-05 Ancestor 1 defeated / transition pending → reload continues transition once', () => {
    const defeated = driveCommunityFinalUntil(beginCommunityFinalEncounter(2), (campaign) => campaign.actFourState.finalEncounterState?.status === 'transitioning');
    const restored = reload(defeated);
    const first = transitionToNextFinalForm(restored, { mode: 'community-reference', rng: () => 0.2 });
    expect(first.ok).toBe(true);
    const again = transitionToNextFinalForm(reload(first.campaign), { mode: 'community-reference', rng: noRng });
    expect(again.alreadyTransitioned).toBe(true);
  });

  it('FR-SR-06 Ancestor 2 teleport complete → reload keeps Area and roll receipt', () => {
    const campaign = beginCommunityFinalEncounter(1);
    scriptedD10(1, 2);
    const first = runCommunityFinalFormTurn(campaign, communityFinalFormUnit(campaign.battle!, 'ancestor-second-form')!.id);
    const runtime = first.campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-second-form'];
    const restored = reload(first.campaign);
    setRandomSource(noRng);
    const replay = runCommunityFinalFormTurn(restored, communityFinalFormUnit(restored.battle!, 'ancestor-second-form')!.id);
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-second-form']).toEqual(runtime);
  });

  it('FR-SR-07 Gestating Sispersion physical draw → reload keeps identity / initiative / stance', () => {
    const campaign = driveCommunityFinalToForm(beginCommunityFinalEncounter(0), 'gestating-heart');
    const first = runCommunityFinalFormTurn(campaign, communityFinalFormUnit(campaign.battle!, 'gestating-heart')!.id);
    const record = first.campaign.actFourState.finalFormRuntimeState?.runtimes['gestating-heart'];
    const summons = first.campaign.battle!.monsters.filter((unit) => unit.id.startsWith('final-sispersion-')).map((unit) => ({ id: unit.id, stance: unit.stance, sourceId: unit.sourceId }));
    const restored = reload(first.campaign);
    setRandomSource(noRng);
    const replay = runCommunityFinalFormTurn(restored, communityFinalFormUnit(restored.battle!, 'gestating-heart')!.id);
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.campaign.actFourState.finalFormRuntimeState?.runtimes['gestating-heart']).toEqual(record);
    expect(replay.campaign.battle!.monsters.filter((unit) => unit.id.startsWith('final-sispersion-')).map((unit) => ({ id: unit.id, stance: unit.stance, sourceId: unit.sourceId }))).toEqual(summons);
  });

  it('FR-SR-08 Gestating non-lethal reaction → reload does not repeat Blight/heal', () => {
    const campaign = driveCommunityFinalToForm(beginCommunityFinalEncounter(0), 'gestating-heart');
    const heart = communityFinalFormUnit(campaign.battle!, 'gestating-heart')!;
    const hero = campaign.battle!.heroes[0];
    const first = applyCommunityFinalHeroSkill({
      ...campaign,
      battle: { ...campaign.battle!, activeActorId: hero.id, currentActionPoints: 1 },
    }, hero.id, 'crusader-holy-lance', heart.id);
    const blight = first.campaign.battle!.heroes.find((unit) => unit.id === hero.id)!.blight;
    const hp = communityFinalFormUnit(first.campaign.battle!, 'gestating-heart')!.hp;
    const restored = reload(first.campaign);
    expect(restored.battle!.heroes.find((unit) => unit.id === hero.id)!.blight).toBe(blight);
    expect(communityFinalFormUnit(restored.battle!, 'gestating-heart')!.hp).toBe(hp);
  });

  it('FR-SR-09 Heart initial Impending Doom forecast → reload keeps roll and skill', () => {
    const campaign = driveCommunityFinalToForm(beginCommunityFinalEncounter(2), 'heart-of-darkness');
    const forecast = campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    expect(forecast?.kind === 'heart-of-darkness' && forecast.currentForecast).toBeTruthy();
    const restored = reload(campaign);
    expect(restored.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness']).toEqual(forecast);
  });

  it('FR-SR-10 Heart forecast consumed → reload does not execute the same forecast again', () => {
    const campaign = driveCommunityFinalToForm(beginCommunityFinalEncounter(2), 'heart-of-darkness');
    const first = runCommunityFinalFormTurn(campaign, communityFinalFormUnit(campaign.battle!, 'heart-of-darkness')!.id);
    const events = first.campaign.battle!.communityAttackEvents;
    const restored = reload(first.campaign);
    setRandomSource(noRng);
    const replay = runCommunityFinalFormTurn(restored, communityFinalFormUnit(restored.battle!, 'heart-of-darkness')!.id);
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.campaign.battle!.communityAttackEvents).toEqual(events);
  });

  it('FR-SR-11 Heart action complete + next forecast generated → reload does not reroll', () => {
    const campaign = driveCommunityFinalToForm(beginCommunityFinalEncounter(2), 'heart-of-darkness');
    const first = runCommunityFinalFormTurn(campaign, communityFinalFormUnit(campaign.battle!, 'heart-of-darkness')!.id);
    const next = first.campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    const restored = reload(first.campaign);
    expect(restored.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness']).toEqual(next);
  });

  it('FR-SR-12 Between-form transition completed → reload keeps battleId / room / Hero state', () => {
    const started = beginCommunityFinalEncounter(2);
    const defeated = driveCommunityFinalUntil(started, (campaign) => campaign.actFourState.finalEncounterState?.status === 'transitioning');
    const transition = transitionToNextFinalForm(defeated, { mode: 'community-reference', rng: () => 0.2 });
    expect(transition.ok).toBe(true);
    const restored = reload(transition.campaign);
    expect(restored.battle!.battleId).toBe(transition.campaign.battle!.battleId);
    expect(restored.battle!.sourceRoomId).toBe(transition.campaign.battle!.sourceRoomId);
    expect(restored.heroes.map((hero) => ({ wounds: hero.wounds, stress: hero.stress, stance: hero.stance }))).toEqual(
      transition.campaign.heroes.map((hero) => ({ wounds: hero.wounds, stress: hero.stress, stance: hero.stance })),
    );
  });

  // -----------------------------------------------------------------------
  // Phase 11A.4R2A WP-18：R2A 新增 save/replay 场景。
  // continuous 与 reload 状态等价，且不重复 RNG / effect transaction。
  // -----------------------------------------------------------------------

  it('FR-SR-13 Puncture 完整执行后 → reload 不重复 forecast / damage / Bleed / Stress', () => {
    const campaign = driveCommunityFinalToHeartWithForecast(6);
    const form = communityFinalFormUnit(campaign.battle!, 'heart-of-darkness')!;
    scriptedD10(12, 100, 3); // attack 命中；bleed 抵抗不抵抗；下一 forecast roll 3
    const first = runCommunityFinalFormTurn(campaign, form.id);
    expect(first.skillId).toBe('puncture');
    const event = first.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.hit).toBe(true);
    const target = first.campaign.battle!.heroes.find((unit) => unit.id === event.targetId)!;
    expect(target.bleed).toBe(3);
    const runtime = first.campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    const heroes = heroVectors(first.campaign);
    const restored = reload(first.campaign);
    expect(heroVectors(restored)).toEqual(heroes);
    expect(restored.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness']).toEqual(runtime);
    setRandomSource(noRng);
    const replay = runCommunityFinalFormTurn(restored, form.id);
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.campaign.battle!.communityAttackEvents).toEqual(first.campaign.battle!.communityAttackEvents);
    expect(heroVectors(replay.campaign)).toEqual(heroes);
    expect(replay.campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness']).toEqual(runtime);
  });

  it('FR-SR-14 Dissolution 完整执行后 → reload 不重复 forecast / damage / Blight / Debuff', () => {
    const campaign = driveCommunityFinalToHeartWithForecast(9);
    const form = communityFinalFormUnit(campaign.battle!, 'heart-of-darkness')!;
    scriptedD10(12, 100, 4); // attack 命中；blight 抵抗不抵抗；下一 forecast roll 4
    const first = runCommunityFinalFormTurn(campaign, form.id);
    expect(first.skillId).toBe('dissolution');
    const event = first.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.hit).toBe(true);
    const target = first.campaign.battle!.heroes.find((unit) => unit.id === event.targetId)!;
    expect(target.blight).toBe(3);
    expect(target.debuffs).toHaveLength(1);
    const runtime = first.campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    const heroes = heroVectors(first.campaign);
    const restored = reload(first.campaign);
    expect(heroVectors(restored)).toEqual(heroes);
    expect(restored.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness']).toEqual(runtime);
    setRandomSource(noRng);
    const replay = runCommunityFinalFormTurn(restored, form.id);
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.campaign.battle!.communityAttackEvents).toEqual(first.campaign.battle!.communityAttackEvents);
    expect(heroVectors(replay.campaign)).toEqual(heroes);
  });

  it('FR-SR-15 It Chooses Mark 2t + Debuff → reload 保留 duration 且不重复施加', () => {
    let campaign = beginCommunityFinalEncounter(2);
    const imperfect = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('imperfect'))!;
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        heroes: campaign.battle!.heroes.map((unit) => ({ ...unit, stance: 'support' as const })),
      },
    };
    scriptedD10(2, 11);
    const first = runCommunityFinalFormTurn(campaign, imperfect.id);
    expect(first.skillId).toBe('it-chooses');
    const event = first.campaign.battle!.communityAttackEvents!.at(-1)!;
    const target = first.campaign.battle!.heroes.find((unit) => unit.id === event.targetId)!;
    expect(target.marked).toBe(true);
    expect(target.conditionDurations?.mark).toBe(2);
    expect(target.debuffs).toHaveLength(1);
    const heroes = heroVectors(first.campaign);
    const restored = reload(first.campaign);
    expect(heroVectors(restored)).toEqual(heroes);
    setRandomSource(noRng);
    const replay = runCommunityFinalFormTurn(restored, imperfect.id);
    expect(replay.alreadyProcessed).toBe(true);
    expect(heroVectors(replay.campaign)).toEqual(heroes);
  });

  it('FR-SR-16 Final Monster damage/stress → Form transition → reload 保留全部 Hero combat state', () => {
    let campaign = beginCommunityFinalEncounter(1);
    const form = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('ancestor-second-form'))!;
    const target = [...campaign.battle!.heroes].sort((a, b) => a.position - b.position)[0];
    scriptedD10(10, 12, 100, 10, 10, 10); // Embrace Futility：DMG 2 / Stun 2t / Stress +2 / Push 2
    const acted = runCommunityFinalFormTurn(campaign, form.id);
    expect(acted.skillId).toBe('embrace-futility');
    campaign = acted.campaign;
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        monsters: campaign.battle!.monsters.map((unit) => (unit.id === form.id ? { ...unit, hp: 1 } : unit)),
      },
    };
    const attacker = campaign.battle!.heroes.find((unit) => unit.id !== target.id && unit.position <= 3)!;
    const killed = applyCommunityFinalHeroSkill(
      { ...campaign, battle: { ...campaign.battle!, activeActorId: attacker.id, currentActionPoints: 1 } },
      attacker.id,
      'crusader-holy-lance',
      form.id,
    ).campaign;
    expect(killed.actFourState.finalEncounterState?.status).toBe('transitioning');
    const transition = transitionToNextFinalForm(killed, { mode: 'community-reference', rng: () => 0.4 });
    expect(transition.ok, transition.reason ?? '').toBe(true);
    // transition 后的 Hero combat state（含 damage/stress/stun/push）经 reload 完整保留。
    const heroes = heroVectors(transition.campaign);
    const carried = heroes.find((unit) => unit.id === target.id)!;
    expect(carried.hp).toBe(target.hp - 2);
    expect(carried.stunned).toBe(target.stunned + 2);
    expect(carried.stress).toBe(target.stress + 2);
    const restored = reload(transition.campaign);
    expect(heroVectors(restored)).toEqual(heroes);
    expect(restored.battle!.battleId).toBe(transition.campaign.battle!.battleId);
    // reload 后重复 transition 幂等。
    setRandomSource(noRng);
    const again = transitionToNextFinalForm(restored, { mode: 'community-reference', rng: noRng });
    expect(again.alreadyTransitioned).toBe(true);
    expect(heroVectors(again.campaign)).toEqual(heroes);
  });

  it('FR-SR-17 多目标 Know This → reload 不重复 damage / Stress / Light', () => {
    const base = driveCommunityFinalToHeartWithForecast(2);
    const form = communityFinalFormUnit(base.battle!, 'heart-of-darkness')!;
    const campaign = {
      ...base,
      battle: {
        ...base.battle!,
        heroes: base.battle!.heroes.map((unit) => ({ ...unit, stance: 'aggressive' as const })),
      },
    };
    scriptedD10(12, 5); // attack 命中全部 4 个目标；下一 forecast roll 5
    const first = runCommunityFinalFormTurn(campaign, form.id);
    expect(first.skillId).toBe('know-this');
    for (const before of campaign.battle!.heroes) {
      const after = first.campaign.battle!.heroes.find((unit) => unit.id === before.id)!;
      expect(after.hp).toBe(before.hp - 2);
      expect(after.stress).toBe(before.stress + 3);
    }
    const heroes = heroVectors(first.campaign);
    const light = first.campaign.battle!.light;
    const runtime = first.campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    const restored = reload(first.campaign);
    expect(heroVectors(restored)).toEqual(heroes);
    expect(restored.battle!.light).toBe(light);
    setRandomSource(noRng);
    const replay = runCommunityFinalFormTurn(restored, form.id);
    expect(replay.alreadyProcessed).toBe(true);
    expect(heroVectors(replay.campaign)).toEqual(heroes);
    expect(replay.campaign.battle!.light).toBe(light);
    expect(replay.campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness']).toEqual(runtime);
  });

  it('FR-SR-18 Reflection turn（Reunion）完整执行后 → reload 不重复 damage / Bleed / Stress', () => {
    let campaign = beginCommunityFinalEncounter(2);
    const perfect = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('perfect-reflection'))!;
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        heroes: campaign.battle!.heroes.map((unit) => ({ ...unit, stance: 'aggressive' as const })),
        monsters: campaign.battle!.monsters.map((unit) => (unit.id === perfect.id ? { ...unit, stance: 'support' as const } : unit)),
      },
    };
    scriptedD10(3, 11, 100); // Reunion 命中；bleed 抵抗不抵抗
    const first = runCommunityFinalFormTurn(campaign, perfect.id);
    expect(first.skillId).toBe('reunion');
    const event = first.campaign.battle!.communityAttackEvents!.at(-1)!;
    const target = first.campaign.battle!.heroes.find((unit) => unit.id === event.targetId)!;
    expect(target.bleed).toBe(2);
    const heroes = heroVectors(first.campaign);
    const restored = reload(first.campaign);
    expect(heroVectors(restored)).toEqual(heroes);
    setRandomSource(noRng);
    const replay = runCommunityFinalFormTurn(restored, perfect.id);
    expect(replay.alreadyProcessed).toBe(true);
    expect(heroVectors(replay.campaign)).toEqual(heroes);
  });
});
