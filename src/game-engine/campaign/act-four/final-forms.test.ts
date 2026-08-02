// Phase 10E §Final Encounter / Ancestor 四形态链 / Heart of Darkness 终局 —— 单元测试。
//
// 覆盖四个 Final Form 的机制运行时（Setup / campaign 层动作入口 / 终局收口），
// 所有 happy-path 走 mode:'prototype'，formal 路径断言被 Data Gate 拒绝（硬约束 22）。
//
// 关键不变量（与行为审计一一对应）：
// - 硬约束 7/8：Ancestor 1st 固定 4 张 Initiative，Reflection 死亡不减；
// - 硬约束 9：Reflection 存活时 Ancestor 不可 Target（GUARD）；
// - 硬约束 10：Imperfect 死亡只触发一次 10 Wounds；
// - 硬约束 12：Absolute Nothingness 非 BattleActor、不可 Target、占 Area Space；
// - 硬约束 14：roll = 10 不传送；
// - 硬约束 15/16：Sispersion 只抽 DD Monster、召唤与 Initiative 原子；
// - 硬约束 17：Gestating Reaction 只在实际造成 Wounds 时触发；
// - 硬约束 18—20：Forecast 生命周期（Battle Start 生成 / 消费不重掷 / 完成后生成下一个）；
// - 硬约束 5/13：Heart 不可跳过、必为末尾；
// - 硬约束 21：Come Unto Your Maker 禁用；
// - 硬约束 26/27：Final Failure → Campaign Over；Heart 死亡 → Campaign Victory。

import { describe, it, expect } from 'vitest';
import type { CampaignState } from '../../../types';
import type { FinalFormId } from '../../../types/final-encounter';
import type { FinalMechanicsMode } from '../../../data/darkest-dungeon/final-encounter';

import { createNewCampaign, selectParty } from '../../campaign';
import {
  unlockDarkestDungeonAct,
  completePostThirdThreatHamlet,
} from './unlock-act-four';
import { drawDarkestDungeonQuest } from './draw-quest';
import { activateDarkestDungeonContentSet } from './content-runtime';
import { drawDarkestDungeonLayout, buildDarkestDungeonMap } from './dungeon-map';
import { createGuardianQuest, startGuardianBattle, resolveGuardianVictory } from './guardian-quest';
import { startFinalHamlet, advanceFinalHamletDay } from './final-hamlet';
import { prepareFinalEncounter } from './prepare-final-encounter';
import { startFinalEncounter, defeatFinalForm } from './final-form-sequence';
import {
  transitionToNextFinalForm,
  captureFormTransitionSnapshots,
  diffFormTransitionSnapshots,
  validateFinalFormTransition,
} from './transition-final-form';
import { setupFinalFormRuntime } from './final-forms/final-form-runtime';
import {
  applyFinalFormReflectionDeath,
  resolveFinalFormAncestorStance,
  rollFinalFormAncestorTeleport,
  performFinalFormSispersion,
  applyFinalFormWoundedReaction,
  consumeFinalFormImpendingDoom,
  generateFinalFormImpendingDoom,
} from './final-forms/final-form-actions';
import {
  evaluateFinalEncounterOutcome,
  resolveHeartOfDarknessDefeat,
  resolveFinalEncounterFailure,
  settleFinalEncounterIfNeeded,
} from './final-forms/final-encounter-outcome';
import { setupAncestorFirstFormRuntime } from './final-forms/ancestor-first-form';
import {
  setupAncestorSecondFormRuntime,
  isAbsoluteNothingnessTargetable,
  getAncestorSecondFormInitiativeActorCount,
} from './final-forms/ancestor-second-form';
import { setupGestatingHeartRuntime } from './final-forms/gestating-heart';
import {
  setupHeartOfDarknessRuntime,
  getVisibleImpendingDoomForecast,
  isComeUntoYourMakerAvailable,
  canSkipHeartOfDarkness,
} from './final-forms/heart-of-darkness';
import { createSeededRng, createScriptedRng } from './rng';
import {
  isFinalEncounterMechanicsOfficialEnabled,
  getFinalEncounterMechanicsGaps,
  validateFinalEncounterMechanicsRegistry,
  getAncestorFirstFormMechanics,
  getAncestorSecondFormMechanics,
  getGestatingHeartMechanics,
  getHeartOfDarknessMechanics,
  getAncestorRoomAreaDefinition,
} from '../../../data/darkest-dungeon/final-encounter';
import { PROTOTYPE_DARKEST_DUNGEON_MONSTER_DECK_ID } from '../../../data/darkest-dungeon/final-encounter/gestating-heart';
import { UNSKIPPABLE_FINAL_FORM_ID } from '../../../data/darkest-dungeon/final-form-registry';

// ---------------------------------------------------------------------------
// 测试脚手架：复用 act-four.test.ts 的 fixture 链
// ---------------------------------------------------------------------------

const HERO_IDS = ['crusader', 'vestal', 'highwayman', 'hellion'];

function greenCampaign(): CampaignState {
  let c = createNewCampaign();
  c = selectParty(c, HERO_IDS);
  c = {
    ...c,
    campaignProgress: {
      ...c.campaignProgress,
      defeatedBossFamilyIds: ['necromancer', 'prophet', 'collector'],
    },
  };
  return c;
}

function baseCampaign(): CampaignState {
  let c = greenCampaign();
  c = unlockDarkestDungeonAct(c, { now: 't0' }).campaign;
  c = completePostThirdThreatHamlet(c, { now: 't1' }).campaign;
  return c;
}

function questCampaign(): CampaignState {
  return drawDarkestDungeonQuest(baseCampaign(), { rng: createSeededRng(1), mode: 'prototype' })
    .campaign;
}

function mapCampaign(): CampaignState {
  let c = questCampaign();
  c = activateDarkestDungeonContentSet(c, { mode: 'prototype' }).campaign;
  c = drawDarkestDungeonLayout(c, { rng: createSeededRng(2), mode: 'prototype' }).campaign;
  c = buildDarkestDungeonMap(c, { rng: createSeededRng(3), mode: 'prototype' }).campaign;
  return c;
}

function guardianBattleCampaign(): CampaignState {
  let c = createGuardianQuest(mapCampaign(), { mode: 'prototype' }).campaign;
  const objRoom = c.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
  c = startGuardianBattle(c, objRoom, { now: 't2' }).campaign;
  return c;
}

function finalHamletReadyCampaign(): CampaignState {
  let c = resolveGuardianVictory(guardianBattleCampaign(), { now: 't3' }).campaign;
  c = startFinalHamlet(c, { seed: 1 }).campaign;
  for (let i = 0; i < 4; i += 1) c = advanceFinalHamletDay(c, { seed: i + 1 }).campaign;
  return c;
}

function prepared(): CampaignState {
  return prepareFinalEncounter(finalHamletReadyCampaign(), { mode: 'prototype', seed: 1 }).campaign;
}

/** 把指定 Form 的机制运行时（prototype）挂到一套已准备的 campaign 上。 */
function attachRuntime(
  c: CampaignState,
  formId: FinalFormId,
  mode: FinalMechanicsMode = 'prototype',
): CampaignState {
  const enc = c.actFourState.finalEncounterState!;
  const setup = setupFinalFormRuntime(null, enc.id, formId, { mode, seed: 1 });
  if (!setup.ok || !setup.state) throw new Error(`setup ${formId} failed: ${setup.reason}`);
  return { ...c, actFourState: { ...c.actFourState, finalFormRuntimeState: setup.state } };
}

const ALL_FORMS: FinalFormId[] = [
  'ancestor-first-form',
  'ancestor-second-form',
  'gestating-heart',
  'heart-of-darkness',
];

// ---------------------------------------------------------------------------
// Data Gate / Registry（硬约束 22/23/24）
// ---------------------------------------------------------------------------

describe('Final Encounter 机制 Data Gate', () => {
  it('1. official 机制恒禁用', () => {
    expect(isFinalEncounterMechanicsOfficialEnabled()).toBe(false);
  });

  it('2. 机制层数据缺口清单非空', () => {
    const gaps = getFinalEncounterMechanicsGaps();
    expect(gaps.length).toBeGreaterThan(0);
  });

  it('3. Registry 自洽（无 issue）', () => {
    expect(validateFinalEncounterMechanicsRegistry()).toEqual([]);
  });

  it('4. 四个 Form 的 formal Setup 一律被 Data Gate 拒绝', () => {
    const enc = prepared().actFourState.finalEncounterState!;
    for (const formId of ALL_FORMS) {
      const r = setupFinalFormRuntime(null, enc.id, formId, { mode: 'formal' });
      expect(r.ok, `formal ${formId} 应被拒绝`).toBe(false);
      expect(r.reason).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 各 Form 运行时 Setup（直接纯函数）
// ---------------------------------------------------------------------------

describe('Final Form 运行时 Setup', () => {
  it('5. Ancestor 1st：固定 4 张 Initiative + 2 Perfect / 1 Imperfect，全部存活', () => {
    const rng = createSeededRng(7);
    const rt = setupAncestorFirstFormRuntime(getAncestorFirstFormMechanics('prototype'), rng);
    expect(rt.kind).toBe('ancestor-first-form');
    expect(rt.initiativeCardCount).toBe(4);
    expect(rt.reflections).toHaveLength(3);
    expect(rt.reflections.filter((r) => r.alive)).toHaveLength(3);
    expect(rt.reflections.filter((r) => r.kind === 'perfect')).toHaveLength(2);
    expect(rt.reflections.filter((r) => r.kind === 'imperfect')).toHaveLength(1);
    // 硬约束 9 前置：所有 Reflection 当前站位都是非 aggressive Stance（类型已限定为 NonAggressiveStance）。
    expect(
      rt.reflections.every(
        (r) => r.stance === 'defensive' || r.stance === 'ranged' || r.stance === 'support',
      ),
    ).toBe(true);
  });

  it('6. Ancestor 2nd：3 张 Absolute Nothingness，不可 Target、占 Area Space', () => {
    const room = getAncestorRoomAreaDefinition('prototype');
    const rt = setupAncestorSecondFormRuntime(getAncestorSecondFormMechanics('prototype'), room);
    expect(rt.kind).toBe('ancestor-second-form');
    expect(rt.initiativeCardCount).toBe(2);
    expect(rt.nothingness).toHaveLength(3);
    expect(rt.nothingness.every((n) => n.targetable === false)).toBe(true);
    expect(rt.nothingness.every((n) => n.occupiesAreaSpace === true)).toBe(true);
    expect(rt.currentStance).toBe('aggressive');
    expect(isAbsoluteNothingnessTargetable()).toBe(false);
    // 硬约束 12：虚无不进 Initiative，只有 Ancestor 本体（1）。
    expect(getAncestorSecondFormInitiativeActorCount()).toBe(1);
  });

  it('7. Gestating Heart：基础 1 张 Initiative，牌堆与历史为空', () => {
    const rt = setupGestatingHeartRuntime(getGestatingHeartMechanics('prototype'));
    expect(rt.kind).toBe('gestating-heart');
    expect(rt.baseInitiativeCardCount).toBe(1);
    expect(rt.initiativeCardCount).toBe(1);
    expect(rt.monsterDeckId).toBe(PROTOTYPE_DARKEST_DUNGEON_MONSTER_DECK_ID);
    expect(rt.drawnMonsterDefinitionIds).toEqual([]);
    expect(rt.summonedActorIds).toEqual([]);
    expect(rt.sispersionHistory).toEqual([]);
    expect(rt.woundedReactionHistory).toEqual([]);
  });

  it('8. Heart of Darkness：不可跳过、Come Unto Your Maker 禁用、Battle Start 已生成 Forecast', () => {
    const enc = prepared().actFourState.finalEncounterState!;
    const rt = setupHeartOfDarknessRuntime(
      getHeartOfDarknessMechanics('prototype'),
      enc.id,
      createSeededRng(11),
      't-setup',
    );
    expect(rt.kind).toBe('heart-of-darkness');
    expect(rt.initiativeCardCount).toBe(2);
    expect(rt.cannotBeSkipped).toBe(true);
    expect(rt.comeUntoYourMakerEnabled).toBe(false);
    expect(isComeUntoYourMakerAvailable(rt)).toBe(false);
    expect(canSkipHeartOfDarkness()).toBe(false);
    // 硬约束 18：Battle Start 即生成首个 Forecast。
    expect(rt.currentForecast).not.toBeNull();
    expect(rt.currentForecast!.visibleToPlayers).toBe(true);
    expect(rt.currentForecast!.consumed).toBe(false);
    expect(rt.forecastHistory).toHaveLength(1);
  });

  it('9. setupFinalFormRuntime（容器）：prototype 各 Form 均 ok，activeFormId 正确，幂等', () => {
    const enc = prepared().actFourState.finalEncounterState!;
    for (const formId of ALL_FORMS) {
      const first = setupFinalFormRuntime(null, enc.id, formId, { mode: 'prototype', seed: 1 });
      expect(first.ok, `prototype ${formId} 应成功`).toBe(true);
      expect(first.state!.activeFormId).toBe(formId);
      expect(first.runtime!.kind).toBe(formId);
      expect(first.alreadySetUp).toBe(false);
      // 第二次以 current 传入 → 幂等命中。
      const again = setupFinalFormRuntime(first.state, enc.id, formId, { mode: 'prototype' });
      expect(again.ok).toBe(true);
      expect(again.alreadySetUp).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// campaign 层动作入口：Ancestor 1st Form
// ---------------------------------------------------------------------------

describe('Ancestor 1st Form 动作入口', () => {
  it('10. Reflection 死亡：Imperfect 触发 10 Wounds，Initiative 恒为 4（硬约束 8/10）', () => {
    const c = attachRuntime(prepared(), 'ancestor-first-form');
    const res = applyFinalFormReflectionDeath(c, 'final-reflection-imperfect-3', { mode: 'prototype' });
    expect(res.ok).toBe(true);
    expect(res.ancestorWounds).toBe(10);
    expect(res.initiativeCardCount).toBe(4);
    expect(res.reaction).not.toBeNull();
    // Imperfect 死亡反应只触发一次：重复打同一只 → 不再给 Wounds。
    const again = applyFinalFormReflectionDeath(res.campaign, 'final-reflection-imperfect-3', {
      mode: 'prototype',
    });
    expect(again.alreadyProcessed).toBe(true);
    expect(again.ancestorWounds).toBe(0);
  });

  it('11. 击碎全部 Reflection → GUARD 解除（ancestorExposed）', () => {
    const c = attachRuntime(prepared(), 'ancestor-first-form');
    let cur = c;
    for (const r of [
      'final-reflection-perfect-1',
      'final-reflection-perfect-2',
      'final-reflection-imperfect-3',
    ]) {
      const res = applyFinalFormReflectionDeath(cur, r, { mode: 'prototype' });
      expect(res.ok).toBe(true);
      cur = res.campaign;
    }
    const last = applyFinalFormReflectionDeath(cur, 'final-reflection-perfect-1', { mode: 'prototype' });
    expect(last.ancestorExposed).toBe(true);
  });

  it('12. Ancestor 行动：三 Stance 全满 → Time Heals All；有空缺 → Fill（硬约束 11）', () => {
    const c = attachRuntime(prepared(), 'ancestor-first-form');
    const full = resolveFinalFormAncestorStance(c, 1, { mode: 'prototype' });
    expect(full.ok).toBe(true);
    expect(full.resolution!.outcome).toBe('time-heals-all');
    expect(full.skillIdToCast).toBeTruthy();
    expect(full.spawnedReflections).toHaveLength(0);

    // 先杀死一只 Reflection 制造空缺，再结算 → 补位。
    const killed = applyFinalFormReflectionDeath(c, 'final-reflection-imperfect-3', { mode: 'prototype' });
    const fill = resolveFinalFormAncestorStance(killed.campaign, 2, { mode: 'prototype' });
    expect(fill.resolution!.outcome).toBe('fill-reflection-stances');
    expect(fill.spawnedReflections).toHaveLength(1);
    expect(fill.skillIdToCast).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// campaign 层动作入口：Ancestor 2nd Form
// ---------------------------------------------------------------------------

describe('Ancestor 2nd Form 动作入口', () => {
  it('13. roll=10 不传送（硬约束 14）', () => {
    const c = attachRuntime(prepared(), 'ancestor-second-form');
    const res = rollFinalFormAncestorTeleport(c, 1, { rng: createScriptedRng([0.95]), mode: 'prototype' });
    expect(res.ok).toBe(true);
    expect(res.record!.roll).toBe(10);
    expect(res.record!.resultStance).toBeNull();
    expect(res.record!.teleported).toBe(false);
  });

  it('14. roll=1 → 传送到 defensive 且成功', () => {
    const c = attachRuntime(prepared(), 'ancestor-second-form');
    const res = rollFinalFormAncestorTeleport(c, 1, { rng: createScriptedRng([0.0]), mode: 'prototype' });
    expect(res.ok).toBe(true);
    expect(res.record!.roll).toBe(1);
    expect(res.record!.resultStance).toBe('defensive');
    expect(res.record!.teleported).toBe(true);
    expect(res.record!.toAreaId).toBeTruthy();
  });

  it('15. 同 sequence 重放不重掷（幂等）', () => {
    const c = attachRuntime(prepared(), 'ancestor-second-form');
    const a = rollFinalFormAncestorTeleport(c, 5, { rng: createScriptedRng([0.0]), mode: 'prototype' });
    const b = rollFinalFormAncestorTeleport(a.campaign, 5, { rng: createScriptedRng([0.5]), mode: 'prototype' });
    expect(b.alreadyProcessed).toBe(true);
    expect(b.record!.roll).toBe(a.record!.roll);
  });
});

// ---------------------------------------------------------------------------
// campaign 层动作入口：Gestating Heart
// ---------------------------------------------------------------------------

describe('Gestating Heart 动作入口', () => {
  it('16. Sispersion：只抽 DD Monster，召唤与 Initiative 原子 +1（硬约束 15/16）', () => {
    const c = attachRuntime(prepared(), 'gestating-heart');
    const res = performFinalFormSispersion(c, 1, { mode: 'prototype' });
    expect(res.ok).toBe(true);
    expect(res.initiativeCardCount).toBe(2); // 1 基础 + 1 召唤
    expect(res.record).not.toBeNull();
    expect(res.record!.monsterDefinitionId.startsWith('prototype-final-encounter-monster-')).toBe(true);
    // 抽走一只，牌堆剩余 2。
    const runtime = res.campaign.actFourState.finalFormRuntimeState!.runtimes['gestating-heart']!;
    if (runtime.kind === 'gestating-heart') {
      expect(runtime.drawnMonsterDefinitionIds).toHaveLength(1);
    }
  });

  it('17. Sispersion 同 sequence 幂等', () => {
    const c = attachRuntime(prepared(), 'gestating-heart');
    const a = performFinalFormSispersion(c, 9, { mode: 'prototype' });
    const b = performFinalFormSispersion(a.campaign, 9, { mode: 'prototype' });
    expect(b.alreadyProcessed).toBe(true);
    expect(b.initiativeCardCount).toBe(a.initiativeCardCount);
  });

  it('18. Gestating Reaction：0 伤不触发；实际 2 伤触发；致死按 Definition 阻断（硬约束 17）', () => {
    const c = attachRuntime(prepared(), 'gestating-heart');
    const heroId = c.heroes.find((h) => !h.dead)!.instanceId;

    const zero = applyFinalFormWoundedReaction(c, 1, { sourceHeroId: heroId, woundsApplied: 0, lethal: false }, { mode: 'prototype' });
    expect(zero.triggered).toBe(false);
    expect(zero.record).toBeNull();

    const hit = applyFinalFormWoundedReaction(c, 2, { sourceHeroId: heroId, woundsApplied: 2, lethal: false }, { mode: 'prototype' });
    expect(hit.triggered).toBe(true);
    expect(hit.effect).not.toBeNull();
    expect(hit.effect!.heartHeal).toBe(2);
    expect(hit.effect!.blightPotency).toBe(2);
    expect(hit.effect!.blightDurationTurns).toBe(3);

    // 致死伤害，prototype triggersAfterLethal if false → 阻断，不触发。
    const lethal = applyFinalFormWoundedReaction(c, 3, { sourceHeroId: heroId, woundsApplied: 5, lethal: true }, { mode: 'prototype' });
    expect(lethal.triggered).toBe(false);
    expect(lethal.record!.blockedReason).toBeTruthy();
    expect(lethal.effect).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// campaign 层动作入口：Heart of Darkness / Forecast 生命周期
// ---------------------------------------------------------------------------

describe('Heart of Darkness / Impending Doom', () => {
  it('19. Battle Start 已生成 Forecast；消费不重掷（硬约束 18/19）', () => {
    const c = attachRuntime(prepared(), 'heart-of-darkness');
    const raw = c.actFourState.finalFormRuntimeState!.runtimes['heart-of-darkness'];
    if (!raw || raw.kind !== 'heart-of-darkness') throw new Error('kind mismatch');
    const before = raw;
    expect(before.currentForecast).not.toBeNull();
    const roll = before.currentForecast!.roll;

    const res = consumeFinalFormImpendingDoom(c, { mode: 'prototype' });
    expect(res.ok).toBe(true);
    expect(res.forecast!.consumed).toBe(true);
    expect(res.forecast!.roll).toBe(roll); // 沿用已保存的 roll，不重掷
    expect(res.skillIdToCast).toBeTruthy();
  });

  it('20. Action 完成后生成下一个 Forecast（既有未消费则拒绝，硬约束 20）', () => {
    const c = attachRuntime(prepared(), 'heart-of-darkness');
    // 当前 Forecast 尚未消费 → 不允许覆盖 / 重掷。
    const blocked = generateFinalFormImpendingDoom(c, { rng: createScriptedRng([0.5]), mode: 'prototype' });
    expect(blocked.ok).toBe(false);

    // 先消费，再生成下一个。
    const consumed = consumeFinalFormImpendingDoom(c, { mode: 'prototype' });
    const next = generateFinalFormImpendingDoom(consumed.campaign, { rng: createScriptedRng([0.5]), mode: 'prototype' });
    expect(next.ok).toBe(true);
    expect(next.forecast!.consumed).toBe(false);
    expect(next.forecast!.roll).toBe(6); // 0.5 → floor(5)+1 = 6
    const runtime = next.campaign.actFourState.finalFormRuntimeState!.runtimes['heart-of-darkness']!;
    if (runtime.kind === 'heart-of-darkness') {
      expect(runtime.forecastHistory).toHaveLength(2);
    }
  });

  it('21. 玩家可见的 Forecast 选择器', () => {
    const c = attachRuntime(prepared(), 'heart-of-darkness');
    const visible = getVisibleImpendingDoomForecast(
      c.actFourState.finalFormRuntimeState!.runtimes['heart-of-darkness'] as never,
    );
    expect(visible).not.toBeNull();
    expect(visible!.visibleToPlayers).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 终局收口：胜利 / 失败
// ---------------------------------------------------------------------------

describe('Final Encounter 终局收口', () => {
  it('22. startFinalEncounter 建立首个 Form 运行时，评估为进行中', () => {
    const start = startFinalEncounter(prepared(), { mode: 'prototype', seed: 1 });
    expect(start.ok).toBe(true);
    const c = start.campaign;
    const order = c.actFourState.finalEncounterState!.orderedFormIds;
    expect(order).toHaveLength(3);
    expect(order[2]).toBe(UNSKIPPABLE_FINAL_FORM_ID); // Heart 必为末尾
    expect(c.actFourState.finalFormRuntimeState!.activeFormId).toBe(order[0]);
    expect(evaluateFinalEncounterOutcome(c).outcome).toBe('ongoing');
  });

  it('23. 完整链路：击败前两个 Form → Heart 倒下 → Campaign Victory（硬约束 27）', () => {
    const start = startFinalEncounter(prepared(), { mode: 'prototype', seed: 1 });
    expect(start.ok).toBe(true);
    const order = start.campaign.actFourState.finalEncounterState!.orderedFormIds;
    let c = start.campaign;

    c = defeatFinalForm(c, order[0]).campaign;
    c = transitionToNextFinalForm(c, { mode: 'prototype', seed: 2 }).campaign;
    c = defeatFinalForm(c, order[1]).campaign;
    c = transitionToNextFinalForm(c, { mode: 'prototype', seed: 3 }).campaign;

    const res = resolveHeartOfDarknessDefeat(c);
    expect(res.ok).toBe(true);
    expect(res.evaluation.outcome).toBe('victory');
    expect(res.campaign.actFourState.stage).toBe('campaign-victory');
    expect(res.campaign.gamePhase).toBe('campaign-over');
  });

  it('24. 队伍全灭 → 评估失败；resolveFinalEncounterFailure → Campaign Over（硬约束 26）', () => {
    const start = startFinalEncounter(prepared(), { mode: 'prototype', seed: 1 });
    const wiped = {
      ...start.campaign,
      heroes: start.campaign.heroes.map((h) => ({ ...h, dead: true })),
    };
    expect(evaluateFinalEncounterOutcome(wiped).outcome).toBe('failure');

    const fail = resolveFinalEncounterFailure(wiped, '队伍全灭');
    expect(fail.campaign.gamePhase).toBe('campaign-over');
  });

  it('25. settleFinalEncounterIfNeeded 自动收口（失败 → Campaign Over）', () => {
    const start = startFinalEncounter(prepared(), { mode: 'prototype', seed: 1 });
    const wiped = {
      ...start.campaign,
      heroes: start.campaign.heroes.map((h) => ({ ...h, dead: true })),
    };
    const settle = settleFinalEncounterIfNeeded(wiped);
    expect(settle.outcome).toBe('failure');
    expect(settle.changed).toBe(true);
    expect(settle.campaign.gamePhase).toBe('campaign-over');
  });
});

// ---------------------------------------------------------------------------
// Form 切换：不恢复 Life/Stress、不改 Stance（硬约束 15/16）
// ---------------------------------------------------------------------------

describe('Final Form 切换', () => {
  it('26. 切换保留 wounds/stress/stance，且 Round 重置为 1（硬约束 15/16/17）', () => {
    const start = startFinalEncounter(prepared(), { mode: 'prototype', seed: 1 });
    const order = start.campaign.actFourState.finalEncounterState!.orderedFormIds;
    let c = start.campaign;
    c = defeatFinalForm(c, order[0]).campaign;
    const before = captureFormTransitionSnapshots(c);
    const res = transitionToNextFinalForm(c, { mode: 'prototype', seed: 2 });
    expect(res.ok).toBe(true);
    expect(res.violations).toEqual([]);
    expect(res.round).toBe(1);
    const after = captureFormTransitionSnapshots(res.campaign);
    expect(diffFormTransitionSnapshots(before, after)).toEqual([]);
    // 英雄 wounds 全程不变（全新战役为 0）。
    for (const h of res.campaign.heroes) {
      const b = before.find((s) => s.heroId === h.instanceId)!;
      expect(h.wounds).toBe(b.wounds);
      expect(h.stress).toBe(b.stress);
      expect(h.stance).toBe(b.stance);
    }
  });

  it('27. validateFinalFormTransition 拒绝跳级切换', () => {
    const enc = prepared().actFourState.finalEncounterState!;
    const order = enc.orderedFormIds;
    const violations = validateFinalFormTransition(enc, order[0], order[2]);
    expect(violations.some((v) => v.includes('逐个推进'))).toBe(true);
  });
});
