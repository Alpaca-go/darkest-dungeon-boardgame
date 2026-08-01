// Phase 10A §5—§14：Darkest Dungeon Act IV 通用框架类型契约。
//
// 硬约束（文档 §33 清单）：
// - 1. 不创建第二套 Campaign / Dungeon / Battle 状态机
//   → ActFourState 是 CampaignState 上的一个字段，Stage 是内部枚举，
//     不新增 GamePhase（route-guards 的穷举 Record 依赖 GamePhase 封闭）；
// - 2. Act IV 的 campaignLevel 恒为 3（字面量类型锁死）；
// - 5. Boss Slot 不走 Edge Room 算法 → Layout 自带 bossSlotIds，与 edge-room-placement 无关；
// - 6. Objective 位置不得被 UI 泄露 → BossSlotAssignmentRecord 与「对外可见视图」分离；
// - 7. Empty 只在 Darkest Dungeon Runtime 里解释为 Excavation
//   → 通过 LocationContentRuntime.emptyTokenInterpretation 表达，不改全局 Room Definition；
// - 19. Quest / Layout / Guardian / Form 数据缺失时 official 禁用（Data Gate 双标记）；
// - 20. Prototype 必须使用 prototype- 前缀 ID。

import type { DataCredibility } from './progression';
import type {
  FinalEncounterState,
  FinalFormId,
  FinalHamletState,
  FormTransitionRecord,
  SkippableFinalFormId,
} from './final-encounter';
// Phase 10B 硬约束 1：Templars 运行时不新增 CampaignState 字段，
// 而是挂在 ActFourState 下（与 finalEncounterState 同构）。
import type { TemplarsEncounterState } from './templars';
import type { MammothCystEncounterState } from './mammoth-cyst';

/** Act IV 数据可信度（与项目统一四态一致）。 */
export type ActFourDataStatus = DataCredibility;

/** Darkest Dungeon 的 Location ID（固定单值）。 */
export const DARKEST_DUNGEON_LOCATION_ID = 'darkest-dungeon' as const;
export type DarkestDungeonLocationId = typeof DARKEST_DUNGEON_LOCATION_ID;

// ---------------------------------------------------------------------------
// §5 Act IV 状态机
// ---------------------------------------------------------------------------

/**
 * Act IV 内部阶段。
 * 注意：这是 ActFourState 的内部枚举，**不是** GamePhase。
 * 顶层路由仍复用既有 GamePhase（hamlet / dungeon-explore / battle / campaign-over…），
 * 避免破坏 route-guards.ts 的 Record<GamePhase, string[]> 穷举。
 */
export type ActFourStage =
  | 'locked'
  | 'post-third-threat-hamlet'
  | 'guardian-quest-selection'
  | 'guardian-dungeon-active'
  | 'guardian-battle-active'
  | 'guardian-victory'
  | 'final-hamlet'
  | 'final-encounter-ready'
  | 'final-encounter-active'
  | 'campaign-victory'
  | 'campaign-over';

// ---------------------------------------------------------------------------
// §7 Darkest Dungeon Quest Registry
// ---------------------------------------------------------------------------

export interface DarkestDungeonQuestDefinition {
  id: string;
  questType: 'darkest-dungeon-guardian';

  /** 展示名。 */
  name: string;

  /** 规则固定：16 Rooms。 */
  roomCount: 16;
  /** 规则固定：3 XP。 */
  xpReward: 3;

  /**
   * 本 Quest 对应的 Guardian（不按 Quest 名称推断，硬约束 22）。
   * 卡面未核对时为空串 '' → 驱动 Data Gate 校验失败。
   */
  guardianDefinitionId: string;
  /**
   * 本 Quest 取消的 Final Form（必须来自卡面数据，不二次随机，硬约束 12 / 22）。
   * **卡面未核对时必须为 null**：Phase 10A 明令禁止推测 Quest → Skipped Form 映射，
   * 因此正式三张 Quest 全部为 null，validateDarkestDungeonQuest 必然失败 → official 禁用。
   */
  skippedFinalFormId: SkippableFinalFormId | null;

  /** Quest Card 上的 Firewood 图标数（未核对时 undefined）。 */
  firewoodCount?: number;
  provisionPolicyId: string;

  /** Boss Quest：不可主动撤退。 */
  canRetreat: false;
  /** Boss Quest：失败即 Campaign Over。 */
  campaignFailureOnFailure: true;

  officialDataStatus: ActFourDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

/** Quest 抽取记录（先保存后展示，刷新不重抽）。 */
export interface DarkestDungeonQuestDrawRecord {
  transactionId: string;
  /** 参与抽取的候选池（用于审计「三选一」）。 */
  candidateQuestIds: string[];
  selectedQuestId: string;
  guardianDefinitionId: string;
  skippedFinalFormId: SkippableFinalFormId;
  /** 本 Campaign 不再使用的另外两张。 */
  discardedQuestIds: string[];
  rngStateId: string;
  drawnAt: string;
}

// ---------------------------------------------------------------------------
// §8 Location Content Runtime
// ---------------------------------------------------------------------------

/**
 * Darkest Dungeon 内容切换运行时。
 * 只切换当前 Runtime，不修改静态 Registry，也不永久删除 Ruins 内容（§8 末尾）。
 */
export interface LocationContentRuntime {
  locationId: DarkestDungeonLocationId;

  monsterDefinitionIds: string[];
  roomCardDefinitionIds: string[];
  roomTileDefinitionIds: string[];

  /** Curio 使用 Ruins 牌堆（规则 19）。 */
  curioDeckId: 'ruins-curios';
  /** Dungeon Trinket 仍为 Level III（规则 16）。 */
  trinketTier: 3;
  /** Darkest Dungeon 视为 Level III Dungeon（规则 21）。 */
  dungeonLevel: 3;

  /** 所有 Darkest Dungeon Monster 都视为 Level III（规则 7）。 */
  allMonstersLevelThree: true;

  /** Quirk / Disease / Virtue / Affliction 牌堆保持不变（规则 20）。 */
  preservedDeckIds: string[];

  /**
   * 硬约束 7：Empty Token 只在本 Runtime 内被解释为 Excavation Site，
   * 不修改全局 Empty Room Definition。
   */
  emptyTokenInterpretation: 'excavation-site';
  /** 规则 18：恰好 3 个 Excavation Site。 */
  excavationSiteCount: 3;

  /** 内容指纹（Definition Hash 变化时进行中的 Quest 使用 Snapshot，§23）。 */
  contentHash: string;

  /** 切换事务（幂等）。 */
  transactionId: string;
  activatedAt: string;
}

// ---------------------------------------------------------------------------
// §9 16 Room Layout
// ---------------------------------------------------------------------------

/** Layout 上的走廊（无向边；Graph 连通性校验用）。 */
export interface CorridorDefinition {
  id: string;
  from: string;
  to: string;
  /** 走廊长度（Phase 10A 只做连通性，不做移动消耗）。 */
  length: number;
}

export interface DarkestDungeonLayoutDefinition {
  id: string;
  name: string;

  /** 恰好 16 个 Room Slot。 */
  roomSlotIds: string[];
  corridorDefinitions: CorridorDefinition[];

  /** 三个专属 Boss Slot（不走 Edge Room 算法，硬约束 5）。 */
  bossSlotIds: [string, string, string];
  startRoomSlotId: string;

  roomCount: 16;

  officialDataStatus: ActFourDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

/** Layout 抽取记录（先保存，刷新不重抽）。 */
export interface DarkestDungeonLayoutDrawRecord {
  transactionId: string;
  candidateLayoutIds: string[];
  selectedLayoutId: string;
  rngStateId: string;
  drawnAt: string;
}

// ---------------------------------------------------------------------------
// §10 Boss Slot Token 分配
// ---------------------------------------------------------------------------

/** Room Token 类型（Darkest Dungeon Runtime 内的语义）。 */
export type DarkestDungeonRoomTokenKind =
  | 'objective'
  | 'excavation-site'
  | 'battle'
  | 'curio'
  | 'trinket'
  | 'start';

export interface DarkestDungeonRoomToken {
  id: string;
  kind: DarkestDungeonRoomTokenKind;
}

export interface BossSlotAssignmentRecord {
  layoutId: string;

  bossSlotIds: [string, string, string];
  assignedTokenIds: [string, string, string];

  /** Objective 落在哪个 Boss Slot（服务端真相；UI 揭示前不得读取）。 */
  objectiveRoomSlotId: string;

  rngStateId: string;
  transactionId: string;
  assignedAt: string;
}

// ---------------------------------------------------------------------------
// §11 Room Token 与 Excavation Site
// ---------------------------------------------------------------------------

export interface ExcavationSiteRoomState {
  roomId: string;

  status: 'unrevealed' | 'available' | 'resolving-provisions' | 'resolving-rest' | 'cleared';

  provisionRollTransactionId: string | null;
  restTransactionId: string | null;

  /** heroId → Provision Die 结果（先保存，刷新不重掷）。 */
  provisionRolls: Record<string, number>;

  /** 免费 Rest 会话（8 Resting Points，不消耗 Firewood）。 */
  restSession: ExcavationRestSessionState | null;
}

/**
 * Excavation 免费 Rest 会话。
 * 复用既有 Rest / 治疗 / 减压引擎，本结构只负责「点数账本 + 幂等」，
 * 不复制一套治疗逻辑（§12）。
 */
export interface ExcavationRestSessionState {
  id: string;
  source: 'excavation-site';
  /** 规则 22：固定 8 Resting Points。 */
  restingPoints: 8;
  /** 规则 22：不消耗 Quest 的 Firewood。 */
  consumeFirewood: false;

  remainingPoints: number;
  /** 已分配明细（heroId + 用途 + 点数），用于刷新恢复。 */
  allocations: ExcavationRestAllocation[];

  status: 'pending' | 'completed';
  transactionId: string;
}

export interface ExcavationRestAllocation {
  heroId: string;
  kind: 'heal' | 'stress-relief';
  points: number;
}

/** 16 Room 地图运行时（Boss Slot + Excavation + 普通 Room 的统一容器）。 */
export interface DarkestDungeonMapState {
  layoutId: string;
  /** slotId → token（先保存，刷新不重洗）。 */
  slotTokens: Record<string, DarkestDungeonRoomToken>;
  /** 已揭示的 slotId。 */
  revealedSlotIds: string[];
  /** 起始 Room。 */
  startRoomSlotId: string;
  roomCount: 16;
  bossSlotIds: [string, string, string];
  /** 生成事务（幂等）。 */
  transactionId: string;
}

// ---------------------------------------------------------------------------
// §13 Guardian Quest
// ---------------------------------------------------------------------------

export interface DarkestDungeonQuestState {
  id: string;
  questDefinitionId: string;

  guardianDefinitionId: string;
  skippedFinalFormId: SkippableFinalFormId;

  layoutId: string;
  /** Objective Room 的 slot id（真相；对外视图需过 selector）。 */
  objectiveRoomId: string;

  status:
    | 'generating'
    | 'active'
    | 'guardian-room-entered'
    | 'guardian-battle-active'
    | 'victory'
    | 'failed';

  xpReward: 3;
  canRetreat: false;
  campaignFailureOnFailure: true;

  /** Guardian Battle 的 battleId（幂等：同一 Room 不重复创建 Boss Battle）。 */
  guardianBattleId: string | null;

  lastTransactionId: string | null;
}

// ---------------------------------------------------------------------------
// §14 Guardian Registry
// ---------------------------------------------------------------------------

export type DarkestDungeonGuardianFamily = 'templars' | 'mammoth-cyst' | 'shuffling-horror';

export interface DarkestDungeonGuardianDefinition {
  id: string;
  family: DarkestDungeonGuardianFamily;

  name: string;

  roomDefinitionId: string;
  actorDefinitionIds: string[];

  officialDataStatus: ActFourDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

// ---------------------------------------------------------------------------
// §4 / §23 数据审计快照
// ---------------------------------------------------------------------------

/** Data Gate 审计快照（存档内保留，便于事后追溯当时的数据状态）。 */
export interface DarkestDungeonDataAuditSnapshot {
  /** official Act IV 是否启用（数据齐备才为 true）。 */
  officialActFourEnabled: boolean;
  /** 缺口清单（人类可读）。 */
  gaps: string[];
  /** 生成时的内容指纹。 */
  contentHash: string;
  auditedAt: string;
}

// ---------------------------------------------------------------------------
// §5 Act IV State（CampaignState 上的唯一新增字段）
// ---------------------------------------------------------------------------

export interface ActFourState {
  unlocked: boolean;
  stage: ActFourStage;

  /** 硬约束 2：Act IV 仍是 Campaign Level III。 */
  campaignLevel: 3;
  locationId: DarkestDungeonLocationId;

  selectedQuestId: string | null;
  guardianDefinitionId: string | null;
  skippedFinalFormId: FinalFormId | null;

  guardianQuestState: DarkestDungeonQuestState | null;
  finalHamletState: FinalHamletState | null;
  finalEncounterState: FinalEncounterState | null;
  /**
   * Phase 10B：The Templars 双 Boss 遭遇运行时。
   * 硬约束 1 —— 不新增 CampaignState 顶层字段，也不创建第二套 Battle/Initiative 状态机；
   * 这里只保存 Templars 域的 *附加* 运行时（Actor 状态、Initiative 归属、Pit 运行时、
   * Pit Toss 历史），真正的战斗仍由既有 BattleState 驱动。
   */
  templarsEncounterState: TemplarsEncounterState | null;
  /**
   * Phase 10C：Mammoth Cyst / White Cell Stalk 遭遇运行时。
   * 同样遵守硬约束 1 —— 不新增 CampaignState 顶层字段、不创建第二套 Battle/Initiative/召唤
   * 状态机；这里只保存 Mammoth Cyst 域的 *附加* 运行时（Cyst/Stalk Actor 状态、
   * Initiative 归属、召唤历史、传送历史、Hero Area 占位）。
   */
  mammothCystEncounterState: MammothCystEncounterState | null;

  actFourStartedAt: string | null;
  lastTransitionTransactionId: string | null;

  // ---- §23 要求一并保存的运行时（挂在 ActFourState 下，避免 CampaignState 膨胀）----
  /** Quest 抽取记录（刷新不重抽的依据）。 */
  questDrawRecord: DarkestDungeonQuestDrawRecord | null;
  /** Darkest Dungeon 内容切换运行时。 */
  contentRuntime: LocationContentRuntime | null;
  /** Layout 抽取记录。 */
  layoutDrawRecord: DarkestDungeonLayoutDrawRecord | null;
  /** Boss Slot 分配记录（Objective 真相）。 */
  bossSlotAssignment: BossSlotAssignmentRecord | null;
  /** 16 Room 地图。 */
  mapState: DarkestDungeonMapState | null;
  /** Excavation Site 状态（恰好 3 个）。 */
  excavationSiteStates: ExcavationSiteRoomState[];
  /** Form 切换历史（保留最近 20 条）。 */
  formTransitionHistory: FormTransitionRecord[];
  /** Data Gate 审计快照。 */
  dataAudit: DarkestDungeonDataAuditSnapshot | null;
  /** 已提交的 Act IV 域事务 id（幂等；保留最近 100 条）。 */
  processedTransactionIds: string[];
}
