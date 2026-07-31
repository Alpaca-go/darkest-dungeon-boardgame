// Phase 9E §7—§25：Fanatic / Pyre / Captive Heroes 类型。
//
// 设计原则（与 Phase 9B / 9C / 9D 一致）：
// - Fanatic 是 Boss BattleActor（boss），Pyre 是独立 Boss-minion BattleActor（ranged），
//   二者都是真正的战斗单位，不复制 Boss 状态机（硬约束 1）；
// - Pyre 不是 Hazard、不进入 Monster Spawn Pool（硬约束 2、3）；
// - Captive Hero 是 Hero BattleActor 被投入 Pyre 后的状态，由 Definition 驱动行为（硬约束 12、13）；
// - 固定 Stance / Area 来自 Room Definition（硬约束 7）；
// - 全部数据 dual-mark（officialDataStatus + enabledInOfficialPool），
//   资料缺失时 official battle 禁用，仅 prototype harness 可用。

import type { MonsterDefinition } from './index';

// ---------------------------------------------------------------------------
// 基础枚举 / 状态
// ---------------------------------------------------------------------------

/** Fanatic / Pyre 数据可信度（文档 §3 四态）。 */
export type FanaticOfficialDataStatus = 'verified' | 'partial' | 'prototype' | 'unavailable';

// ---------------------------------------------------------------------------
// §7 Fanatic Room Definition
// ---------------------------------------------------------------------------

export interface FanaticRoomPlacement {
  stance: 'aggressive';
  areaId: string;
}

export interface PyreRoomPlacement {
  stance: 'ranged';
  areaId: string;
}

export interface FanaticRoomDefinition {
  id: string;
  bossFamilyId: 'fanatic';

  fanaticPlacement: FanaticRoomPlacement;
  pyrePlacement: PyreRoomPlacement;

  heroPlacementRules: { rule: string }[];
  roomEffects: { key: string; type: string }[];

  validAreaIds: string[];
  areaCapacities: Record<string, number>;

  officialDataStatus: FanaticOfficialDataStatus;
  sourceReference?: string;
}

// ---------------------------------------------------------------------------
// §9 / §18 Pyre Monster Definition（独立 BattleActor）
// ---------------------------------------------------------------------------

export interface PyreMonsterDefinition extends MonsterDefinition {
  requiredStance: 'ranged';
  /** 关联的 Captive Effect Definition id（驱动 Captive 行为，不自行规定）。 */
  captiveEffectDefinitionId: string;
  officialDataStatus: FanaticOfficialDataStatus;
  sourceReference?: string;
}

/** Pyre Captive Effect Definition（引擎层只提供可配置字段，行为由 Definition 驱动，§17）。 */
export interface PyreCaptiveEffectDefinition {
  id: string;
  sourceType: 'fanatic-pyre';
  /** Captive Hero 在被投入 Pyre 期间的可配置能力（由正式/原型资料提供）。 */
  canAct: boolean;
  canMove: boolean;
  canUseSkill: boolean;
  canBeTargeted: boolean;
  onContainerTurn: 'none' | 'custom-effect';
  onContainerDestroyed: 'released' | 'removed' | 'custom';
  officialDataStatus: FanaticOfficialDataStatus;
  sourceReference?: string;
}

// ---------------------------------------------------------------------------
// §13 Closest Hero Selection
// ---------------------------------------------------------------------------

export interface ClosestHeroCandidate {
  heroId: string;
  areaId: string;
  /** Hero 在 Room 中的站位序号（1—4），用于确定性 Tie-break。 */
  position: number;
}

export interface ClosestHeroSelectionRecord {
  id: string;
  fanaticActorId: string;
  candidateHeroIds: string[];
  distanceByHeroId: Record<string, number>;
  selectedHeroId: string;
  tieBreakMethod: string;
  transactionId: string;
}

// ---------------------------------------------------------------------------
// §17 Captive State
// ---------------------------------------------------------------------------

export type CaptiveStatus =
  | 'captured'
  | 'inside-container'
  | 'released'
  | 'container-destroyed'
  | 'removed';

export interface CaptiveActorState {
  id: string;
  captiveActorId: string;
  captorActorId: string;
  containerActorId: string;
  sourceType: 'fanatic-pyre';
  originalAreaId: string;
  currentAreaId: string;
  status: CaptiveStatus;
  /** 以下字段均为 Definition 驱动（§17），引擎不自行规定。 */
  canAct: boolean;
  canMove: boolean;
  canUseSkill: boolean;
  canBeTargeted: boolean;
  onContainerTurn: 'none' | 'custom-effect';
  onContainerDestroyed: 'released' | 'removed' | 'custom';
  createdAt: string;
  releasedAt?: string;
  transactionId: string;
}

// ---------------------------------------------------------------------------
// §10 Fanatic Battle Runtime
// ---------------------------------------------------------------------------

export interface FanaticBattleRuntime {
  fanaticActorId: string;
  pyreActorId: string | null;

  activeCaptiveHeroId: string | null;

  fanaticInitiativeCardIds: [string, string, string];
  pyreInitiativeCardId: string | null;

  lastTurnPreludeTransactionId: string | null;
  lastClosestHeroSelectionId: string | null;
  lastThrowIntoPyreTransactionId: string | null;

  pyreRemovedReason: 'destroyed' | 'fanatic-defeated' | 'battle-ended' | null;

  dataStatus: FanaticOfficialDataStatus;
}

// ---------------------------------------------------------------------------
// §13 Room Area Graph（路径距离）
// ---------------------------------------------------------------------------

export interface RoomAreaGraph {
  areas: string[];
  edges: { from: string; to: string; distance: number }[];
}

// ---------------------------------------------------------------------------
// §20 / §24 Victory / Save
//
// FanaticVictoryResult 与 FanaticSaveSnapshot 的运行时形态定义在
// game-engine/fanatic/runtime.ts（含迁移函数），此处不再重复声明。
// ---------------------------------------------------------------------------
