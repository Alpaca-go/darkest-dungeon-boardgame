// Phase 10C：Mammoth Cyst / White Cell Stalk / Teleportation 运行时桶文件。
//
// 分层约定（沿用 Phase 9A 建立、Phase 10B 复用的 Boss 家族范式）：
//   types/mammoth-cyst.ts             → 类型契约
//   data/darkest-dungeon/mammoth-cyst → 数据 + Registry + Data Gate
//   game-engine/bosses/mammoth-cyst   → 自包含纯函数运行时（本目录）
//
// 硬约束提醒：
// - 硬约束 1：不创建第二套 Battle / Initiative / Summon 状态机，本目录只产出「既有引擎能消费的数据」；
// - 硬约束 2：White Cell Stalk 是独立 BattleActor（boss-minion），绝不进入普通 Monster Deck；
// - 硬约束 20：official Mammoth Cyst 因资料缺失禁用，只有 prototype- 前缀 harness 可跑。

export {
  // 常量 / 幂等
  MAMMOTH_CYST_BATTLE_POSITION,
  WHITE_CELL_STALK_BATTLE_POSITION,
  mammothCystTransactionIds,
  hasProcessedMammothCystTransaction,
  withProcessedMammothCystTransaction,
  // 构建
  buildMammothCystUnit,
  createMammothCystInitiativeCardsFor,
  resolveMammothCystHeroAreas,
  createAreaEntryRuntimes,
  buildMammothCystBattle,
  // Setup（§9 / §11）
  setupMammothCystEncounter,
  // Initiative（§11 / §16）
  drawNextMammothCystInitiativeCard,
  advanceMammothCystRound,
  // Skill Table（§16）
  getMammothCystSkillTable,
  selectMammothCystSkillByRoll,
  rollMammothCystSkill,
  // Selector
  getMammothCystEncounterState,
  getMammothCystActorState,
  getMammothCystBossState,
  getAliveWhiteCellStalkCount,
  getActiveWhiteCellStalkState,
  isMammothCystAlive,
  getMammothCystHeroPlacement,
  getRemainingMammothCystInitiativeCount,
  getMammothCystAreaOccupancy,
} from './mammoth-cyst-runtime';
export type {
  SetupMammothCystEncounterOptions,
  SetupMammothCystEncounterResult,
  DrawMammothCystInitiativeResult,
  RollMammothCystSkillResult,
} from './mammoth-cyst-runtime';

export {
  isConditionalSummonConditionMet,
  decideMammothCystAction,
  willSkipNormalSkillRoll,
} from './mammoth-cyst-action-override';
export type {
  MammothCystActionType,
  MammothCystActionDecision,
} from './mammoth-cyst-action-override';

export {
  STANCE_ORDER,
  getOccupiedStances,
  resolveWhiteCellStalkSpawnSpace,
  summonWhiteCellStalk,
} from './summon-white-cell-stalk';
export type {
  SpawnSpaceResolution,
  SummonWhiteCellStalkOptions,
  SummonWhiteCellStalkResult,
} from './summon-white-cell-stalk';

export {
  resolveTeleportationTargetArea,
  checkTeleportationCapacity,
  buildAreaEntryHazardDefinition,
  resolveWhiteCellStalkTeleportation,
} from './resolve-teleportation';
export type {
  TeleportationTargetResolution,
  TeleportationCapacityCheck,
  ResolveTeleportationOptions,
  ResolveTeleportationResult,
} from './resolve-teleportation';

export {
  resolveMammothCystActorDefeat,
  willResummonOnNextCystAction,
  getWhiteCellStalkGeneration,
} from './white-cell-stalk-death';
export type { ResolveMammothCystActorDefeatResult } from './white-cell-stalk-death';

export { executeMammothCystAction } from './execute-mammoth-cyst-action';
export type {
  ExecuteMammothCystActionOptions,
  ExecuteMammothCystActionResult,
} from './execute-mammoth-cyst-action';

export {
  evaluateMammothCystVictoryFrom,
  evaluateMammothCystVictory,
  resolveMammothCystEncounterVictory,
  resolveMammothCystEncounterFailure,
  isPartyWipedInMammothCystEncounter,
} from './mammoth-cyst-victory';
export type {
  MammothCystVictoryEvaluation,
  ResolveMammothCystVictoryResult,
  ResolveMammothCystFailureResult,
} from './mammoth-cyst-victory';

export {
  getMammothCystAvailabilityReport,
  diffMammothCystSnapshot,
  sanitizeMammothCystEncounterState,
} from './mammoth-cyst-content-validation';
export type {
  MammothCystAvailabilityReport,
  MammothCystSnapshotDiff,
} from './mammoth-cyst-content-validation';
