// Phase 11A.1：正式 Threat Selection 入口（§6.2 流程）。
//
// 职责：
// - 检查 pendingThreatInitialization
// - 检查 act ∈ [1, 2, 3]（Act IV 不再抽 Threat）
// - 调 getEligibleThreats() 过滤（family 排除 + level 匹配）
// - 用统一 RNG 抽取一次
// - 写入 campaignProgress + 创建 ActiveThreatRuntime
// - pendingThreatInitialization = false
//
// 约束（dev doc §6.2 / §17 / §18）：
// - 池为空 → 显式失败（content-blocked / campaign-state error），不 fallback；
// - 不新增 Math.random，全部走 _rng；
// - UI 不允许直接调用本模块；只在 engine 内（campaign-orchestrator / quest-result）调用。

import type {
  ActiveThreatRuntime,
  BossThreatDefinition,
  CampaignAct,
  CampaignLevel,
  CampaignState,
} from '../../types';
import type { CampaignLevel as CampaignLevelType } from '../../types/bosses';
import { createId, nowIso, pick } from '../random';
import { getEligibleThreats } from '../../data/bosses/threat-registry';
import { getBossDefinitionById } from '../../data/bosses/boss-registry';
import { campaignLevelForAct, withActiveThreat } from './campaign-progress';

// ---------------------------------------------------------------------------
// 公开错误（content-blocked / state error）
// ---------------------------------------------------------------------------

/** Threat 抽取失败原因。 */
export type ThreatDrawError =
  /** 当前 Act 不可抽 Threat（Act IV / 非法 Act）。 */
  | 'invalid-act'
  /** 当前进度已无 pendingThreatInitialization，幂等返回原状态。 */
  | 'already-initialized'
  /** Threat 池为空（数据缺口 / 全部 Family 已被击败）。 */
  | 'empty-pool'
  /** Threat 指向的 Boss 定义缺失。 */
  | 'missing-boss-definition';

/** 抽取结果。ok=false 时 campaign 原样返回。 */
export interface ThreatDrawResult {
  ok: boolean;
  campaign: CampaignState;
  transactionId: string;
  /** Threat 抽取幂等命中时为 true。 */
  alreadyDrawn: boolean;
  threat: BossThreatDefinition | null;
  bossFamilyId: string | null;
  reason: ThreatDrawError | null;
}

// ---------------------------------------------------------------------------
// 事务键（幂等）
// ---------------------------------------------------------------------------

/** 统一事务键生成器。 */
export const threatDrawTransactionIds = {
  /** Act Start + Threat Draw 同键；每次 Act Start 抽一次 Threat。 */
  forAct: (campaignId: string, act: CampaignAct) => `threat-draw:${campaignId}:act-${act}`,
} as const;

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

function actToLevel(act: CampaignAct): CampaignLevelType {
  return campaignLevelForAct(act) as CampaignLevelType;
}

function buildActiveThreatRuntime(
  threat: BossThreatDefinition,
  transactionId: string,
  now: string,
): ActiveThreatRuntime {
  return {
    threatId: threat.id,
    bossFamilyId: threat.bossFamilyId,
    bossDefinitionId: threat.bossDefinitionId,
    campaignLevel: threat.campaignLevel,
    drawTransactionId: transactionId,
    drawnAt: now,
    active: true,
    deactivatedAt: null,
    deactivationTransactionId: null,
    consumedOnceKeys: [],
  };
}

// ---------------------------------------------------------------------------
// 公开入口
// ---------------------------------------------------------------------------

/**
 * 当前 Act 是否需要 Threat 抽取。
 * - pendingThreatInitialization === true 且 act ∈ [1, 2, 3]；
 * - Act IV 永远返回 false。
 */
export function shouldDrawThreatForCurrentAct(campaign: CampaignState): boolean {
  const cp = campaign.campaignProgress;
  if (cp.act === 4) return false;
  if (cp.darkestDungeonUnlocked) return false;
  return cp.pendingThreatInitialization && cp.activeThreatId === null;
}

/**
 * 正式 Threat 抽取事务。
 *
 * 幂等：同一 campaign + 同一 act 的 transactionId 重复调用时返回原状态。
 * 失败：act 非法 / 池为空 / boss 定义缺失 → 显式返回 ok=false，campaign 原样不变。
 */
export function drawThreatForCurrentAct(
  campaign: CampaignState,
  options?: { now?: string; transactionId?: string },
): ThreatDrawResult {
  const cp = campaign.campaignProgress;
  const act = cp.act as CampaignAct;
  const now = options?.now ?? nowIso();

  // ---- 非法 Act ----
  if (act < 1 || act > 3 || cp.darkestDungeonUnlocked) {
    return {
      ok: false,
      campaign,
      transactionId: '',
      alreadyDrawn: false,
      threat: null,
      bossFamilyId: null,
      reason: 'invalid-act',
    };
  }

  // ---- 幂等：已经抽过（activeThreatId 已存在 或 已处理过本事务） ----
  const transactionId =
    options?.transactionId ?? threatDrawTransactionIds.forAct(campaign.id, act);
  if (cp.activeThreatId !== null) {
    return {
      ok: true,
      campaign,
      transactionId,
      alreadyDrawn: true,
      threat: null,
      bossFamilyId: cp.activeBossFamilyId,
      reason: null,
    };
  }

  // ---- 取可入池 Threat ----
  const level: CampaignLevel = actToLevel(act);
  const pool = getEligibleThreats({
    campaignLevel: level,
    excludedBossFamilyIds: cp.defeatedBossFamilyIds,
  });
  if (pool.length === 0) {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyDrawn: false,
      threat: null,
      bossFamilyId: null,
      reason: 'empty-pool',
    };
  }

  // ---- 抽取一次（统一 RNG） ----
  const threat = pick(pool);

  // ---- 校验 Threat 指向的 Boss 定义存在（按 definitionId 查找；familyId 在 Phase 9B/9C/9D
  //      可能与 Prototype Boss 的 familyId 不一致，这是既有约定） ----
  const boss = getBossDefinitionById(threat.bossDefinitionId);
  if (!boss) {
    return {
      ok: false,
      campaign,
      transactionId,
      alreadyDrawn: false,
      threat: null,
      bossFamilyId: null,
      reason: 'missing-boss-definition',
    };
  }

  // ---- 写入 campaignProgress（withActiveThreat 已经会重算 pendingThreatInitialization = false） ----
  const nextProgress = withActiveThreat(cp, {
    threatId: threat.id,
    bossDefinitionId: threat.bossDefinitionId,
    bossFamilyId: threat.bossFamilyId,
  });

  // ---- 创建 ActiveThreatRuntime ----
  const runtime = buildActiveThreatRuntime(threat, transactionId, now);

  // ---- 写入顶层镜像（act / campaignLevel / currentThreatId） ----
  const next: CampaignState = {
    ...campaign,
    act: nextProgress.act,
    campaignLevel: nextProgress.campaignLevel,
    currentThreatId: threat.id,
    campaignProgress: nextProgress,
    activeThreatRuntime: runtime,
    updatedAt: now,
  };

  return {
    ok: true,
    campaign: next,
    transactionId,
    alreadyDrawn: false,
    threat,
    bossFamilyId: threat.bossFamilyId,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// 写入：向 CampaignState 推入一笔 Threat Draw 记录（campaignAdvanceHistory）
// ---------------------------------------------------------------------------

/** 记录一次 Threat Draw 推进。 */
export function withThreatDrawHistory(
  campaign: CampaignState,
  record: {
    fromAct: CampaignAct;
    threatId: string;
    bossFamilyId: string;
    transactionId: string;
    at: string;
  },
): CampaignState {
  return {
    ...campaign,
    campaignAdvanceHistory: [
      ...campaign.campaignAdvanceHistory,
      {
        id: createId('adv'),
        transactionId: record.transactionId,
        fromAct: record.fromAct,
        toAct: record.fromAct,
        fromLevel: campaign.campaignLevel,
        toLevel: campaign.campaignLevel,
        defeatedThreatId: '',
        defeatedBossFamilyId: '',
        newThreatId: record.threatId,
        darkestDungeonUnlocked: false,
        at: record.at,
      },
    ],
  };
}
