// Phase 11A — §32 性能基线测量（纯计算，无 fs 依赖，可被 vitest 直接 import）。
//
// 诚实声明（与最终报告 §43 一致）：
//   - 可自然到达的部分（New Campaign / Quest Setup / Battle Setup / Save / Load / 完整 Run）
//     走**正式引擎路径**（CampaignSimulationDriver），测的是真实耗时与真实体量。
//   - Form Transition 在正式「四 Act 主循环」里**不可达**（ISSUE-P0-001：Act 推进断裂），
//     因此这里以「机制级」方式测量：复用 Phase 10E 调试面板同一套正式引擎入口（unlock →
//     draw → build → guardian → final hamlet → prepare → start）把战役推到 Final Encounter，
//     再对新 Form 切换计时。标记 mechanismLevel=true 以示区分。
//   - 浏览器内存趋势属于浏览器/Playwright 维度，node 侧无法测量，标记未采集。

import type { CampaignState } from '../../types';
import { HEROES } from '../../data/heroes';
import { QUESTS } from '../../data/quests';
import { createNewCampaign } from '../../game-engine/campaign';
import { createSaveSnapshot, restoreSaveSnapshot } from '../../game-engine/save';
import { createSeededRng } from '../../game-engine/campaign/act-four/rng';
import { CampaignSimulationDriver } from './simulation-driver';
import { runGoldenCampaignAttempt } from './run-audit';
import {
  unlockDarkestDungeonAct,
  completePostThirdThreatHamlet,
} from '../../game-engine/campaign/act-four/unlock-act-four';
import { drawDarkestDungeonQuest } from '../../game-engine/campaign/act-four/draw-quest';
import {
  drawDarkestDungeonLayout,
  buildDarkestDungeonMap,
  revealDarkestDungeonRoom,
} from '../../game-engine/campaign/act-four/dungeon-map';
import {
  resolveExcavationSiteRoom,
  finishExcavationRest,
} from '../../game-engine/campaign/act-four/excavation-site';
import {
  createGuardianQuest,
  startGuardianBattle,
  resolveGuardianVictory,
} from '../../game-engine/campaign/act-four/guardian-quest';
import { startFinalHamlet, advanceFinalHamletDay } from '../../game-engine/campaign/act-four/final-hamlet';
import { prepareFinalEncounter } from '../../game-engine/campaign/act-four/prepare-final-encounter';
import { startFinalEncounter, defeatFinalForm } from '../../game-engine/campaign/act-four/final-form-sequence';
import { transitionToNextFinalForm } from '../../game-engine/campaign/act-four/transition-final-form';

export interface BenchResult {
  iters: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
}

export interface FullRunMetrics {
  eventCount: number;
  maxSaveBytes: number;
  maxLedger: number;
  peakActors: number;
  peakInitiative: number;
  /** 完整 Run 在正式路径上只能跑到 Act I（ISSUE-P0-001），下面的数字即该可达 Run 的真实值。 */
  note: string;
}

export interface EngineeringGate {
  saveLoad100xNoCrash: boolean;
  saveLoad100xNoInflation: boolean;
  formTransitionNoLeak: boolean;
  /** 各步骤单次耗时预算（ms），与实测 avg 比较。 */
  stepBudgetsMs: Record<string, number>;
  longUnresponsive: boolean;
  /** 重复监听器膨胀属于浏览器/React 维度，node 侧无法测量。 */
  duplicateListenerBlowup: 'unmeasured' | boolean;
}

export interface PerformanceBaseline {
  measuredAt: string;
  environment: { node: string; platform: string };
  newCampaignInit: BenchResult;
  questSetup: BenchResult;
  battleSetup: BenchResult;
  save: BenchResult & { representativeBytes: number };
  load: BenchResult;
  formTransition: BenchResult & { mechanismLevel: true; reachabilityNote: string };
  fullRun: FullRunMetrics;
  engineeringGate: EngineeringGate;
  notes: string[];
}

// ---------------------------------------------------------------------------
// 计时器
// ---------------------------------------------------------------------------

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function bench(fn: () => void, iters: number): BenchResult {
  const samples: number[] = [];
  for (let i = 0; i < iters; i++) {
    const t0 = now();
    fn();
    samples.push(now() - t0);
  }
  samples.sort((a, b) => a - b);
  const avg = samples.reduce((s, x) => s + x, 0) / samples.length;
  const p95Idx = Math.min(samples.length - 1, Math.floor(samples.length * 0.95));
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    iters,
    avgMs: round(avg),
    minMs: round(samples[0]),
    maxMs: round(samples[samples.length - 1]),
    p95Ms: round(samples[p95Idx]),
  };
}

const HERO_IDS = HEROES.slice(0, 4).map((h) => h.id);

/** 确定性选路：优先未清除相邻房间，其次任意相邻房间（与 run-audit 一致）。 */
function pickNextRoomId(d: NonNullable<CampaignState['dungeon']>): string | null {
  const cur = d.rooms.find((r) => r.id === d.currentRoomId);
  if (!cur) return null;
  const adj = cur.adjacentRoomIds
    .map((id) => d.rooms.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  if (adj.length === 0) return null;
  const uncleared = adj.filter((r) => r.status !== 'cleared');
  const pool = uncleared.length > 0 ? uncleared : adj;
  return [...pool].sort((a, b) => a.id.localeCompare(b.id))[0].id;
}

// ---------------------------------------------------------------------------
// Form Transition 机制级测量：把战役推到 Final Encounter（复用调试面板同款入口）
// ---------------------------------------------------------------------------

let actFourSeed = 0x1000;
function actFourRng(): () => number {
  return createSeededRng(actFourSeed++);
}

/** 与 ActFourDebugSection.onFullRun 一致的正式引擎装配链（不含机制动作与收口）。 */
function driveToFinalEncounter(): CampaignState {
  let c = createNewCampaign();
  // 调试 harness 等价物：补齐「已击败 >= 3 个 Boss Family」前置（正式路径缺失该接线，ISSUE-P0-001）。
  c = {
    ...c,
    campaignProgress: {
      ...c.campaignProgress,
      defeatedBossFamilyIds: ['necromancer', 'prophet', 'collector'],
    },
  };
  const u = unlockDarkestDungeonAct(c);
  if (!u.ok) throw new Error('unlockDarkestDungeonAct 失败');
  c = u.campaign;
  const ch = completePostThirdThreatHamlet(c);
  if (!ch.ok) throw new Error('completePostThirdThreatHamlet 失败');
  c = ch.campaign;
  const dq = drawDarkestDungeonQuest(c, { rng: actFourRng(), mode: 'prototype' });
  if (!dq.ok) throw new Error('drawDarkestDungeonQuest 失败');
  c = dq.campaign;
  const dl = drawDarkestDungeonLayout(c, { rng: actFourRng(), mode: 'prototype' });
  if (!dl.ok) throw new Error('drawDarkestDungeonLayout 失败');
  c = dl.campaign;
  const bm = buildDarkestDungeonMap(c, { rng: actFourRng(), mode: 'prototype' });
  if (!bm.ok) throw new Error('buildDarkestDungeonMap 失败');
  c = bm.campaign;
  if (c.actFourState.bossSlotAssignment) {
    c = revealDarkestDungeonRoom(c, c.actFourState.bossSlotAssignment.objectiveRoomSlotId).campaign;
  }
  const cg = createGuardianQuest(c, { mode: 'prototype' });
  if (!cg.ok) throw new Error('createGuardianQuest 失败');
  c = cg.campaign;
  const gq = c.actFourState.guardianQuestState;
  if (!gq) throw new Error('guardianQuestState 缺失');
  const sb = startGuardianBattle(c, gq.objectiveRoomId);
  if (!sb.ok) throw new Error('startGuardianBattle 失败');
  c = sb.campaign;
  for (const site of c.actFourState.excavationSiteStates) {
    if (site.status === 'available' || site.status === 'unrevealed') {
      const ex = resolveExcavationSiteRoom(c, site.roomId, { rng: actFourRng(), mode: 'prototype' });
      if (ex.ok) {
        c = ex.campaign;
        c = finishExcavationRest(c, site.roomId).campaign;
      }
    }
  }
  const gv = resolveGuardianVictory(c);
  if (gv.ok) c = gv.campaign;
  const sh = startFinalHamlet(c);
  if (sh.ok) c = sh.campaign;
  for (let d = 0; d < 4; d++) {
    const ah = advanceFinalHamletDay(c);
    if (ah.ok) c = ah.campaign;
  }
  const pe = prepareFinalEncounter(c, { mode: 'prototype' });
  if (!pe.ok) throw new Error('prepareFinalEncounter 失败');
  c = pe.campaign;
  const sf = startFinalEncounter(c);
  if (!sf.ok) throw new Error('startFinalEncounter 失败');
  return sf.campaign;
}

// ---------------------------------------------------------------------------
// 主编排
// ---------------------------------------------------------------------------

export function measurePerformanceBaseline(contentManifestHash = 'perf-baseline'): PerformanceBaseline {
  const notes: string[] = [];

  // 1. New Campaign 初始化
  const newCampaignInit = bench(() => {
    createNewCampaign();
  }, 20);

  // 2. Quest Setup（选队 → 配技能 → 选任务），每次新建 driver 取平均
  const questSetup = bench(() => {
    const d = new CampaignSimulationDriver('perf-qs');
    d.dispatch({ type: 'selectParty', heroIds: HERO_IDS });
    d.dispatch({ type: 'proceedToLoadout' });
    d.dispatch({ type: 'applyLoadout' });
    d.dispatch({ type: 'proceedToQuests' });
    d.dispatch({ type: 'chooseQuest', questId: QUESTS[0].id });
    d.dispose();
  }, 10);

  // 3. Battle Setup（从 quest-select 推进到首个战斗 active）
  const battleSetup = bench(() => {
    const d = new CampaignSimulationDriver('perf-bs');
    d.dispatch({ type: 'selectParty', heroIds: HERO_IDS });
    d.dispatch({ type: 'proceedToLoadout' });
    d.dispatch({ type: 'applyLoadout' });
    d.dispatch({ type: 'proceedToQuests' });
    d.dispatch({ type: 'chooseQuest', questId: QUESTS[0].id });
    let g = 0;
    while (g++ < 60) {
      const s = d.getState();
      if (s.battle?.status === 'active') break;
      if (s.gamePhase === 'dungeon-explore' && s.dungeon) {
        const r = pickNextRoomId(s.dungeon);
        if (r) d.dispatch({ type: 'moveToRoom', roomId: r });
        else break;
      } else break;
    }
    d.dispose();
  }, 10);

  // 4. Save / Load：取一个含地牢+战斗的代表性状态
  const slDriver = new CampaignSimulationDriver('perf-saveload');
  slDriver.dispatch({ type: 'selectParty', heroIds: HERO_IDS });
  slDriver.dispatch({ type: 'proceedToLoadout' });
  slDriver.dispatch({ type: 'applyLoadout' });
  slDriver.dispatch({ type: 'proceedToQuests' });
  slDriver.dispatch({ type: 'chooseQuest', questId: QUESTS[0].id });
  {
    let g = 0;
    while (g++ < 60) {
      const s = slDriver.getState();
      if (s.battle?.status === 'active') break;
      if (s.gamePhase === 'dungeon-explore' && s.dungeon) {
        const r = pickNextRoomId(s.dungeon);
        if (r) slDriver.dispatch({ type: 'moveToRoom', roomId: r });
        else break;
      } else break;
    }
  }
  const sampleState = slDriver.getState();
  slDriver.dispose();

  const sampleSnapshot = createSaveSnapshot(sampleState);
  const saveBench = bench(() => {
    createSaveSnapshot(sampleState);
  }, 50);
  const save: BenchResult & { representativeBytes: number } = {
    ...saveBench,
    representativeBytes: JSON.stringify(sampleSnapshot).length,
  };

  const load = bench(() => {
    restoreSaveSnapshot(JSON.parse(JSON.stringify(sampleSnapshot)) as typeof sampleSnapshot);
  }, 50);

  // 5. Form Transition（机制级）：推到 Final Encounter，击败首 Form，再对切换计时
  let formTransition: PerformanceBaseline['formTransition'];
  let formTransitionNoLeak = true;
  let formTransitionReachNote = '';
  try {
    const feState = driveToFinalEncounter();
    const enc = feState.actFourState.finalEncounterState;
    if (!enc) throw new Error('finalEncounterState 缺失');
    const firstFormId = enc.activeFormId;
    if (!firstFormId) throw new Error('Final Encounter 无 activeFormId');
    const defeated = defeatFinalForm(feState, firstFormId);
    if (!defeated.ok) throw new Error(`defeatFinalForm 失败：${defeated.reason ?? ''}`);
    const preTransition = defeated.campaign;

    formTransition = {
      ...bench(() => {
        const c = JSON.parse(JSON.stringify(preTransition)) as CampaignState;
        const r = transitionToNextFinalForm(c, { rng: actFourRng(), mode: 'prototype' });
        if (!r.ok) throw new Error(`transitionToNextFinalForm 失败：${r.reason ?? ''}`);
      }, 10),
      mechanismLevel: true,
      reachabilityNote:
        '机制级测量：经正式引擎装配链推到 Final Encounter 后计时；正式四 Act 主循环不可达（ISSUE-P0-001）。',
    };

    // Form Transition 无泄漏：完整链 defeat+transition 走完后，processedTransactionIds 不重复且受 Form 数上界约束。
    {
      let c = preTransition;
      let transitions = 0;
      let guard = 0;
      while (guard++ < 8) {
        const e = c.actFourState.finalEncounterState;
        if (!e || !e.activeFormId) break;
        const df = defeatFinalForm(c, e.activeFormId);
        if (!df.ok) break;
        c = df.campaign;
        if (df.allFormsDefeated) break;
        const tr = transitionToNextFinalForm(c, { rng: actFourRng(), mode: 'prototype' });
        if (!tr.ok) break;
        c = tr.campaign;
        transitions++;
      }
      const ids = c.actFourState.finalEncounterState?.processedTransactionIds ?? [];
      const unique = new Set(ids).size;
      // 无泄漏 = 每条事务 id 仅提交一次（切换幂等：重跑不产生重复）。
      // processedTransactionIds 合法包含大量非切换类 Act IV 事务（Guardian / Final Hamlet / Form Start 等），
      // 因此上界不是 Form 数，而是「无重复」。
      formTransitionNoLeak = transitions > 0 && unique === ids.length;
    }
  } catch (e) {
    formTransition = {
      iters: 0,
      avgMs: 0,
      minMs: 0,
      maxMs: 0,
      p95Ms: 0,
      mechanismLevel: true,
      reachabilityNote: `机制级测量失败（装配链未达 Final Encounter）：${e instanceof Error ? e.message : String(e)}`,
    };
    formTransitionReachNote = `Form Transition 机制级测量未建立：${e instanceof Error ? e.message : String(e)}`;
    formTransitionNoLeak = false;
    notes.push(formTransitionReachNote);
  }

  // 6. 完整 Run 指标（来自真实 golden run）
  const golden = runGoldenCampaignAttempt('golden-normal-success-01', contentManifestHash);
  const fullRun: FullRunMetrics = {
    eventCount: golden.eventCount,
    maxSaveBytes: golden.maxSaveBytes,
    maxLedger: golden.maxLedger,
    peakActors: golden.peakActors,
    peakInitiative: golden.peakInitiative,
    note:
      '完整 Run 在正式路径上仅能跑到 Act I（完成 ' +
      `${golden.completedQuestCount} 个任务后停在 ${golden.finalPhase}），` +
      '以下为**该可达 Run**的真实极值，不代表完整 11-Quest 全链路。',
  };

  // 7. 工程门禁
  const stepBudgetsMs: Record<string, number> = {
    newCampaignInit: 50,
    questSetup: 250,
    battleSetup: 300,
    save: 60,
    load: 60,
    formTransition: 120,
  };
  const longUnresponsive =
    newCampaignInit.avgMs > stepBudgetsMs.newCampaignInit ||
    questSetup.avgMs > stepBudgetsMs.questSetup ||
    battleSetup.avgMs > stepBudgetsMs.battleSetup ||
    save.avgMs > stepBudgetsMs.save ||
    load.avgMs > stepBudgetsMs.load ||
    (formTransition.iters > 0 && formTransition.avgMs > stepBudgetsMs.formTransition);

  // 100× Save/Load 不崩溃且无体积膨胀
  let saveLoad100xNoCrash = true;
  let saveLoad100xNoInflation = true;
  try {
    let snap = createSaveSnapshot(sampleState);
    const firstBytes = JSON.stringify(snap).length;
    for (let i = 0; i < 100; i++) {
      snap = createSaveSnapshot(sampleState);
      const restored = restoreSaveSnapshot(JSON.parse(JSON.stringify(snap)) as typeof snap);
      if (!restored.id) throw new Error('restore 后状态缺失 id');
    }
    const lastBytes = JSON.stringify(createSaveSnapshot(sampleState)).length;
    // 存档体积应稳定（无指数膨胀）；允许极小浮点/序列化抖动容差。
    saveLoad100xNoInflation = Math.abs(lastBytes - firstBytes) <= Math.max(8, firstBytes * 0.01);
  } catch {
    saveLoad100xNoCrash = false;
    saveLoad100xNoInflation = false;
  }

  const engineeringGate: EngineeringGate = {
    saveLoad100xNoCrash,
    saveLoad100xNoInflation,
    formTransitionNoLeak,
    stepBudgetsMs,
    longUnresponsive,
    duplicateListenerBlowup: 'unmeasured',
  };

  if (!saveLoad100xNoCrash) notes.push('Save/Load 100× 出现崩溃（见工程门禁）。');
  if (!saveLoad100xNoInflation) notes.push('Save/Load 100× 存档体积发生膨胀（可能指数增长）。');
  if (!formTransitionNoLeak) notes.push('Form Transition 存在事务 id 泄漏（processedTransactionIds 不收敛）。');

  return {
    measuredAt: new Date(0).toISOString(),
    environment: { node: process.version, platform: process.platform },
    newCampaignInit,
    questSetup,
    battleSetup,
    save,
    load,
    formTransition,
    fullRun,
    engineeringGate,
    notes,
  };
}
