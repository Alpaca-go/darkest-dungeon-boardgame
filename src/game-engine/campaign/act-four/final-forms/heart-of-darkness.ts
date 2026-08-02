// Phase 10E §Heart of Darkness 运行时：Impending Doom / Forecast 生命周期。
//
// 硬约束对照：
// - 5.  Heart of Darkness **不可跳过**（cannotBeSkipped 字面量 true）；
// - 18. Battle Start 必须先生成 Forecast（与 Setup 同一事务）；
// - 19. Forecast 对玩家可见，且 Heart 回合到来时**消费**既有 Forecast，**禁止重掷**；
// - 20. Action 完成后才生成下一个 Forecast；
// - 21. Come Unto Your Maker 官方数据缺失 → 恒禁用，绝不按电子游戏实现；
// - 27. 击败 Heart of Darkness 直接结算 Campaign Victory（由 victory 模块消费本模块结论）。

import type {
  HeartOfDarknessMechanics,
  HeartOfDarknessRuntime,
  ImpendingDoomForecast,
} from '../../../../types/final-forms';
import { rollD10 } from '../rng';
import { finalFormTransactionIds } from './final-form-transactions';

const HISTORY_LIMIT = 20;

// ---------------------------------------------------------------------------
// Forecast 生成
// ---------------------------------------------------------------------------

function buildForecast(
  mech: HeartOfDarknessMechanics,
  transactionId: string,
  roll: number,
  now: string,
): ImpendingDoomForecast {
  const skillId = mech.impendingDoom.d10SkillMap[roll] || null;
  return {
    transactionId,
    roll,
    skillId,
    visibleToPlayers: mech.impendingDoom.forecastVisibleToPlayers,
    generatedAt: now,
    consumed: false,
    consumedAt: null,
    blockedReason: skillId
      ? null
      : `Impending Doom 掷出 ${roll}，但官方 d10 → Skill 映射缺失，无法执行`,
  };
}

// ---------------------------------------------------------------------------
// Setup（硬约束 18：Battle Start 即生成首个 Forecast）
// ---------------------------------------------------------------------------

export function setupHeartOfDarknessRuntime(
  mech: HeartOfDarknessMechanics,
  encounterId: string,
  rng: () => number,
  now: string,
): HeartOfDarknessRuntime {
  const base: HeartOfDarknessRuntime = {
    kind: 'heart-of-darkness',
    initiativeCardCount: 2,
    cannotBeSkipped: true,
    currentForecast: null,
    forecastHistory: [],
    consumedForecastCount: 0,
    // 硬约束 21：无论 formal 还是 prototype 都恒为 false。
    comeUntoYourMakerEnabled: false,
  };

  if (!mech.impendingDoom.triggerAtBattleStart) return base;

  const transactionId = finalFormTransactionIds.impendingDoom(encounterId, 0);
  const forecast = buildForecast(mech, transactionId, rollD10(rng), now);
  return {
    ...base,
    currentForecast: forecast,
    forecastHistory: [forecast],
  };
}

// ---------------------------------------------------------------------------
// 只读 Selector
// ---------------------------------------------------------------------------

/** 玩家可见的下一次行动预告（硬约束 19）。 */
export function getVisibleImpendingDoomForecast(
  runtime: HeartOfDarknessRuntime,
): ImpendingDoomForecast | null {
  const f = runtime.currentForecast;
  if (!f || f.consumed) return null;
  return f.visibleToPlayers ? f : null;
}

/** 硬约束 21：Come Unto Your Maker 一律不可用。 */
export function isComeUntoYourMakerAvailable(runtime: HeartOfDarknessRuntime): boolean {
  return runtime.comeUntoYourMakerEnabled;
}

/** 硬约束 5：Heart of Darkness 永远不能被 Quest 跳过。 */
export function canSkipHeartOfDarkness(): false {
  return false;
}

// ---------------------------------------------------------------------------
// 消费 Forecast（硬约束 19：只消费，不重掷）
// ---------------------------------------------------------------------------

export interface ConsumeForecastResult {
  ok: boolean;
  runtime: HeartOfDarknessRuntime;
  forecast: ImpendingDoomForecast | null;
  /** 本回合应施放的 Skill；数据缺口时为 null。 */
  skillIdToCast: string | null;
  alreadyProcessed: boolean;
  reason: string | null;
}

/**
 * Heart 回合到来：消费当前 Forecast。
 *
 * **不掷骰**：roll 在上一次生成时就已保存，这里只是把它取出来执行。
 * 重复调用返回 alreadyProcessed，绝不会产生第二个结果。
 */
export function consumeImpendingDoomForecast(
  runtime: HeartOfDarknessRuntime,
  mech: HeartOfDarknessMechanics,
  now: string,
): ConsumeForecastResult {
  if (!mech.impendingDoom.consumeForecastOnTurn) {
    return {
      ok: false,
      runtime,
      forecast: runtime.currentForecast,
      skillIdToCast: null,
      alreadyProcessed: false,
      reason: 'Definition 未声明「回合消费 Forecast」，拒绝执行（不得改为即时重掷）',
    };
  }

  const current = runtime.currentForecast;
  if (!current) {
    return {
      ok: false,
      runtime,
      forecast: null,
      skillIdToCast: null,
      alreadyProcessed: false,
      reason: '当前没有待消费的 Impending Doom Forecast',
    };
  }
  if (current.consumed) {
    return {
      ok: true,
      runtime,
      forecast: current,
      skillIdToCast: null,
      alreadyProcessed: true,
      reason: null,
    };
  }

  const consumed: ImpendingDoomForecast = { ...current, consumed: true, consumedAt: now };
  const history = runtime.forecastHistory.map((f) =>
    f.transactionId === consumed.transactionId ? consumed : f,
  );

  return {
    ok: true,
    runtime: {
      ...runtime,
      currentForecast: consumed,
      forecastHistory: history,
      consumedForecastCount: runtime.consumedForecastCount + 1,
    },
    forecast: consumed,
    skillIdToCast: consumed.blockedReason ? null : consumed.skillId,
    alreadyProcessed: false,
    reason: consumed.blockedReason,
  };
}

// ---------------------------------------------------------------------------
// Action 完成后生成下一个 Forecast（硬约束 20）
// ---------------------------------------------------------------------------

export interface GenerateForecastResult {
  ok: boolean;
  runtime: HeartOfDarknessRuntime;
  forecast: ImpendingDoomForecast | null;
  alreadyProcessed: boolean;
  reason: string | null;
}

/**
 * Heart 的 Action 完成后生成下一个 Forecast。
 *
 * 幂等键按 `forecastHistory.length` 递增；同一 sequence 已存在则原样返回，
 * 保证刷新 / 重放不会改变已展示给玩家的预告（硬约束 25）。
 */
export function generateNextImpendingDoomForecast(
  runtime: HeartOfDarknessRuntime,
  mech: HeartOfDarknessMechanics,
  encounterId: string,
  rng: () => number,
  now: string,
): GenerateForecastResult {
  if (!mech.impendingDoom.triggerAfterCompletedAction) {
    return {
      ok: false,
      runtime,
      forecast: null,
      alreadyProcessed: false,
      reason: 'Definition 未声明「Action 完成后生成 Forecast」',
    };
  }

  const current = runtime.currentForecast;
  if (current && !current.consumed) {
    // 硬约束 19：既有 Forecast 尚未被消费，绝不覆盖 / 重掷。
    return {
      ok: false,
      runtime,
      forecast: current,
      alreadyProcessed: true,
      reason: '当前 Forecast 尚未被消费，不得生成新的预告',
    };
  }

  const sequence = runtime.forecastHistory.length;
  const transactionId = finalFormTransactionIds.impendingDoom(encounterId, sequence);
  const existing = runtime.forecastHistory.find((f) => f.transactionId === transactionId);
  if (existing) {
    return { ok: true, runtime, forecast: existing, alreadyProcessed: true, reason: null };
  }

  const forecast = buildForecast(mech, transactionId, rollD10(rng), now);
  return {
    ok: true,
    runtime: {
      ...runtime,
      currentForecast: forecast,
      forecastHistory: [...runtime.forecastHistory, forecast].slice(-HISTORY_LIMIT),
    },
    forecast,
    alreadyProcessed: false,
    reason: forecast.blockedReason,
  };
}
