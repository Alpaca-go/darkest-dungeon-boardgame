// Phase 10E：四个 Final Form 的**专属机制**类型契约。
//
// 与 Phase 10A 的分工（硬约束 1：不新建第二套 Battle / Final Encounter 状态机）：
// - `final-encounter.ts`（10A）负责「容器」：Form 顺序 / 切换 / 胜负 / Provision；
// - 本文件（10E）只负责「每个 Form 自己的附加运行时」，挂在 ActFourState 下，
//   与 templars / mammoth-cyst / shuffling-horror 三个 Boss 域完全同构。
//
// 硬约束对照：
// - 3.  所有 Form 共用同一 Room → 本文件不含任何 roomId 字段，一律读 FinalEncounterState；
// - 7.  Ancestor 1st 固定 4 张 Initiative → initiativeCardCount 字面量 4；
// - 8.  Reflection 死亡不减少 Initiative Card → 同上，字面量锁死；
// - 10. Imperfect 死亡只触发一次 10 Wounds → imperfectDeathReactionApplied 布尔闸门；
// - 11. Time Heals All / Fill 必须 Definition 驱动 → AncestorStanceResolution 只记录
//       「决策 + 是否被数据缺口阻断」，绝不内联效果数值；
// - 12. Absolute Nothingness 非 BattleActor 但占 Area Space →
//       AbsoluteNothingnessState 不是 BattleUnit，targetable/occupiesAreaSpace 字面量锁死；
// - 14. Roll 10 不传送 → AncestorTeleportRecord.resultStance 可为 null；
// - 16. 召唤与 Initiative 原子 → SispersionSummonRecord 同时记录两者，单事务写入；
// - 17. Gestating Reaction 只在实际造成 Wounds 时触发 → WoundedReactionRecord.woundsApplied > 0；
// - 18/19/20. Forecast 生命周期 → ImpendingDoomForecast 带 consumed 闸门，禁止重掷；
// - 21. Come Unto Your Maker 缺失不得实现 → comeUntoYourMakerEnabled 字面量 false。

import type { Stance } from './index';
import type { DataCredibility } from './progression';
import type { FinalFormId } from './final-encounter';

/** Final Form 机制数据可信度（与项目统一四态一致）。 */
export type FinalFormDataStatus = DataCredibility;

/**
 * Reflection / Absolute Nothingness 可占据的三个非 aggressive Stance。
 * aggressive 恒为 Ancestor 本体所在位置，因此被 Exclude 排除。
 */
export type NonAggressiveStance = Exclude<Stance, 'aggressive'>;

/** 三个非 aggressive Stance 的固定顺序（随机分配 / 补位遍历时的稳定基准）。 */
export const NON_AGGRESSIVE_STANCES: NonAggressiveStance[] = ['defensive', 'ranged', 'support'];

// ---------------------------------------------------------------------------
// Ancestor 1st Form —— Reflections / GUARD / Imperfect Reaction / Time Heals All
// ---------------------------------------------------------------------------

/** Reflection 的两种类型。 */
export type ReflectionKind = 'perfect' | 'imperfect';

/** 单个 Reflection 的运行时状态。 */
export interface ReflectionActorState {
  id: string;
  kind: ReflectionKind;
  /** 所占 Stance（只可能是 defensive / ranged / support）。 */
  stance: NonAggressiveStance;
  /**
   * 存活标记。
   * ⚠️ 命名对齐 Phase 10D 的教训：本结构用 `alive`，BattleUnit 才用 `isAlive`，
   * 两者不可互换（10D 曾因写错导致死亡不生效的生产 bug）。
   */
  alive: boolean;
  wounds: number;
  /** 卡面 HP；官方数据缺失 → null（驱动 Data Gate）。 */
  maxWounds: number | null;
  /** 第几批（Fill 补位后 +1，便于审计）。 */
  generation: number;
  diedAt: string | null;
}

/** Reflection Stance 结算（全满 → Time Heals All；有空位 → Fill）。 */
export interface AncestorStanceResolution {
  transactionId: string;
  /** 三个 Reflection Stance 是否全部有存活 Reflection。 */
  allStancesOccupied: boolean;
  /** Definition 驱动的结论（硬约束 11）。 */
  outcome: 'time-heals-all' | 'fill-reflection-stances';
  vacantStances: NonAggressiveStance[];
  /** 实际补上的 Stance（数据缺失时为空数组）。 */
  filledStances: NonAggressiveStance[];
  /** 被数据缺口阻断的原因；null 表示正常执行。 */
  blockedReason: string | null;
  at: string;
}

/** Imperfect Reflection 死亡反应记录（硬约束 10：整场只允许一次）。 */
export interface ImperfectDeathReactionRecord {
  transactionId: string;
  reflectionId: string;
  /** 对 Ancestor 造成的 Wounds（Definition 驱动，默认 10）。 */
  woundsDealtToAncestor: number;
  at: string;
}

export interface AncestorFirstFormRuntime {
  kind: 'ancestor-first-form';

  /** 硬约束 7 / 8：固定 4 张，Reflection 死亡也不减少。 */
  initiativeCardCount: 4;
  /** Initiative 分配策略（Definition 驱动）。 */
  allocationPolicy: string;
  /** 硬约束 9：Reflection 存活时 Ancestor 不可被 Target。 */
  guardPolicy: string;

  reflections: ReflectionActorState[];

  /** 硬约束 10：只允许触发一次。 */
  imperfectDeathReactionApplied: boolean;
  imperfectDeathReaction: ImperfectDeathReactionRecord | null;

  /** Definition 上的 Skill / Resolver ID（效果数值缺失 → 运行时被阻断）。 */
  fullStanceSkillId: string;
  vacantStanceResolverId: string;

  lastStanceResolution: AncestorStanceResolution | null;
  stanceResolutionHistory: AncestorStanceResolution[];
}

// ---------------------------------------------------------------------------
// Ancestor 2nd Form —— Absolute Nothingness / Teleportation
// ---------------------------------------------------------------------------

/**
 * Absolute Nothingness（硬约束 12）。
 * **不是** BattleActor：不进 battle.monsters、不进 Initiative、不可被 Target，
 * 但占据 Area Space（影响 Hero 站位与召唤空位判定）。
 */
export interface AbsoluteNothingnessState {
  id: string;
  linkedStance: NonAggressiveStance;
  /** 所占 Area；官方 Room 缺失 → 空串（驱动 Data Gate）。 */
  areaId: string;
  targetable: false;
  occupiesAreaSpace: true;
}

/** 每次 Action 结束后的传送掷骰（硬约束 13 / 14）。 */
export interface AncestorTeleportRecord {
  transactionId: string;
  /** d10 结果（1—10），先保存后展示，刷新不重掷。 */
  roll: number;
  /** 传送目标 Stance；roll = 10 时为 null（不传送）。 */
  resultStance: Stance | null;
  teleported: boolean;
  fromAreaId: string;
  toAreaId: string | null;
  /** 因 Area 容量 / 数据缺口未能传送时的原因。 */
  blockedReason: string | null;
  at: string;
}

export interface AncestorSecondFormRuntime {
  kind: 'ancestor-second-form';

  initiativeCardCount: 2;

  /** 恰好 3 张（manifest 中唯一 verified 的条目）。 */
  nothingness: AbsoluteNothingnessState[];

  /** Ancestor 本体当前所在 Area。 */
  currentAreaId: string;
  currentStance: Stance;

  lastTeleport: AncestorTeleportRecord | null;
  teleportHistory: AncestorTeleportRecord[];

  /** 容量策略（Definition 驱动，硬约束 12）。 */
  capacityPolicy: string;
}

// ---------------------------------------------------------------------------
// Gestating Heart —— Sispersion / Wounded Reaction
// ---------------------------------------------------------------------------

/** Sispersion 召唤记录（硬约束 15 / 16：只抽 DD Monster；召唤与 Initiative 原子）。 */
export interface SispersionSummonRecord {
  transactionId: string;
  /** 被召唤的 Monster Definition（必须来自 Darkest Dungeon Monster Deck）。 */
  monsterDefinitionId: string;
  /** 生成的 Actor ID。 */
  actorId: string;
  stance: Stance;
  areaId: string;
  /** 与召唤同一事务写入的 Initiative Card 数。 */
  initiativeCardsAdded: number;
  at: string;
}

/** Gestating Heart 受创反应（硬约束 17：只在实际造成 Wounds 时触发）。 */
export interface WoundedReactionRecord {
  transactionId: string;
  sourceHeroId: string;
  /** 实际造成的 Wounds（必须 > 0）。 */
  woundsApplied: number;
  blightPotency: number;
  blightDurationTurns: number;
  healed: number;
  /** 该次伤害是否致死。 */
  lethal: boolean;
  /** 致死时是否仍触发（Definition 驱动；数据缺失 → 记录 blocked）。 */
  blockedReason: string | null;
  at: string;
}

export interface GestatingHeartRuntime {
  kind: 'gestating-heart';

  /** 基础 1 张；每次 Sispersion 原子 +1。 */
  baseInitiativeCardCount: 1;
  initiativeCardCount: number;

  /** 召唤来源牌堆（必须是 Darkest Dungeon Monster Deck）。 */
  monsterDeckId: string;
  /** 已被抽走的 Monster（避免同一只重复抽取）。 */
  drawnMonsterDefinitionIds: string[];
  summonedActorIds: string[];

  sispersionHistory: SispersionSummonRecord[];
  woundedReactionHistory: WoundedReactionRecord[];
}

// ---------------------------------------------------------------------------
// Heart of Darkness —— Impending Doom / Forecast
// ---------------------------------------------------------------------------

/**
 * Impending Doom 预告（硬约束 18—20）。
 * 生成即保存，玩家可见；回合到来时**消费**而不是重掷；
 * Action 完成后才生成下一次。
 */
export interface ImpendingDoomForecast {
  transactionId: string;
  /** d10 结果（1—10）。 */
  roll: number;
  /** 映射到的 Skill；官方 d10 表全空 → null。 */
  skillId: string | null;
  /** 玩家是否可见（规则明确为 true）。 */
  visibleToPlayers: boolean;
  generatedAt: string;
  consumed: boolean;
  consumedAt: string | null;
  /** 数据缺口导致无法执行时的原因。 */
  blockedReason: string | null;
}

export interface HeartOfDarknessRuntime {
  kind: 'heart-of-darkness';

  initiativeCardCount: 2;
  /** 硬约束 5：Heart of Darkness 不可跳过。 */
  cannotBeSkipped: true;

  currentForecast: ImpendingDoomForecast | null;
  forecastHistory: ImpendingDoomForecast[];
  consumedForecastCount: number;

  /** 硬约束 21：官方数据缺失 → 恒禁用，绝不按电子游戏实现。 */
  comeUntoYourMakerEnabled: false;
}

// ---------------------------------------------------------------------------
// 统一容器
// ---------------------------------------------------------------------------

export type FinalFormRuntime =
  | AncestorFirstFormRuntime
  | AncestorSecondFormRuntime
  | GestatingHeartRuntime
  | HeartOfDarknessRuntime;

/**
 * Final Form 机制运行时（挂在 ActFourState 下，与三个 Guardian Boss 域同构）。
 * 硬约束 1：这里**只**保存 Form 专属附加状态，真正的战斗仍由既有 BattleState 驱动。
 */
export interface FinalFormRuntimeState {
  encounterId: string;
  activeFormId: FinalFormId | null;

  /** 每个已出场 Form 的运行时（切换后保留，便于审计与 E2E 断言）。 */
  runtimes: Partial<Record<FinalFormId, FinalFormRuntime>>;

  /** 内容模式（prototype harness / formal）。 */
  contentMode: 'formal' | 'prototype';
  /** 生成时的数据可信度快照。 */
  dataStatus: FinalFormDataStatus;

  /** 已提交事务 id（幂等；保留最近 100 条）。 */
  processedTransactionIds: string[];
  lastTransactionId: string | null;
}

// ---------------------------------------------------------------------------
// 机制 Definition（Registry 层契约）
//
// ⚠️ 正式（official）常量是 docs/data/darkest-dungeon/final-encounter/*.json 的
// **1:1 转写**，不做任何补全与推测：JSON 里为空的字段在这里就是 '' / null / []，
// 由 validate*() 转成 Data Gate 失败。prototype 常量另起 ID，绝不回写正式字段。
// ---------------------------------------------------------------------------

/**
 * Ancestor Room 的 Stance → Area 映射与容量（硬约束 3：所有 Form 共用这一个 Room）。
 * 官方 `ancestor-room.json` 全空 → 一律 '' / [] / {}，驱动 Data Gate 失败。
 */
export interface AncestorRoomAreaDefinition {
  id: string;
  stanceAreaMap: Record<Stance, string>;
  validAreaIds: string[];
  /** areaId → 可容纳的占位数（Absolute Nothingness 也占一格）。 */
  areaCapacities: Record<string, number>;
  officialDataStatus: FinalFormDataStatus;
  sourceReference?: string;
}

/** Reflection 卡面（HP / 是否可行动）。官方缺失 → 全 null。 */
export interface ReflectionCardDefinition {
  kind: ReflectionKind;
  maxWounds: number | null;
  skillIds: string[];
}

export interface AncestorFirstFormMechanics {
  id: string;
  formId: 'ancestor-first-form';

  perfectReflectionCount: number;
  imperfectReflectionCount: number;
  randomizeAcrossStances: NonAggressiveStance[];

  /** 硬约束 7：固定 4 张。 */
  initiativeCardCount: 4;
  allocationPolicy: string;
  /** 硬约束 8：Reflection 死亡不减少 Card。 */
  preserveCardCountAfterReflectionDeath: true;

  /** 硬约束 9：Reflection 存活时 Ancestor 不可 Target。 */
  guardPolicy: string;

  /** 硬约束 10：Imperfect 死亡对 Ancestor 造成的 Wounds。 */
  imperfectDeathWounds: number | null;

  /** Stance 全满时使用的 Skill ID；效果本体缺失 → skillDefined = false。 */
  fullStanceSkillId: string;
  fullStanceSkillDefined: boolean;

  /** 有空位时的补位解析器；补位来源未知 → fillKind = null。 */
  vacantStanceResolverId: string;
  vacantStanceFillKind: ReflectionKind | null;

  reflectionCards: ReflectionCardDefinition[];

  officialDataStatus: FinalFormDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

export interface AncestorSecondFormMechanics {
  id: string;
  formId: 'ancestor-second-form';

  initiativeCardCount: 2;

  /** 恰好 3 条（verified）。areaId 依赖 Room，官方缺失 → ''。 */
  absoluteNothingness: {
    linkedStance: NonAggressiveStance;
    areaId: string;
  }[];

  /** d10 → 目标 Stance；10 = 不传送（值为 null）。 */
  actionEndTeleportMap: Record<number, Stance | null>;

  capacityPolicy: string;

  officialDataStatus: FinalFormDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

export interface GestatingHeartMechanics {
  id: string;
  formId: 'gestating-heart';

  initiativeCardCount: 1;

  /** 硬约束 15：只能从 Darkest Dungeon Monster Deck 抽。 */
  monsterDeckId: string;
  /** 牌堆实际组成；官方缺失 → 空数组。 */
  monsterDefinitionIds: string[];

  sispersion: {
    summonCount: number;
    selectionPolicy: string;
    stancePolicy: string;
    initiativeCardsToAdd: number;
  };

  woundedReaction: {
    trigger: string;
    blightPotency: number | null;
    blightDurationTurns: number | null;
    heal: number | null;
    /** 致死伤害后是否仍触发；官方未给出裁决 → null。 */
    triggersAfterLethalWound: boolean | null;
  };

  officialDataStatus: FinalFormDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

export interface HeartOfDarknessMechanics {
  id: string;
  formId: 'heart-of-darkness';

  initiativeCardCount: 2;
  cannotBeSkipped: true;

  impendingDoom: {
    triggerAtBattleStart: boolean;
    triggerAfterCompletedAction: boolean;
    forecastVisibleToPlayers: boolean;
    consumeForecastOnTurn: boolean;
    /** d10 → Skill ID；官方十格全空 → 值为 ''。 */
    d10SkillMap: Record<number, string>;
  };

  skillIds: string[];

  /** 硬约束 21：官方缺失 → 恒 false，绝不按电子游戏实现。 */
  comeUntoYourMakerEnabled: boolean;

  victoryPolicy: 'campaign-victory';

  officialDataStatus: FinalFormDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

export type FinalFormMechanics =
  | AncestorFirstFormMechanics
  | AncestorSecondFormMechanics
  | GestatingHeartMechanics
  | HeartOfDarknessMechanics;

/** 机制校验结果（与 validateFinalForm 同构）。 */
export interface FinalFormMechanicsValidation {
  isComplete: boolean;
  missing: string[];
  issues: string[];
}
