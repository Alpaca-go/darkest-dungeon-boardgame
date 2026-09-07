// Phase 11A.2.1 §14 — Deterministic Replacement Policy。
//
// dev doc §14 流程：
//   find first unconfirmed slot
//   → getReplacementCandidates
//   → choose first selectable
//   → selectReplacementHero(deadCampaignHeroId)
//   → no upgrade
//   → confirmReplacement(deadCampaignHeroId)
//   → next slot
//
// 始终使用 deadCampaignHeroId（不是 PendingReplacementState.id）。
//
// Policy 不直接改 CampaignState —— 它调用 resolveReplacementsFlow（Production Command）。

import type { CampaignState, HeroInstance } from '../../types';
import { resolveReplacementsFlow } from '../../game-engine/commands/replacement';
import { HEROES } from '../../data/heroes';

export interface ReplacementPolicyResult {
  next: CampaignState;
  filledDeadHeroIds: string[];
}

/** Golden / Replay：取数据中第一个未在役 Hero，逐 slot 填入。 */
export function applyDeterministicReplacementPolicy(
  campaign: CampaignState,
  options?: { maxRounds?: number; pickHero?: (c: CampaignState) => string | null },
): ReplacementPolicyResult {
  const filledDeadHeroIds: string[] = [];
  // 记录原始 slot 数，循环结束后就知道填了几个。
  const originalSlots = campaign.stagecoach.pendingReplacement?.slots ?? [];

  const pickHero = options?.pickHero ?? defaultPickHero;
  const next = resolveReplacementsFlow(campaign, {
    maxRounds: options?.maxRounds ?? 8,
    pickHero,
  });

  for (const s of originalSlots) {
    if (s.confirmed) filledDeadHeroIds.push(s.deadCampaignHeroId);
  }
  return { next, filledDeadHeroIds };
}

function defaultPickHero(campaign: CampaignState): string | null {
  const inUseIds = new Set(campaign.heroes.map((h: HeroInstance) => h.heroId));
  for (const def of HEROES) {
    if (!inUseIds.has(def.id)) return def.id;
  }
  return null;
}
