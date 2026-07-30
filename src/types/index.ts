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
  /** 已获得 Positive Quirk id 列表（Phase 7 为 placeholder，不执行被动效果）。 */
  positiveQuirkIds: string[];
  /** 已获得 Negative Quirk id 列表（Phase 7 为 placeholder，不执行被动效果）。 */
  negativeQuirkIds: string[];
  /** 最近一次 Resolve Test 所在 Quest id（防重复 / 刷新恢复）。 */
  lastResolveQuestId: string | null;
  /** 最近一次精神事件 id（防重复执行 / 调试）。 */
  lastMentalEventId: string | null;
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
  | 'heart-attack'
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
  // ---- Phase 7 ----
  /** 精神事件队列（日志 / UI 展示 / E2E 断言；保留最近 200 条）。 */
  mentalEvents: MentalEvent[];
  /** Quest 结束 Resolve → Quirk 转换记录（幂等保护，永久保存）。 */
  resolveConversionRecords: ResolveConversionRecord[];
  /** 已处理的 Stress 阈值批次 id（防同一批次重复 Resolve Test / Heart Attack）。 */
  processedStressBatchIds: string[];
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
  | 'resolve-converted-to-quirk';

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

/** Placeholder Quirk（Phase 7 仅建立数据，不执行被动效果，留待 Phase 8）。 */
export interface QuirkDefinition {
  id: string;
  name: string;
  polarity: 'positive' | 'negative';
  description: string;
  /** Phase 7 标记：被动效果将在成长系统启用。 */
  inactiveUntilPhase8: true;
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
}

/** 统一 Stress 恢复输入。 */
export interface RecoverStressInput {
  heroId: string;
  amount: number;
  sourceType: MentalEventSourceType;
  sourceId?: string;
  questId: string;
}
