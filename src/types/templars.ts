// Phase 10B §6 / §8 / §11 / §15 / §24：The Templars 类型契约。
//
// 硬约束对照：
// - §6：正式池条件 = enabledInOfficialPool && officialDataStatus==='verified' && validation.isComplete；
// - §8：d10 → Pit 映射**只来自 Room Definition**，覆盖 1—10，且每项必须指向已定义 Pit；
// - §9：Spiked Pit 不是 BattleActor（见 types/room-hazards.ts）；
// - §14：Pit Toss 只在「Impaler + Body Slam + 目标是 Hero + 命中」时触发；
// - §15：Pit Toss 是原子事务，失败必须整体回滚，不留半状态；
// - §3：正式数值缺失时一律留空 / null，由校验驱动 Data Gate；Prototype 必须用 prototype- 前缀。

import type { DataCredibility } from './progression';
import type { RoomPlacementRule } from './prophet';
import type {
  RoomAreaGraph,
  RoomHazardEffectDefinition,
  RoomHazardEvent,
  SpikedPitDefinition,
  SpikedPitRuntime,
} from './room-hazards';
import type {
  DualBossEncounterDefinition,
  DualBossVictoryRule,
  TemplarRole,
} from './dual-boss';

export type TemplarsDataStatus = DataCredibility;

/** d10 骰点（1—10）。 */
export type D10Roll = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

// ---------------------------------------------------------------------------
// §6 Templar Actor Definition
// ---------------------------------------------------------------------------

/** Templar 战斗数值（正式卡面缺失时整体为 null）。 */
export interface TemplarActorStats {
  maxHp: number;
  dodge: number;
  speed: number;
  resistances: Record<string, number>;
  categoricalResistances?: Array<'bleed' | 'blight' | 'stun' | 'mark'>;
  immunities: string[];
  size: number;
}

/** Templar Skill（d10 Skill Table 的一项）。 */
export interface TemplarSkillDefinition {
  id: string;
  actorDefinitionId: string;
  name: string;
  /** d10 Skill Table 覆盖的骰点区间（正式资料缺失时为空数组）。 */
  d10Rolls: D10Roll[];
  usableFromAreaIds: string[];
  targetSide: 'enemy' | 'ally' | 'self';
  targetKind: 'hero' | 'monster' | 'any';
  accuracy: number;
  minDamage: number;
  maxDamage: number;
  stress: number;
  /**
   * §14.1 命中后钩子。Body Slam 必须声明 `trigger-pit-toss`。
   * 注意：Pit 的伤害/效果**不在这里**，只声明「触发 Pit Toss」这一动作。
   */
  onHitEffects: TemplarOnHitEffect[];
  /**
   * §14.2 效果结算顺序。正式卡面未核对顺序时必须为 null → official 禁用。
   */
  effectSequence: TemplarEffectSequenceStep[] | null;
  description: string;
  officialDataStatus: TemplarsDataStatus;
  sourceReference?: string;
}

export interface TemplarOnHitEffect {
  type: 'trigger-pit-toss' | 'custom';
  target: 'hit-hero' | 'self' | 'custom';
  customEffectDefinitionId?: string;
}

export type TemplarEffectSequenceStep = 'hit-resolution' | 'damage' | 'pit-toss' | 'conditions';

export interface TemplarActorDefinition {
  id: string;
  role: TemplarRole;
  actorType: 'boss';
  name: string;
  /** Darkest Dungeon Monster 恒 Level III。 */
  campaignLevel: 3;

  requiredStance: 'aggressive' | 'ranged';
  /** 规则书明确：各 2 张 Initiative → 每轮 2 次行动。 */
  actionsPerRound: 2;

  /** 正式卡面缺失时为 null（驱动 Data Gate）。 */
  stats: TemplarActorStats | null;
  /** 正式 d10 Skill Table 缺失时为空数组（驱动 Data Gate）。 */
  skills: TemplarSkillDefinition[];

  color: string;

  officialDataStatus: TemplarsDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

// ---------------------------------------------------------------------------
// §8 Templars Room Definition
// ---------------------------------------------------------------------------

export interface TemplarsRoomDefinition {
  id: string;
  guardianFamilyId: 'templars';

  impalerPlacement: { stance: 'aggressive'; areaId: string };
  warlordPlacement: { stance: 'ranged'; areaId: string };

  heroPlacementRules: RoomPlacementRule[];

  validAreaIds: string[];
  areaCapacities: Record<string, number>;
  areaGraph: RoomAreaGraph;

  spikedPits: SpikedPitDefinition[];

  /** §16：只来自 Room Card；必须覆盖 1—10；不按 Pit 数量平均分配；不使用数组下标。 */
  pitTossD10Map: Record<D10Roll, string>;

  roomEffects: RoomHazardEffectDefinition[];

  officialDataStatus: TemplarsDataStatus;
  sourceReference?: string;
}

// ---------------------------------------------------------------------------
// §11 Templars Battle Runtime
// ---------------------------------------------------------------------------

export interface TemplarsBattleRuntime {
  encounterDefinitionId: string;

  impalerActorId: string;
  warlordActorId: string;

  impalerInitiativeCardIds: [string, string];
  warlordInitiativeCardIds: [string, string];

  /** 注意：`activeBossActorIds` 不是存活事实的唯一来源，必须结合 Actor State 验证（§11）。 */
  activeBossActorIds: string[];
  defeatedBossActorIds: string[];

  spikedPitRuntimeIds: string[];

  lastPitTossTransactionId: string | null;

  victoryResolved: boolean;
  dataStatus: TemplarsDataStatus;
}

/** Templar Initiative Card（每张只提供绑定 Actor 一次行动，§12）。 */
export interface TemplarInitiativeCard {
  id: string;
  sourceType: 'boss';
  actorId: string;
  encounterId: string;
  role: TemplarRole;
  /** 同一 Actor 的第几张卡（0 / 1）。 */
  index: 0 | 1;
  /** Actor 死亡后其未抽的卡失效。 */
  invalidated: boolean;
  transactionId: string;
}

/** Skill Roll 记录（先保存后展示，刷新不重投，§13）。 */
export interface TemplarSkillRollRecord {
  id: string;
  battleId: string;
  initiativeCardId: string;
  actorId: string;
  role: TemplarRole;
  roll: D10Roll;
  selectedSkillId: string;
  transactionId: string;
  createdAt: string;
}

/** Body Slam 命中事件（Pit Toss 的唯一合法来源，§14）。 */
export interface BodySlamHitEvent {
  id: string;
  battleId: string;
  skillEventId: string;
  sourceActorId: string;
  skillId: string;
  targetActorId: string;
  targetIsHero: boolean;
  hit: boolean;
  transactionId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// §15 Pit Toss Record
// ---------------------------------------------------------------------------

export type PitTossStatus = 'pending' | 'moved' | 'effects-resolved' | 'rolled-back';

export interface PitTossRecord {
  id: string;

  battleId: string;
  sourceActorId: string;
  targetHeroId: string;

  sourceSkillEventId: string;
  hitEventId: string;

  roll: number;

  targetPitId: string;
  targetAreaId: string;
  originalAreaId: string;

  movementEventId: string;
  roomEffectEventIds: string[];

  transactionId: string;
  status: PitTossStatus;
}

// ---------------------------------------------------------------------------
// §24 存档容器（挂在 ActFourState 下，避免 CampaignState 膨胀）
// ---------------------------------------------------------------------------

/** Definition Snapshot + Hash（Room / Definition 变化时进行中的 Battle 使用 Snapshot，§24）。 */
export interface TemplarsDefinitionSnapshot {
  encounter: DualBossEncounterDefinition;
  encounterHash: string;
  impaler: TemplarActorDefinition;
  impalerHash: string;
  warlord: TemplarActorDefinition;
  warlordHash: string;
  room: TemplarsRoomDefinition;
  roomHash: string;
  victoryRule: DualBossVictoryRule | null;
  capturedAt: string;
}

/** Data Gate 审计快照（§24 templarsDataAudit）。 */
export interface TemplarsDataAuditSnapshot {
  officialEnabled: boolean;
  gaps: string[];
  impalerStatus: TemplarsDataStatus;
  warlordStatus: TemplarsDataStatus;
  roomStatus: TemplarsDataStatus;
  encounterStatus: TemplarsDataStatus;
  auditedAt: string;
}

/** Actor 战斗内状态（不复制 BattleUnit，只做 Templars 域的存活/位置簿记）。 */
export interface TemplarActorState {
  actorId: string;
  actorDefinitionId: string;
  role: TemplarRole;
  name: string;
  maxHp: number;
  hp: number;
  isAlive: boolean;
  stance: 'aggressive' | 'ranged';
  areaId: string;
  actionsPerRound: 2;
  defeatedAt: string | null;
}

/** Hero 在 Templars Room 中的区域占位（Pit Toss 需要原 Area / 当前 Area）。 */
export interface TemplarsHeroPlacement {
  heroId: string;
  areaId: string;
  /** 位于 Pit 时为该 Pit 的 id，否则 null。 */
  pitId: string | null;
}

/** §24 顶层存档容器。 */
export interface TemplarsEncounterState {
  /** 内容版本（Definition 变更时 +1；用于识别旧存档）。 */
  templarsContentVersion: number;

  guardianQuestId: string;
  battleId: string;
  roomId: string;

  /** §7 Dual Boss Encounter 状态（Definition + 成员实例化结果）。 */
  dualBossEncounterState: {
    encounterDefinitionId: string;
    victoryCondition: DualBossEncounterDefinition['victoryCondition'];
    victoryRule: DualBossVictoryRule | null;
    memberActorIds: string[];
    resolvedVictory: boolean;
  };

  templarsBattleRuntime: TemplarsBattleRuntime;
  actorStates: TemplarActorState[];
  heroPlacements: TemplarsHeroPlacement[];
  initiativeCards: TemplarInitiativeCard[];
  /** 当前轮已抽/待抽的 Templar Card id（刷新不重洗剩余牌堆，§12）。 */
  initiativeDrawPile: string[];
  resolvedInitiativeCardIds: string[];
  round: number;

  skillRolls: TemplarSkillRollRecord[];
  bodySlamHitEvents: BodySlamHitEvent[];

  spikedPitRuntime: SpikedPitRuntime[];
  pitTossHistory: PitTossRecord[];
  roomHazardEventHistory: RoomHazardEvent[];

  snapshot: TemplarsDefinitionSnapshot;
  templarsDataAudit: TemplarsDataAuditSnapshot;

  /** 幂等事务 id（保留最近 200 条）。 */
  processedTransactionIds: string[];
}
