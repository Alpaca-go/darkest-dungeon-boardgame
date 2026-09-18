// Phase 10A §19 / §20：Form 切换。
//
// 规则 30 的核心：Form 之间**不是**三场独立战斗，而是同一场战斗换敌人。
//
// 硬约束对照（本模块是这四条的唯一执行点）：
// - 硬约束 15：Form Transition **不恢复 Life / Stress**；
// - 硬约束 16：Form Transition **不允许 Rest，也不允许 Change Stance**；
// - 硬约束 17：Form Transition **重建 Initiative 并把 Round 重置为 1**；
// - 硬约束 18：所有 Form **使用同一个 Room**。
//
// 实现要点：
// - 跨 Form 的保留 / 重置策略集中在 DEFAULT_FORM_TRANSITION_POLICY，不散落 if；
// - 切换前后各拍一份 Hero 快照，写进 FormTransitionRecord，
//   E2E / 单测可直接断言 wounds / stress / stance 三者逐字段相等；
// - 切换分三段（cleaning-up → rebuilding-initiative → spawning → completed），
//   任一段之后刷新都能从 transitionState 恢复（§23）。

import type { CampaignState } from '../../../types';
import type { ActFourState } from '../../../types/act-four';
import type {
  FinalEncounterState,
  FinalFormId,
  FormTransitionHeroSnapshot,
  FormTransitionPolicy,
  FormTransitionRecord,
  FormTransitionState,
} from '../../../types/final-encounter';
import {
  DEFAULT_FORM_TRANSITION_POLICY,
  UNSKIPPABLE_FINAL_FORM_ID,
  getFinalFormDisplayName,
  getFinalFormPool,
} from '../../../data/darkest-dungeon/final-form-registry';
import { pushLog } from '../../log';
import { nowIso } from '../../random';
import type { ActFourContentMode } from './draw-quest';
import { withProcessedActFourTransaction } from './act-four-state';
import { buildFinalEncounterBattle, buildFinalFormUnit } from './final-form-sequence';
import { createSeededRng } from './rng';
// Phase 10E：切换到新 Form 时同步建立其机制运行时（上一 Form 的运行时保留供审计）。
import { setupFinalFormRuntime } from './final-forms/final-form-runtime';
import { materializeCommunityFinalBattle } from './community-final-actors';

/** Form 切换历史保留条数（与 sanitizeActFourState 的 slice(-20) 对齐）。 */
export const FORM_TRANSITION_HISTORY_LIMIT = 20;

// ---------------------------------------------------------------------------
// Hero 快照
// ---------------------------------------------------------------------------

/** 拍一份 Hero 关键状态快照（用于断言「未恢复 / 未换姿态」）。 */
export function captureFormTransitionSnapshots(
  campaign: CampaignState,
): FormTransitionHeroSnapshot[] {
  return campaign.heroes.map((h) => ({
    heroId: h.instanceId,
    wounds: h.wounds,
    stress: h.stress,
    stance: h.stance,
    dead: h.dead,
  }));
}

/**
 * 校验「切换未恢复 Life / Stress、未改 Stance」（硬约束 15 / 16）。
 * 返回违规描述列表，空数组表示合规。
 */
export function diffFormTransitionSnapshots(
  before: FormTransitionHeroSnapshot[],
  after: FormTransitionHeroSnapshot[],
): string[] {
  const violations: string[] = [];
  const afterById = new Map(after.map((s) => [s.heroId, s]));
  for (const b of before) {
    const a = afterById.get(b.heroId);
    if (!a) {
      violations.push(`${b.heroId}：切换后英雄消失`);
      continue;
    }
    if (a.wounds !== b.wounds) violations.push(`${b.heroId}：wounds ${b.wounds} → ${a.wounds}`);
    if (a.stress !== b.stress) violations.push(`${b.heroId}：stress ${b.stress} → ${a.stress}`);
    if (a.stance !== b.stance) violations.push(`${b.heroId}：stance ${b.stance} → ${a.stance}`);
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Phase 10E：Form Transition 严格校验
// ---------------------------------------------------------------------------

/**
 * 切换前的结构性校验（Phase 10E 硬约束 2 / 4 / 5 / 13）。
 *
 * 只做「顺序 / 跳过」层面的判断，不涉及数值；任何一条不满足都拒绝切换，
 * 而不是先切过去再补救 —— 半切状态会污染整场 Final Encounter。
 */
export function validateFinalFormTransition(
  encounter: FinalEncounterState,
  fromFormId: FinalFormId,
  toFormId: FinalFormId,
): string[] {
  const violations: string[] = [];
  const order = encounter.orderedFormIds;

  const fromIndex = order.indexOf(fromFormId);
  const toIndex = order.indexOf(toFormId);

  if (fromIndex < 0) violations.push(`来源 Form ${fromFormId} 不在本局顺序内`);
  if (toIndex < 0) violations.push(`目标 Form ${toFormId} 不在本局顺序内`);
  if (fromIndex >= 0 && toIndex >= 0 && toIndex !== fromIndex + 1) {
    violations.push(`Form 顺序必须逐个推进（${fromFormId} → ${toFormId} 跳级或回退）`);
  }

  // 硬约束 4：skipped Form 只能来自 Quest，且绝不出现在实际顺序里。
  if (order.includes(encounter.skippedFormId)) {
    violations.push(`被 Quest 取消的 Form ${encounter.skippedFormId} 不得出现在顺序中`);
  }
  if (toFormId === encounter.skippedFormId) {
    violations.push(`不得切换到已被 Quest 取消的 Form ${toFormId}`);
  }

  // 硬约束 5 / 13：Heart of Darkness 恒为最后一个，且不可被跳过。
  if (order.length > 0 && order[order.length - 1] !== UNSKIPPABLE_FINAL_FORM_ID) {
    violations.push('Form 顺序的最后一个必须是 Heart of Darkness');
  }

  // 上一个 Form 必须确实已被击败（防止绕过 defeatFinalForm 直接切换）。
  if (!encounter.defeatedFormIds.includes(fromFormId)) {
    violations.push(`来源 Form ${fromFormId} 尚未被击败，不得切换`);
  }
  if (encounter.defeatedFormIds.includes(toFormId)) {
    violations.push(`目标 Form ${toFormId} 已被击败，不得重复出场`);
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 切换
// ---------------------------------------------------------------------------

export interface TransitionFinalFormOptions {
  mode?: ActFourContentMode;
  rng?: () => number;
  seed?: number;
  now?: string;
  /** 覆盖跨 Form 策略（仅测试 / Debug 使用）。 */
  policy?: FormTransitionPolicy;
}

export interface TransitionFinalFormResult {
  ok: boolean;
  campaign: CampaignState;
  fromFormId: FinalFormId | null;
  toFormId: FinalFormId | null;
  /** Initiative 是否已重建。 */
  initiativeRebuilt: boolean;
  /** 切换后的 Round（恒为 1）。 */
  round: number;
  /** 违反「不恢复 / 不换姿态」的项（正常恒为空数组）。 */
  violations: string[];
  record: FormTransitionRecord | null;
  alreadyTransitioned: boolean;
  reason: string | null;
}

/**
 * 切换到下一个 Form。
 *
 * 幂等键：`final-form-transition:{encounterId}:{from}:{to}`。
 * 前置：defeatFinalForm() 已把 status 置为 'transitioning' 并写好 transitionState。
 *
 * 执行顺序：
 * 1. cleaning-up：移除上一个 Form 单位，**不动**英雄的 wounds / stress / stance；
 * 2. rebuilding-initiative：重建 Initiative、Round 重置为 1；
 * 3. spawning：新 Form 在**同一个 Room** 出场；
 * 4. completed：写 FormTransitionRecord（含前后快照）。
 */
export function transitionToNextFinalForm(
  campaign: CampaignState,
  options?: TransitionFinalFormOptions,
): TransitionFinalFormResult {
  const state: ActFourState = campaign.actFourState;
  const encounter = state.finalEncounterState;
  const mode: ActFourContentMode = options?.mode ?? 'prototype';
  const policy = options?.policy ?? DEFAULT_FORM_TRANSITION_POLICY;

  if (!encounter) return transFail(campaign, 'Final Encounter 尚未准备');

  const pending: FormTransitionState | null = encounter.transitionState;
  if (!pending) {
    return transFail(campaign, '当前没有待处理的 Form 切换（先调用 defeatFinalForm）');
  }
  if (pending.status === 'completed') {
    return {
      ok: true,
      campaign,
      fromFormId: pending.fromFormId,
      toFormId: pending.toFormId,
      initiativeRebuilt: pending.initiativeRebuilt,
      round: pending.nextRound,
      violations: [],
      record: findTransitionRecord(state, pending.transactionId),
      alreadyTransitioned: true,
      reason: null,
    };
  }

  const transactionId = pending.transactionId;
  if (encounter.processedTransactionIds.includes(transactionId)) {
    return {
      ok: true,
      campaign,
      fromFormId: pending.fromFormId,
      toFormId: pending.toFormId,
      initiativeRebuilt: true,
      round: 1,
      violations: [],
      record: findTransitionRecord(state, transactionId),
      alreadyTransitioned: true,
      reason: null,
    };
  }

  // Phase 10E：先做结构性校验，不合规一律不切（避免半切状态）。
  const structuralViolations = validateFinalFormTransition(
    encounter,
    pending.fromFormId,
    pending.toFormId,
  );
  if (structuralViolations.length > 0) {
    return transFail(campaign, `Form 切换校验失败：${structuralViolations.join('；')}`);
  }

  const def = getFinalFormPool(mode).find((f) => f.formId === pending.toFormId);
  if (!def) return transFail(campaign, `找不到 Final Form 定义：${pending.toFormId}`);

  const now = options?.now ?? nowIso();
  const rng = options?.rng ?? createSeededRng(options?.seed ?? 0x10a19);

  // ---- 1. cleaning-up：拍前置快照。绝不触碰 wounds / stress / stance ----
  const before = captureFormTransitionSnapshots(campaign);
  const previousRoomId = campaign.battle?.sourceRoomId ?? encounter.roomDefinitionId;

  // ---- 2 + 3. rebuilding-initiative + spawning ----
  const formUnit = buildFinalFormUnit(def);
  const battle = buildFinalEncounterBattle(
    campaign,
    encounter,
    formUnit,
    rng,
    // 整场 Final Encounter 视为同一场战斗（policy.resetBattleUsage = false）。
    policy.resetBattleUsage ? null : (campaign.battle?.battleId ?? null),
  );

  // 硬约束 18：Room 不得随 Form 变化。
  if (battle.sourceRoomId !== previousRoomId) {
    return transFail(
      campaign,
      `Form 切换改变了 Room（${previousRoomId} → ${battle.sourceRoomId}），违反「所有 Form 同一 Room」`,
    );
  }

  // ---- 3.5 Phase 10E：为新 Form 建立机制运行时 ----
  // 与 startFinalEncounter 同一范式：上一个 Form 的运行时保留在 runtimes 内供审计 / 复盘，
  // 只是 activeFormId 前移。任何一个 Form 的 Data Gate 不通过都在这里拦下，
  // 绝不允许「战斗已切、机制没建」的半切状态。
  const mechanicsSetup = setupFinalFormRuntime(
    state.finalFormRuntimeState,
    encounter.id,
    pending.toFormId,
    { mode, rng, now },
  );
  if (!mechanicsSetup.ok) {
    return transFail(
      campaign,
      mechanicsSetup.reason ?? `无法建立 ${pending.toFormId} 的机制运行时`,
    );
  }

  // ---- 4. completed ----
  // campaign.heroes 全程未被本函数修改 → after 必然等于 before。
  // 这里仍然重新拍一次，以便任何未来的改动都会被下面的 diff 立刻抓出来。
  const after = captureFormTransitionSnapshots(campaign);
  const violations = diffFormTransitionSnapshots(before, after);
  if (violations.length > 0) {
    return transFail(
      campaign,
      `Form 切换违反「不恢复 Life / Stress、不换 Stance」：${violations.join('；')}`,
    );
  }

  const completedTransition: FormTransitionState = {
    ...pending,
    status: 'completed',
    initiativeRebuilt: true,
    nextRound: 1,
    completedAt: now,
  };

  const record: FormTransitionRecord = {
    transactionId,
    fromFormId: pending.fromFormId,
    toFormId: pending.toFormId,
    heroSnapshots: after,
    at: now,
  };

  const toIndex = encounter.orderedFormIds.indexOf(pending.toFormId);
  const nextEncounter: FinalEncounterState = {
    ...encounter,
    status: 'form-active',
    activeFormIndex: toIndex >= 0 ? toIndex : encounter.activeFormIndex + 1,
    activeFormId: pending.toFormId,
    transitionState: completedTransition,
    processedTransactionIds: [...encounter.processedTransactionIds, transactionId],
    lastTransactionId: transactionId,
  };

  let next: CampaignState = {
    ...campaign,
    // 硬约束 16：不允许 Rest / Change Stance —— heroes 原样带过，一个字段都不动。
    battle,
    gamePhase: 'battle',
    dungeon: null,
    updatedAt: now,
  };
  next = pushLog(
    next,
    `${getFinalFormDisplayName(pending.fromFormId)} 的残骸中站起了 ${getFinalFormDisplayName(
      pending.toFormId,
    )}。伤势与压力原样带入，先攻重排、回合归 1。`,
    'danger',
  );

  const nextState = withProcessedActFourTransaction(
    {
      ...state,
      finalEncounterState: nextEncounter,
      finalFormRuntimeState: mechanicsSetup.state,
      formTransitionHistory: [...state.formTransitionHistory, record].slice(
        -FORM_TRANSITION_HISTORY_LIMIT,
      ),
    },
    transactionId,
  );

  const finished = { ...next, actFourState: nextState };
  return {
    ok: true,
    campaign: mode === 'community-reference' ? materializeCommunityFinalBattle(finished) : finished,
    fromFormId: pending.fromFormId,
    toFormId: pending.toFormId,
    initiativeRebuilt: true,
    round: battle.round,
    violations: [],
    record,
    alreadyTransitioned: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

/** 当前生效的跨 Form 策略（UI / Debug 只读展示）。 */
export function getFormTransitionPolicy(): FormTransitionPolicy {
  return DEFAULT_FORM_TRANSITION_POLICY;
}

/** Form 切换历史（最近 20 条）。 */
export function getFormTransitionHistory(state: ActFourState): FormTransitionRecord[] {
  return state.formTransitionHistory;
}

/** Form 切换期间是否禁止 Rest（恒 true，UI 用它禁用 Rest 入口）。 */
export function isRestBlockedDuringFinalEncounter(state: ActFourState): boolean {
  return state.finalEncounterState !== null;
}

/** Form 切换期间是否禁止 Change Stance（恒 true）。 */
export function isStanceChangeBlockedBetweenForms(state: ActFourState): boolean {
  return state.finalEncounterState?.noStanceChangeBetweenForms === true;
}

// ---------------------------------------------------------------------------

function findTransitionRecord(
  state: ActFourState,
  transactionId: string,
): FormTransitionRecord | null {
  return state.formTransitionHistory.find((r) => r.transactionId === transactionId) ?? null;
}

function transFail(campaign: CampaignState, reason: string): TransitionFinalFormResult {
  return {
    ok: false,
    campaign,
    fromFormId: null,
    toFormId: null,
    initiativeRebuilt: false,
    round: 0,
    violations: [],
    record: null,
    alreadyTransitioned: false,
    reason,
  };
}
