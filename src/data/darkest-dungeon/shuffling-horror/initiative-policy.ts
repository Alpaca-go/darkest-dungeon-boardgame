// Phase 10D §12：Monster Initiative Priority Rule（VERIFIED，规则书 p30–31）。
// 这是整个动态行动优先级系统的核心已验证规则。

import { SHUFFLING_HORROR_STANCE_PRIORITY } from './ids';

export interface ShufflingHorrorInitiativePolicy {
  id: 'stance-priority-action-budget';
  cardType: 'monster-initiative-opportunity';
  /** §3 verified：stancePriority 固定顺序。 */
  stancePriority: ReadonlyArray<'aggressive' | 'defensive' | 'ranged' | 'support'>;
  /** §3 verified：Eligibility 规则（抽卡时依次判定）。 */
  eligibility: ['actor-alive', 'actor-in-instance-tracker', 'remaining-actions-greater-than-zero'];
  /** §3 verified：无 Eligible Actor 时的处理（抽卡即移除，硬约束 7）。 */
  excessPolicy: 'remove-when-drawn-if-no-eligible-actor';
  /** §3 verified：抽卡时按当前 Stance + 剩余行动解析 Actor（不绑定）。 */
  resolveAtDrawTime: true;
  officialDataStatus: 'verified';
}

export const SHUFFLING_HORROR_INITIATIVE_POLICY: ShufflingHorrorInitiativePolicy = {
  id: 'stance-priority-action-budget',
  cardType: 'monster-initiative-opportunity',
  stancePriority: SHUFFLING_HORROR_STANCE_PRIORITY,
  eligibility: ['actor-alive', 'actor-in-instance-tracker', 'remaining-actions-greater-than-zero'],
  excessPolicy: 'remove-when-drawn-if-no-eligible-actor',
  resolveAtDrawTime: true,
  officialDataStatus: 'verified',
};
