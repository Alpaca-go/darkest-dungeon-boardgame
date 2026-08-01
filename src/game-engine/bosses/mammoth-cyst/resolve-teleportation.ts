// Phase 10C §17 / §18 / §19 / §20 / §21：White Cell Stalk Teleportation 结算。
//
// 规则书 verified（§2.6）：
//   「White Cell Stalk 的 Teleportation 效果：掷 1d10，把 Hero 放到骰点对应的 Room Area」。
//
// 硬约束对照：
// - 硬约束 13 / §17：Teleportation **只能**由正式 Skill Selection 触发 ——
//   本模块要求传入的 Skill `triggersTeleportation === true`，否则拒绝；
//   绝不在回合开始 / 房间进入 / 任何 Hook 里自动传送；
// - 硬约束 14 / §19：d10 结果**先落盘**（TeleportationRecord + 幂等键）后展示，刷新不重掷；
// - 硬约束 15 / §19：目标 Area **只**查 Room Definition 的 teleportationD10Map ——
//   不按 Area 数量平均分配、不用数组下标、不做任何归一化；
// - 硬约束 16 / §20：Hero 移动 + Entry Effect 是**原子**的 —— 中途失败整体回滚到原 Area；
// - 硬约束 17 / §20：目标 Area 满时按 **Definition** 处理 —— Room Card 未规定 → 拒绝并给出原因，
//   **绝不**重掷、绝不改放相邻 Area；
// - §21：Entry Effect 复用 Phase 10B 的正式 Room Hazard 管线
//   （resolveDamage / applyStress / Death's Door / Deathblow / Resolve / Heart Attack），
//   同一 Entry Event 只执行一次。

import type { CampaignState } from '../../../types';
import type {
  RoomHazardEvent,
  SpikedPitDefinition,
  SpikedPitRuntime,
} from '../../../types/room-hazards';
import type {
  D10Roll,
  MammothCystEncounterState,
  MammothCystSkillDefinition,
  TeleportationRecord,
} from '../../../types/mammoth-cyst';
import { resolveRoomHazardTrigger } from '../../room-hazards';
import { pushLog } from '../../log';
import { createId, nowIso } from '../../random';
import { rollD10 } from '../../campaign/act-four/rng';
import {
  getMammothCystAreaOccupancy,
  hasProcessedMammothCystTransaction,
  mammothCystTransactionIds,
  withProcessedMammothCystTransaction,
} from './mammoth-cyst-runtime';

// ---------------------------------------------------------------------------
// §19 d10 → Area 映射（只查 Room Definition）
// ---------------------------------------------------------------------------

export interface TeleportationTargetResolution {
  ok: boolean;
  areaId: string | null;
  reason: string | null;
}

/**
 * 由 d10 骰点解析目标 Area。
 *
 * 硬约束 15：**唯一**数据源是 Room Definition 的 teleportationD10Map。
 * 映射缺项 / 空串 → 直接失败（official 早已被 Data Gate 禁用）。
 */
export function resolveTeleportationTargetArea(
  state: MammothCystEncounterState,
  roll: D10Roll,
): TeleportationTargetResolution {
  const room = state.snapshot.room;
  const mapped = room.teleportationD10Map[roll];
  if (!mapped) {
    return {
      ok: false,
      areaId: null,
      reason: `Room Card 未录入骰点 ${roll} 对应的 Area（teleportationD10Map 缺项），拒绝传送`,
    };
  }
  if (!room.validAreaIds.includes(mapped)) {
    return {
      ok: false,
      areaId: null,
      reason: `骰点 ${roll} 映射到的 Area ${mapped} 不在 validAreaIds 内`,
    };
  }
  return { ok: true, areaId: mapped, reason: null };
}

// ---------------------------------------------------------------------------
// §20 Capacity 判定（Definition 驱动，不重掷）
// ---------------------------------------------------------------------------

export interface TeleportationCapacityCheck {
  allowed: boolean;
  capacity: number | null;
  occupancy: number;
  reason: string | null;
}

/**
 * 判定目标 Area 是否容得下被传送的 Hero。
 *
 * 硬约束 17：Room Card 未录入容量 / 已满且无溢出规则 → 拒绝本次传送，
 * **不重掷、不换 Area、不强行塞入**。
 */
export function checkTeleportationCapacity(
  state: MammothCystEncounterState,
  areaId: string,
  movingHeroId: string,
): TeleportationCapacityCheck {
  const capacity = state.snapshot.room.areaCapacities[areaId];
  const occupancy = getMammothCystAreaOccupancy(state, areaId, movingHeroId).length;

  if (typeof capacity !== 'number') {
    return {
      allowed: false,
      capacity: null,
      occupancy,
      reason: `Room Card 未录入 Area ${areaId} 的容量，拒绝传送（不猜容量、不重掷）`,
    };
  }
  if (occupancy >= capacity) {
    return {
      allowed: false,
      capacity,
      occupancy,
      reason: `Area ${areaId} 已满（${occupancy}/${capacity}），Room Definition 未规定溢出处理，本次传送不执行（不重掷、不换 Area）`,
    };
  }
  return { allowed: true, capacity, occupancy, reason: null };
}

// ---------------------------------------------------------------------------
// §21 Entry Effect 适配（复用正式 Room Hazard 管线）
// ---------------------------------------------------------------------------

/**
 * 把 Room Card 的 Area Entry Effects 适配成 Hazard Definition。
 *
 * 只是**形状适配**，不新增效果语义：targetable / hasHp / hasInitiative 恒 false，
 * exitRuleDefinitionId 恒 undefined（Mammoth Cyst Room 无「离开规则」资料）。
 */
export function buildAreaEntryHazardDefinition(
  state: MammothCystEncounterState,
  areaId: string,
): SpikedPitDefinition | null {
  const effects = state.snapshot.room.roomEntryEffects[areaId];
  if (!effects || effects.length === 0) return null;
  return {
    id: `mcarea-${areaId}`,
    areaId,
    targetable: false,
    hasHp: false,
    hasInitiative: false,
    capacityPolicy: 'normal-area-capacity',
    entryEffects: effects,
    endTurnEffects: [],
    conditionTriggeredEffects: [],
    exitRuleDefinitionId: undefined,
    officialDataStatus: effects[0].officialDataStatus,
  };
}

// ---------------------------------------------------------------------------
// §17 / §18 Teleportation 主流程
// ---------------------------------------------------------------------------

export interface ResolveTeleportationOptions {
  /** 施放者（White Cell Stalk）Actor id。 */
  sourceActorId: string;
  /** 被传送的 Hero instanceId。 */
  targetHeroId: string;
  /** 触发本次效果的 Skill（必须 triggersTeleportation === true，硬约束 13）。 */
  skill: MammothCystSkillDefinition;
  /** Skill 事件 id（通常为 Initiative Card id）。 */
  sourceSkillEventId: string;
  /**
   * 效果事件 id（幂等键的一部分）。
   * `single-roll-for-all-targets` 时多个目标共用同一个 effect event → 共享同一骰点。
   */
  sourceEffectEventId: string;
  rng: () => number;
  now?: string;
}

export interface ResolveTeleportationResult {
  ok: boolean;
  campaign: CampaignState;
  state: MammothCystEncounterState | null;
  record: TeleportationRecord | null;
  hazardEvents: RoomHazardEvent[];
  alreadyResolved: boolean;
  /** true = 中途失败并已整体回滚（Hero 仍在原 Area）。 */
  rolledBack: boolean;
  reason: string | null;
}

/**
 * 结算一次 Teleportation（§17—§21）。
 *
 * 顺序（原子；任一步失败 → 返回**调用前**的 campaign / state）：
 *   1. 校验 Skill 确实触发 Teleportation（硬约束 13）；
 *   2. 幂等：同一 effect event 只结算一次；
 *      `single-roll-for-all-targets` 时复用**已保存的骰点**（不重掷，硬约束 14）；
 *   3. 掷 1d10 → **立即落盘**为 pending Record；
 *   4. 查 Room Definition 的 d10 → Area 映射（硬约束 15）；
 *   5. Capacity 判定（硬约束 17）；
 *   6. 移动 Hero（heroPlacements 原子更新）；
 *   7. 目标 Area 的 Entry Effect 走**正式管线**（§21），同一 Entry Event 只执行一次；
 *   8. Record 置为 effects-resolved。
 *
 * 幂等键：`white-cell-stalk-teleportation:{battleId}:{sourceEffectEventId}`；
 * 多目标时调用方需为每个 Hero 传入不同的 `sourceEffectEventId`
 * （`single-roll-for-all-targets` 由 `sharedRoll` 复用骰点实现）。
 */
export function resolveWhiteCellStalkTeleportation(
  campaign: CampaignState,
  options: ResolveTeleportationOptions,
): ResolveTeleportationResult {
  const actFour = campaign.actFourState;
  const state = actFour.mammothCystEncounterState;
  if (!state) return teleportFail(campaign, null, 'Mammoth Cyst Encounter 尚未 Setup');

  // ---- 步骤 1：硬约束 13 —— 只有正式 Skill 能触发 ----
  if (!options.skill.triggersTeleportation) {
    return teleportFail(
      campaign,
      state,
      `Skill ${options.skill.id} 未标记 triggersTeleportation，拒绝传送（禁止 Hook / 回合开始等旁路触发）`,
    );
  }
  if (options.skill.requiresHit === null) {
    return teleportFail(
      campaign,
      state,
      `Skill ${options.skill.id} 的命中判定未核对（requiresHit=null），拒绝结算`,
    );
  }
  if (options.skill.rollPolicy === 'definition-driven') {
    return teleportFail(
      campaign,
      state,
      `Skill ${options.skill.id} 的掷骰策略未核对（rollPolicy=definition-driven），拒绝结算`,
    );
  }

  const transactionId = mammothCystTransactionIds.teleportation(
    state.battleId,
    options.sourceEffectEventId,
  );
  const existing = state.teleportationHistory.find((r) => r.transactionId === transactionId);
  if (existing && hasProcessedMammothCystTransaction(state, transactionId)) {
    return {
      ok: true,
      campaign,
      state,
      record: existing,
      hazardEvents: [],
      alreadyResolved: true,
      rolledBack: false,
      reason: null,
    };
  }

  const hero = campaign.heroes.find((h) => h.instanceId === options.targetHeroId);
  if (!hero) return teleportFail(campaign, state, `找不到 Hero ${options.targetHeroId}`);
  if (hero.dead) return teleportFail(campaign, state, `${hero.name} 已阵亡，不再被传送`);

  const placement = state.heroPlacements.find((p) => p.heroId === options.targetHeroId);
  if (!placement) {
    return teleportFail(campaign, state, `Hero ${options.targetHeroId} 未登记 Room Area 占位`);
  }

  const now = options.now ?? nowIso();

  // ---- 步骤 2 / 3：掷骰（single-roll-for-all-targets 复用同一 skill event 的既有骰点）----
  const sharedRoll =
    options.skill.rollPolicy === 'single-roll-for-all-targets'
      ? state.teleportationHistory.find(
          (r) =>
            r.sourceSkillEventId === options.sourceSkillEventId &&
            r.status !== 'rolled-back',
        )?.roll ?? null
      : null;
  const roll = (sharedRoll ?? rollD10(options.rng)) as D10Roll;

  const pending: TeleportationRecord = {
    id: createId('mctp'),
    battleId: state.battleId,
    sourceActorId: options.sourceActorId,
    targetHeroId: options.targetHeroId,
    sourceSkillEventId: options.sourceSkillEventId,
    sourceEffectEventId: options.sourceEffectEventId,
    roll,
    originalAreaId: placement.areaId,
    targetAreaId: '',
    movementEventId: '',
    entryEffectEventIds: [],
    transactionId,
    status: 'pending',
  };

  // 硬约束 14：骰点先落盘（即便后续因 Capacity 失败而回滚移动，骰点仍以 rolled-back 记录留痕，
  // 不给「刷新重掷」留任何缝隙）。
  const stateWithRoll: MammothCystEncounterState = {
    ...state,
    teleportationHistory: [...state.teleportationHistory, pending].slice(-200),
  };

  // ---- 步骤 4：d10 → Area（只查 Room Definition）----
  const target = resolveTeleportationTargetArea(stateWithRoll, roll);
  if (!target.ok || !target.areaId) {
    return rollback(campaign, stateWithRoll, pending, target.reason ?? '目标 Area 解析失败', now);
  }

  // ---- 步骤 5：Capacity（Definition 驱动，不重掷）----
  const capacity = checkTeleportationCapacity(stateWithRoll, target.areaId, options.targetHeroId);
  if (!capacity.allowed) {
    return rollback(campaign, stateWithRoll, pending, capacity.reason ?? 'Area 容量不足', now);
  }

  // ---- 步骤 6：原子移动 ----
  const movementEventId = `${transactionId}:move`;
  const moved: TeleportationRecord = {
    ...pending,
    targetAreaId: target.areaId,
    movementEventId,
    status: 'moved',
  };
  let working: MammothCystEncounterState = {
    ...stateWithRoll,
    heroPlacements: stateWithRoll.heroPlacements.map((p) =>
      p.heroId === options.targetHeroId ? { ...p, areaId: target.areaId! } : p,
    ),
    teleportationHistory: stateWithRoll.teleportationHistory.map((r) =>
      r.id === pending.id ? moved : r,
    ),
  };

  let workingCampaign: CampaignState = {
    ...campaign,
    actFourState: { ...actFour, mammothCystEncounterState: working },
    updatedAt: now,
  };
  workingCampaign = pushLog(
    workingCampaign,
    `White Cell Stalk 掷出 ${roll}：${hero.name} 被传送至 ${target.areaId}（原 ${placement.areaId}）。`,
    'warning',
  );

  // ---- 步骤 7：Entry Effect（复用正式管线，§21）----
  const hazardDef = buildAreaEntryHazardDefinition(working, target.areaId);
  const hazardEvents: RoomHazardEvent[] = [];
  const entryEffectEventIds: string[] = [];

  if (hazardDef) {
    const runtimeIndex = working.areaEntryRuntime.findIndex((rt) => rt.areaId === target.areaId);
    const runtime: SpikedPitRuntime =
      runtimeIndex >= 0
        ? working.areaEntryRuntime[runtimeIndex]
        : {
            id: `mcarea-${target.areaId}`,
            pitDefinitionId: hazardDef.id,
            areaId: target.areaId,
            occupantActorIds: [],
            resolvedTriggerKeys: [],
            dataStatus: hazardDef.officialDataStatus,
          };

    const entryTransactionId = mammothCystTransactionIds.areaEntryEffect(
      transactionId,
      target.areaId,
      'on-normal-entry',
    );
    const out = resolveRoomHazardTrigger({
      campaign: workingCampaign,
      pit: hazardDef,
      runtime,
      trigger: 'on-normal-entry',
      actorId: options.targetHeroId,
      sourceEventId: movementEventId,
      transactionId: entryTransactionId,
      battleId: working.battleId,
      now,
    });

    if (!out.ok) {
      // 硬约束 16：Entry Effect 结算失败 → 整体回滚到原 Area。
      return rollback(
        campaign,
        stateWithRoll,
        pending,
        out.reason ?? 'Entry Effect 结算失败，传送已回滚',
        now,
      );
    }

    workingCampaign = out.campaign;
    const nextRuntimes =
      runtimeIndex >= 0
        ? working.areaEntryRuntime.map((rt, i) => (i === runtimeIndex ? out.runtime : rt))
        : [...working.areaEntryRuntime, out.runtime];

    if (out.event) {
      hazardEvents.push(out.event);
      entryEffectEventIds.push(out.event.id);
    }
    working = {
      ...working,
      areaEntryRuntime: nextRuntimes,
      roomHazardEventHistory: out.event
        ? [...working.roomHazardEventHistory, out.event].slice(-200)
        : working.roomHazardEventHistory,
    };
  }

  // ---- 步骤 8：收口 ----
  const finalRecord: TeleportationRecord = {
    ...moved,
    entryEffectEventIds,
    status: 'effects-resolved',
  };
  let finalState: MammothCystEncounterState = {
    ...working,
    teleportationHistory: working.teleportationHistory.map((r) =>
      r.id === pending.id ? finalRecord : r,
    ),
    mammothCystBattleRuntime: {
      ...working.mammothCystBattleRuntime,
      lastTeleportationTransactionId: transactionId,
    },
  };
  finalState = withProcessedMammothCystTransaction(finalState, transactionId);

  const finalCampaign: CampaignState = {
    ...workingCampaign,
    actFourState: {
      ...workingCampaign.actFourState,
      mammothCystEncounterState: finalState,
    },
    updatedAt: now,
  };

  return {
    ok: true,
    campaign: finalCampaign,
    state: finalState,
    record: finalRecord,
    hazardEvents,
    alreadyResolved: false,
    rolledBack: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------

/**
 * 回滚：Hero 仍在原 Area，Record 置为 rolled-back 并保留骰点（防止刷新重掷）。
 * 幂等键**也会写入** —— 否则同一 effect event 可被反复重试直到骰出一个「顺手」的结果。
 */
function rollback(
  campaign: CampaignState,
  stateWithRoll: MammothCystEncounterState,
  pending: TeleportationRecord,
  reason: string,
  now: string,
): ResolveTeleportationResult {
  const rolledBackRecord: TeleportationRecord = { ...pending, status: 'rolled-back' };
  let nextState: MammothCystEncounterState = {
    ...stateWithRoll,
    teleportationHistory: stateWithRoll.teleportationHistory.map((r) =>
      r.id === pending.id ? rolledBackRecord : r,
    ),
  };
  nextState = withProcessedMammothCystTransaction(nextState, pending.transactionId);

  let next: CampaignState = {
    ...campaign,
    actFourState: { ...campaign.actFourState, mammothCystEncounterState: nextState },
    updatedAt: now,
  };
  next = pushLog(next, `Teleportation 未执行（骰点 ${pending.roll}）：${reason}`, 'warning');

  return {
    ok: false,
    campaign: next,
    state: nextState,
    record: rolledBackRecord,
    hazardEvents: [],
    alreadyResolved: false,
    rolledBack: true,
    reason,
  };
}

function teleportFail(
  campaign: CampaignState,
  state: MammothCystEncounterState | null,
  reason: string,
): ResolveTeleportationResult {
  return {
    ok: false,
    campaign,
    state,
    record: null,
    hazardEvents: [],
    alreadyResolved: false,
    rolledBack: false,
    reason,
  };
}
