// Phase 9C：Prophet、Wooden Pews 与「延迟区域攻击」类型层。
//
// 设计要点（开发文档 §7—§14）：
// - Wooden Pew 是「延迟区域危害标记」，不是 BattleActor / Monster / 障碍物：
//   无 HP、无 Stance、无 Initiative、不占 Area Capacity、不可 Target（硬约束 2—5）。
// - Prophet 每轮语义固定：ordinal 1 放置 Pews、ordinal 2 普通 Skill、ordinal 3 Rubble of Ruin。
//   该语义由 Initiative Card 上的 actionOrdinal 表达，禁止用 `prophetTurnCount++`（§9）。
// - 所有骰点先保存再播放动画，刷新不重掷（硬约束 7）。
//
// 本文件只声明类型；运行时规则位于 game-engine/prophet 下。

import type { DataCredibility } from './progression';

// ---------------------------------------------------------------------------
// 基础
// ---------------------------------------------------------------------------

/** d10 骰点（1—10）。 */
export type D10Roll = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Boss 每轮第 n 次行动（Prophet 固定 3 次）。 */
export type ActionOrdinal = 1 | 2 | 3;

/** 数据可信度（与 Trinket / Boss / 成长系统共用同一套四态）。 */
export type OfficialDataStatus = DataCredibility;

/**
 * 可注入随机源：返回 [0, 1) 的浮点数。
 * 硬约束：引擎与 UI 一律不得直接调用 `Math.random()`（§11）。
 */
export type RandomSource = () => number;

// ---------------------------------------------------------------------------
// §7 Prophet Room Definition
// ---------------------------------------------------------------------------

/** 英雄入场放置规则（Phase 9C 只做数据登记）。 */
export interface RoomPlacementRule {
  rule: string;
  areaId?: string;
}

/** 房间效果定义（Phase 9C 只做数据登记，效果经既有 Rule Event 引擎执行）。 */
export interface RoomEffectDefinition {
  key: string;
  description: string;
}

/**
 * Prophet 房间定义（§7）。
 * `d10AreaMap` 必须完整覆盖 1—10 且只指向 `validAreaIds` 中的 Area，
 * 否则 official battle 禁用（硬约束 15）。
 */
export interface ProphetRoomDefinition {
  id: string;
  bossFamilyId: 'prophet';

  bossPlacement: {
    stance: 'aggressive';
    tileAreaId: string;
  };

  heroPlacementRules: RoomPlacementRule[];
  roomEffects: RoomEffectDefinition[];

  validAreaIds: string[];

  /** d10 骰点 → Area 映射；只能来自正式 Room Card，UI 排列变化不得影响它。 */
  d10AreaMap: Record<D10Roll, string>;

  officialDataStatus: OfficialDataStatus;
  sourceReference?: string;
}

// ---------------------------------------------------------------------------
// §8 Delayed Area Hazard（Wooden Pew）
// ---------------------------------------------------------------------------

/** Pew 生命周期（§15）。 */
export type DelayedAreaHazardStatus =
  | 'telegraphed'
  | 'resolving'
  | 'resolved'
  | 'removed';

/**
 * 延迟区域危害状态（§8）。
 * 每个 Pew 都是**独立 instance**：同一 Area 可以存在多个，绝不合并（硬约束 8）。
 */
export interface DelayedAreaHazardState {
  id: string;

  sourceActorId: string;
  sourceDefinitionId: string;

  markerType: 'wooden-pew';
  targetAreaId: string;

  createdRound: number;
  createdActionOrdinal: number;
  /** Prophet 的 Pew 固定在 ordinal 3 结算。 */
  resolvesOnActionOrdinal: 3;

  /** 以下四个字面量常驻 false —— 类型层面锁死「不可选中 / 不占位」。 */
  targetable: false;
  occupiesAreaSpace: false;
  occupiesStance: false;
  hasInitiative: false;

  status: DelayedAreaHazardStatus;

  resolvedTransactionId: string | null;
}

// ---------------------------------------------------------------------------
// §10 Action Ordinal
// ---------------------------------------------------------------------------

/**
 * 带 ordinal 的 Boss Initiative 卡（§10）。
 * 三张卡绑定同一 Actor，与 Hero Card 混洗，但 Prophet 自身行动语义必须稳定。
 */
export interface BossInitiativeCard {
  id: string;
  actorId: string;
  roundCreated: number;

  actionOrdinal: ActionOrdinal;

  resolved: boolean;
  resolutionTransactionId: string | null;
}

// ---------------------------------------------------------------------------
// §9 Prophet Battle Runtime
// ---------------------------------------------------------------------------

/** Prophet 战斗运行时（落盘；刷新后据此恢复，不重掷、不重复攻击）。 */
export interface ProphetBattleRuntime {
  prophetActorId: string;
  currentRound: number;

  completedActionCardIdsThisRound: string[];
  completedActionOrdinalsThisRound: ActionOrdinal[];

  activePewIds: string[];

  firstActionTransactionId: string | null;
  secondActionTransactionId: string | null;
  rubbleTransactionId: string | null;

  lastPlacementRecordId: string | null;
}

// ---------------------------------------------------------------------------
// §11 Placement Record
// ---------------------------------------------------------------------------

/** 一次 4d10 放置的完整记录（骰点先保存，刷新不重掷）。 */
export interface ProphetPewPlacementRecord {
  id: string;
  battleId: string;
  round: number;
  initiativeCardId: string;

  /** 正好四个 d10 结果（硬约束 6）。 */
  rolls: [D10Roll, D10Roll, D10Roll, D10Roll];

  placements: {
    pewInstanceId: string;
    roll: D10Roll;
    areaId: string;
  }[];

  transactionId: string;
}

// ---------------------------------------------------------------------------
// §14 Rubble of Ruin
// ---------------------------------------------------------------------------

/**
 * 单个 Pew 的独立攻击记录（§14）。
 * 同 Area 的两个 Pew 会产生**两条**记录，各自独立命中 / 暴击 / 伤害，禁止合并。
 */
export interface RubbleAttackRecord {
  id: string;
  rubbleTransactionId: string;

  pewInstanceId: string;
  areaId: string;

  attackRoll: number;
  hit: boolean;
  critical: boolean;

  targetActorIds: string[];
  /** 由正式伤害 / 压力 / 状态管线返回的事件 id（复用，不另起管线）。 */
  damageEventIds: string[];
  stressEventIds: string[];
  conditionEventIds: string[];

  status: 'pending' | 'resolved';
}

// ---------------------------------------------------------------------------
// §6 Registry 校验
// ---------------------------------------------------------------------------

/** Prophet Registry 校验结果。 */
export interface ProphetValidationResult {
  isComplete: boolean;
  missing: string[];
}
