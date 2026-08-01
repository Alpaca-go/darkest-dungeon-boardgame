// Phase 10C §6 / §3：Mammoth Cyst 家族 ID 常量。
//
// 正式 ID 与 Prototype ID 严格分层：
// - 正式 ID 承载「待录入的正式卡面」，当前数值一律留空 → 驱动 Data Gate 失败；
// - Prototype ID 一律带 `prototype-` 前缀（含文档 §3 白名单允许的 dev 测试 ID），
//   绝不进正式池（§3 白名单）。

export const MAMMOTH_CYST_GUARDIAN_FAMILY_ID = 'mammoth-cyst' as const;

// ---- 正式 Definition ID（§6 建议 ID）----
export const MAMMOTH_CYST_OFFICIAL_ID = 'mammoth-cyst-level-3';
export const MAMMOTH_CYST_ACTOR_OFFICIAL_ID = 'mammoth-cyst-level-3';
export const WHITE_CELL_STALK_OFFICIAL_ID = 'white-cell-stalk-level-3';
export const MAMMOTH_CYST_ROOM_OFFICIAL_ID = 'mammoth-cyst-room-level-3';
export const MAMMOTH_CYST_GUARDIAN_OFFICIAL_ID = 'mammoth-cyst-guardian-level-3';
export const MAMMOTH_CYST_SUMMON_OFFICIAL_ID = 'mammoth-cyst-summon-white-cell-stalk';

// ---- Prototype ID（§3 允许的开发测试 ID 白名单）----
export const MAMMOTH_CYST_PROTOTYPE_HARNESS_ID = 'prototype-mammoth-cyst-guardian-harness';
export const MAMMOTH_CYST_ACTOR_PROTOTYPE_ID = 'prototype-mammoth-cyst-level-3';
export const WHITE_CELL_STALK_PROTOTYPE_ID = 'prototype-white-cell-stalk-level-3';
export const MAMMOTH_CYST_ROOM_PROTOTYPE_ID = 'prototype-mammoth-cyst-room-level-3';
export const MAMMOTH_CYST_SUMMON_PROTOTYPE_ID = 'prototype-mammoth-cyst-summon-white-cell-stalk';
export const WHITE_CELL_STALK_TELEPORTATION_PROTOTYPE_ID = 'prototype-white-cell-stalk-teleportation';
export const MAMMOTH_CYST_SMASH_PROTOTYPE_ID = 'prototype-mammoth-cyst-smash';
export const MAMMOTH_CYST_ROOM_TELEPORTATION_MAP_PROTOTYPE_ID =
  'prototype-mammoth-cyst-teleportation-map';
/** Prototype Entry Effect（用于验证 Room Entry Effect 管线，绝不写入正式 Definition）。 */
export const MAMMOTH_CYST_ENTRY_EFFECT_PROTOTYPE_ID = 'prototype-mammoth-cyst-entry-effect';

/** 本阶段 Mammoth Cyst 内容版本（Definition 变更时 +1）。 */
export const MAMMOTH_CYST_CONTENT_VERSION = 1;
