// 核心类型定义 —— 对应开发文档第 7 节。
// Phase 1 仅使用其中的部分字段（CampaignState / gamePhase / 存档结构），
// 其余字段为后续阶段预留，类型在此统一声明以保证全工程一致。

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
}

/** Hamlet（村庄）状态。 */
export interface HamletState {
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
      xpCost: 4;
    }
  | {
      id: string;
      type: 'skill-level';
      skillId: string;
      fromLevel: 1 | 2;
      toLevel: 2 | 3;
      xpCost: 2;
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
    | 'exploration';
  sourceActorId?: string;
  sourceSkillId?: string;
  eventId: string;
  batchId?: string;
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
  objective: string;
  reward: string;
  difficulty: 'easy' | 'normal' | 'hard';
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
  | 'rubble';

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
