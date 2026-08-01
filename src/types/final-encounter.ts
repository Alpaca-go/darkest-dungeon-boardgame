// Phase 10A §18—§22：Final Encounter（Heart of Darkness 多形态容器）类型契约。
//
// 硬约束（文档 §33 清单）：
// - 13. Heart of Darkness 不能被跳过 → SkippableFinalFormId 用 Exclude 在类型层锁死；
// - 14. Final Encounter 不生成 Dungeon Exploration → 本文件不含任何 Room Token / Layout 字段；
// - 15/16. Form Transition 不恢复 Life / Stress，不允许 Rest / Change Stance
//   → FormTransitionPolicy 用字面量 true 锁死；
// - 17. 重建 Initiative 并重置 Round → FormTransitionState 显式记录；
// - 18. 所有 Form 使用同一 Room → FinalEncounterState.roomDefinitionId 单值，不随 Form 变。
//
// 资料缺口（§4）：四个正式 Final Boss Form 的卡面（HP / Skill / Spawn）全部 unavailable，
// 因此正式 Form Definition 一律 enabledInOfficialPool = false，
// Phase 10A 仅用 prototype-final-form-* harness 验证顺序与切换。

import type { DataCredibility } from './progression';

/** Final Encounter 数据可信度（与项目统一四态一致）。 */
export type FinalEncounterDataStatus = DataCredibility;

// ---------------------------------------------------------------------------
// §18 Final Form 顺序
// ---------------------------------------------------------------------------

/** 四个 Final Boss Form 的固定 ID（顺序即 FINAL_FORM_ORDER）。 */
export type FinalFormId =
  | 'ancestor-first-form'
  | 'ancestor-second-form'
  | 'gestating-heart'
  | 'heart-of-darkness';

/**
 * 可被 Quest 取消的 Form：只能是前三个。
 * Heart of Darkness 被 Exclude 排除 → 硬约束 13 在编译期即成立。
 */
export type SkippableFinalFormId = Exclude<FinalFormId, 'heart-of-darkness'>;

/**
 * Final Form 定义。
 * Phase 10A 只需要「顺序 / Spawn / 是否可跳过 / Data Gate」，
 * 正式技能表由 Phase 10E 接入，本阶段 skillIds 允许为空。
 */
export interface FinalFormDefinition {
  id: string;
  formId: FinalFormId;

  /** 展示名（prototype 用中文占位，正式卡面接入后替换）。 */
  name: string;

  /** Spawn 规则标识（正式规则未核对时为 'standard'）。 */
  spawnRule: 'standard';

  /** 是否允许被 Quest 取消（heart-of-darkness 必须 false）。 */
  skippable: boolean;

  /** Prototype harness 数值；正式 Definition 一律留 null 驱动 Data Gate。 */
  maxHp: number | null;
  skillIds: string[];
  /** Form 专属附属 Actor（Reflections / Malignant Growth 等），Phase 10A 不实现正式内容。 */
  attendantActorDefinitionIds: string[];

  officialDataStatus: FinalEncounterDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

/** Final Encounter Room（所有 Form 共用的同一个 Room，硬约束 18）。 */
export interface FinalEncounterRoomDefinition {
  id: string;
  name: string;
  /** Hero 入场规则（沿用既有 Room 语义）。 */
  heroPlacementRule: 'first-empty-stance';
  /** Form 出场 Area（prototype harness 用；正式留空驱动 Data Gate）。 */
  formAreaId: string;
  validAreaIds: string[];
  officialDataStatus: FinalEncounterDataStatus;
  sourceReference?: string;
}

// ---------------------------------------------------------------------------
// §16 Final Hamlet
// ---------------------------------------------------------------------------

/** 最后 Hamlet：恰好 4 Days 且不抽 Hamlet Event（规则 24 / 25）。 */
export interface FinalHamletState {
  status: 'not-started' | 'active' | 'completed';

  /** 固定 4，不允许被数据覆盖。 */
  totalDays: 4;
  currentDay: 1 | 2 | 3 | 4;

  /** 固定 false：Final Hamlet 不抽 Hamlet Event。 */
  drawHamletEvent: false;

  /** 每日已完成访问的 Hero（刷新恢复用）。 */
  completedHeroIdsByDay: Record<number, string[]>;
  /** 每日已使用的 Building（刷新恢复用）。 */
  buildingUsageByDay: Record<number, string[]>;

  /** 已提交的每日事务 id（幂等；防同一 Day 重复推进）。 */
  completedDayTransactionIds: string[];

  lastTransactionId: string | null;
}

// ---------------------------------------------------------------------------
// §17 Final Provision
// ---------------------------------------------------------------------------

/** Final Encounter 开始前的 Roll for Provisions 结果（先保存，刷新不重掷）。 */
export interface FinalProvisionRecord {
  transactionId: string;
  /** 每个补给类型的骰值（复用既有 Quest Start Provision 语义）。 */
  rolls: Record<string, number>;
  /** 结算后写入公共 Provision Pool 的增量。 */
  granted: Record<string, number>;
  rolledAt: string;
}

// ---------------------------------------------------------------------------
// §19 / §20 Form Transition
// ---------------------------------------------------------------------------

/**
 * 跨 Form 状态策略（§20）。
 * 三个 preserve* 用字面量 true 锁死（硬约束 15 / 16）；
 * 不确定的字段必须 definition-driven，不允许散落在各处 if。
 */
export interface FormTransitionPolicy {
  preserveHeroLife: true;
  preserveHeroStress: true;
  preserveHeroStances: true;

  /** Conditions 是否跨 Form 保留：正式规则未核对 → 'definition-driven'。 */
  preserveConditions: boolean | 'definition-driven';
  resetHeroTurnUsage: boolean;
  resetTrinketTurnUsage: boolean;
  resetBattleUsage: boolean;
}

/** 进行中的 Form 切换（刷新可恢复）。 */
export interface FormTransitionState {
  transactionId: string;
  fromFormId: FinalFormId;
  toFormId: FinalFormId;

  status: 'cleaning-up' | 'rebuilding-initiative' | 'spawning' | 'completed';

  /** 重建 Initiative 后的新 Round（固定 1，硬约束 17）。 */
  nextRound: 1;
  initiativeRebuilt: boolean;

  startedAt: string;
  completedAt: string | null;
}

/** Form 切换历史（调试 / 幂等 / E2E 断言）。 */
export interface FormTransitionRecord {
  transactionId: string;
  fromFormId: FinalFormId;
  toFormId: FinalFormId;
  /** 切换时的 Hero 快照（用于断言「未恢复 Life / Stress」）。 */
  heroSnapshots: FormTransitionHeroSnapshot[];
  at: string;
}

/** Form 切换前后的 Hero 关键状态快照。 */
export interface FormTransitionHeroSnapshot {
  heroId: string;
  wounds: number;
  stress: number;
  stance: string;
  dead: boolean;
}

// ---------------------------------------------------------------------------
// §18 Final Encounter State
// ---------------------------------------------------------------------------

export interface FinalEncounterState {
  id: string;
  status: 'preparing' | 'form-active' | 'transitioning' | 'victory' | 'failed';

  /** 所有 Form 共用的同一个 Room（硬约束 18）。 */
  roomDefinitionId: string;

  /** 去掉 skipped Form 后的实际顺序（永远以 heart-of-darkness 结尾）。 */
  orderedFormIds: FinalFormId[];
  /** 来自 Quest 数据，不二次随机（硬约束 12）。 */
  skippedFormId: SkippableFinalFormId;

  activeFormIndex: number;
  activeFormId: FinalFormId | null;

  defeatedFormIds: FinalFormId[];

  transitionState: FormTransitionState | null;

  /** 固定 true：跨 Form 不恢复、不换 Stance。 */
  noRecoveryBetweenForms: true;
  noStanceChangeBetweenForms: true;

  /** §17 Roll for Provisions 结果（先保存）。 */
  provisionRecord: FinalProvisionRecord | null;

  /** 已提交事务 id（幂等：Form Spawn / Defeat / Transition / Victory 不重复）。 */
  processedTransactionIds: string[];

  lastTransactionId: string | null;
}
