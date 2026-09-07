// Phase 11A.2.1 §15 — Deterministic Battle Policy。
//
// dev doc §15 流程：
//   读取 legal actions
//   → 选择合法 action
//   → 调 production battle command
//   → repeat
//
// 禁止：
//   - 直接改 HP
//   - 直接写 victory
//   - 跳过 trinket window
//   - 跳过 death/stress/disease
//
// Policy 通过 simulation-driver.autoPlayBattle 使用（与 Phase 11A.1 行为一致）。
// 这里仅暴露一个高阶 helper：调用 autoPlayBattle 走完整闭环。

import type { CampaignState } from '../../types';
import { autoPlayBattle } from '../../audit/core-campaign/simulation-driver';

export interface BattlePolicyResult {
  next: CampaignState;
  activeAtStart: boolean;
  activeAtEnd: boolean;
}

/** Golden / Replay：自动战斗直到 battle.status !== 'active' 或达到 maxSteps。 */
export function applyDeterministicBattlePolicy(
  campaign: CampaignState,
  options?: { maxSteps?: number },
): BattlePolicyResult {
  const activeAtStart = campaign.battle?.status === 'active';
  const next = autoPlayBattle(campaign, options?.maxSteps ?? 400);
  const activeAtEnd = next.battle?.status === 'active';
  return { next, activeAtStart, activeAtEnd };
}
