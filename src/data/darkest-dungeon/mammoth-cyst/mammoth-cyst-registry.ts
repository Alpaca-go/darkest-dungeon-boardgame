// Phase 10C §6 / §8 / §20 / §21：Mammoth Cyst Registry、Definition 校验与 Data Gate。
//
// 正式池条件（§6）：
//   enabledInOfficialPool === true
//   && officialDataStatus === 'verified'
//   && validation.isComplete === true
//
// 当前关键数据（Cyst Card / Stalk Card / Room Map / Teleportation 完整规则 /
// Victory Condition / Capacity Policy）全部缺失或 partial，
// 因此 isMammothCystOfficialEncounterEnabled() 恒为 false（§3 / §20 强制门槛）。

import type { DataMode, RegistryValidationIssue } from '../../../types/progression';
import type {
  D10Roll,
  MammothCystActorDefinition,
  MammothCystActorState,
  MammothCystDataAuditSnapshot,
  MammothCystGuardianDefinition,
  MammothCystRoomDefinition,
  WhiteCellStalkActorDefinition,
} from '../../../types/mammoth-cyst';
import { nowIso } from '../../../game-engine/random';
import {
  MAMMOTH_CYST_ACTOR_OFFICIAL_ID,
  MAMMOTH_CYST_ACTOR_PROTOTYPE_ID,
  MAMMOTH_CYST_CONTENT_VERSION,
  MAMMOTH_CYST_GUARDIAN_FAMILY_ID,
  MAMMOTH_CYST_GUARDIAN_OFFICIAL_ID,
  MAMMOTH_CYST_PROTOTYPE_HARNESS_ID,
  MAMMOTH_CYST_ROOM_OFFICIAL_ID,
  MAMMOTH_CYST_ROOM_PROTOTYPE_ID,
} from './ids';
import {
  MAMMOTH_CYST_ACTOR_OFFICIAL,
  MAMMOTH_CYST_ACTOR_PROTOTYPE,
  WHITE_CELL_STALK_OFFICIAL,
  WHITE_CELL_STALK_PROTOTYPE,
} from './mammoth-cyst-actors';
import {
  MAMMOTH_CYST_GUARDIAN_OFFICIAL,
  MAMMOTH_CYST_GUARDIAN_PROTOTYPE,
  MAMMOTH_CYST_SUMMON_OFFICIAL,
  MAMMOTH_CYST_SUMMON_PROTOTYPE,
} from './mammoth-cyst-guardian';
import { MAMMOTH_CYST_ROOM_OFFICIAL, MAMMOTH_CYST_ROOM_PROTOTYPE } from './mammoth-cyst-room';

export const D10_ROLLS: D10Roll[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ---------------------------------------------------------------------------
// 查询接口（§6）
// ---------------------------------------------------------------------------

export function getMammothCystGuardianDefinition(
  mode: DataMode = 'prototype',
): MammothCystGuardianDefinition {
  return mode === 'formal' ? MAMMOTH_CYST_GUARDIAN_OFFICIAL : MAMMOTH_CYST_GUARDIAN_PROTOTYPE;
}

export function getMammothCystActorDefinition(mode: DataMode = 'prototype'): MammothCystActorDefinition {
  return mode === 'formal' ? MAMMOTH_CYST_ACTOR_OFFICIAL : MAMMOTH_CYST_ACTOR_PROTOTYPE;
}

export function getWhiteCellStalkActorDefinition(
  mode: DataMode = 'prototype',
): WhiteCellStalkActorDefinition {
  return mode === 'formal' ? WHITE_CELL_STALK_OFFICIAL : WHITE_CELL_STALK_PROTOTYPE;
}

export function getMammothCystRoomDefinition(mode: DataMode = 'prototype'): MammothCystRoomDefinition {
  return mode === 'formal' ? MAMMOTH_CYST_ROOM_OFFICIAL : MAMMOTH_CYST_ROOM_PROTOTYPE;
}

/** Conditional Summon Definition：正式恒 null（无来源资料，禁止推测）。 */
export function getMammothCystSummonDefinition(
  mode: DataMode = 'prototype',
): typeof MAMMOTH_CYST_SUMMON_PROTOTYPE | null {
  return mode === 'formal' ? MAMMOTH_CYST_SUMMON_OFFICIAL : MAMMOTH_CYST_SUMMON_PROTOTYPE;
}

/** 按 Definition ID 取 Actor（两种模式合并查找，供 runtime 回溯 Snapshot）。 */
export function getMammothCystActorById(
  id: string,
): MammothCystActorDefinition | WhiteCellStalkActorDefinition | undefined {
  return [
    MAMMOTH_CYST_ACTOR_OFFICIAL,
    WHITE_CELL_STALK_OFFICIAL,
    MAMMOTH_CYST_ACTOR_PROTOTYPE,
    WHITE_CELL_STALK_PROTOTYPE,
  ].find((a) => a.id === id);
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

export interface MammothCystValidationResult {
  isComplete: boolean;
  missing: string[];
  issues: string[];
}

function emptyResult(): { missing: string[]; issues: string[] } {
  return { missing: [], issues: [] };
}

/** Actor Definition 校验（Cyst / Stalk 通用）：Stance / actionsPerRound 合规；stats / skills 齐备。 */
export function validateMammothCystActor(
  actor: MammothCystActorDefinition | WhiteCellStalkActorDefinition,
): MammothCystValidationResult {
  const { missing, issues } = emptyResult();

  // §2.1：Cyst 恒 Aggressive Stance（运行时兜底，防止定义被改坏）。
  if (actor.actorType === 'boss' && (actor.requiredStance as string | null) !== 'aggressive') {
    issues.push(`${actor.id} 必须部署 Aggressive Stance`);
  }
  if (actor.actionsPerRound !== 2) {
    issues.push(`${actor.id} 每轮行动数必须为 2（对应 2 张 Initiative Card）`);
  }

  if (!actor.stats) missing.push(`${actor.id}:stats`);
  if (actor.skills.length === 0) missing.push(`${actor.id}:skills`);

  // d10 Skill Table 必须覆盖 1—10 且不重叠
  if (actor.skills.length > 0) {
    const seen = new Map<D10Roll, string>();
    for (const skill of actor.skills) {
      // §17：Teleportation Skill 的掷骰策略未核对时视为资料缺口（official 禁用）。
      if (skill.triggersTeleportation && skill.rollPolicy === 'definition-driven') {
        missing.push(`${skill.id}:rollPolicy（Teleportation 掷骰策略未核对）`);
      }
      if (skill.requiresHit === null) {
        missing.push(`${skill.id}:requiresHit（是否需要命中未核对）`);
      }
      for (const roll of skill.d10Rolls) {
        if (seen.has(roll)) {
          issues.push(`${actor.id} d10=${roll} 被 ${seen.get(roll)} 与 ${skill.id} 重复占用`);
        }
        seen.set(roll, skill.id);
      }
    }
    const uncovered = D10_ROLLS.filter((r) => !seen.has(r));
    if (uncovered.length > 0) {
      missing.push(`${actor.id}:d10-table-uncovered:${uncovered.join(',')}`);
    }
    // Teleportation Skill 必须声明 teleportationMapId
    for (const skill of actor.skills) {
      if (skill.triggersTeleportation && !skill.teleportationMapId) {
        missing.push(`${skill.id}:teleportationMapId（触发 Teleportation 但未声明 Map）`);
      }
    }
  }

  if (actor.officialDataStatus === 'unavailable') {
    issues.push(`${actor.id} Battle Card 缺失（unavailable）`);
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

/**
 * Room 校验（§8 全部条目）：
 * Cyst Area 存在；Stance 正确；Spawn Policy 完整；d10 Map 覆盖 1—10 且指向合法 Area；
 * Capacity 完整；Graph 连通；Entry Effects 合法。
 */
export function validateMammothCystRoom(room: MammothCystRoomDefinition): MammothCystValidationResult {
  const { missing, issues } = emptyResult();
  const areaSet = new Set(room.validAreaIds);

  if (!room.mammothCystPlacement.areaId || !areaSet.has(room.mammothCystPlacement.areaId)) {
    missing.push(`cyst-area:${room.mammothCystPlacement.areaId || '(empty)'}`);
  }
  if (room.mammothCystPlacement.stance !== 'aggressive') {
    issues.push('Mammoth Cyst 必须部署 Aggressive Stance');
  }

  // Spawn Policy 完整
  const sp = room.whiteCellStalkSpawn;
  if (sp.stancePolicy === 'definition-driven') missing.push('white-cell-stalk-spawn:stancePolicy');
  if (sp.areaPolicy === 'definition-driven') missing.push('white-cell-stalk-spawn:areaPolicy');
  if (sp.stancePolicy === 'specified-stance' && !sp.specifiedStance) {
    missing.push('white-cell-stalk-spawn:specifiedStance');
  }
  if (sp.areaPolicy === 'specified-area' && !sp.specifiedAreaId) {
    missing.push('white-cell-stalk-spawn:specifiedAreaId');
  }

  if (room.validAreaIds.length === 0) missing.push('validAreaIds:empty');

  // d10 Map 覆盖 1—10 且指向合法 Area
  for (const roll of D10_ROLLS) {
    const areaId = room.teleportationD10Map[roll];
    if (!areaId) {
      missing.push(`d10-map:${roll}`);
      continue;
    }
    if (!areaSet.has(areaId)) {
      issues.push(`d10=${roll} 指向未定义 Area：${areaId}`);
    }
  }

  // Capacity 完整
  for (const areaId of room.validAreaIds) {
    if (room.areaCapacities[areaId] === undefined) missing.push(`area-capacity:${areaId}`);
  }

  // Area Graph 连通（无向图 BFS）
  if (room.validAreaIds.length > 0) {
    if (room.areaGraph.areas.length === 0) {
      missing.push('areaGraph:empty');
    } else if (!isGraphConnected(room)) {
      issues.push('Area Graph 不连通');
    }
  }

  // Entry Effects 合法（effect 必须来自 Room Card / 明确 prototype）
  for (const [areaId, effects] of Object.entries(room.roomEntryEffects)) {
    if (!areaSet.has(areaId)) issues.push(`entry-effect-area:${areaId} 不是合法 Area`);
    for (const eff of effects) {
      if (eff.officialDataStatus === 'unavailable') {
        issues.push(`${eff.id} Entry Effect 缺失（unavailable）`);
      }
    }
  }

  if (room.officialDataStatus === 'unavailable') {
    issues.push('Mammoth Cyst Room Card / Tile 缺失（unavailable）');
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

function isGraphConnected(room: MammothCystRoomDefinition): boolean {
  const adj = new Map<string, string[]>();
  for (const a of room.areaGraph.areas) adj.set(a, []);
  for (const e of room.areaGraph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push(e.to);
    adj.get(e.to)!.push(e.from);
  }
  const start = room.areaGraph.areas[0];
  if (!start) return false;
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!seen.has(nb)) {
        seen.add(nb);
        queue.push(nb);
      }
    }
  }
  return room.areaGraph.areas.every((a) => seen.has(a));
}

/** Guardian 整体校验。 */
export function validateMammothCystGuardian(mode: DataMode = 'prototype'): MammothCystValidationResult {
  const { missing, issues } = emptyResult();

  const guardian = getMammothCystGuardianDefinition(mode);
  if (guardian.guardianFamilyId !== MAMMOTH_CYST_GUARDIAN_FAMILY_ID) {
    issues.push(`Guardian Family ID 错误：${guardian.guardianFamilyId}`);
  }

  const cyst = getMammothCystActorDefinition(mode);
  const stalk = getWhiteCellStalkActorDefinition(mode);
  const room = getMammothCystRoomDefinition(mode);

  if (guardian.bossActorDefinitionId !== cyst.id) {
    issues.push(`Guardian.bossActorDefinitionId (${guardian.bossActorDefinitionId}) 与 Cyst (${cyst.id}) 不一致`);
  }
  if (guardian.linkedActorDefinitionId !== stalk.id) {
    issues.push(`Guardian.linkedActorDefinitionId (${guardian.linkedActorDefinitionId}) 与 Stalk (${stalk.id}) 不一致`);
  }
  if (guardian.roomDefinitionId !== room.id) {
    issues.push(`Guardian.roomDefinitionId (${guardian.roomDefinitionId}) 与 Room (${room.id}) 不一致`);
  }

  const cv = validateMammothCystActor(cyst);
  missing.push(...cv.missing);
  issues.push(...cv.issues);
  const sv = validateMammothCystActor(stalk);
  missing.push(...sv.missing);
  issues.push(...sv.issues);

  const rv = validateMammothCystRoom(room);
  missing.push(...rv.missing);
  issues.push(...rv.issues);

  // §20：Victory / Cleanup 必须由资料确认
  if (guardian.victoryCondition === 'definition-driven') {
    issues.push('victoryCondition = definition-driven 但正式 Victory 文本未确认');
  }
  if (guardian.cleanupPolicy === 'definition-driven') {
    issues.push('cleanupPolicy = definition-driven 但正式 Cleanup 文本未确认');
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

// ---------------------------------------------------------------------------
// Data Gate
// ---------------------------------------------------------------------------

/** official Mammoth Cyst Encounter 是否启用（§6 正式池条件；当前恒 false）。 */
export function isMammothCystOfficialEncounterEnabled(): boolean {
  const guardian = getMammothCystGuardianDefinition('formal');
  if (!guardian.enabledInOfficialPool) return false;
  if (guardian.officialDataStatus !== 'verified') return false;

  const cyst = getMammothCystActorDefinition('formal');
  const stalk = getWhiteCellStalkActorDefinition('formal');
  if (!cyst.enabledInOfficialPool || cyst.officialDataStatus !== 'verified') return false;
  if (!stalk.enabledInOfficialPool || stalk.officialDataStatus !== 'verified') return false;

  const room = getMammothCystRoomDefinition('formal');
  if (room.officialDataStatus !== 'verified') return false;

  if (!getMammothCystSummonDefinition('formal')) return false;

  return validateMammothCystGuardian('formal').isComplete;
}

/** 列出 official 禁用的根因（审计报告 / Debug Panel 用）。 */
export function getMammothCystDataGaps(): string[] {
  const gaps: string[] = [];
  const cyst = getMammothCystActorDefinition('formal');
  const stalk = getWhiteCellStalkActorDefinition('formal');
  const room = getMammothCystRoomDefinition('formal');
  const guardian = getMammothCystGuardianDefinition('formal');

  if (!cyst.stats) gaps.push('mammoth-cyst-battle-card（HP / Dodge / Resistance / Immunity 缺失）');
  if (cyst.skills.length === 0) gaps.push('mammoth-cyst-skills（d10 Skill Table 缺失，含普通攻击数值）');
  if (!stalk.stats) gaps.push('white-cell-stalk-battle-card（HP / Dodge / Resistance 缺失）');
  if (stalk.skills.length === 0) gaps.push('white-cell-stalk-skills（d10 Skill Table 缺失，含 Teleportation 数值）');

  const rv = validateMammothCystRoom(room);
  if (!rv.isComplete) {
    if (room.validAreaIds.length === 0) gaps.push('mammoth-cyst-room-card（Area 图 / 容量缺失）');
    if (D10_ROLLS.some((r) => !room.teleportationD10Map[r])) gaps.push('teleportation-d10-area-map（d10 → Area 映射缺失）');
    if (!room.mammothCystPlacement.areaId) gaps.push('mammoth-cyst-room-tile（Cyst 固定 Area 缺失）');
  }
  if (!getMammothCystSummonDefinition('formal')) gaps.push('white-cell-stalk-spawn-policy（Conditional Summon 定义缺失）');
  if (guardian.victoryCondition === 'definition-driven') gaps.push('guardian-victory-cleanup（正式胜利条件缺失）');
  if (stalk.requiredStance === null && !getMammothCystSummonDefinition('formal')) {
    gaps.push('white-cell-stalk-spawn-policy（Stalk Spawn Stance / Area 规则缺失）');
  }
  return gaps;
}

/** Data Audit 快照（§26 mammothCystDataAudit）。 */
export function buildMammothCystDataAudit(now?: string): MammothCystDataAuditSnapshot {
  return {
    officialEnabled: isMammothCystOfficialEncounterEnabled(),
    gaps: getMammothCystDataGaps(),
    mammothCystStatus: getMammothCystActorDefinition('formal').officialDataStatus,
    whiteCellStalkStatus: getWhiteCellStalkActorDefinition('formal').officialDataStatus,
    roomStatus: getMammothCystRoomDefinition('formal').officialDataStatus,
    guardianStatus: getMammothCystGuardianDefinition('formal').officialDataStatus,
    auditedAt: now ?? nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Definition Hash（§26：Hash 变化时进行中的 Battle 使用 Snapshot）
// ---------------------------------------------------------------------------

/** 稳定字符串哈希（FNV-1a 32bit，十六进制）。键排序保证与属性顺序无关。 */
export function stableHash(value: unknown): string {
  const json = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function hashMammothCystActor(actor: MammothCystActorDefinition | WhiteCellStalkActorDefinition): string {
  return stableHash(actor);
}
export function hashMammothCystRoom(room: MammothCystRoomDefinition): string {
  return stableHash(room);
}
export function hashMammothCystGuardian(guardian: MammothCystGuardianDefinition): string {
  return stableHash(guardian);
}

// ---------------------------------------------------------------------------
// Registry 自检（只报告，不抛异常）
// ---------------------------------------------------------------------------

export function validateMammothCystRegistry(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];

  // 1) official 必须处于禁用状态
  if (isMammothCystOfficialEncounterEnabled()) {
    issues.push({
      kind: 'unknown-owner',
      targetId: MAMMOTH_CYST_GUARDIAN_OFFICIAL_ID,
      message: 'Mammoth Cyst official Encounter 意外启用，需复核数据',
    });
  }

  // 2) Prototype 绝不入正式池
  for (const def of [
    MAMMOTH_CYST_GUARDIAN_PROTOTYPE,
    MAMMOTH_CYST_ACTOR_PROTOTYPE,
    WHITE_CELL_STALK_PROTOTYPE,
  ]) {
    if (def.enabledInOfficialPool) {
      issues.push({
        kind: 'unverified',
        targetId: def.id,
        message: 'Prototype 定义不得 enabledInOfficialPool',
      });
    }
    if (!def.id.startsWith('prototype-')) {
      issues.push({ kind: 'unverified', targetId: def.id, message: 'Prototype 定义必须使用 prototype- 前缀' });
    }
  }

  // 3) 正式 Room 必须不自洽（驱动 Data Gate）
  if (validateMammothCystRoom(MAMMOTH_CYST_ROOM_OFFICIAL).isComplete) {
    issues.push({
      kind: 'unknown-owner',
      targetId: MAMMOTH_CYST_ROOM_OFFICIAL_ID,
      message: 'Mammoth Cyst 正式 Room 意外通过校验',
    });
  }

  // 4) Prototype Room 必须自洽（harness 可信）
  const protoRoom = validateMammothCystRoom(MAMMOTH_CYST_ROOM_PROTOTYPE);
  if (!protoRoom.isComplete) {
    issues.push({
      kind: 'unknown-owner',
      targetId: MAMMOTH_CYST_ROOM_PROTOTYPE_ID,
      message: `Prototype Room 不自洽：${[...protoRoom.missing, ...protoRoom.issues].join('；')}`,
    });
  }

  // 5) Prototype Guardian 必须自洽
  const protoGuardian = validateMammothCystGuardian('prototype');
  if (!protoGuardian.isComplete) {
    issues.push({
      kind: 'unknown-owner',
      targetId: MAMMOTH_CYST_PROTOTYPE_HARNESS_ID,
      message: `Prototype Guardian 不自洽：${[...protoGuardian.missing, ...protoGuardian.issues].join('；')}`,
    });
  }

  // 6) 正式 Conditional Summon 必须为 null（禁止推测）
  if (MAMMOTH_CYST_SUMMON_OFFICIAL !== null) {
    issues.push({
      kind: 'unverified',
      targetId: MAMMOTH_CYST_GUARDIAN_OFFICIAL_ID,
      message: '正式 Conditional Summon 无资料来源，必须保持 null',
    });
  }

  return issues;
}

export const MAMMOTH_CYST_REGISTRY = {
  familyId: MAMMOTH_CYST_GUARDIAN_FAMILY_ID,
  contentVersion: MAMMOTH_CYST_CONTENT_VERSION,
  official: {
    guardian: MAMMOTH_CYST_GUARDIAN_OFFICIAL,
    cyst: MAMMOTH_CYST_ACTOR_OFFICIAL,
    stalk: WHITE_CELL_STALK_OFFICIAL,
    room: MAMMOTH_CYST_ROOM_OFFICIAL,
    summon: MAMMOTH_CYST_SUMMON_OFFICIAL,
  },
  prototype: {
    guardian: MAMMOTH_CYST_GUARDIAN_PROTOTYPE,
    cyst: MAMMOTH_CYST_ACTOR_PROTOTYPE,
    stalk: WHITE_CELL_STALK_PROTOTYPE,
    room: MAMMOTH_CYST_ROOM_PROTOTYPE,
    summon: MAMMOTH_CYST_SUMMON_PROTOTYPE,
  },
} as const;

/** 便捷：从 actorStates 推断 owner（Cyst 恒为唯一 boss；Stalk 为 boss-minion）。 */
export function ownerOfActor(actor: MammothCystActorState): 'mammoth-cyst' | 'white-cell-stalk' {
  return actor.actorDefinitionId === MAMMOTH_CYST_ACTOR_OFFICIAL_ID ||
    actor.actorDefinitionId === MAMMOTH_CYST_ACTOR_PROTOTYPE_ID
    ? 'mammoth-cyst'
    : 'white-cell-stalk';
}
