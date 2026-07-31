// Phase 8C：Trinket（饰品）类型定义。
//
// 设计要点（开发文档 §3-§7）：
// - Trinket 是「主动来源」：只有玩家在合法 Use Window 主动声明才结算，
//   绝不并入 Quirk / Disease 的被动收集器（核心约束 6）。
// - 每张 Trinket 有 Positive / Negative 两面；装备时从 Positive 起始，
//   使用当前面之后翻到另一面（关键规则 4）。
// - 英雄 Trinket 容量 = 英雄等级（关键规则 1），不存在超容量仓库（核心约束 11）。
// - 官方数据可信度用 officialDataStatus + enabledInOfficialPool 双重标记，
//   未经核实的数值一律不得进入官方池（数据策略）。

import type { ProvisionPool, StatusEffectType } from './index';

// ---------------------------------------------------------------------------
// 基础枚举
// ---------------------------------------------------------------------------

/** Trinket 等级（对应 Nomad Wagon 的 I / II / III 展示位与买卖价）。 */
export type TrinketLevel = 1 | 2 | 3;

/** Trinket 的两个面。 */
export type TrinketSide = 'positive' | 'negative';

/**
 * 官方数据可信度：
 * - verified：数值来自官方规则书 / 用户提供的可信数据，可进入官方池；
 * - partial：部分字段可信（例如只知道名字与等级），不得进入官方池；
 * - prototype：为了跑通引擎自造的原型数据，永远不得进入官方池；
 * - unavailable：占位槽位，尚无任何可信数据。
 */
export type TrinketOfficialDataStatus = 'verified' | 'partial' | 'prototype' | 'unavailable';

/** 数据来源域：官方卡池 vs 原型测试卡池。 */
export type TrinketDataOrigin = 'official' | 'prototype';

/** Trinket 获取来源。 */
export type TrinketSourceKind =
  | 'loot'
  | 'quest-reward'
  | 'nomad-wagon'
  | 'death-transfer'
  | 'debug'
  | 'migration';

/**
 * Trinket 可声明使用的时机窗口。
 * 本轮真正接入运行时的窗口见 game-engine/trinkets/use-trinket.ts 的 WIRED_WINDOWS，
 * 其余窗口先进入数据模型（供后续阶段接线），不会凭空产生开口。
 */
export type TrinketUseWindow =
  | 'before-attack-roll'
  | 'after-attack-roll-before-hit-resolution'
  | 'before-damage-applied'
  | 'after-damage-applied'
  | 'before-healing-applied'
  | 'after-healing-applied'
  | 'before-stress-applied'
  | 'after-stress-applied'
  | 'hero-turn-start'
  | 'hero-turn-end'
  | 'before-dungeon-roll'
  | 'after-dungeon-roll'
  | 'room-entered'
  | 'battle-started'
  | 'battle-ended';

// ---------------------------------------------------------------------------
// 主动修正器 / 主动效果
// ---------------------------------------------------------------------------

/** 主动修正器可影响的数值类别。 */
export type TrinketModifierType =
  | 'accuracy'
  | 'crit'
  | 'damage'
  | 'healing'
  | 'stress'
  | 'stress-recovery'
  | 'dodge'
  | 'condition-duration'
  | 'light'
  | 'dungeon-roll';

/** 主动修正器：只调数值，不派生事件。 */
export interface ActiveModifierDefinition {
  type: TrinketModifierType;
  amount: number;
  /** 默认 add。set 仅用于后续阶段的特殊卡，本轮不产生 set 数据。 */
  operation?: 'add' | 'set';
}

/** 主动效果：一律回落到官方统一管线（伤害/治疗/压力/状态）。 */
export type ActiveEffectDefinition =
  | { type: 'damage-self'; amount: number }
  | { type: 'heal-self'; amount: number }
  | { type: 'stress-self'; amount: number }
  | { type: 'recover-stress-self'; amount: number }
  | { type: 'apply-condition-self'; condition: StatusEffectType; amount: number }
  | { type: 'change-light'; amount: number }
  | { type: 'consume-provision'; provision: keyof ProvisionPool; amount: number }
  | { type: 'log-only'; note: string };

/** 使用前置条件（全部满足才开窗）。 */
export type TrinketUseCondition =
  | { type: 'in-battle' }
  | { type: 'out-of-battle' }
  | { type: 'is-acting-hero' }
  | { type: 'min-light'; value: number }
  | { type: 'max-light'; value: number };

// ---------------------------------------------------------------------------
// 定义
// ---------------------------------------------------------------------------

/** Trinket 单面定义。 */
export interface TrinketSideDefinition {
  side: TrinketSide;
  /** UI 短标签，例如「暴击 +2」。 */
  label: string;
  /** 完整描述。 */
  description: string;
  /** 该面可在哪些窗口声明使用（空数组 = 该面不可主动使用）。 */
  useWindows: TrinketUseWindow[];
  modifiers: ActiveModifierDefinition[];
  effects: ActiveEffectDefinition[];
  canUse?: TrinketUseCondition[];
}

/** Trinket 卡牌定义。 */
export interface TrinketDefinition {
  id: string;
  name: string;
  level: TrinketLevel;
  positiveSide: TrinketSideDefinition;
  negativeSide: TrinketSideDefinition;
  /** 出售价（Nomad Wagon）。 */
  sellPrice: number;
  /** 购买价；官方数据未提供时为 null（禁止臆测，UI 需禁用购买）。 */
  buyPrice: number | null;
  officialDataStatus: TrinketOfficialDataStatus;
  /** 数值出处（规则书页码 / 用户提供说明）。 */
  sourceReference?: string;
  /** 是否可进入官方卡池（仅 verified 数据允许为 true）。 */
  enabledInOfficialPool: boolean;
  dataOrigin: TrinketDataOrigin;
}

// ---------------------------------------------------------------------------
// 运行时状态
// ---------------------------------------------------------------------------

/** 英雄身上的一件 Trinket 实例。 */
export interface HeroTrinketState {
  instanceId: string;
  trinketId: string;
  /** 当前朝上的面（装备时为 positive）。 */
  currentSide: TrinketSide;
  /** 本「回合」是否已使用过：记录使用时的 turnId（未使用为 null）。 */
  usedTurnId: string | null;
  /** 最近一次使用的事件 id（幂等保护）。 */
  lastUsedEventId: string | null;
  acquiredAt: string;
  acquiredQuestId: string | null;
  source: TrinketSourceKind;
  sourceEventId: string;
}

/** 待分配的 Trinket（获取时无法立即确定归属，或来自死亡转移）。 */
export interface PendingTrinketAllocation {
  allocationId: string;
  trinketId: string;
  /** 预生成的实例 id：分配落地时直接复用，保证刷新后不会重复生成。 */
  instanceId: string;
  source: TrinketSourceKind;
  sourceEventId: string;
  questId: string | null;
  createdAt: string;
  /** 死亡转移专用。 */
  fromHeroId?: string;
  fromHeroName?: string;
  /** 可接收的英雄 instanceId（存活且未永久死亡）。 */
  candidateHeroIds: string[];
  status: 'pending' | 'resolved' | 'discarded';
  /** 是否为死亡转移（必须先于 Replacement 结算，核心约束 8）。 */
  isDeathTransfer: boolean;
}

/** 一次开放中的 Trinket 使用机会。 */
export interface TrinketUseOpportunity {
  id: string;
  heroId: string;
  trinketInstanceId: string;
  trinketId: string;
  /** 触发本次开窗的事件 id。 */
  eventId: string;
  /** 根事件 id（同一根事件下的使用共享幂等域）。 */
  rootEventId: string;
  /** 所属回合 id（战斗内为 battleTurnKey，战斗外为派生 turnId）。 */
  turnId: string | null;
  side: TrinketSide;
  useWindow: TrinketUseWindow;
  /** UI 预览文本（由引擎生成，UI 不得自行计算）。 */
  preview: string;
  status: 'open' | 'used' | 'declined' | 'expired';
  createdAt: string;
}

/** 使用事务（跨刷新恢复 + 防止同一次使用重复结算/重复翻面）。 */
export interface PendingTrinketUseTransaction {
  transactionId: string;
  opportunityId: string;
  heroId: string;
  trinketInstanceId: string;
  usedSide: TrinketSide;
  /** eventId + trinketInstanceId + currentSide。 */
  idempotencyKey: string;
  status: 'declared' | 'effects-applied' | 'flipped' | 'completed';
}

// ---------------------------------------------------------------------------
// 记录
// ---------------------------------------------------------------------------

export type TrinketAcquisitionOutcome =
  | 'equipped'
  | 'pending-allocation'
  | 'discarded-unknown-trinket'
  | 'discarded-no-capacity'
  | 'discarded-no-candidate'
  | 'duplicate-event-ignored';

export interface TrinketAcquisitionRecord {
  id: string;
  trinketId: string;
  instanceId: string;
  heroId: string | null;
  heroName: string | null;
  questId: string | null;
  source: TrinketSourceKind;
  sourceEventId: string;
  outcome: TrinketAcquisitionOutcome;
  createdAt: string;
}

export interface TrinketUseRecord {
  id: string;
  heroId: string;
  heroName: string;
  trinketId: string;
  trinketInstanceId: string;
  usedSide: TrinketSide;
  flippedTo: TrinketSide;
  useWindow: TrinketUseWindow;
  turnId: string | null;
  eventId: string;
  idempotencyKey: string;
  createdAt: string;
}

export type TrinketTransferReason =
  | 'manual'
  | 'death-transfer'
  | 'replace'
  | 'discard'
  | 'nomad-wagon-sold'
  | 'hamlet-reset';

export interface TrinketTransferRecord {
  id: string;
  trinketId: string;
  instanceId: string;
  fromHeroId: string | null;
  toHeroId: string | null;
  reason: TrinketTransferReason;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Nomad Wagon
// ---------------------------------------------------------------------------

/** Nomad Wagon 状态（每个 Hamlet 天最多生成一次展示位）。 */
export interface NomadWagonState {
  /** 建筑等级 I/II/III。本阶段禁止升级操作，固定为 1。 */
  buildingLevel: TrinketLevel;
  offerGenerated: boolean;
  offerGenerationDay: number | null;
  offerTransactionId: string | null;
  /** 当天展示的 Trinket 定义 id（按建筑等级组合生成）。 */
  offeredTrinketIds: string[];
  visitHeroId: string | null;
  visitActionId: string | null;
  /** 本次访问卖出的实例 id。 */
  soldInstanceId: string | null;
  /** 本次访问买入的定义 id / 实例 id。 */
  purchasedTrinketId: string | null;
  purchasedInstanceId: string | null;
}

/** Nomad Wagon 单次访问命令（买 / 卖为同一次原子提交）。 */
export interface NomadWagonVisitCommand {
  heroId: string;
  /** 要卖出的自身 Trinket 实例 id。 */
  sellInstanceId?: string;
  /** 要买入的展示位 Trinket 定义 id。 */
  buyTrinketId?: string;
}

// ---------------------------------------------------------------------------
// Registry 校验
// ---------------------------------------------------------------------------

/** Registry 完整性摘要（Debug 面板 / 测试断言用）。 */
export interface TrinketRegistrySummary {
  /** 官方核心卡牌总数（规则书标称）。 */
  expectedCoreCount: number;
  totalDefinitions: number;
  verifiedDefinitions: number;
  partialDefinitions: number;
  prototypeDefinitions: number;
  unavailableSlots: number;
  enabledOfficialDefinitions: number;
  /** 尚缺多少张官方可信卡牌。 */
  missingOfficialCount: number;
  duplicateIds: string[];
  missingRequiredFields: string[];
  /** 违反数据策略的条目（prototype/partial 却标记进入官方池等）。 */
  policyViolations: string[];
}
