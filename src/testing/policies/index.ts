// Phase 11A.2.1 §12 — Test Policy 索引。
//
// Policy 入口：Golden / Replay / Integration 测试玩家决策统一从这里获取。
// Production Engine 只执行这些 policy 输出的合法决定，不隐藏玩家选择。

export {
  applyDeterministicTrinketPolicy,
  type TrinketPolicyResult,
} from './deterministic-trinket-policy';
export {
  applyDeterministicReplacementPolicy,
  type ReplacementPolicyResult,
} from './deterministic-replacement-policy';
export {
  applyDeterministicBattlePolicy,
  type BattlePolicyResult,
} from './deterministic-battle-policy';
