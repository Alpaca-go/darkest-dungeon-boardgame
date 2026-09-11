// Phase 10A §7：Darkest Dungeon Quest Registry（三张 Quest Card）+ Data Gate。
//
// 数据现状（docs/data/darkest-dungeon/darkest-dungeon-quest.template.json 全空）：
// - 三张正式 Quest Card 的「名称 / Guardian / 取消哪个 Final Form / Firewood」全部 unavailable；
// - 硬约束 22 明令禁止推测 Quest → Skipped Form 映射，
//   因此三张正式 Quest 的 guardianDefinitionId = ''、skippedFinalFormId = null，
//   validateDarkestDungeonQuest 必然失败 → isDarkestDungeonOfficialQuestPoolEnabled() = false。
// - 开发期一律走 prototype-darkest-dungeon-quest-* harness（prototype ID，绝不进正式池）。

import type {
  DarkestDungeonQuestDefinition,
} from '../../types/act-four';
import type { SkippableFinalFormId } from '../../types/final-encounter';
import type { RegistryValidationIssue } from '../../types/progression';
import {
  DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_ID,
  DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS,
} from './guardian-registry';
import type { ActFourRuntimeProfileId } from '../../types/act-four';
import { COMMUNITY_RUNTIME_QUESTS } from './community-reference/runtime-profile';

// ---------------------------------------------------------------------------
// ID 常量
// ---------------------------------------------------------------------------

/** 正式 Quest ID（卡面未核对，仅占位 ID，数据全空）。 */
export const OFFICIAL_DARKEST_DUNGEON_QUEST_IDS = [
  'darkest-dungeon-quest-1',
  'darkest-dungeon-quest-2',
  'darkest-dungeon-quest-3',
] as const;

/** Prototype Quest ID（prototype- 前缀，硬约束 20）。 */
export const PROTOTYPE_DARKEST_DUNGEON_QUEST_IDS = [
  'prototype-darkest-dungeon-quest-skip-ancestor-1',
  'prototype-darkest-dungeon-quest-skip-ancestor-2',
  'prototype-darkest-dungeon-quest-skip-gestating-heart',
] as const;

/** 规则固定值：16 Rooms / 3 XP。 */
export const DARKEST_DUNGEON_QUEST_ROOM_COUNT = 16 as const;
export const DARKEST_DUNGEON_QUEST_XP_REWARD = 3 as const;

// ---------------------------------------------------------------------------
// 正式 Quest（刻意留空 → 驱动 Data Gate）
// ---------------------------------------------------------------------------

// Phase 11A.3 dev doc §17 / §19：把已 verified 的 rulebook facts 写进 official Quest
// （structural: count=3 / roomCount=16 / xpReward=3 / draw one）。
// 卡面字段（name / Guardian / Skipped Form / Firewood）必须留空 → 仍 unavailable。
function officialQuestSourceReference(id: string): string {
  return `DD_EN_COREBOX_RULES.pdf:p35（structural: count=3 / roomCount=16 / xpReward=3 / draw one / cancel one final form for ${id}）`;
}

function officialQuestStub(id: string): DarkestDungeonQuestDefinition {
  return {
    id,
    questType: 'darkest-dungeon-guardian',
    name: '',
    roomCount: DARKEST_DUNGEON_QUEST_ROOM_COUNT,
    xpReward: DARKEST_DUNGEON_QUEST_XP_REWARD,
    // 卡面未核对：不猜 Guardian，不猜 Skipped Form。
    guardianDefinitionId: '',
    skippedFinalFormId: null,
    firewoodCount: undefined,
    provisionPolicyId: '',
    canRetreat: false,
    campaignFailureOnFailure: true,
    officialDataStatus: 'unavailable',
    enabledInOfficialPool: false,
    // Phase 11A.3 dev doc §9 / §19：把已 verified 的 rulebook structural provenance 写进 official。
    sourceReference: officialQuestSourceReference(id),
  };
}

export const OFFICIAL_DARKEST_DUNGEON_QUESTS: DarkestDungeonQuestDefinition[] =
  OFFICIAL_DARKEST_DUNGEON_QUEST_IDS.map(officialQuestStub);

// ---------------------------------------------------------------------------
// Prototype Quest（开发 harness：验证「三选一 + 保存 Guardian + 保存 Skipped Form」）
// ---------------------------------------------------------------------------

const PROTOTYPE_SKIPPED_FORMS: SkippableFinalFormId[] = [
  'ancestor-first-form',
  'ancestor-second-form',
  'gestating-heart',
];

export const PROTOTYPE_DARKEST_DUNGEON_QUESTS: DarkestDungeonQuestDefinition[] =
  PROTOTYPE_DARKEST_DUNGEON_QUEST_IDS.map((id, index) => ({
    id,
    questType: 'darkest-dungeon-guardian',
    name: `原型 Darkest Dungeon Quest ${index + 1}`,
    roomCount: DARKEST_DUNGEON_QUEST_ROOM_COUNT,
    xpReward: DARKEST_DUNGEON_QUEST_XP_REWARD,
    // Prototype Quest 一律指向 prototype Guardian（不同 Quest 指向不同 prototype Guardian，
    // 用于验证「Quest 决定 Guardian」这条链路，但都不进正式池）。
    guardianDefinitionId:
      DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS[index] ?? DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_ID,
    skippedFinalFormId: PROTOTYPE_SKIPPED_FORMS[index],
    firewoodCount: 2,
    provisionPolicyId: 'prototype-darkest-dungeon-provision-policy',
    canRetreat: false,
    campaignFailureOnFailure: true,
    officialDataStatus: 'prototype',
    enabledInOfficialPool: false,
  }));

// ---------------------------------------------------------------------------
// 取数
// ---------------------------------------------------------------------------

export function getDarkestDungeonQuestPool(
  mode: ActFourRuntimeProfileId = 'prototype',
): DarkestDungeonQuestDefinition[] {
  return mode === 'formal' ? OFFICIAL_DARKEST_DUNGEON_QUESTS : mode === 'community-reference' ? COMMUNITY_RUNTIME_QUESTS : PROTOTYPE_DARKEST_DUNGEON_QUESTS;
}

export function getDarkestDungeonQuestById(
  questId: string,
): DarkestDungeonQuestDefinition | undefined {
  return (
    PROTOTYPE_DARKEST_DUNGEON_QUESTS.find((q) => q.id === questId) ??
    COMMUNITY_RUNTIME_QUESTS.find((q) => q.id === questId) ??
    OFFICIAL_DARKEST_DUNGEON_QUESTS.find((q) => q.id === questId)
  );
}

// ---------------------------------------------------------------------------
// 校验（Data Gate）
// ---------------------------------------------------------------------------

export interface DarkestDungeonQuestValidationResult {
  isComplete: boolean;
  missing: string[];
  issues: string[];
}

export function validateDarkestDungeonQuest(
  quest: DarkestDungeonQuestDefinition,
): DarkestDungeonQuestValidationResult {
  const missing: string[] = [];
  const issues: string[] = [];

  if (!quest.name) missing.push(`quest-name:${quest.id}`);
  if (!quest.guardianDefinitionId) missing.push(`guardian-definition:${quest.id}`);
  if (quest.skippedFinalFormId === null) missing.push(`skipped-final-form:${quest.id}`);
  if (!quest.provisionPolicyId) missing.push(`provision-policy:${quest.id}`);

  if (quest.roomCount !== DARKEST_DUNGEON_QUEST_ROOM_COUNT) {
    issues.push(`Quest ${quest.id} 的 roomCount 必须为 16`);
  }
  if (quest.xpReward !== DARKEST_DUNGEON_QUEST_XP_REWARD) {
    issues.push(`Quest ${quest.id} 的 xpReward 必须为 3`);
  }
  if (quest.canRetreat !== false) issues.push(`Quest ${quest.id} 必须不可撤退`);
  if (quest.campaignFailureOnFailure !== true) {
    issues.push(`Quest ${quest.id} 失败必须导致 Campaign Over`);
  }
  // Heart of Darkness 不能被跳过（硬约束 13）——类型层已锁死，此处兜底运行时校验。
  if ((quest.skippedFinalFormId as string | null) === 'heart-of-darkness') {
    issues.push(`Quest ${quest.id} 不得取消 Heart of Darkness`);
  }
  if (quest.officialDataStatus === 'unavailable') {
    issues.push(`Quest ${quest.id} 卡面数据缺失（unavailable）→ official 禁用`);
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

/** official Quest 池是否可用（三张全部 verified 且校验通过 且 入池）。 */
export function isDarkestDungeonOfficialQuestPoolEnabled(): boolean {
  if (OFFICIAL_DARKEST_DUNGEON_QUESTS.length !== 3) return false;
  return OFFICIAL_DARKEST_DUNGEON_QUESTS.every(
    (q) =>
      q.enabledInOfficialPool &&
      q.officialDataStatus === 'verified' &&
      validateDarkestDungeonQuest(q).isComplete,
  );
}

/** official Quest 缺口清单（审计报告 / Debug 面板用）。 */
export function getDarkestDungeonQuestDataGaps(): string[] {
  const gaps: string[] = [];
  for (const quest of OFFICIAL_DARKEST_DUNGEON_QUESTS) {
    const result = validateDarkestDungeonQuest(quest);
    if (!result.isComplete) {
      gaps.push(`${quest.id}（${[...result.missing, ...result.issues].join('；')}）`);
    }
  }
  return gaps;
}

/** Registry 自检（只报告，不抛异常）。 */
export function validateDarkestDungeonQuestRegistry(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];

  if (isDarkestDungeonOfficialQuestPoolEnabled()) {
    issues.push({
      kind: 'unknown-owner',
      targetId: 'darkest-dungeon-quest-pool',
      message: 'Darkest Dungeon official Quest 池意外启用，需复核数据',
    });
  }

  for (const quest of PROTOTYPE_DARKEST_DUNGEON_QUESTS) {
    if (quest.enabledInOfficialPool) {
      issues.push({
        kind: 'unverified',
        targetId: quest.id,
        message: 'Prototype Quest 不得 enabledInOfficialPool',
      });
    }
    if (!quest.id.startsWith('prototype-')) {
      issues.push({
        kind: 'unverified',
        targetId: quest.id,
        message: 'Prototype Quest 必须使用 prototype- 前缀 ID',
      });
    }
    const result = validateDarkestDungeonQuest(quest);
    if (!result.isComplete) {
      issues.push({
        kind: 'unknown-owner',
        targetId: quest.id,
        message: `Prototype Quest 不自洽：${[...result.missing, ...result.issues].join('；')}`,
      });
    }
  }

  // 三张 prototype Quest 必须覆盖三种 skipped Form（§31.F 手动验收要求）
  const covered = new Set(PROTOTYPE_DARKEST_DUNGEON_QUESTS.map((q) => q.skippedFinalFormId));
  if (covered.size !== 3) {
    issues.push({
      kind: 'unknown-owner',
      targetId: 'prototype-darkest-dungeon-quest-pool',
      message: 'Prototype Quest 必须覆盖三种可跳过 Form',
    });
  }

  return issues;
}
