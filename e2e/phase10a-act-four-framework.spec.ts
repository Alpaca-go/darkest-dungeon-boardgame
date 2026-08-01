// Phase 10A Playwright E2E（开发文档 §30 九个场景）。
//
// 说明：Act IV 调试面板组件 `src/components/debug/ActFourDebugSection.tsx`
// （data-testid="debug-act-four"）虽已实现，但**未被 DebugPanel.tsx 引入挂载**
// （DebugPanel.tsx:9 仅 import FanaticPyreDebugSection），因此 DOM 层无法驱动 Act IV 流程。
// 依据本仓库既有约定（见 e2e/phase-9e-fanatic-pyre.spec.ts 头注释），本套用例以
// 「导入正式运行时模块 + 断言行为」的方式对 §30 九个场景做集成校验；
// 另有 e2e/phase10a-debug-panel-smoke.spec.ts 负责浏览器层冒烟。
//
// 全部 happy-path 使用 mode:'prototype'（official 数据缺失，formal 被 Data Gate 拒绝）。
// 所有随机点注入确定性种子；「刷新」用 JSON 往返 + migrateCampaignToLatest 模拟落盘/读档。

import { test, expect } from '@playwright/test';
import type { CampaignState } from '../src/types';

import { createNewCampaign, selectParty } from '../src/game-engine/campaign';
import { migrateCampaignToLatest, SAVE_VERSION } from '../src/game-engine/save';
import {
  allowsStandardQuest,
  allowsThreatDraw,
  getMaskedBossSlotViews,
  isObjectiveRevealed,
  isActFourActive,
} from '../src/game-engine/campaign/act-four/act-four-state';
import {
  unlockDarkestDungeonAct,
  completePostThirdThreatHamlet,
} from '../src/game-engine/campaign/act-four/unlock-act-four';
import { drawDarkestDungeonQuest } from '../src/game-engine/campaign/act-four/draw-quest';
import { activateDarkestDungeonContentSet } from '../src/game-engine/campaign/act-four/content-runtime';
import {
  drawDarkestDungeonLayout,
  buildDarkestDungeonMap,
  revealDarkestDungeonRoom,
} from '../src/game-engine/campaign/act-four/dungeon-map';
import {
  resolveExcavationSiteRoom,
  finishExcavationRest,
  hasPendingExcavationRest,
  EXCAVATION_PROVISION_DIE_FACES,
} from '../src/game-engine/campaign/act-four/excavation-site';
import {
  createGuardianQuest,
  startGuardianBattle,
  resolveGuardianVictory,
  resolveGuardianFailure,
  isGuardianDefeated,
} from '../src/game-engine/campaign/act-four/guardian-quest';
import {
  startFinalHamlet,
  advanceFinalHamletDay,
  shouldDrawHamletEvent,
  canPrepareFinalEncounter,
  FINAL_HAMLET_TOTAL_DAYS,
} from '../src/game-engine/campaign/act-four/final-hamlet';
import { prepareFinalEncounter } from '../src/game-engine/campaign/act-four/prepare-final-encounter';
import {
  startFinalEncounter,
  defeatFinalForm,
  getActiveFinalFormId,
} from '../src/game-engine/campaign/act-four/final-form-sequence';
import {
  transitionToNextFinalForm,
  captureFormTransitionSnapshots,
  diffFormTransitionSnapshots,
  isStanceChangeBlockedBetweenForms,
} from '../src/game-engine/campaign/act-four/transition-final-form';
import {
  resolveCampaignVictory,
  isCampaignVictory,
  isCampaignDefeat,
  getCampaignOutcome,
} from '../src/game-engine/campaign/act-four/resolve-campaign-victory';
import { createSeededRng } from '../src/game-engine/campaign/act-four/rng';
import {
  DARKEST_DUNGEON_ROOM_SLOT_COUNT,
  DARKEST_DUNGEON_BOSS_SLOT_COUNT,
} from '../src/data/darkest-dungeon/layout-registry';
import { DARKEST_DUNGEON_QUEST_XP_REWARD } from '../src/data/darkest-dungeon/quest-registry';
import { EXCAVATION_RESTING_POINTS } from '../src/data/darkest-dungeon/room-registry';
import { UNSKIPPABLE_FINAL_FORM_ID } from '../src/data/darkest-dungeon/final-form-registry';

// ---------------------------------------------------------------------------
// 脚手架
// ---------------------------------------------------------------------------

const HERO_IDS = ['crusader', 'vestal', 'highwayman', 'hellion'];

/** 已选满 4 人队伍 + 已击败 3 个 Boss Family（尚未解锁 Act IV）。 */
function greenCampaign(): CampaignState {
  let c = createNewCampaign();
  c = selectParty(c, HERO_IDS);
  return {
    ...c,
    campaignProgress: {
      ...c.campaignProgress,
      defeatedBossFamilyIds: ['necromancer', 'prophet', 'collector'],
    },
  };
}

/** 已解锁 + 已完成第三 Boss 后的常规 Hamlet。 */
function unlockedCampaign(): CampaignState {
  let c = greenCampaign();
  c = unlockDarkestDungeonAct(c, { now: 't0' }).campaign;
  c = completePostThirdThreatHamlet(c, { now: 't1' }).campaign;
  return c;
}

function questCampaign(): CampaignState {
  return drawDarkestDungeonQuest(unlockedCampaign(), {
    rng: createSeededRng(1),
    mode: 'prototype',
  }).campaign;
}

function mapCampaign(): CampaignState {
  let c = questCampaign();
  c = activateDarkestDungeonContentSet(c, { mode: 'prototype' }).campaign;
  c = drawDarkestDungeonLayout(c, { rng: createSeededRng(2), mode: 'prototype' }).campaign;
  c = buildDarkestDungeonMap(c, { rng: createSeededRng(3), mode: 'prototype' }).campaign;
  return c;
}

function guardianCampaign(): CampaignState {
  return createGuardianQuest(mapCampaign(), { mode: 'prototype' }).campaign;
}

function guardianVictoryCampaign(): CampaignState {
  const c = guardianCampaign();
  const objRoom = c.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
  const inBattle = startGuardianBattle(c, objRoom, { now: 't2' }).campaign;
  return resolveGuardianVictory(inBattle, { now: 't3' }).campaign;
}

function finalHamletDoneCampaign(): CampaignState {
  let c = startFinalHamlet(guardianVictoryCampaign(), { seed: 1 }).campaign;
  for (let i = 0; i < FINAL_HAMLET_TOTAL_DAYS; i += 1) {
    c = advanceFinalHamletDay(c, { seed: i + 1 }).campaign;
  }
  return c;
}

function preparedCampaign(): CampaignState {
  return prepareFinalEncounter(finalHamletDoneCampaign(), { mode: 'prototype', seed: 1 }).campaign;
}

/** 模拟「刷新页面」：序列化落盘 → 读档 → 迁移到最新版本。 */
function reload(c: CampaignState): CampaignState {
  const persisted = JSON.parse(JSON.stringify(c)) as CampaignState;
  return migrateCampaignToLatest(persisted);
}

function totalHeroXp(c: CampaignState): number {
  return c.heroes.reduce((sum, h) => sum + (h.xpState?.currentXp ?? h.xp), 0);
}

// ---------------------------------------------------------------------------
// 场景一：Act IV 解锁
// ---------------------------------------------------------------------------

test('场景一 · 击败第三个 Threat → 正常 Hamlet → Act IV unlocked → 不再显示 Standard Quest / Threat', () => {
  const green = greenCampaign();
  expect(green.actFourState.unlocked).toBe(false);

  // 击败第三个 Threat → 解锁
  const unlocked = unlockDarkestDungeonAct(green, { now: 't0' });
  expect(unlocked.ok).toBe(true);
  expect(unlocked.campaign.actFourState.unlocked).toBe(true);
  expect(unlocked.campaign.actFourState.stage).toBe('post-third-threat-hamlet');

  // 正常 Hamlet 完成 → 进入 Act IV 流程
  const after = completePostThirdThreatHamlet(unlocked.campaign, { now: 't1' });
  expect(after.ok).toBe(true);
  const c = after.campaign;
  expect(isActFourActive(c.actFourState)).toBe(true);
  expect(c.campaignLevel).toBe(3);

  // 不再显示 Standard Quest / Threat
  expect(allowsStandardQuest(c.actFourState)).toBe(false);
  expect(allowsThreatDraw(c.actFourState)).toBe(false);
  expect(c.campaignProgress.activeThreatId).toBeNull();
  expect(c.currentThreatId).toBeNull();

  // 刷新保持
  const r = reload(c);
  expect(r.actFourState.unlocked).toBe(true);
  expect(allowsThreatDraw(r.actFourState)).toBe(false);
  expect(r.saveVersion).toBe(SAVE_VERSION);
});

// ---------------------------------------------------------------------------
// 场景二：Quest 与 Layout
// ---------------------------------------------------------------------------

test('场景二 · 抽 1 张 Quest → 保存 Guardian 与 Skipped Form → 抽 1 张 Layout → 16 Rooms / 3 Boss Slots → 刷新保持', () => {
  const base = unlockedCampaign();

  // 抽 1 张 Darkest Dungeon Quest
  const dq = drawDarkestDungeonQuest(base, { rng: createSeededRng(1), mode: 'prototype' });
  expect(dq.ok).toBe(true);
  expect(dq.quest).not.toBeNull();

  // 保存 Guardian 与 Skipped Form
  const afterQuest = dq.campaign;
  expect(afterQuest.actFourState.guardianDefinitionId).toBeTruthy();
  expect(afterQuest.actFourState.skippedFinalFormId).toBeTruthy();
  expect(afterQuest.actFourState.skippedFinalFormId).not.toBe(UNSKIPPABLE_FINAL_FORM_ID);

  // 刷新不重抽（幂等）
  const redraw = drawDarkestDungeonQuest(afterQuest, {
    rng: createSeededRng(98765),
    mode: 'prototype',
  });
  expect(redraw.alreadyDrawn).toBe(true);
  expect(redraw.campaign.actFourState.selectedQuestId).toBe(afterQuest.actFourState.selectedQuestId);

  // 抽 1 张 Layout → 16 Rooms / 3 Boss Slots
  const withContent = activateDarkestDungeonContentSet(afterQuest, { mode: 'prototype' }).campaign;
  const dl = drawDarkestDungeonLayout(withContent, { rng: createSeededRng(2), mode: 'prototype' });
  expect(dl.ok).toBe(true);
  expect(dl.layout!.roomSlotIds).toHaveLength(DARKEST_DUNGEON_ROOM_SLOT_COUNT);
  expect(dl.layout!.roomSlotIds).toHaveLength(16);
  expect(dl.layout!.bossSlotIds).toHaveLength(DARKEST_DUNGEON_BOSS_SLOT_COUNT);
  expect(dl.layout!.bossSlotIds).toHaveLength(3);

  const built = buildDarkestDungeonMap(dl.campaign, { rng: createSeededRng(3), mode: 'prototype' });
  expect(built.ok).toBe(true);
  expect(built.campaign.actFourState.mapState!.roomCount).toBe(16);

  // 刷新保持
  const r = reload(built.campaign);
  expect(r.actFourState.selectedQuestId).toBe(built.campaign.actFourState.selectedQuestId);
  expect(r.actFourState.guardianDefinitionId).toBe(built.campaign.actFourState.guardianDefinitionId);
  expect(r.actFourState.skippedFinalFormId).toBe(built.campaign.actFourState.skippedFinalFormId);
  expect(r.actFourState.layoutDrawRecord!.selectedLayoutId).toBe(
    built.campaign.actFourState.layoutDrawRecord!.selectedLayoutId,
  );
  expect(r.actFourState.mapState!.roomCount).toBe(16);
});

// ---------------------------------------------------------------------------
// 场景三：Objective 隐藏
// ---------------------------------------------------------------------------

test('场景三 · Objective + 2 普通 Token 分配 Boss Slots → 探索两个非 Objective → 第三个揭示 Guardian → 刷新不重复 Boss Battle', () => {
  const c = guardianCampaign();
  const assignment = c.actFourState.bossSlotAssignment!;
  const objectiveSlot = assignment.objectiveRoomSlotId;
  const nonObjective = assignment.bossSlotIds.filter((id) => id !== objectiveSlot);

  expect(assignment.bossSlotIds).toHaveLength(3);
  expect(nonObjective).toHaveLength(2);
  expect(isObjectiveRevealed(c.actFourState)).toBe(false);

  // 揭示前 UI 不泄露 Objective
  for (const view of getMaskedBossSlotViews(c.actFourState)) {
    expect(view.revealed).toBe(false);
    expect(view.kind).toBeNull();
  }

  // 探索两个非 Objective
  let cur = c;
  for (const slot of nonObjective) {
    cur = revealDarkestDungeonRoom(cur, slot).campaign;
    expect(isObjectiveRevealed(cur.actFourState)).toBe(false);
  }

  // 第三个揭示 Guardian
  cur = revealDarkestDungeonRoom(cur, objectiveSlot).campaign;
  expect(isObjectiveRevealed(cur.actFourState)).toBe(true);
  const objectiveView = getMaskedBossSlotViews(cur.actFourState).find((v) => v.slotId === objectiveSlot)!;
  expect(objectiveView.kind).toBe('objective');
  expect(cur.actFourState.guardianQuestState!.objectiveRoomId).toBe(objectiveSlot);

  // 创建 Boss Battle
  const first = startGuardianBattle(cur, objectiveSlot, { now: 't2' });
  expect(first.ok).toBe(true);
  expect(first.alreadyStarted).toBe(false);
  expect(first.battleId).toBeTruthy();

  // 刷新不重复 Boss Battle（同 Room 幂等）
  const reloaded = reload(first.campaign);
  const second = startGuardianBattle(reloaded, objectiveSlot, { now: 't2b' });
  expect(second.alreadyStarted).toBe(true);
  expect(second.battleId).toBe(first.battleId);
});

// ---------------------------------------------------------------------------
// 场景四：Excavation Site
// ---------------------------------------------------------------------------

test('场景四 · 进入 Excavation → 4 名 Hero 各掷 1 Provision → Pool 增加 → 免费 8 Point Rest → Firewood 不减少 → 刷新不重复', () => {
  const base = mapCampaign();
  const roomId = base.actFourState.excavationSiteStates[0].roomId;
  const revealed = revealDarkestDungeonRoom(base, roomId).campaign;

  const provisionsBefore = revealed.provisions;
  const goldBefore = revealed.gold;

  const r = resolveExcavationSiteRoom(revealed, roomId, {
    rng: createSeededRng(5),
    mode: 'prototype',
  });
  expect(r.ok).toBe(true);

  // 4 名 Hero 各掷 1 Provision Die
  expect(Object.keys(r.rolls)).toHaveLength(4);
  for (const value of Object.values(r.rolls)) {
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(EXCAVATION_PROVISION_DIE_FACES);
  }

  // Pool 增加
  const after = r.campaign.provisions;
  const gainedTotal = Object.values(r.gained).reduce<number>((s, v) => s + (v ?? 0), 0);
  expect(gainedTotal).toBeGreaterThan(0);
  for (const key of Object.keys(r.gained) as (keyof typeof after)[]) {
    expect(after[key]).toBe(provisionsBefore[key] + (r.gained[key] ?? 0));
  }

  // 免费 8 Point Rest + Firewood 不减少
  // （引擎中 Firewood 是 Quest 卡面静态字段 DarkestDungeonQuestDefinition.firewoodCount，
  //   CampaignState 上没有 firewood 计数器；「不减少」由 restSession.consumeFirewood:false 保证）
  expect(r.site!.restSession!.restingPoints).toBe(EXCAVATION_RESTING_POINTS);
  expect(r.site!.restSession!.restingPoints).toBe(8);
  expect(r.site!.restSession!.consumeFirewood).toBe(false);
  expect(r.campaign.gold).toBe(goldBefore);
  expect(hasPendingExcavationRest(r.campaign.actFourState)).toBe(true);

  // 刷新不重复（不重掷、Pool 不二次增加）
  const reloaded = reload(r.campaign);
  const again = resolveExcavationSiteRoom(reloaded, roomId, {
    rng: createSeededRng(424242),
    mode: 'prototype',
  });
  expect(again.alreadyResolved).toBe(true);
  expect(again.rolls).toEqual(r.rolls);
  expect(again.campaign.provisions).toEqual(r.campaign.provisions);
  expect(again.campaign.gold).toBe(goldBefore);

  // Rest 完成后 Room 清空，且全程不消耗 Firewood
  const finished = finishExcavationRest(again.campaign, roomId).campaign;
  expect(hasPendingExcavationRest(finished.actFourState)).toBe(false);
  const finishedSite = finished.actFourState.excavationSiteStates.find((s) => s.roomId === roomId)!;
  expect(finishedSite.restSession!.consumeFirewood).toBe(false);
});

// ---------------------------------------------------------------------------
// 场景五：Guardian Failure
// ---------------------------------------------------------------------------

test('场景五 · Prototype Guardian Battle 失败 → Campaign Over → 不进入 Final Hamlet', () => {
  const c = guardianCampaign();
  const objRoom = c.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
  const inBattle = startGuardianBattle(c, objRoom, { now: 't2' }).campaign;

  const failure = resolveGuardianFailure(inBattle, 'E2E 场景五：Guardian 战斗失败');
  expect(failure.campaign.gamePhase).toBe('campaign-over');
  expect(isCampaignDefeat(failure.campaign)).toBe(true);
  expect(getCampaignOutcome(failure.campaign)).toBe('defeat');

  // 不进入 Final Hamlet
  expect(isGuardianDefeated(failure.campaign.actFourState)).toBe(false);
  expect(failure.campaign.actFourState.finalHamletState).toBeNull();
  const hamlet = startFinalHamlet(failure.campaign, { seed: 1 });
  expect(hamlet.ok).toBe(false);
  expect(hamlet.campaign.actFourState.finalHamletState).toBeNull();

  // 刷新保持失败结局
  const r = reload(failure.campaign);
  expect(r.gamePhase).toBe('campaign-over');
  expect(r.actFourState.finalHamletState).toBeNull();
});

// ---------------------------------------------------------------------------
// 场景六：Guardian Victory
// ---------------------------------------------------------------------------

test('场景六 · Prototype Guardian 死亡 → 3 XP → Return → Final Hamlet 4 Days → No Hamlet Event', () => {
  const c = guardianCampaign();
  const objRoom = c.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
  const inBattle = startGuardianBattle(c, objRoom, { now: 't2' }).campaign;
  const xpBefore = totalHeroXp(inBattle);

  // Guardian 死亡 → 固定 3 XP
  const victory = resolveGuardianVictory(inBattle, { now: 't3' });
  expect(victory.ok).toBe(true);
  expect(victory.xpAwarded).toBe(DARKEST_DUNGEON_QUEST_XP_REWARD);
  expect(victory.xpAwarded).toBe(3);
  expect(totalHeroXp(victory.campaign)).toBeGreaterThan(xpBefore);
  expect(isGuardianDefeated(victory.campaign.actFourState)).toBe(true);

  // Return → Final Hamlet 4 Days
  const started = startFinalHamlet(victory.campaign, { seed: 1 });
  expect(started.ok).toBe(true);
  const hamlet = started.campaign.actFourState.finalHamletState!;
  expect(hamlet.totalDays).toBe(FINAL_HAMLET_TOTAL_DAYS);
  expect(hamlet.totalDays).toBe(4);

  // No Hamlet Event
  expect(hamlet.drawHamletEvent).toBe(false);
  expect(shouldDrawHamletEvent(started.campaign.actFourState)).toBe(false);

  // 4 天推进完毕 → Final Encounter Ready
  let cur = started.campaign;
  for (let i = 0; i < FINAL_HAMLET_TOTAL_DAYS; i += 1) {
    cur = advanceFinalHamletDay(cur, { seed: i + 1 }).campaign;
    expect(shouldDrawHamletEvent(cur.actFourState)).toBe(false);
  }
  expect(cur.actFourState.finalHamletState!.status).toBe('completed');
  expect(cur.actFourState.stage).toBe('final-encounter-ready');
});

// ---------------------------------------------------------------------------
// 场景七：Final Encounter 准备
// ---------------------------------------------------------------------------

test('场景七 · 完成 Final Hamlet Day4 → 无 Dungeon Exploration → Roll Provisions → 生成跳过后的 3 Form Sequence', () => {
  const done = finalHamletDoneCampaign();
  expect(done.actFourState.finalHamletState!.completedDayTransactionIds).toHaveLength(4);
  expect(canPrepareFinalEncounter(done.actFourState)).toBe(true);

  const provisionsBefore = done.provisions;
  const prepared = prepareFinalEncounter(done, { mode: 'prototype', seed: 1 });
  expect(prepared.ok).toBe(true);
  const c = prepared.campaign;

  // 无 Dungeon Exploration
  expect(c.dungeon).toBeNull();

  // Roll Provisions（结果落盘）
  const encounter = c.actFourState.finalEncounterState!;
  const record = encounter.provisionRecord!;
  expect(Object.keys(record.rolls).length).toBeGreaterThan(0);
  for (const key of Object.keys(record.granted) as (keyof typeof provisionsBefore)[]) {
    expect(c.provisions[key]).toBeGreaterThanOrEqual(provisionsBefore[key]);
  }

  // 生成跳过后的 3 Form Sequence
  const skipped = c.actFourState.skippedFinalFormId!;
  expect(encounter.orderedFormIds).toHaveLength(3);
  expect(encounter.orderedFormIds).not.toContain(skipped);
  expect(encounter.orderedFormIds[2]).toBe(UNSKIPPABLE_FINAL_FORM_ID);
  expect(encounter.orderedFormIds[2]).toBe('heart-of-darkness');

  // 刷新不重掷 Provisions、Sequence 不变
  const reloaded = reload(c);
  const again = prepareFinalEncounter(reloaded, { mode: 'prototype', seed: 999 });
  expect(again.alreadyPrepared).toBe(true);
  expect(again.campaign.provisions).toEqual(c.provisions);
  expect(again.campaign.actFourState.finalEncounterState!.orderedFormIds).toEqual(
    encounter.orderedFormIds,
  );
});

// ---------------------------------------------------------------------------
// 场景八：Form Transition
// ---------------------------------------------------------------------------

test('场景八 · 击败 Form 1 → Hero Life/Stress 不恢复 → Stance 不变 → Initiative 重建 → Form 2 Spawn → 刷新不重复', () => {
  const started = startFinalEncounter(preparedCampaign(), { mode: 'prototype', seed: 1 });
  expect(started.ok).toBe(true);
  let c = started.campaign;

  const form1 = getActiveFinalFormId(c.actFourState)!;
  expect(form1).toBe(c.actFourState.finalEncounterState!.orderedFormIds[0]);
  const roomBefore = c.battle!.sourceRoomId;

  // 击败 Form 1
  const defeated = defeatFinalForm(c, form1);
  expect(defeated.ok).toBe(true);
  expect(defeated.hasNextForm).toBe(true);
  expect(defeated.allFormsDefeated).toBe(false);
  c = defeated.campaign;
  expect(c.actFourState.finalEncounterState!.status).toBe('transitioning');

  const snapshotBefore = captureFormTransitionSnapshots(c);
  const xpBefore = totalHeroXp(c);

  const transition = transitionToNextFinalForm(c, { mode: 'prototype', seed: 1 });
  expect(transition.ok).toBe(true);
  const next = transition.campaign;

  // Hero Life / Stress 不恢复
  const snapshotAfter = captureFormTransitionSnapshots(next);
  expect(diffFormTransitionSnapshots(snapshotBefore, snapshotAfter)).toEqual([]);
  expect(transition.violations).toEqual([]);
  for (const before of snapshotBefore) {
    const after = snapshotAfter.find((s) => s.heroId === before.heroId)!;
    expect(after.wounds).toBe(before.wounds);
    expect(after.stress).toBe(before.stress);
  }

  // Stance 不变（Form 之间禁止换 Stance）
  expect(isStanceChangeBlockedBetweenForms(next.actFourState)).toBe(true);
  expect(next.actFourState.finalEncounterState!.noStanceChangeBetweenForms).toBe(true);

  // Initiative 重建 + Round 重置 + 同一 Room
  expect(transition.initiativeRebuilt).toBe(true);
  expect(transition.round).toBe(1);
  expect(next.battle!.round).toBe(1);
  expect(next.battle!.sourceRoomId).toBe(roomBefore);
  expect(next.battle!.initiativeOrder.length).toBe(5);

  // Form 2 Spawn（且不发 Form 级 XP）
  const form2 = getActiveFinalFormId(next.actFourState)!;
  expect(form2).toBe(next.actFourState.finalEncounterState!.orderedFormIds[1]);
  expect(form2).not.toBe(form1);
  expect(totalHeroXp(next)).toBe(xpBefore);

  // 刷新不重复：已击败的 Form 1 不能再次结算
  const reloaded = reload(next);
  expect(getActiveFinalFormId(reloaded.actFourState)).toBe(form2);
  const replay = defeatFinalForm(reloaded, form1);
  expect(replay.ok).toBe(false);
  expect(getActiveFinalFormId(replay.campaign.actFourState)).toBe(form2);
});

// ---------------------------------------------------------------------------
// 场景九：Campaign Victory
// ---------------------------------------------------------------------------

test('场景九 · 依次击败 3 个有效 Prototype Forms → Final Encounter Victory → Campaign Victory → 刷新保持', () => {
  let c = startFinalEncounter(preparedCampaign(), { mode: 'prototype', seed: 1 }).campaign;
  const sequence = [...c.actFourState.finalEncounterState!.orderedFormIds];
  expect(sequence).toHaveLength(3);

  const defeatedOrder: string[] = [];
  let guard = 0;
  while (guard < 10) {
    const activeId = getActiveFinalFormId(c.actFourState);
    if (!activeId) break;
    const df = defeatFinalForm(c, activeId);
    expect(df.ok).toBe(true);
    defeatedOrder.push(activeId);
    c = df.campaign;
    if (df.allFormsDefeated) break;
    const tr = transitionToNextFinalForm(c, { mode: 'prototype', seed: guard + 1 });
    expect(tr.ok).toBe(true);
    c = tr.campaign;
    guard += 1;
  }

  // 依次击败 3 个有效 Form（顺序与序列一致，最后是 Heart of Darkness）
  expect(defeatedOrder).toEqual(sequence);
  expect(defeatedOrder[2]).toBe(UNSKIPPABLE_FINAL_FORM_ID);

  // Final Encounter Victory → Campaign Victory
  const victory = resolveCampaignVictory(c);
  expect(victory.ok).toBe(true);
  expect(isCampaignVictory(victory.campaign)).toBe(true);
  expect(getCampaignOutcome(victory.campaign)).toBe('victory');
  expect(victory.campaign.gamePhase).toBe('campaign-over');

  // 刷新保持
  const reloaded = reload(victory.campaign);
  expect(isCampaignVictory(reloaded)).toBe(true);
  expect(getCampaignOutcome(reloaded)).toBe('victory');
  expect(reloaded.campaignOverReason).toBe(victory.campaign.campaignOverReason);

  // 再次结算幂等
  const again = resolveCampaignVictory(reloaded);
  expect(isCampaignVictory(again.campaign)).toBe(true);
  expect(again.campaign.campaignOverReason).toBe(victory.campaign.campaignOverReason);
});
