// Phase 10D §13 / §14：Shuffling Horror 数据 ID 常量。
// 硬约束 29：Prototype 使用 prototype- 前缀 ID；硬约束 30：不使用电子游戏数据。

export const SHUFFLING_HORROR_CONTENT_VERSION = 1;

// ---------------------------------------------------------------------------
// Prototype Guardian / 联动 ID（与 guardian-registry 的 PROTOTYPE 池对齐）
// ---------------------------------------------------------------------------

/** Prototype Shuffling Horror Guardian（harness，仅验证链路）。 */
export const PROTOTYPE_SHUFFLING_HORROR_GUARDIAN_ID = 'prototype-shuffling-horror-guardian';
/** Prototype 强制家族用的 harness id（与 DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS[2] 对齐）。 */
export const PROTOTYPE_SHUFFLING_HORROR_GUARDIAN_HARNESS_ID =
  'prototype-shuffling-horror-guardian-harness';

export const PROTOTYPE_SHUFFLING_HORROR_ROOM_ID = 'prototype-shuffling-horror-room';

// ---------------------------------------------------------------------------
// Prototype Actor ID（独立 ID，绝不写入正式 Definition）
// ---------------------------------------------------------------------------

export const PROTOTYPE_SHUFFLING_HORROR_ACTOR_ID = 'prototype-shuffling-horror';
export const PROTOTYPE_CULTIST_PRIEST_ACTOR_ID = 'prototype-cultist-priest';
export const PROTOTYPE_MALIGNANT_GROWTH_ACTOR_ID = 'prototype-malignant-growth';

// ---------------------------------------------------------------------------
// Prototype Skill / Summon / Shuffle ID
// ---------------------------------------------------------------------------

/** Echoing Disassembly 召唤覆盖（Tracker 未满强制）。 */
export const PROTOTYPE_ECHOING_DISASSEMBLY_ID = 'prototype-echoing-disassembly';
/** Undulations（Hero Stance Shuffle）。 */
export const PROTOTYPE_UNDULATIONS_ID = 'prototype-shuffling-horror-undulations';
/** Horror 普通攻击（Tracker 满时使用）。 */
export const PROTOTYPE_SHUFFLING_HORROR_SMASH_ID = 'prototype-shuffling-horror-smash';

// ---------------------------------------------------------------------------
// 召唤顺序（硬约束 9：固定 Priest → Growth）
// ---------------------------------------------------------------------------

export const SHUFFLING_HORROR_SUMMON_ORDER: ShufflingHorrorSummonRole[] = [
  'cultist-priest',
  'malignant-growth',
];

/** 可被 Echoing Disassembly 召唤的角色（不含 Horror 本体）。 */
export type ShufflingHorrorSummonRole = 'cultist-priest' | 'malignant-growth';

// ---------------------------------------------------------------------------
// Stance 顺序（§3 verified）
// ---------------------------------------------------------------------------

export const SHUFFLING_HORROR_STANCE_PRIORITY: ReadonlyArray<
  'aggressive' | 'defensive' | 'ranged' | 'support'
> = ['aggressive', 'defensive', 'ranged', 'support'] as const;

/** Prototype Room 的 Stance → Area 映射（合成；正式 Room 数据 unavailable）。 */
export const PROTOTYPE_SHUFFLING_HORROR_AREA_MAP: Record<string, string> = {
  aggressive: 'sh-aggro-area',
  defensive: 'sh-def-area',
  ranged: 'sh-ranged-area',
  support: 'sh-support-area',
};
