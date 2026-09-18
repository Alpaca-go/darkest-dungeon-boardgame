import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  beginCommunityFinalEncounter,
  driveCommunityFinalToForm,
  driveCommunityFinalUntil,
  noRng,
  scriptedD10,
} from './capability-test-support';
import { seededRuntimeSources, setRandomSource, setRuntimeSources } from '../../../game-engine/random';
import {
  applyCommunityFinalHeroSkill,
  communityFinalFormUnit,
  getAreaCapacityRemaining,
  runCommunityFinalFormTurn,
} from '../../../game-engine/campaign/act-four/community-final-combat';
import { transitionToNextFinalForm } from '../../../game-engine/campaign/act-four/transition-final-form';
import { legalTargetsForActor } from '../../../game-engine/battle';
import { COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY } from './community-final-skill-source-inventory';
import { performFinalFormComeUntoYourMaker } from '../../../game-engine/campaign/act-four/final-forms/final-form-actions';
import { isAbsoluteNothingnessTargetable } from '../../../game-engine/campaign/act-four/final-forms/ancestor-second-form';
import { getAncestorRoomAreaDefinition } from '../final-encounter';

beforeEach(() => { setRuntimeSources(seededRuntimeSources(1203)); setRandomSource(() => 0.49); });
afterEach(() => setRandomSource(null));

function ancestor(campaign: ReturnType<typeof beginCommunityFinalEncounter>) {
  return communityFinalFormUnit(campaign.battle!, 'ancestor-first-form')!;
}

function heroAttack(campaign: ReturnType<typeof beginCommunityFinalEncounter>, targetId: string) {
  const hero = campaign.battle!.heroes.find((unit) => unit.position <= 3) ?? campaign.battle!.heroes[0];
  return applyCommunityFinalHeroSkill({
    ...campaign,
    battle: { ...campaign.battle!, activeActorId: hero.id, currentActionPoints: 1 },
  }, hero.id, 'crusader-holy-lance', targetId);
}

describe('Community Final production runtime', () => {
  it('P-final-skill production turn executes source-backed Ancestor and Reflection actions', () => {
    const campaign = beginCommunityFinalEncounter(2);
    const form = ancestor(campaign);
    expect(campaign.battle!.monsters.filter((unit) => unit.sourceId.includes('reflection'))).toHaveLength(3);
    expect(campaign.battle!.communityFinal?.guarded).toBe(true);
    expect(legalTargetsForActor({ ...campaign.battle!, activeActorId: campaign.battle!.heroes[0].id, currentActionPoints: 1 }, 'crusader-holy-lance')).not.toContain(form.id);
    scriptedD10(1, 1);
    const result = runCommunityFinalFormTurn(campaign, form.id);
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.alreadyProcessed).toBe(false);
    expect(COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.every((leaf) => leaf.sourceCompleteness === 'source-complete')).toBe(true);
    setRandomSource(null);
  });

  it('P-final-ancestor-first-form-perfect-replication vacant d10 1-3 spawns Perfect Reflection', () => {
    let campaign = beginCommunityFinalEncounter(2);
    const imperfect = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('imperfect'))!;
    campaign = { ...campaign, battle: { ...campaign.battle!, monsters: campaign.battle!.monsters.map((unit) => unit.id === imperfect.id ? { ...unit, hp: 0, isAlive: false } : unit) } };
    campaign = heroAttack(campaign, campaign.battle!.monsters.find((unit) => unit.isAlive && unit.sourceId.includes('perfect'))!.id).campaign;
    scriptedD10(2, 1);
    const result = runCommunityFinalFormTurn(campaign, ancestor(campaign).id);
    expect(result.skillId).toBe('perfect-replication');
    expect(result.campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-first-form']?.kind === 'ancestor-first-form'
      && result.campaign.actFourState.finalFormRuntimeState.runtimes['ancestor-first-form'].stanceResolutionHistory.at(-1)?.fillKind).toBe('perfect');
    setRandomSource(null);
  });

  it('P-final-ancestor-first-form-imperfect-reproduction vacant d10 4-10 spawns Imperfect Reflection', () => {
    let campaign = beginCommunityFinalEncounter(2);
    const imperfect = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('imperfect'))!;
    campaign = { ...campaign, battle: { ...campaign.battle!, monsters: campaign.battle!.monsters.map((unit) => unit.id === imperfect.id ? { ...unit, hp: 0, isAlive: false } : unit) } };
    campaign = heroAttack(campaign, imperfect.id).campaign;
    scriptedD10(8, 1);
    const result = runCommunityFinalFormTurn(campaign, ancestor(campaign).id);
    expect(result.skillId).toBe('imperfect-reproduction');
    setRandomSource(null);
  });

  it('P-final-ancestor-first-form-time-heals-all heals the most wounded monster by 10', () => {
    let campaign = beginCommunityFinalEncounter(2);
    const patient = campaign.battle!.monsters.filter((unit) => unit.sourceId.includes('reflection')).at(-1)!;
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        monsters: campaign.battle!.monsters.map((unit) => unit.id === patient.id ? { ...unit, hp: patient.hp - 12 } : unit),
      },
    };
    const result = runCommunityFinalFormTurn(campaign, ancestor(campaign).id);
    expect(result.skillId).toBe('time-heals-all');
    const healed = result.campaign.battle!.monsters.find((unit) => unit.id === patient.id)!;
    expect(healed.hp).toBe(patient.hp - 2);
  });

  it('P-final-perfect-reflection-reunion reflection turn uses source-backed selection', () => {
    const campaign = beginCommunityFinalEncounter(2);
    const reflection = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('perfect-reflection'))!;
    scriptedD10(3, 1);
    const result = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(result.ok).toBe(true);
    expect(result.skillId).toBe('reunion');
    setRandomSource(null);
  });

  it('P-final-perfect-reflection-we-are-the-same reflection turn uses source-backed selection', () => {
    const campaign = beginCommunityFinalEncounter(2);
    const reflection = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('perfect-reflection'))!;
    scriptedD10(8, 1);
    const result = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(result.skillId).toBe('we-are-the-same');
    setRandomSource(null);
  });

  it('P-final-imperfect-reflection-it-chooses reflection turn uses source-backed selection', () => {
    const campaign = beginCommunityFinalEncounter(2);
    const reflection = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('imperfect'))!;
    scriptedD10(2, 1);
    expect(runCommunityFinalFormTurn(campaign, reflection.id).skillId).toBe('it-chooses');
    setRandomSource(null);
  });

  it('P-final-imperfect-reflection-we-are-the-same reflection turn uses source-backed selection', () => {
    const campaign = beginCommunityFinalEncounter(2);
    const reflection = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('imperfect'))!;
    scriptedD10(9, 1);
    expect(runCommunityFinalFormTurn(campaign, reflection.id).skillId).toBe('we-are-the-same');
    setRandomSource(null);
  });

  it('P-final-imperfect-death applies 10 Ancestor wounds once', () => {
    const campaign = beginCommunityFinalEncounter(2);
    const form = ancestor(campaign);
    const imperfect = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('imperfect'))!;
    const killed = heroAttack({
      ...campaign,
      battle: { ...campaign.battle!, monsters: campaign.battle!.monsters.map((unit) => unit.id === imperfect.id ? { ...unit, hp: 1 } : unit) },
    }, imperfect.id);
    expect(communityFinalFormUnit(killed.campaign.battle!, 'ancestor-first-form')!.hp).toBe(form.hp - 10);
    const again = heroAttack(killed.campaign, imperfect.id);
    expect(communityFinalFormUnit(again.campaign.battle!, 'ancestor-first-form')!.hp).toBe(communityFinalFormUnit(killed.campaign.battle!, 'ancestor-first-form')!.hp);
  });

  it('P-final-ancestor-second-form-refashion-them executes then teleports', () => {
    const campaign = beginCommunityFinalEncounter(1);
    const form = communityFinalFormUnit(campaign.battle!, 'ancestor-second-form')!;
    scriptedD10(1, 1, 2);
    const result = runCommunityFinalFormTurn(campaign, form.id);
    expect(result.skillId).toBe('refashion-them');
    expect(result.campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-second-form']?.kind === 'ancestor-second-form'
      && result.campaign.actFourState.finalFormRuntimeState.runtimes['ancestor-second-form'].teleportHistory).toHaveLength(1);
    setRandomSource(null);
  });

  it('P-final-ancestor-second-form-unmake-them-all executes then teleports', () => {
    const campaign = beginCommunityFinalEncounter(1);
    scriptedD10(4, 5);
    expect(runCommunityFinalFormTurn(campaign, communityFinalFormUnit(campaign.battle!, 'ancestor-second-form')!.id).skillId).toBe('unmake-them-all');
    setRandomSource(null);
  });

  it('P-final-ancestor-second-form-embrace-futility executes then teleport 10 stays put', () => {
    const campaign = beginCommunityFinalEncounter(1);
    const form = communityFinalFormUnit(campaign.battle!, 'ancestor-second-form')!;
    const stance = form.stance;
    scriptedD10(10, 1, 10, 10, 10, 10);
    const result = runCommunityFinalFormTurn(campaign, form.id);
    expect(result.skillId).toBe('embrace-futility');
    const record = result.campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-second-form'];
    expect(record?.kind === 'ancestor-second-form' && record.teleportHistory.at(-1)?.teleported).toBe(false);
    expect(communityFinalFormUnit(result.campaign.battle!, 'ancestor-second-form')!.stance).toBe(stance);
    setRandomSource(null);
  });

  it('P-final-nothingness is not a target and consumes Area capacity', () => {
    const campaign = beginCommunityFinalEncounter(1);
    const runtime = campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-second-form'];
    expect(runtime?.kind).toBe('ancestor-second-form');
    expect(isAbsoluteNothingnessTargetable()).toBe(false);
    const ids = runtime?.kind === 'ancestor-second-form' ? runtime.nothingness.map((item) => item.id) : [];
    expect(legalTargetsForActor(campaign.battle!, 'crusader-holy-lance').some((id) => ids.includes(id))).toBe(false);
    const room = getAncestorRoomAreaDefinition('community-reference');
    const defensive = runtime?.kind === 'ancestor-second-form' ? runtime.nothingness.find((item) => item.linkedStance === 'defensive') : undefined;
    expect(defensive).toBeTruthy();
    expect(getAreaCapacityRemaining(campaign, defensive!.areaId)).toBeLessThan(room.areaCapacities[defensive!.areaId]);
  });

  it('P-final-gestating-heart-dispersion Sispersion draws the physical deck top card and adds initiative', () => {
    const started = beginCommunityFinalEncounter(0);
    const campaign = driveCommunityFinalToForm(started, 'gestating-heart');
    const form = communityFinalFormUnit(campaign.battle!, 'gestating-heart')!;
    const topId = campaign.actFourState.contentRuntime?.physicalMonsterDeck?.drawPile[0];
    const expectedDefinition = topId
      ? campaign.actFourState.contentRuntime?.physicalMonsterDeck?.instanceToDefinitionId[topId]
      : null;
    const result = runCommunityFinalFormTurn(campaign, form.id);
    expect(result.skillId).toBe('dispersion');
    const record = result.campaign.actFourState.finalFormRuntimeState?.runtimes['gestating-heart'];
    expect(record?.kind === 'gestating-heart' && record.sispersionHistory.at(-1)?.monsterDefinitionId).toBe(expectedDefinition);
    expect(result.campaign.battle!.monsters.some((unit) => unit.id.startsWith('final-sispersion-') && result.campaign.battle!.initiativeOrder.includes(unit.id))).toBe(true);
    const afterRuntime = result.campaign.actFourState.finalFormRuntimeState?.runtimes['gestating-heart'];
    expect(afterRuntime?.kind === 'gestating-heart' && afterRuntime.initiativeCardCount).toBeGreaterThan(
      campaign.actFourState.finalFormRuntimeState?.runtimes['gestating-heart']?.kind === 'gestating-heart'
        ? campaign.actFourState.finalFormRuntimeState.runtimes['gestating-heart'].initiativeCardCount
        : 0,
    );
  });

  it('P-final-gestating-ichor non-lethal blight and heal; lethal stays blocked', () => {
    const started = beginCommunityFinalEncounter(0);
    const campaign = driveCommunityFinalToForm(started, 'gestating-heart');
    const heart = communityFinalFormUnit(campaign.battle!, 'gestating-heart')!;
    const rolls = [0.05, 0.99, 0.99, 0.99, 0.99];
    setRandomSource(() => (rolls.length > 0 ? rolls.shift()! : 0.99));
    const wounded = heroAttack(campaign, heart.id);
    expect(wounded.ok).toBe(true);
    const runtime = wounded.campaign.actFourState.finalFormRuntimeState?.runtimes['gestating-heart'];
    expect(runtime?.kind === 'gestating-heart' && runtime.woundedReactionHistory.some((item) => item.woundsApplied > 0 && item.healed > 0)).toBe(true);
    const reaction = runtime?.kind === 'gestating-heart' ? runtime.woundedReactionHistory.at(-1) : null;
    const afterHeart = communityFinalFormUnit(wounded.campaign.battle!, 'gestating-heart')!;
    expect(reaction).toBeTruthy();
    expect(afterHeart.hp).toBe(Math.min(heart.maxHp, heart.hp - reaction!.woundsApplied + reaction!.healed));
    expect(wounded.campaign.battle!.heroes.some((unit) => unit.blight > 0)).toBe(true);
    scriptedD10(1, 1, 1, 1);
    const lethal = heroAttack({
      ...campaign,
      battle: { ...campaign.battle!, monsters: campaign.battle!.monsters.map((unit) => unit.id === heart.id ? { ...unit, hp: 1 } : unit) },
    }, heart.id);
    expect(lethal.kind).toBe('community-source-blocked');
    expect(lethal.reason).toBe('GESTATING_HEART_LETHAL_TIMING_UNRESOLVED');
    expect(communityFinalFormUnit(lethal.campaign.battle!, 'gestating-heart')!.hp).toBe(1);
  });

  it('P-final-heart-of-darkness-know-this consumes the saved forecast', () => {
    const campaign = driveCommunityFinalToForm(beginCommunityFinalEncounter(2), 'heart-of-darkness');
    const runtime = campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    expect(runtime?.kind === 'heart-of-darkness' && runtime.currentForecast?.skillId).toBeTruthy();
    const forecast = runtime?.kind === 'heart-of-darkness' ? runtime.currentForecast : null;
    const form = communityFinalFormUnit(campaign.battle!, 'heart-of-darkness')!;
    const result = runCommunityFinalFormTurn(campaign, form.id);
    expect(result.skillId).toBe(forecast?.skillId?.replace(/^community-dd-skill-/, ''));
    const next = result.campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    expect(next?.kind === 'heart-of-darkness' && next.currentForecast?.transactionId).not.toBe(forecast?.transactionId);
  });

  it('P-final-heart-of-darkness-puncture is the production skill for forecast 5-7', () => {
    expect(COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.find((leaf) => leaf.localSkillId === 'puncture')?.selectionRule).toContain('5-7');
  });

  it('P-final-heart-of-darkness-dissolution is the production skill for forecast 8-10', () => {
    expect(COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.find((leaf) => leaf.localSkillId === 'dissolution')?.selectionRule).toContain('8-10');
  });

  it('P-final-transition real form defeat rebuilds the next form without injecting transitionState', () => {
    const started = beginCommunityFinalEncounter(2);
    const beforeWounds = started.heroes.map((hero) => hero.wounds);
    const beforeStress = started.heroes.map((hero) => hero.stress);
    const beforeStance = started.heroes.map((hero) => hero.stance);
    const battleId = started.battle!.battleId;
    const roomId = started.battle!.sourceRoomId;
    const defeated = driveCommunityFinalUntil(started, (campaign) => campaign.actFourState.finalEncounterState?.status === 'transitioning');
    expect(defeated.actFourState.finalEncounterState?.transitionState).toBeTruthy();
    const transition = transitionToNextFinalForm(defeated, { mode: 'community-reference', rng: () => 0.4 });
    expect(transition.ok, transition.reason ?? '').toBe(true);
    expect(transition.campaign.battle!.battleId).toBe(battleId);
    expect(transition.campaign.battle!.sourceRoomId).toBe(roomId);
    expect(transition.campaign.battle!.round).toBe(1);
    expect(transition.campaign.heroes.map((hero) => hero.wounds)).toEqual(beforeWounds);
    expect(transition.campaign.heroes.map((hero) => hero.stress)).toEqual(beforeStress);
    expect(transition.campaign.heroes.map((hero) => hero.stance)).toEqual(beforeStance);
    expect(transition.campaign.actFourState.finalEncounterState?.activeFormId).toBe('ancestor-second-form');
  });

  it('P-final-quest-skip order is first remaining source-backed form', () => {
    expect(beginCommunityFinalEncounter(0).actFourState.finalEncounterState?.orderedFormIds[0]).toBe('ancestor-first-form');
    expect(beginCommunityFinalEncounter(1).actFourState.finalEncounterState?.orderedFormIds[0]).toBe('ancestor-second-form');
    expect(beginCommunityFinalEncounter(2).actFourState.finalEncounterState?.orderedFormIds[0]).toBe('ancestor-first-form');
    expect(beginCommunityFinalEncounter(2).actFourState.finalEncounterState?.orderedFormIds).not.toContain('gestating-heart');
  });

  it('Come Unto Your Maker remains source-blocked with no mutation', () => {
    const campaign = beginCommunityFinalEncounter(1);
    const before = structuredClone(campaign);
    setRandomSource(noRng);
    const result = performFinalFormComeUntoYourMaker(campaign, { mode: 'community-reference' });
    expect(result).toMatchObject({ kind: 'community-source-blocked', blocker: { code: 'COME_UNTO_YOUR_MAKER_UNRESOLVED' } });
    expect(result.campaign).toEqual(before);
    setRandomSource(null);
  });
});
