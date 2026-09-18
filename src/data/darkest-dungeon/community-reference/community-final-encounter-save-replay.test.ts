import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  beginCommunityFinalEncounter,
  driveCommunityFinalToForm,
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
});
