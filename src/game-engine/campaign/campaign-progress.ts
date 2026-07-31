// Phase 9A §5：Campaign Progress（Act / Campaign Level / Standard Quest 计数 / Boss 锁）。
//
// 本模块是纯函数集合：不读 store、不写存档、不产生随机数，
// 只负责「给定进度 → 计算下一份进度」，方便单测与幂等保护。
//
// 依赖方向：store / quest / boss 引擎 → 本模块 → types + random（无环）。

import type {
  CampaignAct,
  CampaignLevel,
  CampaignProgressState,
  CampaignTierRuntime,
} from '../../types';
import { nowIso } from '../random';

/** 每个 Act 在解锁 Boss Quest 前必须完成的 Standard Quest 数（§5.4，固定 2）。 */
export const REQUIRED_STANDARD_QUESTS_BEFORE_BOSS = 2;

/** 击败第几个 Threat 后解锁 Darkest Dungeon（§5.2，第 3 个）。 */
export const THREATS_TO_UNLOCK_DARKEST_DUNGEON = 3;

/** 把任意值收敛到 1-3（§20.4 旧存档 campaignLevel clamp）。 */
export function clampCampaignLevel(value: unknown): CampaignLevel {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 1;
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return 2;
}

/** 把任意值收敛到 Act 1-4。 */
export function clampCampaignAct(value: unknown): CampaignAct {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 1;
  if (n <= 1) return 1;
  if (n >= 4) return 4;
  return n === 2 ? 2 : 3;
}

/** Act → Campaign Level 固定映射（§5.2：I→I，II→II，III→III，IV→III）。 */
export function campaignLevelForAct(act: CampaignAct): CampaignLevel {
  return act >= 3 ? 3 : (act as CampaignLevel);
}

/** Campaign Level → Act 反向推导（仅迁移用；Level III 一律回到 Act III，不擅自判定已通关）。 */
export function actForCampaignLevel(level: CampaignLevel): CampaignAct {
  return level as CampaignAct;
}

/** 创建初始战役进度。旧存档迁移时传入已有 campaignLevel 与 pendingThreatInitialization。 */
export function createInitialCampaignProgress(input?: {
  act?: unknown;
  campaignLevel?: unknown;
  now?: string;
  /** §20.4：迁移来的存档不自动抽 Threat，标记为待初始化。 */
  pendingThreatInitialization?: boolean;
}): CampaignProgressState {
  // Level 优先：迁移时以旧 campaignLevel 为准并由它推导 Act（§20.4）。
  const level =
    input?.campaignLevel === undefined
      ? campaignLevelForAct(clampCampaignAct(input?.act))
      : clampCampaignLevel(input.campaignLevel);
  const act = input?.act === undefined ? actForCampaignLevel(level) : clampCampaignAct(input.act);
  return {
    act,
    campaignLevel: level,

    activeThreatId: null,
    activeBossDefinitionId: null,
    activeBossFamilyId: null,

    completedStandardQuestsThisAct: 0,
    requiredStandardQuestsBeforeBoss: REQUIRED_STANDARD_QUESTS_BEFORE_BOSS,

    bossQuestUnlocked: false,
    bossQuestRequired: false,
    bossQuestCompletedThisAct: false,

    defeatedThreatIds: [],
    defeatedBossFamilyIds: [],

    darkestDungeonUnlocked: false,

    currentActStartedAt: input?.now ?? nowIso(),
    lastCampaignAdvanceTransactionId: null,

    pendingThreatInitialization: input?.pendingThreatInitialization ?? true,
    actStartTransactionIds: [],
  };
}

// ---------------------------------------------------------------------------
// Selector（只读判定，UI 与引擎共用同一套结论）
// ---------------------------------------------------------------------------

/** Boss Quest 是否已被强制锁定（§5.4）。 */
export function isBossQuestRequired(progress: CampaignProgressState): boolean {
  return (
    progress.completedStandardQuestsThisAct >= progress.requiredStandardQuestsBeforeBoss &&
    progress.bossQuestCompletedThisAct === false
  );
}

/** 当前是否还允许选择 Standard Quest（被锁定时禁止，刷新也绕不过）。 */
export function canSelectStandardQuest(progress: CampaignProgressState): boolean {
  return !isBossQuestRequired(progress);
}

/** Face the Threat 是否可选（需要已抽到 Threat 且已达标）。 */
export function canSelectBossQuest(progress: CampaignProgressState): boolean {
  return isBossQuestRequired(progress) && progress.activeThreatId !== null;
}

/** 距离解锁 Boss Quest 还差几个 Standard Quest（UI 展示 x / 2 用）。 */
export function remainingStandardQuests(progress: CampaignProgressState): number {
  return Math.max(
    0,
    progress.requiredStandardQuestsBeforeBoss - progress.completedStandardQuestsThisAct,
  );
}

/** 当前 Level 对应的内容 Tier（§18.4）。Level II Monster 是「加入」而非替换。 */
export function deriveCampaignTierRuntime(level: CampaignLevel): CampaignTierRuntime {
  const enabled: CampaignLevel[] = [];
  for (let i = 1; i <= level; i += 1) enabled.push(i as CampaignLevel);
  return {
    questTier: level,
    dungeonTier: level,
    monsterTiersEnabled: enabled,
    dungeonTrinketDrawTier: level,
    // Nomad Wagon 仍可提供低 Level Trinket（§18.4 / 测试 84）。
    nomadWagonTrinketTiers: enabled,
  };
}

// ---------------------------------------------------------------------------
// Reducer（纯函数状态推进）
// ---------------------------------------------------------------------------

/** 依据计数重算 Boss 锁字段（唯一写入口，避免多处各写各的）。 */
export function recomputeBossLock(progress: CampaignProgressState): CampaignProgressState {
  const required = isBossQuestRequired(progress);
  if (progress.bossQuestUnlocked === required && progress.bossQuestRequired === required) {
    return progress;
  }
  return { ...progress, bossQuestUnlocked: required, bossQuestRequired: required };
}

/**
 * Standard Quest 完成计数 +1（§5.3）。
 * 调用方必须只在「Standard + Completed + Return Hamlet 事务已应用」时调用；
 * 幂等由上层事务 id 保证，本函数只做纯累加与锁重算。
 */
export function withStandardQuestCompleted(
  progress: CampaignProgressState,
): CampaignProgressState {
  // Boss 已锁定时不再累加，避免 3/2、4/2 这类无意义计数。
  if (isBossQuestRequired(progress)) return recomputeBossLock(progress);
  return recomputeBossLock({
    ...progress,
    completedStandardQuestsThisAct: progress.completedStandardQuestsThisAct + 1,
  });
}

/** 写入抽取到的 Threat（§7.2，先保存后展示）。 */
export function withActiveThreat(
  progress: CampaignProgressState,
  threat: { threatId: string; bossDefinitionId: string; bossFamilyId: string },
): CampaignProgressState {
  return {
    ...progress,
    activeThreatId: threat.threatId,
    activeBossDefinitionId: threat.bossDefinitionId,
    activeBossFamilyId: threat.bossFamilyId,
    pendingThreatInitialization: false,
  };
}

/** 清空当前 Threat（Boss 被击败后、抽新 Threat 前的中间态）。 */
export function withoutActiveThreat(progress: CampaignProgressState): CampaignProgressState {
  return {
    ...progress,
    activeThreatId: null,
    activeBossDefinitionId: null,
    activeBossFamilyId: null,
  };
}

/**
 * 新 Act 初始化（§7.3）。只重置计数与锁，不抽 Threat（抽取由 act-start 事务完成）。
 * transactionId 已存在时原样返回，实现幂等。
 */
export function withActStarted(
  progress: CampaignProgressState,
  input: { act: CampaignAct; transactionId: string; now?: string },
): CampaignProgressState {
  if (progress.actStartTransactionIds.includes(input.transactionId)) return progress;
  return {
    ...progress,
    act: input.act,
    campaignLevel: campaignLevelForAct(input.act),
    completedStandardQuestsThisAct: 0,
    bossQuestUnlocked: false,
    bossQuestRequired: false,
    bossQuestCompletedThisAct: false,
    currentActStartedAt: input.now ?? nowIso(),
    pendingThreatInitialization: true,
    actStartTransactionIds: [...progress.actStartTransactionIds, input.transactionId].slice(-50),
  };
}
