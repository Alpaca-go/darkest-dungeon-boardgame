// Phase 10E §Gestating Heart 运行时：Sispersion / Wounded Reaction。
//
// 硬约束对照：
// - 15. Sispersion **只能**从 Darkest Dungeon Monster Deck 抽取，
//       牌堆内容缺失时一律拒绝（不得退化成「随便抽一只怪」）；
// - 16. 召唤与 Initiative Card 追加必须**原子**：要么同时写入，要么都不写；
// - 17. Wounded Reaction 只在「实际造成 Wounds」时触发（woundsApplied > 0），
//       Miss / 0 伤 / 纯 Debuff 都不触发；致死伤害是否触发由 Definition 裁决，
//       官方未给出 → 阻断并记录，不猜测。

import type { Stance } from '../../../../types';
import type {
  AncestorRoomAreaDefinition,
  GestatingHeartMechanics,
  GestatingHeartRuntime,
  SispersionSummonRecord,
  WoundedReactionRecord,
} from '../../../../types/final-forms';
import {
  ALL_STANCES,
  getAreaCapacity,
  resolveStanceAreaId,
} from '../../../../data/darkest-dungeon/final-encounter/ancestor-room';
import { pickIndex } from '../rng';
import { finalFormTransactionIds } from './final-form-transactions';

const HISTORY_LIMIT = 20;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupGestatingHeartRuntime(mech: GestatingHeartMechanics): GestatingHeartRuntime {
  return {
    kind: 'gestating-heart',
    baseInitiativeCardCount: 1,
    initiativeCardCount: mech.initiativeCardCount,
    monsterDeckId: mech.monsterDeckId,
    drawnMonsterDefinitionIds: [],
    summonedActorIds: [],
    sispersionHistory: [],
    woundedReactionHistory: [],
  };
}

// ---------------------------------------------------------------------------
// Sispersion（硬约束 15 / 16）
// ---------------------------------------------------------------------------

export interface SispersionInput {
  /** areaId → 已占用格数（Hero / 既有召唤物），由调用方从既有战斗状态给出。 */
  occupancyByArea?: Record<string, number>;
  /** 已被 Heart 本体占用的 Stance（默认 aggressive）。 */
  occupiedStances?: Stance[];
}

export interface SispersionResult {
  ok: boolean;
  runtime: GestatingHeartRuntime;
  record: SispersionSummonRecord | null;
  /** 本次原子写入后应有的 Initiative Card 总数（断言用）。 */
  initiativeCardCount: number;
  alreadyProcessed: boolean;
  reason: string | null;
}

/** `next-available-stance`：按固定顺序找第一个还有空位的 Stance。 */
function resolveNextAvailableStance(
  room: AncestorRoomAreaDefinition,
  input: SispersionInput | undefined,
): { stance: Stance; areaId: string } | null {
  const occupiedStances = new Set(input?.occupiedStances ?? []);
  for (const stance of ALL_STANCES) {
    if (occupiedStances.has(stance)) continue;
    const areaId = resolveStanceAreaId(room, stance);
    if (!areaId) continue;
    const capacity = getAreaCapacity(room, areaId);
    const used = input?.occupancyByArea?.[areaId] ?? 0;
    if (capacity - used > 0) return { stance, areaId };
  }
  return null;
}

/**
 * 执行一次 Sispersion。
 *
 * 原子性（硬约束 16）：`initiativeCardCount` 的自增与 `sispersionHistory` 的追加
 * 在同一个对象字面量里完成 —— 任何前置校验失败都在写入之前 return，
 * 不存在「召唤成功但 Initiative 没加」或反之的中间态。
 */
export function performSispersion(
  runtime: GestatingHeartRuntime,
  mech: GestatingHeartMechanics,
  room: AncestorRoomAreaDefinition,
  encounterId: string,
  sequence: number,
  rng: () => number,
  now: string,
  input?: SispersionInput,
): SispersionResult {
  const transactionId = finalFormTransactionIds.sispersion(encounterId, sequence);
  const existing = runtime.sispersionHistory.find((r) => r.transactionId === transactionId);
  if (existing) {
    return {
      ok: true,
      runtime,
      record: existing,
      initiativeCardCount: runtime.initiativeCardCount,
      alreadyProcessed: true,
      reason: null,
    };
  }

  // 硬约束 15：抽取源必须是 Darkest Dungeon Monster Deck，且牌堆内容齐备。
  if (runtime.monsterDeckId !== mech.monsterDeckId) {
    return {
      ok: false,
      runtime,
      record: null,
      initiativeCardCount: runtime.initiativeCardCount,
      alreadyProcessed: false,
      reason: 'Sispersion 的抽取源与 Definition 不一致',
    };
  }
  if (mech.monsterDefinitionIds.length === 0) {
    return {
      ok: false,
      runtime,
      record: null,
      initiativeCardCount: runtime.initiativeCardCount,
      alreadyProcessed: false,
      reason: 'Darkest Dungeon Monster Deck 内容缺失，Sispersion 被 Data Gate 拒绝',
    };
  }

  const remaining = mech.monsterDefinitionIds.filter(
    (id) => !runtime.drawnMonsterDefinitionIds.includes(id),
  );
  if (remaining.length === 0) {
    return {
      ok: false,
      runtime,
      record: null,
      initiativeCardCount: runtime.initiativeCardCount,
      alreadyProcessed: false,
      reason: 'Darkest Dungeon Monster Deck 已抽空（官方未给出重洗规则，不作推测）',
    };
  }

  const placement = resolveNextAvailableStance(room, input);
  if (!placement) {
    return {
      ok: false,
      runtime,
      record: null,
      initiativeCardCount: runtime.initiativeCardCount,
      alreadyProcessed: false,
      reason: 'Ancestor Room 无可用 Stance 空位，Sispersion 无法召唤',
    };
  }

  const index = pickIndex(rng, remaining.length);
  const monsterDefinitionId = remaining[index];
  const actorId = `sispersion-${sequence}-${monsterDefinitionId}`;

  const record: SispersionSummonRecord = {
    transactionId,
    monsterDefinitionId,
    actorId,
    stance: placement.stance,
    areaId: placement.areaId,
    // 硬约束 16：本字段与下面的 initiativeCardCount 自增是同一次写入。
    initiativeCardsAdded: mech.sispersion.initiativeCardsToAdd,
    at: now,
  };

  const nextInitiative = runtime.initiativeCardCount + mech.sispersion.initiativeCardsToAdd;

  return {
    ok: true,
    runtime: {
      ...runtime,
      initiativeCardCount: nextInitiative,
      drawnMonsterDefinitionIds: [...runtime.drawnMonsterDefinitionIds, monsterDefinitionId],
      summonedActorIds: [...runtime.summonedActorIds, actorId],
      sispersionHistory: [...runtime.sispersionHistory, record].slice(-HISTORY_LIMIT),
    },
    record,
    initiativeCardCount: nextInitiative,
    alreadyProcessed: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Wounded Reaction（硬约束 17）
// ---------------------------------------------------------------------------

export interface WoundedReactionInput {
  sourceHeroId: string;
  /** 本次攻击**实际**造成的 Wounds（Miss / 0 伤必须传 0）。 */
  woundsApplied: number;
  /** 本次伤害是否致死。 */
  lethal: boolean;
}

export interface WoundedReactionResult {
  ok: boolean;
  triggered: boolean;
  runtime: GestatingHeartRuntime;
  record: WoundedReactionRecord | null;
  /** 需由既有 Status / Heal 引擎施加的效果（未触发时为 null）。 */
  effect: {
    targetHeroId: string;
    blightPotency: number;
    blightDurationTurns: number;
    heartHeal: number;
  } | null;
  alreadyProcessed: boolean;
  reason: string | null;
}

/**
 * Gestating Heart 受创反应。
 *
 * 触发条件严格为「实际造成 Wounds」（硬约束 17）：
 * - woundsApplied <= 0 → 不触发、不写历史；
 * - 致死伤害 → 由 `triggersAfterLethalWound` 裁决；官方为 null（未给出）时，
 *   写入一条 blockedReason 记录但不产生效果，绝不按电子游戏惯例自行决定。
 */
export function applyGestatingHeartWoundedReaction(
  runtime: GestatingHeartRuntime,
  mech: GestatingHeartMechanics,
  encounterId: string,
  sequence: number,
  input: WoundedReactionInput,
  now: string,
): WoundedReactionResult {
  const transactionId = finalFormTransactionIds.woundedReaction(encounterId, sequence);
  const existing = runtime.woundedReactionHistory.find((r) => r.transactionId === transactionId);
  if (existing) {
    return {
      ok: true,
      triggered: existing.blockedReason === null,
      runtime,
      record: existing,
      effect: null,
      alreadyProcessed: true,
      reason: null,
    };
  }

  if (input.woundsApplied <= 0) {
    return {
      ok: true,
      triggered: false,
      runtime,
      record: null,
      effect: null,
      alreadyProcessed: false,
      reason: '本次攻击未造成 Wounds，Gestating Reaction 不触发',
    };
  }

  const wr = mech.woundedReaction;
  if (wr.blightPotency === null || wr.blightDurationTurns === null || wr.heal === null) {
    return {
      ok: false,
      triggered: false,
      runtime,
      record: null,
      effect: null,
      alreadyProcessed: false,
      reason: 'Gestating Reaction 的 Blight / Heal 数值缺失，反应被 Data Gate 阻断',
    };
  }

  let blockedReason: string | null = null;
  if (input.lethal) {
    if (wr.triggersAfterLethalWound === null) {
      blockedReason = '致死伤害是否仍触发 Gestating Reaction，官方未给出裁决';
    } else if (wr.triggersAfterLethalWound === false) {
      blockedReason = 'Definition 裁定：致死伤害不再触发 Gestating Reaction';
    }
  }

  const record: WoundedReactionRecord = {
    transactionId,
    sourceHeroId: input.sourceHeroId,
    woundsApplied: input.woundsApplied,
    blightPotency: blockedReason ? 0 : wr.blightPotency,
    blightDurationTurns: blockedReason ? 0 : wr.blightDurationTurns,
    healed: blockedReason ? 0 : wr.heal,
    lethal: input.lethal,
    blockedReason,
    at: now,
  };

  return {
    ok: true,
    triggered: blockedReason === null,
    runtime: {
      ...runtime,
      woundedReactionHistory: [...runtime.woundedReactionHistory, record].slice(-HISTORY_LIMIT),
    },
    record,
    effect: blockedReason
      ? null
      : {
          targetHeroId: input.sourceHeroId,
          blightPotency: wr.blightPotency,
          blightDurationTurns: wr.blightDurationTurns,
          heartHeal: wr.heal,
        },
    alreadyProcessed: false,
    reason: blockedReason,
  };
}
