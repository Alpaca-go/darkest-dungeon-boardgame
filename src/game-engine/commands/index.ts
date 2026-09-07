// Phase 11A.2 §11 — Production Commands Barrel。
//
// Store / Simulation Driver 都 import 这里；headless-shim 不再被引用。
// 禁止在 UI 组件中直接调用原子步骤（如 processBattleDeaths /
// openRoomEnteredWindows）；只能通过本模块。

export {
  proceedCampaignToLoadout,
  proceedCampaignToQuestSelect,
} from './setup';

export {
  settleBattleState,
  commitBattleVictory,
  commitBattleRetreat,
  BATTLE_MENTAL_GUARD_LIMIT,
  type BattleSettlementError,
  type BattleSettlementResult,
} from './battle';

export {
  enterDungeonRoom,
  type EnterRoomError,
  type EnterRoomResult,
} from './dungeon';

export {
  commitLeaveDungeon,
  commitQuestFailureFromDefeat,
  commitReturnToHamlet,
  type QuestCommandError,
  type QuestCommandResult,
  type ReturnToHamletInput,
  type ReturnToHamletResult,
} from './quest';

export {
  resolveOpenTrinketOpportunities,
  resolvePendingTrinketAllocations,
  resolveAllPendingTrinketAllocations,
  declineAllTrinketOpportunities,
  type TrinketDecision,
  type TrinketOpportunityDecision,
  type TrinketAllocationDecision,
} from './trinket';

export {
  retargetPendingReplacement,
  resolveReplacementsFlow,
  type ReplacementResumePhase,
  type DeterministicReplacementPolicy,
} from './replacement';
