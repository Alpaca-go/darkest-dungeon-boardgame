// Phase 10B §6 / §3：Templars 家族 ID 常量。
//
// 正式 ID 与 Prototype ID 严格分层：
// - 正式 ID 承载「待录入的正式卡面」，当前数值一律留空 → 驱动 Data Gate 失败；
// - Prototype ID 一律带 `prototype-` 前缀，绝不进正式池（§3 白名单）。

export const TEMPLARS_GUARDIAN_FAMILY_ID = 'templars' as const;

// ---- 正式 Definition ID（§6 建议 ID）----
export const TEMPLAR_IMPALER_OFFICIAL_ID = 'templar-impaler-level-3';
export const TEMPLAR_WARLORD_OFFICIAL_ID = 'templar-warlord-level-3';
export const TEMPLARS_ROOM_OFFICIAL_ID = 'templars-room-level-3';
export const TEMPLARS_ENCOUNTER_OFFICIAL_ID = 'templars-guardian-level-3';

/** §14.1：Body Slam 的正式 Skill ID。 */
export const TEMPLAR_BODY_SLAM_OFFICIAL_ID = 'templar-impaler-body-slam';

// ---- Prototype ID（§3 允许的开发测试 ID 白名单）----
export const TEMPLARS_PROTOTYPE_HARNESS_ID = 'prototype-templars-guardian-harness';
export const TEMPLAR_IMPALER_PROTOTYPE_ID = 'prototype-templar-impaler';
export const TEMPLAR_WARLORD_PROTOTYPE_ID = 'prototype-templar-warlord';
export const TEMPLAR_BODY_SLAM_PROTOTYPE_ID = 'prototype-body-slam';
export const SPIKED_PIT_EFFECT_PROTOTYPE_ID = 'prototype-spiked-pit-effect';

/** Prototype Room（沿用 prototype- 前缀，与正式 Room 完全隔离）。 */
export const TEMPLARS_ROOM_PROTOTYPE_ID = 'prototype-templars-room';

/** 本阶段 Templars 内容版本（Definition 变更时 +1）。 */
export const TEMPLARS_CONTENT_VERSION = 1;
