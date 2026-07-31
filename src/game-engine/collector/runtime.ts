// Phase 9D §8—§23：Collector 运行时（纯函数，自包含可测）。
//
// 复用而非复制（硬约束 1）：
// - Collected 是 Monster BattleActor，行动复用既有普通 Monster Turn（§16）；
// - Victory 复用 Phase 9A / 8D 的 3 XP / Campaign Advance 语义；
// - Loot Chest 复用 Phase 8C 的 drawTrinket + acquireTrinket（§18，硬约束 21）；
// - 伤害 / 压力 / 状态一律经正式管线（本模块不另起伤害计算，硬约束 13 同 9C）。
//
// 本模块负责 Collector 特有的四件事：
//   1) Conditional Boss Action Override（aliveCount 0 → Summon 替代普通 Skill）；
//   2) Linked Summon Group 原子召唤（3 名 Actor + 3 张 Card，固定 Stance/Area）；
//   3) 全灭后下一 Collector 行动整组再召唤（新 Generation、新 ID）；
//   4) Victory 清理全部 Collected + 3 Loot Chest 落位。

import type {
  CollectorActionDecision,
  CollectorBattleRuntime,
  CollectorLootChestState,
  CollectorOfficialDataStatus,
  CollectorRoomDefinition,
  CollectedRole,
  LinkedSummonGroupRecord,
} from '../../types/collector';
import {
  COLLECTED_PROTOTYPE_IDS,
  COLLECTOR_LINKED_SUMMON_GROUP,
  COLLECTOR_PROTOTYPE_ROOM,
  getCollectorNormalSkillTable,
} from '../../data/bosses/collector-family';
import type { CampaignState } from '../../types';
import { drawTrinket } from '../trinkets/draw-trinket';
import { acquireTrinket } from '../trinkets/acquire-trinket';

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
// §8 Collector Initiative（每轮一张）
// ---------------------------------------------------------------------------

export interface CollectorInitiativeCard {
  id: string;
  actorId: string;
  roundCreated: number;
  resolved: boolean;
  resolutionTransactionId: string | null;
}

/** 创建一张 Collector Initiative Card（§3：Initiative Deck 加入一张）。 */
export function createCollectorInitiativeCard(actorId: string, round: number): CollectorInitiativeCard {
  return {
    id: `collector-init:${actorId}:${round}`,
    actorId,
    roundCreated: round,
    resolved: false,
    resolutionTransactionId: null,
  };
}

// ---------------------------------------------------------------------------
// §9 Collector Battle Runtime
// ---------------------------------------------------------------------------

/** 创建 Collector 战斗运行时（§8 Room Setup）。 */
export function createCollectorBattleRuntime(
  collectorActorId: string,
  lootChestIds: [string, string, string],
  round = 1,
  dataStatus: CollectorOfficialDataStatus = 'prototype'
): CollectorBattleRuntime {
  return {
    collectorActorId,
    activeCollectedActorIds: [],
    activeSummonGroupId: null,
    summonGeneration: 0,
    reserveDefinitions: {
      manAtArmsDefinitionId: COLLECTED_PROTOTYPE_IDS['man-at-arms'],
      highwaymanDefinitionId: COLLECTED_PROTOTYPE_IDS['highwayman'],
      vestalDefinitionId: COLLECTED_PROTOTYPE_IDS['vestal'],
    },
    lootChestIds,
    lastConditionalOverrideEventId: null,
    lastSummonTransactionId: null,
    dataStatus,
  };
}

// ---------------------------------------------------------------------------
// §22 幂等键
// ---------------------------------------------------------------------------

export const idempotencyKeys = {
  roomSetup: (bossQuestId: string, roomId: string) =>
    `collector-room-setup:${bossQuestId}:${roomId}`,
  chest: (setupId: string, slotId: string) => `collector-chest:${setupId}:${slotId}`,
  actionOverride: (battleId: string, initiativeCardId: string) =>
    `collector-action-override:${battleId}:${initiativeCardId}`,
  summonGroup: (sourceActionEventId: string, generation: number) =>
    `collector-summon-group:${sourceActionEventId}:${generation}`,
  summonMember: (groupId: string, role: CollectedRole) =>
    `collector-summon-member:${groupId}:${role}`,
  summonInitiative: (groupId: string, role: CollectedRole) =>
    `collector-summon-initiative:${groupId}:${role}`,
  clearGroup: (groupId: string, reason: string) => `collector-clear-group:${groupId}:${reason}`,
  victory: (bossBattleId: string) => `collector-victory:${bossBattleId}`,
};

// ---------------------------------------------------------------------------
// §9 Selector：Alive Collected
// ---------------------------------------------------------------------------

/** 战斗中某 Actor 的最小快照（由调用方从真实 BattleState 投影，§9）。 */
export interface CollectorBattleActorSnapshot {
  actorId: string;
  tags: string[];
  alive: boolean;
  removed: boolean;
}

/** 活的 Collected Actor（tags 含 'collected' 且 alive 且未 removed，§9）。 */
export function getAliveCollectedActors(actors: CollectorBattleActorSnapshot[]): string[] {
  return actors
    .filter((a) => a.tags.includes('collected') && a.alive && !a.removed)
    .map((a) => a.actorId);
}

/** 活的 Collected 数量（§3 核心条件 aliveCollectedCount）。 */
export function getAliveCollectedCount(actors: CollectorBattleActorSnapshot[]): number {
  return getAliveCollectedActors(actors).length;
}

// ---------------------------------------------------------------------------
// §11 / §18 Loot Chests
// ---------------------------------------------------------------------------

/**
 * 创建恰好三个 Loot Chest（§18），固定 Area 来自 Room。
 * Setup 只创建一次：id 由 setupId + slot 确定，刷新稳定（幂等）。
 */
export function createCollectorLootChests(
  room: CollectorRoomDefinition,
  setupId: string,
  roomId: string
): CollectorLootChestState[] {
  return room.lootChestPlacements.map((c) => ({
    id: idempotencyKeys.chest(setupId, c.slotId),
    source: 'collector-room',
    roomId,
    placementSlotId: c.slotId,
    areaId: c.areaId,
    opened: false,
  }));
}

/** Loot 领取幂等键（§18：刷新不重复领取）。 */
export function resolveCollectorLootChestId(setupId: string, slotId: string): string {
  return `loot:collector:${setupId}:${slotId}`;
}

/**
 * 打开一个 Loot Chest：复用 Phase 8C 的 drawTrinket + acquireTrinket（硬约束 21）。
 * - 已 opened → 直接返回（幂等，不重抽）；
 * - 抽取 → 立即通过 acquireTrinket 写入存档（sourceEventId 防重抽）；
 * - 池为空安全跳过，不白屏。
 */
export function resolveCollectorLootChest(params: {
  chest: CollectorLootChestState;
  campaign: CampaignState;
  questId: string | null;
  setupId: string;
  pool?: 'official' | 'prototype';
}): { campaign: CampaignState; chest: CollectorLootChestState; drawnTrinketId: string | null } {
  const { chest, campaign, questId, setupId } = params;
  const pool = params.pool ?? 'official';
  if (chest.opened) return { campaign, chest, drawnTrinketId: null };

  const lootEventId = resolveCollectorLootChestId(setupId, chest.placementSlotId);
  const draw = drawTrinket({ level: 1, pool });
  let nextCampaign = campaign;
  let drawnTrinketId: string | null = null;
  if (draw.definition) {
    drawnTrinketId = draw.definition.id;
    nextCampaign = acquireTrinket(nextCampaign, {
      trinketId: draw.definition.id,
      source: 'loot',
      sourceEventId: lootEventId,
      questId,
    }).campaign;
  }
  return {
    campaign: nextCampaign,
    chest: { ...chest, opened: true },
    drawnTrinketId,
  };
}

// ---------------------------------------------------------------------------
// §11 Conditional Override 评估
// ---------------------------------------------------------------------------

/** 评估本次 Collector 行动语义（§11 / §19）。 */
export function evaluateCollectorActionOverride(aliveCollectedCount: number): CollectorActionDecision {
  if (aliveCollectedCount === 0) return 'summon-collected-group';
  return 'normal-skill-table';
}

// ---------------------------------------------------------------------------
// §12 / §13 Linked Summon Group：原子三单位召唤
// ---------------------------------------------------------------------------

export type SummonFailure =
  | 'collector-dead'
  | 'alive-collected-present'
  | 'placement-conflict'
  | 'invalid-definition'
  | 'battle-ended';

export interface SummonCollectedGroupResult {
  ok: boolean;
  failure?: SummonFailure;
  /** 整组失败时为 []（硬约束 6：任一失败整组回滚，0 个新 Actor）。 */
  createdActorIds: string[];
  /** 整组失败时为 []（0 张新 Initiative）。 */
  createdCardIds: string[];
  group: LinkedSummonGroupRecord | null;
  runtime: CollectorBattleRuntime;
}

/**
 * 原子三单位召唤（§13）：
 * 预验证（Collector 存活 / 无存活 Collected / 定义存在 / 固定 Area 合法）
 * → 起草 3 个成员落位 → **全部**合法才提交，否则整组失败（placement-conflict，
 * 0 Actor / 0 Card / 无半完成 Group，硬约束 6、14）。
 *
 * 固定 Stance / Area 来自 Room Definition，不使用 First Empty Stance（硬约束 7、8）。
 */
export function summonCollectedGroup(params: {
  battleId: string;
  round: number;
  initiativeCardId: string;
  sourceActionEventId: string;
  collectorAlive: boolean;
  aliveCollectedCount: number;
  runtime: CollectorBattleRuntime;
  room?: CollectorRoomDefinition;
  /** 已被非 Collected Actor 占用的 Area（用于冲突检测，§14）。 */
  occupiedAreaIds?: string[];
  battleEnded?: boolean;
}): SummonCollectedGroupResult {
  const {
    battleId,
    initiativeCardId,
    sourceActionEventId,
    collectorAlive,
    aliveCollectedCount,
    runtime,
    occupiedAreaIds = [],
  } = params;
  const room = params.room ?? COLLECTOR_PROTOTYPE_ROOM;
  const battleEnded = params.battleEnded ?? false;

  const fail = (failure: SummonFailure): SummonCollectedGroupResult => ({
    ok: false,
    failure,
    createdActorIds: [],
    createdCardIds: [],
    group: null,
    runtime,
  });

  if (battleEnded) return fail('battle-ended');
  if (!collectorAlive) return fail('collector-dead');
  // 任意 Collected 存活 → 不召唤（硬约束 9、12）
  if (aliveCollectedCount > 0) return fail('alive-collected-present');

  // 起草 3 个成员，全部验证后才提交（原子性）
  const members = COLLECTOR_LINKED_SUMMON_GROUP.members;
  for (const m of members) {
    if (!room.validAreaIds.includes(m.requiredAreaId)) return fail('invalid-definition');
    // 固定 Area 被异常 Actor 占用 → 整组失败（硬约束 14）
    if (occupiedAreaIds.includes(m.requiredAreaId)) return fail('placement-conflict');
  }

  const generation = runtime.summonGeneration + 1;
  const groupId = idempotencyKeys.summonGroup(sourceActionEventId, generation);
  const transactionId = groupId;

  const roles: CollectedRole[] = members.map((m) => m.role);
  const createdActorIds = roles.map((role) =>
    idempotencyKeys.summonMember(groupId, role)
  ) as [string, string, string];
  const createdCardIds = roles.map((role) =>
    idempotencyKeys.summonInitiative(groupId, role)
  ) as [string, string, string];

  const group: LinkedSummonGroupRecord = {
    id: groupId,
    sourceActorId: runtime.collectorActorId,
    sourceActionEventId,
    generation,
    memberActorIds: createdActorIds,
    initiativeCardIds: createdCardIds,
    status: 'active',
    transactionId,
  };

  const nextRuntime: CollectorBattleRuntime = {
    ...runtime,
    activeCollectedActorIds: createdActorIds,
    activeSummonGroupId: groupId,
    summonGeneration: generation,
    lastSummonTransactionId: transactionId,
    lastConditionalOverrideEventId: idempotencyKeys.actionOverride(battleId, initiativeCardId),
  };

  return { ok: true, createdActorIds, createdCardIds, group, runtime: nextRuntime };
}

/** 根据存活数量推导 Group 状态（§16）。 */
export function deriveGroupStatus(
  group: LinkedSummonGroupRecord,
  aliveCount: number
): LinkedSummonGroupRecord {
  let status: LinkedSummonGroupRecord['status'];
  if (aliveCount <= 0) status = 'defeated';
  else if (aliveCount < group.memberActorIds.length) status = 'partially-defeated';
  else status = 'active';
  return { ...group, status };
}

// ---------------------------------------------------------------------------
// §19 Collector 普通 Skill
// ---------------------------------------------------------------------------

export interface CollectorNormalSkillResult {
  ok: boolean;
  failure?: 'skill-table-unavailable';
  /** 先保存的 d10 结果（UI 不重掷）。 */
  skillRoll?: number;
  selectedSkillId?: string;
  runtime: CollectorBattleRuntime;
}

/** 普通 Skill（§19）：掷 d10、先保存、执行 Skill Table（不召唤）。 */
export function resolveCollectorNormalSkill(params: {
  round: number;
  initiativeCardId: string;
  runtime: CollectorBattleRuntime;
  rng: () => number;
  skillTable?: string[];
}): CollectorNormalSkillResult {
  const { runtime, rng } = params;
  const skillTable = params.skillTable ?? getCollectorNormalSkillTable(1, 'prototype');
  const base = { runtime };
  if (skillTable.length === 0) return { ok: false, failure: 'skill-table-unavailable', ...base };

  const skillRoll = rollD10(rng);
  const selectedSkillId = skillTable[(skillRoll - 1) % skillTable.length];
  const nextRuntime: CollectorBattleRuntime = {
    ...runtime,
    lastConditionalOverrideEventId: null,
  };
  return { ok: true, skillRoll, selectedSkillId, runtime: nextRuntime };
}

// ---------------------------------------------------------------------------
// §16 / §20 Victory：清理全部 Collected
// ---------------------------------------------------------------------------

export interface CollectorVictoryResult {
  bossDefeated: boolean;
  stoppedSkillQueue: boolean;
  invalidatedInitiativeCardIds: string[];
  removedCollectedActorIds: string[];
  removedOtherMonsters: boolean;
  xpResult: 3;
  campaignAdvanced: boolean;
  linkedSummonGroupStatus: 'removed';
}

/**
 * Collector HP 归零（§20）：
 * 停止 Skill Queue → 未抽 Card 失效 → 移除全部 Collected → Group 改 removed
 * → 移除其他 Monster → 立即 Victory → 3 XP → Campaign Advance。
 */
export function resolveCollectorVictory(params: {
  initiativeCards: CollectorInitiativeCard[];
  group: LinkedSummonGroupRecord | null;
  otherMonsterActorIds: string[];
}): CollectorVictoryResult {
  const { initiativeCards, group, otherMonsterActorIds } = params;
  const removedCollectedActorIds = group ? group.memberActorIds.slice() : [];
  return {
    bossDefeated: true,
    stoppedSkillQueue: true,
    invalidatedInitiativeCardIds: initiativeCards.filter((c) => !c.resolved).map((c) => c.id),
    removedCollectedActorIds,
    removedOtherMonsters: otherMonsterActorIds.length > 0,
    xpResult: 3,
    campaignAdvanced: true,
    linkedSummonGroupStatus: 'removed',
  };
}

/** 把 Group 置为 removed（死亡清理 / Victory 共用）。 */
export function clearCollectorGroup(
  group: LinkedSummonGroupRecord | null,
  reason: 'all-defeated' | 'collector-dead' | 'victory'
): LinkedSummonGroupRecord | null {
  if (!group) return null;
  return { ...group, status: 'removed' };
}

// ---------------------------------------------------------------------------
// §21 Save Migration
// ---------------------------------------------------------------------------

export interface CollectorSaveSnapshot {
  version: number;
  collectorContentVersion: number;
  collectorBattleRuntime: CollectorBattleRuntime | null;
  linkedSummonGroups: LinkedSummonGroupRecord[];
  collectedActorSnapshots: { actorId: string; role: CollectedRole; areaId: string; stance: 'defensive' | 'ranged' | 'support' }[];
  collectorLootChestStates: CollectorLootChestState[];
  collectorSummonHistory: LinkedSummonGroupRecord[];
  collectorDataAudit: { item: string; status: CollectorOfficialDataStatus; note: string }[];
  activeBossDefinitionSnapshot: {
    roomDefinitionId: string;
    roomHash: string;
    officialBattleEnabled: boolean;
  } | null;
}

/** Room Definition 稳定 hash（用于「Definition 变化时沿用 Snapshot」）。 */
export function hashCollectorRoomDefinition(room: CollectorRoomDefinition): string {
  const payload = JSON.stringify({
    id: room.id,
    collectorArea: room.collectorPlacement.areaId,
    collected: room.collectedPlacements,
    chests: room.lootChestPlacements,
    areas: room.validAreaIds,
  });
  let h = 5381;
  for (let i = 0; i < payload.length; i++) h = ((h * 33) ^ payload.charCodeAt(i)) >>> 0;
  return `h${h.toString(16)}`;
}

/**
 * Phase 9C → 9D 存档迁移（§21）：SAVE_VERSION + 1，补齐 Collector 字段。
 * 迁移只补字段、不重放战斗。
 */
export function migrateCollectorSave(previousVersion: number): CollectorSaveSnapshot {
  return {
    version: previousVersion + 1,
    collectorContentVersion: 1,
    collectorBattleRuntime: null,
    linkedSummonGroups: [],
    collectedActorSnapshots: [],
    collectorLootChestStates: [],
    collectorSummonHistory: [],
    collectorDataAudit: [
      { item: 'collector-level-1', status: 'prototype', note: '原型 harness；正式 Battle/Room 卡面缺失。' },
      { item: 'collector-threat-level-1', status: 'unavailable', note: '数据缺失。' },
      { item: 'collected-man-at-arms', status: 'prototype', note: '原型；无正式卡牌数值。' },
      { item: 'collected-highwayman', status: 'prototype', note: '原型；无正式卡牌数值。' },
      { item: 'collected-vestal', status: 'prototype', note: '原型；无正式卡牌数值。' },
    ],
    activeBossDefinitionSnapshot: null,
  };
}

/** Definition Hash 变化时：进行中 Battle 沿用 Snapshot，不重新映射已保存数据。 */
export function resolveActiveCollectorRoomDefinition(
  snapshot: { roomDefinitionId: string; roomHash: string } | null,
  current: CollectorRoomDefinition,
  battleInProgress: boolean
): { useSnapshot: boolean; roomId: string } {
  if (!snapshot || !battleInProgress) return { useSnapshot: false, roomId: current.id };
  const changed = hashCollectorRoomDefinition(current) !== snapshot.roomHash;
  return changed
    ? { useSnapshot: true, roomId: snapshot.roomDefinitionId }
    : { useSnapshot: false, roomId: current.id };
}

/** 损坏 Runtime 的安全兜底（不白屏，§24.29）。 */
export function repairCollectorRuntime(
  raw: unknown,
  fallbackActorId = 'collector-actor'
): CollectorBattleRuntime {
  const r = raw as Partial<CollectorBattleRuntime> | null | undefined;
  if (!r || typeof r !== 'object' || typeof r.collectorActorId !== 'string') {
    return createCollectorBattleRuntime(
      fallbackActorId,
      ['collector-chest-1', 'collector-chest-2', 'collector-chest-3'],
      1,
      'prototype'
    );
  }
  return {
    collectorActorId: r.collectorActorId,
    activeCollectedActorIds: Array.isArray(r.activeCollectedActorIds) ? r.activeCollectedActorIds : [],
    activeSummonGroupId: r.activeSummonGroupId ?? null,
    summonGeneration: typeof r.summonGeneration === 'number' ? r.summonGeneration : 0,
    reserveDefinitions: r.reserveDefinitions ?? {
      manAtArmsDefinitionId: COLLECTED_PROTOTYPE_IDS['man-at-arms'],
      highwaymanDefinitionId: COLLECTED_PROTOTYPE_IDS['highwayman'],
      vestalDefinitionId: COLLECTED_PROTOTYPE_IDS['vestal'],
    },
    lootChestIds: Array.isArray(r.lootChestIds) && r.lootChestIds.length === 3
      ? (r.lootChestIds as [string, string, string])
      : ['collector-chest-1', 'collector-chest-2', 'collector-chest-3'],
    lastConditionalOverrideEventId: r.lastConditionalOverrideEventId ?? null,
    lastSummonTransactionId: r.lastSummonTransactionId ?? null,
    dataStatus: r.dataStatus ?? 'prototype',
  };
}

// ---------------------------------------------------------------------------
// §23 日志
// ---------------------------------------------------------------------------

/** Collector 行动日志（§23 示例格式）。 */
export function formatCollectorActionLog(decision: CollectorActionDecision, alivCount: number): string[] {
  if (decision === 'summon-collected-group') {
    return [
      'Collector 行动：场上没有 Collected',
      '本次普通 Skill 被 Summon the Collected 替代',
      'Man-at-Arms → Defensive',
      'Highwayman → Ranged',
      'Vestal → Support',
      '加入 3 张 Collected Initiative',
    ];
  }
  return [`Collector 行动：场上 ${alivCount} 名 Collected，执行普通 Skill`];
}

/** 召唤 Group 日志。 */
export function formatSummonLog(group: LinkedSummonGroupRecord): string[] {
  return [
    `Linked Summon Group（generation ${group.generation}）已建立`,
    `Man-at-Arms → ${group.memberActorIds[0]}`,
    `Highwayman → ${group.memberActorIds[1]}`,
    `Vestal → ${group.memberActorIds[2]}`,
  ];
}
