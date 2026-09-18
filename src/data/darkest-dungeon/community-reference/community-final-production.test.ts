import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  beginCommunityFinalEncounter,
  driveCommunityFinalToForm,
  driveCommunityFinalToHeartWithForecast,
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
    // WP-7 Reunion 完整语义（Unmarked case）：d10 1-5 / marked-then-closest / range 1+Speed 2 / ACC 11 / DMG 5 / Bleed 2/3 / Stress +1。
    let campaign = beginCommunityFinalEncounter(2);
    const reflection = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('perfect-reflection'))!;
    // Reflection 置于 monster:support（r12-S，距 r12-SE = 1），全部 Hero 置于 r12-SE → 全部合法。
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        heroes: campaign.battle!.heroes.map((unit) => ({ ...unit, stance: 'aggressive' as const })),
        monsters: campaign.battle!.monsters.map((unit) => (unit.id === reflection.id ? { ...unit, stance: 'support' as const } : unit)),
      },
    };
    const target = [...campaign.battle!.heroes].sort((a, b) => a.position - b.position)[0];
    expect(target.marked).toBe(false);
    scriptedD10(3, 11, 100); // skill 3 → Reunion；attack 11 ≤ ACC 11 命中（crit threshold 1 不触发）；bleed 抵抗检定不抵抗
    const result = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.skillId).toBe('reunion');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.skillRoll).toBe(3);
    expect(event.attackRoll).toBe(11);
    expect(event.hit).toBe(true);
    expect(event.critical).toBe(false);
    expect(event.damage).toBe(5); // source DMG 5，未标记无 +3
    expect(event.targetId).toBe(target.id);
    const after = result.campaign.battle!.heroes.find((unit) => unit.id === target.id)!;
    expect(after.hp).toBe(target.hp - 5);
    expect(after.bleed).toBe(2); // Bleed 2/3
    expect(after.conditionDurations?.bleed).toBe(3);
    expect(after.stress).toBe(target.stress + 1); // Stress +1
    expect(result.campaign.heroes.find((hero) => hero.instanceId === target.sourceId)!.stress).toBe(target.stress + 1);
    setRandomSource(null);
  });

  it('P-final-perfect-reflection-reunion marked target takes +3 damage and crit follows source', () => {
    // WP-7 Reunion Marked case：marked-then-closest 优先选被标记者（即使不是 closest）；Marked +3（5→8）；crit 1 → 8+3=11。
    const base = beginCommunityFinalEncounter(2);
    const reflection = base.battle!.monsters.find((unit) => unit.sourceId.includes('perfect-reflection'))!;
    const markedHero = [...base.battle!.heroes].sort((a, b) => b.position - a.position)[0]; // 标记最远者，验证 policy 优先 marked
    const campaign = {
      ...base,
      battle: {
        ...base.battle!,
        heroes: base.battle!.heroes.map((unit) => ({ ...unit, stance: 'aggressive' as const, marked: unit.id === markedHero.id })),
        monsters: base.battle!.monsters.map((unit) => (unit.id === reflection.id ? { ...unit, stance: 'support' as const } : unit)),
      },
    };
    scriptedD10(2, 11, 100); // 非 crit 命中：Marked +3 → 8
    const hit = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(hit.skillId).toBe('reunion');
    const hitEvent = hit.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(hitEvent.targetId).toBe(markedHero.id); // marked 优先于 closest
    expect(hitEvent.critical).toBe(false);
    expect(hitEvent.damage).toBe(8); // 5 + marked 3
    expect(hit.campaign.battle!.heroes.find((unit) => unit.id === markedHero.id)!.hp).toBe(markedHero.hp - 8);
    setRandomSource(null);
    scriptedD10(4, 1, 100); // attack roll 1 ≤ crit threshold 1 → crit：8 + marked 3 = 11
    const crit = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(crit.skillId).toBe('reunion');
    const critEvent = crit.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(critEvent.critical).toBe(true);
    expect(critEvent.damage).toBe(11);
    expect(crit.campaign.battle!.heroes.find((unit) => unit.id === markedHero.id)!.hp).toBe(markedHero.hp - 11);
    setRandomSource(null);
  });

  it('P-final-perfect-reflection-we-are-the-same reflection turn uses source-backed selection', () => {
    // WP-7 Perfect—We Are the Same：d10 6-10 / Most Stressed target / range 0-10 / DMG 2 / crit 3 / Stress +2。
    const base = beginCommunityFinalEncounter(2);
    const reflection = base.battle!.monsters.find((unit) => unit.sourceId.includes('perfect-reflection'))!;
    const stresses = [1, 5, 3, 2];
    const campaign = {
      ...base,
      heroes: base.heroes.map((hero) => {
        const index = base.battle!.heroes.findIndex((unit) => unit.sourceId === hero.instanceId);
        return index >= 0 ? { ...hero, stress: stresses[index] } : hero;
      }),
      battle: {
        ...base.battle!,
        heroes: base.battle!.heroes.map((unit, index) => ({ ...unit, stress: stresses[index] })),
      },
    };
    const target = campaign.battle!.heroes[1]; // stress 5 = most stressed
    scriptedD10(7, 12); // skill 7 → We Are the Same；attack 12 = ACC 12 命中（非 crit）
    const result = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.skillId).toBe('we-are-the-same');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.skillRoll).toBe(7);
    expect(event.attackRoll).toBe(12);
    expect(event.hit).toBe(true);
    expect(event.critical).toBe(false);
    expect(event.damage).toBe(2); // source DMG 2
    expect(event.targetId).toBe(target.id);
    const after = result.campaign.battle!.heroes.find((unit) => unit.id === target.id)!;
    expect(after.hp).toBe(target.hp - 2);
    expect(after.stress).toBe(5 + 2); // Stress +2（共享管线同步 battle/campaign）
    expect(result.campaign.heroes.find((hero) => hero.instanceId === target.sourceId)!.stress).toBe(7);
    // crit：attack roll 1 ≤ threshold 1 → crit damage 3
    scriptedD10(9, 1);
    const crit = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(crit.skillId).toBe('we-are-the-same');
    const critEvent = crit.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(critEvent.critical).toBe(true);
    expect(critEvent.damage).toBe(3);
    setRandomSource(null);
  });

  it('P-final-imperfect-reflection-it-chooses reflection turn uses source-backed selection', () => {
    // WP-7 It Chooses：d10 1-5 / closest / range 1+Speed 2 / ACC 11 / DMG 2 / crit threshold 0（永不暴击）/ Mark 2t / Debuff 1t。
    let campaign = beginCommunityFinalEncounter(2);
    const reflection = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('imperfect'))!;
    // Imperfect 在 monster:defensive（r12-N）；Hero 置于 hero:support（r12-NE，距 r12-N = 1）→ 全部合法。
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        heroes: campaign.battle!.heroes.map((unit) => ({ ...unit, stance: 'support' as const })),
      },
    };
    const target = [...campaign.battle!.heroes].sort((a, b) => a.position - b.position)[0];
    scriptedD10(2, 11); // skill 2 → It Chooses；attack 11 ≤ ACC 11 命中（非 crit）
    const result = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.skillId).toBe('it-chooses');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.skillRoll).toBe(2);
    expect(event.attackRoll).toBe(11);
    expect(event.hit).toBe(true);
    expect(event.critical).toBe(false);
    expect(event.damage).toBe(2); // source DMG 2
    expect(event.targetId).toBe(target.id);
    const after = result.campaign.battle!.heroes.find((unit) => unit.id === target.id)!;
    expect(after.hp).toBe(target.hp - 2);
    expect(after.marked).toBe(true); // Mark 2 turns（WP-8 共享管线）
    expect(after.conditionDurations?.mark).toBe(2);
    expect(after.debuffs).toHaveLength(1); // Debuff 1 turn
    expect(after.debuffs[0].durationTurns).toBe(1);
    // crit threshold 0 → 即使 attack roll 1 也不暴击（source crit behavior）
    scriptedD10(5, 1);
    const lowRoll = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(lowRoll.skillId).toBe('it-chooses');
    const lowEvent = lowRoll.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(lowEvent.attackRoll).toBe(1);
    expect(lowEvent.hit).toBe(true);
    expect(lowEvent.critical).toBe(false);
    expect(lowEvent.damage).toBe(2);
    setRandomSource(null);
  });

  it('P-final-imperfect-reflection-we-are-the-same reflection turn uses source-backed selection', () => {
    // WP-7 Imperfect—We Are the Same：d10 6-10 / Most Stressed / range 2+Speed 2 / ACC 12 / DMG 2 / crit threshold 0 / Stress +1。
    const base = beginCommunityFinalEncounter(2);
    const reflection = base.battle!.monsters.find((unit) => unit.sourceId.includes('imperfect'))!;
    const stresses = [1, 5, 3, 2];
    const campaign = {
      ...base,
      heroes: base.heroes.map((hero) => {
        const index = base.battle!.heroes.findIndex((unit) => unit.sourceId === hero.instanceId);
        return index >= 0 ? { ...hero, stress: stresses[index] } : hero;
      }),
      battle: {
        ...base.battle!,
        heroes: base.battle!.heroes.map((unit, index) => ({ ...unit, stress: stresses[index] })),
      },
    };
    const target = campaign.battle!.heroes[1]; // stress 5 = most stressed
    scriptedD10(9, 12); // skill 9 → We Are the Same；attack 12 ≤ ACC 12 命中（非 crit）
    const result = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.skillId).toBe('we-are-the-same');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.skillRoll).toBe(9);
    expect(event.attackRoll).toBe(12);
    expect(event.hit).toBe(true);
    expect(event.critical).toBe(false);
    expect(event.damage).toBe(2); // source DMG 2
    expect(event.targetId).toBe(target.id);
    const after = result.campaign.battle!.heroes.find((unit) => unit.id === target.id)!;
    expect(after.hp).toBe(target.hp - 2);
    expect(after.stress).toBe(5 + 1); // Stress +1（共享管线同步 battle/campaign）
    expect(result.campaign.heroes.find((hero) => hero.instanceId === target.sourceId)!.stress).toBe(6);
    // crit threshold 0 → attack roll 1 也不暴击
    scriptedD10(6, 1);
    const lowRoll = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(lowRoll.skillId).toBe('we-are-the-same');
    const lowEvent = lowRoll.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(lowEvent.attackRoll).toBe(1);
    expect(lowEvent.critical).toBe(false);
    expect(lowEvent.damage).toBe(2);
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
    // WP-9 Refashion Them 完整语义：d10 1-2 / crowded multi-target 2 / range 1+Speed 3 / ACC 12 / DMG 9 /
    // Bleed 3/3 / Stress +1 / Light -1 / action-end teleport。
    const base = beginCommunityFinalEncounter(1);
    const form = communityFinalFormUnit(base.battle!, 'ancestor-second-form')!;
    // crowded：2 个 Hero 在 r12-SE（aggressive），其余分散 → 选中 SE 组内 position 最小的 2 个。
    const stances = ['aggressive', 'support', 'aggressive', 'defensive'] as const;
    const campaign = {
      ...base,
      battle: {
        ...base.battle!,
        heroes: base.battle!.heroes.map((unit, index) => ({ ...unit, stance: stances[index] })),
      },
    };
    const targets = campaign.battle!.heroes.filter((_, index) => stances[index] === 'aggressive');
    expect(targets).toHaveLength(2);
    const lightBefore = campaign.battle!.light ?? 0;
    scriptedD10(1, 12, 100, 100, 7); // skill 1；attack 12 ≤ ACC 12 命中（> crit threshold 2）；2× bleed 抵抗不抵抗；teleport 7
    const result = runCommunityFinalFormTurn(campaign, form.id);
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.skillId).toBe('refashion-them');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.skillRoll).toBe(1);
    expect(event.attackRoll).toBe(12);
    expect(event.hit).toBe(true);
    expect(event.critical).toBe(false);
    expect(event.damage).toBe(9); // source DMG 9
    expect(event.targetId).toBe(targets[0].id);
    // 多目标：验证每个被命中目标的实际状态。
    for (const target of targets) {
      const after = result.campaign.battle!.heroes.find((unit) => unit.id === target.id)!;
      expect(after.hp, `${after.id} hp`).toBe(target.hp - 9);
      expect(after.bleed, `${after.id} bleed`).toBe(3); // Bleed 3/3
      expect(after.conditionDurations?.bleed).toBe(3);
      expect(after.stress, `${after.id} stress`).toBe(target.stress + 1); // Stress +1
      expect(result.campaign.heroes.find((hero) => hero.instanceId === target.sourceId)!.stress).toBe(target.stress + 1);
    }
    const untouched = campaign.battle!.heroes.filter((_, index) => stances[index] !== 'aggressive');
    for (const unit of untouched) {
      const after = result.campaign.battle!.heroes.find((candidate) => candidate.id === unit.id)!;
      expect(after.hp, `${unit.id} outside crowded area`).toBe(unit.hp);
    }
    expect(result.campaign.battle!.light).toBe(lightBefore - 1); // Light -1
    const record = result.campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-second-form'];
    expect(record?.kind === 'ancestor-second-form' && record.teleportHistory).toHaveLength(1); // action-end teleport
    setRandomSource(null);
  });

  it('P-final-ancestor-second-form-refashion-them crit deals source crit damage to every target', () => {
    const base = beginCommunityFinalEncounter(1);
    const form = communityFinalFormUnit(base.battle!, 'ancestor-second-form')!;
    const campaign = {
      ...base,
      battle: {
        ...base.battle!,
        heroes: base.battle!.heroes.map((unit) => ({ ...unit, stance: 'aggressive' as const })),
      },
    };
    const targets = [...campaign.battle!.heroes].sort((a, b) => a.position - b.position).slice(0, 2); // crowded 全在 SE，取前 2
    scriptedD10(2, 2, 100, 100, 5); // attack roll 2 ≤ crit threshold 2 → crit 16
    const result = runCommunityFinalFormTurn(campaign, form.id);
    expect(result.skillId).toBe('refashion-them');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.critical).toBe(true);
    expect(event.damage).toBe(16); // source crit damage 16
    for (const target of targets) {
      expect(result.campaign.battle!.heroes.find((unit) => unit.id === target.id)!.hp).toBe(target.hp - 16);
    }
    setRandomSource(null);
  });

  it('P-final-ancestor-second-form-unmake-them-all executes then teleports', () => {
    // WP-9 Unmake Them All：d10 3-6 / furthest / range 2 / ACC 12 / DMG 4 / crit 1→8 / Bleed 2/4 / Stress +1 / teleport。
    const campaign = beginCommunityFinalEncounter(1);
    const form = communityFinalFormUnit(campaign.battle!, 'ancestor-second-form')!;
    const target = [...campaign.battle!.heroes].sort((a, b) => b.position - a.position)[0];
    scriptedD10(4, 12, 100, 3); // skill 4；attack 12 命中（非 crit）；bleed 抵抗不抵抗；teleport 3
    const result = runCommunityFinalFormTurn(campaign, form.id);
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.skillId).toBe('unmake-them-all');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.skillRoll).toBe(4);
    expect(event.attackRoll).toBe(12);
    expect(event.hit).toBe(true);
    expect(event.critical).toBe(false);
    expect(event.damage).toBe(4); // source DMG 4
    expect(event.targetId).toBe(target.id);
    const after = result.campaign.battle!.heroes.find((unit) => unit.id === target.id)!;
    expect(after.hp).toBe(target.hp - 4);
    expect(after.bleed).toBe(2); // Bleed 2/4
    expect(after.conditionDurations?.bleed).toBe(4);
    expect(after.stress).toBe(target.stress + 1); // Stress +1
    expect(result.campaign.heroes.find((hero) => hero.instanceId === target.sourceId)!.stress).toBe(target.stress + 1);
    const record = result.campaign.actFourState.finalFormRuntimeState?.runtimes['ancestor-second-form'];
    expect(record?.kind === 'ancestor-second-form' && record.teleportHistory).toHaveLength(1); // action-end teleport
    // crit：attack roll 1 ≤ threshold 1 → crit damage 8
    scriptedD10(6, 1, 100, 3);
    const crit = runCommunityFinalFormTurn(campaign, form.id);
    expect(crit.skillId).toBe('unmake-them-all');
    const critEvent = crit.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(critEvent.critical).toBe(true);
    expect(critEvent.damage).toBe(8);
    setRandomSource(null);
  });

  it('P-final-ancestor-second-form-embrace-futility executes then teleport 10 stays put', () => {
    // WP-9 Embrace Futility：d10 7-10 / closest / range 0（须落进目标 Area）/ ACC 12 / DMG 2 /
    // crit threshold 0 / Stun 2 turns / Stress +2 / Push 2 / action-end teleport（10 = 原地）。
    const campaign = beginCommunityFinalEncounter(1);
    const form = communityFinalFormUnit(campaign.battle!, 'ancestor-second-form')!;
    const stance = form.stance;
    const target = [...campaign.battle!.heroes].sort((a, b) => a.position - b.position)[0];
    scriptedD10(10, 12, 100, 10, 10, 10); // skill 10；attack 12 命中；stun 抵抗不抵抗；teleport 10 原地
    const result = runCommunityFinalFormTurn(campaign, form.id);
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.skillId).toBe('embrace-futility');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.skillRoll).toBe(10);
    expect(event.attackRoll).toBe(12);
    expect(event.hit).toBe(true);
    expect(event.critical).toBe(false);
    expect(event.damage).toBe(2); // source DMG 2
    expect(event.targetId).toBe(target.id);
    const after = result.campaign.battle!.heroes.find((unit) => unit.id === target.id)!;
    expect(after.hp).toBe(target.hp - 2);
    expect(after.stunned).toBe(target.stunned + 2); // Stun 2 turns
    expect(after.conditionDurations?.stun).toBe(2);
    expect(after.stress).toBe(target.stress + 2); // Stress +2
    expect(result.campaign.heroes.find((hero) => hero.instanceId === target.sourceId)!.stress).toBe(target.stress + 2);
    expect(after.position).toBe(Math.min(4, target.position + 2)); // Push 2
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
    // WP-6 完整语义：target policy（crowded）/ target count / range / damage / crit / Stress +3 / Light -1。
    const campaign = driveCommunityFinalToHeartWithForecast(2);
    const runtime = campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    const forecast = runtime?.kind === 'heart-of-darkness' ? runtime.currentForecast : null;
    expect(forecast?.skillId).toBe('community-dd-skill-know-this');
    const form = communityFinalFormUnit(campaign.battle!, 'heart-of-darkness')!;
    // 全部 Hero 同一 Area（aggressive → r12-SE）→ crowded 命中全部 4 个（multiTargetCount 4）。
    const setup = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        heroes: campaign.battle!.heroes.map((unit) => ({ ...unit, stance: 'aggressive' as const })),
      },
    };
    const before = setup.battle!.heroes.map((unit) => ({ id: unit.id, hp: unit.hp, stress: unit.stress }));
    const lightBefore = setup.battle!.light ?? 0;
    scriptedD10(12, 5); // attack roll 12 = ACC 12 命中（非 crit）；action 完成后下一 forecast roll 5
    const result = runCommunityFinalFormTurn(setup, form.id);
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.skillId).toBe('know-this');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.skillRoll).toBe(2); // 消费保存的 forecast roll，绝不重掷
    expect(event.attackRoll).toBe(12);
    expect(event.hit).toBe(true);
    expect(event.critical).toBe(false);
    expect(event.damage).toBe(2); // source DMG 2
    // 多目标：验证所有被命中目标的实际状态（不是只记录一个 targetId）。
    expect(before).toHaveLength(4);
    for (const prior of before) {
      const after = result.campaign.battle!.heroes.find((unit) => unit.id === prior.id)!;
      expect(after.hp, `${after.id} hp`).toBe(prior.hp - 2);
      expect(after.stress, `${after.id} stress`).toBe(prior.stress + 3); // Stress +3
      const hero = result.campaign.heroes.find((candidate) => candidate.instanceId === after.sourceId)!;
      expect(hero.stress, `${after.id} campaign stress sync`).toBe(prior.stress + 3);
    }
    expect(result.campaign.battle!.light).toBe(lightBefore - 1); // Light -1
    // action complete 后才生成下一 forecast；原 forecast 已消费且未重掷。
    const next = result.campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    expect(next?.kind === 'heart-of-darkness' && next.currentForecast?.transactionId).not.toBe(forecast?.transactionId);
    expect(next?.kind === 'heart-of-darkness' && next.currentForecast?.roll).toBe(5);
    expect(next?.kind === 'heart-of-darkness' && next.consumedForecastCount).toBe(1);
    expect(next?.kind === 'heart-of-darkness' && next.forecastHistory[0]?.consumed).toBe(true);
    setRandomSource(null);
  });

  it('P-final-heart-of-darkness-know-this crit and crowded-area selection follow source semantics', () => {
    const campaign = driveCommunityFinalToHeartWithForecast(4); // 1-4 → Know This
    const form = communityFinalFormUnit(campaign.battle!, 'heart-of-darkness')!;
    // 2 个 Hero 在 r12-SE（aggressive）、1 个在 r12-SW（defensive）、1 个在 r12-NE（support）
    // → crowded 选中 r12-SE 的 2 个；crit threshold 1 → attack roll 1 暴击，DMG 3。
    const stances = ['aggressive', 'defensive', 'support', 'aggressive'] as const;
    const setup = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        heroes: campaign.battle!.heroes.map((unit, index) => ({ ...unit, stance: stances[index] })),
      },
    };
    const crowdedIds = setup.battle!.heroes.filter((_, index) => stances[index] === 'aggressive').map((unit) => unit.id);
    const outside = setup.battle!.heroes.filter((_, index) => stances[index] !== 'aggressive');
    expect(crowdedIds).toHaveLength(2);
    scriptedD10(1, 7); // attack roll 1 ≤ crit threshold 1 → crit；下一 forecast roll 7
    const result = runCommunityFinalFormTurn(setup, form.id);
    expect(result.skillId).toBe('know-this');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.critical).toBe(true);
    expect(event.damage).toBe(3); // source crit damage 3
    for (const id of crowdedIds) {
      const beforeUnit = setup.battle!.heroes.find((unit) => unit.id === id)!;
      const after = result.campaign.battle!.heroes.find((unit) => unit.id === id)!;
      expect(after.hp).toBe(beforeUnit.hp - 3);
      expect(after.stress).toBe(beforeUnit.stress + 3);
    }
    for (const unit of outside) {
      const after = result.campaign.battle!.heroes.find((candidate) => candidate.id === unit.id)!;
      expect(after.hp, `${unit.id} outside crowded area must be untouched`).toBe(unit.hp);
      expect(after.stress).toBe(unit.stress);
    }
    setRandomSource(null);
  });

  it('P-final-heart-of-darkness-puncture is the production skill for forecast 5-7', () => {
    // WP-4 真实路径：Heart setup → Impending Doom 6 → save forecast → Heart turn → consume → Puncture。
    const campaign = driveCommunityFinalToHeartWithForecast(6);
    const runtime = campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    const forecast = runtime?.kind === 'heart-of-darkness' ? runtime.currentForecast : null;
    expect(forecast?.skillId).toBe('community-dd-skill-puncture');
    const form = communityFinalFormUnit(campaign.battle!, 'heart-of-darkness')!;
    // range 0-10 → 全部 Hero 合法；target policy closest → position 最小者。
    const target = [...campaign.battle!.heroes].sort((a, b) => a.position - b.position)[0];
    scriptedD10(12, 100, 3); // attack 12 命中；bleed 抵抗检定 d100=100 不抵抗；下一 forecast roll 3
    const result = runCommunityFinalFormTurn(campaign, form.id);
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.skillId).toBe('puncture');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.skillRoll).toBe(6); // 消费保存的 forecast，不重掷
    expect(event.attackRoll).toBe(12);
    expect(event.hit).toBe(true);
    expect(event.critical).toBe(false);
    expect(event.damage).toBe(14); // source DMG 14
    expect(event.targetId).toBe(target.id);
    const after = result.campaign.battle!.heroes.find((unit) => unit.id === target.id)!;
    expect(after.hp).toBe(target.hp - 14);
    expect(after.bleed).toBe(3); // Bleed 3/3
    expect(after.conditionDurations?.bleed).toBe(3);
    expect(after.stress).toBe(target.stress + 1); // Stress +1
    expect(result.campaign.heroes.find((hero) => hero.instanceId === target.sourceId)!.stress).toBe(target.stress + 1);
    // action complete 后才生成下一 forecast。
    const next = result.campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    expect(next?.kind === 'heart-of-darkness' && next.currentForecast?.roll).toBe(3);
    expect(next?.kind === 'heart-of-darkness' && next.currentForecast?.transactionId).not.toBe(forecast?.transactionId);
    expect(next?.kind === 'heart-of-darkness' && next.forecastHistory[0]?.consumed).toBe(true);
    setRandomSource(null);
  });

  it('P-final-heart-of-darkness-puncture crit deals the source crit damage', () => {
    const campaign = driveCommunityFinalToHeartWithForecast(7); // 5-7 → Puncture
    const form = communityFinalFormUnit(campaign.battle!, 'heart-of-darkness')!;
    const target = [...campaign.battle!.heroes].sort((a, b) => a.position - b.position)[0];
    scriptedD10(2, 100, 3); // attack roll 2 ≤ crit threshold 2 → crit；bleed 抵抗检定不抵抗
    const result = runCommunityFinalFormTurn(campaign, form.id);
    expect(result.skillId).toBe('puncture');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.critical).toBe(true);
    expect(event.damage).toBe(18); // source crit damage 18
    const after = result.campaign.battle!.heroes.find((unit) => unit.id === target.id)!;
    expect(after.hp).toBe(target.hp - 18);
    setRandomSource(null);
  });

  it('P-final-heart-of-darkness-dissolution is the production skill for forecast 8-10', () => {
    // WP-5 真实路径：Impending Doom 8-10 → saved forecast → Heart turn → Dissolution。
    const campaign = driveCommunityFinalToHeartWithForecast(9);
    const runtime = campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    const forecast = runtime?.kind === 'heart-of-darkness' ? runtime.currentForecast : null;
    expect(forecast?.skillId).toBe('community-dd-skill-dissolution');
    const form = communityFinalFormUnit(campaign.battle!, 'heart-of-darkness')!;
    // target policy furthest → position 最大者。
    const target = [...campaign.battle!.heroes].sort((a, b) => b.position - a.position)[0];
    scriptedD10(12, 100, 4); // attack 12 命中；blight 抵抗检定 d100=100 不抵抗；下一 forecast roll 4
    const result = runCommunityFinalFormTurn(campaign, form.id);
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.skillId).toBe('dissolution');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.skillRoll).toBe(9); // exact forecast consumed
    expect(event.attackRoll).toBe(12);
    expect(event.hit).toBe(true);
    expect(event.critical).toBe(false);
    expect(event.damage).toBe(14); // source DMG 14
    expect(event.targetId).toBe(target.id);
    const after = result.campaign.battle!.heroes.find((unit) => unit.id === target.id)!;
    expect(after.hp).toBe(target.hp - 14);
    expect(after.debuffs).toHaveLength(1); // Debuff 1 turn
    expect(after.debuffs[0].durationTurns).toBe(1);
    expect(after.blight).toBe(3); // Blight 3/3
    expect(after.conditionDurations?.blight).toBe(3);
    expect(after.stress).toBe(target.stress + 1); // Stress +1
    expect(result.campaign.heroes.find((hero) => hero.instanceId === target.sourceId)!.stress).toBe(target.stress + 1);
    // next forecast after completed action。
    const next = result.campaign.actFourState.finalFormRuntimeState?.runtimes['heart-of-darkness'];
    expect(next?.kind === 'heart-of-darkness' && next.currentForecast?.roll).toBe(4);
    expect(next?.kind === 'heart-of-darkness' && next.currentForecast?.transactionId).not.toBe(forecast?.transactionId);
    setRandomSource(null);
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
