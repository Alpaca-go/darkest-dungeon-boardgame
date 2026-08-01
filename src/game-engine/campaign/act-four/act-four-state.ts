// Phase 10A §5：Act IV 状态机（纯函数）。
//
// 硬约束 1：不创建第二套 Campaign / Dungeon / Battle 状态机。
// ActFourState 是 CampaignState 上的一个字段，Stage 只是「Act IV 内部进度」，
// 顶层仍复用既有 GamePhase 与既有 Dungeon / Battle 引擎。
//
// 本模块只负责：初始状态、Stage 合法顺序、幂等事务簿记、只读 Selector、
// 以及「损坏存档 → 安全兜底」的 sanitize（§29 测试 82：不白屏）。

import type {
  ActFourStage,
  ActFourState,
  BossSlotAssignmentRecord,
  DarkestDungeonDataAuditSnapshot,
  DarkestDungeonLayoutDrawRecord,
  DarkestDungeonMapState,
  DarkestDungeonQuestDrawRecord,
  DarkestDungeonQuestState,
  DarkestDungeonRoomToken,
  ExcavationSiteRoomState,
  LocationContentRuntime,
} from '../../../types/act-four';
import { DARKEST_DUNGEON_LOCATION_ID } from '../../../types/act-four';
import type {
  FinalEncounterState,
  FinalFormId,
  FinalHamletState,
  FormTransitionRecord,
} from '../../../types/final-encounter';
import { isFinalFormId } from '../../../data/darkest-dungeon/final-form-registry';
// Phase 10B §28：Templars 运行时净化（该模块只依赖 types + data 层，无循环依赖）。
import { sanitizeTemplarsEncounterState } from '../../bosses/templars/templars-content-validation';
import { sanitizeMammothCystEncounterState } from '../../bosses/mammoth-cyst/mammoth-cyst-content-validation';
import { nowIso } from '../../random';

// ---------------------------------------------------------------------------
// Stage 顺序（§5）
// ---------------------------------------------------------------------------

/** 正常推进顺序。campaign-over 是从任意阶段可达的终止分支，不在此序列内。 */
export const ACT_FOUR_STAGE_ORDER: ActFourStage[] = [
  'locked',
  'post-third-threat-hamlet',
  'guardian-quest-selection',
  'guardian-dungeon-active',
  'guardian-battle-active',
  'guardian-victory',
  'final-hamlet',
  'final-encounter-ready',
  'final-encounter-active',
  'campaign-victory',
];

/** 终止阶段（不可再推进）。 */
export const ACT_FOUR_TERMINAL_STAGES: ActFourStage[] = ['campaign-victory', 'campaign-over'];

const STAGE_LABELS: Record<ActFourStage, string> = {
  locked: '未解锁',
  'post-third-threat-hamlet': '第三 Boss 后的正常 Hamlet',
  'guardian-quest-selection': 'Darkest Dungeon Quest 抽取',
  'guardian-dungeon-active': 'Darkest Dungeon 探索中',
  'guardian-battle-active': 'Guardian 战斗中',
  'guardian-victory': 'Guardian 已击败',
  'final-hamlet': 'Final Hamlet（4 Days）',
  'final-encounter-ready': 'Final Encounter 准备就绪',
  'final-encounter-active': 'Final Encounter 进行中',
  'campaign-victory': '战役胜利',
  'campaign-over': '战役失败',
};

export function actFourStageLabel(stage: ActFourStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function actFourStageIndex(stage: ActFourStage): number {
  return ACT_FOUR_STAGE_ORDER.indexOf(stage);
}

/**
 * Stage 是否允许从 from 推进到 to。
 * - campaign-over 可从任意非终止阶段进入（任一 Boss Quest 失败）；
 * - 其余只允许「顺序 +1」，不得回退，也不得跳级；
 * - 不得从 Act IV 回到 Standard Quest / 重新抽 Threat（§5 末尾）。
 */
export function canTransitionActFourStage(from: ActFourStage, to: ActFourStage): boolean {
  if (from === to) return false;
  if (ACT_FOUR_TERMINAL_STAGES.includes(from)) return false;
  if (to === 'campaign-over') return true;
  const fromIndex = actFourStageIndex(from);
  const toIndex = actFourStageIndex(to);
  if (fromIndex < 0 || toIndex < 0) return false;
  return toIndex === fromIndex + 1;
}

// ---------------------------------------------------------------------------
// 初始状态
// ---------------------------------------------------------------------------

export function createInitialActFourState(): ActFourState {
  return {
    unlocked: false,
    stage: 'locked',
    campaignLevel: 3,
    locationId: DARKEST_DUNGEON_LOCATION_ID,

    selectedQuestId: null,
    guardianDefinitionId: null,
    skippedFinalFormId: null,

    guardianQuestState: null,
    finalHamletState: null,
    finalEncounterState: null,
    // Phase 10B：Templars 遭遇运行时（未进入 Guardian Quest 战斗前恒为 null）。
    templarsEncounterState: null,
    // Phase 10C：Mammoth Cyst 遭遇运行时（未进入 Guardian Quest 战斗前恒为 null）。
    mammothCystEncounterState: null,

    actFourStartedAt: null,
    lastTransitionTransactionId: null,

    questDrawRecord: null,
    contentRuntime: null,
    layoutDrawRecord: null,
    bossSlotAssignment: null,
    mapState: null,
    excavationSiteStates: [],
    formTransitionHistory: [],
    dataAudit: null,
    processedTransactionIds: [],
  };
}

// ---------------------------------------------------------------------------
// 幂等事务（§24）
// ---------------------------------------------------------------------------

/** Act IV 域幂等键集中定义。 */
export const actFourTransactionIds = {
  unlock: (campaignId: string) => `act-four-unlock:${campaignId}`,
  questDraw: (campaignId: string) => `darkest-dungeon-quest-draw:${campaignId}`,
  contentActivate: (campaignId: string) => `darkest-dungeon-content-activate:${campaignId}`,
  layoutDraw: (questId: string) => `darkest-dungeon-layout-draw:${questId}`,
  bossSlotAssign: (questId: string, layoutId: string) =>
    `darkest-dungeon-boss-slot-assign:${questId}:${layoutId}`,
  excavationProvision: (questId: string, roomId: string) =>
    `excavation-provision:${questId}:${roomId}`,
  excavationRest: (questId: string, roomId: string) => `excavation-rest:${questId}:${roomId}`,
  guardianBattleStart: (questId: string, roomId: string) =>
    `guardian-battle-start:${questId}:${roomId}`,
  guardianVictory: (battleId: string) => `guardian-victory:${battleId}`,
  finalHamletStart: (campaignId: string) => `final-hamlet-start:${campaignId}`,
  finalHamletDay: (campaignId: string, day: number) => `final-hamlet-day:${campaignId}:${day}`,
  finalEncounterPrepare: (campaignId: string) => `final-encounter-prepare:${campaignId}`,
  finalFormStart: (encounterId: string, formId: string) =>
    `final-form-start:${encounterId}:${formId}`,
  finalFormDefeat: (encounterId: string, formId: string) =>
    `final-form-defeat:${encounterId}:${formId}`,
  finalFormTransition: (encounterId: string, from: string, to: string) =>
    `final-form-transition:${encounterId}:${from}:${to}`,
  campaignVictory: (campaignId: string) => `campaign-victory:${campaignId}`,
} as const;

const PROCESSED_TRANSACTION_LIMIT = 100;

export function hasProcessedActFourTransaction(state: ActFourState, transactionId: string): boolean {
  return state.processedTransactionIds.includes(transactionId);
}

export function withProcessedActFourTransaction(
  state: ActFourState,
  transactionId: string,
): ActFourState {
  if (state.processedTransactionIds.includes(transactionId)) return state;
  return {
    ...state,
    processedTransactionIds: [...state.processedTransactionIds, transactionId].slice(
      -PROCESSED_TRANSACTION_LIMIT,
    ),
    lastTransitionTransactionId: transactionId,
  };
}

/** 推进 Stage（非法转移原样返回，交由调用方决定是否记日志）。 */
export function withActFourStage(
  state: ActFourState,
  stage: ActFourStage,
  transactionId: string,
): ActFourState {
  if (!canTransitionActFourStage(state.stage, stage)) return state;
  return withProcessedActFourTransaction({ ...state, stage }, transactionId);
}

// ---------------------------------------------------------------------------
// 只读 Selector
// ---------------------------------------------------------------------------

/** Act IV 是否已解锁并进入流程。 */
export function isActFourActive(state: ActFourState): boolean {
  return state.unlocked && state.stage !== 'locked';
}

/** Act IV 期间是否仍允许 Standard Quest（硬约束：不再显示 Standard Quest）。 */
export function allowsStandardQuest(state: ActFourState): boolean {
  return !state.unlocked;
}

/** Act IV 期间是否仍允许抽 Imminent Threat（硬约束 3：不再抽）。 */
export function allowsThreatDraw(state: ActFourState): boolean {
  return !state.unlocked;
}

/** 是否可以抽 Darkest Dungeon Quest（必须先完成第三 Boss 后的正常 Hamlet）。 */
export function canDrawDarkestDungeonQuest(state: ActFourState): boolean {
  return (
    state.unlocked && state.stage === 'guardian-quest-selection' && state.questDrawRecord === null
  );
}

/** 是否已保存 skipped Form（必须保留到 Final Encounter，§15）。 */
export function hasSkippedFinalForm(state: ActFourState): boolean {
  return state.skippedFinalFormId !== null;
}

/**
 * 对外可见的 Boss Slot 视图（硬约束 6：Objective 位置不得被 UI 泄露）。
 * 只暴露「该 Slot 是否已揭示」与「已揭示时的 token 种类」，
 * 未揭示时一律返回 kind = null，UI 无从区分 Objective 与普通 Token。
 */
export interface MaskedBossSlotView {
  slotId: string;
  revealed: boolean;
  kind: DarkestDungeonRoomToken['kind'] | null;
}

export function getMaskedBossSlotViews(state: ActFourState): MaskedBossSlotView[] {
  const map = state.mapState;
  if (!map) return [];
  return map.bossSlotIds.map((slotId) => {
    const revealed = map.revealedSlotIds.includes(slotId);
    return {
      slotId,
      revealed,
      kind: revealed ? (map.slotTokens[slotId]?.kind ?? null) : null,
    };
  });
}

/** Objective 是否已被揭示（UI 只能读这个布尔量，读不到位置）。 */
export function isObjectiveRevealed(state: ActFourState): boolean {
  const map = state.mapState;
  const assignment = state.bossSlotAssignment;
  if (!map || !assignment) return false;
  return map.revealedSlotIds.includes(assignment.objectiveRoomSlotId);
}

// ---------------------------------------------------------------------------
// Sanitize（§23 / 测试 82：损坏 ActFourState 不白屏）
// ---------------------------------------------------------------------------

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

function isActFourStage(value: unknown): value is ActFourStage {
  return typeof value === 'string' && (ACT_FOUR_STAGE_ORDER as string[]).concat('campaign-over').includes(value);
}

/**
 * 净化 / 补齐 ActFourState。
 * - 任意字段损坏 → 回退到安全默认，绝不抛异常；
 * - unlocked 与 stage 冲突时以「更保守」的一侧为准（未解锁 → locked）；
 * - 不重新随机任何东西（硬约束 4：随机结果先保存，迁移时只能读不能重掷）。
 */
export function sanitizeActFourState(raw: unknown): ActFourState {
  const base = createInitialActFourState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;

  const unlocked = r.unlocked === true;
  let stage: ActFourStage = isActFourStage(r.stage) ? r.stage : 'locked';
  if (!unlocked && stage !== 'locked') stage = 'locked';
  if (unlocked && stage === 'locked') stage = 'post-third-threat-hamlet';

  const skipped = isFinalFormId(r.skippedFinalFormId) ? (r.skippedFinalFormId as FinalFormId) : null;

  return {
    ...base,
    unlocked,
    stage,
    campaignLevel: 3,
    locationId: DARKEST_DUNGEON_LOCATION_ID,

    selectedQuestId: str(r.selectedQuestId),
    guardianDefinitionId: str(r.guardianDefinitionId),
    // Heart of Darkness 永远不可能是 skipped Form（硬约束 13）——损坏数据在此被丢弃。
    skippedFinalFormId: skipped === 'heart-of-darkness' ? null : skipped,

    guardianQuestState: (r.guardianQuestState as DarkestDungeonQuestState | null) ?? null,
    finalHamletState: (r.finalHamletState as FinalHamletState | null) ?? null,
    finalEncounterState: (r.finalEncounterState as FinalEncounterState | null) ?? null,
    // Phase 10B §28：Templars 运行时结构性字段缺失时返回 null（安全兜底，不白屏），
    // 且净化过程绝不重掷任何随机数（已保存的 d10 / Initiative 顺序原样保留）。
    templarsEncounterState: sanitizeTemplarsEncounterState(r.templarsEncounterState),
    // Phase 10C §26：Mammoth Cyst 运行时同样走安全兜底 —— 结构性字段缺失返回 null，
    // 已保存的 d10 Skill Roll / Teleportation Roll / 召唤记录原样保留，绝不重掷。
    mammothCystEncounterState: sanitizeMammothCystEncounterState(r.mammothCystEncounterState),

    actFourStartedAt: str(r.actFourStartedAt),
    lastTransitionTransactionId: str(r.lastTransitionTransactionId),

    questDrawRecord: (r.questDrawRecord as DarkestDungeonQuestDrawRecord | null) ?? null,
    contentRuntime: (r.contentRuntime as LocationContentRuntime | null) ?? null,
    layoutDrawRecord: (r.layoutDrawRecord as DarkestDungeonLayoutDrawRecord | null) ?? null,
    bossSlotAssignment: (r.bossSlotAssignment as BossSlotAssignmentRecord | null) ?? null,
    mapState: (r.mapState as DarkestDungeonMapState | null) ?? null,
    excavationSiteStates: Array.isArray(r.excavationSiteStates)
      ? (r.excavationSiteStates as ExcavationSiteRoomState[])
      : [],
    formTransitionHistory: Array.isArray(r.formTransitionHistory)
      ? (r.formTransitionHistory as FormTransitionRecord[]).slice(-20)
      : [],
    dataAudit: (r.dataAudit as DarkestDungeonDataAuditSnapshot | null) ?? null,
    processedTransactionIds: strArray(r.processedTransactionIds).slice(
      -PROCESSED_TRANSACTION_LIMIT,
    ),
  };
}

/** 便捷构造：带时间戳的解锁初始状态（供 unlock-act-four 使用）。 */
export function createUnlockedActFourState(now: string = nowIso()): ActFourState {
  return {
    ...createInitialActFourState(),
    unlocked: true,
    stage: 'post-third-threat-hamlet',
    actFourStartedAt: now,
  };
}
