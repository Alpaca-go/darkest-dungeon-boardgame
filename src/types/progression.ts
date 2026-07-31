// ---------------------------------------------------------------------------
// Phase 8D：Quest XP / Hero Level / Skill Level / Guild 成长系统类型
// 所有类型均可序列化（存档 v7）。规则逻辑集中在 src/game-engine/progression/。
// ---------------------------------------------------------------------------

/** 卡面数据可信度。formal 模式只允许 verified。 */
export type DataCredibility = 'verified' | 'partial' | 'prototype' | 'unavailable';

/** 数据模式：formal 只接受 verified；prototype 允许占位数值。 */
export type DataMode = 'formal' | 'prototype';

export type HeroLevel = 1 | 2 | 3;
export type SkillLevel = 1 | 2 | 3;

/**
 * 英雄 XP 账本（唯一权威 XP 数据源）。
 * 不变量：currentXp === lifetimeXpEarned - lifetimeXpSpent，且三者均 >= 0。
 * 只允许 game-engine/progression/xp-ledger.ts 修改，组件与页面禁止直接写。
 */
export interface HeroXpState {
  /** 当前可用 XP。 */
  currentXp: number;
  /** 累计获得 XP（只增不减）。 */
  lifetimeXpEarned: number;
  /** 累计消耗 XP（只增不减）。 */
  lifetimeXpSpent: number;
}

/** 英雄抗性档案（Hero Level 提升时整体替换）。 */
export interface HeroResistanceProfile {
  stun: number;
  blight: number;
  bleed: number;
  disease: number;
  debuff: number;
  move: number;
}

/**
 * Hero Level 卡面定义（Registry 唯一数据来源）。
 * Skill Slot / Trinket Slot 由该定义派生，禁止持久化到 HeroInstance。
 */
export interface HeroLevelDefinition {
  heroClassId: string;
  level: HeroLevel;
  maxHp: number;
  speed: number;
  /** 可装备技能数量（由等级派生，不落盘）。 */
  skillSlots: number;
  /** 可携带饰品数量（由等级派生，不落盘）。 */
  trinketSlots: number;
  resistances: HeroResistanceProfile;
  /** 免疫的状态列表（如 'bleed' / 'blight' / 'stun'）。 */
  immunities: string[];
  credibility: DataCredibility;
  /** 数据出处说明（便于后续替换为 verified 卡面）。 */
  sourceNote: string;
}

/** Skill Level 卡面定义（Registry 唯一数据来源）。 */
export interface SkillLevelDefinition {
  skillId: string;
  heroClassId: string;
  level: SkillLevel;
  damageBonus: number;
  healBonus: number;
  accuracyBonus: number;
  stressHealBonus: number;
  credibility: DataCredibility;
  sourceNote: string;
}

/** Registry 校验结果（缺失定义不得白屏，只降级 + 报告）。 */
export interface RegistryValidationIssue {
  kind: 'missing-level' | 'non-monotonic' | 'unverified' | 'unknown-owner';
  targetId: string;
  level?: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Quest Objective 与 XP
// ---------------------------------------------------------------------------

/**
 * Objective 判定类型（开发文档 §9.1 的类型集合）。
 * 全部可由 CampaignState 推导，不引入新的运行时状态；
 * 'custom' 无内建判定器，永远评估为未完成（不编造进度）。
 */
export type QuestObjectiveType =
  | 'clear-room-count'
  | 'complete-objective-room'
  | 'defeat-monsters'
  | 'collect-gold'
  | 'interact-curio'
  | 'survive'
  | 'custom';

/** Quest 卡面上的 Objective 定义（每个 Quest 最多 3 条，开发文档 §9.1）。 */
export interface QuestObjectiveDefinition {
  id: string;
  description: string;
  type: QuestObjectiveType;
  /** 达标阈值（省略时按 1 处理）。 */
  target?: number;
  /** 是否为任务必要目标（false = 可选加分目标）。 */
  required: boolean;
}

/** Objective 完成进度快照（开发文档 §9.2；结算与 UI 共用）。 */
export interface QuestObjectiveProgress {
  objectiveId: string;
  description: string;
  type: QuestObjectiveType;
  current: number;
  target: number;
  required: boolean;
  completed: boolean;
  completedAt?: string;
}

/** Quest XP 策略（data-driven，禁止组件内硬编码）。 */
export interface QuestXpPolicy {
  /** 单次任务上限 XP（3）。 */
  maxXpPerQuest: number;
  /** 每完成 1 个 Objective 的 XP（1）。 */
  xpPerObjective: number;
}

/**
 * 一次任务的 XP 结算结果。
 * 在 quest-result 阶段生成（distributed=false），回到 Hamlet 时一次性发放。
 */
export interface QuestXpResult {
  id: string;
  questId: string;
  questName: string;
  objectives: QuestObjectiveProgress[];
  completedObjectiveIds: string[];
  completedObjectiveCount: number;
  /** 每名合格英雄获得的 XP（0-3；全队相同）。 */
  xpPerHero: number;
  /** Stagecoach 获得的 XP（与 xpPerHero 相同，不是队伍总和）。 */
  stagecoachXp: number;
  /** 发放时的合格英雄 instanceId 列表。 */
  eligibleHeroIds: string[];
  distributed: boolean;
  distributedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 升级事务（Guild / Replacement 共用核心）
// ---------------------------------------------------------------------------

export type ProgressionUpgradeType = 'hero-level' | 'skill-level';

/** 支付模式：Guild 需要 XP + Gold；Replacement 免 Gold 但仍消耗个人 XP。 */
export type ProgressionPaymentMode = 'xp-and-gold' | 'xp-only';

export type ProgressionSource = 'guild' | 'replacement';

/** 一次待提交的升级选择（未提交前不修改任何英雄数据）。 */
export interface ProgressionUpgradeChoice {
  id: string;
  type: ProgressionUpgradeType;
  heroInstanceId: string;
  /** type==='skill-level' 时为技能 id，否则 null。 */
  skillId: string | null;
  fromLevel: 1 | 2;
  toLevel: 2 | 3;
  xpCost: number;
  goldCost: number;
}

/** Guild 一次访问会话：最多 2 次升级，Commit 前不落地任何变更。 */
export interface GuildVisitSession {
  id: string;
  /** 关联 hamlet.visitId + day，刷新后可判断是否仍属同一次访问。 */
  visitId: string;
  day: number;
  heroInstanceId: string;
  choices: ProgressionUpgradeChoice[];
  maxUpgrades: number;
  committed: boolean;
  createdAt: string;
}

/** Replacement 升级会话（结构与 Guild 一致，支付模式不同）。 */
export interface ReplacementUpgradeSession {
  id: string;
  slotId: string;
  heroInstanceId: string;
  choices: ProgressionUpgradeChoice[];
  maxUpgrades: number;
  committed: boolean;
  createdAt: string;
}

/** 已提交的升级事务记录（永久保存，作为 Hero 成长履历）。 */
export interface ProgressionTransactionRecord {
  id: string;
  at: string;
  sessionId: string;
  source: ProgressionSource;
  heroInstanceId: string;
  heroName: string;
  type: ProgressionUpgradeType;
  skillId: string | null;
  fromLevel: number;
  toLevel: number;
  xpSpent: number;
  goldSpent: number;
}

/** Guild 升级成本表。 */
export interface GuildUpgradeCostTable {
  heroLevel: { xp: number; gold: number };
  skillLevel: { xp: number; gold: number };
}

/**
 * Blacksmith 临时 Skill Form 覆盖：
 * 只影响下一次任务的战斗结算，不改变永久 Skill Level。
 */
export interface TemporarySkillFormOverride {
  id: string;
  heroInstanceId: string;
  skillId: string;
  /** 临时表现等级（与永久等级取 max 作为有效等级）。 */
  formLevel: 2 | 3;
  grantedVisitId: string;
  grantedAt: string;
  /** 任务结束后置 true 并在下一次进入 Hamlet 时清理。 */
  consumed: boolean;
}

/** 升级校验结果（UI 直接展示 reason，不自行判断规则）。 */
export interface ProgressionUpgradeValidation {
  ok: boolean;
  reason: string | null;
  type: ProgressionUpgradeType;
  skillId: string | null;
  fromLevel: 1 | 2 | 3;
  toLevel: 1 | 2 | 3;
  xpCost: number;
  goldCost: number;
}
