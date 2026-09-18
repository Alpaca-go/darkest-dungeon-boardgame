/**
 * Phase 11A.4R2A WP-13：Form Transition 状态完整保留的真实验收。
 *
 * 路径：final monster acts（真实 production skill 造成 HP damage / Stress / Bleed / Mark / Debuff / Stun / Push）
 * → Hero 真实击败当前 Form（driveCommunityFinalUntil 走 hero skill production path）
 * → defeatFinalForm → transitionToNextFinalForm。
 *
 * 断言核心：上一 Form 结束时的 **Battle Hero state** 与下一 Form 初始 Battle Hero state 逐字段相等
 * （hp / stress / stance / position / alive / DeathsDoor / bleed / blight / marked / stunned /
 *  conditionDurations / buffs / debuffs），而不是只比较 campaign.heroes —— 后者正是 R2 false-green 的来源。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BattleUnit, CampaignState } from '../../../types';
import {
  beginCommunityFinalEncounter,
  driveCommunityFinalUntil,
  scriptedD10,
} from './capability-test-support';
import { runCommunityFinalFormTurn, applyCommunityFinalHeroSkill } from '../../../game-engine/campaign/act-four/community-final-combat';
import { transitionToNextFinalForm } from '../../../game-engine/campaign/act-four/transition-final-form';
import { seededRuntimeSources, setRandomSource, setRuntimeSources } from '../../../game-engine/random';

beforeEach(() => { setRuntimeSources(seededRuntimeSources(1203)); setRandomSource(() => 0.49); });
afterEach(() => setRandomSource(null));

/** WP-13 要求比较的完整 Hero combat state 向量。 */
function heroStateVector(unit: BattleUnit) {
  return {
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
  };
}

function battleHeroVectors(campaign: CampaignState) {
  return campaign.battle!.heroes.map((unit) => ({ id: unit.id, sourceId: unit.sourceId, ...heroStateVector(unit) }));
}

/** 真实击败当前 Form 并切换到下一 Form，返回切换前后状态。 */
function defeatAndTransition(campaign: CampaignState) {
  const defeated = driveCommunityFinalUntil(
    campaign,
    (state) => state.actFourState.finalEncounterState?.status === 'transitioning',
  );
  expect(defeated.actFourState.finalEncounterState?.transitionState).toBeTruthy();
  const beforeVectors = battleHeroVectors(defeated);
  const beforeBattleId = defeated.battle!.battleId;
  const beforeRoomId = defeated.battle!.sourceRoomId;
  const transition = transitionToNextFinalForm(defeated, { mode: 'community-reference', rng: () => 0.4 });
  expect(transition.ok, transition.reason ?? '').toBe(true);
  return { defeated, beforeVectors, beforeBattleId, beforeRoomId, transition };
}

describe('Community Final transition state preservation (WP-13)', () => {
  it('Form 1 → 2：Reunion（HP+Bleed+Stress）与 It Chooses（Mark 2t+Debuff）后的 Hero state 完整保留', () => {
    let campaign = beginCommunityFinalEncounter(2);
    const perfect = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('perfect-reflection'))!;
    const imperfect = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('imperfect'))!;

    // --- Final monster acts #1：Reunion 真实命中 position 最小的 Hero（DMG 5 / Bleed 2/3 / Stress +1）---
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        heroes: campaign.battle!.heroes.map((unit) => ({ ...unit, stance: 'aggressive' as const })),
        monsters: campaign.battle!.monsters.map((unit) => (unit.id === perfect.id ? { ...unit, stance: 'support' as const } : unit)),
      },
    };
    const reunionTarget = [...campaign.battle!.heroes].sort((a, b) => a.position - b.position)[0];
    scriptedD10(3, 11, 100);
    const reunion = runCommunityFinalFormTurn(campaign, perfect.id);
    expect(reunion.skillId).toBe('reunion');
    campaign = reunion.campaign;
    const afterReunion = campaign.battle!.heroes.find((unit) => unit.id === reunionTarget.id)!;
    expect(afterReunion.hp).toBe(reunionTarget.hp - 5);
    expect(afterReunion.bleed).toBe(2);
    expect(afterReunion.stress).toBe(reunionTarget.stress + 1);
    // WP-11：伤害已同步到 Campaign Hero（不再只停留在 BattleUnit）。
    const woundedHero = campaign.heroes.find((hero) => hero.instanceId === reunionTarget.sourceId)!;
    expect(woundedHero.wounds).toBe(woundedHero.maxLife - afterReunion.hp);

    // --- Final monster acts #2：It Chooses 真实命中同一 Hero（DMG 2 / Mark 2t / Debuff 1t）---
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        heroes: campaign.battle!.heroes.map((unit) => ({ ...unit, stance: 'support' as const })),
      },
    };
    const chooserTarget = [...campaign.battle!.heroes].sort((a, b) => a.position - b.position)[0];
    scriptedD10(2, 11);
    const chosen = runCommunityFinalFormTurn(campaign, imperfect.id);
    expect(chosen.skillId).toBe('it-chooses');
    campaign = chosen.campaign;
    const afterChosen = campaign.battle!.heroes.find((unit) => unit.id === chooserTarget.id)!;
    expect(afterChosen.marked).toBe(true);
    expect(afterChosen.conditionDurations?.mark).toBe(2);
    expect(afterChosen.debuffs).toHaveLength(1);

    // --- Hero 真实击败 Form 1 → transition ---
    const { defeated, beforeVectors, beforeBattleId, beforeRoomId, transition } = defeatAndTransition(campaign);
    expect(transition.campaign.actFourState.finalEncounterState?.activeFormId).toBe('ancestor-second-form');

    // 核心断言：下一 Form 初始 Battle Hero state === 上一 Form 结束时 Battle Hero state（逐字段）。
    const afterVectors = battleHeroVectors(transition.campaign);
    expect(afterVectors).toEqual(beforeVectors);
    // 至少一个 Hero 真实带伤 / 带压（证明不是 trivially equal 的空状态）。
    expect(beforeVectors.some((vector) => vector.hp < vector.maxHp)).toBe(true);
    expect(beforeVectors.some((vector) => vector.stress > 0)).toBe(true);

    // 硬约束：battleId / Room 不变；Round 重置为 1；Initiative 重建且包含新 Form。
    expect(transition.campaign.battle!.battleId).toBe(beforeBattleId);
    expect(transition.campaign.battle!.sourceRoomId).toBe(beforeRoomId);
    // Room 必须等于 encounter 的 source roomDefinitionId（而非仅「与上一 Form 相同」，
    // 否则 buildFinalEncounterBattle 统一写错 Room 的 mutation 无法被捕获）。
    expect(transition.campaign.battle!.sourceRoomId).toBe(defeated.actFourState.finalEncounterState!.roomDefinitionId);
    expect(transition.campaign.battle!.round).toBe(1);
    expect(transition.campaign.battle!.initiativeIndex).toBe(-1);
    const newForm = transition.campaign.battle!.monsters.find((unit) => unit.sourceId.includes('ancestor-second-form'))!;
    expect(transition.campaign.battle!.initiativeOrder).toContain(newForm.id);
    // Initiative 必须重建：上一 Form 的单位 id 不得残留在新 initiativeOrder 中。
    const oldForm = defeated.battle!.monsters.find((unit) => unit.sourceId.includes('ancestor-first-form'))!;
    expect(transition.campaign.battle!.initiativeOrder).not.toContain(oldForm.id);

    // Campaign/Battle stress 一致（WP-12）；campaign wounds 未被 transition 恢复。
    for (const vector of beforeVectors) {
      const hero = transition.campaign.heroes.find((candidate) => candidate.instanceId === vector.sourceId)!;
      expect(hero.stress, `${vector.id} campaign stress`).toBe(vector.stress);
      const beforeHero = defeated.heroes.find((candidate) => candidate.instanceId === vector.sourceId)!;
      expect(hero.wounds, `${vector.id} campaign wounds not healed`).toBe(beforeHero.wounds);
    }
    // WP-11 关键回归：上一 Form 的 Battle hp 不得被 transition 从 campaign wounds 重建恢复。
    // （旧行为：hp 被重置为 maxLife - wounds ≥ 实际 hp；现在逐字段相等已由上面的 vectors toEqual 证明。）
    const reunionHeroAfter = transition.campaign.battle!.heroes.find((unit) => unit.sourceId === reunionTarget.sourceId)!;
    const reunionHeroBefore = beforeVectors.find((vector) => vector.sourceId === reunionTarget.sourceId)!;
    expect(reunionHeroAfter.hp).toBe(reunionHeroBefore.hp);
  });

  it('Form 2 → 3：Unmake（Bleed 2/4）+ Embrace Futility（Stun 2t + Stress +2 + Push 2）后的 Hero state 完整保留', () => {
    let campaign = beginCommunityFinalEncounter(1); // scenario 1 从 ancestor-second-form 开始
    const form = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('ancestor-second-form'))!;

    // --- Final monster acts #1：Unmake Them All 真实命中 furthest Hero（DMG 4 / Bleed 2/4 / Stress +1）---
    const bleedTarget = [...campaign.battle!.heroes].sort((a, b) => b.position - a.position)[0];
    scriptedD10(4, 12, 100, 3); // skill 4；attack 12 命中；bleed 抵抗不抵抗；teleport 3
    const unmake = runCommunityFinalFormTurn(campaign, form.id);
    expect(unmake.skillId).toBe('unmake-them-all');
    campaign = unmake.campaign;
    const afterBleed = campaign.battle!.heroes.find((unit) => unit.id === bleedTarget.id)!;
    expect(afterBleed.bleed).toBe(2);
    expect(afterBleed.conditionDurations?.bleed).toBe(4);

    // 推进 initiative（真实 turn 序列中下一行动者的 eventId 不同；不 advanceTurn → 无 turn-start tick）。
    campaign = {
      ...campaign,
      battle: { ...campaign.battle!, initiativeIndex: campaign.battle!.initiativeIndex + 1 },
    };

    // --- Final monster acts #2：Embrace Futility 真实命中 closest Hero（DMG 2 / Stun 2t / Stress +2 / Push 2）---
    const stunTarget = [...campaign.battle!.heroes].sort((a, b) => a.position - b.position)[0];
    scriptedD10(10, 12, 100, 10, 10, 10); // skill 10；attack 12 命中；stun 抵抗不抵抗；teleport 10 原地
    const embrace = runCommunityFinalFormTurn(campaign, form.id);
    expect(embrace.skillId).toBe('embrace-futility');
    campaign = embrace.campaign;
    const afterHit = campaign.battle!.heroes.find((unit) => unit.id === stunTarget.id)!;
    expect(afterHit.stunned).toBe(stunTarget.stunned + 2);
    expect(afterHit.conditionDurations?.stun).toBe(2);
    expect(afterHit.position).toBe(Math.min(4, stunTarget.position + 2)); // Push 2
    expect(afterHit.stress).toBe(stunTarget.stress + 2);

    // --- Hero 真实击杀 Form（hp 注入 1，走 applyCommunityFinalHeroSkill → defeatFinalForm 真实路径；
    //     不 advanceTurn → 无任何 turn-start tick，boundary 状态完全确定）---
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        monsters: campaign.battle!.monsters.map((unit) => (unit.id === form.id ? { ...unit, hp: 1 } : unit)),
      },
    };
    const attacker = campaign.battle!.heroes.find((unit) => unit.id !== stunTarget.id && unit.position <= 3)!;
    const killed = applyCommunityFinalHeroSkill(
      { ...campaign, battle: { ...campaign.battle!, activeActorId: attacker.id, currentActionPoints: 1 } },
      attacker.id,
      'crusader-holy-lance',
      form.id,
    ).campaign;
    expect(killed.actFourState.finalEncounterState?.status).toBe('transitioning');

    const beforeVectors = battleHeroVectors(killed);
    const beforeBattleId = killed.battle!.battleId;
    const beforeRoomId = killed.battle!.sourceRoomId;
    const transition = transitionToNextFinalForm(killed, { mode: 'community-reference', rng: () => 0.4 });
    expect(transition.ok, transition.reason ?? '').toBe(true);
    expect(transition.campaign.actFourState.finalEncounterState?.activeFormId).toBe('gestating-heart');

    // 核心断言：全部 Hero combat state 逐字段保留（含 Bleed/Stun 的 conditionDurations 与 Push 后的 position）。
    expect(battleHeroVectors(transition.campaign)).toEqual(beforeVectors);
    const carriedStun = transition.campaign.battle!.heroes.find((unit) => unit.id === stunTarget.id)!;
    expect(carriedStun.stunned).toBe(stunTarget.stunned + 2);
    expect(carriedStun.conditionDurations?.stun).toBe(2);
    expect(carriedStun.position).toBe(Math.min(4, stunTarget.position + 2));
    const carriedBleed = transition.campaign.battle!.heroes.find((unit) => unit.id === bleedTarget.id)!;
    expect(carriedBleed.bleed).toBe(2);
    expect(carriedBleed.conditionDurations?.bleed).toBe(4);
    expect(transition.campaign.battle!.battleId).toBe(beforeBattleId);
    expect(transition.campaign.battle!.sourceRoomId).toBe(beforeRoomId);
    expect(transition.campaign.battle!.sourceRoomId).toBe(killed.actFourState.finalEncounterState!.roomDefinitionId);
    expect(transition.campaign.battle!.round).toBe(1);
    expect(transition.campaign.battle!.initiativeIndex).toBe(-1);
    // Initiative 必须重建：上一 Form 的单位 id 不得残留。
    expect(transition.campaign.battle!.initiativeOrder).not.toContain(form.id);
  });
});
