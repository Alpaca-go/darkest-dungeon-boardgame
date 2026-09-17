// Phase 10E：Final Form 机制的 campaign 层入口。
//
// 定位：四个 Form 的运行时（ancestor-first-form / ancestor-second-form /
// gestating-heart / heart-of-darkness）都是**纯函数**，只认 runtime + mechanics。
// 本模块负责把它们接到 CampaignState 上：
//   读 campaign.actFourState.finalFormRuntimeState → 取对应 runtime + Definition
//   → 调纯函数 → 写回 state（含幂等事务 id）→ 写日志。
//
// 硬约束对照：
// - 硬约束 1：本模块**不**新建 Battle 状态机 —— Wounds / Skill / 召唤单位的实际结算
//   仍由既有引擎完成，这里只产出「结论 + 待应用增量」并交给调用方；
// - 硬约束 22：所有入口都先过 Data Gate（getFinalFormMechanics + validate*），
//   formal 模式数据不全一律拒绝，绝不回退到 prototype 数值；
// - 硬约束 25：随机结果由纯函数一次性写入 runtime，本模块只做搬运，不重掷。
//
// 命名约定：`<verb>FinalForm*` 对外，内部 helper 一律不导出。

import type { CampaignState } from '../../../../types';
import type { ActFourState } from '../../../../types/act-four';
import type { FinalFormId } from '../../../../types/final-encounter';
import type {
  AncestorFirstFormRuntime,
  AncestorSecondFormRuntime,
  AncestorStanceResolution,
  AncestorTeleportRecord,
  FinalFormRuntime,
  FinalFormRuntimeState,
  GestatingHeartRuntime,
  HeartOfDarknessRuntime,
  ImpendingDoomForecast,
  ImperfectDeathReactionRecord,
  ReflectionActorState,
  SispersionSummonRecord,
  WoundedReactionRecord,
} from '../../../../types/final-forms';
import {
  getAncestorFirstFormMechanics,
  getAncestorRoomAreaDefinition,
  getAncestorSecondFormMechanics,
  getGestatingHeartMechanics,
  getHeartOfDarknessMechanics,
} from '../../../../data/darkest-dungeon/final-encounter';
import type { FinalMechanicsMode } from '../../../../data/darkest-dungeon/final-encounter';
import { pushLog } from '../../../log';
import { nowIso } from '../../../random';
import { createSeededRng } from '../rng';
import { withProcessedFinalFormTransaction } from './final-form-runtime';
import { finalFormTransactionIds } from './final-form-transactions';
import { drawCommunityPhysicalMonster } from '../community-physical-monster-deck';
import { applyReflectionDeath, resolveAncestorStance } from './ancestor-first-form';
import { rollAncestorTeleport, type AreaOccupancyInput } from './ancestor-second-form';
import {
  applyGestatingHeartWoundedReaction,
  performSispersion,
  type SispersionInput,
  type WoundedReactionInput,
} from './gestating-heart';
import {
  consumeImpendingDoomForecast,
  generateNextImpendingDoomForecast,
} from './heart-of-darkness';
import { blockCommunityOperation, type CommunityRuntimeBlocker } from '../../../../data/darkest-dungeon/community-reference/runtime-profile';

// ---------------------------------------------------------------------------
// 公共入参 / 内部 helper
// ---------------------------------------------------------------------------

export interface FinalFormActionOptions {
  mode?: FinalMechanicsMode;
  rng?: () => number;
  seed?: number;
  now?: string;
}

interface ResolvedContext<T extends FinalFormRuntime> {
  ok: boolean;
  state: FinalFormRuntimeState | null;
  runtime: T | null;
  mode: FinalMechanicsMode;
  now: string;
  rng: () => number;
  reason: string | null;
}

/**
 * 统一取上下文：Final Form 运行时容器 + 指定 Form 的 runtime。
 *
 * 注意 `activeFormId` 的校验 —— 只允许操作**当前出场**的 Form，
 * 防止「Ancestor 2nd 已经上场却还在结算 1st 的 Reflection」这类串场 bug。
 */
function resolveContext<T extends FinalFormRuntime>(
  campaign: CampaignState,
  formId: FinalFormId,
  options: FinalFormActionOptions | undefined,
  seedFallback: number,
): ResolvedContext<T> {
  const state = campaign.actFourState.finalFormRuntimeState;
  const now = options?.now ?? nowIso();
  const rng = options?.rng ?? createSeededRng(options?.seed ?? seedFallback);
  const mode: FinalMechanicsMode = options?.mode ?? state?.contentMode ?? 'prototype';

  if (!state) {
    return { ok: false, state: null, runtime: null, mode, now, rng, reason: 'Final Form 机制运行时尚未建立' };
  }
  if (state.activeFormId !== formId) {
    return {
      ok: false,
      state,
      runtime: null,
      mode,
      now,
      rng,
      reason: `${formId} 不是当前出场的 Form（当前：${state.activeFormId ?? '无'}）`,
    };
  }
  const runtime = state.runtimes[formId];
  if (!runtime || runtime.kind !== formId) {
    return { ok: false, state, runtime: null, mode, now, rng, reason: `缺少 ${formId} 的机制运行时` };
  }
  return { ok: true, state, runtime: runtime as T, mode, now, rng, reason: null };
}

/** 把某个 Form 的新 runtime 写回 campaign（附幂等事务 id）。 */
function commitRuntime(
  campaign: CampaignState,
  state: FinalFormRuntimeState,
  formId: FinalFormId,
  runtime: FinalFormRuntime,
  transactionId: string,
  now: string,
): CampaignState {
  const nextRuntimeState = withProcessedFinalFormTransaction(
    { ...state, runtimes: { ...state.runtimes, [formId]: runtime } },
    transactionId,
  );
  const nextActFour: ActFourState = {
    ...campaign.actFourState,
    finalFormRuntimeState: nextRuntimeState,
  };
  return { ...campaign, actFourState: nextActFour, updatedAt: now };
}

// ---------------------------------------------------------------------------
// Ancestor 1st Form
// ---------------------------------------------------------------------------

export interface ReflectionDeathActionResult {
  ok: boolean;
  campaign: CampaignState;
  reaction: ImperfectDeathReactionRecord | null;
  /** 需由既有 Battle 引擎施加到 Ancestor 本体的 Wounds。 */
  ancestorWounds: number;
  /** 断言用：死亡后 Initiative Card 数（硬约束 8，恒 4）。 */
  initiativeCardCount: number;
  /** GUARD 是否已解除（所有 Reflection 死亡）。 */
  ancestorExposed: boolean;
  alreadyProcessed: boolean;
  reason: string | null;
}

/** Reflection 死亡（硬约束 8 / 10）。 */
export function applyFinalFormReflectionDeath(
  campaign: CampaignState,
  reflectionId: string,
  options?: FinalFormActionOptions,
): ReflectionDeathActionResult {
  const ctx = resolveContext<AncestorFirstFormRuntime>(
    campaign,
    'ancestor-first-form',
    options,
    0x10e01,
  );
  if (!ctx.ok || !ctx.state || !ctx.runtime) {
    return {
      ok: false,
      campaign,
      reaction: null,
      ancestorWounds: 0,
      initiativeCardCount: ctx.runtime?.initiativeCardCount ?? 0,
      ancestorExposed: false,
      alreadyProcessed: false,
      reason: ctx.reason,
    };
  }

  const encounterId = ctx.state.encounterId;
  const result = applyReflectionDeath(
    ctx.runtime,
    getAncestorFirstFormMechanics(ctx.mode),
    encounterId,
    reflectionId,
    ctx.now,
  );
  if (!result.ok) {
    return {
      ok: false,
      campaign,
      reaction: null,
      ancestorWounds: 0,
      initiativeCardCount: result.initiativeCardCount,
      ancestorExposed: false,
      alreadyProcessed: false,
      reason: result.reason,
    };
  }

  const exposed = result.runtime.reflections.every((r) => !r.alive);
  let next = commitRuntime(
    campaign,
    ctx.state,
    'ancestor-first-form',
    result.runtime,
    finalFormTransactionIds.reflectionDeath(encounterId, reflectionId),
    ctx.now,
  );

  if (!result.alreadyProcessed) {
    if (result.ancestorWounds > 0) {
      next = pushLog(
        next,
        `Imperfect Reflection 碎裂，反噬 Ancestor ${result.ancestorWounds} 点 Wounds（整场仅此一次）。`,
        'warning',
      );
    }
    if (exposed) {
      next = pushLog(next, '所有 Reflection 已尽数破碎——Ancestor 再无遮蔽，可被直接攻击。', 'danger');
    }
  }

  return {
    ok: true,
    campaign: next,
    reaction: result.reaction,
    ancestorWounds: result.ancestorWounds,
    initiativeCardCount: result.initiativeCardCount,
    ancestorExposed: exposed,
    alreadyProcessed: result.alreadyProcessed,
    reason: null,
  };
}

export interface AncestorStanceActionResult {
  ok: boolean;
  campaign: CampaignState;
  resolution: AncestorStanceResolution | null;
  spawnedReflections: ReflectionActorState[];
  skillIdToCast: string | null;
  alreadyProcessed: boolean;
  reason: string | null;
}

/** Ancestor 行动：Time Heals All / 补位（硬约束 11）。 */
export function resolveFinalFormAncestorStance(
  campaign: CampaignState,
  sequence: number,
  options?: FinalFormActionOptions,
): AncestorStanceActionResult {
  const ctx = resolveContext<AncestorFirstFormRuntime>(
    campaign,
    'ancestor-first-form',
    options,
    0x10e02,
  );
  if (!ctx.ok || !ctx.state || !ctx.runtime) {
    return {
      ok: false,
      campaign,
      resolution: null,
      spawnedReflections: [],
      skillIdToCast: null,
      alreadyProcessed: false,
      reason: ctx.reason,
    };
  }

  const encounterId = ctx.state.encounterId;
  const result = resolveAncestorStance(
    ctx.runtime,
    getAncestorFirstFormMechanics(ctx.mode),
    encounterId,
    sequence,
    ctx.now,
  );

  let next = commitRuntime(
    campaign,
    ctx.state,
    'ancestor-first-form',
    result.runtime,
    finalFormTransactionIds.stanceResolution(encounterId, sequence),
    ctx.now,
  );

  if (!result.alreadyProcessed && result.resolution) {
    const r = result.resolution;
    if (r.blockedReason) {
      next = pushLog(next, `Ancestor 的行动被资料缺口阻断：${r.blockedReason}`, 'warning');
    } else if (r.outcome === 'time-heals-all') {
      next = pushLog(next, '三面镜像各就其位——Ancestor 施放 Time Heals All。', 'danger');
    } else {
      next = pushLog(
        next,
        `Ancestor 补齐了空缺的镜像位（${r.filledStances.join('、')}）。`,
        'warning',
      );
    }
  }

  return {
    ok: result.ok,
    campaign: next,
    resolution: result.resolution,
    spawnedReflections: result.spawnedReflections,
    skillIdToCast: result.skillIdToCast,
    alreadyProcessed: result.alreadyProcessed,
    reason: result.reason,
  };
}

// ---------------------------------------------------------------------------
// Ancestor 2nd Form
// ---------------------------------------------------------------------------

export interface AncestorTeleportActionResult {
  ok: boolean;
  campaign: CampaignState;
  record: AncestorTeleportRecord | null;
  alreadyProcessed: boolean;
  reason: string | null;
  kind?: 'community-source-blocked';
  blocker?: CommunityRuntimeBlocker;
}

/** Ancestor Action 结束后的 d10 传送（硬约束 13 / 14 / 25）。 */
export function rollFinalFormAncestorTeleport(
  campaign: CampaignState,
  sequence: number,
  options?: FinalFormActionOptions & { occupancy?: AreaOccupancyInput },
): AncestorTeleportActionResult {
  const ctx = resolveContext<AncestorSecondFormRuntime>(
    campaign,
    'ancestor-second-form',
    options,
    0x10e03,
  );
  if (!ctx.ok || !ctx.state || !ctx.runtime) {
    return { ok: false, campaign, record: null, alreadyProcessed: false, reason: ctx.reason };
  }

  const encounterId = ctx.state.encounterId;
  const result = rollAncestorTeleport(
    ctx.runtime,
    getAncestorSecondFormMechanics(ctx.mode),
    getAncestorRoomAreaDefinition(ctx.mode),
    encounterId,
    sequence,
    ctx.rng,
    ctx.now,
    options?.occupancy,
  );
  if (!result.ok) {
    return { ok: false, campaign, record: result.record, alreadyProcessed: false, reason: result.reason };
  }

  let next = commitRuntime(
    campaign,
    ctx.state,
    'ancestor-second-form',
    result.runtime,
    finalFormTransactionIds.teleport(encounterId, sequence),
    ctx.now,
  );

  if (!result.alreadyProcessed && result.record) {
    const rec = result.record;
    if (rec.blockedReason) {
      next = pushLog(next, `Ancestor 的传送未能完成（d10=${rec.roll}）：${rec.blockedReason}`, 'warning');
    } else if (rec.teleported) {
      next = pushLog(next, `Ancestor 撕开空间，闪现至 ${rec.resultStance} 位（d10=${rec.roll}）。`, 'danger');
    } else {
      next = pushLog(next, `d10=${rec.roll}——Ancestor 停在原处。`, 'info');
    }
  }

  return {
    ok: true,
    campaign: next,
    record: result.record,
    alreadyProcessed: result.alreadyProcessed,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Gestating Heart
// ---------------------------------------------------------------------------

export interface SispersionActionResult {
  ok: boolean;
  campaign: CampaignState;
  record: SispersionSummonRecord | null;
  /** 原子写入后的 Initiative Card 总数（硬约束 16 断言点）。 */
  initiativeCardCount: number;
  alreadyProcessed: boolean;
  reason: string | null;
}

/** Sispersion 召唤（硬约束 15 / 16）。 */
export function performFinalFormSispersion(
  campaign: CampaignState,
  sequence: number,
  options?: FinalFormActionOptions & { input?: SispersionInput },
): SispersionActionResult {
  const ctx = resolveContext<GestatingHeartRuntime>(campaign, 'gestating-heart', options, 0x10e04);
  if (!ctx.ok || !ctx.state || !ctx.runtime) {
    return {
      ok: false,
      campaign,
      record: null,
      initiativeCardCount: ctx.runtime?.initiativeCardCount ?? 0,
      alreadyProcessed: false,
      reason: ctx.reason,
    };
  }

  const encounterId = ctx.state.encounterId;
  const sispersionTx = finalFormTransactionIds.sispersion(encounterId, sequence);
  let sourceCampaign = campaign;
  const input = { ...options?.input };
  if (ctx.mode === 'community-reference' && !input.selectedMonsterDefinitionId) {
    const drawn = drawCommunityPhysicalMonster(campaign, sispersionTx);
    if (!drawn.ok) {
      return {
        ok: false,
        campaign,
        record: null,
        initiativeCardCount: ctx.runtime.initiativeCardCount,
        alreadyProcessed: false,
        reason: drawn.reason,
      };
    }
    sourceCampaign = drawn.campaign;
    input.selectedMonsterDefinitionId = drawn.monsterDefinitionId;
  }
  const result = performSispersion(
    ctx.runtime,
    getGestatingHeartMechanics(ctx.mode),
    getAncestorRoomAreaDefinition(ctx.mode),
    encounterId,
    sequence,
    ctx.rng,
    ctx.now,
    input,
  );
  if (!result.ok) {
    return {
      ok: false,
      campaign,
      record: result.record,
      initiativeCardCount: result.initiativeCardCount,
      alreadyProcessed: false,
      reason: result.reason,
    };
  }

  let next = commitRuntime(
    sourceCampaign,
    ctx.state,
    'gestating-heart',
    result.runtime,
    finalFormTransactionIds.sispersion(encounterId, sequence),
    ctx.now,
  );

  if (!result.alreadyProcessed && result.record) {
    next = pushLog(
      next,
      `Gestating Heart 迸出新的血肉——${result.record.monsterDefinitionId} 加入战场，先攻牌增至 ${result.initiativeCardCount} 张。`,
      'danger',
    );
  }

  return {
    ok: true,
    campaign: next,
    record: result.record,
    initiativeCardCount: result.initiativeCardCount,
    alreadyProcessed: result.alreadyProcessed,
    reason: null,
  };
}

export interface WoundedReactionActionResult {
  ok: boolean;
  campaign: CampaignState;
  triggered: boolean;
  record: WoundedReactionRecord | null;
  effect: {
    targetHeroId: string;
    blightPotency: number;
    blightDurationTurns: number;
    heartHeal: number;
  } | null;
  alreadyProcessed: boolean;
  reason: string | null;
  kind?: 'community-source-blocked';
  blocker?: CommunityRuntimeBlocker;
}

/** Gestating Reaction（硬约束 17：仅在实际造成 Wounds 时触发）。 */
export function applyFinalFormWoundedReaction(
  campaign: CampaignState,
  sequence: number,
  input: WoundedReactionInput,
  options?: FinalFormActionOptions,
): WoundedReactionActionResult {
  const ctx = resolveContext<GestatingHeartRuntime>(campaign, 'gestating-heart', options, 0x10e05);
  if (!ctx.ok || !ctx.state || !ctx.runtime) {
    return {
      ok: false,
      campaign,
      triggered: false,
      record: null,
      effect: null,
      alreadyProcessed: false,
      reason: ctx.reason,
    };
  }
  if (ctx.mode === 'community-reference' && input.lethal) {
    const blocked = blockCommunityOperation('GESTATING_HEART_LETHAL_TIMING_UNRESOLVED');
    return { campaign, triggered: false, record: null, effect: null, alreadyProcessed: false, reason: blocked.blocker.code, ...blocked };
  }

  const encounterId = ctx.state.encounterId;
  const result = applyGestatingHeartWoundedReaction(
    ctx.runtime,
    getGestatingHeartMechanics(ctx.mode),
    encounterId,
    sequence,
    input,
    ctx.now,
  );
  if (!result.ok) {
    return {
      ok: false,
      campaign,
      triggered: false,
      record: result.record,
      effect: null,
      alreadyProcessed: false,
      reason: result.reason,
    };
  }
  // 未触发（0 伤）时不写状态，避免污染幂等事务表。
  if (!result.record) {
    return {
      ok: true,
      campaign,
      triggered: false,
      record: null,
      effect: null,
      alreadyProcessed: false,
      reason: result.reason,
    };
  }

  let next = commitRuntime(
    campaign,
    ctx.state,
    'gestating-heart',
    result.runtime,
    finalFormTransactionIds.woundedReaction(encounterId, sequence),
    ctx.now,
  );

  if (!result.alreadyProcessed) {
    next = result.triggered
      ? pushLog(
          next,
          `血肉的伤口喷出腐液——${input.sourceHeroId} 中毒，Gestating Heart 自愈 ${result.record.healed} 点。`,
          'warning',
        )
      : pushLog(next, `Gestating Reaction 未生效：${result.record.blockedReason}`, 'info');
  }

  return {
    ok: true,
    campaign: next,
    triggered: result.triggered,
    record: result.record,
    effect: result.effect,
    alreadyProcessed: result.alreadyProcessed,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Heart of Darkness
// ---------------------------------------------------------------------------

export interface ImpendingDoomActionResult {
  ok: boolean;
  campaign: CampaignState;
  forecast: ImpendingDoomForecast | null;
  /** 消费时给出应施放的 Skill；生成时恒为 null。 */
  skillIdToCast: string | null;
  alreadyProcessed: boolean;
  reason: string | null;
}

/** Heart 回合：消费已保存的 Forecast（硬约束 19，不重掷）。 */
export function consumeFinalFormImpendingDoom(
  campaign: CampaignState,
  options?: FinalFormActionOptions,
): ImpendingDoomActionResult {
  const ctx = resolveContext<HeartOfDarknessRuntime>(campaign, 'heart-of-darkness', options, 0x10e06);
  if (!ctx.ok || !ctx.state || !ctx.runtime) {
    return { ok: false, campaign, forecast: null, skillIdToCast: null, alreadyProcessed: false, reason: ctx.reason };
  }

  const result = consumeImpendingDoomForecast(
    ctx.runtime,
    getHeartOfDarknessMechanics(ctx.mode),
    ctx.now,
  );
  if (!result.ok) {
    return {
      ok: false,
      campaign,
      forecast: result.forecast,
      skillIdToCast: null,
      alreadyProcessed: result.alreadyProcessed,
      reason: result.reason,
    };
  }

  const forecast = result.forecast;
  let next = commitRuntime(
    campaign,
    ctx.state,
    'heart-of-darkness',
    result.runtime,
    `${forecast?.transactionId ?? 'impending-doom'}:consume`,
    ctx.now,
  );

  if (!result.alreadyProcessed && forecast) {
    next = forecast.blockedReason
      ? pushLog(next, `Impending Doom（d10=${forecast.roll}）无法执行：${forecast.blockedReason}`, 'warning')
      : pushLog(next, `预告成真——Heart of Darkness 施放 ${forecast.skillId}（d10=${forecast.roll}）。`, 'danger');
  }

  return {
    ok: true,
    campaign: next,
    forecast,
    skillIdToCast: result.skillIdToCast,
    alreadyProcessed: result.alreadyProcessed,
    reason: result.reason,
  };
}

/** Heart 的 Action 完成后生成下一个 Forecast（硬约束 20）。 */
export function generateFinalFormImpendingDoom(
  campaign: CampaignState,
  options?: FinalFormActionOptions,
): ImpendingDoomActionResult {
  const ctx = resolveContext<HeartOfDarknessRuntime>(campaign, 'heart-of-darkness', options, 0x10e07);
  if (!ctx.ok || !ctx.state || !ctx.runtime) {
    return { ok: false, campaign, forecast: null, skillIdToCast: null, alreadyProcessed: false, reason: ctx.reason };
  }

  const result = generateNextImpendingDoomForecast(
    ctx.runtime,
    getHeartOfDarknessMechanics(ctx.mode),
    ctx.state.encounterId,
    ctx.rng,
    ctx.now,
  );
  if (!result.ok) {
    return {
      ok: false,
      campaign,
      forecast: result.forecast,
      skillIdToCast: null,
      alreadyProcessed: result.alreadyProcessed,
      reason: result.reason,
    };
  }

  const forecast = result.forecast;
  let next = commitRuntime(
    campaign,
    ctx.state,
    'heart-of-darkness',
    result.runtime,
    forecast?.transactionId ?? `impending-doom:${ctx.now}`,
    ctx.now,
  );

  if (!result.alreadyProcessed && forecast) {
    next = pushLog(
      next,
      forecast.blockedReason
        ? `新的 Impending Doom 已预示（d10=${forecast.roll}），但${forecast.blockedReason}`
        : `新的 Impending Doom 已预示：d10=${forecast.roll} → ${forecast.skillId}。`,
      'warning',
    );
  }

  return {
    ok: true,
    campaign: next,
    forecast,
    skillIdToCast: null,
    alreadyProcessed: result.alreadyProcessed,
    reason: result.reason,
  };
}

/** Real Heart-of-Darkness boundary for the unresolved Come Unto Your Maker rule. */
export function performFinalFormComeUntoYourMaker(
  campaign: CampaignState,
  options?: FinalFormActionOptions,
): { ok: false; campaign: CampaignState; reason: string; kind?: 'community-source-blocked'; blocker?: CommunityRuntimeBlocker } {
  const ctx = resolveContext<HeartOfDarknessRuntime>(campaign, 'heart-of-darkness', options, 0x10e08);
  if (ctx.mode === 'community-reference') {
    const blocked = blockCommunityOperation('COME_UNTO_YOUR_MAKER_UNRESOLVED');
    return { campaign, reason: blocked.blocker.code, ...blocked };
  }
  return { ok: false, campaign, reason: ctx.reason ?? 'Come Unto Your Maker is unavailable' };
}
