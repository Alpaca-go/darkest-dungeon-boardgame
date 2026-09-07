// Phase 11A.2.1 §13 — Deterministic Trinket Policy。
//
// Test Policy 只做：读取合法选择 → 做出确定性决定 → 调 Production Command。
// 禁止直接改 CampaignState。
//
// dev doc §13：
//   Trinket Opportunity → decline
//   Pending Allocation → { type:'discard' }

import type { CampaignState, TrinketUseOpportunity } from '../../types';
import { declineAllTrinketOpportunities, resolveAllPendingTrinketAllocations } from '../../game-engine/commands/trinket';

export interface TrinketPolicyResult {
  next: CampaignState;
  decisions: {
    opportunityIds: string[];
    discardedAllocationIds: string[];
  };
}

/** Golden / Replay：所有 opportunity decline + 所有 allocation discard。 */
export function applyDeterministicTrinketPolicy(
  campaign: CampaignState,
  options?: { declineOpportunities?: boolean; discardAllocations?: boolean },
): TrinketPolicyResult {
  const declineOpts = options?.declineOpportunities ?? true;
  const discardAlloc = options?.discardAllocations ?? true;
  let next = campaign;

  const opportunityIds: string[] = [];
  if (declineOpts) {
    const open: TrinketUseOpportunity[] = campaign.pendingTrinketUseOpportunities;
    opportunityIds.push(...open.map((o) => o.id));
    next = declineAllTrinketOpportunities(next);
  }
  const discardedAllocationIds: string[] = [];
  if (discardAlloc) {
    discardedAllocationIds.push(
      ...campaign.pendingTrinketAllocations.map((a) => a.allocationId),
    );
    next = resolveAllPendingTrinketAllocations(next);
  }
  return { next, decisions: { opportunityIds, discardedAllocationIds } };
}
