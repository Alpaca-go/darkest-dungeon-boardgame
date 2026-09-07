// Phase 11A.2 §19–§20 — Trinket Production Commands。
//
// 职责：
//   - resolveOpenTrinketOpportunities（§19）
//   - resolvePendingTrinketAllocations（§20）
//
// 不再依赖「autoDeclineAll()」之类的硬编码策略；Engine 只负责执行合法决策。
import type {
  CampaignState,
  PendingTrinketAllocation,
  TrinketUseOpportunity,
} from '../../types';
import {
  resolveTrinketOpportunity,
} from '../trinkets/battle-trinket-bridge';
import { resolveTrinketAllocation } from '../trinkets/allocate-trinket';
import type { TrinketAllocationChoice } from '../trinkets/allocate-trinket';

export type TrinketDecision = 'use' | 'decline';
export interface TrinketOpportunityDecision {
  opportunityId: string;
  decision: TrinketDecision;
}
export interface TrinketAllocationDecision {
  allocationId: string;
  choice: TrinketAllocationChoice;
}

// ---------------------------------------------------------------------------
// 1. resolveOpenTrinketOpportunities（§19）
// ---------------------------------------------------------------------------

/**
 * 结算一组 trinket 使用机会。Engine 只执行合法决策：
 *   - 'use'    → resolveTrinketOpportunity(opportunityId)
 *   - 'decline' → resolveTrinketOpportunity(opportunityId, 'decline')
 * 越界或重复的 opportunityId 直接跳过。
 */
export function resolveOpenTrinketOpportunities(
  campaign: CampaignState,
  decisions: TrinketOpportunityDecision[],
  maxRounds = 20,
): CampaignState {
  let next: CampaignState = campaign;
  let guard = 0;
  while (guard++ < maxRounds) {
    const pending: TrinketUseOpportunity[] = next.pendingTrinketUseOpportunities;
    if (pending.length === 0) break;
    const head = pending[0];
    const decision = decisions.find((d) => d.opportunityId === head.id);
    if (!decision) break;
    const action = decision.decision === 'use' ? 'use' : 'decline';
    const result = resolveTrinketOpportunity(next, head.id, action);
    next = result.campaign;
  }
  return next;
}

// ---------------------------------------------------------------------------
// 2. resolvePendingTrinketAllocations（§20）
// ---------------------------------------------------------------------------

/**
 * 强制结清所有 PendingTrinketAllocation（headless / Production 共用入口）。
 * 对每个 pending allocation，调用 resolveTrinketAllocation 并应用决策。
 */
export function resolvePendingTrinketAllocations(
  campaign: CampaignState,
  decisions: TrinketAllocationDecision[],
  maxRounds = 30,
): CampaignState {
  let next: CampaignState = campaign;
  let guard = 0;
  while (guard++ < maxRounds) {
    const pending = next.pendingTrinketAllocations;
    if (pending.length === 0) break;
    const head: PendingTrinketAllocation = pending[0];
    const decision = decisions.find((d) => d.allocationId === head.allocationId);
    if (!decision) break;
    const result = resolveTrinketAllocation(next, head.allocationId, decision.choice);
    next = result.campaign;
  }
  return next;
}

/** 自动以 'assign' 策略结清全部 pending allocation（兼容 shim 的旧行为）。 */
export function resolveAllPendingTrinketAllocations(
  campaign: CampaignState,
  maxRounds = 30,
): CampaignState {
  const decisions: TrinketAllocationDecision[] = campaign.pendingTrinketAllocations.map(
    (a) => ({ allocationId: a.allocationId, choice: 'assign' as unknown as TrinketAllocationChoice }),
  );
  return resolvePendingTrinketAllocations(campaign, decisions, maxRounds);
}

/** 拒绝所有 Trinket 使用机会（headless 模拟兜底）。 */
export function declineAllTrinketOpportunities(
  campaign: CampaignState,
  maxRounds = 20,
): CampaignState {
  const opportunities: TrinketUseOpportunity[] = campaign.pendingTrinketUseOpportunities;
  const decisions: TrinketOpportunityDecision[] = opportunities.map((o) => ({
    opportunityId: o.id,
    decision: 'decline' as TrinketDecision,
  }));
  return resolveOpenTrinketOpportunities(campaign, decisions, maxRounds);
}
