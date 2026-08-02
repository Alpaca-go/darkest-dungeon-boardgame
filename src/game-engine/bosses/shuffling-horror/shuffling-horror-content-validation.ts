// Phase 10D §28 / §35：Shuffling Horror 内容审计 / Snapshot 比对 / Sanitize。
//
// 硬约束 28：Missing Skill / Room / Initiative Policy / Victory 时 official 禁用；
// 硬约束 29：Prototype 使用 prototype ID。
// Sanitize 原则：结构性字段缺失返回 null（UI 安全态不白屏），数组损坏回退空，**绝不重掷随机数**。

import type {
  HeroRoundActionBudget,
  MonsterInitiativeOpportunityCard,
  MonsterRoundActionBudget,
  ShufflingHorrorActorState,
  ShufflingHorrorEncounterState,
  ShufflingHorrorSnapshot,
  StancePriorityTracker,
} from '../../../types/shuffling-horror';
import {
  hashShufflingHorrorActors,
  hashShufflingHorrorGuardian,
  hashShufflingHorrorInitiativePolicy,
  hashShufflingHorrorRoom,
  hashShufflingHorrorUndulations,
  isShufflingHorrorOfficialEncounterEnabled,
} from '../../../data/darkest-dungeon/shuffling-horror/registry';

export interface ShufflingHorrorAvailabilityReport {
  officialEnabled: boolean;
  prototypeEnabled: boolean;
  /** 资料缺口（人类可读）。 */
  gaps: string[];
}

/** Data Gate 可用性报告。 */
export function getShufflingHorrorAvailabilityReport(): ShufflingHorrorAvailabilityReport {
  const gaps: string[] = [];
  if (!isShufflingHorrorOfficialEncounterEnabled()) {
    gaps.push('official Shuffling Horror 数据缺失（Battle Card / Room / Echoing / Undulations / Victory）→ 正式战斗禁用');
    gaps.push('Room 区域数据 unavailable（Area / Stance→Area 映射缺失）');
    gaps.push('Echoing Disassembly 具体数值序列 partial');
    gaps.push('Undulations 具体效果序列 partial');
    gaps.push('Guardian Victory Cleanup 数值 partial');
  }
  return {
    officialEnabled: isShufflingHorrorOfficialEncounterEnabled(),
    prototypeEnabled: true,
    gaps,
  };
}

export interface ShufflingHorrorSnapshotDiff {
  stale: boolean;
  changes: string[];
  current: ShufflingHorrorSnapshot;
  saved: ShufflingHorrorSnapshot | null;
}

/** 比对存档时的 Snapshot Hash 与当前 Registry Hash，检测 Definition 变更。 */
export function diffShufflingHorrorSnapshot(
  state: ShufflingHorrorEncounterState | null,
): ShufflingHorrorSnapshotDiff {
  const current: ShufflingHorrorSnapshot = {
    guardianHash: hashShufflingHorrorGuardian(state?.mode ?? 'prototype'),
    roomHash: hashShufflingHorrorRoom(),
    actorsHash: hashShufflingHorrorActors(),
    initiativePolicyHash: hashShufflingHorrorInitiativePolicy(),
    undulationsHash: hashShufflingHorrorUndulations(),
  };
  if (!state) return { stale: false, changes: [], current, saved: null };
  const saved = state.snapshot;
  const changes: string[] = [];
  if (saved.guardianHash !== current.guardianHash) changes.push('guardian');
  if (saved.roomHash !== current.roomHash) changes.push('room');
  if (saved.actorsHash !== current.actorsHash) changes.push('actors');
  if (saved.initiativePolicyHash !== current.initiativePolicyHash) changes.push('initiative-policy');
  if (saved.undulationsHash !== current.undulationsHash) changes.push('undulations');
  return { stale: changes.length > 0, changes, current, saved };
}

// ---------------------------------------------------------------------------
// Sanitize（结构性缺失返回 null；绝不重掷）
// ---------------------------------------------------------------------------

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function bool(v: unknown): boolean {
  return v === true;
}

function sanitizeStanceTracker(raw: any): StancePriorityTracker | null {
  if (!raw || typeof raw !== 'object') return null;
  const order: any[] = Array.isArray(raw.stancePriority) ? raw.stancePriority : [];
  if (!order.includes('aggressive')) return null;
  return {
    stancePriority: order,
    stanceOccupant: {
      aggressive: str(raw.stanceOccupant?.aggressive) ?? null,
      defensive: str(raw.stanceOccupant?.defensive) ?? null,
      ranged: str(raw.stanceOccupant?.ranged) ?? null,
      support: str(raw.stanceOccupant?.support) ?? null,
    },
    capacityPerStance: num(raw.capacityPerStance) || 1,
    isFull: bool(raw.isFull),
  };
}

function sanitizeActor(raw: any): ShufflingHorrorActorState | null {
  if (!raw || typeof raw !== 'object') return null;
  const role = raw.role;
  if (role !== 'horror' && role !== 'cultist-priest' && role !== 'malignant-growth') return null;
  const stances = Array.isArray(raw.stances) ? raw.stances.filter((s: any) => typeof s === 'string') : [];
  return {
    actorId: str(raw.actorId) ?? '',
    role,
    owner: 'shuffling-horror',
    alive: bool(raw.alive),
    generation: num(raw.generation),
    stances,
    areaId: str(raw.areaId),
    inReserve: bool(raw.inReserve),
    actionBudgetUsedThisRound: num(raw.actionBudgetUsedThisRound),
    actionBudgetMaxThisRound: num(raw.actionBudgetMaxThisRound) || 1,
  };
}

function sanitizeCard(raw: any): MonsterInitiativeOpportunityCard | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.cardType !== 'monster-initiative-opportunity') return null;
  const role = raw.resolvedActorRole;
  return {
    id: str(raw.id) ?? '',
    cardType: 'monster-initiative-opportunity',
    owner: 'shuffling-horror',
    roundCreated: num(raw.roundCreated),
    stanceAtDraw: typeof raw.stanceAtDraw === 'string' ? raw.stanceAtDraw : null,
    resolvedActorRole:
      role === 'horror' || role === 'cultist-priest' || role === 'malignant-growth' ? role : null,
    resolvedActorId: str(raw.resolvedActorId),
    isExcess: bool(raw.isExcess),
    excessReason: str(raw.excessReason),
    invalidated: bool(raw.invalidated),
  };
}

function sanitizeMonsterBudget(raw: any): MonsterRoundActionBudget {
  const perRoleMax = (raw?.perRoleMax ?? {}) as Record<string, number>;
  const perRoleUsed = (raw?.perRoleUsed ?? {}) as Record<string, number>;
  return {
    round: num(raw?.round),
    perRoleMax: {
      horror: num(perRoleMax.horror),
      'cultist-priest': num(perRoleMax['cultist-priest']),
      'malignant-growth': num(perRoleMax['malignant-growth']),
    },
    perRoleUsed: {
      horror: num(perRoleUsed.horror),
      'cultist-priest': num(perRoleUsed['cultist-priest']),
      'malignant-growth': num(perRoleUsed['malignant-growth']),
    },
  };
}

function sanitizeHeroBudget(raw: any): HeroRoundActionBudget {
  const max = (raw?.perHeroMax ?? {}) as Record<string, number>;
  const used = (raw?.perHeroUsed ?? {}) as Record<string, number>;
  const keys = new Set([...Object.keys(max), ...Object.keys(used)]);
  return {
    round: num(raw?.round),
    perHeroMax: Object.fromEntries([...keys].map((k) => [k, num(max[k])])),
    perHeroUsed: Object.fromEntries([...keys].map((k) => [k, num(used[k])])),
  };
}

/** 结构化 sanitize：缺失关键字段返回 null，数组损坏回退空，绝不重掷。 */
export function sanitizeShufflingHorrorEncounterState(raw: unknown): ShufflingHorrorEncounterState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;

  if (r.family !== 'shuffling-horror') return null;
  const tracker = sanitizeStanceTracker(r.stancePriority);
  if (!tracker) return null;
  if (typeof r.guardianBattleId !== 'string') return null;
  if (!Array.isArray(r.actors) || r.actors.length === 0) return null;

  const actors = r.actors.map(sanitizeActor).filter((a): a is ShufflingHorrorActorState => a !== null);
  if (actors.length === 0) return null;

  const drawPile = Array.isArray(r.initiativeDrawPile)
    ? r.initiativeDrawPile.map(sanitizeCard).filter((c): c is MonsterInitiativeOpportunityCard => c !== null)
    : [];
  const discardPile = Array.isArray(r.initiativeDiscardPile)
    ? r.initiativeDiscardPile.map(sanitizeCard).filter((c): c is MonsterInitiativeOpportunityCard => c !== null)
    : [];

  const heroAssignments = Array.isArray(r.heroStanceAssignments)
    ? r.heroStanceAssignments
        .filter((a: any) => a && typeof a === 'object' && typeof a.heroId === 'string')
        .map((a: any) => ({
          heroId: a.heroId,
          stance: typeof a.stance === 'string' ? a.stance : 'aggressive',
          areaId: typeof a.areaId === 'string' ? a.areaId : '',
          hasActedThisRound: a.hasActedThisRound === true,
        }))
    : [];

  const snapshotRaw = r.snapshot;
  const snapshot: ShufflingHorrorSnapshot = {
    guardianHash: str(snapshotRaw?.guardianHash) ?? '',
    roomHash: str(snapshotRaw?.roomHash) ?? '',
    actorsHash: str(snapshotRaw?.actorsHash) ?? '',
    initiativePolicyHash: str(snapshotRaw?.initiativePolicyHash) ?? '',
    undulationsHash: str(snapshotRaw?.undulationsHash) ?? '',
  };

  const gen = (r.generationByRole ?? {}) as Record<string, number>;
  const summoned = Array.isArray(r.summonedRolesThisEncounter)
    ? r.summonedRolesThisEncounter.filter(
        (x: any) => x === 'cultist-priest' || x === 'malignant-growth',
      )
    : [];

  return {
    family: 'shuffling-horror',
    guardianBattleId: r.guardianBattleId,
    mode: r.mode === 'formal' ? 'formal' : 'prototype',
    round: num(r.round),
    actors,
    initiativeDrawPile: drawPile,
    initiativeDiscardPile: discardPile,
    stancePriority: tracker,
    monsterBudget: sanitizeMonsterBudget(r.monsterBudget),
    heroBudget: sanitizeHeroBudget(r.heroBudget),
    heroStanceAssignments: heroAssignments,
    summonedRolesThisEncounter: summoned,
    generationByRole: {
      horror: num(gen.horror),
      'cultist-priest': num(gen['cultist-priest']),
      'malignant-growth': num(gen['malignant-growth']),
    },
    lastActionLog: Array.isArray(r.lastActionLog)
      ? r.lastActionLog.filter((s: any) => typeof s === 'string')
      : [],
    transactionId: str(r.transactionId) ?? '',
    snapshot,
    processedTransactionIds: Array.isArray(r.processedTransactionIds)
      ? r.processedTransactionIds.filter((s: any) => typeof s === 'string')
      : [],
  };
}
