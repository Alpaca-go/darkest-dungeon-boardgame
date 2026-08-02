// Phase 10D §13 / §14：Shuffling Horror Guardian / Actor / Room Registry + Data Gate。
//
// 硬约束 28：Missing Skill / Room / Initiative Policy / Victory 时 official 禁用。
// 硬约束 29：Prototype 使用 prototype- 前缀 ID。
// 三类正式 Guardian 的 Room / Actor / 技能在 docs/data/darkest-dungeon/shuffling-horror/ 中
// 多为 partial / unavailable → official 池恒禁用；仅 prototype harness 可跑通。

import type { DarkestDungeonGuardianDefinition } from '../../../types/act-four';
import type { MonsterStance, ShufflingHorrorRole } from '../../../types/shuffling-horror';
import {
  PROTOTYPE_CULTIST_PRIEST_ACTOR_ID,
  PROTOTYPE_MALIGNANT_GROWTH_ACTOR_ID,
  PROTOTYPE_SHUFFLING_HORROR_ACTOR_ID,
  PROTOTYPE_SHUFFLING_HORROR_GUARDIAN_HARNESS_ID,
  PROTOTYPE_SHUFFLING_HORROR_GUARDIAN_ID,
  PROTOTYPE_SHUFFLING_HORROR_ROOM_ID,
  SHUFFLING_HORROR_STANCE_PRIORITY,
} from './ids';
import { stableHash } from '../../../game-engine/bosses/shuffling-horror/hash';

// ---------------------------------------------------------------------------
// 正式 Guardian（刻意残缺 → Data Gate）
// ---------------------------------------------------------------------------

export const OFFICIAL_SHUFFLING_HORROR_GUARDIAN: DarkestDungeonGuardianDefinition = {
  id: 'darkest-dungeon-guardian-shuffling-horror',
  family: 'shuffling-horror',
  name: '',
  roomDefinitionId: '',
  actorDefinitionIds: [],
  officialDataStatus: 'unavailable',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// Prototype Guardian（harness）
// ---------------------------------------------------------------------------

export const PROTOTYPE_SHUFFLING_HORROR_GUARDIAN: DarkestDungeonGuardianDefinition = {
  id: PROTOTYPE_SHUFFLING_HORROR_GUARDIAN_ID,
  family: 'shuffling-horror',
  name: '原型 Shuffling Horror',
  roomDefinitionId: PROTOTYPE_SHUFFLING_HORROR_ROOM_ID,
  // 仅作链路标记；具体 Actor 在 setup 时按 family 动态创建（不依赖此数组的完整数据）。
  actorDefinitionIds: [
    PROTOTYPE_SHUFFLING_HORROR_ACTOR_ID,
    PROTOTYPE_CULTIST_PRIEST_ACTOR_ID,
    PROTOTYPE_MALIGNANT_GROWTH_ACTOR_ID,
  ],
  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

/** 强制家族用的 harness（测试 / Debug 用，等价于 prototype，但命名更明确）。 */
export const PROTOTYPE_SHUFFLING_HORROR_GUARDIAN_HARNESS: DarkestDungeonGuardianDefinition = {
  ...PROTOTYPE_SHUFFLING_HORROR_GUARDIAN,
  id: PROTOTYPE_SHUFFLING_HORROR_GUARDIAN_HARNESS_ID,
  name: '原型 Shuffling Horror（harness）',
};

// ---------------------------------------------------------------------------
// Prototype Actor（合成数值；正式 stats/skills 缺失）
// ---------------------------------------------------------------------------

export interface ShufflingHorrorPrototypeActorSpec {
  role: ShufflingHorrorRole;
  actorDefinitionId: string;
  name: string;
  /** 规则书明确：Horror 恒 aggressive；Priest/Growth 初始 Reserve（无固定 Stance）。 */
  requiredStance: MonsterStance | null;
  /** 规则书明确：Horror 2 次；Priest/Growth 各 1 次（硬约束 4/5）。 */
  actionsPerRound: number;
  /** 初始在 Reserve（Priest/Growth）。 */
  startsInReserve: boolean;
  maxHp: number;
}

export const SHUFFLING_HORROR_PROTOTYPE_ACTORS: ShufflingHorrorPrototypeActorSpec[] = [
  {
    role: 'horror',
    actorDefinitionId: PROTOTYPE_SHUFFLING_HORROR_ACTOR_ID,
    name: 'Shuffling Horror',
    requiredStance: 'aggressive',
    actionsPerRound: 2,
    startsInReserve: false,
    maxHp: 80,
  },
  {
    role: 'cultist-priest',
    actorDefinitionId: PROTOTYPE_CULTIST_PRIEST_ACTOR_ID,
    name: 'Cultist Priest',
    requiredStance: null,
    actionsPerRound: 1,
    startsInReserve: true,
    maxHp: 25,
  },
  {
    role: 'malignant-growth',
    actorDefinitionId: PROTOTYPE_MALIGNANT_GROWTH_ACTOR_ID,
    name: 'Malignant Growth',
    requiredStance: null,
    actionsPerRound: 1,
    startsInReserve: true,
    maxHp: 30,
  },
];

// ---------------------------------------------------------------------------
// Prototype Room（合成；正式 Room 数据 unavailable）
// ---------------------------------------------------------------------------

export const PROTOTYPE_SHUFFLING_HORROR_ROOM = {
  id: PROTOTYPE_SHUFFLING_HORROR_ROOM_ID,
  name: '原型 Shuffling Horror 房间',
  /** 每 Stance 一个 Area 占位（合成；正式数据 unavailable）。 */
  areas: SHUFFLING_HORROR_STANCE_PRIORITY.map((stance) => ({
    stance,
    areaId: `sh-${stance}-area`,
  })),
  officialDataStatus: 'unavailable' as const,
};

// ---------------------------------------------------------------------------
// 取数 + Data Gate
// ---------------------------------------------------------------------------

export function getShufflingHorrorGuardianDefinition(
  mode: 'formal' | 'prototype' = 'prototype',
): DarkestDungeonGuardianDefinition {
  return mode === 'formal' ? OFFICIAL_SHUFFLING_HORROR_GUARDIAN : PROTOTYPE_SHUFFLING_HORROR_GUARDIAN;
}

export function getShufflingHorrorActorSpec(role: ShufflingHorrorRole): ShufflingHorrorPrototypeActorSpec {
  const spec = SHUFFLING_HORROR_PROTOTYPE_ACTORS.find((a) => a.role === role);
  if (!spec) throw new Error(`未定义的 Shuffling Horror 角色：${role}`);
  return spec;
}

/** official Shuffling Horror 是否可用（缺资料 → 恒 false）。 */
export function isShufflingHorrorOfficialEncounterEnabled(): boolean {
  return false;
}

export interface ShufflingHorrorRegistryValidation {
  ok: boolean;
  issues: string[];
}

export function validateShufflingHorrorRegistry(): ShufflingHorrorRegistryValidation {
  const issues: string[] = [];
  if (isShufflingHorrorOfficialEncounterEnabled()) {
    issues.push('official Shuffling Horror 不应启用（资料缺失）');
  }
  if (OFFICIAL_SHUFFLING_HORROR_GUARDIAN.enabledInOfficialPool) {
    issues.push('official Shuffling Horror Guardian 不得 enabledInOfficialPool');
  }
  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Snapshot Hash（Definition 变更检测）
// ---------------------------------------------------------------------------

export function hashShufflingHorrorGuardian(
  mode: 'formal' | 'prototype' = 'prototype',
): string {
  return stableHash(getShufflingHorrorGuardianDefinition(mode));
}

export function hashShufflingHorrorActors(): string {
  return stableHash(SHUFFLING_HORROR_PROTOTYPE_ACTORS);
}

export function hashShufflingHorrorRoom(): string {
  return stableHash(PROTOTYPE_SHUFFLING_HORROR_ROOM);
}

export function hashShufflingHorrorInitiativePolicy(): string {
  // §3 verified 规则固定，哈希固定
  return stableHash({
    stancePriority: SHUFFLING_HORROR_STANCE_PRIORITY,
    eligibility: ['actor-alive', 'actor-in-instance-tracker', 'remaining-actions-greater-than-zero'],
    excessPolicy: 'remove-when-drawn-if-no-eligible-actor',
    resolveAtDrawTime: true,
  });
}

export function hashShufflingHorrorUndulations(): string {
  return stableHash({ type: 'shuffle-all-hero-stances', preserveAreas: true, preserveBudgets: true });
}
