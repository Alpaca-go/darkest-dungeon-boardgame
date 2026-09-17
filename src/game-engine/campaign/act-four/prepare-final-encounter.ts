// Phase 10A §17 / §18：Final Encounter 入口 + Final Provision。
//
// 规则 26—30：
// - Final Hamlet 4 天结束后进入 Final Encounter；
// - 进入前进行一次 Roll for Provisions（结果先保存，刷新不重掷，硬约束 4）；
// - Final Boss 有四个有序 Form，本局只面对三个（Quest 决定跳过哪一个）。
//
// 硬约束对照：
// - 硬约束 12：skippedFinalFormId 直接读 Quest 保存值，**不二次随机**；
// - 硬约束 13：heart-of-darkness 永不可跳过（类型层 + 运行时双保险）；
// - 硬约束 14：Final Encounter **不生成 Dungeon Exploration** —— 本函数显式清空 dungeon，
//   且全程不触碰 Room Token / Layout / 走廊；
// - 硬约束 18：所有 Form 共用同一个 Room（roomDefinitionId 单值，之后不再改）；
// - 硬约束 19：Form / Room / Provision 表缺失时 formal 模式禁用。

import type { CampaignState, ProvisionPool } from '../../../types';
import type { ActFourState } from '../../../types/act-four';
import type {
  FinalEncounterState,
  FinalFormId,
  FinalProvisionRecord,
  SkippableFinalFormId,
} from '../../../types/final-encounter';
import {
  FINAL_FORM_ORDER,
  UNSKIPPABLE_FINAL_FORM_ID,
  getFinalEncounterRoom,
  getFinalFormDisplayName,
  getFinalFormPool,
  isFinalEncounterOfficialEnabled,
  isSkippableFinalFormId,
  validateFinalForm,
} from '../../../data/darkest-dungeon/final-form-registry';
import {
  getFinalProvisionPolicy,
  isFinalProvisionOfficialEnabled,
  validateFinalProvisionPolicy,
} from '../../../data/darkest-dungeon/final-provision-policy';
import { pushLog } from '../../log';
import { createId, nowIso } from '../../random';
import type { ActFourContentMode } from './draw-quest';
import {
  actFourTransactionIds,
  hasProcessedActFourTransaction,
  withProcessedActFourTransaction,
} from './act-four-state';
import { createSeededRng } from './rng';
import type { CommunityRuntimeBlocker } from '../../../data/darkest-dungeon/community-reference/runtime-profile';
import { grantedFromCommunityProvision, rollCommunityProvisionDice, type CommunityWildChooser } from './community-provision-runtime';

// ---------------------------------------------------------------------------
// §18 Form 顺序推导
// ---------------------------------------------------------------------------

/**
 * 由「固定四形态顺序」剔除 skipped Form，得到本局实际面对的三个 Form。
 * 恒以 heart-of-darkness 结尾（硬约束 13）。
 */
export function buildOrderedFinalFormIds(skipped: SkippableFinalFormId): FinalFormId[] {
  return FINAL_FORM_ORDER.filter((id) => id !== skipped);
}

// ---------------------------------------------------------------------------
// §17 Roll for Provisions
// ---------------------------------------------------------------------------

export interface RollFinalProvisionsResult {
  record: FinalProvisionRecord;
  provisions: ProvisionPool;
}

/**
 * Final Provision 掷骰（纯函数，不改 campaign）。
 * 每种补给掷一个骰，按 grantTable 换算成数量，累加进公共 Provision Pool。
 */
export function rollFinalProvisions(
  current: ProvisionPool,
  mode: ActFourContentMode,
  rng: () => number,
  transactionId: string,
  now: string,
): RollFinalProvisionsResult {
  const policy = getFinalProvisionPolicy(mode === 'prototype' ? 'prototype' : 'formal');
  const rolls: Record<string, number> = {};
  const granted: Record<string, number> = {};
  const provisions: ProvisionPool = { ...current };

  for (const type of policy.provisionTypes) {
    const faces = Math.max(1, policy.dieFaces);
    const roll = Math.min(faces, Math.max(1, Math.floor(rng() * faces) + 1));
    const amount = policy.grantTable[roll] ?? 0;
    rolls[type] = roll;
    granted[type] = amount;
    provisions[type] = provisions[type] + amount;
  }

  return {
    record: { transactionId, rolls, granted, rolledAt: now },
    provisions,
  };
}

// ---------------------------------------------------------------------------
// Final Encounter 准备
// ---------------------------------------------------------------------------

export interface PrepareFinalEncounterOptions {
  mode?: ActFourContentMode;
  rng?: () => number;
  seed?: number;
  now?: string;
  chooseWild?: CommunityWildChooser;
}

export interface PrepareFinalEncounterResult {
  ok: boolean;
  campaign: CampaignState;
  encounter: FinalEncounterState | null;
  /** 本局实际面对的三个 Form（含 heart-of-darkness）。 */
  orderedFormIds: FinalFormId[];
  provisionRecord: FinalProvisionRecord | null;
  alreadyPrepared: boolean;
  reason: string | null;
  kind?: 'community-source-blocked';
  blocker?: CommunityRuntimeBlocker;
}

/**
 * 准备 Final Encounter。
 *
 * 幂等键：`final-encounter-prepare:{campaignId}`。
 * 步骤：
 * 1. 校验阶段（Final Hamlet 已完成）与 Data Gate；
 * 2. 读取 Quest 保存的 skippedFinalFormId（不二次随机）；
 * 3. Roll for Provisions → 先保存记录，再写公共 Provision Pool；
 * 4. 构建 FinalEncounterState（同一 Room / 三形态顺序 / 跨 Form 不恢复）；
 * 5. 显式清空 dungeon（硬约束 14：Final Encounter 不做 Dungeon Exploration）。
 *
 * 注意：本函数**不**推进 Stage 到 final-encounter-active，
 * 该推进由 startFinalForm()（第一个 Form 出场）负责。
 */
export function prepareFinalEncounter(
  campaign: CampaignState,
  options?: PrepareFinalEncounterOptions,
): PrepareFinalEncounterResult {
  const state: ActFourState = campaign.actFourState;
  const mode: ActFourContentMode = options?.mode ?? 'prototype';
  const transactionId = actFourTransactionIds.finalEncounterPrepare(campaign.id);

  if (state.finalEncounterState || hasProcessedActFourTransaction(state, transactionId)) {
    const existing = state.finalEncounterState;
    return {
      ok: existing !== null,
      campaign,
      encounter: existing,
      orderedFormIds: existing?.orderedFormIds ?? [],
      provisionRecord: existing?.provisionRecord ?? null,
      alreadyPrepared: true,
      reason: existing ? null : '事务已处理但缺少 finalEncounterState（存档损坏）',
    };
  }

  // ---- 1. 阶段校验 ----
  if (state.stage !== 'final-encounter-ready') {
    return prepFail(campaign, `当前阶段 ${state.stage} 不能准备 Final Encounter`);
  }
  if (state.finalHamletState?.status !== 'completed') {
    return prepFail(campaign, 'Final Hamlet 的 4 天尚未走完');
  }

  // ---- 2. skipped Form（硬约束 12 / 13）----
  const skipped = state.skippedFinalFormId;
  if (!skipped) {
    return prepFail(campaign, 'Quest 未保存 Skipped Final Form，无法推导 Form 顺序');
  }
  if (skipped === UNSKIPPABLE_FINAL_FORM_ID || !isSkippableFinalFormId(skipped)) {
    return prepFail(campaign, `非法的 Skipped Final Form：${skipped}（Heart of Darkness 不可跳过）`);
  }

  // ---- 3. Data Gate（硬约束 19）----
  if (mode === 'formal') {
    if (!isFinalEncounterOfficialEnabled()) {
      return prepFail(campaign, 'official Final Form / Room 数据缺失，正式 Final Encounter 已禁用');
    }
    if (!isFinalProvisionOfficialEnabled()) {
      return prepFail(campaign, 'official Final Provision 掷骰表缺失，正式 Final Encounter 已禁用');
    }
  }

  const orderedFormIds = buildOrderedFinalFormIds(skipped);
  if (orderedFormIds.length !== 3 || orderedFormIds[2] !== UNSKIPPABLE_FINAL_FORM_ID) {
    return prepFail(campaign, 'Form 顺序推导失败：必须为三个且以 Heart of Darkness 结尾');
  }

  const pool = getFinalFormPool(mode);
  for (const formId of orderedFormIds) {
    const def = pool.find((f) => f.formId === formId);
    if (!def) return prepFail(campaign, `找不到 Final Form 定义：${formId}`);
    const validation = validateFinalForm(def);
    if (!validation.isComplete) {
      return prepFail(
        campaign,
        `Final Form ${formId} 数据不完整：${[...validation.missing, ...validation.issues].join('；')}`,
      );
    }
  }

  if (mode !== 'community-reference') {
    const policy = getFinalProvisionPolicy(mode);
    const policyValidation = validateFinalProvisionPolicy(policy);
    if (!policyValidation.isComplete) {
      return prepFail(
        campaign,
        `Final Provision 策略不完整：${[...policyValidation.missing, ...policyValidation.issues].join('；')}`,
      );
    }
  }

  const room = getFinalEncounterRoom(mode);
  if (!room.formAreaId || room.validAreaIds.length === 0) {
    return prepFail(campaign, 'Final Encounter Room 数据不完整（Area 缺失）');
  }

  // ---- 4. Roll for Provisions（先保存后展示）----
  const now = options?.now ?? nowIso();
  const rng = options?.rng ?? createSeededRng(options?.seed ?? 0x10a17);
  let record: FinalProvisionRecord;
  let provisions: ProvisionPool;
  if (mode === 'community-reference') {
    const livingHeroIds = campaign.heroes.filter((hero) => !hero.dead && hero.isAlive !== false).map((hero) => hero.instanceId);
    if (livingHeroIds.length === 0) return prepFail(campaign, '队伍中没有可掷骰的英雄');
    const rolled = rollCommunityProvisionDice(
      campaign.provisions,
      'community-final-provision-policy-v1',
      livingHeroIds,
      2,
      rng,
      options?.chooseWild,
    );
    if (!rolled.ok) return prepFail(campaign, rolled.reason);
    record = {
      transactionId,
      rolls: Object.fromEntries(rolled.record.dice.map((die) => [`${die.heroId}:${die.dieIndex}`, die.roll])),
      granted: grantedFromCommunityProvision(rolled.record),
      rolledAt: now,
      communityProvision: rolled.record,
    };
    provisions = rolled.provisions;
  } else {
    const rolled = rollFinalProvisions(campaign.provisions, mode, rng, transactionId, now);
    record = rolled.record;
    provisions = rolled.provisions;
  }

  // ---- 5. 构建 FinalEncounterState ----
  const encounter: FinalEncounterState = {
    id: createId('ddfinal'),
    status: 'preparing',
    // 硬约束 18：所有 Form 共用同一个 Room，此值之后不再改动。
    roomDefinitionId: room.id,
    orderedFormIds,
    skippedFormId: skipped,
    activeFormIndex: -1,
    activeFormId: null,
    defeatedFormIds: [],
    transitionState: null,
    noRecoveryBetweenForms: true,
    noStanceChangeBetweenForms: true,
    provisionRecord: record,
    processedTransactionIds: [],
    lastTransactionId: transactionId,
  };

  let next: CampaignState = {
    ...campaign,
    provisions,
    // 硬约束 14：Final Encounter 不生成 Dungeon Exploration。
    dungeon: null,
    battle: null,
    updatedAt: now,
  };

  const grantedText = Object.entries(record.granted)
    .filter(([, amount]) => amount > 0)
    .map(([type, amount]) => `${type} +${amount}`)
    .join('、');
  next = pushLog(
    next,
    `Final Encounter 前补给掷骰完成${grantedText ? `：${grantedText}` : '（无所得）'}。`,
    'info',
  );
  next = pushLog(
    next,
    `本局跳过 ${getFinalFormDisplayName(skipped)}，将依次面对：${orderedFormIds
      .map((id) => getFinalFormDisplayName(id))
      .join(' → ')}。`,
    'warning',
  );

  return {
    ok: true,
    campaign: {
      ...next,
      actFourState: withProcessedActFourTransaction(
        { ...state, finalEncounterState: encounter },
        transactionId,
      ),
    },
    encounter,
    orderedFormIds,
    provisionRecord: record,
    alreadyPrepared: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

/** Final Encounter 是否已准备好（Provision 已掷、Form 顺序已定）。 */
export function isFinalEncounterPrepared(state: ActFourState): boolean {
  return state.finalEncounterState !== null;
}

/** 本局实际面对的 Form 顺序（未准备时为空）。 */
export function getOrderedFinalFormIds(state: ActFourState): FinalFormId[] {
  return state.finalEncounterState?.orderedFormIds ?? [];
}

/** 某个 Form 是否被本局 Quest 跳过。 */
export function isFinalFormSkipped(state: ActFourState, formId: FinalFormId): boolean {
  const encounter = state.finalEncounterState;
  if (encounter) return encounter.skippedFormId === formId;
  return state.skippedFinalFormId === formId;
}

/** 所有 Form 共用的 Room（硬约束 18：全程单值）。 */
export function getFinalEncounterRoomId(state: ActFourState): string | null {
  return state.finalEncounterState?.roomDefinitionId ?? null;
}

// ---------------------------------------------------------------------------

function prepFail(campaign: CampaignState, reason: string): PrepareFinalEncounterResult {
  return {
    ok: false,
    campaign,
    encounter: null,
    orderedFormIds: [],
    provisionRecord: null,
    alreadyPrepared: false,
    reason,
  };
}
