// Phase 11A — Headless Store Shim（审计补丁，非玩法代码）
//
// ⚠️ 本文件存在本身就是一条审计发现（ISSUE-P1-006）。
//
// 背景：Darkest Dungeon 原型的战役状态机被劈成两半 ——
//   * `src/game-engine/**` 提供纯函数「原子步骤」；
//   * `src/store/useGameStore.ts` 提供把这些原子步骤串起来的**编排层**
//     （gamePhase 迁移、settleBattle 结算流水线、胜利/撤退/离开地牢的组合动作）。
//
// 编排层只写在 zustand store 里，没有任何引擎侧导出。后果是：
//   任何无头驱动（Simulation Driver / Golden Run / Replay / 回归测试）
//   都无法只依赖 game-engine 走完一局，必须复制一份 UI 逻辑。
//
// 硬约束 3 要求 Driver「调用与 UI 同一个引擎入口，不得直接改写 store 字段」。
// 本文件的做法是：**逐行复刻 store 的编排顺序，引用完全相同的引擎函数**，
// 不新增任何玩法规则、不跳过任何步骤、不使用任何 debug 入口。
// 每个导出都标注了它对应的 store action 与行号，便于日后合并回引擎层。
//
// 一旦引擎层补齐这些编排函数，本文件应当被删除，ISSUE-P1-006 随之关闭。

import type { CampaignState } from '../../types';
import { canProceedToLoadout, isLoadoutComplete } from '../../game-engine/campaign';
import { canMoveTo, moveToRoom as engineMoveToRoom, retreatFromBattle } from '../../game-engine/dungeon';
import { resolveVictory as engineResolveVictory, resumeTurnAfterMentalCheck } from '../../game-engine/battle';
import {
  processBattleStressEvents,
  resolveTurnStartMentalEffect,
} from '../../game-engine/mental-effects';
import {
  processBattleDiseaseInfections,
  processBattleRuleEvents,
} from '../../game-engine/diseases/battle-bridge';
import { processBattleDeaths } from '../../game-engine/hero-death';
import {
  evaluateReplacementFlow,
  getReplacementCandidates,
  unconfirmedSlotCount,
} from '../../game-engine/stagecoach';
import {
  completeReplacementFlow as engineCompleteReplacementFlow,
  confirmReplacement as engineConfirmReplacement,
  selectReplacementHero as engineSelectReplacementHero,
} from '../../game-engine/replacement';
import {
  openBattleTurnStartWindow,
  openRoomEnteredWindows,
  resolveTrinketOpportunity,
} from '../../game-engine/trinkets/battle-trinket-bridge';
import { openOpportunities } from '../../game-engine/trinkets/trinket-opportunities';
import { failQuestFromBattle, finishQuest } from '../../game-engine/quest-result';
import { hamletEntryBlockedByTrinkets, startHamletPhase } from '../../game-engine/hamlet';
import { resolveTrinketAllocation } from '../../game-engine/trinkets/allocate-trinket';

/**
 * store: retargetPendingReplacement（useGameStore.ts:280-292）——
 * 这是一个**模块私有函数**，引擎里完全没有等价导出，只能逐行复刻。
 */
function retargetPendingReplacement(
  c: CampaignState,
  resumePhase: 'dungeon-explore' | 'quest-result' | 'hamlet',
): CampaignState {
  const pending = c.stagecoach.pendingReplacement;
  if (!pending || pending.resolved || pending.resumePhase === resumePhase) return c;
  return {
    ...c,
    stagecoach: { ...c.stagecoach, pendingReplacement: { ...pending, resumePhase } },
  };
}

/** 标记：所有本文件导出的编排都属于「UI 层泄漏」，事件里会打这个 layer。 */
export const UI_ORCHESTRATION_LAYER = 'ui-store-shim' as const;

/** 记录每个 shim 对应的 store 位置，供 ISSUE-P1-006 报告直接引用。 */
export const UI_ORCHESTRATION_INVENTORY: ReadonlyArray<{
  shim: string;
  storeAction: string;
  storeLocation: string;
  missingEngineExport: string;
  note: string;
}> = [
  {
    shim: 'shimProceedToLoadout',
    storeAction: 'proceedToLoadout',
    storeLocation: 'src/store/useGameStore.ts:426-430',
    missingEngineExport: 'game-engine/campaign.ts → proceedToLoadout()',
    note: '引擎只导出守卫 canProceedToLoadout()，没有导出写 gamePhase 的迁移函数。',
  },
  {
    shim: 'shimProceedToQuests',
    storeAction: 'proceedToQuests',
    storeLocation: 'src/store/useGameStore.ts:432-436',
    missingEngineExport: 'game-engine/campaign.ts → proceedToQuests()',
    note: '引擎只导出守卫 isLoadoutComplete()，没有导出写 gamePhase 的迁移函数。',
  },
  {
    shim: 'settleBattleHeadless',
    storeAction: 'settleBattle（模块私有闭包）',
    storeLocation: 'src/store/useGameStore.ts:310-341',
    missingEngineExport: 'game-engine/battle.ts → settleBattle()',
    note:
      '死亡同步 → 压力事件 → 规则事件 → 感染 → 精神检定循环 → 开 turn-start 窗口，' +
      '这条 6 步结算流水线完全写在 store 闭包里，引擎侧无等价导出。',
  },
  {
    shim: 'shimMoveToRoom',
    storeAction: 'moveToRoom',
    storeLocation: 'src/store/useGameStore.ts:448-462',
    missingEngineExport: 'game-engine/dungeon.ts → enterRoom()',
    note: 'engineMoveToRoom 之后还要 settleBattle / openRoomEnteredWindows / evaluateReplacementFlow。',
  },
  {
    shim: 'shimResolveVictory',
    storeAction: 'battleResolveVictory',
    storeLocation: 'src/store/useGameStore.ts:508-517',
    missingEngineExport: 'game-engine/battle.ts → commitVictory()',
    note: 'resolveVictory 前后的 settleBattle 与替补判定写在 store。',
  },
  {
    shim: 'shimLeaveDungeon',
    storeAction: 'leaveDungeon',
    storeLocation: 'src/store/useGameStore.ts:530-540',
    missingEngineExport: 'game-engine/quest-result.ts → leaveDungeon()',
    note: 'finishQuest 后的 retargetPendingReplacement / evaluateReplacementFlow 写在 store。',
  },
  {
    shim: 'shimFailQuestFromDefeat',
    storeAction: 'failQuestFromDefeat',
    storeLocation: 'src/store/useGameStore.ts:542-551',
    missingEngineExport: 'game-engine/quest-result.ts → failQuestFromDefeat()',
    note: '同上，失败路径的组合动作也在 store。',
  },
  {
    shim: 'shimReturnToHamlet',
    storeAction: 'returnToHamlet',
    storeLocation: 'src/store/useGameStore.ts:553-561',
    missingEngineExport: 'game-engine/hamlet.ts → returnToHamlet()',
    note: 'startHamletPhase 后的替补重定向写在 store。',
  },
  {
    shim: 'declineAllTrinketOpportunitiesHeadless',
    storeAction: 'declineTrinketOpportunity',
    storeLocation: 'src/store/useGameStore.ts:868-876',
    missingEngineExport: 'game-engine/trinkets → resolveAllOpenOpportunities()',
    note:
      'before-attack-roll 窗口会冻结 pendingAction；解冻只能靠逐个 decline，' +
      '引擎没有「批量结清并恢复动作」的入口，无头驱动必须自己循环。',
  },
  {
    shim: 'resolveAllPendingTrinketAllocations',
    storeAction: 'resolveTrinketAllocation（由 quest-result 页面循环调用）',
    storeLocation: 'src/store/useGameStore.ts:878-884 + QuestResult 页面',
    missingEngineExport: 'game-engine/trinkets → drainPendingAllocations()',
    note:
      'startHamletPhase 在 pendingTrinketAllocations 未清空时静默返回原 state，' +
      '「必须先处理完分配」这条流程约束只由 UI 页面表达，引擎侧没有批量结清入口，' +
      '导致无头驱动会在 quest-result 阶段静默空转（本次审计实际踩到，见 Golden Run 第 5 个任务）。',
  },
  {
    shim: 'shimResolveReplacements',
    storeAction: 'selectReplacementHero / confirmReplacement / completeReplacementFlow',
    storeLocation: 'src/pages/ReplacementPage.tsx（逐槽位交互）+ useGameStore.ts:620-658',
    missingEngineExport: 'game-engine/replacement.ts → autoResolveReplacementFlow()',
    note:
      '引擎导出了单槽位原子步骤，但「遍历所有未确认槽位直到流程结束」的循环只存在于 UI 页面；' +
      '无头驱动必须自己实现该循环，否则会永远停在 replacement 阶段。',
  },
  {
    shim: 'retargetPendingReplacement（内部复刻）',
    storeAction: 'retargetPendingReplacement',
    storeLocation: 'src/store/useGameStore.ts:280-292',
    missingEngineExport: 'game-engine/stagecoach.ts → retargetPendingReplacement()',
    note: '模块私有函数，引擎完全没有等价导出，无头驱动只能逐行复刻。',
  },
];

// ---------------------------------------------------------------------------
// 阶段迁移（store: proceedToLoadout / proceedToQuests）
// ---------------------------------------------------------------------------

export function shimProceedToLoadout(c: CampaignState): CampaignState {
  if (!canProceedToLoadout(c)) return c;
  return { ...c, gamePhase: 'skill-loadout' };
}

export function shimProceedToQuests(c: CampaignState): CampaignState {
  if (!isLoadoutComplete(c)) return c;
  return { ...c, gamePhase: 'quest-select' };
}

// ---------------------------------------------------------------------------
// 战斗结算流水线（store: settleBattle，useGameStore.ts:310-341）
// 顺序与守卫上限 50 与 store 完全一致。
// ---------------------------------------------------------------------------

export function settleBattleHeadless(c: CampaignState): CampaignState {
  let next = processBattleDeaths(c);
  next = processBattleStressEvents(next);
  next = processBattleRuleEvents(next);
  next = processBattleDiseaseInfections(next);
  next = processBattleDeaths(next);
  let guard = 0;
  while (next.battle && next.battle.status === 'active' && next.battle.pendingMentalCheck && guard < 50) {
    guard += 1;
    next = resolveTurnStartMentalEffect(next).campaign;
    next = processBattleDeaths(next);
    next = processBattleStressEvents(next);
    if (!next.battle) break;
    next = { ...next, battle: resumeTurnAfterMentalCheck(next.battle) };
    next = processBattleDeaths(next);
    next = processBattleStressEvents(next);
    next = processBattleRuleEvents(next);
    next = processBattleDiseaseInfections(next);
  }
  next = openBattleTurnStartWindow(next);
  return next;
}

/**
 * store: declineTrinketOpportunity（useGameStore.ts:868-876）——
 * 把当前所有打开的 Trinket 使用机会全部 decline，解冻 pendingAction。
 *
 * 无头驱动一律选择「不使用」：Trinket 使用是玩家决策，Golden Run 需要确定性，
 * 且「不使用」是规则上永远合法的选项，不会跳过任何强制步骤。
 */
export function declineAllTrinketOpportunitiesHeadless(c: CampaignState, maxRounds = 20): CampaignState {
  let next = c;
  let guard = 0;
  while (guard++ < maxRounds) {
    const open = openOpportunities(next);
    if (open.length === 0) break;
    const before = next;
    for (const opp of open) {
      const { campaign: resolved, error } = resolveTrinketOpportunity(next, opp.id, 'decline');
      if (error || resolved === next) continue;
      next = resolved;
    }
    if (next.battle) next = settleBattleHeadless(next);
    if (next === before) break; // 无进展，避免死循环
  }
  return next;
}

// ---------------------------------------------------------------------------
// 地牢 / 战斗 / 结算的组合动作
// ---------------------------------------------------------------------------

/** store: moveToRoom（useGameStore.ts:448-462） */
export function shimMoveToRoom(c: CampaignState, roomId: string): CampaignState {
  if (!c.dungeon || !canMoveTo(c.dungeon, roomId)) return c;
  let next = engineMoveToRoom(c, roomId);
  if (next.battle) next = settleBattleHeadless(next);
  next = openRoomEnteredWindows(next, roomId);
  if (next.gamePhase === 'dungeon-explore') next = evaluateReplacementFlow(next);
  return next;
}

/** store: battleResolveVictory（useGameStore.ts:508-517） */
export function shimResolveVictory(c: CampaignState): CampaignState {
  if (!c.battle || c.battle.status !== 'victory') return c;
  let next = settleBattleHeadless(c);
  next = engineResolveVictory(next);
  next = evaluateReplacementFlow(next);
  return next;
}

/** store: battleRetreat（useGameStore.ts:519-526） */
export function shimRetreat(c: CampaignState): CampaignState {
  if (!c.battle) return c;
  return retreatFromBattle(settleBattleHeadless(c));
}

/** store: leaveDungeon（useGameStore.ts:530-540） */
export function shimLeaveDungeon(c: CampaignState): CampaignState {
  if (c.gamePhase !== 'dungeon-explore' || !c.dungeon) return c;
  let next = finishQuest(c, 'left');
  if (next === c) return c;
  next = retargetPendingReplacement(next, 'quest-result');
  next = evaluateReplacementFlow(next);
  return next;
}

/** store: failQuestFromDefeat（useGameStore.ts:542-551） */
export function shimFailQuestFromDefeat(c: CampaignState): CampaignState {
  if (!c.battle || c.battle.status !== 'defeat') return c;
  let next = settleBattleHeadless(c);
  next = failQuestFromBattle(next);
  if (next === c) return c;
  next = retargetPendingReplacement(next, 'quest-result');
  next = evaluateReplacementFlow(next);
  return next;
}

/**
 * 结清所有 pending 的饰品分配（Phase 8C §14：未解决时不能进入 Hamlet）。
 *
 * 无头驱动一律选择 `discard`：这是规则上永远合法、且不依赖英雄槽位状态的选项，
 * 保证确定性，也不会绕过「必须做出决策」这一强制步骤。
 */
export function resolveAllPendingTrinketAllocations(c: CampaignState, maxRounds = 30): CampaignState {
  let next = c;
  let guard = 0;
  while (guard++ < maxRounds) {
    const pending = (next.pendingTrinketAllocations ?? []).filter((a) => a.status === 'pending');
    if (pending.length === 0) break;
    const before = next;
    for (const alloc of pending) {
      const { campaign: resolved, error } = resolveTrinketAllocation(next, alloc.allocationId, {
        type: 'discard',
      });
      if (error || resolved === next) continue;
      next = resolved;
    }
    if (next === before) break;
  }
  return next;
}

/**
 * ReplacementPage 交互循环的无头等价物。
 *
 * 逐个未确认槽位：确定性地选取候选列表中**第一个 selectable 的英雄**（HEROES 顺序固定，
 * 不引入随机），随后 confirmReplacement。不做任何免费升级 —— 「不升级」在规则上永远合法，
 * 且能避免 Stagecoach XP 带来的分支，保证 Golden Run 可复现。
 *
 * confirmReplacement 在全部槽位确认后会自动调用 completeReplacementFlow；
 * 这里额外兜一次底，以覆盖「进入时已全部 confirmed 但流程未收尾」的状态。
 */
export function shimResolveReplacements(c: CampaignState, maxRounds = 8): CampaignState {
  let next = c;
  let guard = 0;
  while (guard++ < maxRounds) {
    const pending = next.stagecoach.pendingReplacement;
    if (!pending || pending.resolved) break;
    if (unconfirmedSlotCount(next) === 0) {
      next = engineCompleteReplacementFlow(next);
      break;
    }
    const slot = pending.slots.find((s) => !s.confirmed);
    if (!slot) break;
    const before = next;
    if (!slot.selectedHeroClassId) {
      const candidate = getReplacementCandidates(next).find((x) => x.selectable);
      if (!candidate) break; // 无可选候选：交给 evaluateReplacementFlow 判负，不伪造成功
      next = engineSelectReplacementHero(next, slot.deadCampaignHeroId, candidate.hero.id);
    }
    next = engineConfirmReplacement(next, slot.deadCampaignHeroId);
    if (next === before) break; // 无进展，避免死循环（由调用方记为死锁）
  }
  return next;
}

/** store: returnToHamlet（useGameStore.ts:553-561） */
export function shimReturnToHamlet(c: CampaignState): CampaignState {
  // UI 会在 quest-result 页强制玩家先处理饰品分配；无头驱动等价地先结清。
  const unblocked = hamletEntryBlockedByTrinkets(c) ? resolveAllPendingTrinketAllocations(c) : c;
  let next = startHamletPhase(unblocked);
  if (next === unblocked) return c;
  next = retargetPendingReplacement(next, 'hamlet');
  next = evaluateReplacementFlow(next);
  return next;
}
