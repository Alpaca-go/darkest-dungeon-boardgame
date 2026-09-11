// Phase 10C §6 / §7 / §8 / §10—§26：Mammoth Cyst / White Cell Stalk / Teleportation 类型契约。
//
// 硬约束对照：
// - §0 / 硬约束 1：**不创建第二套 Battle / Initiative / Summon 状态机** ——
//   本模块复用既有 BattleState（monsters 中放 Cyst 独立单位 + 动态召唤的 Stalk）与既有伤害 / 压力管线；
//   Cyst 2 张 + Stalk 2 张的 Actor-specific Initiative 以「Mammoth Cyst 域卡组」形式建模
//   （与 Phase 9E Fanatic 的 3+1、Phase 10B Templars 的 2+2 同构）；
// - 硬约束 2 / §10：White Cell Stalk 是**独立 BattleActor**（boss-minion），绝不进入普通 Monster Deck；
// - 硬约束 3 / §9：初始只在 Reserve，不创建 Stalk Actor；
// - 硬约束 4 / §12：只有 aliveStalkCount === 0 时召唤；
// - 硬约束 5 / §12：召唤**完全替代**本次普通 Skill；
// - 硬约束 6 / §22：Stalk 死亡不立即重召唤；
// - 硬约束 8 / §12：maxAlive = 1；
// - 硬约束 9 / §13：Spawn Stance / Area 由 Definition 驱动；
// - 硬约束 13 / §17：Teleportation 只由正式 Skill 触发；
// - 硬约束 14 / §19：d10 先保存，映射只来自 Room Definition；
// - 硬约束 15 / §19：不按 Area 数量平均映射；
// - 硬约束 16 / §20：Hero 传送原子且可回滚；
// - 硬约束 17 / §20：Area 满按 Definition 处理，不重掷、不换 Area；
// - 硬约束 20 / §3：Missing Skill / Spawn / Map / Capacity / Victory 时 official 禁用；
// - 硬约束 21 / §3：Prototype 使用 prototype- 前缀 ID；
// - 硬约束 22 / §3：不使用电子游戏数据；
// - 硬约束 23 / §5：不提前实现 Shuffling Horror。

import type { DataCredibility } from './progression';
import type {
  RoomAreaGraph,
  RoomHazardEffectDefinition,
  RoomHazardEvent,
  SpikedPitRuntime,
} from './room-hazards';

export type MammothCystDataStatus = DataCredibility;

/** d10 骰点（1—10）。 */
export type D10Roll = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Monster Stance（用于 Room Spawn Policy 的 specifiedStance 与 Actor 当前 Stance）。
 * Cyst 恒 Aggressive；Stalk 由 Definition 决定（通常为第一空 Stance）。
 */
export type MonsterStance = 'aggressive' | 'ranged' | 'defensive' | 'support';

// ---------------------------------------------------------------------------
// §6 / §10 Mammoth Cyst / White Cell Stalk Actor Definition
// ---------------------------------------------------------------------------

/** 战斗数值（正式卡面缺失时整体为 null → 驱动 Data Gate）。 */
export interface MammothCystActorStats {
  maxHp: number;
  dodge: number;
  speed: number;
  resistances: Record<string, number>;
  immunities: string[];
  size: number;
}

/** Mammoth Cyst 普通 Skill（d10 Skill Table 的一项）。 */
export interface MammothCystSkillDefinition {
  id: string;
  actorDefinitionId: string;
  name: string;
  /** d10 Skill Table 覆盖的骰点区间（正式资料缺失时为空数组）。 */
  d10Rolls: D10Roll[];
  usableFromAreaIds: string[];
  targetSide: 'enemy' | 'ally' | 'self';
  targetKind: 'hero' | 'monster' | 'any';
  accuracy: number | null;
  minDamage: number | null;
  maxDamage: number | null;
  stress: number;
  /** Source-confirmed non-attack effect; null means a normal damage/stress skill. */
  specialEffect?:
    | { type: 'heal-monster'; amount: number; target: 'self' | 'ally' }
    | { type: 'teleport-hero' }
    | null;
  /**
   * §17：该 Skill 是否触发 Teleportation 链路。
   * 仅 Stalk 的 Teleportation Skill 为 true；且必须由正式 Skill Selection 触发。
   */
  triggersTeleportation: boolean;
  /** Teleportation 使用的 Room d10 Map id（仅 triggersTeleportation 时有效）。 */
  teleportationMapId?: string;
  /**
   * 掷骰策略：每个目标独立掷 / 全体共享一次 / 由 Definition 决定。
   * 资料不足时保持 'definition-driven'（official 禁用）。
   */
  rollPolicy: 'one-roll-per-target' | 'single-roll-for-all-targets' | 'definition-driven';
  /** 是否需要命中判定（null = 资料未确认 → official 禁用）。 */
  requiresHit: boolean | null;
  description: string;
  officialDataStatus: MammothCystDataStatus;
  sourceReference?: string;
}

export interface MammothCystActorDefinition {
  id: string;
  actorType: 'boss';
  name: string;
  /** Darkest Dungeon Monster 恒 Level III。 */
  campaignLevel: 3;

  /** 规则书明确：Cyst 恒 Aggressive（§2）。 */
  requiredStance: 'aggressive';
  /** 规则书明确：每轮 2 次行动（2 张 Initiative）。 */
  actionsPerRound: 2;

  /** 正式卡面缺失时为 null（驱动 Data Gate）。 */
  stats: MammothCystActorStats | null;
  /** 正式 d10 Skill Table 缺失时为空数组（驱动 Data Gate）。 */
  skills: MammothCystSkillDefinition[];

  color: string;

  officialDataStatus: MammothCystDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

export interface WhiteCellStalkActorDefinition {
  id: string;
  actorType: 'boss-minion';
  name: string;
  campaignLevel: 3;

  /**
   * 规则书未明确 Stalk 的固定 Stance —— 由召唤时的 Spawn Policy 决定
   * （通用规则：第一处空 Stance；Boss 另有说明时从其说明）。因此 Definition 层为 null。
   */
  requiredStance: null;
  /** 规则书明确：Stalk 被召唤时立即加入 2 张 Initiative（§2.7）。 */
  actionsPerRound: 2;

  /** 正式卡面缺失时为 null（驱动 Data Gate）。 */
  stats: MammothCystActorStats | null;
  /** 正式 d10 Skill Table（含 Teleportation）缺失时为空数组（驱动 Data Gate）。 */
  skills: MammothCystSkillDefinition[];

  color: string;

  officialDataStatus: MammothCystDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

// ---------------------------------------------------------------------------
// §8 Mammoth Cyst Room Definition
// ---------------------------------------------------------------------------

export interface MammothCystRoomDefinition {
  id: string;
  guardianFamilyId: 'mammoth-cyst';

  mammothCystPlacement: { stance: 'aggressive'; areaId: string };

  whiteCellStalkSpawn: {
    stancePolicy: 'first-empty-stance' | 'specified-stance' | 'definition-driven';
    specifiedStance?: MonsterStance;

    areaPolicy: 'corresponding-stance-area' | 'specified-area' | 'definition-driven';
    specifiedAreaId?: string;
  };

  /**
   * §13 通用召唤规则用：Stance → 对应 Room Area 的映射。
   * 只来自 Room Card；缺失时 `corresponding-stance-area` 无法解析（拒绝召唤，不猜）。
   */
  stanceAreaMap: Partial<Record<MonsterStance, string>>;

  validAreaIds: string[];
  areaCapacities: Record<string, number>;
  areaGraph: RoomAreaGraph;

  /** §19：只来自 Room Card；必须覆盖 1—10；不按 Area 数量平均分配。 */
  teleportationD10Map: Record<D10Roll, string>;

  /** §21：Room Card 录入的 Entry Effect，复用正式管线；同一 Entry Event 只执行一次。 */
  roomEntryEffects: Record<string, RoomHazardEffectDefinition[]>;

  officialDataStatus: MammothCystDataStatus;
  sourceReference?: string;
}

// ---------------------------------------------------------------------------
// §7 Mammoth Cyst Guardian Definition（单 Boss + 关联召唤 Actor）
// ---------------------------------------------------------------------------

export interface MammothCystGuardianDefinition {
  id: string;
  guardianFamilyId: 'mammoth-cyst';

  bossActorDefinitionId: string;
  linkedActorDefinitionId: string;
  roomDefinitionId: string;
  conditionalSummonDefinitionId: string;

  victoryCondition:
    | 'boss-defeated'
    | 'all-encounter-owned-actors-defeated'
    | 'definition-driven';

  cleanupPolicy: 'remove-linked-actors-on-boss-victory' | 'definition-driven';

  officialDataStatus: MammothCystDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

// ---------------------------------------------------------------------------
// §12 Conditional Linked Actor Summon（Cyst 行动时的 Override Definition）
// ---------------------------------------------------------------------------

export interface ConditionalLinkedActorSummon {
  id: string;
  sourceActorDefinitionId: string;
  linkedActorDefinitionId: string;

  condition: {
    type: 'no-alive-actors-with-tag';
    tag: 'white-cell-stalk';
  };

  replacesNormalSkill: true;
  initiativeCardsToAdd: 2;
  maxAlive: 1;
  resummonPolicy: 'on-source-turn-when-none-alive';
}

// ---------------------------------------------------------------------------
// §11 Mammoth Cyst Battle Runtime
// ---------------------------------------------------------------------------

export interface MammothCystBattleRuntime {
  guardianDefinitionId: string;
  mammothCystActorId: string;

  activeWhiteCellStalkActorId: string | null;
  activeSummonRecordId: string | null;
  summonGeneration: number;

  mammothCystInitiativeCardIds: [string, string];
  activeStalkInitiativeCardIds: string[];

  reserveWhiteCellStalkDefinitionId: string;

  lastConditionalOverrideEventId: string | null;
  lastSummonTransactionId: string | null;
  lastTeleportationTransactionId: string | null;

  victoryResolved: boolean;
  dataStatus: MammothCystDataStatus;
}

// ---------------------------------------------------------------------------
// §14 White Cell Stalk Summon Record
// ---------------------------------------------------------------------------

export type WhiteCellStalkSummonStatus =
  | 'creating'
  | 'active'
  | 'defeated'
  | 'removed'
  | 'rolled-back';

export interface WhiteCellStalkSummonRecord {
  id: string;
  sourceActorId: string;
  sourceActionEventId: string;
  generation: number;

  actorId: string;
  stance: MonsterStance;
  areaId: string;
  initiativeCardIds: [string, string];
  spaceResolutionEventIds: string[];

  status: WhiteCellStalkSummonStatus;
  transactionId: string;
}

// ---------------------------------------------------------------------------
// §18 Teleportation Record
// ---------------------------------------------------------------------------

export type TeleportationStatus = 'pending' | 'moved' | 'effects-resolved' | 'rolled-back';

export interface TeleportationRecord {
  id: string;
  battleId: string;
  sourceActorId: string;
  targetHeroId: string;
  sourceSkillEventId: string;
  sourceEffectEventId: string;
  roll: number;
  originalAreaId: string;
  targetAreaId: string;
  movementEventId: string;
  entryEffectEventIds: string[];
  transactionId: string;
  status: TeleportationStatus;
}

// ---------------------------------------------------------------------------
// §11 / §12 Initiative Card
// ---------------------------------------------------------------------------

export type MammothCystInitiativeOwner = 'mammoth-cyst' | 'white-cell-stalk';

/** Mammoth Cyst 域 Initiative Card（每张只提供绑定 Actor 一次行动）。 */
export interface MammothCystInitiativeCard {
  id: string;
  sourceType: 'boss';
  actorId: string;
  encounterId: string;
  owner: MammothCystInitiativeOwner;
  /** 同一 Actor 的第几张卡（0 / 1）。 */
  index: 0 | 1;
  /** Actor 死亡 / 离场后其未抽的卡失效。 */
  invalidated: boolean;
  transactionId: string;
}

/** Skill Roll 记录（先保存后展示，刷新不重投，§13 / §16）。 */
export interface MammothCystSkillRollRecord {
  id: string;
  battleId: string;
  initiativeCardId: string;
  actorId: string;
  owner: MammothCystInitiativeOwner;
  roll: D10Roll;
  selectedSkillId: string;
  transactionId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// §10 / §22 Actor 战斗内状态
// ---------------------------------------------------------------------------

export interface MammothCystActorState {
  actorId: string;
  actorDefinitionId: string;
  owner: MammothCystInitiativeOwner;
  name: string;
  maxHp: number;
  hp: number;
  isAlive: boolean;
  stance: MonsterStance;
  areaId: string;
  actionsPerRound: 2;
  defeatedAt: string | null;
}

/** Hero 在 Mammoth Cyst Room 中的区域占位（Teleportation 需要原 Area / 当前 Area）。 */
export interface MammothCystHeroPlacement {
  heroId: string;
  areaId: string;
}

// ---------------------------------------------------------------------------
// §26 顶层存档容器（挂在 ActFourState 下，避免 CampaignState 膨胀）
// ---------------------------------------------------------------------------

/** Definition Snapshot + Hash（Room / Definition 变化时进行中的 Battle 使用 Snapshot，§26）。 */
export interface MammothCystDefinitionSnapshot {
  guardian: MammothCystGuardianDefinition;
  guardianHash: string;
  mammothCyst: MammothCystActorDefinition;
  mammothCystHash: string;
  whiteCellStalk: WhiteCellStalkActorDefinition;
  whiteCellStalkHash: string;
  room: MammothCystRoomDefinition;
  roomHash: string;
  capturedAt: string;
}

/** Data Gate 审计快照（§26 mammothCystDataAudit）。 */
export interface MammothCystDataAuditSnapshot {
  officialEnabled: boolean;
  gaps: string[];
  mammothCystStatus: MammothCystDataStatus;
  whiteCellStalkStatus: MammothCystDataStatus;
  roomStatus: MammothCystDataStatus;
  guardianStatus: MammothCystDataStatus;
  auditedAt: string;
}

/** §26 顶层存档容器。 */
export interface MammothCystEncounterState {
  /** 内容版本（Definition 变更时 +1；用于识别旧存档）。 */
  mammothCystContentVersion: number;

  guardianQuestId: string;
  battleId: string;
  roomId: string;

  /** 关联的 Guardian Definition id（prototype-mammoth-cyst-guardian-harness 等）。 */
  guardianDefinitionId: string;

  mammothCystBattleRuntime: MammothCystBattleRuntime;
  /** 恒包含 1 名 Cyst；Stalk 召唤后追加 1 条，死亡后保留（isAlive=false）。 */
  actorStates: MammothCystActorState[];
  heroPlacements: MammothCystHeroPlacement[];
  initiativeCards: MammothCystInitiativeCard[];
  /** 当前轮已抽/待抽的 Card id（刷新不重洗剩余牌堆，§12）。 */
  initiativeDrawPile: string[];
  resolvedInitiativeCardIds: string[];
  round: number;

  skillRolls: MammothCystSkillRollRecord[];
  /** §14 召唤历史（每次生成一条；generation 递增）。 */
  summonHistory: WhiteCellStalkSummonRecord[];
  /** §18 传送历史。 */
  teleportationHistory: TeleportationRecord[];

  /**
   * §21 Room Entry Effect 运行时（每个含 Entry Effect 的 Area 一条）。
   * 复用 Phase 10B 的 Room Hazard Runtime 形状与结算管线 ——
   * 不新建平行的效果系统；`resolvedTriggerKeys` 保证同一 Entry Event 只执行一次。
   */
  areaEntryRuntime: SpikedPitRuntime[];
  /** §21 Entry Effect 结算事件历史（供存档恢复与 UI 展示）。 */
  roomHazardEventHistory: RoomHazardEvent[];

  snapshot: MammothCystDefinitionSnapshot;
  mammothCystDataAudit: MammothCystDataAuditSnapshot;

  /** 幂等事务 id（保留最近 200 条）。 */
  processedTransactionIds: string[];
}
