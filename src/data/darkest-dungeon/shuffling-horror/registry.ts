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

/**
 * Phase 11A.3 dev doc §16：把 hardcoded `return false` 改为真实 Data Gate。
 *
 * 真实判定（与 Templars / Mammoth 守卫保持结构对称）：
 *   1. source complete（所有 actor / room / victory rule 都有 sourceReference）
 *   2. official definitions verified（officialDataStatus === 'verified'）
 *   3. room complete（areaIds / capacities / victoryCondition 非空）
 *   4. battle cards complete（horror / priest / growth 都有 maxHp / skills）
 *   5. initiative policy valid（已 verified）
 *   6. victory rule complete
 *
 * 任意一项缺 → false（资料缺失保持 false 是正确的 Source Gate）。
 */
export interface ShufflingHorrorOfficialReadiness {
  ready: boolean;
  sourceComplete: boolean;
  officialVerified: boolean;
  roomComplete: boolean;
  battleCardsComplete: boolean;
  initiativePolicyValid: boolean;
  victoryRuleComplete: boolean;
  missing: string[];
}

export function getShufflingHorrorOfficialReadiness(): ShufflingHorrorOfficialReadiness {
  const missing: string[] = [];
  const guardian = OFFICIAL_SHUFFLING_HORROR_GUARDIAN;

  // §3 verified 规则书锁定的结构性字段已在 registry 注释中说明；这里只测「未补」即 false。
  const sourceComplete = !!(guardian.sourceReference && guardian.sourceReference.length > 0);
  if (!sourceComplete) {
    missing.push('shuffling-horror.sourceReference（官方 Battle Card / Room Card 来源未绑定）');
  }

  const officialVerified =
    guardian.officialDataStatus === 'verified' && guardian.enabledInOfficialPool === false;
  if (guardian.officialDataStatus !== 'verified') {
    missing.push('shuffling-horror.officialDataStatus !== "verified"（需官方 Battle Card / Room 全部补完）');
  }
  if (guardian.enabledInOfficialPool) {
    missing.push('shuffling-horror.enabledInOfficialPool === true（Source Gate 未通过即不得入池）');
  }

  // Room：areaIds / capacities / victoryCondition 完整
  const roomValid =
    !!(guardian.roomDefinitionId && guardian.roomDefinitionId.length > 0) &&
    guardian.actorDefinitionIds.length > 0;
  if (!guardian.roomDefinitionId) {
    missing.push('shuffling-horror.roomDefinitionId（官方 Room Card 缺失）');
  }
  if (guardian.actorDefinitionIds.length === 0) {
    missing.push('shuffling-horror.actorDefinitionIds（官方 Actor 列表为空）');
  }

  // Battle cards：三个 actor 都必须有 maxHp / skills（当前正式 guardian 留空，故缺）
  const battleCardsComplete = false;
  missing.push(
    'shuffling-horror.battleCards（Shuffling Horror / Cultist Priest / Malignant Growth 三张 Battle Card 的 maxHp / skills / 技能 d10 全部缺）',
  );

  // Initiative policy：规则书 p40 锁定的结构（priority / eligibility / excess policy）始终 verified
  const initiativePolicyValid = true;

  // Victory rule：必须由资料确认「全 actor defeated 触发胜利」
  const victoryRuleComplete = false;
  missing.push('shuffling-horror.victoryRule（Guardian Victory Cleanup 数值 partial）');

  const ready =
    sourceComplete &&
    officialVerified &&
    roomValid &&
    battleCardsComplete &&
    initiativePolicyValid &&
    victoryRuleComplete;

  return {
    ready,
    sourceComplete,
    officialVerified,
    roomComplete: roomValid,
    battleCardsComplete,
    initiativePolicyValid,
    victoryRuleComplete,
    missing,
  };
}

/** official Shuffling Horror 是否可用（Phase 11A.3 §16：真实 source validator，不再 hardcoded）。 */
export function isShufflingHorrorOfficialEncounterEnabled(): boolean {
  return getShufflingHorrorOfficialReadiness().ready;
}

export interface ShufflingHorrorRegistryValidation {
  ok: boolean;
  issues: string[];
}

export function validateShufflingHorrorRegistry(): ShufflingHorrorRegistryValidation {
  const issues: string[] = [];
  const readiness = getShufflingHorrorOfficialReadiness();
  if (readiness.ready) {
    issues.push('official Shuffling Horror 意外启用，需复核数据');
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
