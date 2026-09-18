// Phase 10C §3 / §25 / §26：Mammoth Cyst 内容校验、Snapshot 时效性与存档净化。
//
// 硬约束对照：
// - §25 / 硬约束 20：Room / Definition 变化时，**进行中的 Battle 继续使用 Snapshot**，
//   不得中途替换数值；本模块只负责「检测差异并报告」，不自动改写；
// - §3 / 硬约束 20：official 未启用时，UI / Debug 必须能明确说明「因缺哪些资料而禁用」；
// - §26：损坏的 MammothCystEncounterState 必须安全兜底（不白屏、不抛异常）；
// - **不重掷任何随机数**（d10 Skill Roll / Teleportation Roll / 洗牌结果只读不重算）。

import type { MammothCystEncounterState } from '../../../types/mammoth-cyst';
import {
  getMammothCystActorDefinition,
  getMammothCystDataGaps,
  getMammothCystGuardianDefinition,
  getMammothCystRoomDefinition,
  getWhiteCellStalkActorDefinition,
  hashMammothCystActor,
  hashMammothCystGuardian,
  hashMammothCystRoom,
  isMammothCystOfficialEncounterEnabled,
} from '../../../data/darkest-dungeon/mammoth-cyst';
import { MAMMOTH_CYST_CONTENT_VERSION } from '../../../data/darkest-dungeon/mammoth-cyst/ids';

// ---------------------------------------------------------------------------
// §3 Data Gate 说明（UI / Debug 展示）
// ---------------------------------------------------------------------------

export interface MammothCystAvailabilityReport {
  officialEnabled: boolean;
  /** 阻塞 official 启用的资料缺口。 */
  gaps: string[];
  /** 面向玩家的一句话说明。 */
  message: string;
}

export function getMammothCystAvailabilityReport(): MammothCystAvailabilityReport {
  const officialEnabled = isMammothCystOfficialEncounterEnabled();
  const gaps = getMammothCystDataGaps();
  return {
    officialEnabled,
    gaps,
    message: officialEnabled
      ? 'Mammoth Cyst 正式内容已启用。'
      : `Mammoth Cyst 正式内容未启用：缺少 ${gaps.length} 项官方资料（${gaps.join('、')}）。当前仅提供 prototype harness 用于框架验证。`,
  };
}

// ---------------------------------------------------------------------------
// §25 Snapshot 时效性
// ---------------------------------------------------------------------------

export interface MammothCystSnapshotDiff {
  stale: boolean;
  /** 与当前 Registry 不一致的部分。 */
  changed: ('guardian' | 'mammoth-cyst' | 'white-cell-stalk' | 'room')[];
  /** 存档记录的内容版本与当前版本。 */
  savedContentVersion: number;
  currentContentVersion: number;
}

/**
 * 比较进行中的 Battle Snapshot 与当前 Registry。
 *
 * **返回 stale = true 时不要替换数值** —— 进行中的战斗必须继续用 Snapshot（§25）；
 * 调用方只应据此提示「本场战斗使用旧版数值」。
 */
export function diffMammothCystSnapshot(
  state: MammothCystEncounterState,
  mode: 'formal' | 'prototype' = 'prototype',
): MammothCystSnapshotDiff {
  const changed: MammothCystSnapshotDiff['changed'] = [];

  if (hashMammothCystGuardian(getMammothCystGuardianDefinition(mode)) !== state.snapshot.guardianHash) {
    changed.push('guardian');
  }
  if (hashMammothCystActor(getMammothCystActorDefinition(mode)) !== state.snapshot.mammothCystHash) {
    changed.push('mammoth-cyst');
  }
  if (hashMammothCystActor(getWhiteCellStalkActorDefinition(mode)) !== state.snapshot.whiteCellStalkHash) {
    changed.push('white-cell-stalk');
  }
  if (hashMammothCystRoom(getMammothCystRoomDefinition(mode)) !== state.snapshot.roomHash) {
    changed.push('room');
  }

  return {
    stale: changed.length > 0 || state.mammothCystContentVersion !== MAMMOTH_CYST_CONTENT_VERSION,
    changed,
    savedContentVersion: state.mammothCystContentVersion,
    currentContentVersion: MAMMOTH_CYST_CONTENT_VERSION,
  };
}

// ---------------------------------------------------------------------------
// §26 存档净化
// ---------------------------------------------------------------------------

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

function objArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * 净化 MammothCystEncounterState。
 *
 * - 结构性字段缺失（battleId / roomId / snapshot / runtime）→ 判定为不可恢复，返回 null，
 *   由 UI 退回「无 Mammoth Cyst 战斗」的安全态，绝不白屏；
 * - 数组字段损坏 → 回退为空数组；
 * - Initiative Card / Summon / Teleportation Record 一律**原样保留**，
 *   不重掷 d10、不重洗剩余牌堆（§16 / §19「先保存后展示」的存档侧对应保证）。
 */
export function sanitizeMammothCystEncounterState(raw: unknown): MammothCystEncounterState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const battleId = typeof r.battleId === 'string' ? r.battleId : '';
  const roomId = typeof r.roomId === 'string' ? r.roomId : '';
  const guardianQuestId = typeof r.guardianQuestId === 'string' ? r.guardianQuestId : '';
  const guardianDefinitionId =
    typeof r.guardianDefinitionId === 'string' ? r.guardianDefinitionId : '';
  const runtime = r.mammothCystBattleRuntime as
    | MammothCystEncounterState['mammothCystBattleRuntime']
    | undefined;
  const snapshot = r.snapshot as MammothCystEncounterState['snapshot'] | undefined;

  if (!battleId || !roomId || !runtime || !snapshot) return null;
  if (!snapshot.room || !snapshot.guardian || !snapshot.mammothCyst || !snapshot.whiteCellStalk) {
    return null;
  }
  if (!Array.isArray(runtime.mammothCystInitiativeCardIds) || runtime.mammothCystInitiativeCardIds.length !== 2) {
    return null;
  }

  return {
    mammothCystContentVersion:
      typeof r.mammothCystContentVersion === 'number'
        ? r.mammothCystContentVersion
        : MAMMOTH_CYST_CONTENT_VERSION,
    guardianQuestId,
    battleId,
    roomId,
    guardianDefinitionId: guardianDefinitionId || snapshot.guardian.id,
    mammothCystBattleRuntime: {
      ...runtime,
      activeWhiteCellStalkActorId:
        typeof runtime.activeWhiteCellStalkActorId === 'string'
          ? runtime.activeWhiteCellStalkActorId
          : null,
      activeSummonRecordId:
        typeof runtime.activeSummonRecordId === 'string' ? runtime.activeSummonRecordId : null,
      summonGeneration:
        typeof runtime.summonGeneration === 'number' && runtime.summonGeneration >= 0
          ? runtime.summonGeneration
          : 0,
      activeStalkInitiativeCardIds: strArray(runtime.activeStalkInitiativeCardIds),
      victoryResolved: runtime.victoryResolved === true,
    },
    actorStates: objArray(r.actorStates),
    heroPlacements: objArray(r.heroPlacements),
    initiativeCards: objArray(r.initiativeCards),
    initiativeDrawPile: strArray(r.initiativeDrawPile),
    resolvedInitiativeCardIds: strArray(r.resolvedInitiativeCardIds),
    round: typeof r.round === 'number' && r.round > 0 ? r.round : 1,
    skillRolls: objArray(r.skillRolls),
    summonHistory: objArray(r.summonHistory),
    teleportationHistory: objArray(r.teleportationHistory),
    // Phase 11A.4R1 WP-2/WP-7：位移历史原样保留；挂起的玩家选择原样保留（ Save/Replay 契约），
    // 缺失时回退 null（旧存档无此字段）。
    displacementHistory: objArray(r.displacementHistory),
    pendingDisplacementChoice:
      r.pendingDisplacementChoice && typeof r.pendingDisplacementChoice === 'object'
        ? (r.pendingDisplacementChoice as MammothCystEncounterState['pendingDisplacementChoice'])
        : null,
    areaEntryRuntime: objArray(r.areaEntryRuntime),
    roomHazardEventHistory: objArray(r.roomHazardEventHistory),
    snapshot,
    mammothCystDataAudit:
      (r.mammothCystDataAudit as MammothCystEncounterState['mammothCystDataAudit']) ?? {
        officialEnabled: false,
        gaps: [],
        mammothCystStatus: 'unavailable',
        whiteCellStalkStatus: 'unavailable',
        roomStatus: 'unavailable',
        guardianStatus: 'unavailable',
        auditedAt: '',
      },
    processedTransactionIds: strArray(r.processedTransactionIds).slice(-200),
  };
}
