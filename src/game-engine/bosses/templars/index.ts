// Phase 10B：The Templars 运行时桶文件。
//
// 分层约定（沿用 Phase 9A 建立的 Boss 家族范式）：
//   types/templars.ts        → 类型契约
//   data/darkest-dungeon/templars/ → 数据 + Registry + Data Gate
//   game-engine/bosses/templars/   → 自包含纯函数运行时（本目录）
//
// 硬约束提醒：
// - 不创建第二套 Battle / Initiative 状态机，本目录只产出「既有引擎能消费的数据」；
// - 两名 Templar 是两个独立 Boss Actor，绝不建 Group Actor；
// - official Templars 因资料缺失永久禁用，只有 prototype- 前缀 harness 可跑。

export {
  // 常量 / 幂等
  TEMPLAR_IMPALER_BATTLE_POSITION,
  TEMPLAR_WARLORD_BATTLE_POSITION,
  templarsTransactionIds,
  hasProcessedTemplarsTransaction,
  withProcessedTemplarsTransaction,
  // 构建
  buildTemplarUnit,
  createTemplarInitiativeCardsFor,
  createTemplarInitiativeSet,
  resolveHeroPlacementAreas,
  buildTemplarsBattle,
  // Setup（§10）
  setupTemplarsEncounter,
  // Initiative（§12）
  drawNextTemplarInitiativeCard,
  advanceTemplarsRound,
  // Skill Table（§13）
  getTemplarSkillTable,
  selectTemplarSkillByRoll,
  rollTemplarSkill,
  // 单名死亡（§20）
  resolveTemplarDefeat,
  // Selector
  getTemplarsEncounterState,
  getTemplarActorState,
  getTemplarActorStateByRole,
  getAliveTemplarActorIds,
  isTemplarAlive,
  getTemplarsHeroPlacement,
  getRemainingInitiativeCardCount,
} from './templars-runtime';
export type {
  SetupTemplarsEncounterOptions,
  SetupTemplarsEncounterResult,
  DrawTemplarInitiativeResult,
  RollTemplarSkillResult,
  ResolveTemplarDefeatResult,
} from './templars-runtime';

export {
  buildDualBossEncounterState,
  getDualBossMember,
  checkDualBossStructure,
  areAllDualBossMembersDefeated,
} from './dual-boss-encounter';
export type {
  DualBossEncounterRuntimeState,
  DualBossStructureCheck,
} from './dual-boss-encounter';

export { skillTriggersPitToss, evaluateBodySlamHook } from './body-slam-hook';
export type { EvaluateBodySlamHookParams, BodySlamHookResult } from './body-slam-hook';

export { resolvePitToss, getLastPitTossForHero, getPitTossD10Map } from './resolve-pit-toss';
export type { ResolvePitTossParams, ResolvePitTossResult } from './resolve-pit-toss';

export {
  evaluateDualBossVictory,
  evaluateTemplarsVictory,
  resolveTemplarsEncounterVictory,
  resolveTemplarsEncounterFailure,
  isPartyWipedInTemplarsEncounter,
} from './templars-victory';
export type {
  EvaluateDualBossVictoryParams,
  ResolveTemplarsVictoryResult,
  ResolveTemplarsFailureResult,
} from './templars-victory';

export {
  resolveTemplarsEndTurnPitEffects,
  resolveTemplarsPitTrigger,
  SPIKED_PIT_IS_BATTLE_ACTOR,
  isHeroInAnyPit,
  getPitOccupants,
  getHazardEventsByTrigger,
} from './templars-pit-triggers';
export type {
  ResolveTemplarsPitTriggerResult,
  TemplarsPeriodicPitTrigger,
} from './templars-pit-triggers';

export {
  getTemplarsAvailabilityReport,
  diffTemplarsSnapshot,
  sanitizeTemplarsEncounterState,
} from './templars-content-validation';
export type {
  TemplarsAvailabilityReport,
  TemplarsSnapshotDiff,
} from './templars-content-validation';
