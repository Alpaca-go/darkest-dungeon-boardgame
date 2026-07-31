// Phase 9D §7—§21：Collector / Collected Heroes / Linked Summon Group 类型。
//
// 设计原则（与 Phase 9B / 9C 一致）：
// - Collected 是**真正的 Monster BattleActor**（有 HP / Dodge / Skill / Initiative），
//   不是 Hero 实例（无 XP / Quirk / Disease / Trinket / Death's Door）；
// - Linked Summon Group 原子创建 3 名 Actor + 3 张 Card，任一失败整组回滚；
// - 固定 Stance / Area 来自 Room Definition，不使用 First Empty Stance；
// - 全部数据 dual-mark（`officialDataStatus` + `enabledInOfficialPool`），
//   资料缺失时 official battle 禁用，仅 prototype harness 可用。

import type { MonsterDefinition } from './index';

// ---------------------------------------------------------------------------
// 基础枚举
// ---------------------------------------------------------------------------

/** Collected 角色（固定映射 Stance，§10）。 */
export type CollectedRole = 'man-at-arms' | 'highwayman' | 'vestal';

/** Collected / 队伍标签（§5：collected / collector-retinue Tag）。 */
export type CollectedMonsterTag = 'collected' | 'collector-retinue';

/** 固定部署 Stance（§10 / §14）。 */
export type CollectedStance = 'defensive' | 'ranged' | 'support';

/** Collector 数据可信度（与 Boss / Threat 同构的四态子集）。 */
export type CollectorOfficialDataStatus = 'verified' | 'prototype' | 'unavailable';

/** Loot Chest 固定落位（§18 / §7）。 */
export interface LootChestPlacement {
  slotId: string;
  areaId: string;
}

/** Collector Room 中一个 Collected 的固定落位（§7）。 */
export interface CollectedPlacement {
  role: CollectedRole;
  stance: CollectedStance;
  areaId: string;
}

// ---------------------------------------------------------------------------
// §10 Collected Monster Definition
// ---------------------------------------------------------------------------

/** Collected 是 Monster 的扩展（拥有 BattleActor 能力，但无 Hero 特性）。 */
export interface CollectedMonsterDefinition extends MonsterDefinition {
  collectedRole: CollectedRole;
  /** 必含 `collected` 与 `collector-retinue`，供 Selector 识别（§9）。 */
  collectedTags: CollectedMonsterTag[];
  /** 固定 Stance（Man-at-Arms→Defensive / Highwayman→Ranged / Vestal→Support）。 */
  requiredStance: CollectedStance;
  /** 固定 Area（来自 Room Definition）。 */
  requiredRoomAreaId: string;
  officialDataStatus: CollectorOfficialDataStatus;
  sourceReference?: string;
}

// ---------------------------------------------------------------------------
// §7 Collector Room Definition
// ---------------------------------------------------------------------------

export interface CollectorRoomDefinition {
  id: string;
  bossFamilyId: 'collector';

  collectorPlacement: {
    stance: 'aggressive';
    areaId: string;
  };

  collectedPlacements: CollectedPlacement[];

  /** 恰好三个 Loot Chest 落位（§18）。 */
  lootChestPlacements: [LootChestPlacement, LootChestPlacement, LootChestPlacement];

  heroPlacementRules: { rule: string }[];
  roomEffects: { key: string; type: string }[];

  validAreaIds: string[];

  officialDataStatus: CollectorOfficialDataStatus;
  sourceReference?: string;
}

// ---------------------------------------------------------------------------
// §11 Conditional Boss Action Override
// ---------------------------------------------------------------------------

/** 行动条件（§11）。 */
export interface BossActionCondition {
  type: 'no-alive-actors-with-tag';
  tag: CollectedMonsterTag;
}

export interface ConditionalBossActionOverride {
  id: string;
  priority: number;
  condition: BossActionCondition;
  resolverId: string;
  /** true = 完全替代本次普通 Skill（§11）。 */
  replacesNormalSkill: boolean;
}

/** Override 评估结果（§11 / §19）。 */
export type CollectorActionDecision = 'summon-collected-group' | 'normal-skill-table';

// ---------------------------------------------------------------------------
// §12 Linked Summon Group
// ---------------------------------------------------------------------------

export interface LinkedSummonMemberDefinition {
  role: CollectedRole;
  monsterDefinitionId: string;
  requiredStance: CollectedStance;
  requiredAreaId: string;
}

export interface LinkedSummonGroupDefinition {
  id: string;
  sourceBossFamilyId: 'collector';
  members: [
    LinkedSummonMemberDefinition,
    LinkedSummonMemberDefinition,
    LinkedSummonMemberDefinition
  ];
  requireAllMembers: true;
  atomic: true;
  resummonPolicy: 'when-none-alive-on-source-turn';
}

export type LinkedSummonGroupStatus =
  | 'creating'
  | 'active'
  | 'partially-defeated'
  | 'defeated'
  | 'removed';

export interface LinkedSummonGroupRecord {
  id: string;
  sourceActorId: string;
  sourceActionEventId: string;
  generation: number;

  memberActorIds: [string, string, string];
  initiativeCardIds: [string, string, string];

  status: LinkedSummonGroupStatus;
  transactionId: string;
}

// ---------------------------------------------------------------------------
// §9 Collector Battle Runtime
// ---------------------------------------------------------------------------

export interface CollectorBattleRuntime {
  collectorActorId: string;

  activeCollectedActorIds: string[];
  activeSummonGroupId: string | null;
  summonGeneration: number;

  reserveDefinitions: {
    manAtArmsDefinitionId: string;
    highwaymanDefinitionId: string;
    vestalDefinitionId: string;
  };

  /** 恰好三个 Loot Chest id（§18）。 */
  lootChestIds: [string, string, string];

  lastConditionalOverrideEventId: string | null;
  lastSummonTransactionId: string | null;

  dataStatus: CollectorOfficialDataStatus;
}

// ---------------------------------------------------------------------------
// §18 Loot Chest State
// ---------------------------------------------------------------------------

export interface CollectorLootChestState {
  id: string;
  source: 'collector-room';
  roomId: string;
  placementSlotId: string;
  areaId: string;
  /** 是否已被 Hero 打开领取（刷新不重复领取，§18）。 */
  opened: boolean;
}

// ---------------------------------------------------------------------------
// §20 / §24 Victory / Save
//
// CollectorVictoryResult 与 CollectorSaveSnapshot 的运行时形态定义在
// game-engine/collector/runtime.ts（含迁移函数），此处不再重复声明。
// ---------------------------------------------------------------------------
