// Phase 10E §Ancestor 1st Form 运行时：Reflections / GUARD / Imperfect Reaction / Time Heals All。
//
// 硬约束对照：
// - 6.  三个 Reflection（2 Perfect + 1 Imperfect）随机分配到三个非 aggressive Stance；
// - 7.  Initiative Card 恒为 4（Definition 驱动，字面量类型锁死）；
// - 8.  Reflection 死亡**不减少** Initiative Card；
// - 9.  只要还有 Reflection 存活，Ancestor 不可被 Target（GUARD）；
// - 10. Imperfect Reflection 死亡对 Ancestor 造成 10 Wounds，整场**只触发一次**；
// - 11. Ancestor 行动时：三个 Reflection Stance 全满 → Time Heals All；有空位 → 补位。
//       两条分支都必须 Definition 驱动，数据缺口一律 blocked，绝不内联推测数值。
//
// 本模块是纯函数：只产出「结论 + 待应用的增量」，Wounds / Skill 的实际结算
// 仍交给既有 Battle 引擎（硬约束 1）。

import type {
  AncestorFirstFormMechanics,
  AncestorFirstFormRuntime,
  AncestorStanceResolution,
  ImperfectDeathReactionRecord,
  NonAggressiveStance,
  ReflectionActorState,
  ReflectionKind,
} from '../../../../types/final-forms';
import { NON_AGGRESSIVE_STANCES } from '../../../../types/final-forms';
import { shuffleWithRng } from '../rng';
import { finalFormTransactionIds } from './final-form-transactions';

const HISTORY_LIMIT = 20;

function reflectionCardMaxWounds(
  mech: AncestorFirstFormMechanics,
  kind: ReflectionKind,
): number | null {
  return mech.reflectionCards.find((c) => c.kind === kind)?.maxWounds ?? null;
}

function reflectionId(kind: ReflectionKind, sequence: number): string {
  return `final-reflection-${kind}-${sequence}`;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * 建立 Ancestor 1st Form 运行时。
 *
 * Reflection 的 Stance 分配是**随机**的（硬约束 6），因此接收可注入 RNG；
 * 结果一次性写入运行时（先保存后展示，刷新不重掷）。
 */
export function setupAncestorFirstFormRuntime(
  mech: AncestorFirstFormMechanics,
  rng: () => number,
): AncestorFirstFormRuntime {
  const kinds: ReflectionKind[] = [
    ...Array.from({ length: Math.max(0, mech.perfectReflectionCount) }, () => 'perfect' as const),
    ...Array.from({ length: Math.max(0, mech.imperfectReflectionCount) }, () => 'imperfect' as const),
  ];

  const pool =
    mech.randomizeAcrossStances.length > 0
      ? mech.randomizeAcrossStances
      : NON_AGGRESSIVE_STANCES;
  const shuffledStances = shuffleWithRng(rng, pool);

  const reflections: ReflectionActorState[] = kinds.map((kind, index) => ({
    id: reflectionId(kind, index + 1),
    kind,
    stance: shuffledStances[index % shuffledStances.length] as NonAggressiveStance,
    alive: true,
    wounds: 0,
    maxWounds: reflectionCardMaxWounds(mech, kind),
    generation: 1,
    diedAt: null,
  }));

  return {
    kind: 'ancestor-first-form',
    // 硬约束 7 / 8：Definition 声明 4，且 Reflection 死亡不得改动。
    initiativeCardCount: 4,
    allocationPolicy: mech.allocationPolicy,
    guardPolicy: mech.guardPolicy,
    reflections,
    imperfectDeathReactionApplied: false,
    imperfectDeathReaction: null,
    fullStanceSkillId: mech.fullStanceSkillId,
    vacantStanceResolverId: mech.vacantStanceResolverId,
    lastStanceResolution: null,
    stanceResolutionHistory: [],
  };
}

// ---------------------------------------------------------------------------
// 只读 Selector
// ---------------------------------------------------------------------------

export function getAliveReflections(runtime: AncestorFirstFormRuntime): ReflectionActorState[] {
  return runtime.reflections.filter((r) => r.alive);
}

export function getOccupiedReflectionStances(
  runtime: AncestorFirstFormRuntime,
): NonAggressiveStance[] {
  return Array.from(new Set(getAliveReflections(runtime).map((r) => r.stance)));
}

export function getVacantReflectionStances(
  runtime: AncestorFirstFormRuntime,
): NonAggressiveStance[] {
  const occupied = new Set(getOccupiedReflectionStances(runtime));
  return NON_AGGRESSIVE_STANCES.filter((s) => !occupied.has(s));
}

/** 硬约束 9：Reflection 全灭前 Ancestor 不可被 Target。 */
export function canTargetAncestorFirstForm(runtime: AncestorFirstFormRuntime): boolean {
  return getAliveReflections(runtime).length === 0;
}

export interface AncestorTargetCheck {
  allowed: boolean;
  reason: string | null;
  /** 被 GUARD 挡下时，玩家可选的合法目标。 */
  allowedTargetIds: string[];
}

/**
 * 目标合法性校验（GUARD）。
 * `ancestorActorId` 由调用方（既有 Battle 引擎）给出，本模块不持有 BattleUnit。
 */
export function checkAncestorFirstFormTarget(
  runtime: AncestorFirstFormRuntime,
  ancestorActorId: string,
  requestedTargetId: string,
): AncestorTargetCheck {
  const aliveIds = getAliveReflections(runtime).map((r) => r.id);
  if (requestedTargetId !== ancestorActorId) {
    return { allowed: true, reason: null, allowedTargetIds: [...aliveIds, ancestorActorId] };
  }
  if (aliveIds.length > 0) {
    return {
      allowed: false,
      reason: 'Reflection 存活期间 Ancestor 受 GUARD 保护，不可被指定为目标',
      allowedTargetIds: aliveIds,
    };
  }
  return { allowed: true, reason: null, allowedTargetIds: [ancestorActorId] };
}

// ---------------------------------------------------------------------------
// Reflection 死亡（硬约束 8 / 10）
// ---------------------------------------------------------------------------

export interface ReflectionDeathResult {
  ok: boolean;
  runtime: AncestorFirstFormRuntime;
  /** Imperfect 触发的反应；未触发为 null。 */
  reaction: ImperfectDeathReactionRecord | null;
  /** 需要由调用方施加到 Ancestor 本体上的 Wounds（0 表示无）。 */
  ancestorWounds: number;
  /** 死亡后 Initiative Card 数（断言用；恒为 4）。 */
  initiativeCardCount: 4;
  alreadyProcessed: boolean;
  reason: string | null;
}

/**
 * 处理一个 Reflection 的死亡。
 *
 * - 硬约束 8：**绝不**改动 initiativeCardCount；
 * - 硬约束 10：Imperfect 死亡触发 10 Wounds，且整场只允许一次
 *   （第二只 Imperfect / 重复调用都不会再触发）。
 */
export function applyReflectionDeath(
  runtime: AncestorFirstFormRuntime,
  mech: AncestorFirstFormMechanics,
  encounterId: string,
  reflectionId_: string,
  now: string,
): ReflectionDeathResult {
  const index = runtime.reflections.findIndex((r) => r.id === reflectionId_);
  if (index < 0) {
    return {
      ok: false,
      runtime,
      reaction: null,
      ancestorWounds: 0,
      initiativeCardCount: 4,
      alreadyProcessed: false,
      reason: `未找到 Reflection ${reflectionId_}`,
    };
  }

  const target = runtime.reflections[index];
  if (!target.alive) {
    return {
      ok: true,
      runtime,
      reaction: runtime.imperfectDeathReaction,
      ancestorWounds: 0,
      initiativeCardCount: 4,
      alreadyProcessed: true,
      reason: null,
    };
  }

  const reflections = runtime.reflections.slice();
  reflections[index] = { ...target, alive: false, diedAt: now };

  let reaction = runtime.imperfectDeathReaction;
  let applied = runtime.imperfectDeathReactionApplied;
  let ancestorWounds = 0;

  if (target.kind === 'imperfect' && !applied) {
    const wounds = mech.imperfectDeathWounds;
    if (wounds === null) {
      // 数据缺口：不猜测数值，直接不触发（Data Gate 会在 formal 模式提前拦下）。
      return {
        ok: false,
        runtime: { ...runtime, reflections },
        reaction: null,
        ancestorWounds: 0,
        initiativeCardCount: 4,
        alreadyProcessed: false,
        reason: 'Imperfect Reflection 死亡伤害数值缺失，反应被阻断',
      };
    }
    reaction = {
      transactionId: finalFormTransactionIds.reflectionDeath(encounterId, target.id),
      reflectionId: target.id,
      woundsDealtToAncestor: wounds,
      at: now,
    };
    applied = true;
    ancestorWounds = wounds;
  }

  return {
    ok: true,
    runtime: {
      ...runtime,
      // 硬约束 8：initiativeCardCount 未出现在这里 —— 结构展开保留原值 4。
      reflections,
      imperfectDeathReactionApplied: applied,
      imperfectDeathReaction: reaction,
    },
    reaction: ancestorWounds > 0 ? reaction : null,
    ancestorWounds,
    initiativeCardCount: 4,
    alreadyProcessed: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Ancestor 行动：Time Heals All / Fill Reflection Stances（硬约束 11）
// ---------------------------------------------------------------------------

export interface AncestorStanceResolutionResult {
  ok: boolean;
  runtime: AncestorFirstFormRuntime;
  resolution: AncestorStanceResolution | null;
  /** 本次补位新建的 Reflection（供调用方生成 BattleUnit）。 */
  spawnedReflections: ReflectionActorState[];
  /** 全满分支下应当施放的 Skill ID；被阻断时为 null。 */
  skillIdToCast: string | null;
  alreadyProcessed: boolean;
  reason: string | null;
}

/**
 * Ancestor 行动结算。
 *
 * - 三个 Reflection Stance **全部**有存活 Reflection → Time Heals All；
 * - 任一 Stance 空缺 → 补位（Fill），补位来源必须由 Definition 给出。
 *
 * 两条分支都不内联效果数值：Skill 本体缺失 / 补位来源未知时，
 * 结论仍然写入历史（便于审计），但 `blockedReason` 非空且不产生任何效果。
 */
export function resolveAncestorStance(
  runtime: AncestorFirstFormRuntime,
  mech: AncestorFirstFormMechanics,
  encounterId: string,
  sequence: number,
  now: string,
): AncestorStanceResolutionResult {
  const transactionId = finalFormTransactionIds.stanceResolution(encounterId, sequence);
  const existing = runtime.stanceResolutionHistory.find((r) => r.transactionId === transactionId);
  if (existing) {
    return {
      ok: true,
      runtime,
      resolution: existing,
      spawnedReflections: [],
      skillIdToCast: null,
      alreadyProcessed: true,
      reason: null,
    };
  }

  const vacantStances = getVacantReflectionStances(runtime);
  const allStancesOccupied = vacantStances.length === 0;

  let resolution: AncestorStanceResolution;
  let spawned: ReflectionActorState[] = [];
  let skillIdToCast: string | null = null;
  let reflections = runtime.reflections;

  if (allStancesOccupied) {
    const blocked = mech.fullStanceSkillDefined
      ? null
      : 'Time Heals All 的效果本体缺失（只有 Skill ID），无法执行';
    resolution = {
      transactionId,
      allStancesOccupied: true,
      outcome: 'time-heals-all',
      vacantStances: [],
      filledStances: [],
      blockedReason: blocked,
      at: now,
    };
    skillIdToCast = blocked ? null : mech.fullStanceSkillId;
  } else {
    const fillKind = mech.vacantStanceFillKind;
    if (fillKind === null) {
      resolution = {
        transactionId,
        allStancesOccupied: false,
        outcome: 'fill-reflection-stances',
        vacantStances,
        filledStances: [],
        blockedReason: '补位 Reflection 的来源（Perfect / Imperfect）官方未给出，不作推测',
        at: now,
      };
    } else {
      const nextGeneration =
        runtime.reflections.reduce((max, r) => Math.max(max, r.generation), 0) + 1;
      let seq = runtime.reflections.length;
      spawned = vacantStances.map((stance) => {
        seq += 1;
        return {
          id: reflectionId(fillKind, seq),
          kind: fillKind,
          stance,
          alive: true,
          wounds: 0,
          maxWounds: reflectionCardMaxWounds(mech, fillKind),
          generation: nextGeneration,
          diedAt: null,
        } satisfies ReflectionActorState;
      });
      reflections = [...runtime.reflections, ...spawned];
      resolution = {
        transactionId,
        allStancesOccupied: false,
        outcome: 'fill-reflection-stances',
        vacantStances,
        filledStances: vacantStances,
        blockedReason: null,
        at: now,
      };
    }
  }

  return {
    ok: true,
    runtime: {
      ...runtime,
      // 硬约束 8：补位同样不改 Initiative Card 数。
      reflections,
      lastStanceResolution: resolution,
      stanceResolutionHistory: [...runtime.stanceResolutionHistory, resolution].slice(
        -HISTORY_LIMIT,
      ),
    },
    resolution,
    spawnedReflections: spawned,
    skillIdToCast,
    alreadyProcessed: false,
    reason: resolution.blockedReason,
  };
}

/** Ancestor 1st Form 是否已可被击败（所有 Reflection 已死 → GUARD 解除）。 */
export function isAncestorFirstFormExposed(runtime: AncestorFirstFormRuntime): boolean {
  return canTargetAncestorFirstForm(runtime);
}
