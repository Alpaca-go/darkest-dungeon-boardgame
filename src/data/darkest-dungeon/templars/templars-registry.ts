// Phase 10B §6 / §8 / §21：Templars Registry、Definition 校验与 Data Gate。
//
// 正式池条件（§6）：
//   enabledInOfficialPool === true
//   && officialDataStatus === 'verified'
//   && validation.isComplete === true
//
// 当前四类关键数据（Boss Card / Room Map / Pit Effect / Victory Rule）全部缺失，
// 因此 isTemplarsOfficialEncounterEnabled() 恒为 false（§3 强制门槛）。

import type { DualBossEncounterDefinition, DualBossVictoryRule } from '../../../types/dual-boss';
import type { DataMode, RegistryValidationIssue } from '../../../types/progression';
import type { SpikedPitDefinition } from '../../../types/room-hazards';
import type {
  D10Roll,
  TemplarActorDefinition,
  TemplarsDataAuditSnapshot,
  TemplarsRoomDefinition,
} from '../../../types/templars';
import { nowIso } from '../../../game-engine/random';
import {
  TEMPLARS_CONTENT_VERSION,
  TEMPLARS_GUARDIAN_FAMILY_ID,
  TEMPLARS_ROOM_OFFICIAL_ID,
} from './ids';
import { TEMPLAR_IMPALER_OFFICIAL, TEMPLAR_IMPALER_PROTOTYPE } from './templar-impaler';
import { TEMPLAR_WARLORD_OFFICIAL, TEMPLAR_WARLORD_PROTOTYPE } from './templar-warlord';
import { TEMPLARS_ROOM_OFFICIAL, TEMPLARS_ROOM_PROTOTYPE } from './templars-room';
import {
  TEMPLARS_ENCOUNTER_OFFICIAL,
  TEMPLARS_ENCOUNTER_PROTOTYPE,
  TEMPLARS_VICTORY_RULE_OFFICIAL,
  TEMPLARS_VICTORY_RULE_PROTOTYPE,
} from './templars-encounter';

export const D10_ROLLS: D10Roll[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ---------------------------------------------------------------------------
// 查询接口（§6）
// ---------------------------------------------------------------------------

export function getTemplarsGuardianDefinition(
  mode: DataMode = 'prototype',
): DualBossEncounterDefinition {
  return mode === 'formal' ? TEMPLARS_ENCOUNTER_OFFICIAL : TEMPLARS_ENCOUNTER_PROTOTYPE;
}

export function getTemplarImpalerDefinition(mode: DataMode = 'prototype'): TemplarActorDefinition {
  return mode === 'formal' ? TEMPLAR_IMPALER_OFFICIAL : TEMPLAR_IMPALER_PROTOTYPE;
}

export function getTemplarWarlordDefinition(mode: DataMode = 'prototype'): TemplarActorDefinition {
  return mode === 'formal' ? TEMPLAR_WARLORD_OFFICIAL : TEMPLAR_WARLORD_PROTOTYPE;
}

export function getTemplarsRoomDefinition(mode: DataMode = 'prototype'): TemplarsRoomDefinition {
  return mode === 'formal' ? TEMPLARS_ROOM_OFFICIAL : TEMPLARS_ROOM_PROTOTYPE;
}

/** Victory Rule：正式恒 null（无来源），仅 prototype 提供 all-defeated。 */
export function getTemplarsVictoryRule(mode: DataMode = 'prototype'): DualBossVictoryRule | null {
  return mode === 'formal' ? TEMPLARS_VICTORY_RULE_OFFICIAL : TEMPLARS_VICTORY_RULE_PROTOTYPE;
}

/** 按 Definition ID 取 Actor（两种模式合并查找，供 runtime 回溯 Snapshot）。 */
export function getTemplarActorById(id: string): TemplarActorDefinition | undefined {
  return [
    TEMPLAR_IMPALER_OFFICIAL,
    TEMPLAR_WARLORD_OFFICIAL,
    TEMPLAR_IMPALER_PROTOTYPE,
    TEMPLAR_WARLORD_PROTOTYPE,
  ].find((a) => a.id === id);
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

export interface TemplarsValidationResult {
  isComplete: boolean;
  missing: string[];
  issues: string[];
}

function emptyResult(): { missing: string[]; issues: string[] } {
  return { missing: [], issues: [] };
}

/** Actor Definition 校验：Stance / actionsPerRound verified；stats / skills 必须齐备。 */
export function validateTemplarActor(actor: TemplarActorDefinition): TemplarsValidationResult {
  const { missing, issues } = emptyResult();

  const expectedStance = actor.role === 'impaler' ? 'aggressive' : 'ranged';
  if (actor.requiredStance !== expectedStance) {
    issues.push(`${actor.role} 必须部署 ${expectedStance} Stance`);
  }
  if (actor.actionsPerRound !== 2) {
    issues.push(`${actor.role} 每轮行动数必须为 2（对应 2 张 Initiative Card）`);
  }

  if (!actor.stats) missing.push(`${actor.id}:stats`);
  if (actor.skills.length === 0) missing.push(`${actor.id}:skills`);

  // d10 Skill Table 必须覆盖 1—10 且不重叠
  if (actor.skills.length > 0) {
    const seen = new Map<D10Roll, string>();
    for (const skill of actor.skills) {
      if (skill.effectSequence === null) {
        missing.push(`${skill.id}:effectSequence（§14.2 顺序未核对）`);
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
  }

  if (actor.officialDataStatus === 'unavailable') {
    issues.push(`${actor.id} Battle Card 缺失（unavailable）`);
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

/**
 * Room 校验（§8 全部十条）：
 * Impaler / Warlord Area 存在；Stance 正确；d10 Map 覆盖 1—10；
 * Map 每项指向已定义 Pit；每个 Pit Area 存在；Area Graph 连通；Capacity 完整；Room Hash 可生成。
 */
export function validateTemplarsRoom(room: TemplarsRoomDefinition): TemplarsValidationResult {
  const { missing, issues } = emptyResult();
  const areaSet = new Set(room.validAreaIds);

  if (!room.impalerPlacement.areaId || !areaSet.has(room.impalerPlacement.areaId)) {
    missing.push(`impaler-area:${room.impalerPlacement.areaId || '(empty)'}`);
  }
  if (room.impalerPlacement.stance !== 'aggressive') {
    issues.push('Impaler 必须部署 Aggressive Stance');
  }
  if (!room.warlordPlacement.areaId || !areaSet.has(room.warlordPlacement.areaId)) {
    missing.push(`warlord-area:${room.warlordPlacement.areaId || '(empty)'}`);
  }
  if (room.warlordPlacement.stance !== 'ranged') {
    issues.push('Warlord 必须部署 Ranged Stance');
  }

  if (room.validAreaIds.length === 0) missing.push('validAreaIds:empty');

  // Pit 定义
  if (room.spikedPits.length === 0) missing.push('spikedPits:empty');
  const pitById = new Map<string, SpikedPitDefinition>();
  for (const pit of room.spikedPits) {
    pitById.set(pit.id, pit);
    if (!pit.areaId || !areaSet.has(pit.areaId)) {
      missing.push(`pit-area:${pit.id}:${pit.areaId || '(empty)'}`);
    }
    if (pit.entryEffects.length === 0) missing.push(`pit-entry-effects:${pit.id}`);
    // §19：缺失 Exit Rule 时 official 禁用（不自创爬出方式）
    if (!pit.exitRuleDefinitionId) missing.push(`pit-exit-rule:${pit.id}`);
  }

  // d10 Map 覆盖 1—10 且指向已定义 Pit
  for (const roll of D10_ROLLS) {
    const pitId = room.pitTossD10Map[roll];
    if (!pitId) {
      missing.push(`d10-map:${roll}`);
      continue;
    }
    if (!pitById.has(pitId)) {
      issues.push(`d10=${roll} 指向未定义 Pit：${pitId}`);
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

  if (room.officialDataStatus === 'unavailable') {
    issues.push('Templars Room Card / Tile 缺失（unavailable）');
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

function isGraphConnected(room: TemplarsRoomDefinition): boolean {
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

/** Guardian（Dual Boss Encounter）整体校验。 */
export function validateTemplarsGuardian(mode: DataMode = 'prototype'): TemplarsValidationResult {
  const { missing, issues } = emptyResult();

  const encounter = getTemplarsGuardianDefinition(mode);
  if (encounter.guardianFamilyId !== TEMPLARS_GUARDIAN_FAMILY_ID) {
    issues.push(`Guardian Family ID 错误：${encounter.guardianFamilyId}`);
  }
  if (encounter.bossMembers.length !== 2) {
    issues.push('Dual Boss Encounter 必须恰好两名成员');
  }

  const roles = encounter.bossMembers.map((m) => m.role);
  if (!roles.includes('impaler') || !roles.includes('warlord')) {
    issues.push('Dual Boss 成员必须为 impaler + warlord');
  }

  for (const member of encounter.bossMembers) {
    if (member.initiativeCardsPerRound !== 2) {
      issues.push(`${member.role} 的 initiativeCardsPerRound 必须为 2`);
    }
    if (!member.requiredAreaId) missing.push(`member-area:${member.role}`);
    const actor = getTemplarActorById(member.actorDefinitionId);
    if (!actor) {
      missing.push(`member-actor:${member.actorDefinitionId}`);
      continue;
    }
    if (actor.role !== member.role) {
      issues.push(`成员 ${member.actorDefinitionId} 的 role 与 Encounter 不一致`);
    }
    const av = validateTemplarActor(actor);
    missing.push(...av.missing);
    issues.push(...av.issues);
  }

  const room = getTemplarsRoomDefinition(mode);
  if (room.id !== encounter.roomDefinitionId) {
    issues.push(`Encounter 指向的 Room (${encounter.roomDefinitionId}) 与 Registry Room (${room.id}) 不一致`);
  }
  const rv = validateTemplarsRoom(room);
  missing.push(...rv.missing);
  issues.push(...rv.issues);

  // §21：Victory Rule 必须由资料确认
  const rule = getTemplarsVictoryRule(mode);
  if (!rule) {
    missing.push('templars-victory-rule');
  } else if (rule.requiredActorDefinitionIds.length === 0) {
    missing.push('templars-victory-rule:requiredActorDefinitionIds');
  }
  if (encounter.victoryCondition === 'definition-driven' && !rule) {
    issues.push('victoryCondition = definition-driven 但没有 Victory Rule 定义');
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

// ---------------------------------------------------------------------------
// Data Gate
// ---------------------------------------------------------------------------

/** official Templars Encounter 是否启用（§6 正式池条件；当前恒 false）。 */
export function isTemplarsOfficialEncounterEnabled(): boolean {
  const encounter = getTemplarsGuardianDefinition('formal');
  if (!encounter.enabledInOfficialPool) return false;
  if (encounter.officialDataStatus !== 'verified') return false;

  const impaler = getTemplarImpalerDefinition('formal');
  const warlord = getTemplarWarlordDefinition('formal');
  if (!impaler.enabledInOfficialPool || impaler.officialDataStatus !== 'verified') return false;
  if (!warlord.enabledInOfficialPool || warlord.officialDataStatus !== 'verified') return false;

  const room = getTemplarsRoomDefinition('formal');
  if (room.officialDataStatus !== 'verified') return false;

  if (!getTemplarsVictoryRule('formal')) return false;

  return validateTemplarsGuardian('formal').isComplete;
}

/** 列出 official 禁用的根因（审计报告 / Debug Panel 用）。 */
export function getTemplarsDataGaps(): string[] {
  const gaps: string[] = [];
  const impaler = getTemplarImpalerDefinition('formal');
  const warlord = getTemplarWarlordDefinition('formal');
  const room = getTemplarsRoomDefinition('formal');
  const encounter = getTemplarsGuardianDefinition('formal');

  if (!impaler.stats) gaps.push('templar-impaler-battle-card（HP / Dodge / Resistance / Immunity 缺失）');
  if (impaler.skills.length === 0) gaps.push('templar-impaler-skills（d10 Skill Table 缺失，含 Body Slam 数值）');
  if (!warlord.stats) gaps.push('templar-warlord-battle-card（HP / Dodge / Resistance / Immunity 缺失）');
  if (warlord.skills.length === 0) gaps.push('templar-warlord-skills（d10 Skill Table 缺失）');

  const rv = validateTemplarsRoom(room);
  if (!rv.isComplete) {
    if (room.spikedPits.length === 0) gaps.push('spiked-pit-effects（Pit 定义与效果缺失）');
    if (D10_ROLLS.some((r) => !room.pitTossD10Map[r])) gaps.push('spiked-pit-map（d10 → Pit 映射缺失）');
    if (!room.impalerPlacement.areaId || !room.warlordPlacement.areaId) {
      gaps.push('templars-room-tile（Boss 固定 Area 缺失）');
    }
    if (room.validAreaIds.length === 0) gaps.push('templars-room-card（Area 图 / 容量缺失）');
  }
  if (!getTemplarsVictoryRule('formal')) gaps.push('templars-victory-condition（正式胜利条件缺失）');
  if (encounter.bossMembers.some((m) => !m.requiredAreaId)) {
    gaps.push('templars-encounter-member-area（成员固定 Area 缺失）');
  }
  return gaps;
}

/** Data Audit 快照（§24 templarsDataAudit）。 */
export function buildTemplarsDataAudit(now?: string): TemplarsDataAuditSnapshot {
  return {
    officialEnabled: isTemplarsOfficialEncounterEnabled(),
    gaps: getTemplarsDataGaps(),
    impalerStatus: getTemplarImpalerDefinition('formal').officialDataStatus,
    warlordStatus: getTemplarWarlordDefinition('formal').officialDataStatus,
    roomStatus: getTemplarsRoomDefinition('formal').officialDataStatus,
    encounterStatus: getTemplarsGuardianDefinition('formal').officialDataStatus,
    auditedAt: now ?? nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Definition Hash（§24：Hash 变化时进行中的 Battle 使用 Snapshot）
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

export function hashTemplarsRoom(room: TemplarsRoomDefinition): string {
  return stableHash(room);
}

export function hashTemplarActor(actor: TemplarActorDefinition): string {
  return stableHash(actor);
}

export function hashTemplarsEncounter(encounter: DualBossEncounterDefinition): string {
  return stableHash(encounter);
}

// ---------------------------------------------------------------------------
// Registry 自检（只报告，不抛异常）
// ---------------------------------------------------------------------------

export function validateTemplarsRegistry(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];

  // 1) official 必须处于禁用状态
  if (isTemplarsOfficialEncounterEnabled()) {
    issues.push({
      kind: 'unknown-owner',
      targetId: TEMPLARS_ENCOUNTER_OFFICIAL.id,
      message: 'Templars official Encounter 意外启用，需复核数据',
    });
  }

  // 2) Prototype 绝不入正式池
  for (const def of [
    TEMPLARS_ENCOUNTER_PROTOTYPE,
    TEMPLAR_IMPALER_PROTOTYPE,
    TEMPLAR_WARLORD_PROTOTYPE,
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
  if (validateTemplarsRoom(TEMPLARS_ROOM_OFFICIAL).isComplete) {
    issues.push({
      kind: 'unknown-owner',
      targetId: TEMPLARS_ROOM_OFFICIAL_ID,
      message: 'Templars 正式 Room 意外通过校验',
    });
  }

  // 4) Prototype Room 必须自洽（harness 可信）
  const protoRoom = validateTemplarsRoom(TEMPLARS_ROOM_PROTOTYPE);
  if (!protoRoom.isComplete) {
    issues.push({
      kind: 'unknown-owner',
      targetId: TEMPLARS_ROOM_PROTOTYPE.id,
      message: `Prototype Room 不自洽：${[...protoRoom.missing, ...protoRoom.issues].join('；')}`,
    });
  }

  // 5) Prototype Guardian 必须自洽
  const protoGuardian = validateTemplarsGuardian('prototype');
  if (!protoGuardian.isComplete) {
    issues.push({
      kind: 'unknown-owner',
      targetId: TEMPLARS_ENCOUNTER_PROTOTYPE.id,
      message: `Prototype Guardian 不自洽：${[...protoGuardian.missing, ...protoGuardian.issues].join('；')}`,
    });
  }

  // 6) 正式 Victory Rule 必须为 null（禁止推测）
  if (TEMPLARS_VICTORY_RULE_OFFICIAL !== null) {
    issues.push({
      kind: 'unverified',
      targetId: TEMPLARS_ENCOUNTER_OFFICIAL.id,
      message: '正式 Victory Rule 无资料来源，必须保持 null',
    });
  }

  return issues;
}

export const TEMPLARS_REGISTRY = {
  familyId: TEMPLARS_GUARDIAN_FAMILY_ID,
  contentVersion: TEMPLARS_CONTENT_VERSION,
  official: {
    encounter: TEMPLARS_ENCOUNTER_OFFICIAL,
    impaler: TEMPLAR_IMPALER_OFFICIAL,
    warlord: TEMPLAR_WARLORD_OFFICIAL,
    room: TEMPLARS_ROOM_OFFICIAL,
    victoryRule: TEMPLARS_VICTORY_RULE_OFFICIAL,
  },
  prototype: {
    encounter: TEMPLARS_ENCOUNTER_PROTOTYPE,
    impaler: TEMPLAR_IMPALER_PROTOTYPE,
    warlord: TEMPLAR_WARLORD_PROTOTYPE,
    room: TEMPLARS_ROOM_PROTOTYPE,
    victoryRule: TEMPLARS_VICTORY_RULE_PROTOTYPE,
  },
} as const;
