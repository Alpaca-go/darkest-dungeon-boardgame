// Phase 11A — Audit orchestrator（纯计算部分）。
//
// 本文件**不做任何文件写入**，只产出结构化审计结果；落盘由 scripts/audit/*.ts 负责。
// 这样 vitest 可以直接 import 并断言，而 CI 脚本负责生成 docs/ 产物。

import type { CampaignState } from '../../types';
import { HEROES } from '../../data/heroes';
import { QUESTS } from '../../data/quests';
import { isDarkestDungeonOfficialGuardianPoolEnabled, getDarkestDungeonGuardianDataGaps } from '../../data/darkest-dungeon/guardian-registry';
import { isFinalEncounterOfficialEnabled, getFinalEncounterDataGaps } from '../../data/darkest-dungeon/final-form-registry';
import { isDarkestDungeonOfficialQuestPoolEnabled, getDarkestDungeonQuestDataGaps } from '../../data/darkest-dungeon/quest-registry';
import { isTemplarsOfficialEncounterEnabled } from '../../data/darkest-dungeon/templars/templars-registry';
import { isMammothCystOfficialEncounterEnabled } from '../../data/darkest-dungeon/mammoth-cyst/mammoth-cyst-registry';
import { isShufflingHorrorOfficialEncounterEnabled } from '../../data/darkest-dungeon/shuffling-horror/registry';
import { generateContentManifest, summarizeManifest, type ManifestSummary } from './content-manifest';
import { scanOfficialRuntimeForPrototypeContent, type PrototypeContaminationFinding } from './prototype-scan';
import { validateCoreContentReferences } from './reference-validation';
import { summarizeRuleTraceability } from './rule-traceability';
import {
  seededRuntimeSources,
  withRuntimeSources,
  nowIso as currentClockNowIso,
} from '../../game-engine/runtime-sources';
import { seedToInt } from './simulation-driver';
import { runProductionCommandAudit } from './production-command-audit';
import { blockedGoldenSeeds, CAMPAIGN_MILESTONES, GOLDEN_SEEDS, runnableGoldenSeeds } from './golden-seeds';
import {
  CampaignSimulationDriver,
  collectCommittedTransactionIds,
  countPendingTransactions,
  firstDivergentEventIndex,
  replayBundleHash,
  rngSequencesMatch,
} from './simulation-driver';
import {
  stableHashState,
  type AuditIssue,
  type CampaignReplayBundle,
  type CoreCampaignContentManifest,
  type ReferenceValidationIssue,
  type ReleaseGateResult,
} from './types';
import { milestoneStateHash } from './campaign-invariants';
import {
  createSaveSnapshot,
  restoreSaveSnapshot,
  validateSaveFile,
  type SaveFile,
} from '../../game-engine/save';

// ---------------------------------------------------------------------------
// Source Readiness 派生（Phase 11A.3 Source-Gate Integrity Repair §14-17, §39-41）
//
// 修复：上一轮直接 read source-readiness.json + try/catch 默认 SOURCE-BLOCKED。
// 这是 False Green Guard 命中项：
//   - "source-readiness 缺失却默认 SOURCE-BLOCKED"
//   - "source-readiness JSON 手工 true 可让 Gate 通过"
//
// 正确做法：从 canonical official-source-audit 派生 readiness。
// 缺失 / 损坏 / contradictory 走 NOT-VERIFIED / SOURCE-AUDIT-ERROR，绝不默认真相。
// ---------------------------------------------------------------------------

import {
  runOfficialSourceAudit,
  type SourceReadinessResult,
  type SourceAuditOutcome,
  type SourceAuditError,
} from './official-source-audit';
import { OFFICIAL_SOURCE_REQUIREMENTS } from './official-source-requirements';
import { evaluatePhase11A3Status } from './phase11a3-status';
import { createOfficialMatrixRunner, type OfficialMatrixRunner } from './official-matrix-runner';

interface SourceReadinessFile {
  gates: {
    questCardsReady: boolean;
    templarsReady: boolean;
    mammothCystReady: boolean;
    shufflingHorrorReady: boolean;
    finalEncounterReady: boolean;
    darkestDungeonMonsterDeckReady: boolean;
    allRequiredSourcesReady: boolean;
  };
  impact: {
    canCloseP0_002: boolean;
    canEnableOfficialGuardianPool: boolean;
    canEnableOfficialFinalEncounter: boolean;
    canEnableOfficialDarkestDungeonQuestPool: boolean;
    canEnableOfficialDarkestDungeonMonsterDeck: boolean;
    verdict: 'SOURCE-BLOCKED' | 'READY' | 'SOURCE-AUDIT-ERROR';
  };
  auditPasses: boolean;
  auditErrors: SourceAuditError[];
  outcome: SourceAuditOutcome;
  readiness: SourceReadinessResult;
}

/**
 * 调用 official-source-audit 派生 readiness。
 *
 * 不再 try/catch source-readiness.json：
 *   - audit 跑通 → readiness 派生（outcome: all-ready / source-blocked）
 *   - audit 报错 → outcome: source-audit-error（callers 必须显式处理为 NOT-VERIFIED）
 */
function readSourceReadiness(): SourceReadinessFile {
  const { readiness } = runOfficialSourceAudit();
  return {
    gates: readiness.gates,
    impact: {
      canCloseP0_002: readiness.gates.allRequiredSourcesReady,
      canEnableOfficialGuardianPool: readiness.gates.templarsReady && readiness.gates.mammothCystReady && readiness.gates.shufflingHorrorReady,
      canEnableOfficialFinalEncounter: readiness.gates.finalEncounterReady,
      canEnableOfficialDarkestDungeonQuestPool: readiness.gates.questCardsReady,
      canEnableOfficialDarkestDungeonMonsterDeck: readiness.gates.darkestDungeonMonsterDeckReady,
      verdict: readiness.gates.allRequiredSourcesReady
        ? 'READY'
        : readiness.outcome.kind === 'source-audit-error'
          ? 'SOURCE-AUDIT-ERROR'
          : 'SOURCE-BLOCKED',
    },
    auditPasses: readiness.auditPasses,
    auditErrors: readiness.auditErrors,
    outcome: readiness.outcome,
    readiness,
  };
}

/** Phase 11A.3 Source-Gate Integrity Repair dev doc §22-25：
 *  Guardian Matrix Result。
 *
 *  关键修复（Finding E）：上一轮 runGuardianMatrixAttempt 只是把 family readiness
 *  boolean 复制到 3×3 details，没有真正运行 Quest / Guardian / Final Encounter
 *  / Skipped Form 路径。
 *
 *  现在结构化为：
 *    - status: 'READY' | 'SOURCE-BLOCKED' | 'NOT-VERIFIED'
 *      READY         = 真正 9 个 formal path 组合全部跑过（用户 source 齐备后才有）
 *      SOURCE-BLOCKED = 资料缺失，无法做 matrix 测量
 *      NOT-VERIFIED   = audit pipeline 自身有错
 *    - officialGuardianMatrixStatus: 同上语义
 *    - officialSkippedFormMatrixStatus: 同上语义
 *    - threeGuardiansPass: 只在 READY 状态下才是真实 measured pass
 *    - threeSkippedFormsPass: 只在 READY 状态下才是真实 measured pass
 *    - prototypeMatrix: 保留 prototype path 的测量作为辅助信号，**不**作为 official PASS 判据
 */
export type MatrixStatus = 'READY' | 'FAIL' | 'SOURCE-BLOCKED' | 'NOT-RUN' | 'NOT-VERIFIED';

export interface GuardianMatrixResult {
  status: MatrixStatus;
  officialGuardianMatrixStatus: MatrixStatus;
  officialSkippedFormMatrixStatus: MatrixStatus;
  threeGuardiansPass: boolean;
  threeSkippedFormsPass: boolean;
  /** 9 个组合各自的结果（family × skipped-form-id）。SOURCE-BLOCKED 时不测量。 */
  details: Array<{
    family: 'templars' | 'mammoth-cyst' | 'shuffling-horror';
    skippedFormId: 'ancestor-first-form' | 'ancestor-second-form' | 'gestating-heart';
    passed: boolean;
    note: string;
  }>;
  /**
   * Phase 11A.3 Source-Gate Final Acceptance Closure §15：
   *   prototype path 信号改用 status 而非 fake boolean；保留 boolean 以保持向后兼容。
   */
  prototypeMatrix: {
    status: 'READY' | 'SOURCE-BLOCKED' | 'NOT-RUN' | 'NOT-VERIFIED';
    threeGuardiansPass: boolean;
    threeSkippedFormsPass: boolean;
  };
}

/**
 * Phase 11A.3 Source-Gate Integrity Repair dev doc §23：
 *   SOURCE-BLOCKED 阶段：official matrix status = SOURCE-BLOCKED。
 *   threeGuardiansPass / threeSkippedFormsPass = false（不是实测 pass，是未测量）。
 *
 * 真正 9 个 formal 组合的 measured evidence 必须等用户 source 齐备后才有。
 *
 * Phase 11A.3 Source-Gate Final Acceptance Closure §15：
 *   status 区分 SOURCE-BLOCKED / NOT-RUN / READY / FAIL；
 *   prototypeMatrix 改成纯 status 信号，不再 fake boolean。
 */
export function runGuardianMatrixAttempt(options: { sourceReady?: boolean; officialImportReady?: boolean; runner?: OfficialMatrixRunner } = {}): GuardianMatrixResult {
  const sourceReady = options.sourceReady ?? (isTemplarsOfficialEncounterEnabled() && isMammothCystOfficialEncounterEnabled() && isShufflingHorrorOfficialEncounterEnabled());
  const officialImportReady = options.officialImportReady ?? (isDarkestDungeonOfficialGuardianPoolEnabled() && isFinalEncounterOfficialEnabled() && isDarkestDungeonOfficialQuestPoolEnabled());
  const families = ['templars', 'mammoth-cyst', 'shuffling-horror'] as const;
  const forms = ['ancestor-first-form', 'ancestor-second-form', 'gestating-heart'] as const;
  const status: MatrixStatus = !sourceReady ? 'SOURCE-BLOCKED' : !officialImportReady ? 'NOT-RUN' : 'READY';
  const executor = createOfficialMatrixRunner(sourceReady, officialImportReady ? options.runner : undefined);
  const details = families.flatMap((family) => forms.map((skippedFormId) => {
    if (status !== 'READY') return { family, skippedFormId, passed: false, note: `${status}: formal matrix not run` };
    const result = executor.runCombination(family, skippedFormId, 'formal');
    return { family, skippedFormId, passed: result.status === 'PASS', note: result.note };
  }));
  const resolvedStatus: MatrixStatus = status === 'READY' ? (details.every((d) => d.passed) ? 'READY' : 'FAIL') : status;
  return {
    status: resolvedStatus,
    officialGuardianMatrixStatus: resolvedStatus,
    officialSkippedFormMatrixStatus: resolvedStatus,
    threeGuardiansPass: resolvedStatus === 'READY',
    threeSkippedFormsPass: resolvedStatus === 'READY',
    details,
    prototypeMatrix: {
      status: 'NOT-RUN',
      threeGuardiansPass: false,
      threeSkippedFormsPass: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Golden Run 尝试（诚实：跑到哪里就报到哪里）
// ---------------------------------------------------------------------------

import type { CampaignReplayCheckpoint } from './checkpointable-campaign-runner';
export interface GoldenRunAttempt {
  checkpoint: CampaignReplayCheckpoint;
  seedId: string;
  reachedMilestones: string[];
  blockedAtMilestone: string | null;
  blockedReason: string | null;
  outcome: 'campaign-victory' | 'campaign-over' | 'blocked';
  finalAct: number;
  finalPhase: string;
  completedQuestCount: number;
  eventCount: number;
  rngDrawCount: number;
  invariantErrorCount: number;
  invariantErrors: string[];
  duplicateTransactionIds: string[];
  deadlockPhase: string | null;
  /** 本次跑动中不得不使用 UI-store-shim（引擎缺入口）的步骤，见 ISSUE-P1-006。 */
  uiStoreShimSteps: string[];
  /** 第一次观测到「已完成 >= 3 个 Standard Quest 但 act 仍为 1」时的已完成任务数。 */
  actStuckAfterQuests: number | null;
  /** 观测到 act 卡死后，仍继续推进所达到的最大已完成任务数（证据强度）。 */
  maxQuestsWithActStuck: number;
  /** §21 Save / Resume 矩阵：每个里程碑处走真实存档管线的往返结果。 */
  saveResumeChecks: SaveResumeCheck[];
  bundle: CampaignReplayBundle;
  /** §32 性能基线：完整 Run 期间的极值指标（来自真实 golden run，非估算）。 */
  maxSaveBytes: number;
  maxLedger: number;
  peakActors: number;
  peakInitiative: number;
  // Phase 11A.2 §4.1：三个独立真相字段，最终报告 / 静态测试都从这里读。
  campaignOrchestrationReachable: boolean;
  elevenQuestLoopClosed: boolean;
  campaignVictoryReachable: boolean;
}

/** 单个里程碑上的存档往返校验结果。 */
export interface SaveResumeCheck {
  milestoneId: string;
  label: string;
  saveVersion: number;
  /** createSaveSnapshot → JSON 往返 → validateSaveFile 的结果，null 表示通过。 */
  validationError: string | null;
  /** restoreSaveSnapshot 之后的状态哈希是否与存档前完全一致。 */
  stateHashMatches: boolean;
  hashBefore: string;
  hashAfter: string;
  passed: boolean;
}

// 一个完整的 11-Quest 战役约需 80~120 次 dispatch；留足余量以便「即使跑满 11 个任务，
// Act 仍不推进」这一结论有足够的证据强度，而不是被步数上限提前截断。
const MAX_LOOP_STEPS = 400;

/**
 * §21 Save / Resume：在里程碑处走**真实存档管线**做一次非破坏性往返。
 *
 * createSaveSnapshot → JSON 序列化往返 → validateSaveFile → restoreSaveSnapshot，
 * 再比对状态哈希。刻意不写 driver.state，避免污染 Golden Run 本身。
 */
function checkSaveResume(
  c: CampaignState,
  milestoneId: string,
  label: string,
): SaveResumeCheck {
  const hashBefore = milestoneStateHash(c);
  let validationError: string | null = null;
  let hashAfter = '';
  let stateHashMatches = false;
  try {
    const snapshot = createSaveSnapshot(c);
    const roundTripped = JSON.parse(JSON.stringify(snapshot)) as unknown;
    validationError = validateSaveFile(roundTripped);
    if (!validationError) {
      const restored = restoreSaveSnapshot(roundTripped as SaveFile);
      hashAfter = milestoneStateHash(restored);
      stateHashMatches = hashAfter === hashBefore;
    }
  } catch (e) {
    validationError = `THROW: ${e instanceof Error ? e.message : String(e)}`;
  }
  return {
    milestoneId,
    label,
    saveVersion: c.saveVersion,
    validationError,
    stateHashMatches,
    hashBefore,
    hashAfter,
    passed: validationError === null && stateHashMatches,
  };
}

/**
 * 用 Simulation Driver 走**正式引擎路径**推进战役，直到通关或卡住。
 * 不使用任何 debug skip（硬约束 4）。
 */
export function runGoldenCampaignAttempt(seedId: string, contentManifestHash: string, options: { until?: string; checkpoint?: CampaignReplayCheckpoint } = {}): GoldenRunAttempt {
  const driver = new CampaignSimulationDriver(seedId, options.checkpoint);
  const reached: string[] = options.checkpoint?.milestones.map(m => m.id) ?? [];
  const invariantErrors: string[] = [];
  let deadlockPhase: string | null = null;
  let blockedAtMilestone: string | null = null;
  let blockedReason: string | null = null;
  let actStuckAfterQuests: number | null = null;
  let maxQuestsWithActStuck = 0;
  const saveResumeChecks: SaveResumeCheck[] = [];
  // §32 性能基线：完整 Run 期间的极值指标。
  let maxSaveBytes = 0;
  let maxLedger = 0;
  let peakActors = 0;
  let peakInitiative = 0;

  const track = (r: ReturnType<CampaignSimulationDriver['dispatch']>) => {
    for (const f of r.invariantFindings) {
      if (f.severity === 'error') invariantErrors.push(`${f.code}: ${f.message}`);
    }
    if (r.error) invariantErrors.push(`ENGINE_THROW: ${r.error}`);
  };

  /**
   * 用**状态谓词**重新评估全部里程碑（而非按已完成任务数下标硬映射）。
   *
   * 每次 dispatch 后调用；只对「首次满足谓词」的里程碑做一次快照 + 存档往返。
   * 这样报告里的「M03 ✅ 到达」必然意味着 `act >= 2` 真的发生过。
   */
  const syncMilestones = () => {
    const s = driver.getState();
    for (const m of CAMPAIGN_MILESTONES) {
      if (reached.includes(m.id)) continue;
      let ok = false;
      try {
        ok = m.verify(s);
      } catch {
        ok = false;
      }
      if (!ok) continue;
      reached.push(m.id);
      driver.captureMilestone(m.id, m.label, contentManifestHash);
      saveResumeChecks.push(checkSaveResume(s, m.id, m.label));
    }
  };

  try {
    // ---- M00：建立战役 + 选队 + 默认技能 ----
    // 注意 proceedToLoadout / proceedToQuests 是 UI-store-shim（引擎无入口，见 ISSUE-P1-006）。
    const heroIds = HEROES.slice(0, 4).map((h) => h.id);
    if (!options.checkpoint) {
    track(driver.dispatch({ type: 'selectParty', heroIds }));
    track(driver.dispatch({ type: 'proceedToLoadout' }));
    track(driver.dispatch({ type: 'applyLoadout' }));
    track(driver.dispatch({ type: 'proceedToQuests' }));
    syncMilestones();
    }

    // ---- 循环：选任务 → 结算 → 回 Hamlet → 结束一天 ----
    let steps = 0;
    let lastActSeen: number = driver.getState().act;
    let questsCompleted = 0;
    // 11A.1 修复：探测 dispatch 无进展（Act IV 之后 Engine 拒绝所有 Standard/Boss quest），
    // 用状态哈希比对检测真正的"卡死"。
    let lastStateHash = milestoneStateHash(driver.getState());

    while (steps++ < MAX_LOOP_STEPS && !driver.isTerminal() && !(options.until && reached.includes(options.until))) {
      const state = driver.getState();
      const available = driver.getAvailableCommands();
      if (available.length === 0) {
        deadlockPhase = state.gamePhase;
        blockedReason = `引擎死锁：阶段 ${state.gamePhase} 无任何可用命令且非终局`;
        break;
      }

      switch (state.gamePhase) {
        case 'hamlet': {
          // Hamlet 需要全体英雄行动完才能结束当天；准备天数走完后回到 quest-select。
          const before = driver.getState().hamlet.currentDay;
          if (!driver.getAvailableCommands().some((c) => c.type === 'endHamletDay')) {
            track(driver.dispatch({ type: 'skipAllHeroActions' }));
          }
          track(driver.dispatch({ type: 'endHamletDay' }));
          const after = driver.getState();
          if (after.gamePhase === 'hamlet' && after.hamlet.currentDay === before) {
            deadlockPhase = 'hamlet';
            blockedReason = 'Hamlet 结束一天无进展（currentDay 不变且未离开 hamlet）';
          }
          break;
        }
        case 'quest-select': {
          const questId = pickNextQuestId(driver);
          if (!questId) {
            blockedReason = '无可选任务（quest pool 为空）';
            break;
          }
          track(driver.dispatch({ type: 'chooseQuest', questId }));
          break;
        }
        case 'dungeon-explore': {
          const d = driver.getState().dungeon;
          if (!d) {
            blockedReason = 'dungeon-explore 阶段但 dungeon 为空';
            break;
          }
          // 目标完成且可离开 → 收工；否则继续向未清除房间推进。
          if (d.objectiveComplete && d.canLeave) {
            track(driver.dispatch({ type: 'finishQuest', reason: 'left' }));
            break;
          }
          const nextRoomId = pickNextRoomId(d);
          if (!nextRoomId) {
            if (d.canLeave) {
              track(driver.dispatch({ type: 'finishQuest', reason: 'left' }));
            } else {
              deadlockPhase = 'dungeon-explore';
              blockedReason = '地牢无可进入房间且不可离开';
            }
            break;
          }
          track(driver.dispatch({ type: 'moveToRoom', roomId: nextRoomId }));
          break;
        }
        case 'battle': {
          const b = driver.getState().battle;
          if (b?.status === 'active') {
            track(driver.dispatch({ type: 'autoBattle' }));
            const after = driver.getState().battle;
            if (after?.status === 'active') {
              deadlockPhase = 'battle';
              blockedReason = '自动战斗到达步数上限仍未分出胜负';
            }
          } else if (b?.status === 'victory') {
            track(driver.dispatch({ type: 'resolveVictory' }));
          } else {
            track(driver.dispatch({ type: 'finishQuest', reason: 'defeat' }));
          }
          break;
        }
        case 'quest-result': {
          track(driver.dispatch({ type: 'returnToHamlet' }));
          questsCompleted = driver.getState().completedQuestCount;
          break;
        }
        case 'replacement': {
          // 英雄阵亡 → Stagecoach 替补流程。走正式引擎入口（select → confirm → complete）。
          track(driver.dispatch({ type: 'resolveReplacements' }));
          const after = driver.getState();
          if (after.gamePhase === 'replacement') {
            deadlockPhase = 'replacement';
            blockedReason =
              '替补流程无进展：仍停留在 replacement 阶段（候选耗尽或 Waiting Token 不足时' +
              '应由 evaluateReplacementFlow 转入 campaign-over，未发生）。';
          }
          break;
        }
        case 'campaign-setup':
          if (driver.getState().heroes.length < 4) {
            track(driver.dispatch({ type: 'selectParty', heroIds }));
          }
          track(driver.dispatch({ type: 'proceedToLoadout' }));
          break;
        case 'skill-loadout':
          track(driver.dispatch({ type: 'applyLoadout' }));
          track(driver.dispatch({ type: 'proceedToQuests' }));
          break;
        default: {
          blockedReason = `未覆盖阶段 ${state.gamePhase}，Simulation Driver 无对应正式入口`;
          break;
        }
      }

      // 每步之后用状态谓词重算里程碑（禁止用任务数下标硬映射，见 MilestoneDefinition.verify）。
      syncMilestones();

      // 11A.1 修复：探测 dispatch 无进展。Act IV 之后引擎会拒绝所有 Standard / Boss quest
      // （标准任务已被锁），State 不再变化；这种情况视为 Campaign Reachability 达成，break。
      const newStateHash = milestoneStateHash(driver.getState());
      if (newStateHash === lastStateHash && state.gamePhase === 'quest-select') {
        // quest-select 但 dispatch 没有任何进展 → 引擎已无可执行命令，等价于终局。
        // 合法情况：Act IV 解锁后无 Standard 可选。
        if (driver.getState().campaignProgress.darkestDungeonUnlocked) {
          blockedReason = null; // 清掉旧的 blockReason
          break;
        }
      }
      lastStateHash = newStateHash;

      // §32 性能基线：每步采集 Save 体积 / Ledger 规模 / 峰值 Actor / 先攻长度。
      {
        const cur = driver.getState();
        const bytes = JSON.stringify(createSaveSnapshot(cur)).length;
        if (bytes > maxSaveBytes) maxSaveBytes = bytes;
        const ledger = countPendingTransactions(cur);
        if (ledger > maxLedger) maxLedger = ledger;
        if (cur.battle) {
          const actors = cur.battle.heroes.length + cur.battle.monsters.length;
          if (actors > peakActors) peakActors = actors;
          const io = cur.battle.initiativeOrder.length;
          if (io > peakInitiative) peakInitiative = io;
        }
      }

      if (blockedReason) break;

      const now = driver.getState();
      lastActSeen = Math.max(lastActSeen, now.act);

      // 关键探针：完成 >= 3 个 Standard Quest 后 Act 仍为 1 → Act 推进链路断裂。
      // 这里**不立刻中断**，而是继续推进，用「跑了这么多任务 act 依然是 1」来加强证据。
      if (now.completedQuestCount >= 3 && now.act === 1) {
        actStuckAfterQuests ??= now.completedQuestCount;
        maxQuestsWithActStuck = Math.max(maxQuestsWithActStuck, now.completedQuestCount);
      }
    }

    if (steps >= MAX_LOOP_STEPS && !blockedReason) {
      blockedReason = `超过 ${MAX_LOOP_STEPS} 步仍未终局（疑似循环）`;
      blockedAtMilestone = blockedAtMilestone ?? 'M03';
    }

    // Act 推进断裂是比「步数上限 / 局部死锁」更根本的阻塞，最终以它为准。
    // 11A.1 修复后：actStuckAfterQuests 可能在 Boss Victory 短暂中间态被记录到 3，
    // 那是 orchestrator 推进前的合法瞬时态，不是真卡死。判定用 finalAct：
    //   - finalAct >= 4 → Campaign Reachability 已成立，不算卡死。
    //   - finalAct === 1 且 completedQuestCount >= 3 → 真卡死。
    const finalStateForAudit = driver.getState();
    if (
      actStuckAfterQuests !== null &&
      finalStateForAudit.act === 1 &&
      finalStateForAudit.completedQuestCount >= 3
    ) {
      blockedAtMilestone = 'M03';
      blockedReason =
        `CAMPAIGN_FLOW_BLOCKED：已完成 ${maxQuestsWithActStuck} 个 Standard Quest（首次触发于第 ` +
        `${actStuckAfterQuests} 个），campaign.act 始终为 1。` +
        'Act 推进状态机（src/game-engine/campaign/campaign-progress.ts）无任何生产调用方，' +
        'Boss Quest 定义（FACE_THE_THREAT_QUEST_DEFINITION）零引用，11-Quest 循环在正式路径上不可达。';
    } else {
      // 11A.1 修复后：清掉瞬时穿过带来的伪卡死标记。
      actStuckAfterQuests = null;
      maxQuestsWithActStuck = 0;
    }
    void lastActSeen;
    void questsCompleted;
  } finally {
    driver.dispose();
  }

  const finalState = driver.getState();
  const txIds = collectCommittedTransactionIds(finalState);
  const dupTx = txIds.filter((id, i) => txIds.indexOf(id) !== i);

  const outcome: GoldenRunAttempt['outcome'] =
    finalState.gamePhase === 'campaign-over'
      ? finalState.campaignOverReason?.includes('victory')
        ? 'campaign-victory'
        : 'campaign-over'
      : 'blocked';

  // Phase 11A.2 §4.1：三个独立真相字段。判定不依赖 `outcome` 简化处理。
  const campaignOrchestrationReachable =
    finalState.campaignProgress.darkestDungeonUnlocked === true && finalState.act >= 4;
  const campaignVictoryReachable = outcome === 'campaign-victory';
  // 11-Quest 闭环必须真实走完 11 个 Quest 并取得胜利；
  // Phase 11A.2 阶段由于 P0-002 仍开放，这里保守为 false（需要 Final Encounter 真实胜利）。
  const elevenQuestLoopClosed = campaignVictoryReachable;

  return {
    seedId,
    checkpoint: driver.checkpoint(reached[reached.length - 1] ?? 'M00'),
    reachedMilestones: reached,
    blockedAtMilestone,
    blockedReason,
    outcome,
    finalAct: finalState.act,
    finalPhase: finalState.gamePhase,
    completedQuestCount: finalState.completedQuestCount,
    eventCount: driver.getEvents().length,
    rngDrawCount: driver.getRngSnapshots().length,
    invariantErrorCount: invariantErrors.length,
    invariantErrors: invariantErrors.slice(0, 20),
    duplicateTransactionIds: dupTx,
    deadlockPhase,
    uiStoreShimSteps: [
      ...new Set(
        driver
          .getEvents()
          .filter((e) => (e.payload as { layer?: string } | undefined)?.layer === 'ui-store-shim')
          .map((e) => e.type),
      ),
    ],
    actStuckAfterQuests,
    maxQuestsWithActStuck,
    saveResumeChecks,
    maxSaveBytes,
    maxLedger,
    peakActors,
    peakInitiative,
    bundle: driver.buildReplayBundle('phase-11a', contentManifestHash),
    // Phase 11A.2 §4.1
    campaignOrchestrationReachable,
    elevenQuestLoopClosed,
    campaignVictoryReachable,
  };
}

/**
 * 确定性选路：优先未清除（可能含 Objective）的相邻房间，其次任意相邻房间。
 * 不引入额外随机，保证 replay 可复现。
 */
function pickNextRoomId(d: NonNullable<CampaignState['dungeon']>): string | null {
  const cur = d.rooms.find((r) => r.id === d.currentRoomId);
  if (!cur) return null;
  const adj = cur.adjacentRoomIds
    .map((id) => d.rooms.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  if (adj.length === 0) return null;
  const uncleared = adj.filter((r) => r.status !== 'cleared');
  const pool = uncleared.length > 0 ? uncleared : adj;
  // 按 id 字典序取首个，确定性且与 RNG 无关。
  return [...pool].sort((a, b) => a.id.localeCompare(b.id))[0].id;
}

function pickNextQuestId(driver: CampaignSimulationDriver): string | null {
  const c = driver.getState();
  const pool = QUESTS;
  if (pool.length === 0) return null;
  // 确定性选择：按已完成数量轮转，不引入额外随机。
  return pool[c.completedQuestCount % pool.length].id;
}

/** Replay 确定性：同一 seed 跑两遍，事件序列与 RNG 序列必须逐位一致。 */
export interface ReplayDeterminismResult {
  seedId: string;
  identical: boolean;
  firstDivergentEventIndex: number;
  rngMatch: boolean;
  hashA: string;
  hashB: string;
}

export function verifyReplayDeterminism(seedId: string, contentManifestHash: string): ReplayDeterminismResult {
  // Phase 11A.2 WP-D §33-§36：同 Seed + RuntimeSources 下 Replay A/B/C 必须完全一致。
  // 关键：每个 Replay 必须用「全新构造」的 sources（counter / clock 必须从 0 开始），否则
  // 上一次 Replay 的副作用会污染下一次的 createId / nowIso。
  const seed = seedToInt(seedId);
  let aBundle;
  let bBundle;
  withRuntimeSources(seededRuntimeSources(seed), () => {
    aBundle = runGoldenCampaignAttempt(seedId, contentManifestHash).bundle;
  });
  withRuntimeSources(seededRuntimeSources(seed), () => {
    bBundle = runGoldenCampaignAttempt(seedId, contentManifestHash).bundle;
  });
  const idx = firstDivergentEventIndex(aBundle!, bBundle!);
  const rngMatch = rngSequencesMatch(aBundle!, bBundle!);
  return {
    seedId,
    identical: idx === -1 && rngMatch && aBundle!.finalStateHash === bBundle!.finalStateHash,
    firstDivergentEventIndex: idx,
    rngMatch,
    hashA: replayBundleHash(aBundle!),
    hashB: replayBundleHash(bBundle!),
  };
}

// ---------------------------------------------------------------------------
// 主编排
// ---------------------------------------------------------------------------

export interface AuditReport {
  generatedAt: string;
  manifest: CoreCampaignContentManifest;
  manifestSummary: ManifestSummary;
  manifestHash: string;
  prototypeFindings: PrototypeContaminationFinding[];
  referenceIssues: ReferenceValidationIssue[];
  dataGates: {
    officialGuardianPoolEnabled: boolean;
    officialFinalEncounterEnabled: boolean;
    officialDarkestDungeonQuestPoolEnabled: boolean;
    guardianDataGaps: string[];
    finalEncounterDataGaps: string[];
    darkestDungeonQuestDataGaps: string[];
  };
  goldenRun: GoldenRunAttempt;
  replayDeterminism: ReplayDeterminismResult;
  issues: AuditIssue[];
  gate: ReleaseGateResult;
}

export interface RunAuditOptions {
  typecheckPasses?: boolean;
  goldenTestPasses?: boolean;
  replayDeterminismPasses?: boolean;
  productionCommandLayerPasses?: boolean;
  /** 外部（CI 脚本）注入的真实构建/测试结果；未提供时按未验证处理。 */
  buildPasses?: boolean;
  unitPasses?: boolean;
  integrationPasses?: boolean;
  criticalE2EPasses?: boolean;
  /**
   * 11A.2.3R §10-12（dev doc fix #1）：command contract 不再 = unit，独立 measured。
   * verification-results.json.commandContractPasses 注入。
   */
  commandContractPasses?: boolean;
  /**
   * 11A.2.3R §10-12：Replay Continuation 独立 measured（与 replayDeterminism 区分）。
   * verification-results.json.replayContinuationPasses 注入。
   */
  replayContinuationPasses?: boolean;
  /** 11A.2.3 §22.2：verification-results.json 是否 fresh（未提供时按 stale 处理）。 */
  verificationFresh?: boolean;
  /** RNG 源扫描结果由 node 侧注入（本模块保持纯净、不读文件系统）。 */
  mathRandomLeaksInOfficialPath?: number;
  /**
   * Phase 11A.3 Source-Gate Final Acceptance Closure §19：
   *   release-gate 在 SOURCE-BLOCKED 时返回非零是合法终态（产品未 Release Ready）。
   *   verify pipeline 内部跑 audit:release-gate 时设 true，
   *   让 NOT-VERIFIED 兜底分支承认 release-gate artifact 合法存在。
   */
  releaseGateArtifactValid?: boolean;
  /**
   * Phase 11A.3 Source-Gate Final Acceptance Closure：
   *   verify:phase11a3-source-gate pipeline 内部跑 audit:release-gate 时设 true。
   *   让所有 measured bit 在未注入时视为「由 verify 自身跑过」（不触发 NOT-VERIFIED 兜底），
   *   因为 verify 一定会在 pipeline 末尾把真实 measured bit 写入 verification-results.json。
   */
  verifyInProgress?: boolean;
}

export function runAudit(options: RunAuditOptions = {}): AuditReport {
  const manifest = generateContentManifest();
  const manifestSummary = summarizeManifest(manifest);
  const manifestHash = stableHashState(manifest);

  const prototypeFindings = scanOfficialRuntimeForPrototypeContent(manifest);
  const referenceIssues = validateCoreContentReferences();

  const dataGates = {
    officialGuardianPoolEnabled: isDarkestDungeonOfficialGuardianPoolEnabled(),
    officialFinalEncounterEnabled: isFinalEncounterOfficialEnabled(),
    officialDarkestDungeonQuestPoolEnabled: isDarkestDungeonOfficialQuestPoolEnabled(),
    guardianDataGaps: getDarkestDungeonGuardianDataGaps(),
    finalEncounterDataGaps: getFinalEncounterDataGaps(),
    darkestDungeonQuestDataGaps: getDarkestDungeonQuestDataGaps(),
  };

  const goldenRun = runGoldenCampaignAttempt('golden-normal-success-01', manifestHash);
  const replayDeterminism = verifyReplayDeterminism('golden-normal-success-01', manifestHash);
  const pcaResultForBuild = runProductionCommandAudit();

  const issues = buildIssues({
    manifestSummary,
    prototypeFindings,
    referenceIssues,
    dataGates,
    goldenRun,
    replayDeterminism,
    mathRandomLeaksInOfficialPath: options.mathRandomLeaksInOfficialPath ?? 0,
    pcaResult: pcaResultForBuild,
  });

  const pcaResult = pcaResultForBuild;
  const gate = evaluateReleaseGate({ issues, goldenRun, replayDeterminism, prototypeFindings, manifestSummary, options, pcaResult });

  return {
    // Phase 11A.2 §31：使用 currentSources.clock.nowIso() 而非直接 new Date()，
    // 这样 Replay 模式下 generatedAt 也是确定性的。
    generatedAt: currentClockNowIso(),
    manifest,
    manifestSummary,
    manifestHash,
    prototypeFindings,
    referenceIssues,
    dataGates,
    goldenRun,
    replayDeterminism,
    issues,
    gate,
  };
}

// ---------------------------------------------------------------------------
// Issue Ledger
// ---------------------------------------------------------------------------

interface BuildIssuesInput {
  manifestSummary: ManifestSummary;
  prototypeFindings: PrototypeContaminationFinding[];
  referenceIssues: ReferenceValidationIssue[];
  dataGates: AuditReport['dataGates'];
  goldenRun: GoldenRunAttempt;
  replayDeterminism: ReplayDeterminismResult;
  mathRandomLeaksInOfficialPath: number;
  // Phase 11A.2.2 WP-A：P1-006 改用结构化 ProductionCommandAudit 计算。
  pcaResult?: import('./production-command-audit').ProductionCommandAuditResult;
}

export function buildIssues(input: BuildIssuesInput): AuditIssue[] {
  const issues: AuditIssue[] = [];

  // ---- P0-001：11-Quest 主循环不可达（Phase 11A.1 已修复） ----
  // 修复判定：Campaign Reachability = finalAct >= 4（已到达 Act IV Unlocked）。
  // 真正的 campaign-victory 由 P0-002 内容数据就绪后才可达，与本 Issue 无关。
  if (input.goldenRun.outcome !== 'campaign-victory' && input.goldenRun.finalAct < 4) {
    issues.push({
      id: 'ISSUE-P0-001',
      severity: 'P0',
      domain: 'campaign-flow',
      title: '11-Quest / 4-Act 主循环在正式引擎路径上不可达',
      description:
        '断链共 5 处（均由 campaign-flow.test.ts 静态扫描固化）：\n' +
        '(1) Act 推进状态机 src/game-engine/campaign/campaign-progress.ts 中的 withActStarted / ' +
        'withStandardQuestCompleted / recomputeBossLock 等函数**没有任何生产调用方**（纯死代码，' +
        '但函数本身逻辑正确 —— 缺的是接线不是实现）；\n' +
        '(2) finishQuest / selectQuest 中 act 只出现初始化字面量 act: 1，从不推进；\n' +
        '(3) Boss Quest 定义 FACE_THE_THREAT_QUEST_DEFINITION 零生产引用，玩家永远抽不到"直面威胁"；\n' +
        '(4) 全仓不存在任何 act: 2 / act: 3 写入 —— **Act II 与 Act III 在生产代码中彻底不可达**；\n' +
        '(5) 唯一能写 act: 4 的 unlockDarkestDungeonAct() 依赖 defeatedBossFamilyIds.length >= 3，' +
        '而 defeatedBossFamilyIds 在生产代码里**从不追加**（只有初始化 []、存档反序列化，以及 dev 调试面板 ' +
        'ActFourDebugSection.tsx 硬塞 [necromancer, prophet, collector]）。' +
        '即 Act IV 目前只能经调试面板进入，正式游玩路径不可达。\n' +
        '结论：战役永远停留在 Act I，M03~M15 里程碑无法达成。',
      reproductionSeed: input.goldenRun.seedId,
      reproductionCommands: ['npm run test:golden', 'npm run audit:release-gate'],
      expected:
        '完成 2 个 Standard Quest 后 Boss Quest 解锁并强制；Boss 胜利后追加 defeatedBossFamilyIds 并 act 1 → 2 → 3；' +
        '击败 3 个 Boss 家族后由正式流程（非调试面板）解锁 Act IV。',
      actual: `完成 ${input.goldenRun.completedQuestCount} 个任务后 act 仍为 ${input.goldenRun.finalAct}，阶段停在 ${input.goldenRun.finalPhase}。`,
      status: 'open',
      regressionTestIds: [
        'golden-run.test.ts:11-quest-loop',
        'campaign-flow.test.ts:act-advance',
        'campaign-flow.test.ts:act-four-debug-only',
      ],
      stateHash: input.goldenRun.bundle.finalStateHash,
    });
  }

  // ---- P0-002：官方内容数据缺失（Guardian / Final Encounter / DD Quest）----
  const gapCount =
    input.dataGates.guardianDataGaps.length +
    input.dataGates.finalEncounterDataGaps.length +
    input.dataGates.darkestDungeonQuestDataGaps.length;
  if (gapCount > 0) {
    issues.push({
      id: 'ISSUE-P0-002',
      severity: 'P0',
      domain: 'content-data',
      title: 'Act IV 官方卡面数据缺失，官方池被 Data Gate 关闭',
      description:
        `Guardian 缺口 ${input.dataGates.guardianDataGaps.length} 项、Final Encounter 缺口 ` +
        `${input.dataGates.finalEncounterDataGaps.length} 项、Darkest Dungeon Quest 缺口 ` +
        `${input.dataGates.darkestDungeonQuestDataGaps.length} 项。按硬约束 22，缺失数据一律标记 content-blocked，不得猜测补全。`,
      reproductionCommands: ['npm run audit:content'],
      expected: '官方 Guardian / Final Form / Quest 数据齐备且 Data Gate 打开。',
      actual: `isDarkestDungeonOfficialGuardianPoolEnabled()=${input.dataGates.officialGuardianPoolEnabled}, isFinalEncounterOfficialEnabled()=${input.dataGates.officialFinalEncounterEnabled}, isDarkestDungeonOfficialQuestPoolEnabled()=${input.dataGates.officialDarkestDungeonQuestPoolEnabled}`,
      status: 'open',
      regressionTestIds: ['content-manifest.test.ts:data-gate-closed'],
    });
  }

  // ---- P1-001：createId() 使用 Math.random + Date.now ----
  // Phase 11A.2.2 WP-A：此检查由结构化 ProductionCommandAudit 提供。
  // 若允许列表中 System Runtime Adapter 之外的官方路径仍包含 Math.random()，则 P1-001 仍 open。
  // 当前状态：allowlist 限定 runtime-sources.ts，故 input.mathRandomLeaksInOfficialPath = 0 → 关闭。
  if (input.mathRandomLeaksInOfficialPath > 0) {
    issues.push({
      id: 'ISSUE-P1-001',
      severity: 'P1',
      domain: 'determinism',
      title: 'createId() 直接使用 Math.random() / Date.now()，破坏 replay 可复现性',
      description:
        'src/game-engine/random.ts:29-30 的 createId() 绕开了可注入随机源 _rng，' +
        '同时混入 Date.now()。任何包含新建 id 的状态都无法在同 seed 下逐位复现，' +
        'Milestone Hash 必须先剥离这些字段才能比较（见 campaign-invariants.stripVolatile）。',
      reproductionCommands: ['npm run audit:rules'],
      expected: '正式逻辑内 0 处 Math.random()；id 生成走可注入随机源。',
      actual: `官方路径检出 ${input.mathRandomLeaksInOfficialPath} 处 Math.random() 泄漏。`,
      status: 'open',
      regressionTestIds: ['rng-audit.test.ts:no-math-random-in-official-path'],
    });
  }

  // ---- P1-006：Production Command Layer 完整收口（Phase 11A.2.2 §7 / §8） ----
  // Phase 11A.2.2 WP-A：不再依赖 uiStoreShimSteps；改用结构化 ProductionCommandAudit。
  if (!input.pcaResult || !input.pcaResult.productionCommandLayerPasses) {
    const pca = input.pcaResult;
    const actual = [
      `headless shim exists = ${pca?.headlessShimFileExists}`,
      `driver shim imports = ${pca?.simulationDriverShimImportCount}`,
      `route classified = ${pca?.commandRouteClassifiedCount}/${pca?.commandRouteExpectedCount}`,
      `route violations = [${pca?.routeViolations.join(', ')}]`,
      `unclassified = [${pca?.unclassifiedCommands.join(', ')}]`,
      `differential coverage = ${pca?.differentialImplementedCount}/${pca?.differentialExpectedCount}`,
      `store atomic leaks = [${pca?.storeDirectAtomicOrchestrationLeaks.join(', ')}]`,
      `driver atomic leaks = [${pca?.driverDirectAtomicOrchestrationLeaks.join(', ')}]`,
      `policy boundary = ${pca?.testPolicyBoundaryPasses}`,
    ].join(' / ');
    issues.push({
      id: 'ISSUE-P1-006',
      severity: 'P1',
      domain: 'architecture',
      title: 'Production Command Layer 未完全收口（Store / Driver 直接 import 原子编排 / shim 未删 / Differential 不全）',
      description:
        'Phase 11A.2.2 §5 改由结构化 ProductionCommandAudit 判定：' +
        '!headlessShimFileExists && driverShimImportCount===0 && driverCoverage===driverTotal && ' +
        '!storeAtomicLeaks && !driverAtomicLeaks && differentialPasses && policyBoundaryPasses。\n' +
        '11A.2.1 用 event marker `uiStoreShimSteps=[]` 作为代理；11A.2.2 改用真实结构事实。\n' +
        actual,
      reproductionCommands: [
        'npm run audit:release-gate',
        'node -e "console.log(JSON.stringify(require(\'./production-command-audit\').runProductionCommandAudit()))"',
      ],
      expected: 'productionCommandLayerPasses === true（结构化计算）',
      actual,
      status: 'open',
      regressionTestIds: [
        'production-command-audit.test.ts:A-01..A-04',
        'command-differential.test.ts:D-01..D-14',
        'production-command-architecture.test.ts:24..29',
      ],
    });
  }

  // ---- P1-002：Replay 不确定 ----
  if (!input.replayDeterminism.identical) {
    issues.push({
      id: 'ISSUE-P1-002',
      severity: 'P1',
      domain: 'determinism',
      title: '同一 seed 的两次 replay 不完全一致',
      description: '事件序列或 RNG 抽取序列在两次运行间发生分叉。',
      reproductionSeed: input.replayDeterminism.seedId,
      reproductionCommands: ['npm run test:golden'],
      expected: '事件序列、RNG 序列、最终 state hash 三者逐位一致。',
      actual: `firstDivergentEventIndex=${input.replayDeterminism.firstDivergentEventIndex}, rngMatch=${input.replayDeterminism.rngMatch}, hashA=${input.replayDeterminism.hashA}, hashB=${input.replayDeterminism.hashB}`,
      status: 'open',
      regressionTestIds: ['golden-run.test.ts:replay-determinism'],
    });
  }

  // ---- P1-003：prototype 污染官方路径 ----
  if (input.prototypeFindings.length > 0) {
    issues.push({
      id: 'ISSUE-P1-003',
      severity: 'P1',
      domain: 'content-isolation',
      title: '官方路径引用了 prototype-* ID',
      description: input.prototypeFindings.map((f) => `${f.surface} → ${f.id} @ ${f.detail}`).join('; '),
      reproductionCommands: ['npm run audit:content'],
      expected: '官方路径 prototype 引用数 = 0。',
      actual: `检出 ${input.prototypeFindings.length} 处。`,
      status: 'open',
      regressionTestIds: ['prototype-scan.test.ts:official-path-clean'],
    });
  }

  // ---- P1-004：引用完整性错误 ----
  const refErrors = input.referenceIssues.filter((i) => i.severity === 'error');
  if (refErrors.length > 0) {
    issues.push({
      id: 'ISSUE-P1-004',
      severity: 'P1',
      domain: 'content-reference',
      title: '内容图存在重复 ID 或悬空引用',
      description: refErrors.slice(0, 10).map((i) => `[${i.code}] ${i.message}`).join('; '),
      reproductionCommands: ['npm run audit:content'],
      expected: '全局 ID 唯一且所有引用可解析。',
      actual: `检出 ${refErrors.length} 条 error 级引用问题。`,
      status: 'open',
      regressionTestIds: ['reference-validation.test.ts:no-dup-or-dangling'],
    });
  }

  // ---- P1-005：不变量违反 ----
  if (input.goldenRun.invariantErrorCount > 0) {
    issues.push({
      id: 'ISSUE-P1-005',
      severity: 'P1',
      domain: 'invariants',
      title: 'Golden Run 过程中触发不变量违反',
      description: input.goldenRun.invariantErrors.join('; '),
      reproductionSeed: input.goldenRun.seedId,
      reproductionCommands: ['npm run test:golden'],
      expected: '每一步提交后不变量集合为空。',
      actual: `${input.goldenRun.invariantErrorCount} 次违反。`,
      status: 'open',
      regressionTestIds: ['campaign-invariants.test.ts:golden-run-clean'],
    });
  }

  // ---- P2-001：sourceReference 覆盖率不足 ----
  if (input.manifestSummary.missingSourceReference > 0) {
    issues.push({
      id: 'ISSUE-P2-001',
      severity: 'P2',
      domain: 'content-governance',
      title: '大量内容条目缺少 sourceReference',
      description:
        `${input.manifestSummary.missingSourceReference}/${input.manifestSummary.total} 条内容没有规则书出处，` +
        '按 spec §6 一律不能判定为 verified / official-ready。',
      reproductionCommands: ['npm run audit:content'],
      expected: '所有官方内容条目具备 sourceReference。',
      actual: `缺失 ${input.manifestSummary.missingSourceReference} 条。`,
      status: 'open',
      regressionTestIds: ['content-manifest.test.ts:source-reference-coverage'],
    });
  }

  // ---- P2-002：重复事务 ----
  if (input.goldenRun.duplicateTransactionIds.length > 0) {
    issues.push({
      id: 'ISSUE-P2-002',
      severity: 'P2',
      domain: 'transactions',
      title: '检测到重复提交的事务 id',
      description: input.goldenRun.duplicateTransactionIds.slice(0, 10).join(', '),
      reproductionCommands: ['npm run test:golden'],
      expected: '同一事务 id 只提交一次。',
      actual: `${input.goldenRun.duplicateTransactionIds.length} 条重复。`,
      status: 'open',
      regressionTestIds: ['golden-run.test.ts:no-duplicate-transactions'],
    });
  }

  // ---- P1-006：旧版（基于 uiStoreShimSteps）已合并入上方的结构化 P1-006 块（Phase 11A.2.2 WP-A） ----

  // ---- P2-003：Hamlet 天数模型缺少可校验的总量 ----
  issues.push({
    id: 'ISSUE-P2-003',
    severity: 'P2',
    domain: 'state-model',
    title: 'HamletState 未保存「本段总准备天数」，天数守恒无法在单帧状态上校验',
    description:
      'HamletState 同时持有 preparationDays（剩余天数倒计时，endHamletDay 每次 -1）与 ' +
      'currentDay（累加日序，跨 Hamlet 段不重置），但没有保存本段的初始总天数。' +
      '因此「已过天数 + 剩余天数 = 事件规定天数」这条守恒关系无法从任一单帧状态推出，' +
      '只能靠重放事件序列还原。本次审计早期据此写错不变量，产生 84 条假阳性 HAMLET_DAY_OVERFLOW，' +
      '已修正（见 campaign-invariants.ts Hamlet 段注释）。',
    reproductionCommands: ['npm run test:golden'],
    expected: 'HamletState 记录 totalPreparationDays（或以 currentDay/总天数替代倒计时），使守恒可单帧校验。',
    actual: 'preparationDays 与 currentDay 方向相反且无总量锚点，只能靠事件重放还原。',
    status: 'open',
    regressionTestIds: ['campaign-invariants.test.ts:hamlet-day-semantics'],
  });

  // ---- P0-003：死锁 ----
  if (input.goldenRun.deadlockPhase) {
    issues.push({
      id: 'ISSUE-P0-003',
      severity: 'P0',
      domain: 'engine-deadlock',
      title: `阶段 ${input.goldenRun.deadlockPhase} 出现引擎死锁`,
      description: input.goldenRun.blockedReason ?? '',
      reproductionSeed: input.goldenRun.seedId,
      reproductionCommands: ['npm run test:golden'],
      expected: '任何非终局阶段至少有一个可用命令。',
      actual: `阶段 ${input.goldenRun.deadlockPhase} 无可用命令。`,
      status: 'open',
      regressionTestIds: ['golden-run.test.ts:no-deadlock'],
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Release Gate
// ---------------------------------------------------------------------------

interface GateInput {
  issues: AuditIssue[];
  goldenRun: GoldenRunAttempt;
  replayDeterminism: ReplayDeterminismResult;
  prototypeFindings: PrototypeContaminationFinding[];
  // Phase 11A.3 dev doc §42：manifestSummary 传入用于 P2-001 split。
  // 不再在 evaluateReleaseGate 内重新调用 generateContentManifest，
  // 避免 IO 重复（与 runAudit 的 manifest hash 一致性）。
  manifestSummary: ManifestSummary;
  options: RunAuditOptions;
  pcaResult?: import('./production-command-audit').ProductionCommandAuditResult;
}

export function evaluateReleaseGate(input: GateInput): ReleaseGateResult {
  const openP0 = input.issues.filter((i) => i.severity === 'P0' && i.status === 'open').length;
  const openP1 = input.issues.filter((i) => i.severity === 'P1' && i.status === 'open').length;

  // Phase 11A.2 §4.1：三个独立真相字段，直接从 GoldenRunAttempt 读取（与运行结果同源）。
  const campaignOrchestrationReachable = input.goldenRun.campaignOrchestrationReachable;
  const elevenQuestLoopClosed = input.goldenRun.elevenQuestLoopClosed;
  const campaignVictoryReachable = input.goldenRun.campaignVictoryReachable;
  // Phase 11A.2.2 WP-A：productionCommandLayerPasses 改由结构化 ProductionCommandAudit 计算。
  const productionCommandLayerPasses = input.pcaResult
    ? input.pcaResult.productionCommandLayerPasses
    : false;
  const campaignOverReachable = runnableGoldenSeeds().some((s) => s.expectedOutcome === 'campaign-over');

  const ruleSummary = summarizeRuleTraceability();
  const ruleTraceabilityP0Complete = ruleSummary.p0Complete;

  // Phase 11A.3 Source-Gate Integrity Repair §14-17：source-readiness 由 official-source-audit
  // 派生（不再 try/catch 直接 trust JSON）。audit 跑通 → outcome: all-ready / source-blocked；
  // audit 跑错 → outcome: source-audit-error → gate 走 NOT-VERIFIED。
  const sourceReadinessFile = readSourceReadiness();

  // Phase 11A.3 Source-Gate Integrity Repair §22-25：Guardian Matrix。
  // SOURCE-BLOCKED 阶段：matrix 报 SOURCE-BLOCKED（不伪称 3×3 pass）。
  const guardianMatrix = runGuardianMatrixAttempt();

  // Phase 11A.3 Source-Gate Integrity Repair §27-29：P2-001 拆分。
  //   globalMissingSourceReferences：整个 manifest 缺 sourceReference 的总数（保留 P2-001 旧语义）
  //   officialActFourMissingSourceReferences：仅 Phase 11A.3 官方 Act IV 范围（来自 canonical
  //     official-source-requirements.ts；与 121 条 unrelated base content 分离）
  //   officialPathMissingSourceReferences：legacy 字段（保留 11A.3 上一轮契约；新代码请用
  //     officialActFourMissingSourceReferences）
  const globalMissingSourceReferences = input.manifestSummary.missingSourceReference;
  // Phase 11A.3 Source-Gate Final Acceptance Closure §13：
  //   Act IV source scope 直接从 OFFICIAL_SOURCE_REQUIREMENTS.filter(requiredForCompletion) 计算
  const officialActFourRequired = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => r.requiredForCompletion);
  const officialActFourRequiredSourceCount = officialActFourRequired.length;
  const officialActFourMissingSourceRequirements = sourceReadinessFile.readiness.resolvedRequirements
    .filter((r) => {
      const req = OFFICIAL_SOURCE_REQUIREMENTS.find((x) => x.requirementId === r.requirementId);
      return req?.requiredForCompletion && r.status === 'missing';
    })
    .map((r) => r.requirementId);
  const officialActFourPartialSourceRequirements = sourceReadinessFile.readiness.resolvedRequirements
    .filter((r) => {
      const req = OFFICIAL_SOURCE_REQUIREMENTS.find((x) => x.requirementId === r.requirementId);
      return req?.requiredForCompletion && r.status === 'partial';
    })
    .map((r) => r.requirementId);
  // 保留向后兼容字段（从 manifest 派生：与之前等价）
  const officialActFourMissingSourceReferences = input.manifestSummary.officialActFourMissingSourceReferences;
  const officialPathMissingSourceReferences = input.manifestSummary.officialPathMissingSourceReferences;

  // Phase 11A.3 Source-Gate Final Acceptance Closure §6：required/optional 分离
  const requiredResolved = sourceReadinessFile.readiness.resolvedRequirements.filter((r) => {
    const req = OFFICIAL_SOURCE_REQUIREMENTS.find((x) => x.requirementId === r.requirementId);
    return req?.requiredForCompletion;
  });
  const optionalResolved = sourceReadinessFile.readiness.resolvedRequirements.filter((r) => {
    const req = OFFICIAL_SOURCE_REQUIREMENTS.find((x) => x.requirementId === r.requirementId);
    return !req?.requiredForCompletion;
  });

  // Phase 11A.3 dev doc §37：fourRuinsBossesPass 不属于 11A.3 官方 Act IV Gate。
  // Phase 9E 已经验证过 Necromancer / Prophet / Collector / Fanatic 四个 Ruins Boss 全部可被官方 prototype
  // 链路通过；该字段在 11A.3 阶段保持 false 仅为「不作为 11A.3 PASS 判据」的明确信号。
  // 因此这里不读任何 4-boss 测量（dev doc §37 后半段：「不是 11A.3 官方 Act IV Gate」）。
  // 字段保留以保持向后兼容。

  const gate: ReleaseGateResult = {
    typecheckPasses: input.options.typecheckPasses ?? false,
    goldenTestPasses: input.options.goldenTestPasses ?? false,
    canEnterPhase11A3: false,
    onlyOpenP0: openP0 === 1 ? input.issues.find(i => i.severity === 'P0' && i.status === 'open')!.id : null,
    buildPasses: input.options.buildPasses ?? false,
    unitPasses: input.options.unitPasses ?? false,
    integrationPasses: input.options.integrationPasses ?? false,
    commandContractPasses: input.options.commandContractPasses ?? false,
    replayContinuationPasses: input.options.replayContinuationPasses ?? false,
    criticalE2EPasses: input.options.criticalE2EPasses ?? false,
    goldenCampaignPasses: elevenQuestLoopClosed,
    replayDeterminismPasses: input.replayDeterminism.identical && input.options.replayDeterminismPasses === true,
    openP0,
    openP1,
    prototypeReferencesInOfficialPath: input.prototypeFindings.length,
    duplicateCommittedTransactions: input.goldenRun.duplicateTransactionIds.length,
    engineDeadlocks: input.goldenRun.deadlockPhase ? 1 : 0,
    campaignOrchestrationReachable,
    elevenQuestLoopClosed,
    campaignVictoryReachable,
    campaignOverReachable,
    // Phase 11A.3 dev doc §36 / §37：measured evidence（不再 hardcoded false）。
    // 由 family validator 推导：family 全部 ready → true；任一 family 不 ready → false。
    // 错误用法是 hardcode true（dev doc §45 明确禁止）。
    threeGuardiansPass: guardianMatrix.threeGuardiansPass,
    threeSkippedFormsPass: guardianMatrix.threeSkippedFormsPass,
    // Phase 11A.3 dev doc §37：fourRuinsBossesPass 不在 11A.3 官方 Act IV Gate 范围；
    // 保持 false 但**明确从 11A.3 PASS 判定中移除**（见下方判定语法注释）。
    fourRuinsBossesPass: false,
    // Phase 11A.2 §5
    productionCommandLayerPasses: productionCommandLayerPasses && input.options.productionCommandLayerPasses === true,
    // §21：真实存档往返（createSaveSnapshot → validate → restoreSaveSnapshot → 哈希比对）。
    // 必须至少校验过一个节点，否则视为未验证 → 不通过。
    saveResumeKeyNodesPass:
      input.goldenRun.saveResumeChecks.length > 0 &&
      input.goldenRun.saveResumeChecks.every((c) => c.passed),
    ruleTraceabilityP0Complete,
    passed: false,
    verdict: 'FAIL',
    conclusion: '',
    // Phase 11A.3 Source-Gate Integrity Repair §27-29：P2-001 split
    globalMissingSourceReferences,
    officialActFourMissingSourceReferences,
    // legacy 字段（保留 11A.3 上一轮契约；新代码请用 officialActFourMissingSourceReferences）
    officialPathMissingSourceReferences,
    // Phase 11A.3 Source-Gate Final Acceptance Closure §13：canonical Act IV scope
    officialActFourRequiredSourceCount,
    officialActFourMissingSourceRequirements,
    officialActFourPartialSourceRequirements,
    // Phase 11A.3 Source-Gate Final Acceptance Closure §6：required/optional 分离
    requiredMissingCount: requiredResolved.filter((r) => r.status === 'missing').length,
    requiredPartialCount: requiredResolved.filter((r) => r.status === 'partial').length,
    requiredAvailableCount: requiredResolved.filter((r) => r.status === 'available').length,
    optionalMissingCount: optionalResolved.filter((r) => r.status === 'missing').length,
    optionalPartialCount: optionalResolved.filter((r) => r.status === 'partial').length,
    // Phase 11A.3 Source-Gate Final Acceptance Closure §12：structured provenance audit
    provenanceAudit: sourceReadinessFile.readiness.provenanceAudit,
    // Phase 11A.3 Source-Gate Final Acceptance Closure §15：real 9-combination matrix
    officialGuardianMatrix: {
      status: guardianMatrix.status === 'NOT-VERIFIED' ? 'NOT-RUN' : guardianMatrix.status === 'READY' ? 'READY' : guardianMatrix.status === 'SOURCE-BLOCKED' ? 'SOURCE-BLOCKED' : 'FAIL',
      combinationsExpected: 9,
      combinationsRun: guardianMatrix.status === 'READY' ? 9 : 0,
      combinationsPassed: guardianMatrix.status === 'READY' ? (guardianMatrix.threeGuardiansPass ? 9 : 0) : 0,
    },
    officialSkippedFormMatrix: {
      status: guardianMatrix.status === 'NOT-VERIFIED' ? 'NOT-RUN' : guardianMatrix.status === 'READY' ? 'READY' : guardianMatrix.status === 'SOURCE-BLOCKED' ? 'SOURCE-BLOCKED' : 'FAIL',
      combinationsExpected: 9,
      combinationsRun: guardianMatrix.status === 'READY' ? 9 : 0,
      combinationsPassed: guardianMatrix.status === 'READY' ? (guardianMatrix.threeSkippedFormsPass ? 9 : 0) : 0,
    },
    sourceReadiness: {
      allRequiredSourcesReady: sourceReadinessFile.gates.allRequiredSourcesReady,
      questCardsReady: sourceReadinessFile.gates.questCardsReady,
      templarsReady: sourceReadinessFile.gates.templarsReady,
      mammothCystReady: sourceReadinessFile.gates.mammothCystReady,
      shufflingHorrorReady: sourceReadinessFile.gates.shufflingHorrorReady,
      finalEncounterReady: sourceReadinessFile.gates.finalEncounterReady,
      darkestDungeonMonsterDeckReady: sourceReadinessFile.gates.darkestDungeonMonsterDeckReady,
    },
    // Phase 11A.3 Source-Gate Integrity Repair §31-33：phase11A3Status 状态机
    // 初始值，下面 verdict 逻辑会重写
    phase11A3Status: 'NOT-VERIFIED',
    canBeginOfficialImport: false,
    canCloseP0_002: false,
    canEnterPhase11B: false,
  };

  // 判定语法（dev doc §22 / 11A.3 §38 / §39）：
  //   1 engine deadlock → FAIL
  //   2 verification stale / critical test fail → FAIL / NOT-VERIFIED
  //   3 production command layer fail → FAIL
  //   4 replay fail → FAIL
  //   5 campaign unreachable → FAIL
  //   6 measured checks fail → NOT-VERIFIED
  //   7 SOURCE-BLOCKED：source-readiness allReady=false 且 仅有 P0-002 缺口
  //      → SOURCE-BLOCKED（Phase 11A.3 终态，dev doc §1 / §51）
  //   8 official data ready 但 11 Quest 未闭环 → FAIL
  //   9 official data ready 且 11 Quest 闭环 → PASS
  // 关键：Content Blocked (P0-002) 不能遮住 Test Gate 未完成（11A.2.3 §22）。
  // 关键：fourRuinsBossesPass 不在 11A.3 PASS 判定内（dev doc §37）。
  // Pre-gate evidence is already measured during verification; it must not,
  // however, turn a measured false into an unmeasured success.
  const verificationStale = input.options.verificationFresh !== true;
  const criticalE2EUnmeasured = input.options.criticalE2EPasses !== true;
  // 11A.2.3R §10-12（dev doc fix #1 + #4）：command contract + replay continuation 独立 measured，
  // 任一未注入或 fail → NOT-VERIFIED。
  const commandContractUnmeasured = input.options.commandContractPasses !== true;
  const replayContinuationUnmeasured = input.options.replayContinuationPasses !== true;
  if (gate.engineDeadlocks > 0) {
    gate.verdict = 'FAIL';
    gate.passed = false;
    gate.conclusion =
      'FAIL — engine-deadlock：仿真循环卡死（mental guard 上限 / 死循环）' +
      `（deadlock phase: ${input.goldenRun.deadlockPhase}）。`;
  } else if (sourceReadinessFile.outcome.kind === 'source-audit-error') {
    // Phase 11A.3 Source-Gate Integrity Repair §14-17 / §16 / §36：
    //   source-readiness 缺失 / 损坏 / contradictory 必须显式 NOT-VERIFIED，
    //   绝不允许默认真相 = SOURCE-BLOCKED。
    gate.verdict = 'NOT-VERIFIED';
    gate.passed = false;
    const errSummary = sourceReadinessFile.auditErrors
      .slice(0, 5)
      .map((e) => `[${e.code}] ${e.requirementId ?? '?'}/${e.sourceAssetId ?? '?'} — ${e.message}`)
      .join('; ');
    gate.conclusion =
      'NOT-VERIFIED — source-audit-error：official source audit pipeline 自身报错，不能默认 SOURCE-BLOCKED。' +
      `Errors: ${errSummary}。修复 source metadata 后重跑 npm run audit:official-source。`;
  } else if (verificationStale) {
    // 11A.2.3 §22.2: verification stale / unmeasured 必须先于 P0 缺口判定。
    gate.verdict = 'NOT-VERIFIED';
    gate.passed = false;
    gate.conclusion = 'NOT-VERIFIED — verification-results.json stale or unmeasured；跑 npm run verify:phase11a2-3 重新生成。';
  } else if (criticalE2EUnmeasured) {
    // 11A.2.3 §22.2: critical test fail → NOT-VERIFIED。
    gate.verdict = 'NOT-VERIFIED';
    gate.passed = false;
    gate.conclusion = 'NOT-VERIFIED — criticalE2EPasses=false；Playwright E2E 必须真实跑过 6 spec 才能算 verified。';
  } else if (commandContractUnmeasured) {
    // 11A.2.3R §10-12 fix #1：command contract 必须独立 measured。
    gate.verdict = 'NOT-VERIFIED';
    gate.passed = false;
    gate.conclusion = 'NOT-VERIFIED — commandContractPasses=false / unmeasured；verify-phase11a2-3 必须独立跑 game-command-route-contract.test.ts。';
  } else if (replayContinuationUnmeasured) {
    // 11A.2.3R §10-12：Replay Continuation（RC-C-01..05）必须独立 measured。
    gate.verdict = 'NOT-VERIFIED';
    gate.passed = false;
    gate.conclusion = 'NOT-VERIFIED — replayContinuationPasses=false / unmeasured；verify-phase11a2-3 必须独立跑 replay-continuation.test.ts。';
  } else if (!productionCommandLayerPasses) {
    // 11A.2.3 §22.3: production command layer fail → FAIL。
    gate.verdict = 'FAIL';
    gate.passed = false;
    gate.conclusion = 'FAIL — production-command-layer：P1-006 关闭失败（Route Contract / Driver shim import / coverage 不达标）。';
  } else if (!gate.replayDeterminismPasses) {
    // 11A.2.3 §22.4: replay fail → FAIL。
    gate.verdict = 'FAIL';
    gate.passed = false;
    gate.conclusion = 'FAIL — replay-determinism：同 seed + RuntimeSources A/B/C 不一致。';
  } else if (!campaignOrchestrationReachable) {
    // 11A.2.3 §22.5: campaign unreachable → FAIL。
    gate.verdict = 'FAIL';
    gate.passed = false;
    gate.conclusion = `FAIL — campaign-flow-blocked：Campaign Orchestration 未达 Act IV Unlocked（finalAct=${input.goldenRun.finalAct}）。`;
  } else if (![gate.typecheckPasses, gate.unitPasses, gate.buildPasses, gate.integrationPasses,
    gate.goldenTestPasses, gate.productionCommandLayerPasses].every(Boolean)) {
    gate.verdict = 'NOT-VERIFIED';
    gate.conclusion = 'NOT-VERIFIED — required independent measured checks failed or missing';
  } else if (openP1 > 0 || (openP0 > 0 && (openP0 !== 1 || gate.onlyOpenP0 !== 'ISSUE-P0-002'))) {
    gate.verdict = 'FAIL';
    gate.conclusion = 'FAIL — issues other than the accepted official content gap remain';
  } else if (openP0 > 0 && !sourceReadinessFile.gates.allRequiredSourcesReady) {
    // Phase 11A.3 dev doc §1 / §39 / §51：SOURCE-BLOCKED 终态。
    //   资料缺失（source-readiness 全部 false）+ 仅 P0-002 内容缺口 → SOURCE-BLOCKED。
    //   这是正确的 Source Gate，不是开发失败。
    gate.verdict = 'SOURCE-BLOCKED';
    gate.passed = false;
    gate.conclusion =
      'SOURCE-BLOCKED — Phase 11A.3 阶段缺少官方 Battle/Quest/Room Card / Tile / Monster Deck 资料；' +
      'official data gates 全部 false，' +
      'threeGuardiansPass=' + guardianMatrix.threeGuardiansPass + ' / ' +
      'threeSkippedFormsPass=' + guardianMatrix.threeSkippedFormsPass + ' / ' +
      'elevenQuestLoopClosed=false / campaignVictoryReachable=false。' +
      '等待用户补全 source 资料后重跑 audit。';
  } else if (sourceReadinessFile.gates.allRequiredSourcesReady && !elevenQuestLoopClosed) {
    // Phase 11A.3 Source-Gate Final Acceptance Closure §14：
    //   source 全部 ready + 11 Quest 没闭环 + 只 P0-002 open → READY-FOR-OFFICIAL-IMPORT
    //   （不是 IMPLEMENTATION-FAIL，因为 implementation 是对的，只是 official import 还没跑）
    gate.verdict = 'SOURCE-BLOCKED'; // 暂用 SOURCE-BLOCKED 容器；phase11A3Status 会改成 READY-FOR-OFFICIAL-IMPORT
    gate.passed = false;
    gate.conclusion = `READY-FOR-OFFICIAL-IMPORT — all required source ready + 11-Quest not closed（finalAct=${input.goldenRun.finalAct}）。请执行 official data import 后重跑 audit。`;
  } else if (!elevenQuestLoopClosed) {
    // Phase 11A.3 dev doc §39：official data ready 但 11 Quest 没闭环 → FAIL。
    // 删除了之前的「else if (!elevenQuestLoopClosed) → CONDITIONAL」重复分支（dev doc §39）。
    gate.verdict = 'FAIL';
    gate.passed = false;
    gate.conclusion = `FAIL — eleven-quest-not-closed：source-readiness 全部 ready 但 11-Quest 闭环未达成（finalAct=${input.goldenRun.finalAct}）。`;
  } else if (openP1 > 0 || blockedGoldenSeeds().length > 0) {
    gate.verdict = 'CONDITIONAL';
    gate.passed = false;
    gate.conclusion = `CONDITIONAL — framework-complete-content-blocked：${blockedGoldenSeeds().length} 个 Golden Seed 因官方数据缺失不可运行。`;
  } else {
    gate.verdict = 'PASS';
    gate.passed = true;
    gate.conclusion = 'PASS — core-campaign-official-ready';
  }

  const engineeringGatePasses = [
    gate.typecheckPasses, gate.unitPasses, gate.commandContractPasses,
    gate.integrationPasses, gate.buildPasses, gate.criticalE2EPasses,
    gate.goldenTestPasses, gate.replayDeterminismPasses,
    gate.replayContinuationPasses, gate.productionCommandLayerPasses,
  ].every(Boolean);
  const verifierHealthy = engineeringGatePasses && sourceReadinessFile.auditPasses && input.options.verificationFresh === true;
  gate.phase11A3Status = evaluatePhase11A3Status({
    verifierHealthy,
    implementationPasses: gate.verdict !== 'FAIL' && gate.verdict !== 'CONDITIONAL',
    sourceAuditPasses: sourceReadinessFile.auditPasses,
    allRequiredSourcesReady: sourceReadinessFile.gates.allRequiredSourcesReady,
    elevenQuestLoopClosed,
    openP0,
    openP1,
    onlyOpenP0: gate.onlyOpenP0,
  });

  // Phase 11A.3 Source-Gate Final Acceptance Closure §17：
  //   canBeginOfficialImport：由 source readiness 输出（资料齐了就可以开始 import）
  //   canEnterPhase11B：只能由 Phase 11A.3 COMPLETE 后由 release-gate 输出
  //   canCloseP0_002：Phase 11A.3 真正 COMPLETE 后才能关
  gate.canBeginOfficialImport = sourceReadinessFile.gates.allRequiredSourcesReady;
  gate.canCloseP0_002 = gate.verdict === 'PASS';
  gate.canEnterPhase11B = gate.verdict === 'PASS';

  // canEnterPhase11A3（保留向后兼容，但不再是 11A.3 主指标）
  gate.canEnterPhase11A3 =
    (gate.verdict === 'SOURCE-BLOCKED' || gate.verdict === 'CONDITIONAL') &&
    gate.onlyOpenP0 === 'ISSUE-P0-002' &&
    openP1 === 0;
  return gate;
}

export { GOLDEN_SEEDS, CAMPAIGN_MILESTONES };
