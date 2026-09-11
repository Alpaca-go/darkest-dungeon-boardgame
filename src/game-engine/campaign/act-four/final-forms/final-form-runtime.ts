// Phase 10E：Final Form 机制运行时容器 + Setup 调度器。
//
// 硬约束 1：**不新建第二套 Battle / Final Encounter 状态机**。
// 本模块只做三件事：
// 1. 在 Form 出场 / 切换时初始化该 Form 的「附加运行时」；
// 2. 提供只读 Selector（UI / 引擎共用同一份结论）；
// 3. 损坏存档的安全兜底 sanitize（不重掷任何已保存随机数）。
//
// 真正的战斗、先攻、召唤仍由既有引擎驱动；本模块产出的 initiativeCardCount 等
// 数值是「Definition 驱动的结论」，由调用方交给既有 Initiative 管线使用。

import type { ActFourState } from '../../../../types/act-four';
import type { FinalFormId } from '../../../../types/final-encounter';
import type {
  FinalFormRuntime,
  FinalFormRuntimeState,
} from '../../../../types/final-forms';
import {
  getAncestorFirstFormMechanics,
  getAncestorRoomAreaDefinition,
  getAncestorSecondFormMechanics,
  getFinalFormMechanics,
  getGestatingHeartMechanics,
  getHeartOfDarknessMechanics,
  validateAncestorRoomAreas,
  validateFinalFormMechanics,
} from '../../../../data/darkest-dungeon/final-encounter';
import type { FinalMechanicsMode } from '../../../../data/darkest-dungeon/final-encounter';
import { nowIso } from '../../../random';
import { createSeededRng } from '../rng';
import { finalFormTransactionIds } from './final-form-transactions';
import { setupAncestorFirstFormRuntime } from './ancestor-first-form';
import { setupAncestorSecondFormRuntime } from './ancestor-second-form';
import { setupGestatingHeartRuntime } from './gestating-heart';
import { setupHeartOfDarknessRuntime } from './heart-of-darkness';

const PROCESSED_LIMIT = 100;

// 幂等键定义在 final-form-transactions.ts（打断与各 Form 运行时的循环依赖），
// 这里再导出一次，调用方只需认准本模块。
export { finalFormTransactionIds };

// ---------------------------------------------------------------------------
// 容器
// ---------------------------------------------------------------------------

export function createFinalFormRuntimeState(
  encounterId: string,
  mode: FinalMechanicsMode,
): FinalFormRuntimeState {
  return {
    encounterId,
    activeFormId: null,
    runtimes: {},
    contentMode: mode,
    dataStatus: mode === 'prototype' ? 'prototype' : 'partial',
    processedTransactionIds: [],
    lastTransactionId: null,
  };
}

export function hasProcessedFinalFormTransaction(
  state: FinalFormRuntimeState,
  transactionId: string,
): boolean {
  return state.processedTransactionIds.includes(transactionId);
}

export function withProcessedFinalFormTransaction(
  state: FinalFormRuntimeState,
  transactionId: string,
): FinalFormRuntimeState {
  if (state.processedTransactionIds.includes(transactionId)) return state;
  return {
    ...state,
    processedTransactionIds: [...state.processedTransactionIds, transactionId].slice(-PROCESSED_LIMIT),
    lastTransactionId: transactionId,
  };
}

// ---------------------------------------------------------------------------
// Setup 调度
// ---------------------------------------------------------------------------

export interface SetupFinalFormRuntimeOptions {
  mode?: FinalMechanicsMode;
  rng?: () => number;
  seed?: number;
  now?: string;
}

export interface SetupFinalFormRuntimeResult {
  ok: boolean;
  state: FinalFormRuntimeState | null;
  runtime: FinalFormRuntime | null;
  alreadySetUp: boolean;
  reason: string | null;
}

/**
 * 为指定 Form 建立机制运行时。
 *
 * 幂等键：`final-form-setup:{encounterId}:{formId}`。
 * Data Gate：formal 模式下机制或 Room 数据不完整一律拒绝（硬约束 22）。
 */
export function setupFinalFormRuntime(
  current: FinalFormRuntimeState | null,
  encounterId: string,
  formId: FinalFormId,
  options?: SetupFinalFormRuntimeOptions,
): SetupFinalFormRuntimeResult {
  const mode: FinalMechanicsMode = options?.mode ?? 'prototype';
  const base = current ?? createFinalFormRuntimeState(encounterId, mode);

  if (base.encounterId !== encounterId) {
    return { ok: false, state: current, runtime: null, alreadySetUp: false, reason: 'Encounter ID 不匹配' };
  }

  const transactionId = finalFormTransactionIds.setup(encounterId, formId);
  const existing = base.runtimes[formId];
  if (existing || hasProcessedFinalFormTransaction(base, transactionId)) {
    return {
      ok: existing !== undefined,
      state: { ...base, activeFormId: formId },
      runtime: existing ?? null,
      alreadySetUp: true,
      reason: existing ? null : '事务已处理但缺少 Form 运行时（存档损坏）',
    };
  }

  const mechanics = getFinalFormMechanics(formId, mode);
  const room = getAncestorRoomAreaDefinition(mode);

  const mechanicsResult = validateFinalFormMechanics(mechanics);
  if (!mechanicsResult.isComplete) {
    if (mode === 'community-reference') {
      // Community mechanics may carry a known, operation-local blocker. They are
      // allowed to initialize; the action that first needs the unknown value fails closed.
    } else {
    return {
      ok: false,
      state: current,
      runtime: null,
      alreadySetUp: false,
      reason: `Final Form ${formId} 机制数据不完整：${[
        ...mechanicsResult.missing,
        ...mechanicsResult.issues,
      ].join('；')}`,
    };
    }
  }
  const roomResult = validateAncestorRoomAreas(room);
  if (!roomResult.isComplete) {
    return {
      ok: false,
      state: current,
      runtime: null,
      alreadySetUp: false,
      reason: `Ancestor Room 数据不完整：${[...roomResult.missing, ...roomResult.issues].join('；')}`,
    };
  }

  const now = options?.now ?? nowIso();
  const rng = options?.rng ?? createSeededRng(options?.seed ?? 0x10e00);

  let runtime: FinalFormRuntime;
  switch (formId) {
    case 'ancestor-first-form':
      runtime = setupAncestorFirstFormRuntime(getAncestorFirstFormMechanics(mode), rng);
      break;
    case 'ancestor-second-form':
      runtime = setupAncestorSecondFormRuntime(getAncestorSecondFormMechanics(mode), room);
      break;
    case 'gestating-heart':
      runtime = setupGestatingHeartRuntime(getGestatingHeartMechanics(mode));
      break;
    case 'heart-of-darkness':
      // 硬约束 18：Heart of Darkness 在 Battle Start 就必须先生成 Forecast，
      // 因此首个 Impending Doom 与 Setup 同一事务写入（避免出现「无预告的 Heart 回合」）。
      runtime = setupHeartOfDarknessRuntime(
        getHeartOfDarknessMechanics(mode),
        encounterId,
        rng,
        now,
      );
      break;
  }

  const nextState = withProcessedFinalFormTransaction(
    {
      ...base,
      activeFormId: formId,
      runtimes: { ...base.runtimes, [formId]: runtime },
    },
    transactionId,
  );

  return { ok: true, state: nextState, runtime, alreadySetUp: false, reason: null };
}

// ---------------------------------------------------------------------------
// 只读 Selector
// ---------------------------------------------------------------------------

export function getFinalFormRuntimeState(state: ActFourState): FinalFormRuntimeState | null {
  return state.finalFormRuntimeState;
}

export function getFinalFormRuntime(
  state: ActFourState,
  formId: FinalFormId,
): FinalFormRuntime | null {
  return state.finalFormRuntimeState?.runtimes[formId] ?? null;
}

export function getActiveFinalFormRuntime(state: ActFourState): FinalFormRuntime | null {
  const rt = state.finalFormRuntimeState;
  if (!rt || !rt.activeFormId) return null;
  return rt.runtimes[rt.activeFormId] ?? null;
}

/** 当前 Form 每轮的 Initiative Card 数（Gestating Heart 会随召唤增长）。 */
export function getActiveFinalFormInitiativeCardCount(state: ActFourState): number {
  const runtime = getActiveFinalFormRuntime(state);
  return runtime ? runtime.initiativeCardCount : 0;
}

// ---------------------------------------------------------------------------
// Sanitize（损坏存档不白屏；绝不重掷随机数）
// ---------------------------------------------------------------------------

const VALID_FORM_IDS: FinalFormId[] = [
  'ancestor-first-form',
  'ancestor-second-form',
  'gestating-heart',
  'heart-of-darkness',
];

function isRuntimeShape(value: unknown, formId: FinalFormId): value is FinalFormRuntime {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (r.kind !== formId) return false;
  return typeof r.initiativeCardCount === 'number';
}

export function sanitizeFinalFormRuntimeState(raw: unknown): FinalFormRuntimeState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const encounterId = typeof r.encounterId === 'string' ? r.encounterId : '';
  if (!encounterId) return null;

  const contentMode: FinalMechanicsMode = r.contentMode === 'formal' || r.contentMode === 'community-reference' ? r.contentMode : 'prototype';

  const runtimes: Partial<Record<FinalFormId, FinalFormRuntime>> = {};
  const rawRuntimes = (r.runtimes ?? {}) as Record<string, unknown>;
  for (const formId of VALID_FORM_IDS) {
    const candidate = rawRuntimes[formId];
    if (isRuntimeShape(candidate, formId)) runtimes[formId] = candidate;
  }

  const activeFormId =
    typeof r.activeFormId === 'string' && (VALID_FORM_IDS as string[]).includes(r.activeFormId)
      ? (r.activeFormId as FinalFormId)
      : null;

  return {
    encounterId,
    activeFormId,
    runtimes,
    contentMode,
    dataStatus:
      r.dataStatus === 'verified' || r.dataStatus === 'partial' || r.dataStatus === 'unavailable'
        ? r.dataStatus
        : 'prototype',
    processedTransactionIds: Array.isArray(r.processedTransactionIds)
      ? (r.processedTransactionIds as unknown[])
          .filter((x): x is string => typeof x === 'string')
          .slice(-PROCESSED_LIMIT)
      : [],
    lastTransactionId: typeof r.lastTransactionId === 'string' ? r.lastTransactionId : null,
  };
}
