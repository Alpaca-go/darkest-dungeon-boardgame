// Phase 9A：Boss 通用战斗 / Imminent Threat / Face the Threat 框架类型。
//
// 设计要点（开发文档 §5-§20）：
// - Threat 是「通用被动来源」：效果全部以既有 PassiveModifier / PassiveReaction 声明，
//   经统一 Rule Event 引擎执行，禁止在组件里写 `if (threatId === 'xxx')`（§6.4）。
// - Boss 的多次行动通过「每次行动一张 Actor-specific Initiative Card」表达，
//   不允许在一次 Boss Turn 中连续结算多次（§12.2）。
// - Boss Battle 关闭四轮上限（roundLimitEnabled=false），普通战斗保持不变（§11.3）。
// - 所有 Boss / Threat 数据同样用 officialDataStatus + enabledInOfficialPool 双标记，
//   Prototype 数据一律不得进入正式池（§6.1 / §10.1 / §27）。
//
// 本文件只声明类型；运行时规则位于 game-engine/campaign|threats|bosses|dungeon 下。

import type {
  ActiveEffect,
  BattleSide,
  MonsterTargetRule,
  PassiveModifierDefinition,
  PassiveReactionDefinition,
  SkillTargetSide,
  StatusEffectType,
} from './index';
import type { DataCredibility, HeroResistanceProfile } from './progression';

// ---------------------------------------------------------------------------
// 基础枚举
// ---------------------------------------------------------------------------

/** 战役幕（Act I-III 为 Threat / Boss 循环，Act IV = Darkest Dungeon 已解锁）。 */
export type CampaignAct = 1 | 2 | 3 | 4;

/** 战役等级（Act I→I，II→II，III→III，IV→III；§5.2）。 */
export type CampaignLevel = 1 | 2 | 3;

/** Boss / Threat 数据可信度（与 Trinket / 成长系统共用同一套四态）。 */
export type BossOfficialDataStatus = DataCredibility;

/** Quest 类型（§8.1）。Phase 9A 只实现 standard 与 face-the-threat。 */
export type QuestType =
  | 'standard'
  | 'face-the-threat'
  | 'darkest-dungeon'
  | 'final-boss'
  | 'prototype';

// ---------------------------------------------------------------------------
// §5.1 Campaign Progress
// ---------------------------------------------------------------------------

/** 战役进度（Act / Level / Threat / Standard Quest 计数 / Boss 锁）。 */
export interface CampaignProgressState {
  act: CampaignAct;
  campaignLevel: CampaignLevel;

  activeThreatId: string | null;
  activeBossDefinitionId: string | null;
  activeBossFamilyId: string | null;

  /** 本 Act 已完成并已结算返回 Hamlet 的 Standard Quest 数量（§5.3）。 */
  completedStandardQuestsThisAct: number;
  /** 触发 Boss Quest 锁定所需的 Standard Quest 数量（固定 2）。 */
  requiredStandardQuestsBeforeBoss: 2;

  bossQuestUnlocked: boolean;
  bossQuestRequired: boolean;
  bossQuestCompletedThisAct: boolean;

  defeatedThreatIds: string[];
  defeatedBossFamilyIds: string[];

  darkestDungeonUnlocked: boolean;

  currentActStartedAt: string;
  lastCampaignAdvanceTransactionId: string | null;

  /**
   * §20.4：旧存档迁移后不自动抽正式 Threat，改为标记待初始化，
   * 进入战役后由明确事务抽取一次并保存。
   */
  pendingThreatInitialization: boolean;
  /** 已执行过的 Act 开始事务 id（幂等，避免重复抽 Threat）。 */
  actStartTransactionIds: string[];
}

// ---------------------------------------------------------------------------
// §6.1 Imminent Threat
// ---------------------------------------------------------------------------

/** Threat 效果的作用对象（在数据里声明，避免在引擎里写死目标选择）。 */
export type ThreatEffectTarget = 'all-heroes' | 'lead-hero';

/** Threat 前置修正器：在通用 PassiveModifier 基础上补充作用域与消耗控制。 */
export interface ThreatModifierDefinition extends PassiveModifierDefinition {
  /** 稳定 key（一次性效果的消耗记录 / 日志用，必须在同一 Threat 内唯一）。 */
  key: string;
  /** 作用对象（默认 all-heroes）。 */
  appliesTo?: ThreatEffectTarget;
  /** 每次 Hamlet 访问只生效一次（消耗记录写入 ActiveThreatRuntime）。 */
  oncePerHamletVisit?: boolean;
}

/** Threat 后置反应：在通用 PassiveReaction 基础上补充作用域与消耗控制。 */
export interface ThreatReactionDefinition extends PassiveReactionDefinition {
  key: string;
  appliesTo?: ThreatEffectTarget;
  oncePerHamletVisit?: boolean;
}

/** 一组 Threat 效果（Hamlet 侧或 Dungeon 侧）。 */
export interface ThreatEffectSet {
  modifiers: ThreatModifierDefinition[];
  reactions: ThreatReactionDefinition[];
}

/** Imminent Threat 定义（§6.1）。 */
export interface BossThreatDefinition {
  id: string;

  bossFamilyId: string;
  bossDefinitionId: string;

  campaignLevel: CampaignLevel;

  name: string;
  description: string;

  /** Hamlet 阶段生效的效果。 */
  hamletEffects: ThreatEffectSet;
  /** 地牢阶段生效的效果（Standard Quest 与 Face the Threat 均生效）。 */
  dungeonEffects: ThreatEffectSet;

  officialDataStatus: BossOfficialDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;

  /** 被动排序优先级（默认 30，晚于 Quirk 20 / Disease 自带优先级）。 */
  priority?: number;
}

/** Threat 运行时（抽取结果与生效状态，落盘）。 */
export interface ActiveThreatRuntime {
  threatId: string;
  bossFamilyId: string;
  bossDefinitionId: string;
  campaignLevel: CampaignLevel;

  /** 抽取事务 id（幂等键）。 */
  drawTransactionId: string;
  drawnAt: string;

  /** 是否仍在生效；进入 Boss Objective Room 后置 false（§6.5）。 */
  active: boolean;
  deactivatedAt: string | null;
  deactivationTransactionId: string | null;

  /**
   * 已消耗的「每次 Hamlet 只生效一次」效果键，元素形如 `${visitId}:${effectKey}`。
   * 换一次 Hamlet 访问即换 visitId，天然重置。
   */
  consumedOnceKeys: string[];
}

// ---------------------------------------------------------------------------
// §8 Face the Threat（Boss Quest）
// ---------------------------------------------------------------------------

/** Boss Quest 定义（§8.2）。 */
export interface BossQuestDefinition {
  id: 'face-the-threat';
  questType: 'face-the-threat';

  name: string;
  description: string;

  xpReward: 3;

  canRetreat: false;
  campaignFailureOnFailure: true;

  roomCount: number;
  firewood: number;

  useBossEdgeRoomPlacement: true;

  officialDataStatus: BossOfficialDataStatus;
  sourceReference?: string;
}

/** Boss Quest 状态机（§8.3）。 */
export type BossQuestStatus =
  | 'locked'
  | 'available'
  | 'generating'
  | 'active'
  | 'boss-room-entered'
  | 'battle-active'
  | 'victory'
  | 'failed';

/** Boss Quest 运行时状态（§8.3）。 */
export interface BossQuestState {
  id: string;

  threatId: string;
  bossDefinitionId: string;
  bossFamilyId: string;

  status: BossQuestStatus;

  canRetreat: false;
  campaignFailureOnFailure: true;

  objectiveRoomId: string | null;
  bossBattleId: string | null;

  startedAt?: string;
  completedAt?: string;

  lastTransactionId: string | null;
}

// ---------------------------------------------------------------------------
// §9 Boss Dungeon 生成
// ---------------------------------------------------------------------------

/** Boss 地牢生成记录（落盘；刷新不得重新随机，§9.3）。 */
export interface BossDungeonGenerationRecord {
  bossQuestId: string;
  questId: string;

  /** 只有一条通路的房间 id（已排除 Start Room）。 */
  edgeRoomIds: string[];
  /** 参与洗牌的候选房间 id（Objective Token + 普通 Token）。 */
  candidateRoomIds: string[];
  /** 真实 Objective Room（未揭示前 UI 不得暴露）。 */
  objectiveRoomId: string;

  revealed: boolean;
  revealTransactionId: string | null;

  transactionId: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// §10 BossDefinition
// ---------------------------------------------------------------------------

/** Boss 数值（§10.2；抗性沿用英雄同结构，免疫沿用状态效果枚举）。 */
export interface BossStats {
  maxHp: number;
  dodge: number;
  movement: number;
  /** 先攻用速度（本项目 Initiative 以随机洗牌为主，速度仅作展示/兼容）。 */
  speed: number;
  resistances: HeroResistanceProfile;
  immunities: StatusEffectType[];
  /** 占位数（大体型 Boss 预留，Phase 9A 不实现多格占位）。 */
  size?: number;
}

/** Boss 技能定义（结构对齐 MonsterSkillDefinition，额外区分召唤类）。 */
export interface BossSkillDefinition {
  id: string;
  bossId: string;
  name: string;
  /** attack = 普通攻击结算；summon = 触发 Summon 定义。 */
  kind: 'attack' | 'summon';

  usableFromPositions: number[];
  validTargetPositions: number[];
  targetSide: SkillTargetSide;

  accuracy: number;
  minDamage: number;
  maxDamage: number;
  stress?: number;
  applyEffects?: ActiveEffect[];

  /** kind === 'summon' 时引用的 BossSummonDefinition.id。 */
  summonDefinitionId?: string;

  description: string;
}

/** Boss 特殊规则（Phase 9A 只做数据登记 + 通用被动挂载点）。 */
export interface BossSpecialRuleDefinition {
  id: string;
  name: string;
  description: string;
  modifiers?: PassiveModifierDefinition[];
  reactions?: PassiveReactionDefinition[];
}

/** Boss 定义（§10.1）。 */
export interface BossDefinition {
  id: string;
  familyId: string;

  name: string;
  campaignLevel: CampaignLevel;

  /** 每轮行动次数 → 初始化时加入等量 Actor-specific Initiative Card（§12.2）。 */
  actionsPerRound: number;

  stats: BossStats;
  skills: BossSkillDefinition[];

  specialRules: BossSpecialRuleDefinition[];
  summonRules: BossSummonDefinition[];

  /** Boss 房间定义 id（占位，用于后续 Boss Room 卡面接入）。 */
  roomDefinitionId: string;

  /** 无可用策略时的兜底目标规则。 */
  targetRule: MonsterTargetRule;
  /** 占位美术色块。 */
  color: string;

  officialDataStatus: BossOfficialDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

// ---------------------------------------------------------------------------
// §13 Summon
// ---------------------------------------------------------------------------

/** 召唤落位策略（§13.1）。 */
export type SummonTargetPolicy =
  | 'frontmost-empty'
  | 'backmost-empty'
  | 'nearest-empty-to-boss'
  | 'specified-stances'
  | 'random-empty';

/** 召唤怪物等级策略。 */
export type SummonedMonsterLevelPolicy = 'campaign-level' | 'boss-level' | 'fixed';

/** Boss 召唤定义（§13.1）。 */
export interface BossSummonDefinition {
  id: string;

  monsterDefinitionId: string;

  targetPolicy: SummonTargetPolicy;
  /** targetPolicy === 'specified-stances' 时的合法站位（1..4）。 */
  allowedStances?: number[];

  addInitiativeCard: boolean;
  /** 该定义同时存活的召唤物上限。 */
  maxAlive?: number;

  summonedMonsterLevelPolicy: SummonedMonsterLevelPolicy;
  fixedLevel?: CampaignLevel;
}

/** 召唤失败原因。 */
export type SummonFailureReason =
  | 'boss-dead'
  | 'invalid-definition'
  | 'max-alive'
  | 'no-empty-stance'
  | 'duplicate';

/** 一次召唤的记录（幂等键 = sourceSkillEventId + summonDefinitionId + summonIndex）。 */
export interface BossSummonRecord {
  id: string;
  /** 幂等键。 */
  idempotencyKey: string;

  summonDefinitionId: string;
  sourceSkillEventId: string;
  summonIndex: number;

  monsterDefinitionId: string;
  /** 成功时创建的战斗单位 id。 */
  createdActorId: string | null;
  /** 成功且 addInitiativeCard 时插入的卡 id。 */
  initiativeCardId: string | null;
  /** 落位站位（1..4）。 */
  stance: number | null;

  round: number;
  succeeded: boolean;
  failureReason?: SummonFailureReason;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// §12 Actor-specific Initiative Card
// ---------------------------------------------------------------------------

/** Initiative 卡来源类型（§12.1）。 */
export type InitiativeCardSourceType = 'hero' | 'monster' | 'boss' | 'summoned-monster';

/** Initiative 卡（Phase 9A 起以卡驱动行动顺序；普通战斗保持既有顺序语义）。 */
export interface InitiativeCard {
  id: string;

  side: BattleSide;

  /** 绑定到具体单位（Boss / 召唤物 / 英雄）。 */
  actorId?: string;
  /** 绑定到一组单位（普通怪物按 Stance 组处理时使用）。 */
  actorGroupId?: string;

  sourceType: InitiativeCardSourceType;

  createdRound: number;
  /** false = 已失效（如 Boss 死亡后剩余的 Boss 卡）。 */
  active: boolean;
}

// ---------------------------------------------------------------------------
// §11 / §14 Boss Battle
// ---------------------------------------------------------------------------

/** Boss 行动选择（先保存再播放动画；刷新不重选，§14）。 */
export interface BossActionSelection {
  id: string;
  bossActorId: string;
  round: number;
  actionIndexThisRound: number;

  skillId: string;
  kind: 'attack' | 'summon';
  targetId: string | null;
  summonDefinitionId: string | null;

  selectedAt: string;
  executed: boolean;
}

/** Boss 战斗状态（挂在 BattleState.boss 上，§11.1）。 */
export interface BossBattleState {
  isBossBattle: true;

  bossActorId: string;
  bossDefinitionId: string;
  bossFamilyId: string;
  threatId: string;

  actionsPerRound: number;
  bossInitiativeCardIds: string[];

  roundLimitEnabled: false;
  currentRound: number;

  bossDefeated: boolean;
  victoryResolved: boolean;

  summonHistory: BossSummonRecord[];

  bossRevealTransactionId: string;
  bossVictoryTransactionId: string | null;

  /** 已选择但尚未执行 / 已执行的 Boss 行动（落盘，便于刷新恢复与调试）。 */
  actionSelections: BossActionSelection[];
}

// ---------------------------------------------------------------------------
// §18.4 Tier Runtime 与 Campaign Advance
// ---------------------------------------------------------------------------

/** 当前 Level 对应的内容 Tier（§18.4）。 */
export interface CampaignTierRuntime {
  questTier: CampaignLevel;
  dungeonTier: CampaignLevel;
  /** Level II Monster 是「加入」而非替换，因此是一个累积列表。 */
  monsterTiersEnabled: CampaignLevel[];
  dungeonTrinketDrawTier: CampaignLevel;
  /** Nomad Wagon 仍可提供低 Level Trinket。 */
  nomadWagonTrinketTiers: CampaignLevel[];
}

/** 一次战役推进的记录（§18，落盘用于幂等与调试）。 */
export interface CampaignAdvanceRecord {
  id: string;
  transactionId: string;

  fromAct: CampaignAct;
  toAct: CampaignAct;
  fromLevel: CampaignLevel;
  toLevel: CampaignLevel;

  defeatedThreatId: string;
  defeatedBossFamilyId: string;

  /** 新 Act 抽到的 Threat（第三个 Threat 后为 null）。 */
  newThreatId: string | null;
  darkestDungeonUnlocked: boolean;

  at: string;
}

// ---------------------------------------------------------------------------
// §14 Boss Turn 接口
// ---------------------------------------------------------------------------

/** Boss 行动上下文（§14；BattleActor 在本项目中即 BattleUnit）。 */
export interface BossTurnContext {
  battleId: string;
  bossActorId: string;
  currentRound: number;
  actionIndexThisRound: number;
}
