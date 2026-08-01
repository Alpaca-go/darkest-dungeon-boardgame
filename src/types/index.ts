// 核心类型定义 —— 对应开发文档第 7 节。
// Phase 1 仅使用其中的部分字段（CampaignState / gamePhase / 存档结构），
// 其余字段为后续阶段预留，类型在此统一声明以保证全工程一致。

import type {
  GuildVisitSession,
  HeroResistanceProfile,
  HeroXpState,
  ProgressionTransactionRecord,
  QuestObjectiveDefinition,
  QuestObjectiveProgress,
  QuestXpResult,
  ReplacementUpgradeSession,
  TemporarySkillFormOverride,
} from './progression';

import type {
  ActiveThreatRuntime,
  BossBattleState,
  BossDungeonGenerationRecord,
  BossQuestState,
  BossSummonRecord,
  CampaignAdvanceRecord,
  CampaignProgressState,
  InitiativeCard,
} from './bosses';

import type {
  HeroTrinketState,
  NomadWagonState,
  PendingTrinketAllocation,
  PendingTrinketUseTransaction,
  TrinketAcquisitionRecord,
  TrinketTransferRecord,
  TrinketUseOpportunity,
  TrinketUseRecord,
} from './trinkets';

// Phase 10A：Act IV（Darkest Dungeon）状态挂载到 CampaignState 上。
import type { ActFourState } from './act-four';

// Phase 8D：成长系统类型统一从 types 根导出，调用方无需感知文件拆分。
export * from './progression';
// Phase 8C：Trinket 域类型统一从此处再导出，调用方无需区分文件。
export * from './trinkets';
// Phase 9A：Boss / Threat / Campaign 进度类型统一从 types 根导出。
// 说明：bosses.ts 反向 `import type ... from './index'` 构成类型层循环引用，
// 但纯类型导入在编译期被完全擦除，不会产生运行时循环依赖。
export * from './bosses';
// Phase 10A：Final Encounter / Act IV 类型统一从 types 根导出。
// 顺序要求：final-encounter 先于 act-four（后者依赖前者的 FinalFormId 系列类型）。
export * from './final-encounter';
export * from './act-four';

/** 全局游戏阶段状态机。所有场景切换必须通过此字段完成。 */
export type GamePhase =
  | 'home'
  | 'campaign-setup'
  | 'skill-loadout'
  | 'quest-select'
  | 'dungeon-explore'
  | 'battle'
  | 'quest-result'
  | 'hamlet'
  | 'replacement'
  | 'campaign-over';

/** 四个抽象战斗站位 / 英雄姿态。 */
export type Stance = 'aggressive' | 'defensive' | 'ranged' | 'support';

/** 状态效果类型（Phase 3 仅实现 Bleed / Blight / Stun / Mark）。 */
export type StatusEffectType = 'bleed' | 'blight' | 'stun' | 'mark';

/** 生效中的状态层数。 */
export interface ActiveEffect {
  type: StatusEffectType;
  amount: number;
}

/** 战斗总状态。 */
export type BattleStatus = 'setup' | 'active' | 'victory' | 'defeat';

/** 战斗单位阵营。 */
export type BattleSide = 'hero' | 'monster';

/** 技能目标阵营。 */
export type SkillTargetSide = 'enemy' | 'ally' | 'self';

/** 游戏日志条目。 */
export interface GameLogEntry {
  id: string;
  at: string; // ISO 时间戳
  message: string;
  kind?: 'info' | 'success' | 'warning' | 'danger';
}

/** 补给池。 */
export interface ProvisionPool {
  food: number;
  bandage: number;
  potion: number;
  torch: number;
  tool: number;
}

/** 英雄实例（进入战役后的具体状态）。
 * Phase 6 健康模型：hp = max(0, maxLife - wounds)。
 * - hp > 0：正常存活；
 * - hp === 0 && atDeathsDoor === true：Death's Door（仍存活，可行动）；
 * - dead === true：永久死亡（isAlive 同步为 false）。
 * dead 与 atDeathsDoor 不得同时为 true。
 */
export interface HeroInstance {
  instanceId: string;
  heroId: string;
  name: string;
  level: 1 | 2 | 3;
  maxLife: number;
  wounds: number;
  stress: number;
  speed: number;
  stance: Stance;
  equippedSkillIds: string[];
  xp: number;
  isAlive: boolean;
  hasActedToday: boolean;
  temporaryDamageBonus: number;
  // ---- Phase 6：Death's Door 与永久死亡 ----
  /** 队伍固定站位 1..4（替补填入死亡英雄的原位置）。 */
  partySlot: number;
  /** 是否处于 Death's Door（HP=0 但仍存活）。 */
  atDeathsDoor: boolean;
  /** 永久死亡标记。 */
  dead: boolean;
  /** 累计 Deathblow 掷骰次数（展示用）。 */
  deathblowRollCount: number;
  /** 每个已装备技能的等级（1..3，默认 1）。 */
  skillLevels: Record<string, 1 | 2 | 3>;
  /** 关联的死亡记录 id（dead=true 时存在）。 */
  deathRecordId?: string;
  // ---- Phase 7：Stress / Resolve / Affliction / Virtue / Heart Attack ----
  /** 本 Quest 是否已进行过 Resolve Test（每名英雄每 Quest 仅一次）。 */
  resolveTestedThisQuest: boolean;
  /** 精神状态：normal / virtuous / afflicted。以该字段为主，避免互相冲突的布尔。 */
  resolveState: ResolveState;
  /** 当前 Virtue 卡牌 id（resolveState==='virtuous' 时存在，否则 null）。 */
  virtueId: string | null;
  /** 当前 Affliction 卡牌 id（resolveState==='afflicted' 时存在，否则 null）。 */
  afflictionId: string | null;
  /** Heart Attack 累计次数（统计用，不影响规则）。 */
  heartAttackCount: number;
  /** 已获得 Positive Quirk id 列表（Phase 8A 起被动效果生效；与 negative 合计上限 3）。 */
  positiveQuirkIds: string[];
  /** 已获得 Negative Quirk id 列表（Phase 8A 起被动效果生效；与 positive 合计上限 3）。 */
  negativeQuirkIds: string[];
  /** 最近一次 Resolve Test 所在 Quest id（防重复 / 刷新恢复）。 */
  lastResolveQuestId: string | null;
  /** 最近一次精神事件 id（防重复执行 / 调试）。 */
  lastMentalEventId: string | null;
  // ---- Phase 8B：Disease ----
  /** 当前 Disease（每名英雄最多 1 个；无病为 null）。 */
  disease: HeroDiseaseState | null;
  /** 战斗外累积的 Bleed 层数（进入下一场战斗时注入 BattleUnit）。 */
  pendingBleed: number;
  /** 战斗外累积的 Blight 层数（进入下一场战斗时注入 BattleUnit）。 */
  pendingBlight: number;
  // ---- Phase 8D：XP 账本 ----
  /**
   * XP 账本（唯一权威）。`xp` 字段自 Phase 8D 起降级为 xpState.currentXp 的只读镜像，
   * 由 xp-ledger 统一维护，任何业务代码都不得直接赋值。
   */
  xpState: HeroXpState;
  // ---- Phase 8C：Trinket ----
  /**
   * 已装备的 Trinket（容量 = 英雄等级，见 game-engine/trinkets/capacity.ts）。
   * 不存在「未装备仓库」：任何超容量的 Trinket 只能被丢弃或转移。
   */
  equippedTrinkets: HeroTrinketState[];
}

/** 地牢房间类型。 */
export type DungeonRoomType =
  | 'start'
  | 'empty'
  | 'trap'
  | 'treasure'
  | 'battle'
  | 'objective';

/** 地牢房间状态。 */
export type DungeonRoomStatus =
  | 'hidden'
  | 'revealed'
  | 'current'
  | 'visited'
  | 'cleared';

/** 地牢房间节点。 */
export interface DungeonRoom {
  id: string;
  type: DungeonRoomType;
  status: DungeonRoomStatus;
  adjacentRoomIds: string[];
  /** Phase 8B：房间内的 Curio id（null = 无）。 */
  curioId?: string | null;
  /** Phase 8B：该 Curio 是否已被互动过（每个房间只能互动一次）。 */
  curioUsed?: boolean;
}

/** Phase 8B：Curio 定义（最小实现，仅承载 Disease 感染来源）。 */
export interface CurioDefinition {
  id: string;
  name: string;
  description: string;
  /** 互动后的效果。 */
  effect:
    | { kind: 'disease-guaranteed'; diseaseId: string }
    | { kind: 'disease-chance'; diseaseId: string; d10AtMost: number; safeMessage: string }
    | { kind: 'gold'; amount: number };
  color: string;
}

/** 地牢状态。 */
export interface DungeonState {
  questId: string;
  currentRoomId: string;
  previousRoomId: string | null;
  rooms: DungeonRoom[];
  scoutedNextMove: boolean;
  roomsCleared: number;
  objectiveComplete: boolean;
  canLeave: boolean;
}

/** 战斗单位（英雄或怪物）。所有字段均可序列化以支持 localStorage 存档。 */
export interface BattleUnit {
  id: string;
  name: string;
  side: BattleSide;
  sourceId: string;
  maxHp: number;
  hp: number;
  stress: number;
  /** 站位编号 1..4（1 为最前排）。 */
  position: number;
  speed: number;
  stance: Stance;
  isAlive: boolean;
  /** Stun 剩余回合（>0 时跳过本次行动）。 */
  stunned: number;
  /** Bleed 层数（回合开始按层数扣血后 -1）。 */
  bleed: number;
  /** Blight 层数（回合开始按层数扣血后 -1）。 */
  blight: number;
  /** 是否被 Mark（部分技能的目标加成标记）。 */
  marked: boolean;
  buffs: ActiveEffect[];
  debuffs: ActiveEffect[];
  /** 当前行动点（仅英雄回合使用，怪物回合由 AI 自动执行）。 */
  actionPoints: number;
  /** Blacksmith 临时伤害加成（仅 hero 有，命中后加算）。 */
  damageBonus?: number;
  /** 英雄已装备技能 id（仅 hero 有）。 */
  equippedSkillIds?: string[];
  /** 怪物可用技能 id（仅 monster 有）。 */
  monsterSkillIds?: string[];
  /** 怪物自动行动的目标规则。 */
  targetRule?: MonsterTargetRule;
  // ---- Phase 6：Death's Door（仅英雄使用；怪物 HP=0 即死） ----
  /** 是否处于 Death's Door（hp=0 且 isAlive 仍为 true）。 */
  atDeathsDoor: boolean;
  /** 本场战斗累计 Deathblow 掷骰次数。 */
  deathblowRollCount: number;
  /** 永久死亡是否已同步到 Campaign（防重复 killCampaignHero）。 */
  deathResolved?: boolean;
  /** 战斗内死亡原因（同步 Campaign 时写入 DeathRecord）。 */
  deathCause?: HeroDeathCause;
  /** 英雄技能等级快照（仅 hero 有）。 */
  skillLevels?: Record<string, 1 | 2 | 3>;
  // ---- Phase 7：精神效果 ----
  /** 本 Quest 是否已进行 Resolve Test。 */
  resolveTestedThisQuest: boolean;
  /** 精神状态。 */
  resolveState: ResolveState;
  /** 当前 Virtue 卡牌 id。 */
  virtueId: string | null;
  /** 当前 Affliction 卡牌 id。 */
  afflictionId: string | null;
  /** 本英雄回合精神效果已处理的 turnId（防刷新 / 重复调用重复检定）。 */
  mentalEffectResolvedTurnId: string | null;
  /** 精神效果给予的当前回合伤害加成（回合结束清零）。 */
  turnDamageBonus?: number;
  /** 精神效果给予的当前回合命中加成（回合结束清零）。 */
  turnAccuracyBonus?: number;
  // ---- Phase 8A：Quirk 快照（仅英雄；进入战斗时从战役英雄同步） ----
  /** 该英雄全部 Quirk id（positive + negative），战斗内被动修正使用。 */
  quirkIds?: string[];
  // ---- Phase 8B：Disease 快照（仅英雄；进入战斗时从战役英雄 hydrate） ----
  /** 当前 Disease 定义 id（无病为 null）。 */
  diseaseId?: string | null;
  /** 当前 Disease 实例 id（用于被动循环保护的唯一键）。 */
  diseaseInstanceId?: string | null;
  /** 英雄等级快照（Disease 的 hero-level 缩放伤害使用）。 */
  heroLevel?: number;
  // ---- Phase 8D：Hero Level 派生的抗性 / 免疫快照（不落盘，进入战斗时派生） ----
  /** 由 Hero Level Registry 派生的抗性百分比（stun/bleed/blight/disease/debuff/move）。 */
  resistances?: HeroResistanceProfile;
  /** 由 Hero Level Registry 派生的免疫状态列表（如 'stun'）。 */
  immunities?: string[];
  // ---- Phase 8C：Trinket 快照（仅英雄；获取/翻面等权威状态始终在战役英雄上） ----
  /** 该英雄已装备 Trinket 的实例 id（战斗内查找开窗机会用）。 */
  equippedTrinketInstanceIds?: string[];
}

/**
 * Phase 8C：等待 Trinket 开窗决策的战斗动作。
 * 使用窗口（如 before-attack-roll）会中断技能结算：先把意图冻结在此，
 * 玩家决定使用/放弃后再由引擎执行，UI 全程不产生随机数（核心约束 2）。
 */
export interface PendingBattleAction {
  kind: 'hero-skill';
  actorUnitId: string;
  skillId: string;
  targetId: string;
  /** Trinket 累计的命中修正。 */
  accuracyBonus: number;
  /** Trinket 累计的暴击阈值修正（crit 判定为 roll >= 10 - critBonus）。 */
  critBonus: number;
  /** Trinket 累计的伤害修正。 */
  damageBonus: number;
}

/** Phase 7：战斗内产生的待处理压力事件（store 层路由到统一 stress 管线）。 */
export interface BattleStressEvent {
  id: string;
  /** 目标英雄 instanceId（怪物不产生压力事件）。 */
  heroInstanceId: string;
  /** 正数 = 加压，负数 = 恢复。 */
  amount: number;
  sourceType: MentalEventSourceType;
  sourceId?: string;
}

/** 战斗状态。 */
export interface BattleState {
  battleId: string;
  status: BattleStatus;
  round: number;
  maxRounds: number;
  heroes: BattleUnit[];
  monsters: BattleUnit[];
  /** 先攻行动顺序（单位 id 列表）。 */
  initiativeOrder: string[];
  /** 当前在先攻列表中的索引。 */
  initiativeIndex: number;
  /** 当前行动单位 id（null 表示战斗已结束待处理）。 */
  activeActorId: string | null;
  currentActionPoints: number;
  selectedSkillId: string | null;
  selectedTargetId: string | null;
  battleLog: GameLogEntry[];
  /** 来源战斗房间 id（用于胜利后标记 cleared）。 */
  sourceRoomId: string;
  rewards: { gold: number };
  // ---- Phase 7（可选字段，兼容旧存档与测试 fixture）----
  /** 英雄回合开始暂停点：等待 campaign 层执行精神效果检定。 */
  pendingMentalCheck?: boolean;
  /** 战斗内待处理压力事件（processBattleStressEvents 消费后清空）。 */
  pendingStressEvents?: BattleStressEvent[];
  /** 精神效果导致的本回合行动点惩罚（授予行动点时消耗）。 */
  pendingActionPointPenalty?: number;
  // ---- Phase 8A（可选字段，兼容旧存档与测试 fixture）----
  /** 战斗开始时的光照快照（Quirk 光照条件在战斗内使用该值）。 */
  light?: number;
  // ---- Phase 8B（可选字段，兼容旧存档与测试 fixture）----
  /**
   * 战斗内待处理的规则事件（processBattleRuleEvents 消费后清空）。
   * 战斗引擎是纯 BattleState 函数，无法访问 Campaign 级数据（Disease、死亡记录），
   * 因此 hero-move-action-resolved / hero-shuffled 等只排队、不结算。
   */
  pendingRuleEvents?: BattleRuleEvent[];
  /** 战斗内待结算的感染（processBattleDiseaseInfections 消费后清空）。 */
  pendingDiseaseInfections?: BattleDiseaseInfection[];
  // ---- Phase 8C（可选字段，兼容旧存档与测试 fixture）----
  /**
   * 被 Trinket 使用窗口冻结的战斗动作。
   * 非 null 时战斗暂停，等待玩家在 campaign.pendingTrinketUseOpportunities 中
   * 逐条决定使用/放弃，全部结清后由引擎继续执行该动作。
   */
  pendingAction?: PendingBattleAction | null;
  // ---- Phase 9A（可选字段；普通战斗不写入，保证既有行为零变化）----
  /**
   * Boss 战斗状态。非 null 即 Boss Battle（§11.1）。
   * 普通战斗恒为 undefined/null，因此旧存档迁移后天然是非 Boss 战。
   */
  boss?: BossBattleState | null;
  /**
   * 四轮上限开关（§11.3）。缺省视为 true（普通战斗保持四轮上限），
   * Boss 战初始化时显式写 false。
   */
  roundLimitEnabled?: boolean;
  /** Actor-specific Initiative 牌堆（§12.1；普通战斗为空数组/undefined）。 */
  initiativeCards?: InitiativeCard[];
  /** 本轮尚未抽出的卡 id 顺序表；Summon 插卡写入此处（§13.2）。 */
  initiativeDrawPile?: string[];
  /** 已结算过的 Initiative Card id（同一张卡不得让 Boss 行动两次，§22）。 */
  resolvedInitiativeCardIds?: string[];
}

/** 战斗内排队的规则事件（Phase 8B）。 */
export interface BattleRuleEvent {
  id: string;
  type: RuleEventType;
  heroInstanceId: string;
}

/** 战斗内排队的感染事件（Phase 8B）。 */
export interface BattleDiseaseInfection {
  id: string;
  heroInstanceId: string;
  diseaseId: string;
  sourceSkillId: string;
}

/** Hamlet（村庄）状态。 */
export interface HamletState {
  /** Phase 8B：本次 Hamlet 访问的唯一 id（Sanitarium 治疗幂等键的组成部分）。 */
  visitId: string;
  preparationDays: number;
  currentDay: number;
  caretakerBlockedBuildingId: string | null;
  occupiedBuildingIds: string[];
  currentEventId: string | null;
  /** Hamlet 期间的行动日志（进入 Hamlet 时重置）。 */
  log: GameLogEntry[];
  /** Supply Run 等事件带来的下次任务补给奖励（每种补给 +N）。 */
  nextQuestProvisionBonus: number;
}

/** 任务最终结果。 */
export type QuestOutcome = 'completed' | 'incomplete' | 'failed';

/** 结算页中单个英雄的快照。 */
export interface HeroQuestResult {
  instanceId: string;
  name: string;
  hp: number;
  maxHp: number;
  stress: number;
  xpGained: number;
  isAlive: boolean;
}

/** 任务结算摘要（只生成一次，可序列化）。 */
export interface QuestResultSummary {
  questId: string;
  questName: string;
  outcome: QuestOutcome;
  roomsCleared: number;
  objectiveComplete: boolean;
  /** 任务期间累计获得的 Gold（宝箱/战斗等）。 */
  goldEarned: number;
  /** 未使用补给转换的 Gold。 */
  provisionGold: number;
  /** 结算时剩余补给快照。 */
  provisionsLeft: ProvisionPool;
  heroes: HeroQuestResult[];
  /** Phase 8D：Objective 完成明细（0-3 XP 的计算依据）。 */
  objectives: QuestObjectiveProgress[];
  /** Phase 8D：每名合格英雄将获得的 XP（回到 Hamlet 时才真正发放）。 */
  xpPerHero: number;
  /** Phase 8D：完成的 Objective 数量。 */
  completedObjectiveCount: number;
}

// ---------------------------------------------------------------------------
// Phase 6：死亡、Stagecoach 与替补类型
// ---------------------------------------------------------------------------

/** 英雄永久死亡原因。 */
export type HeroDeathCause =
  | 'deathblow-attack'
  | 'deathblow-bleed'
  | 'deathblow-blight'
  | 'deathblow-periodic'
  | 'deathblow-trap'
  | 'deathblow-exploration'
  | 'deathblow-trinket'
  | 'heart-attack'
  | 'madness'
  | 'unknown';

/** 死亡记录（永久保存在 CampaignState.deathRecords）。 */
export interface DeathRecord {
  id: string;
  campaignHeroId: string;
  heroClassId: string;
  heroName: string;
  cause: HeroDeathCause;
  questId?: string;
  roomId?: string;
  battleId?: string;
  round?: number;
  sourceActorId?: string;
  sourceSkillId?: string;
  occurredAt: string;
  sequence: number;
}

/** 替补免 Gold 升级操作（最多 2 次）。 */
export type ReplacementUpgradeOperation =
  | {
      id: string;
      type: 'hero-level';
      fromLevel: 1 | 2;
      toLevel: 2 | 3;
      /** Phase 8D：成本来自 GUILD_UPGRADE_COSTS.heroLevel.xp（数据驱动，不再硬编码字面量）。 */
      xpCost: number;
    }
  | {
      id: string;
      type: 'skill-level';
      skillId: string;
      fromLevel: 1 | 2;
      toLevel: 2 | 3;
      /** Phase 8D：成本来自 GUILD_UPGRADE_COSTS.skillLevel.xp。 */
      xpCost: number;
    };

/** 单个替补槽位（每名死亡英雄一个）。 */
export interface ReplacementSlot {
  partySlot: number;
  deadCampaignHeroId: string;
  deathRecordId: string;
  selectedHeroClassId?: string;
  draftHero?: HeroInstance;
  upgradeOperations: ReplacementUpgradeOperation[];
  confirmed: boolean;
}

/** 待处理替补流程状态。 */
export interface PendingReplacementState {
  id: string;
  source: 'battle' | 'exploration' | 'quest-result';
  resumePhase: 'dungeon-explore' | 'quest-result' | 'hamlet';
  slots: ReplacementSlot[];
  createdAt: string;
  resolved: boolean;
}

/** Stagecoach 状态。 */
export interface StagecoachState {
  level: 1 | 2 | 3;
  waitingTokens: number;
  accumulatedXp: number;
  deadHeroClassIds: string[];
  recruitedHeroClassIds: string[];
  pendingReplacement: PendingReplacementState | null;
}

/** 统一伤害入口的输入命令。 */
export interface DamageCommand {
  targetId: string;
  amount: number;
  sourceType:
    | 'attack'
    | 'bleed'
    | 'blight'
    | 'periodic-batch'
    | 'trap'
    | 'exploration'
    /** Phase 8C：Trinket 负面效果对自身造成的伤害。 */
    | 'trinket';
  sourceActorId?: string;
  sourceSkillId?: string;
  eventId: string;
  batchId?: string;
  /** Phase 8B：该伤害是否为被动派生（派生伤害不再二次发射 damage-resolved，避免自激）。 */
  derived?: boolean;
}

/** 统一伤害入口的输出结果。 */
export interface DamageResolution {
  targetId: string;
  previousHp: number;
  nextHp: number;
  enteredDeathsDoor: boolean;
  deathblowRolled: boolean;
  deathblowRoll?: number;
  deathblowResult?: 'safe' | 'dead';
  heroDied: boolean;
  logs: string[];
}

/** 统一治疗入口的输出结果。 */
export interface HealingResolution {
  targetId: string;
  previousHp: number;
  nextHp: number;
  healed: number;
  leftDeathsDoor: boolean;
  logs: string[];
}

/** 英雄等级 Profile（data-driven；每英雄三个等级）。 */
export interface HeroLevelProfile {
  level: 1 | 2 | 3;
  maxHp: number;
  speed: number;
}

/** 战役状态（存档根对象）。 */
export interface CampaignState {
  saveVersion: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  gamePhase: GamePhase;
  act: 1 | 2 | 3 | 4;
  campaignLevel: 1 | 2 | 3;
  completedQuestCount: number;
  currentThreatId: string | null;
  currentQuestId: string | null;
  questStatus: 'none' | 'selected' | 'active' | 'complete' | 'failed';
  gold: number;
  light: number;
  heroes: HeroInstance[];
  waitingHeroIds: string[];
  provisions: ProvisionPool;
  dungeon: DungeonState | null;
  battle: BattleState | null;
  hamlet: HamletState;
  log: GameLogEntry[];
  /** 选择任务时的 Gold 快照，用于计算任务期间净收益。 */
  questStartGold: number;
  /** 当前任务是否已结算（防止奖励重复领取）。 */
  questResultResolved: boolean;
  /** 最近一次任务结算摘要（quest-result 页面数据源）。 */
  lastQuestResult: QuestResultSummary | null;
  // ---- Phase 6 ----
  /** Stagecoach 状态（Token、累计 XP、待替补流程）。 */
  stagecoach: StagecoachState;
  /** 全部死亡记录（永久保存，不裁剪）。 */
  deathRecords: DeathRecord[];
  /** 已处理的伤害事件 id（幂等保护，保留最近 200 条）。 */
  processedDamageEventIds: string[];
  /** 本次任务的 Stagecoach XP 是否已累计（幂等标记，选新任务时重置）。 */
  stagecoachXpApplied: boolean;
  /** 战役失败原因（campaign-over 页面展示）。 */
  campaignOverReason: string | null;
  // ---- Phase 7 ----
  /** 精神事件队列（日志 / UI 展示 / E2E 断言；保留最近 200 条）。 */
  mentalEvents: MentalEvent[];
  /** Quest 结束 Resolve → Quirk 转换记录（幂等保护，永久保存）。 */
  resolveConversionRecords: ResolveConversionRecord[];
  /** 已处理的 Stress 阈值批次 id（防同一批次重复 Resolve Test / Heart Attack）。 */
  processedStressBatchIds: string[];
  // ---- Phase 8A ----
  /** 待玩家决策的 Quirk 获取事件队列（先进先出，UI 强制处理）。 */
  pendingQuirkDecisions: PendingQuirkDecision[];
  // ---- Phase 8B ----
  /** Disease 获取记录（永久保存）。 */
  diseaseAcquisitionRecords: DiseaseAcquisitionRecord[];
  /** Sanitarium 移除 Disease 的治疗记录（永久保存）。 */
  diseaseTreatmentRecords: DiseaseTreatmentRecord[];
  /** 已处理的 Disease 感染事件 id（幂等保护，保留最近 200 条）。 */
  processedDiseaseEventIds: string[];
  /** 进行中的 Disease 替换事务（刷新恢复用；完成后置 null）。 */
  pendingDiseaseTransaction: PendingDiseaseTransaction | null;
  /** 最近一次 Disease 获取结果（Overlay 数据源；确认后置 null）。 */
  lastDiseaseAcquisition: DiseaseAcquisitionRecord | null;
  // ---- Phase 8D：Quest XP / Hero Level / Skill Level / Guild ----
  /** 当前任务的 Objective 实时进度（选择任务时重置）。 */
  objectiveProgress: QuestObjectiveProgress[];
  /** 已结算但尚未发放的 Quest XP（回到 Hamlet 时一次性发放；发放后置 null）。 */
  pendingQuestXp: QuestXpResult | null;
  /** 历史 Quest XP 结算记录（永久保存，含已发放标记）。 */
  questXpResults: QuestXpResult[];
  /** 已提交的升级事务记录（Hero 成长履历，永久保存）。 */
  progressionTransactions: ProgressionTransactionRecord[];
  /** 进行中的 Guild 访问会话（未 Commit 时不影响任何英雄数据；刷新可恢复）。 */
  guildVisitSession: GuildVisitSession | null;
  /** 进行中的 Replacement 升级会话（免 Gold，消耗个人 XP）。 */
  replacementUpgradeSession: ReplacementUpgradeSession | null;
  /** Blacksmith 临时 Skill Form 覆盖（只影响下一次任务，不改永久等级）。 */
  temporarySkillFormOverrides: TemporarySkillFormOverride[];
  // ---- Phase 8C：Trinket / Nomad Wagon ----
  /** 待分配的 Trinket 队列（先进先出；含死亡转移，刷新可恢复）。 */
  pendingTrinketAllocations: PendingTrinketAllocation[];
  /** 当前开放中的 Trinket 使用机会（同一窗口可能同时开多张卡）。 */
  pendingTrinketUseOpportunities: TrinketUseOpportunity[];
  /** 进行中的 Trinket 使用事务（防同一次使用重复结算 / 重复翻面）。 */
  pendingTrinketUseTransaction: PendingTrinketUseTransaction | null;
  /** Trinket 获取记录（永久保存）。 */
  trinketAcquisitionRecords: TrinketAcquisitionRecord[];
  /** Trinket 使用记录（永久保存，保留最近 200 条）。 */
  trinketUseRecords: TrinketUseRecord[];
  /** Trinket 转移 / 丢弃 / 买卖记录（永久保存，保留最近 200 条）。 */
  trinketTransferRecords: TrinketTransferRecord[];
  /** 已处理的 Trinket 来源事件 id（幂等保护，保留最近 200 条）。 */
  processedTrinketEventIds: string[];
  /** 已执行的返回 Hamlet 正面重置幂等键（questId + returnTransactionId）。 */
  processedTrinketResetKeys: string[];
  /** Nomad Wagon 状态。 */
  nomadWagon: NomadWagonState;
  // ---- Phase 9A：Campaign Act / Imminent Threat / Face the Threat ----
  /**
   * 战役进度权威数据（§5.1）。
   * 顶层 act / campaignLevel / currentThreatId 保留为只读镜像（旧 UI 与存档兼容），
   * 一切写入必须经 campaign-progress 引擎，避免两份真相。
   */
  campaignProgress: CampaignProgressState;
  /** 当前 Imminent Threat 运行时（未抽取时为 null，§6.2）。 */
  activeThreatRuntime: ActiveThreatRuntime | null;
  /** 当前 Face the Threat Quest 状态（未解锁为 null，§8.3）。 */
  bossQuestState: BossQuestState | null;
  /** Boss 地牢生成记录（刷新不得重新随机，§9.3）。 */
  bossDungeonGeneration: BossDungeonGenerationRecord | null;
  /** 战役推进历史（幂等 + 调试，§18）。 */
  campaignAdvanceHistory: CampaignAdvanceRecord[];
  /** Boss 召唤历史（跨战斗留存，战斗结束后仍可查，§13.4）。 */
  bossSummonHistory: BossSummonRecord[];
  /** 已执行的 Boss / Threat 域事务 id（幂等保护，§22；保留最近 200 条）。 */
  processedBossTransactionIds: string[];
  // ---- Phase 10A：Darkest Dungeon Act IV ----
  /**
   * Act IV 运行时（Phase 10A §5）。
   * 硬约束 1：这是 CampaignState 上的**唯一**新增字段，不新增 GamePhase、
   * 不创建第二套 Campaign / Dungeon / Battle 状态机；
   * Quest 抽取 / Content Runtime / Layout / Boss Slot / Excavation /
   * Final Hamlet / Final Encounter / Form Transition 全部挂在它下面（§23）。
   */
  actFourState: ActFourState;
}

// ---------------------------------------------------------------------------
// 以下为 mock 数据域类型，供 data/ 目录与后续阶段使用。
// ---------------------------------------------------------------------------

/** 英雄定义（mock 静态数据）。 */
export interface HeroDefinition {
  id: string;
  name: string;
  baseLife: number;
  speed: number;
  defaultStance: Stance;
  tags: string[];
  color: string; // 纯色块占位
  description?: string;
}

/** 技能定义（mock 静态数据）。 */
export interface SkillDefinition {
  id: string;
  heroId: string;
  name: string;
  kind: 'attack' | 'heal' | 'guard' | 'move';
  damage?: number;
  heal?: number;
  range: number;
  cooldown?: number;
  description: string;
  // ---- Phase 3 战斗字段 ----
  /** 允许释放的站位（1..4）。 */
  usableFromPositions?: number[];
  /** 合法目标站位（1..4）。 */
  validTargetPositions?: number[];
  targetSide?: SkillTargetSide;
  /** 命中阈值：掷 d10，结果 <= accuracy 视为命中（1..10）。 */
  accuracy?: number;
  minDamage?: number;
  maxDamage?: number;
  /** 治疗量（对 ally 目标）。 */
  stressHeal?: number;
  /** 自身位移（delta，负值前移）。 */
  moveSelf?: number;
  /** 目标位移（delta，正值为向后推）。 */
  moveTarget?: number;
  applyEffects?: ActiveEffect[];
}

/** 怪物目标规则。 */
export type MonsterTargetRule =
  | 'closest'
  | 'furthest'
  | 'mostWounded'
  | 'mostStressed'
  | 'random';

/** 战斗结算通用技能形状（英雄技能与怪物技能的公共子集）。 */
export type BattleSkillLike = SkillDefinition | MonsterSkillDefinition;

/** 怪物技能定义（mock 静态数据）。 */
export interface MonsterSkillDefinition {
  id: string;
  monsterId: string;
  name: string;
  usableFromPositions: number[];
  validTargetPositions: number[];
  targetSide: SkillTargetSide;
  accuracy: number;
  minDamage: number;
  maxDamage: number;
  stress?: number;
  stressHeal?: number;
  heal?: number;
  moveSelf?: number;
  moveTarget?: number;
  applyEffects?: ActiveEffect[];
  /** Phase 8B：命中英雄后按 d10 <= d10AtMost 的概率使其感染指定 Disease。 */
  diseaseChance?: { diseaseId: string; d10AtMost: number };
  description: string;
}

/** 怪物定义（mock 静态数据）。 */
export interface MonsterDefinition {
  id: string;
  name: string;
  maxHp: number;
  speed: number;
  targetRule: MonsterTargetRule;
  /** 可用技能 id 列表（至少 2 个）。 */
  skillIds: string[];
  color: string;
}

/** 任务定义（mock 静态数据）。 */
export interface QuestDefinition {
  id: string;
  name: string;
  type: string;
  description: string;
  dungeonLevel: number;
  roomCount: number;
  /** 人类可读的主目标描述（保留给旧 UI）。 */
  objective: string;
  reward: string;
  difficulty: 'easy' | 'normal' | 'hard';
  /** Phase 8D：结构化 Objective 列表（最多 3 条，决定 0-3 XP）。 */
  objectives: QuestObjectiveDefinition[];
}

/** 房间类型元数据（用于纯色块区分）。 */
export interface RoomTypeMeta {
  type: DungeonRoomType;
  label: string;
  color: string;
  description: string;
}

/** 探索事件结果（Phase 2 简化集合）。 */
export type ExplorationEventResult =
  | 'none'
  | 'hunger'
  | 'trap'
  | 'darkness'
  | 'rubble'
  /** Phase 8B：污秽遗骸 —— 随机 1 名英雄有几率感染 Disease。 */
  | 'contaminated-remains';

/** 探索事件定义。 */
export interface ExplorationEventDefinition {
  result: ExplorationEventResult;
  label: string;
  description: string;
}

/** Hamlet 建筑定义。 */
export interface HamletBuildingDefinition {
  id: string;
  name: string;
  cost: number;
  effect: string;
  color: string;
}

/** Hamlet 事件效果类型（Phase 4 简化集合）。 */
export type HamletEventEffectType = 'bonus-provisions' | 'none' | 'party-stress';

/** Hamlet 事件定义。 */
export interface HamletEventDefinition {
  id: string;
  name: string;
  description: string;
  /** 本次 Hamlet 的准备天数。 */
  preparationDays: number;
  /** 事件效果说明（展示用）。 */
  effect: string;
  /** 事件效果类型（进入 Hamlet 时执行一次）。 */
  effectType: HamletEventEffectType;
  /** 效果数值（补给 +N / 全队 Stress +N）。 */
  effectAmount: number;
}

/** 英雄战斗动作（Phase 3 使用，类型预留）。 */
export interface HeroBattleAction {
  type: 'attack' | 'skill' | 'stance' | 'provision' | 'end';
  skillId?: string;
  targetId?: string | null;
  provisionType?: keyof ProvisionPool;
  newStance?: Stance;
}

// ---------------------------------------------------------------------------
// Phase 7：Stress / Resolve / Affliction / Virtue / Heart Attack / Quirk
// ---------------------------------------------------------------------------

/** 精神状态。优先以 resolveState 为主，避免互相冲突的布尔字段。 */
export type ResolveState =
  | 'normal'
  | 'virtuous'
  | 'afflicted';

/** Resolve Test 修正接口（Phase 8 的 Quirk / Disease 可调整 Virtue 阈值）。 */
export interface ResolveTestModifiers {
  /** Virtue 阈值偏移量（正=更难获得 Virtue）。 */
  virtueThresholdDelta: number;
  /** 强制结果（未来接口预留，本阶段无正常玩法来源）。 */
  forceVirtue?: boolean;
  forceAffliction?: boolean;
}

/** 精神效果（数据驱动执行器使用，不为每张卡写独立 if/else）。 */
export type ResolveEffect =
  | { type: 'stress-self'; amount: number }
  | { type: 'stress-allies'; amount: number }
  | { type: 'heal-self'; amount: number }
  | { type: 'damage-self'; amount: number }
  | { type: 'temporary-damage-bonus'; amount: number; duration: 'current-turn' }
  | { type: 'temporary-accuracy-bonus'; amount: number; duration: 'current-turn' }
  | { type: 'consume-provision'; amount: number; selection: 'random' | 'food-first' }
  | { type: 'lose-action-points'; amount: number }
  | { type: 'move-self'; distance: number; direction: 'forward' | 'backward' | 'random' }
  | { type: 'log-only'; message: string };

/** 效果数据来源可信度。 */
export type ResolveSourceAccuracy =
  | 'rulebook-visible'
  | 'prototype-simplified'
  | 'verified-card';

/** Virtue / Affliction 卡牌定义（数据驱动）。 */
export interface ResolveEffectDefinition {
  id: string;
  name: string;
  type: 'virtue' | 'affliction';
  triggerRollMin: number;
  triggerRollMax: number;
  triggerTiming: 'hero-turn-start';
  effects: ResolveEffect[];
  description: string;
  sourceAccuracy: ResolveSourceAccuracy;
}

/** 精神事件类型（日志 / UI / 防重复 / E2E 断言）。 */
export type MentalEventType =
  | 'stress-gained'
  | 'stress-recovered'
  | 'resolve-test'
  | 'virtue-gained'
  | 'affliction-gained'
  | 'resolve-effect-triggered'
  | 'resolve-effect-missed'
  | 'heart-attack'
  | 'resolve-converted-to-quirk'
  | 'quirk-gained'
  | 'quirk-removed'
  | 'quirk-reaction'
  | 'madness-death';

/** 精神事件来源。 */
export type MentalEventSourceType =
  | 'battle-skill'
  | 'critical'
  | 'exploration'
  | 'scout'
  | 'light'
  | 'curio'
  | 'hamlet-event'
  | 'resolve-effect'
  | 'quirk'
  /** Phase 8C：Trinket 主动效果（玩家在使用窗口声明后产生）。 */
  | 'trinket'
  | 'debug'
  | 'migration';

/** 精神事件。 */
export interface MentalEvent {
  id: string;
  questId: string;
  heroId: string;
  type: MentalEventType;
  sourceType: MentalEventSourceType;
  sourceId?: string;
  amount?: number;
  roll?: number;
  resultId?: string;
  createdAt: string;
  sequence: number;
}

/** Quest 结束 Resolve 状态转换为 Quirk 的记录（幂等键 = questId+heroId+sourceResolveId）。 */
export interface ResolveConversionRecord {
  id: string;
  questId: string;
  heroId: string;
  from: 'virtue' | 'affliction';
  sourceResolveId: string;
  grantedQuirkId: string;
  convertedAt: string;
}

// ---------------------------------------------------------------------------
// Phase 8A：通用 Rule Event 与 Quirk 被动效果引擎
// ---------------------------------------------------------------------------

/** 通用游戏规则事件类型。
 * - 数值型事件（modifier 可调整 amount）：stress-applied / stress-recovered /
 *   damage-taken / damage-output / healing-received / resolve-test（调整 Virtue 阈值）。
 * - 时机型事件（reaction 触发追加效果）：battle-started / scout-attempted /
 *   room-entered / hamlet-arrived / quest-completed。
 */
export type RuleEventType =
  | 'stress-applied'
  | 'stress-recovered'
  | 'damage-taken'
  | 'damage-output'
  | 'healing-received'
  | 'resolve-test'
  | 'battle-started'
  | 'scout-attempted'
  | 'room-entered'
  | 'hamlet-arrived'
  | 'quest-completed'
  // ---- Phase 8B：Disease 触发时机（与 Quirk 共用同一套事件与被动引擎） ----
  /** Disease 首次感染完成后。 */
  | 'disease-acquired'
  /** Disease 被替换（旧 → 新）完成后。 */
  | 'disease-replaced'
  /** Exploration 中一次 Rubble 结算完成后（Creeping Cough）。 */
  | 'rubble-resolved'
  /** Exploration 中一次 Hunger 结算完成后（Tapeworm）。 */
  | 'hunger-resolved'
  /** 英雄主动 Move Action 完成后（Lethargy）。 */
  | 'hero-move-action-resolved'
  /** 英雄被 Push / Pull 且实际位移 > 0（Vertigo）。 */
  | 'hero-shuffled'
  /** 英雄主动消耗 1 份 Food 后（Bulimic）。 */
  | 'food-consumed'
  /** Bleed 即将施加到英雄（前置：Hemophilia 追加独立 Bleed）。 */
  | 'bleed-before-apply'
  /** Blight 即将施加到英雄（前置：Black Plague 追加独立 Blight）。 */
  | 'blight-before-apply'
  /** 英雄实际受到 > 0 的伤害后（Spotted Fever / Syphilis）。 */
  | 'damage-resolved'
  /** 英雄实际受到 > 0 的压力并完成阈值结算后（The Worries 追加 Wounds）。 */
  | 'stress-resolved';

/** 受伤事件的伤害来源（供 modifier 条件过滤）。 */
export type RuleDamageSource =
  | 'attack'
  | 'bleed'
  | 'blight'
  | 'periodic-batch'
  | 'trap'
  | 'exploration'
  /** Phase 8C：Trinket Active Effect 自伤（damage-self）。 */
  | 'trinket';

/** Rule Event 上下文：贯穿一个根事件的整条派生链，用于循环保护。
 * - rootEventId：根事件 id。
 * - depth：派生深度（>= MAX_RULE_EVENT_DEPTH 时静默丢弃）。
 * - triggeredPassiveKeys：本根事件内已触发过 reaction 的被动唯一键
 *   （Phase 8B 起为 `rootEventId|heroId|sourceType|instanceId|triggerType`）。
 */
export interface RuleEventContext {
  rootEventId: string;
  depth: number;
  triggeredPassiveKeys: string[];
}

/** 通用规则事件。所有 Quirk 被动均针对该结构声明，不写散落的 if/else。 */
export interface RuleEvent {
  id: string;
  type: RuleEventType;
  /** 受影响英雄 instanceId。 */
  heroId: string;
  /** 数值型事件的基础数值（时机型事件为 0）。 */
  amount: number;
  /** damage-taken / damage-output 事件的伤害来源。 */
  damageSource?: RuleDamageSource;
  questId?: string;
  sourceId?: string;
  context: RuleEventContext;
}

/** Quirk modifier 触发条件（全部可选，同时声明的条件需全部满足）。 */
export interface QuirkCondition {
  /** 当前光照 >= minLight。 */
  minLight?: number;
  /** 当前光照 <= maxLight。 */
  maxLight?: number;
  /** 伤害来源限定（仅 damage-taken / damage-output 事件有效）。 */
  damageSourceIn?: RuleDamageSource[];
}

/** 前置修正器：只调整事件数值，禁止派生新事件。 */
export interface QuirkModifier {
  eventType: RuleEventType;
  condition?: QuirkCondition;
  /** 数值加减（damage/stress/healing 的 amount 或 resolve-test 的 Virtue 阈值偏移）。 */
  flatDelta: number;
}

/** 后置反应效果（由引擎路由到统一管线执行，禁止直接改业务字段）。 */
export type QuirkReactionEffect =
  | { type: 'stress-self'; amount: number }
  | { type: 'stress-recover-self'; amount: number }
  | { type: 'stress-allies'; amount: number }
  | { type: 'damage-self'; amount: number }
  | { type: 'heal-self'; amount: number }
  | { type: 'consume-provision'; provision: keyof ProvisionPool; amount: number }
  | { type: 'gain-gold'; amount: number }
  | { type: 'lose-gold'; amount: number }
  | { type: 'log-only'; message: string }
  // ---- Phase 8B：通用扩展（Quirk / Disease / 未来 Trinket 共用） ----
  /** 对自身施加独立的 Bleed / Blight（potency 层 / duration 回合）。 */
  | { type: 'condition-self'; condition: 'bleed' | 'blight'; potency: number; duration: number }
  /** 对自身造成按英雄等级缩放的伤害（amount = multiplier × heroLevel）。 */
  | { type: 'damage-self-scaled'; scaling: 'hero-level'; multiplier: number };

/** 后置反应：事件结算后触发追加效果（可派生新事件，受循环保护约束）。 */
export interface QuirkReaction {
  eventType: RuleEventType;
  condition?: QuirkCondition;
  /** d10 <= chanceD10 时触发；省略 = 必定触发。使用可注入 RNG。 */
  chanceD10?: number;
  effects: QuirkReactionEffect[];
}

/** Quirk 定义（Phase 8A 起为真实被动效果承载体）。 */
export interface QuirkDefinition {
  id: string;
  name: string;
  polarity: 'positive' | 'negative';
  description: string;
  /** 静态属性修正（进入战斗时计算，如速度）。 */
  statModifiers?: { speed?: number };
  /** 前置修正器列表。 */
  modifiers?: QuirkModifier[];
  /** 后置反应列表。 */
  reactions?: QuirkReaction[];
}

/** Quirk 获取结果。 */
export type AcquireQuirkOutcome =
  | 'added'
  | 'duplicate'
  | 'decision-pending'
  | 'discarded'
  | 'madness-death';

/** 待玩家决策的 Quirk 获取事件（上限 3 时的替换/放弃选择）。 */
export interface PendingQuirkDecision {
  id: string;
  heroId: string;
  heroName: string;
  incomingQuirkId: string;
  polarity: 'positive' | 'negative';
  /** 可被替换移除的既有 Quirk id（Positive 进入：既有 Positive；Negative 进入：既有 Positive）。 */
  replaceableQuirkIds: string[];
  /** 是否允许直接放弃新 Quirk（Positive 进入允许；Negative 进入不允许）。 */
  canDiscardIncoming: boolean;
  source: 'resolve-conversion' | 'debug' | 'disease-replacement';
  createdAt: string;
  resolved: boolean;
}

// ---------------------------------------------------------------------------
// Phase 8B：Disease 与 Sanitarium
// ---------------------------------------------------------------------------

/** 通用前置修正器定义（Quirk / Disease / 未来 Trinket 共用同一结构）。 */
export type PassiveModifierDefinition = QuirkModifier;

/** 通用后置反应定义（Quirk / Disease / 未来 Trinket 共用同一结构）。 */
export type PassiveReactionDefinition = QuirkReaction;

/**
 * 被动来源类型（决定同优先级时的稳定排序）。
 * Phase 9A §6.4：Imminent Threat 作为通用被动来源接入，不得在组件里做 id 分支。
 */
export type PassiveSourceType =
  | 'quirk'
  | 'disease'
  | 'trinket'
  | 'room'
  | 'boss'
  | 'boss-threat';

/** 一条已解析的被动来源（Passive Collector 输出）。 */
export interface PassiveSource {
  sourceType: PassiveSourceType;
  /** 实例 id：Quirk 用 quirkId，Disease 用 HeroDiseaseState.instanceId。 */
  instanceId: string;
  /** 定义 id：quirkId / diseaseId。 */
  definitionId: string;
  priority: number;
  ownerHeroId: string;
  modifiers: PassiveModifierDefinition[];
  reactions: PassiveReactionDefinition[];
  /** 展示名（日志用）。 */
  name: string;
}

/** Disease 定义（数据驱动，效果全部由通用被动引擎执行）。 */
export interface DiseaseDefinition {
  id: string;
  name: string;
  description: string;
  /** 声明该 Disease 关注的事件（文档/调试用；实际匹配以 modifiers/reactions 为准）。 */
  triggerTypes: RuleEventType[];
  /** 排序优先级（数值小者先执行）。 */
  priority: number;
  modifiers: PassiveModifierDefinition[];
  reactions: PassiveReactionDefinition[];
  rulesPage: 27 | 28;
}

/** Disease 获取来源。 */
export type DiseaseSourceKind =
  | 'curio'
  | 'monster-skill'
  | 'room'
  | 'exploration-event'
  | 'hamlet-event'
  | 'debug'
  | 'migration';

/** 英雄身上的 Disease 实例状态。 */
export interface HeroDiseaseState {
  instanceId: string;
  diseaseId: string;
  acquiredQuestId: string | null;
  acquiredAt: string;
  source: DiseaseSourceKind;
  sourceEventId: string;
}

/** Disease 获取结果分类。 */
export type DiseaseAcquisitionOutcome =
  | 'added'
  | 'duplicate-discarded'
  | 'replaced'
  | 'replaced-quirk-decision-pending'
  | 'replaced-hero-died'
  | 'discarded-dead-hero'
  | 'discarded-invalid';

/** Disease 获取记录（永久保存，用于 UI / 幂等 / 回归验证）。 */
export interface DiseaseAcquisitionRecord {
  id: string;
  heroId: string;
  heroName: string;
  questId: string | null;
  incomingDiseaseId: string;
  removedDiseaseId?: string;
  negativeQuirkId?: string;
  pendingQuirkDecisionId?: string;
  deathRecordId?: string;
  outcome: DiseaseAcquisitionOutcome;
  sourceEventId: string;
  createdAt: string;
}

/** Disease 替换事务（跨刷新恢复：防止重复抽 Negative Quirk）。 */
export interface PendingDiseaseTransaction {
  transactionId: string;
  heroId: string;
  incomingDiseaseId: string;
  previousDiseaseId: string | null;
  negativeQuirkId?: string;
  status: 'disease-written' | 'quirk-processing' | 'decision-pending' | 'completed' | 'hero-died';
}

/** Sanitarium 服务项。 */
export interface SanitariumService {
  id: 'heal-small' | 'heal-large' | 'remove-disease';
  name: string;
  goldCost: number;
  effect: { type: 'heal'; amount: number } | { type: 'remove-disease' };
}

/** Sanitarium 治疗记录（含幂等键）。 */
export interface DiseaseTreatmentRecord {
  id: string;
  heroId: string;
  heroName: string;
  diseaseInstanceId: string;
  diseaseId: string;
  hamletVisitId: string;
  hamletDay: number;
  goldCost: 2;
  treatedAt: string;
  /** hamletVisitId + day + heroId + sanitarium-remove-disease。 */
  idempotencyKey: string;
}

/** Resolve Test 结果。 */
export interface ResolveTestResult {
  heroId: string;
  questId: string;
  roll: number;
  outcome: 'virtue' | 'affliction';
  virtueThreshold: number;
  cardId: string;
  resolveState: ResolveState;
}

/** 统一 Stress 应用结果。 */
export interface ApplyStressResult {
  heroId: string;
  previousStress: number;
  appliedAmount: number;
  currentStress: number;
  thresholdReached: boolean;
  resolveTest?: ResolveTestResult;
  heartAttack?: HeartAttackResult;
  mentalEvents: MentalEvent[];
}

/** Heart Attack 结果（复用 Phase 6 死亡记录）。 */
export interface HeartAttackResult {
  heroId: string;
  questId: string;
  battleId?: string;
  deathRecordId?: string;
  heartAttackCount: number;
}

/** 统一 Stress 应用输入。 */
export interface ApplyStressInput {
  heroId: string;
  amount: number;
  sourceType: MentalEventSourceType;
  sourceId?: string;
  questId: string;
  battleId?: string;
  batchId?: string;
  /**
   * Phase 8B：规则事件上下文。
   * 传入时，本次加压产生的 stress-resolved 后置事件会并入同一根事件
   * （共享循环保护与深度计数）；不传则自建根上下文。
   */
  ctx?: RuleEventContext;
}

/** 统一 Stress 恢复输入。 */
export interface RecoverStressInput {
  heroId: string;
  amount: number;
  sourceType: MentalEventSourceType;
  sourceId?: string;
  questId: string;
}
