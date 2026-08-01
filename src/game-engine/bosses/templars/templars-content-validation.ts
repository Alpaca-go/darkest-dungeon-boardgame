// Phase 10B §22 / §24 / §28：Templars 内容校验、Snapshot 时效性与存档净化。
//
// 硬约束对照：
// - §24：Room / Definition 变化时，**进行中的 Battle 继续使用 Snapshot**，
//   不得中途替换数值；本模块只负责「检测差异并报告」，不自动改写；
// - §22：official 未启用时，UI / Debug 必须能明确说明「因缺哪些资料而禁用」；
// - §28：损坏的 TemplarsEncounterState 必须安全兜底（不白屏、不抛异常）。

import type { TemplarsEncounterState } from '../../../types/templars';
import {
  getTemplarImpalerDefinition,
  getTemplarWarlordDefinition,
  getTemplarsDataGaps,
  getTemplarsGuardianDefinition,
  getTemplarsRoomDefinition,
  hashTemplarActor,
  hashTemplarsEncounter,
  hashTemplarsRoom,
  isTemplarsOfficialEncounterEnabled,
} from '../../../data/darkest-dungeon/templars';
import { TEMPLARS_CONTENT_VERSION } from '../../../data/darkest-dungeon/templars/ids';

// ---------------------------------------------------------------------------
// §22 Data Gate 说明（UI / Debug 展示）
// ---------------------------------------------------------------------------

export interface TemplarsAvailabilityReport {
  officialEnabled: boolean;
  /** 阻塞 official 启用的资料缺口。 */
  gaps: string[];
  /** 面向玩家的一句话说明。 */
  message: string;
}

export function getTemplarsAvailabilityReport(): TemplarsAvailabilityReport {
  const officialEnabled = isTemplarsOfficialEncounterEnabled();
  const gaps = getTemplarsDataGaps();
  return {
    officialEnabled,
    gaps,
    message: officialEnabled
      ? 'The Templars 正式内容已启用。'
      : `The Templars 正式内容未启用：缺少 ${gaps.length} 项官方资料（${gaps.join('、')}）。当前仅提供 prototype harness 用于框架验证。`,
  };
}

// ---------------------------------------------------------------------------
// §24 Snapshot 时效性
// ---------------------------------------------------------------------------

export interface TemplarsSnapshotDiff {
  stale: boolean;
  /** 与当前 Registry 不一致的部分。 */
  changed: ('encounter' | 'impaler' | 'warlord' | 'room')[];
  /** 存档记录的内容版本与当前版本。 */
  savedContentVersion: number;
  currentContentVersion: number;
}

/**
 * 比较进行中的 Battle Snapshot 与当前 Registry。
 *
 * **返回 stale = true 时不要替换数值** —— 进行中的战斗必须继续用 Snapshot（§24）；
 * 调用方只应据此提示「本场战斗使用旧版数值」。
 */
export function diffTemplarsSnapshot(
  state: TemplarsEncounterState,
  mode: 'formal' | 'prototype' = 'prototype',
): TemplarsSnapshotDiff {
  const changed: TemplarsSnapshotDiff['changed'] = [];

  if (hashTemplarsEncounter(getTemplarsGuardianDefinition(mode)) !== state.snapshot.encounterHash) {
    changed.push('encounter');
  }
  if (hashTemplarActor(getTemplarImpalerDefinition(mode)) !== state.snapshot.impalerHash) {
    changed.push('impaler');
  }
  if (hashTemplarActor(getTemplarWarlordDefinition(mode)) !== state.snapshot.warlordHash) {
    changed.push('warlord');
  }
  if (hashTemplarsRoom(getTemplarsRoomDefinition(mode)) !== state.snapshot.roomHash) {
    changed.push('room');
  }

  return {
    stale: changed.length > 0 || state.templarsContentVersion !== TEMPLARS_CONTENT_VERSION,
    changed,
    savedContentVersion: state.templarsContentVersion,
    currentContentVersion: TEMPLARS_CONTENT_VERSION,
  };
}

// ---------------------------------------------------------------------------
// §28 存档净化
// ---------------------------------------------------------------------------

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

function objArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * 净化 TemplarsEncounterState。
 *
 * - 结构性字段缺失（battleId / snapshot / runtime）→ 判定为不可恢复，返回 null，
 *   由 UI 退回「无 Templars 战斗」的安全态，绝不白屏；
 * - 数组字段损坏 → 回退为空数组；
 * - **不重掷任何随机数**（d10 / 洗牌结果只读不重算）。
 */
export function sanitizeTemplarsEncounterState(raw: unknown): TemplarsEncounterState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const battleId = typeof r.battleId === 'string' ? r.battleId : '';
  const roomId = typeof r.roomId === 'string' ? r.roomId : '';
  const guardianQuestId = typeof r.guardianQuestId === 'string' ? r.guardianQuestId : '';
  const runtime = r.templarsBattleRuntime as TemplarsEncounterState['templarsBattleRuntime'] | undefined;
  const snapshot = r.snapshot as TemplarsEncounterState['snapshot'] | undefined;
  const dual = r.dualBossEncounterState as TemplarsEncounterState['dualBossEncounterState'] | undefined;

  if (!battleId || !roomId || !runtime || !snapshot || !dual) return null;
  if (!snapshot.room || !snapshot.impaler || !snapshot.warlord || !snapshot.encounter) return null;

  return {
    templarsContentVersion:
      typeof r.templarsContentVersion === 'number' ? r.templarsContentVersion : TEMPLARS_CONTENT_VERSION,
    guardianQuestId,
    battleId,
    roomId,
    dualBossEncounterState: {
      encounterDefinitionId: dual.encounterDefinitionId ?? snapshot.encounter.id,
      victoryCondition: dual.victoryCondition ?? 'definition-driven',
      victoryRule: dual.victoryRule ?? null,
      memberActorIds: strArray(dual.memberActorIds),
      resolvedVictory: dual.resolvedVictory === true,
    },
    templarsBattleRuntime: runtime,
    actorStates: objArray(r.actorStates),
    heroPlacements: objArray(r.heroPlacements),
    initiativeCards: objArray(r.initiativeCards),
    initiativeDrawPile: strArray(r.initiativeDrawPile),
    resolvedInitiativeCardIds: strArray(r.resolvedInitiativeCardIds),
    round: typeof r.round === 'number' && r.round > 0 ? r.round : 1,
    skillRolls: objArray(r.skillRolls),
    bodySlamHitEvents: objArray(r.bodySlamHitEvents),
    spikedPitRuntime: objArray(r.spikedPitRuntime),
    pitTossHistory: objArray(r.pitTossHistory),
    roomHazardEventHistory: objArray(r.roomHazardEventHistory),
    snapshot,
    templarsDataAudit:
      (r.templarsDataAudit as TemplarsEncounterState['templarsDataAudit']) ?? {
        officialEnabled: false,
        gaps: [],
        impalerStatus: 'unavailable',
        warlordStatus: 'unavailable',
        roomStatus: 'unavailable',
        encounterStatus: 'unavailable',
        auditedAt: '',
      },
    processedTransactionIds: strArray(r.processedTransactionIds).slice(-200),
  };
}
