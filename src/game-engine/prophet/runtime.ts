// Phase 9C §8—§19：Prophet 运行时（纯函数，自包含可测）。
//
// 复用而非复制（硬约束 1）：
// - Boss 定义 / Initiative / Victory / XP 沿用 Phase 9A + 8D 的既有语义；
// - 伤害 / 压力 / 状态一律经「正式管线」结算 —— 本模块通过依赖注入
//   （AreaAttackPipeline）调用它，绝不在此另起一套伤害计算（硬约束 13）。
//
// 本模块只负责 Prophet 特有的三件事：
//   1) Action Ordinal 语义（1 放置 / 2 普通 Skill / 3 Rubble）；
//   2) Wooden Pew 作为「延迟区域危害」的生命周期；
//   3) 逐 Pew 独立结算（同 Area 多 Pew 绝不合并）。

import type {
  ActionOrdinal,
  BossInitiativeCard,
  D10Roll,
  DelayedAreaHazardState,
  ProphetBattleRuntime,
  ProphetPewPlacementRecord,
  ProphetRoomDefinition,
  RandomSource,
  RubbleAttackRecord,
} from '../../types/prophet';
import {
  PROPHET_ACTIONS_PER_ROUND,
  PROPHET_PEW_COUNT,
  PROPHET_PROTOTYPE_ROOM,
} from '../../data/bosses/prophet-family';

// ---------------------------------------------------------------------------
// 可注入 RNG（硬约束：不使用 Math.random()）
// ---------------------------------------------------------------------------

/** 确定性 RNG（mulberry32）——测试与回放用，保证同 seed 同结果。 */
export function createSeededRng(seed: number): RandomSource {
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
export function rollD10(rng: RandomSource): D10Roll {
  const v = Math.floor(rng() * 10) + 1;
  const clamped = Math.min(10, Math.max(1, v));
  return clamped as D10Roll;
}

// ---------------------------------------------------------------------------
// §10 Action Ordinal / Initiative
// ---------------------------------------------------------------------------

/**
 * 创建 Prophet 本轮的三张 Actor-specific Initiative Card。
 * 三张卡绑定同一 Actor，ordinal 固定 1 / 2 / 3（§16：Battle 只创建一次）。
 */
export function createProphetInitiativeCards(
  actorId: string,
  round: number
): BossInitiativeCard[] {
  const cards: BossInitiativeCard[] = [];
  for (let i = 1; i <= PROPHET_ACTIONS_PER_ROUND; i++) {
    cards.push({
      id: `prophet-init:${actorId}:${round}:${i}`,
      actorId,
      roundCreated: round,
      actionOrdinal: i as ActionOrdinal,
      resolved: false,
      resolutionTransactionId: null,
    });
  }
  return cards;
}

/** 每轮固定语义：ordinal → 行动类型。 */
export function getProphetActionSemantics(
  ordinal: ActionOrdinal
): 'place-wooden-pews' | 'normal-skill-table' | 'rubble-of-ruin' {
  if (ordinal === 1) return 'place-wooden-pews';
  if (ordinal === 2) return 'normal-skill-table';
  return 'rubble-of-ruin';
}

/**
 * 通用 Boss 行动入口（§10）。
 * Prophet 通过 actionOverrides 注册 ordinal 1 / 3；ordinal 2 走通用普通 Skill 流程。
 * 组件层不得写 Prophet 专属判断。
 */
export function resolveBossActionByOrdinal(
  ordinal: ActionOrdinal,
  overrides: Record<number, string>
): string {
  return overrides[ordinal] ?? 'normal-skill-table';
}

/** 创建 Prophet 战斗运行时。 */
export function createProphetBattleRuntime(
  prophetActorId: string,
  round = 1
): ProphetBattleRuntime {
  return {
    prophetActorId,
    currentRound: round,
    completedActionCardIdsThisRound: [],
    completedActionOrdinalsThisRound: [],
    activePewIds: [],
    firstActionTransactionId: null,
    secondActionTransactionId: null,
    rubbleTransactionId: null,
    lastPlacementRecordId: null,
  };
}

// ---------------------------------------------------------------------------
// §19 幂等键
// ---------------------------------------------------------------------------

export const idempotencyKeys = {
  placePews: (battleId: string, round: number, initiativeCardId: string) =>
    `prophet-place-pews:${battleId}:${round}:${initiativeCardId}`,
  pew: (placementTransactionId: string, index: number) =>
    `prophet-pew:${placementTransactionId}:${index}`,
  rubble: (battleId: string, round: number, initiativeCardId: string) =>
    `prophet-rubble:${battleId}:${round}:${initiativeCardId}`,
  rubbleAttack: (rubbleTransactionId: string, pewInstanceId: string) =>
    `prophet-rubble-attack:${rubbleTransactionId}:${pewInstanceId}`,
  clearPews: (battleId: string, reason: string) => `prophet-clear-pews:${battleId}:${reason}`,
};

// ---------------------------------------------------------------------------
// §11 第一次行动：4d10 放置
// ---------------------------------------------------------------------------

export interface PewPlacementInput {
  battleId: string;
  round: number;
  initiativeCardId: string;
  ordinal: ActionOrdinal;
  prophetAlive: boolean;
  runtime: ProphetBattleRuntime;
  room?: ProphetRoomDefinition;
  rng: RandomSource;
  /** 已存在的 Pew（用于检测上一轮未结算的 telegraphed Pew）。 */
  existingPews?: DelayedAreaHazardState[];
}

export type PewPlacementFailure =
  | 'prophet-dead'
  | 'wrong-ordinal'
  | 'already-resolved-this-round'
  | 'invalid-area'
  | 'pending-unresolved-pews';

export interface PewPlacementResult {
  ok: boolean;
  failure?: PewPlacementFailure;
  record?: ProphetPewPlacementRecord;
  pews: DelayedAreaHazardState[];
  runtime: ProphetBattleRuntime;
}

/**
 * 第一次行动事务（§11）：
 * 验证存活 → 验证 ordinal=1 → 验证本轮未执行 → 掷 4 个 d10 → 保存骰点
 * → Room Map 转 Area → 创建 4 个独立 Pew → 写 Placement Record → 保存。
 *
 * 非法 Area 时整笔回滚（不留下半套 Pew）。
 */
export function resolveProphetPewPlacement(input: PewPlacementInput): PewPlacementResult {
  const {
    battleId,
    round,
    initiativeCardId,
    ordinal,
    prophetAlive,
    runtime,
    rng,
    existingPews = [],
  } = input;
  const room = input.room ?? PROPHET_PROTOTYPE_ROOM;

  const fail = (failure: PewPlacementFailure): PewPlacementResult => ({
    ok: false,
    failure,
    pews: [],
    runtime,
  });

  if (!prophetAlive) return fail('prophet-dead');
  if (ordinal !== 1) return fail('wrong-ordinal');
  // 幂等：本轮已执行过 ordinal 1 则不得重掷（刷新不重掷）
  if (
    runtime.completedActionOrdinalsThisRound.includes(1) ||
    runtime.completedActionCardIdsThisRound.includes(initiativeCardId)
  ) {
    return fail('already-resolved-this-round');
  }
  // §15：上一轮仍有未结算 telegraphed Pew 时，不静默覆盖，阻止新一轮放置
  if (existingPews.some((p) => p.status === 'telegraphed' || p.status === 'resolving')) {
    return fail('pending-unresolved-pews');
  }

  const transactionId = idempotencyKeys.placePews(battleId, round, initiativeCardId);

  // 正好四次 d10（硬约束 6），结果先保存
  const rolls: D10Roll[] = [];
  for (let i = 0; i < PROPHET_PEW_COUNT; i++) rolls.push(rollD10(rng));

  // Room Map 转换 Area；任一非法 → 整笔回滚
  const areaIds: string[] = [];
  for (const roll of rolls) {
    const areaId = room.d10AreaMap[roll];
    if (!areaId || !room.validAreaIds.includes(areaId)) return fail('invalid-area');
    areaIds.push(areaId);
  }

  // 创建四个**独立** Pew instance（同 Area 也绝不合并）
  const pews: DelayedAreaHazardState[] = rolls.map((_roll, index) => ({
    id: idempotencyKeys.pew(transactionId, index),
    sourceActorId: runtime.prophetActorId,
    sourceDefinitionId: 'prophet-place-wooden-pews',
    markerType: 'wooden-pew',
    targetAreaId: areaIds[index],
    createdRound: round,
    createdActionOrdinal: 1,
    resolvesOnActionOrdinal: 3,
    targetable: false,
    occupiesAreaSpace: false,
    occupiesStance: false,
    hasInitiative: false,
    status: 'telegraphed',
    resolvedTransactionId: null,
  }));

  const record: ProphetPewPlacementRecord = {
    id: `prophet-placement:${transactionId}`,
    battleId,
    round,
    initiativeCardId,
    rolls: [rolls[0], rolls[1], rolls[2], rolls[3]],
    placements: pews.map((p, i) => ({
      pewInstanceId: p.id,
      roll: rolls[i],
      areaId: p.targetAreaId,
    })),
    transactionId,
  };

  const nextRuntime: ProphetBattleRuntime = {
    ...runtime,
    currentRound: round,
    completedActionCardIdsThisRound: [...runtime.completedActionCardIdsThisRound, initiativeCardId],
    completedActionOrdinalsThisRound: [...runtime.completedActionOrdinalsThisRound, 1],
    activePewIds: pews.map((p) => p.id),
    firstActionTransactionId: transactionId,
    lastPlacementRecordId: record.id,
  };

  return { ok: true, record, pews, runtime: nextRuntime };
}

/** 统计某 Area 上的 Pew 数量（UI 显示 `Wooden Pew × n`，内部仍是 n 个 instance）。 */
export function countPewsInArea(pews: DelayedAreaHazardState[], areaId: string): number {
  return pews.filter((p) => p.targetAreaId === areaId && p.status !== 'removed').length;
}

// ---------------------------------------------------------------------------
// §12 Pew 行为：不占空间 / 不可 Target
// ---------------------------------------------------------------------------

/** 占位实体（Hero / Monster 等真实 BattleActor）。 */
export interface AreaOccupant {
  actorId: string;
  areaId: string;
  targetable: boolean;
}

/**
 * Area 占用数 —— **不计算 Pew**（硬约束 4）。
 * Pew 不阻断进入、移动、Range 或 Path。
 */
export function getAreaOccupancy(occupants: AreaOccupant[], areaId: string): number {
  return occupants.filter((o) => o.areaId === areaId).length;
}

/** Hero / Monster 能否进入该 Area（Pew 永不阻断）。 */
export function canEnterArea(
  occupants: AreaOccupant[],
  areaId: string,
  capacity: number
): boolean {
  return getAreaOccupancy(occupants, areaId) < capacity;
}

/**
 * Target Selector：必须过滤掉 Pew（硬约束 5）。
 * Pew 无 HP / Dodge / Resistance / Condition，也不触发 Death / Loot / Quirk / Disease。
 */
export function selectTargetableActorIds(
  occupants: AreaOccupant[],
  _pews: DelayedAreaHazardState[],
  areaId?: string
): string[] {
  return occupants
    .filter((o) => o.targetable && (areaId === undefined || o.areaId === areaId))
    .map((o) => o.actorId);
}

/** Area Attack 命中的目标 —— Pew 不在其中，也不会受伤。 */
export function resolveAreaAttackTargets(
  occupants: AreaOccupant[],
  pews: DelayedAreaHazardState[],
  areaId: string
): string[] {
  return selectTargetableActorIds(occupants, pews, areaId);
}

// ---------------------------------------------------------------------------
// §13 第二次行动：普通 Skill Table
// ---------------------------------------------------------------------------

export interface SecondActionResult {
  ok: boolean;
  failure?: 'wrong-ordinal' | 'already-resolved-this-round' | 'skill-table-unavailable';
  /** 先保存的 d10 结果（UI 不重掷）。 */
  skillRoll?: D10Roll;
  selectedSkillId?: string;
  placedPews: false;
  executedRubble: false;
  runtime: ProphetBattleRuntime;
}

/**
 * 第二次行动（§13）：只有 ordinal 2 才跑普通 Skill Table。
 * 不放置 Pews、不执行 Rubble；Skill roll 先保存。
 */
export function resolveProphetSecondAction(params: {
  round: number;
  initiativeCardId: string;
  ordinal: ActionOrdinal;
  runtime: ProphetBattleRuntime;
  rng: RandomSource;
  /** 普通 Skill Table（正式表缺失时传空数组 → official 禁用）。 */
  skillTable: string[];
}): SecondActionResult {
  const { round, initiativeCardId, ordinal, runtime, rng, skillTable } = params;

  const base = { placedPews: false as const, executedRubble: false as const, runtime };

  if (ordinal !== 2) return { ok: false, failure: 'wrong-ordinal', ...base };
  if (
    runtime.completedActionOrdinalsThisRound.includes(2) ||
    runtime.completedActionCardIdsThisRound.includes(initiativeCardId)
  ) {
    return { ok: false, failure: 'already-resolved-this-round', ...base };
  }
  if (skillTable.length === 0) {
    return { ok: false, failure: 'skill-table-unavailable', ...base };
  }

  // 先掷、先保存，再交给既有 selectBossAction / executeBossAction 执行
  const skillRoll = rollD10(rng);
  const selectedSkillId = skillTable[(skillRoll - 1) % skillTable.length];

  const nextRuntime: ProphetBattleRuntime = {
    ...runtime,
    currentRound: round,
    completedActionCardIdsThisRound: [...runtime.completedActionCardIdsThisRound, initiativeCardId],
    completedActionOrdinalsThisRound: [...runtime.completedActionOrdinalsThisRound, 2],
    secondActionTransactionId: `prophet-second:${round}:${initiativeCardId}`,
  };

  return {
    ok: true,
    skillRoll,
    selectedSkillId,
    placedPews: false,
    executedRubble: false,
    runtime: nextRuntime,
  };
}

// ---------------------------------------------------------------------------
// §14 第三次行动：Rubble of Ruin（逐 Pew 独立结算）
// ---------------------------------------------------------------------------

/**
 * 区域攻击管线接口。
 * 实现方必须复用正式的 Accuracy / Dodge → Critical → Damage → Death's Door →
 * Stress / Resolve → Conditions → Rule Event 管线（硬约束 13）。
 */
export interface AreaAttackPipeline {
  resolve(input: {
    pewInstanceId: string;
    areaId: string;
    targetActorIds: string[];
    rng: RandomSource;
  }): {
    attackRoll: number;
    hit: boolean;
    critical: boolean;
    damageEventIds: string[];
    stressEventIds: string[];
    conditionEventIds: string[];
  };
}

/** 开发 harness 用的原型管线（正式 Rubble 数值缺失时使用）。 */
export const prototypeRubblePipeline: AreaAttackPipeline = {
  resolve({ pewInstanceId, targetActorIds, rng }) {
    const attackRoll = rollD10(rng);
    const hit = attackRoll >= 4 && targetActorIds.length > 0;
    const critical = hit && attackRoll === 10;
    return {
      attackRoll,
      hit,
      critical,
      damageEventIds: hit ? targetActorIds.map((t) => `dmg:${pewInstanceId}:${t}`) : [],
      stressEventIds: hit ? targetActorIds.map((t) => `stress:${pewInstanceId}:${t}`) : [],
      conditionEventIds: critical ? targetActorIds.map((t) => `cond:${pewInstanceId}:${t}`) : [],
    };
  },
};

export interface RubbleResult {
  ok: boolean;
  failure?: 'wrong-ordinal' | 'prophet-dead' | 'already-resolved-this-round';
  attacks: RubbleAttackRecord[];
  pews: DelayedAreaHazardState[];
  runtime: ProphetBattleRuntime;
}

/**
 * 第三次行动（§14）：
 * 验证 ordinal=3 → 固定选择 Rubble → 取所有 telegraphed Pew → 稳定排序
 * → **每个 Pew 独立攻击** → 标记 resolved → 保存。
 *
 * 同一 Area 的两个 Pew 会产生两条独立记录（各自 Accuracy / Crit / Damage），
 * 严禁合并为一次双倍攻击（硬约束 8、9）。
 * ordinal 3 不跑普通 Skill Table（硬约束 12）。
 */
export function resolveProphetRubbleOfRuin(params: {
  battleId: string;
  round: number;
  initiativeCardId: string;
  ordinal: ActionOrdinal;
  prophetAlive: boolean;
  runtime: ProphetBattleRuntime;
  pews: DelayedAreaHazardState[];
  occupants: AreaOccupant[];
  rng: RandomSource;
  pipeline?: AreaAttackPipeline;
}): RubbleResult {
  const {
    battleId,
    round,
    initiativeCardId,
    ordinal,
    prophetAlive,
    runtime,
    pews,
    occupants,
    rng,
  } = params;
  const pipeline = params.pipeline ?? prototypeRubblePipeline;

  if (ordinal !== 3) {
    return { ok: false, failure: 'wrong-ordinal', attacks: [], pews, runtime };
  }
  // 硬约束 14：Prophet 死亡立即停止 Rubble
  if (!prophetAlive) {
    return { ok: false, failure: 'prophet-dead', attacks: [], pews, runtime };
  }
  if (
    runtime.completedActionOrdinalsThisRound.includes(3) ||
    runtime.completedActionCardIdsThisRound.includes(initiativeCardId)
  ) {
    return { ok: false, failure: 'already-resolved-this-round', attacks: [], pews, runtime };
  }

  const rubbleTransactionId = idempotencyKeys.rubble(battleId, round, initiativeCardId);

  // 稳定排序：按 Pew id（其中含放置序号），保证刷新 / 重放顺序一致
  const pending = pews
    .filter((p) => p.status === 'telegraphed')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  const attacks: RubbleAttackRecord[] = [];
  const nextPews = pews.slice();

  for (const pew of pending) {
    const targetActorIds = resolveAreaAttackTargets(occupants, pews, pew.targetAreaId);
    // 每个 Pew 一次**独立** transaction
    const outcome = pipeline.resolve({
      pewInstanceId: pew.id,
      areaId: pew.targetAreaId,
      targetActorIds,
      rng,
    });

    attacks.push({
      id: idempotencyKeys.rubbleAttack(rubbleTransactionId, pew.id),
      rubbleTransactionId,
      pewInstanceId: pew.id,
      areaId: pew.targetAreaId,
      attackRoll: outcome.attackRoll,
      hit: outcome.hit,
      critical: outcome.critical,
      targetActorIds,
      damageEventIds: outcome.damageEventIds,
      stressEventIds: outcome.stressEventIds,
      conditionEventIds: outcome.conditionEventIds,
      status: 'resolved',
    });

    const idx = nextPews.findIndex((p) => p.id === pew.id);
    if (idx >= 0) {
      nextPews[idx] = {
        ...nextPews[idx],
        status: 'resolved',
        resolvedTransactionId: rubbleTransactionId,
      };
    }
  }

  const nextRuntime: ProphetBattleRuntime = {
    ...runtime,
    currentRound: round,
    completedActionCardIdsThisRound: [...runtime.completedActionCardIdsThisRound, initiativeCardId],
    completedActionOrdinalsThisRound: [...runtime.completedActionOrdinalsThisRound, 3],
    rubbleTransactionId,
  };

  return { ok: true, attacks, pews: nextPews, runtime: nextRuntime };
}

// ---------------------------------------------------------------------------
// §15 Pew 生命周期
// ---------------------------------------------------------------------------

/** 新一轮 ordinal 1 之前清除上一轮已结算的 Pew。 */
export function clearResolvedPews(pews: DelayedAreaHazardState[]): DelayedAreaHazardState[] {
  return pews.filter((p) => p.status !== 'resolved' && p.status !== 'removed');
}

/** 清除全部 Pew（Prophet 死亡 / Battle 结束 / Victory）。 */
export function clearAllPews(
  pews: DelayedAreaHazardState[],
  _reason: 'prophet-defeated' | 'battle-end' | 'victory'
): DelayedAreaHazardState[] {
  return pews.map((p) => ({ ...p, status: 'removed' as const }));
}

/** 开启新一轮：重置本轮已完成记录，并清掉上一轮 resolved 的 Pew。 */
export function beginProphetRound(
  runtime: ProphetBattleRuntime,
  pews: DelayedAreaHazardState[],
  nextRound: number
): { runtime: ProphetBattleRuntime; pews: DelayedAreaHazardState[] } {
  return {
    runtime: {
      ...runtime,
      currentRound: nextRound,
      completedActionCardIdsThisRound: [],
      completedActionOrdinalsThisRound: [],
      activePewIds: [],
      firstActionTransactionId: null,
      secondActionTransactionId: null,
      rubbleTransactionId: null,
    },
    pews: clearResolvedPews(pews),
  };
}

// ---------------------------------------------------------------------------
// §17 Victory / Failure
// ---------------------------------------------------------------------------

export interface ProphetVictoryResult {
  bossDefeated: boolean;
  stoppedSkillQueue: boolean;
  invalidatedInitiativeCardIds: string[];
  removedPewIds: string[];
  removedOtherMonsters: boolean;
  /** 复用 Phase 9A / 8D：Boss Quest 固定 3 XP。 */
  xpResult: 3;
  campaignAdvanced: boolean;
  pews: DelayedAreaHazardState[];
}

/**
 * Prophet HP 归零（§17）：
 * 停止 Boss Skill Queue → 未抽的 Prophet Card 失效 → 清除全部 Pews
 * → 清除其他 Monster → 立即胜利 → 3 XP → Campaign Advance。
 *
 * 若 Pews 已放置但 Rubble 尚未执行：不再攻击，立即移除。
 */
export function resolveProphetVictory(params: {
  initiativeCards: BossInitiativeCard[];
  pews: DelayedAreaHazardState[];
}): ProphetVictoryResult {
  const { initiativeCards, pews } = params;
  const removed = clearAllPews(pews, 'prophet-defeated');
  return {
    bossDefeated: true,
    stoppedSkillQueue: true,
    invalidatedInitiativeCardIds: initiativeCards.filter((c) => !c.resolved).map((c) => c.id),
    removedPewIds: removed.map((p) => p.id),
    removedOtherMonsters: true,
    xpResult: 3,
    campaignAdvanced: true,
    pews: removed,
  };
}

// ---------------------------------------------------------------------------
// §18 Save Migration
// ---------------------------------------------------------------------------

export interface ProphetSaveSnapshot {
  version: number;
  prophetContentVersion: number;
  prophetBattleRuntime: ProphetBattleRuntime | null;
  delayedAreaHazards: DelayedAreaHazardState[];
  prophetPewPlacementHistory: ProphetPewPlacementRecord[];
  prophetRubbleHistory: RubbleAttackRecord[];
  activeBossDefinitionSnapshot: {
    roomDefinitionId: string;
    roomHash: string;
    officialBattleEnabled: boolean;
  } | null;
}

/** Room Definition 稳定 hash（用于「Definition 变化时沿用 Snapshot」）。 */
export function hashRoomDefinition(room: ProphetRoomDefinition): string {
  const payload = JSON.stringify({
    id: room.id,
    tile: room.bossPlacement.tileAreaId,
    areas: room.validAreaIds,
    map: room.d10AreaMap,
  });
  let h = 5381;
  for (let i = 0; i < payload.length; i++) h = ((h * 33) ^ payload.charCodeAt(i)) >>> 0;
  return `h${h.toString(16)}`;
}

/**
 * Phase 9B → 9C 存档迁移（§18）：SAVE_VERSION + 1，补齐 Prophet 字段。
 * 迁移只补字段、不重放战斗，也不重新映射已保存的骰点。
 */
export function migrateProphetSave(previousVersion: number): ProphetSaveSnapshot {
  return {
    version: previousVersion + 1,
    prophetContentVersion: 1,
    prophetBattleRuntime: null,
    delayedAreaHazards: [],
    prophetPewPlacementHistory: [],
    prophetRubbleHistory: [],
    activeBossDefinitionSnapshot: null,
  };
}

/**
 * Definition Hash 变化时：进行中的 Battle 继续使用 Snapshot，
 * 不重新映射已保存骰点；下一场才使用新 Definition。
 */
export function resolveActiveRoomDefinition(
  snapshot: { roomDefinitionId: string; roomHash: string } | null,
  current: ProphetRoomDefinition,
  battleInProgress: boolean
): { useSnapshot: boolean; roomId: string } {
  if (!snapshot || !battleInProgress) return { useSnapshot: false, roomId: current.id };
  const changed = hashRoomDefinition(current) !== snapshot.roomHash;
  return changed
    ? { useSnapshot: true, roomId: snapshot.roomDefinitionId }
    : { useSnapshot: false, roomId: current.id };
}

/** 损坏 Runtime 的安全兜底（不白屏）。 */
export function repairProphetRuntime(
  raw: unknown,
  fallbackActorId = 'prophet-actor'
): ProphetBattleRuntime {
  const r = raw as Partial<ProphetBattleRuntime> | null | undefined;
  if (!r || typeof r !== 'object' || typeof r.prophetActorId !== 'string') {
    return createProphetBattleRuntime(fallbackActorId);
  }
  return {
    prophetActorId: r.prophetActorId,
    currentRound: typeof r.currentRound === 'number' ? r.currentRound : 1,
    completedActionCardIdsThisRound: Array.isArray(r.completedActionCardIdsThisRound)
      ? r.completedActionCardIdsThisRound
      : [],
    completedActionOrdinalsThisRound: Array.isArray(r.completedActionOrdinalsThisRound)
      ? r.completedActionOrdinalsThisRound
      : [],
    activePewIds: Array.isArray(r.activePewIds) ? r.activePewIds : [],
    firstActionTransactionId: r.firstActionTransactionId ?? null,
    secondActionTransactionId: r.secondActionTransactionId ?? null,
    rubbleTransactionId: r.rubbleTransactionId ?? null,
    lastPlacementRecordId: r.lastPlacementRecordId ?? null,
  };
}

// ---------------------------------------------------------------------------
// §20 日志
// ---------------------------------------------------------------------------

/** 放置日志（§20 示例格式）。 */
export function formatPlacementLog(record: ProphetPewPlacementRecord): string[] {
  const lines = ['Prophet本轮第1次行动：Place Wooden Pews'];
  for (const p of record.placements) lines.push(`d10：${p.roll} → ${p.areaId}`);
  const counts = new Map<string, number>();
  for (const p of record.placements) counts.set(p.areaId, (counts.get(p.areaId) ?? 0) + 1);
  for (const [areaId, n] of counts) {
    if (n > 1) lines.push(`${areaId}现有${n}个Wooden Pews`);
  }
  return lines;
}

/** Rubble 日志（§20 示例格式）。 */
export function formatRubbleLog(attacks: RubbleAttackRecord[]): string[] {
  const lines = ['Prophet本轮第3次行动：Rubble of Ruin'];
  attacks.forEach((a, i) => lines.push(`Pew ${i + 1}攻击${a.areaId}`));
  return lines;
}
