// Phase 10B §9 / §18 / §19：Room Hazard（Spiked Pit）通用类型契约。
//
// 硬约束对照：
// - §9：Spiked Pit **不是 BattleActor** —— 不进 Initiative、无 HP、不可 Target、不产生 Loot；
//   它是 Room 的子区域 / Hazard，效果由 Room Definition 驱动，
//   绝不在 Body Slam Skill 里硬编码 Pit 伤害；
// - §18：所有 Pit 效果必须复用正式管线（Wounds → Death's Door / Deathblow → Stress →
//   Resolve / Heart Attack → Conditions → Rule Event），不得直接改 HP / Stress；
// - §19：Hero 位于 Pit 中的进出行为只能来自 Room Card 资料 —— 资料缺失时
//   不自创「花 1 Action 爬出」，由 RoomAreaMovementPolicy 的 'definition-driven' 表达未知。

import type { DataCredibility } from './progression';

/** Room Hazard 数据可信度（与项目统一四态一致）。 */
export type RoomHazardDataStatus = DataCredibility;

// ---------------------------------------------------------------------------
// §18 触发器
// ---------------------------------------------------------------------------

/**
 * Room Hazard 触发时机。
 * Pit Toss 至少触发 `on-forced-entry`（规则书：目标 Hero「suffer the effect
 * referred to on the Room Card」，因此不能只移动不结算效果）。
 */
export type RoomHazardTrigger =
  | 'on-forced-entry'
  | 'on-normal-entry'
  | 'on-end-turn'
  | 'on-start-turn'
  | 'on-condition'
  | 'on-exit';

/**
 * Hazard 效果定义（数据登记层）。
 * 引擎只按 `kind` 分派到既有管线，不在此处内联任何数值语义。
 */
export interface RoomHazardEffectDefinition {
  /** 效果 id（正式资料缺失时必须使用 prototype- 前缀）。 */
  id: string;
  /** 分派到的正式管线。 */
  kind: 'damage' | 'stress' | 'condition' | 'custom';
  /** damage / stress 的数值；condition / custom 忽略。 */
  amount?: number;
  /** condition / custom 的目标定义 id。 */
  effectDefinitionId?: string;
  description: string;
  officialDataStatus: RoomHazardDataStatus;
  sourceReference?: string;
}

// ---------------------------------------------------------------------------
// §9 Spiked Pit Definition
// ---------------------------------------------------------------------------

/** Pit 容量策略（§17：正式资料未说明 Pit 满时如何处理 → definition-driven）。 */
export type PitCapacityPolicy = 'normal-area-capacity' | 'forced-placement-definition';

export interface SpikedPitDefinition {
  id: string;
  areaId: string;

  /** 以下三项恒为 false（字面量锁死）：Pit 不是战斗单位。 */
  targetable: false;
  hasHp: false;
  hasInitiative: false;

  capacityPolicy: PitCapacityPolicy;

  entryEffects: RoomHazardEffectDefinition[];
  endTurnEffects: RoomHazardEffectDefinition[];
  conditionTriggeredEffects: RoomHazardEffectDefinition[];

  /**
   * Hero 离开 Pit 的规则定义 id。
   * **正式资料缺失时必须为 undefined** —— 引擎据此禁用 official battle，
   * 绝不自创 Pit Escape（§3 / §19）。
   */
  exitRuleDefinitionId?: string;

  officialDataStatus: RoomHazardDataStatus;
  sourceReference?: string;
}

// ---------------------------------------------------------------------------
// §19 Area Movement Policy
// ---------------------------------------------------------------------------

export interface RoomAreaMovementPolicy {
  canEnterNormally: boolean | 'definition-driven';
  canExitNormally: boolean | 'definition-driven';
  exitActionCost?: number;
  forcedExitAllowed: boolean | 'definition-driven';
}

// ---------------------------------------------------------------------------
// Runtime / Event
// ---------------------------------------------------------------------------

/** Pit 的战斗内运行时（占据者由此追踪；不进 BattleState.units）。 */
export interface SpikedPitRuntime {
  id: string;
  pitDefinitionId: string;
  areaId: string;
  /** 当前位于该 Pit 的 Actor id（Hero 或 Monster 均可能）。 */
  occupantActorIds: string[];
  /** 已结算过的 (actorId, trigger) 键，防重复触发。 */
  resolvedTriggerKeys: string[];
  dataStatus: RoomHazardDataStatus;
}

/** Hazard 结算事件（写入历史，供存档恢复与 UI 展示）。 */
export interface RoomHazardEvent {
  id: string;
  hazardId: string;
  trigger: RoomHazardTrigger;
  actorId: string;
  sourceEventId: string;
  /** 实际派发到正式管线的效果 id 列表。 */
  appliedEffectIds: string[];
  damageDealt: number;
  stressDealt: number;
  /** 本次结算是否导致英雄进入 Death's Door。 */
  enteredDeathsDoor: boolean;
  /** 本次结算是否导致英雄永久死亡。 */
  heroDied: boolean;
  transactionId: string;
  createdAt: string;
}

/** 区域图（复用 Phase 9E 的形状，供 Templars Room 使用）。 */
export interface RoomAreaGraph {
  areas: string[];
  edges: { from: string; to: string; distance: number }[];
}
