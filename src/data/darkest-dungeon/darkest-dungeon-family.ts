// Phase 10A §4 / §23：Darkest Dungeon 家族级 Data Gate 聚合。
//
// 与 Phase 9B—9E 的 <boss>-family.ts 同构：
// 一个「聚合 Gate + 缺口清单 + Registry 自检 + 内容指纹」的单一入口，
// 供审计报告、Debug 面板、存档快照与单测共用同一结论。

import type { ActFourRuntimeProfileId, DarkestDungeonDataAuditSnapshot } from '../../types/act-four';
import { COMMUNITY_REFERENCE_CONTENT_HASH } from './community-reference/runtime-profile';
import type { RegistryValidationIssue } from '../../types/progression';
import {
  getDarkestDungeonQuestDataGaps,
  isDarkestDungeonOfficialQuestPoolEnabled,
  validateDarkestDungeonQuestRegistry,
  OFFICIAL_DARKEST_DUNGEON_QUESTS,
  PROTOTYPE_DARKEST_DUNGEON_QUESTS,
} from './quest-registry';
import {
  getDarkestDungeonLayoutDataGaps,
  isDarkestDungeonOfficialLayoutPoolEnabled,
  validateDarkestDungeonLayoutRegistry,
  OFFICIAL_DARKEST_DUNGEON_LAYOUTS,
  PROTOTYPE_DARKEST_DUNGEON_LAYOUTS,
} from './layout-registry';
import {
  getDarkestDungeonGuardianDataGaps,
  isDarkestDungeonOfficialGuardianPoolEnabled,
  validateDarkestDungeonGuardianRegistry,
} from './guardian-registry';
import {
  getDarkestDungeonContentDataGaps,
  isDarkestDungeonOfficialContentEnabled,
  validateDarkestDungeonRoomRegistry,
  OFFICIAL_DARKEST_DUNGEON_MONSTER_IDS,
  OFFICIAL_DARKEST_DUNGEON_ROOM_CARD_IDS,
  OFFICIAL_DARKEST_DUNGEON_ROOM_TILE_IDS,
  PROTOTYPE_DARKEST_DUNGEON_MONSTER_IDS,
  PROTOTYPE_DARKEST_DUNGEON_ROOM_CARD_IDS,
  PROTOTYPE_DARKEST_DUNGEON_ROOM_TILE_IDS,
} from './room-registry';
import {
  getFinalEncounterDataGaps,
  isFinalEncounterOfficialEnabled,
  validateFinalFormRegistry,
} from './final-form-registry';
import {
  getFinalProvisionDataGaps,
  isFinalProvisionOfficialEnabled,
} from './final-provision-policy';

export const DARKEST_DUNGEON_FAMILY_ID = 'darkest-dungeon';

// ---------------------------------------------------------------------------
// 聚合 Data Gate
// ---------------------------------------------------------------------------

/**
 * official Act IV 是否启用（硬约束 19）。
 * Quest / Layout / Guardian / 专属内容 / Final Encounter / Final Provision
 * 六项全部齐备才为 true。当前资料状态下必然为 false。
 */
export function isDarkestDungeonOfficialActFourEnabled(): boolean {
  return (
    isDarkestDungeonOfficialQuestPoolEnabled() &&
    isDarkestDungeonOfficialLayoutPoolEnabled() &&
    isDarkestDungeonOfficialGuardianPoolEnabled() &&
    isDarkestDungeonOfficialContentEnabled() &&
    isFinalEncounterOfficialEnabled() &&
    isFinalProvisionOfficialEnabled()
  );
}

/** 全部资料缺口（审计报告 §4 / Debug 面板 / 最终报告用）。 */
export function getDarkestDungeonDataGaps(): string[] {
  return [
    ...getDarkestDungeonQuestDataGaps(),
    ...getDarkestDungeonLayoutDataGaps(),
    ...getDarkestDungeonGuardianDataGaps(),
    ...getDarkestDungeonContentDataGaps(),
    ...getFinalEncounterDataGaps(),
    ...getFinalProvisionDataGaps(),
  ];
}

// ---------------------------------------------------------------------------
// 内容指纹（§23：Hash 变化时进行中的 Quest 使用 Snapshot，不重抽）
// ---------------------------------------------------------------------------

/** 稳定的 32 位字符串哈希（djb2 变体；纯函数，无随机、无时间）。 */
export function stableHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Darkest Dungeon 内容指纹。
 * 输入包含正式 + prototype 的 ID 集合与数据状态，任一定义变化都会改变 hash。
 */
export function computeDarkestDungeonContentHash(
  mode: ActFourRuntimeProfileId = 'prototype',
): string {
  if (mode === 'community-reference') return COMMUNITY_REFERENCE_CONTENT_HASH;
  const questIds = (
    mode === 'formal' ? OFFICIAL_DARKEST_DUNGEON_QUESTS : PROTOTYPE_DARKEST_DUNGEON_QUESTS
  )
    .map((q) => `${q.id}:${q.officialDataStatus}:${q.guardianDefinitionId}:${q.skippedFinalFormId}`)
    .join('|');
  const layoutIds = (
    mode === 'formal' ? OFFICIAL_DARKEST_DUNGEON_LAYOUTS : PROTOTYPE_DARKEST_DUNGEON_LAYOUTS
  )
    .map((l) => `${l.id}:${l.roomSlotIds.length}:${l.bossSlotIds.join(',')}`)
    .join('|');
  const content =
    mode === 'formal'
      ? [
          OFFICIAL_DARKEST_DUNGEON_MONSTER_IDS.join(','),
          OFFICIAL_DARKEST_DUNGEON_ROOM_CARD_IDS.join(','),
          OFFICIAL_DARKEST_DUNGEON_ROOM_TILE_IDS.join(','),
        ].join('|')
      : [
          PROTOTYPE_DARKEST_DUNGEON_MONSTER_IDS.join(','),
          PROTOTYPE_DARKEST_DUNGEON_ROOM_CARD_IDS.join(','),
          PROTOTYPE_DARKEST_DUNGEON_ROOM_TILE_IDS.join(','),
        ].join('|');

  return stableHash(`${mode}#${questIds}#${layoutIds}#${content}`);
}

// ---------------------------------------------------------------------------
// 审计快照
// ---------------------------------------------------------------------------

export function buildDarkestDungeonDataAuditSnapshot(
  now: string,
  mode: ActFourRuntimeProfileId = 'prototype',
): DarkestDungeonDataAuditSnapshot {
  return {
    officialActFourEnabled: isDarkestDungeonOfficialActFourEnabled(),
    gaps: getDarkestDungeonDataGaps(),
    contentHash: computeDarkestDungeonContentHash(mode),
    auditedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Registry 自检（聚合，只报告不抛异常）
// ---------------------------------------------------------------------------

export function validateDarkestDungeonFamily(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [
    ...validateDarkestDungeonQuestRegistry(),
    ...validateDarkestDungeonLayoutRegistry(),
    ...validateDarkestDungeonGuardianRegistry(),
    ...validateDarkestDungeonRoomRegistry(),
    ...validateFinalFormRegistry(),
  ];

  if (isDarkestDungeonOfficialActFourEnabled()) {
    issues.push({
      kind: 'unknown-owner',
      targetId: DARKEST_DUNGEON_FAMILY_ID,
      message: 'official Act IV 意外启用，需复核 docs/data/darkest-dungeon/ 数据',
    });
  }

  return issues;
}
