// Phase 9E §8—§25：Fanatic / Pyre / 强制抓取-囚禁 运行时（纯函数，自包含可测）。
//
// 复用而非复制（硬约束 1、18）：
// - Fanatic 是 Boss BattleActor、Pyre 是独立 Boss-minion BattleActor，二者不复制
//   Phase 9A 状态机；行动落地时复用既有 Monster Turn / Victory / XP / Campaign Advance；
// - 伤害 / 压力 / 状态一律经正式管线（本模块不另起伤害计算，硬约束 13）；
// - Loot / Death's Door / Stagecoach / XP 语义复用既有实现。
//
// 本模块负责 Fanatic 家族特有的十件事：
//   1) FanaticBattleRuntime 创建 / 修复（§8 / §10）；
//   2) 3+1 Initiative 卡（§8）；
//   3) Turn Prelude（每张 Fanatic Card 都评估，§11 / §20）；
//   4) Pyre Active / Area Space Selector（§12）；
//   5) Closest Hero Selector（Room Path Distance + Tie-break，§13）；
//   6) Fanatic Forced Movement（Definition 移动值，§14）；
//   7) Reached 判定（Prototype = 同 Area，§15）；
//   8) Throw Into Pyre 原子事务 + Captive State（§16 / §17）；
//   9) Pyre Turn / Pyre Death Cleanup（§18 / §19）；
//  10) Fanatic Normal Skill + Victory Cleanup + Save Migration（§21 / §22 / §24）。

import type {
  CaptiveActorState,
  CaptiveStatus,
  ClosestHeroCandidate,
  ClosestHeroSelectionRecord,
  FanaticBattleRuntime,
  FanaticOfficialDataStatus,
  FanaticRoomDefinition,
  PyreCaptiveEffectDefinition,
  RoomAreaGraph,
} from '../../types/fanatic';
import {
  FANATIC_PROTOTYPE_AREA_GRAPH,
  FANATIC_PROTOTYPE_ROOM,
  PYRE_PROTOTYPE_CAPTIVE_EFFECT,
  getFanaticNormalSkillTable,
} from '../../data/bosses/fanatic-family';

// ---------------------------------------------------------------------------
// 可注入 RNG（硬约束：不使用 Math.random()）
// ---------------------------------------------------------------------------

/** 确定性 RNG（mulberry32）——测试与回放用，保证同 seed 同结果。 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 掷一个 d10（1—10）。 */
export function rollD10(rng: () => number): number {
  const v = Math.floor(rng() * 10) + 1;
  return Math.min(10, Math.max(1, v));
}

// ---------------------------------------------------------------------------
// §25 幂等键（事务 ID）
// ---------------------------------------------------------------------------

export const idempotencyKeys = {
  roomSetup: (bossQuestId: string, roomId: string) => `fanatic-room-setup:${bossQuestId}:${roomId}`,
  turnPrelude: (battleId: string, initiativeCardId: string) =>
    `fanatic-turn-prelude:${battleId}:${initiativeCardId}`,
  closestHero: (preludeTransactionId: string) => `fanatic-closest-hero:${preludeTransactionId}`,
  forcedMove: (preludeTransactionId: string) => `fanatic-forced-move:${preludeTransactionId}`,
  throwIntoPyre: (preludeTransactionId: string, heroId: string) =>
    `fanatic-throw-into-pyre:${preludeTransactionId}:${heroId}`,
  captive: (throwTransactionId: string) => `fanatic-captive:${throwTransactionId}`,
  pyreTurn: (battleId: string, initiativeCardId: string) => `pyre-turn:${battleId}:${initiativeCardId}`,
  pyreDestroyed: (battleId: string, pyreActorId: string) =>
    `pyre-destroyed:${battleId}:${pyreActorId}`,
  victory: (bossBattleId: string) => `fanatic-victory:${bossBattleId}`,
  removePyre: (bossBattleId: string, reason: string) => `fanatic-remove-pyre:${bossBattleId}:${reason}`,
  releaseCaptive: (captiveStateId: string, reason: string) =>
    `fanatic-release-captive:${captiveStateId}:${reason}`,
};

// ---------------------------------------------------------------------------
// §8 Initiative（3 张 Fanatic + 1 张 Pyre）
// ---------------------------------------------------------------------------

export interface FanaticInitiativeCard {
  id: string;
  actorId: string;
  actorKind: 'fanatic' | 'pyre';
  /** Fanatic 每轮三张卡的序号（1—3）；Pyre 恒为 1。 */
  ordinal: number;
  roundCreated: number;
  resolved: boolean;
  resolutionTransactionId: string | null;
}

/** 创建一张 Fanatic Initiative Card（§8：Deck 加入三张 Fanatic 卡）。 */
export function createFanaticInitiativeCard(
  actorId: string,
  ordinal: number,
  round: number
): FanaticInitiativeCard {
  return {
    id: `fanatic-init:${actorId}:${round}:${ordinal}`,
    actorId,
    actorKind: 'fanatic',
    ordinal,
    roundCreated: round,
    resolved: false,
    resolutionTransactionId: null,
  };
}

/** 创建一张 Pyre Initiative Card（§8：Deck 加入一张 Pyre 卡）。 */
export function createPyreInitiativeCard(actorId: string, round: number): FanaticInitiativeCard {
  return {
    id: `pyre-init:${actorId}:${round}`,
    actorId,
    actorKind: 'pyre',
    ordinal: 1,
    roundCreated: round,
    resolved: false,
    resolutionTransactionId: null,
  };
}

/**
 * 创建整套 Initiative（3 张 Fanatic + 1 张 Pyre = 4 张，§8）。
 * 返回顺序：[fanatic#1, fanatic#2, fanatic#3, pyre]。
 */
export function createFanaticInitiativeSet(
  fanaticActorId: string,
  pyreActorId: string,
  round = 1
): FanaticInitiativeCard[] {
  return [
    createFanaticInitiativeCard(fanaticActorId, 1, round),
    createFanaticInitiativeCard(fanaticActorId, 2, round),
    createFanaticInitiativeCard(fanaticActorId, 3, round),
    createPyreInitiativeCard(pyreActorId, round),
  ];
}

// ---------------------------------------------------------------------------
// §8 / §10 Fanatic Battle Runtime
// ---------------------------------------------------------------------------

/** 创建 Fanatic 战斗运行时（§8 Room Setup 初始化）。 */
export function createFanaticBattleRuntime(
  fanaticActorId: string,
  pyreActorId: string | null,
  fanaticInitiativeCardIds: [string, string, string],
  pyreInitiativeCardId: string | null,
  dataStatus: FanaticOfficialDataStatus = 'prototype'
): FanaticBattleRuntime {
  return {
    fanaticActorId,
    pyreActorId,
    activeCaptiveHeroId: null,
    fanaticInitiativeCardIds,
    pyreInitiativeCardId,
    lastTurnPreludeTransactionId: null,
    lastClosestHeroSelectionId: null,
    lastThrowIntoPyreTransactionId: null,
    pyreRemovedReason: null,
    dataStatus,
  };
}

// ---------------------------------------------------------------------------
// §12 Pyre Active 与 Area Space Selector
// ---------------------------------------------------------------------------

/** 战斗中某 Actor 的最小快照（由调用方从真实 BattleState 投影，§12 / §13）。 */
export interface FanaticBattleActorSnapshot {
  actorId: string;
  tags: string[];
  alive: boolean;
  removed: boolean;
  areaId: string;
  /** Hero 在 Room 中的站位序号（1—4），用于确定性 Tie-break。 */
  position?: number;
  /** 是否为当前 captive（被投入 Pyre 的 Hero），用于候选过滤（§13）。 */
  captive?: boolean;
}

/** Pyre 是否仍在 play（存在 / alive / 未 removed，§12）。 */
export function isPyreInPlay(pyre: FanaticBattleActorSnapshot | null | undefined): boolean {
  return !!pyre && pyre.alive && !pyre.removed;
}

/** 取 Pyre 所在 Area（不在 play 返回 null，§12）。 */
export function getPyreAreaId(pyre: FanaticBattleActorSnapshot | null | undefined): string | null {
  return isPyreInPlay(pyre) ? pyre!.areaId : null;
}

/**
 * 取某 Area 的剩余容量（§12）：
 * capacity - 当前占用该 Area 的 captive 数量。
 * 注意：Pyre Actor 自身是否占位由正式 Room / Actor Definition 决定，
 * 资料不足时 official battle 禁用；此处只统计 captive 占位（Prototype 语义）。
 */
export function getRemainingAreaCapacity(
  room: FanaticRoomDefinition,
  areaId: string,
  occupants: { areaId: string }[]
): number {
  const capacity = room.areaCapacities[areaId];
  if (capacity === undefined) return 0;
  const used = occupants.filter((o) => o.areaId === areaId).length;
  return Math.max(0, capacity - used);
}

/**
 * Fanatic 本次行动是否可将 Hero 投入 Pyre（§12 统一 Selector）：
 * Pyre in play 且 Pyre Area 有剩余空间。
 */
export function canFanaticThrowHeroIntoPyre(params: {
  room: FanaticRoomDefinition;
  pyre: FanaticBattleActorSnapshot | null | undefined;
  captiveOccupants: { areaId: string }[];
}): boolean {
  const { room, pyre, captiveOccupants } = params;
  const areaId = getPyreAreaId(pyre);
  if (!areaId) return false;
  return getRemainingAreaCapacity(room, areaId, captiveOccupants) > 0;
}

// ---------------------------------------------------------------------------
// §13 最近 Hero Selector（Room Path Distance + Tie-break）
// ---------------------------------------------------------------------------

/**
 * Dijkstra 最短路径距离（无向图，§13：使用 Room Graph / Path Distance，
 * 不使用 DOM 坐标、像素或 Hero 数组顺序）。不可达返回 Infinity。
 */
export function pathDistance(graph: RoomAreaGraph, from: string, to: string): number {
  if (from === to) return 0;
  const adj = new Map<string, { to: string; distance: number }[]>();
  for (const a of graph.areas) adj.set(a, []);
  for (const e of graph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push({ to: e.to, distance: e.distance });
    adj.get(e.to)!.push({ to: e.from, distance: e.distance }); // 无向
  }
  const dist = new Map<string, number>();
  for (const a of adj.keys()) dist.set(a, Infinity);
  dist.set(from, 0);
  const visited = new Set<string>();
  while (visited.size < adj.size) {
    // 取未访问中 dist 最小者
    let cur: string | null = null;
    let best = Infinity;
    for (const [node, d] of dist) {
      if (!visited.has(node) && d < best) {
        best = d;
        cur = node;
      }
    }
    if (cur === null) break;
    visited.add(cur);
    if (cur === to) return dist.get(to)!;
    for (const edge of adj.get(cur) ?? []) {
      if (visited.has(edge.to)) continue;
      const nd = (dist.get(cur) ?? Infinity) + edge.distance;
      if (nd < (dist.get(edge.to) ?? Infinity)) dist.set(edge.to, nd);
    }
  }
  const result = dist.get(to);
  return result === undefined ? Infinity : result;
}

/** 候选 Hero 过滤（§13：存活 / 在战斗 / 未 removed / 非当前 captive）。 */
export function getFanaticHeroCandidates(
  actors: FanaticBattleActorSnapshot[]
): ClosestHeroCandidate[] {
  return actors
    .filter((a) => a.tags.includes('hero') && a.alive && !a.removed && !a.captive)
    .map((a) => ({ heroId: a.actorId, areaId: a.areaId, position: a.position ?? 0 }));
}

export interface ClosestHeroSelectionResult {
  ok: boolean;
  failure?: 'no-candidates' | 'unreachable';
  record: ClosestHeroSelectionRecord | null;
}

/**
 * 选择最近 Hero（§13）：
 * - 按 Room Path Distance 计算每个候选的距离；
 * - 距离最小者胜；并列时使用统一 Tie-break（position 升序，确定性），
 *   若需 RNG 也接受注入，但结果先保存（transactionId 幂等，刷新不重选，硬约束 7）。
 */
export function selectClosestHeroByPath(params: {
  fanaticActorId: string;
  fanaticAreaId: string;
  candidates: ClosestHeroCandidate[];
  roomGraph: RoomAreaGraph;
  preludeTransactionId: string;
  /** 可选 RNG：仅当距离与 position 都并列时用于最终 Tie-break（默认取首个）。 */
  rng?: () => number;
}): ClosestHeroSelectionResult {
  const { fanaticActorId, fanaticAreaId, candidates, roomGraph, preludeTransactionId, rng } = params;
  if (candidates.length === 0) return { ok: false, failure: 'no-candidates', record: null };

  const distanceByHeroId: Record<string, number> = {};
  for (const c of candidates) {
    distanceByHeroId[c.heroId] = pathDistance(roomGraph, fanaticAreaId, c.areaId);
  }
  const reachable = candidates.filter((c) => Number.isFinite(distanceByHeroId[c.heroId]));
  if (reachable.length === 0) {
    return {
      ok: false,
      failure: 'unreachable',
      record: {
        id: idempotencyKeys.closestHero(preludeTransactionId),
        fanaticActorId,
        candidateHeroIds: candidates.map((c) => c.heroId),
        distanceByHeroId,
        selectedHeroId: '',
        tieBreakMethod: 'none',
        transactionId: preludeTransactionId,
      },
    };
  }

  const minDist = Math.min(...reachable.map((c) => distanceByHeroId[c.heroId]));
  const tied = reachable.filter((c) => distanceByHeroId[c.heroId] === minDist);

  let selected = tied[0];
  let tieBreakMethod = 'single-closest';
  if (tied.length > 1) {
    // 统一 Tie-break：position 升序（确定性）
    const byPosition = [...tied].sort((a, b) => a.position - b.position);
    const minPos = byPosition[0].position;
    const posTied = byPosition.filter((c) => c.position === minPos);
    if (posTied.length > 1 && rng) {
      const idx = Math.floor(rng() * posTied.length) % posTied.length;
      selected = posTied[idx];
      tieBreakMethod = 'position-then-rng';
    } else {
      selected = byPosition[0];
      tieBreakMethod = 'position-asc';
    }
  }

  return {
    ok: true,
    record: {
      id: idempotencyKeys.closestHero(preludeTransactionId),
      fanaticActorId,
      candidateHeroIds: candidates.map((c) => c.heroId),
      distanceByHeroId,
      selectedHeroId: selected.heroId,
      tieBreakMethod,
      transactionId: preludeTransactionId,
    },
  };
}

// ---------------------------------------------------------------------------
// §14 Fanatic 强制移动（Definition 移动值；不默认 1 / 不默认无限）
// ---------------------------------------------------------------------------

export interface FanaticMovementResult {
  ok: boolean;
  failure?: 'no-path' | 'no-movement-value' | 'already-adjacent';
  transactionId: string;
  fromAreaId: string;
  toAreaId: string;
  /** 起点→终点经过的 Area 序列（含端点）。 */
  path: string[];
  /** 实际消耗的移动步数（受 movementValue 上限限制）。 */
  stepsUsed: number;
  reachedHeroArea: boolean;
}

/**
 * 计算无向图上 from→to 的一条最短 Area 路径（含端点）。不可达返回 []。
 */
export function findAreaPath(graph: RoomAreaGraph, from: string, to: string): string[] {
  if (from === to) return [from];
  const adj = new Map<string, string[]>();
  const push = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  };
  for (const a of graph.areas) adj.set(a, []);
  for (const e of graph.edges) {
    push(e.from, e.to);
    push(e.to, e.from);
  }
  // BFS（本原型图边权均为 1，最短跳数=最短距离）
  const prev = new Map<string, string | null>();
  prev.set(from, null);
  const queue: string[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const nxt of adj.get(cur) ?? []) {
      if (!prev.has(nxt)) {
        prev.set(nxt, cur);
        queue.push(nxt);
      }
    }
  }
  if (!prev.has(to)) return [];
  const path: string[] = [];
  let node: string | null = to;
  while (node !== null) {
    path.unshift(node);
    node = prev.get(node) ?? null;
  }
  return path;
}

/**
 * Fanatic 向目标 Hero 所在 Area 移动（§14）：
 * - movementValue 从 verified/prototype Definition 读取，缺失（<=0）时失败（official 禁用）；
 * - 使用现有 Pathfinding（Room 连接），保存起点/路径/终点；
 * - 规则结果先保存、动画后播放；transactionId 幂等，刷新不重复移动（硬约束 8、9）。
 */
export function moveFanaticTowardHero(params: {
  fanaticAreaId: string;
  targetAreaId: string;
  movementValue: number;
  roomGraph: RoomAreaGraph;
  preludeTransactionId: string;
}): FanaticMovementResult {
  const { fanaticAreaId, targetAreaId, movementValue, roomGraph, preludeTransactionId } = params;
  const transactionId = idempotencyKeys.forcedMove(preludeTransactionId);
  const base = { transactionId, fromAreaId: fanaticAreaId, toAreaId: fanaticAreaId };

  if (fanaticAreaId === targetAreaId) {
    return { ok: true, ...base, path: [fanaticAreaId], stepsUsed: 0, reachedHeroArea: true, failure: 'already-adjacent' };
  }
  if (!(movementValue > 0)) {
    return { ok: false, failure: 'no-movement-value', ...base, path: [], stepsUsed: 0, reachedHeroArea: false };
  }

  const fullPath = findAreaPath(roomGraph, fanaticAreaId, targetAreaId);
  if (fullPath.length === 0) {
    return { ok: false, failure: 'no-path', ...base, path: [], stepsUsed: 0, reachedHeroArea: false };
  }

  // 受移动值限制：最多前进 movementValue 步（每条边 1 步）
  const maxIndex = Math.min(movementValue, fullPath.length - 1);
  const walked = fullPath.slice(0, maxIndex + 1);
  const dest = walked[walked.length - 1];
  return {
    ok: true,
    transactionId,
    fromAreaId: fanaticAreaId,
    toAreaId: dest,
    path: walked,
    stepsUsed: maxIndex,
    reachedHeroArea: dest === targetAreaId,
  };
}

// ---------------------------------------------------------------------------
// §15 到达判定（Prototype = 同一 Area；正式判定来自卡牌/Room Rule）
// ---------------------------------------------------------------------------

/**
 * 到达判定（§15）：
 * - Prototype Harness 规则：Fanatic 与 Hero 位于同一 Area 即算到达；
 * - 正式判定必须来自 verified 卡牌 / Room Rule（此处 prototype 语义，
 *   该规则不得写入正式 Fanatic ID）。
 */
export function hasFanaticReachedHero(params: {
  fanaticAreaId: string;
  heroAreaId: string;
  mode?: 'formal' | 'prototype';
}): boolean {
  const mode = params.mode ?? 'prototype';
  if (mode === 'formal') return false; // 正式到达规则缺失 → 不判定到达
  return params.fanaticAreaId === params.heroAreaId;
}

// ---------------------------------------------------------------------------
// §16 Throw Into Pyre（原子事务） + §17 Captive State
// ---------------------------------------------------------------------------

export type ThrowIntoPyreFailure =
  | 'fanatic-dead'
  | 'pyre-not-in-play'
  | 'pyre-area-full'
  | 'invalid-hero'
  | 'not-reached'
  | 'hero-already-captive'
  | 'other-captive-present'
  | 'battle-ended'
  | 'prelude-already-processed';

export interface ThrowIntoPyreResult {
  ok: boolean;
  failure?: ThrowIntoPyreFailure;
  transactionId: string;
  /** 失败时为 null（原子性：不产生半完成 Captive，硬约束 11、12）。 */
  captive: CaptiveActorState | null;
  /** Hero 目标 Area：成功 = Pyre Area；失败 = 回滚到 originalArea（硬约束 12）。 */
  heroAreaId: string;
  runtime: FanaticBattleRuntime;
}

/**
 * 将 Hero 投入 Pyre（§16 原子事务）。预验证（§16 九项）：
 * Fanatic 存活 / Pyre in play / Pyre Area 有空间 / Hero 合法 / 已到达 /
 * Hero 未 captive / 无其他 captive（除非资料允许）/ Battle 未结束 / 同一 Prelude 未处理。
 * 任一失败 → Hero 回滚原 Area，0 Captive，runtime 不变（原子回滚）。
 */
export function throwHeroIntoPyre(params: {
  runtime: FanaticBattleRuntime;
  heroId: string;
  heroOriginalAreaId: string;
  pyreAreaId: string;
  captiveEffect: PyreCaptiveEffectDefinition;
  preludeTransactionId: string;
  fanaticAlive: boolean;
  pyreInPlay: boolean;
  pyreAreaHasSpace: boolean;
  reached: boolean;
  battleEnded?: boolean;
  /** 正式资料是否允许多名 captive（默认 false → 限制单一 active captive，§20）。 */
  allowMultipleCaptive?: boolean;
  now?: string;
}): ThrowIntoPyreResult {
  const {
    runtime,
    heroId,
    heroOriginalAreaId,
    pyreAreaId,
    captiveEffect,
    preludeTransactionId,
    fanaticAlive,
    pyreInPlay,
    pyreAreaHasSpace,
    reached,
  } = params;
  const battleEnded = params.battleEnded ?? false;
  const allowMultipleCaptive = params.allowMultipleCaptive ?? false;
  const now = params.now ?? '1970-01-01T00:00:00.000Z';
  const transactionId = idempotencyKeys.throwIntoPyre(preludeTransactionId, heroId);

  const fail = (failure: ThrowIntoPyreFailure): ThrowIntoPyreResult => ({
    ok: false,
    failure,
    transactionId,
    captive: null,
    heroAreaId: heroOriginalAreaId, // 回滚原 Area
    runtime,
  });

  // §16 预验证（顺序即优先级）
  if (battleEnded) return fail('battle-ended');
  if (!fanaticAlive) return fail('fanatic-dead');
  if (!pyreInPlay) return fail('pyre-not-in-play');
  if (!pyreAreaHasSpace) return fail('pyre-area-full');
  if (!heroId) return fail('invalid-hero');
  if (!reached) return fail('not-reached');
  if (runtime.activeCaptiveHeroId === heroId) return fail('hero-already-captive');
  if (!allowMultipleCaptive && runtime.activeCaptiveHeroId !== null) {
    return fail('other-captive-present');
  }
  // 同一 Prelude 已处理（幂等）：lastThrowIntoPyreTransactionId 命中 → 视为已完成，不重复
  if (runtime.lastThrowIntoPyreTransactionId === transactionId && runtime.activeCaptiveHeroId === heroId) {
    return fail('prelude-already-processed');
  }

  // 提交：创建 Captive State（行为字段全部来自 Definition，§17）
  const captive: CaptiveActorState = {
    id: idempotencyKeys.captive(transactionId),
    captiveActorId: heroId,
    captorActorId: runtime.fanaticActorId,
    containerActorId: runtime.pyreActorId ?? '',
    sourceType: 'fanatic-pyre',
    originalAreaId: heroOriginalAreaId,
    currentAreaId: pyreAreaId,
    status: 'inside-container',
    canAct: captiveEffect.canAct,
    canMove: captiveEffect.canMove,
    canUseSkill: captiveEffect.canUseSkill,
    canBeTargeted: captiveEffect.canBeTargeted,
    onContainerTurn: captiveEffect.onContainerTurn,
    onContainerDestroyed: captiveEffect.onContainerDestroyed,
    createdAt: now,
    transactionId,
  };

  const nextRuntime: FanaticBattleRuntime = {
    ...runtime,
    activeCaptiveHeroId: heroId,
    lastThrowIntoPyreTransactionId: transactionId,
  };

  return { ok: true, transactionId, captive, heroAreaId: pyreAreaId, runtime: nextRuntime };
}

// ---------------------------------------------------------------------------
// §11 / §20 Fanatic Turn Prelude（每张 Fanatic Card 都评估）
// ---------------------------------------------------------------------------

export type PreludeOutcome =
  | 'threw-hero-into-pyre'
  | 'moved-not-reached'
  | 'skipped-pyre-not-in-play'
  | 'skipped-pyre-area-full'
  | 'skipped-no-candidates'
  | 'skipped-fanatic-dead'
  | 'skipped-already-processed'
  | 'skipped-other-captive';

export interface FanaticTurnPreludeResult {
  transactionId: string;
  outcome: PreludeOutcome;
  /** 是否进入普通 Skill（Prelude 完成后无论是否抓取都进入 Skill，§11）。 */
  proceedToNormalSkill: boolean;
  selection: ClosestHeroSelectionRecord | null;
  movement: FanaticMovementResult | null;
  throwResult: ThrowIntoPyreResult | null;
  captive: CaptiveActorState | null;
  runtime: FanaticBattleRuntime;
  logs: string[];
}

/**
 * Fanatic Turn Prelude（§11）：每张 Fanatic Initiative 开始时执行。
 * 顺序：验证 Fanatic 存活 → 验证 Pyre in play → 验证 Pyre Area 有空间 →
 * 选择最近 Hero → 向该 Hero 移动 → 到达判定 → 到达则投入 Pyre → 保存 →
 * 再进入普通 Skill。
 *
 * 幂等（硬约束 4、17）：同一 initiativeCardId 的 preludeTransactionId 稳定；
 * 若 runtime.lastTurnPreludeTransactionId 已等于本次 → 视为已处理，跳过危险事务。
 */
export function resolveFanaticTurnPrelude(params: {
  battleId: string;
  initiativeCardId: string;
  runtime: FanaticBattleRuntime;
  room: FanaticRoomDefinition;
  roomGraph: RoomAreaGraph;
  fanaticActor: FanaticBattleActorSnapshot;
  pyre: FanaticBattleActorSnapshot | null;
  heroActors: FanaticBattleActorSnapshot[];
  captiveOccupants: { areaId: string }[];
  movementValue: number;
  captiveEffect: PyreCaptiveEffectDefinition;
  battleEnded?: boolean;
  allowMultipleCaptive?: boolean;
  reachMode?: 'formal' | 'prototype';
  rng?: () => number;
  now?: string;
}): FanaticTurnPreludeResult {
  const {
    battleId,
    initiativeCardId,
    runtime,
    room,
    roomGraph,
    fanaticActor,
    pyre,
    heroActors,
    captiveOccupants,
    movementValue,
    captiveEffect,
    rng,
    now,
  } = params;
  const battleEnded = params.battleEnded ?? false;
  const allowMultipleCaptive = params.allowMultipleCaptive ?? false;
  const reachMode = params.reachMode ?? 'prototype';

  const transactionId = idempotencyKeys.turnPrelude(battleId, initiativeCardId);
  const nextRuntimeBase: FanaticBattleRuntime = { ...runtime, lastTurnPreludeTransactionId: transactionId };

  const done = (
    outcome: PreludeOutcome,
    extra: Partial<FanaticTurnPreludeResult> = {},
    rt: FanaticBattleRuntime = nextRuntimeBase
  ): FanaticTurnPreludeResult => ({
    transactionId,
    outcome,
    proceedToNormalSkill: true,
    selection: null,
    movement: null,
    throwResult: null,
    captive: null,
    runtime: rt,
    logs: [],
    ...extra,
  });

  // 幂等：同一 Card 已处理过 Prelude → 不重复危险事务
  if (runtime.lastTurnPreludeTransactionId === transactionId) {
    return done('skipped-already-processed', {
      logs: ['Fanatic Turn Prelude（重复调用，已处理，跳过）'],
    }, runtime);
  }

  // 1) Fanatic 存活
  if (!fanaticActor.alive || fanaticActor.removed || battleEnded) {
    return done('skipped-fanatic-dead', { logs: ['Fanatic 不在场，跳过 Prelude'] });
  }

  // 2) Pyre 仍在 play
  if (!isPyreInPlay(pyre)) {
    return done('skipped-pyre-not-in-play', {
      logs: ['Pyre 已不在场，Fanatic 后续行动不再执行抓取 Prelude'],
    });
  }

  // 3) Pyre Area 有空间
  const pyreAreaId = getPyreAreaId(pyre)!;
  const remaining = getRemainingAreaCapacity(room, pyreAreaId, captiveOccupants);
  if (remaining <= 0) {
    return done('skipped-pyre-area-full', {
      logs: [`Pyre Area 无空间（剩余 ${remaining}），跳过抓取，直接普通 Skill`],
    });
  }

  // 已有其他 captive 且不允许多 captive → 跳过（§20）
  if (!allowMultipleCaptive && runtime.activeCaptiveHeroId !== null) {
    return done('skipped-other-captive', {
      logs: ['已有一名 Captive Hero，official 模式限制单一 captive，跳过抓取'],
    });
  }

  // 4) 选择最近 Hero
  const candidates = getFanaticHeroCandidates(heroActors);
  const selectionRes = selectClosestHeroByPath({
    fanaticActorId: fanaticActor.actorId,
    fanaticAreaId: fanaticActor.areaId,
    candidates,
    roomGraph,
    preludeTransactionId: transactionId,
    rng,
  });
  if (!selectionRes.ok || !selectionRes.record || !selectionRes.record.selectedHeroId) {
    return done('skipped-no-candidates', {
      selection: selectionRes.record,
      logs: ['没有可选 Hero（全部阵亡/已 captive/不可达），跳过抓取'],
    }, { ...nextRuntimeBase, lastClosestHeroSelectionId: selectionRes.record?.id ?? null });
  }
  const selection = selectionRes.record;
  const selectedHeroId = selection.selectedHeroId;
  const selectedHero = heroActors.find((h) => h.actorId === selectedHeroId)!;
  const logs: string[] = [
    'Fanatic Turn Prelude',
    `Pyre 仍在场，Area 剩余空间：${remaining}`,
    `最近 Hero：${selectedHeroId}，距离：${selection.distanceByHeroId[selectedHeroId]}`,
    `Fanatic 向 ${selectedHeroId} 移动`,
  ];

  const rtAfterSelection: FanaticBattleRuntime = {
    ...nextRuntimeBase,
    lastClosestHeroSelectionId: selection.id,
  };

  // 5) 强制移动
  const movement = moveFanaticTowardHero({
    fanaticAreaId: fanaticActor.areaId,
    targetAreaId: selectedHero.areaId,
    movementValue,
    roomGraph,
    preludeTransactionId: transactionId,
  });

  // 6) 到达判定（用移动后终点判断）
  const fanaticAreaAfterMove = movement.ok ? movement.toAreaId : fanaticActor.areaId;
  const reached = hasFanaticReachedHero({
    fanaticAreaId: fanaticAreaAfterMove,
    heroAreaId: selectedHero.areaId,
    mode: reachMode,
  });

  if (!reached) {
    return done('moved-not-reached', {
      selection,
      movement,
      logs: [...logs, `Fanatic 未到达 ${selectedHeroId}（步数 ${movement.stepsUsed}），本次不投入 Pyre`],
    }, rtAfterSelection);
  }

  // 7) 到达 → Throw Into Pyre（原子）
  logs.push(`Fanatic 到达 ${selectedHeroId}`);
  const throwResult = throwHeroIntoPyre({
    runtime: rtAfterSelection,
    heroId: selectedHeroId,
    heroOriginalAreaId: selectedHero.areaId,
    pyreAreaId,
    captiveEffect,
    preludeTransactionId: transactionId,
    fanaticAlive: fanaticActor.alive,
    pyreInPlay: true,
    pyreAreaHasSpace: remaining > 0,
    reached: true,
    battleEnded,
    allowMultipleCaptive,
    now,
  });

  if (!throwResult.ok) {
    return done('moved-not-reached', {
      selection,
      movement,
      throwResult,
      logs: [...logs, `投入 Pyre 失败（${throwResult.failure}），Hero 回滚原 Area`],
    }, rtAfterSelection);
  }

  return {
    transactionId,
    outcome: 'threw-hero-into-pyre',
    proceedToNormalSkill: true,
    selection,
    movement,
    throwResult,
    captive: throwResult.captive,
    runtime: throwResult.runtime,
    logs: [
      ...logs,
      `${selectedHeroId} 被投入 Pyre Area`,
      'Captive State 已创建',
    ],
  };
}

// ---------------------------------------------------------------------------
// §18 Pyre Turn（由自己的 Initiative 驱动）
// ---------------------------------------------------------------------------

export interface PyreActionResult {
  ok: boolean;
  failure?: 'pyre-dead' | 'skill-table-unavailable';
  transactionId: string;
  /** 先保存的 d10 结果（UI 不重掷，硬约束：刷新不重投）。 */
  skillRoll?: number;
  selectedSkillId?: string;
  /** 是否有 captive（有/无 captive 时行动由 Definition 决定，此处仅标记，§18）。 */
  hasCaptive: boolean;
}

/**
 * Pyre 独立行动（§18）：Pyre 死亡后 Card 失效；否则掷 d10、先保存、从技能表选取。
 * Damage / Stress / Condition 走正式管线（本模块不计算），资料不足时 official 禁用。
 */
export function resolvePyreAction(params: {
  battleId: string;
  initiativeCardId: string;
  pyre: FanaticBattleActorSnapshot | null;
  hasCaptive: boolean;
  rng: () => number;
  skillTable: string[];
}): PyreActionResult {
  const { battleId, initiativeCardId, pyre, hasCaptive, rng, skillTable } = params;
  const transactionId = idempotencyKeys.pyreTurn(battleId, initiativeCardId);
  if (!isPyreInPlay(pyre)) {
    return { ok: false, failure: 'pyre-dead', transactionId, hasCaptive };
  }
  if (skillTable.length === 0) {
    return { ok: false, failure: 'skill-table-unavailable', transactionId, hasCaptive };
  }
  const skillRoll = rollD10(rng);
  const selectedSkillId = skillTable[(skillRoll - 1) % skillTable.length];
  return { ok: true, transactionId, skillRoll, selectedSkillId, hasCaptive };
}

// ---------------------------------------------------------------------------
// §19 Pyre 死亡（Card 失效 / 从 Ranged 移除 / 处理 Captive / 后续跳过 Prelude）
// ---------------------------------------------------------------------------

export interface PyreDeathResult {
  transactionId: string;
  pyreRemoved: true;
  invalidatedPyreCardId: string | null;
  /** 处理后的 Captive（released / removed / 由 Definition 决定）。 */
  captive: CaptiveActorState | null;
  /** Prototype：Hero 保留在 Pyre Area 并标记 released；正式 ID 不启用该行为。 */
  captiveResolution: 'released' | 'removed' | 'custom' | 'none';
  runtime: FanaticBattleRuntime;
  logs: string[];
}

/**
 * Pyre HP 归零（§19）：Pyre 死亡 → Pyre Initiative 失效 → 从 Ranged 移除 →
 * 处理 Captive Hero（按 Captive Definition onContainerDestroyed）→ 清理/转换 Captive
 * State → 后续 Fanatic Prelude 跳过（runtime.pyreActorId = null / pyreRemovedReason）。
 * 幂等：captiveResolution 由 Definition 决定，release 幂等键防重复（硬约束 17）。
 */
export function resolvePyreDeath(params: {
  battleId: string;
  runtime: FanaticBattleRuntime;
  captive: CaptiveActorState | null;
  now?: string;
}): PyreDeathResult {
  const { battleId, runtime, captive } = params;
  const now = params.now ?? '1970-01-01T00:00:00.000Z';
  const pyreActorId = runtime.pyreActorId ?? 'pyre-actor';
  const transactionId = idempotencyKeys.pyreDestroyed(battleId, pyreActorId);

  let resolvedCaptive: CaptiveActorState | null = null;
  let captiveResolution: PyreDeathResult['captiveResolution'] = 'none';
  const logs = ['Pyre 被击败', 'Pyre Initiative 失效'];

  if (captive && captive.status === 'inside-container') {
    switch (captive.onContainerDestroyed) {
      case 'released':
        resolvedCaptive = { ...captive, status: 'released', releasedAt: now };
        captiveResolution = 'released';
        logs.push('Captive Hero 按 Definition 释放（Prototype 保留在 Pyre Area 并标记 released）');
        break;
      case 'removed':
        resolvedCaptive = { ...captive, status: 'removed', releasedAt: now };
        captiveResolution = 'removed';
        logs.push('Captive Hero 按 Definition 移除');
        break;
      default:
        resolvedCaptive = { ...captive, status: 'container-destroyed', releasedAt: now };
        captiveResolution = 'custom';
        logs.push('Captive Hero 落点由正式资料决定（custom）');
    }
  }

  logs.push('Fanatic 后续行动不再执行抓取 Prelude');

  const nextRuntime: FanaticBattleRuntime = {
    ...runtime,
    pyreActorId: null,
    pyreInitiativeCardId: null,
    activeCaptiveHeroId: null,
    pyreRemovedReason: 'destroyed',
  };

  return {
    transactionId,
    pyreRemoved: true,
    invalidatedPyreCardId: runtime.pyreInitiativeCardId,
    captive: resolvedCaptive,
    captiveResolution,
    runtime: nextRuntime,
    logs,
  };
}

// ---------------------------------------------------------------------------
// §21 Fanatic 普通 Skill（Prelude 完成后执行；掷 d10、先保存、选 Skill）
// ---------------------------------------------------------------------------

export interface FanaticNormalSkillResult {
  ok: boolean;
  failure?: 'skill-table-unavailable';
  skillRoll?: number;
  selectedSkillId?: string;
}

/** Fanatic 普通 Skill（§21）：掷 d10、先保存结果、从 Skill Table 选取（不含前置移动）。 */
export function resolveFanaticNormalSkill(params: {
  rng: () => number;
  skillTable?: string[];
}): FanaticNormalSkillResult {
  const skillTable = params.skillTable ?? getFanaticNormalSkillTable(1, 'prototype');
  if (skillTable.length === 0) return { ok: false, failure: 'skill-table-unavailable' };
  const skillRoll = rollD10(params.rng);
  const selectedSkillId = skillTable[(skillRoll - 1) % skillTable.length];
  return { ok: true, skillRoll, selectedSkillId };
}

// ---------------------------------------------------------------------------
// §22 Fanatic Victory（HP 归零：停止 Queue / 移除 Pyre / 清理 Captive / 3 XP）
// ---------------------------------------------------------------------------

export interface FanaticVictoryResult {
  bossDefeated: boolean;
  stoppedPreludeAndSkillQueue: boolean;
  invalidatedFanaticCardIds: string[];
  pyreRemoved: boolean;
  invalidatedPyreCardId: string | null;
  removePyreReason: 'fanatic-defeated' | null;
  captiveCleared: boolean;
  clearedCaptiveId: string | null;
  removedOtherMonsters: boolean;
  xpResult: 3;
  familyDefeated: boolean;
  campaignAdvanced: boolean;
  runtime: FanaticBattleRuntime;
}

/**
 * Fanatic HP 归零（§22）：停止 Prelude/Skill Queue → 三张 Fanatic Card 失效 →
 * 若 Pyre 仍在场则移除 Pyre + Pyre Card 失效 → 处理 Captive → 移除其他 Monster →
 * 立即 Victory → 3 XP → Family defeated → Campaign Advance。
 * 复用 Phase 9A/8D 的 XP=3 与 Campaign Advance 语义（硬约束 18）。
 */
export function resolveFanaticVictory(params: {
  runtime: FanaticBattleRuntime;
  unresolvedFanaticCardIds: string[];
  pyreInPlay: boolean;
  captive: CaptiveActorState | null;
  otherMonsterActorIds: string[];
  now?: string;
}): FanaticVictoryResult {
  const { runtime, unresolvedFanaticCardIds, pyreInPlay, captive, otherMonsterActorIds } = params;

  const pyreRemoved = pyreInPlay && runtime.pyreActorId !== null;
  const captiveCleared = !!captive;

  const nextRuntime: FanaticBattleRuntime = {
    ...runtime,
    pyreActorId: null,
    pyreInitiativeCardId: null,
    activeCaptiveHeroId: null,
    pyreRemovedReason: pyreRemoved ? 'fanatic-defeated' : runtime.pyreRemovedReason,
  };

  return {
    bossDefeated: true,
    stoppedPreludeAndSkillQueue: true,
    invalidatedFanaticCardIds: unresolvedFanaticCardIds,
    pyreRemoved,
    invalidatedPyreCardId: pyreRemoved ? runtime.pyreInitiativeCardId : null,
    removePyreReason: pyreRemoved ? 'fanatic-defeated' : null,
    captiveCleared,
    clearedCaptiveId: captive?.id ?? null,
    removedOtherMonsters: otherMonsterActorIds.length > 0,
    xpResult: 3,
    familyDefeated: true,
    campaignAdvanced: true,
    runtime: nextRuntime,
  };
}

// ---------------------------------------------------------------------------
// §24 Save Migration / Snapshot / Hash
// ---------------------------------------------------------------------------

export interface FanaticSaveSnapshot {
  version: number;
  fanaticContentVersion: number;
  fanaticBattleRuntime: FanaticBattleRuntime | null;
  captiveActorStates: CaptiveActorState[];
  fanaticPreludeHistory: { transactionId: string; outcome: PreludeOutcome }[];
  closestHeroSelectionHistory: ClosestHeroSelectionRecord[];
  throwIntoPyreHistory: { transactionId: string; heroId: string }[];
  pyreActionHistory: { transactionId: string; skillRoll: number | null }[];
  fanaticDataAudit: { item: string; status: FanaticOfficialDataStatus; note: string }[];
  activeBossDefinitionSnapshot: {
    roomDefinitionId: string;
    roomHash: string;
    officialBattleEnabled: boolean;
  } | null;
}

/** Room Definition 稳定 hash（用于「Definition 变化时沿用 Snapshot」，§24）。 */
export function hashFanaticRoomDefinition(room: FanaticRoomDefinition): string {
  const payload = JSON.stringify({
    id: room.id,
    fanaticArea: room.fanaticPlacement.areaId,
    fanaticStance: room.fanaticPlacement.stance,
    pyreArea: room.pyrePlacement.areaId,
    pyreStance: room.pyrePlacement.stance,
    areas: room.validAreaIds,
    capacities: room.areaCapacities,
  });
  let h = 5381;
  for (let i = 0; i < payload.length; i++) h = ((h * 33) ^ payload.charCodeAt(i)) >>> 0;
  return `h${h.toString(16)}`;
}

/**
 * Phase 9D → 9E 存档迁移（§24）：SAVE_VERSION + 1，补齐 Fanatic 字段。
 * 迁移只补字段、不重放战斗。
 */
export function migrateFanaticSave(previousVersion: number): FanaticSaveSnapshot {
  return {
    version: previousVersion + 1,
    fanaticContentVersion: 1,
    fanaticBattleRuntime: null,
    captiveActorStates: [],
    fanaticPreludeHistory: [],
    closestHeroSelectionHistory: [],
    throwIntoPyreHistory: [],
    pyreActionHistory: [],
    fanaticDataAudit: [
      { item: 'fanatic-level-1', status: 'prototype', note: '原型 harness；正式 Battle/Threat/Room 卡面缺失。' },
      { item: 'fanatic-threat-level-1', status: 'unavailable', note: 'Threat 两面数据缺失。' },
      { item: 'pyre-level-1', status: 'prototype', note: '原型；无正式 Pyre 卡牌数值。' },
      { item: 'pyre-captive-effect', status: 'prototype', note: '原型；Hero 在 Pyre 中的效果与释放规则缺失。' },
      { item: 'fanatic-forced-move', status: 'prototype', note: '前置移动最大步数缺失（原型=3）。' },
    ],
    activeBossDefinitionSnapshot: null,
  };
}

/** Definition Hash 变化时：进行中 Battle 沿用 Snapshot，不重新映射已保存数据（§24）。 */
export function resolveActiveFanaticRoomDefinition(
  snapshot: { roomDefinitionId: string; roomHash: string } | null,
  current: FanaticRoomDefinition,
  battleInProgress: boolean
): { useSnapshot: boolean; roomId: string } {
  if (!snapshot || !battleInProgress) return { useSnapshot: false, roomId: current.id };
  const changed = hashFanaticRoomDefinition(current) !== snapshot.roomHash;
  return changed
    ? { useSnapshot: true, roomId: snapshot.roomDefinitionId }
    : { useSnapshot: false, roomId: current.id };
}

/** 损坏 Runtime 的安全兜底（不白屏，§25.65）。 */
export function repairFanaticRuntime(
  raw: unknown,
  fallbackFanaticId = 'fanatic-actor',
  fallbackPyreId = 'pyre-actor'
): FanaticBattleRuntime {
  const r = raw as Partial<FanaticBattleRuntime> | null | undefined;
  if (!r || typeof r !== 'object' || typeof r.fanaticActorId !== 'string') {
    return createFanaticBattleRuntime(
      fallbackFanaticId,
      fallbackPyreId,
      ['fanatic-init:1', 'fanatic-init:2', 'fanatic-init:3'],
      'pyre-init:1',
      'prototype'
    );
  }
  const cards = Array.isArray(r.fanaticInitiativeCardIds) && r.fanaticInitiativeCardIds.length === 3
    ? (r.fanaticInitiativeCardIds as [string, string, string])
    : (['fanatic-init:1', 'fanatic-init:2', 'fanatic-init:3'] as [string, string, string]);
  return {
    fanaticActorId: r.fanaticActorId,
    pyreActorId: r.pyreActorId ?? null,
    activeCaptiveHeroId: r.activeCaptiveHeroId ?? null,
    fanaticInitiativeCardIds: cards,
    pyreInitiativeCardId: r.pyreInitiativeCardId ?? null,
    lastTurnPreludeTransactionId: r.lastTurnPreludeTransactionId ?? null,
    lastClosestHeroSelectionId: r.lastClosestHeroSelectionId ?? null,
    lastThrowIntoPyreTransactionId: r.lastThrowIntoPyreTransactionId ?? null,
    pyreRemovedReason: r.pyreRemovedReason ?? null,
    dataStatus: r.dataStatus ?? 'prototype',
  };
}

// ---------------------------------------------------------------------------
// §26 日志辅助
// ---------------------------------------------------------------------------

/** Prelude 结果日志（§26 示例格式）。 */
export function formatPreludeLog(result: FanaticTurnPreludeResult): string[] {
  return result.logs.slice();
}

/** Pyre 死亡日志（§26 示例格式）。 */
export function formatPyreDeathLog(result: PyreDeathResult): string[] {
  return result.logs.slice();
}

/** Captive 状态转换辅助（供 UI/存档统一使用，状态机由 Definition 驱动）。 */
export function transitionCaptiveStatus(
  captive: CaptiveActorState,
  next: CaptiveStatus,
  now = '1970-01-01T00:00:00.000Z'
): CaptiveActorState {
  const releasedStatuses: CaptiveStatus[] = ['released', 'container-destroyed', 'removed'];
  return {
    ...captive,
    status: next,
    releasedAt: releasedStatuses.includes(next) ? captive.releasedAt ?? now : captive.releasedAt,
  };
}

// ---------------------------------------------------------------------------
// Prototype Harness 便捷装配（§8 开发模式：一次性组装 Room Setup 所需上下文）
// ---------------------------------------------------------------------------

export interface PrototypeFanaticBattleContext {
  runtime: FanaticBattleRuntime;
  initiativeCards: FanaticInitiativeCard[];
  room: FanaticRoomDefinition;
  roomGraph: RoomAreaGraph;
  captiveEffect: PyreCaptiveEffectDefinition;
}

/**
 * 组装 Prototype Fanatic 战斗上下文（§8 Room Setup 的开发模式装配）：
 * 复用 Prototype Room / Area Graph / Captive Effect，生成 3+1 Initiative 与 Runtime。
 * 仅供开发 harness / 测试 / E2E 使用；正式池不经此路径（official battle 禁用）。
 */
export function setupPrototypeFanaticBattle(params?: {
  fanaticActorId?: string;
  pyreActorId?: string;
  round?: number;
}): PrototypeFanaticBattleContext {
  const fanaticActorId = params?.fanaticActorId ?? 'fanatic-actor';
  const pyreActorId = params?.pyreActorId ?? 'pyre-actor';
  const round = params?.round ?? 1;

  const initiativeCards = createFanaticInitiativeSet(fanaticActorId, pyreActorId, round);
  const fanaticCardIds = initiativeCards
    .filter((c) => c.actorKind === 'fanatic')
    .map((c) => c.id) as [string, string, string];
  const pyreCardId = initiativeCards.find((c) => c.actorKind === 'pyre')?.id ?? null;

  const runtime = createFanaticBattleRuntime(
    fanaticActorId,
    pyreActorId,
    fanaticCardIds,
    pyreCardId,
    'prototype'
  );

  return {
    runtime,
    initiativeCards,
    room: FANATIC_PROTOTYPE_ROOM,
    roomGraph: FANATIC_PROTOTYPE_AREA_GRAPH,
    captiveEffect: PYRE_PROTOTYPE_CAPTIVE_EFFECT,
  };
}
