// Phase 10A §14：Darkest Dungeon Guardian Registry + Data Gate。
//
// 三类正式 Guardian（Templars / Mammoth Cyst / Shuffling Horror）的 Room、Actor、技能
// 在 docs/data/darkest-dungeon/ 中全部 unavailable。
// 硬约束 23：Phase 10A 不得提前实现三类 Guardian 的正式技能。
// 因此本文件只提供：
//   - 正式 Registry 占位（roomDefinitionId = '' / actorDefinitionIds = [] → 校验必然失败）；
//   - Prototype Guardian（prototype- 前缀，验证 Boss Room 接入与 Quest → Guardian 链路）。

import type {
  DarkestDungeonGuardianDefinition,
  DarkestDungeonGuardianFamily,
} from '../../types/act-four';
import type { RegistryValidationIssue } from '../../types/progression';
import {
  OFFICIAL_GUARDIAN_ASSEMBLY,
  isAllGuardianFamiliesReady,
  getAllGuardianFamilyGaps,
} from './official-guardian-assembly';
import type { ActFourRuntimeProfileId } from '../../types/act-four';
import { COMMUNITY_RUNTIME_GUARDIANS } from './community-reference/runtime-profile';

// ---------------------------------------------------------------------------
// ID 常量
// ---------------------------------------------------------------------------

export const DARKEST_DUNGEON_GUARDIAN_FAMILIES: DarkestDungeonGuardianFamily[] = [
  'templars',
  'mammoth-cyst',
  'shuffling-horror',
];

/** 主 Prototype Guardian（文档 §13 指定名称）。 */
export const DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_ID = 'prototype-darkest-dungeon-guardian';

/** 三个 prototype Guardian（分别对应三个 family，仅验证链路，不含正式技能）。 */
export const DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS = [
  'prototype-darkest-dungeon-guardian',
  'prototype-darkest-dungeon-guardian-2',
  'prototype-darkest-dungeon-guardian-3',
] as const;

/** Prototype Guardian Room（Boss Room 接入点）。 */
export const DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_ROOM_ID = 'prototype-darkest-dungeon-guardian-room';

/** Prototype Guardian Actor（Boss BattleActor 定义 ID）。 */
export const DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_ACTOR_ID =
  'prototype-darkest-dungeon-guardian-actor';

// ---------------------------------------------------------------------------
// 正式 Guardian（Phase 11A.3 dev doc §13-15：消费 OFFICIAL_GUARDIAN_ASSEMBLY）
//
// 禁止在 generic registry 中再手填 stub 数据；所有字段必须从
// family-specific registry（Templars / Mammoth Cyst / Shuffling Horror）
// 经由 official-guardian-assembly.ts 组装。
// ---------------------------------------------------------------------------

export const OFFICIAL_DARKEST_DUNGEON_GUARDIANS: DarkestDungeonGuardianDefinition[] =
  OFFICIAL_GUARDIAN_ASSEMBLY;

// ---------------------------------------------------------------------------
// Prototype Guardian（harness）
// ---------------------------------------------------------------------------

export const PROTOTYPE_DARKEST_DUNGEON_GUARDIANS: DarkestDungeonGuardianDefinition[] =
  DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS.map((id, index) => ({
    id,
    family: DARKEST_DUNGEON_GUARDIAN_FAMILIES[index],
    name: `原型 Guardian ${index + 1}`,
    roomDefinitionId: DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_ROOM_ID,
    actorDefinitionIds: [`${DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_ACTOR_ID}-${index + 1}`],
    officialDataStatus: 'prototype',
    enabledInOfficialPool: false,
  }));

/** Prototype Guardian 的 harness 数值（不写入任何正式 Definition，硬约束 20）。 */
export const PROTOTYPE_GUARDIAN_HARNESS_STATS = {
  maxHp: 40,
  actionsPerRound: 2,
  /** 只有一条占位攻击；正式技能由 Phase 10B—10D 接入。 */
  skillIds: ['prototype-darkest-dungeon-guardian-strike'],
} as const;

// ---------------------------------------------------------------------------
// 取数
// ---------------------------------------------------------------------------

export function getDarkestDungeonGuardianById(
  guardianId: string,
): DarkestDungeonGuardianDefinition | undefined {
  return (
    PROTOTYPE_DARKEST_DUNGEON_GUARDIANS.find((g) => g.id === guardianId) ??
    COMMUNITY_RUNTIME_GUARDIANS.find((g) => g.id === guardianId) ??
    OFFICIAL_DARKEST_DUNGEON_GUARDIANS.find((g) => g.id === guardianId)
  );
}

export function getDarkestDungeonGuardianPool(
  mode: ActFourRuntimeProfileId = 'prototype',
): DarkestDungeonGuardianDefinition[] {
  return mode === 'formal'
    ? OFFICIAL_DARKEST_DUNGEON_GUARDIANS
    : mode === 'community-reference' ? COMMUNITY_RUNTIME_GUARDIANS : PROTOTYPE_DARKEST_DUNGEON_GUARDIANS;
}

// ---------------------------------------------------------------------------
// 校验（Data Gate）
// ---------------------------------------------------------------------------

export interface GuardianValidationResult {
  isComplete: boolean;
  missing: string[];
  issues: string[];
}

export function validateDarkestDungeonGuardian(
  guardian: DarkestDungeonGuardianDefinition,
): GuardianValidationResult {
  const missing: string[] = [];
  const issues: string[] = [];

  if (!guardian.name) missing.push(`guardian-name:${guardian.id}`);
  if (!guardian.roomDefinitionId) missing.push(`guardian-room:${guardian.id}`);
  if (guardian.actorDefinitionIds.length === 0) missing.push(`guardian-actors:${guardian.id}`);
  if (guardian.officialDataStatus === 'unavailable') {
    issues.push(`Guardian ${guardian.id} 数据缺失（unavailable）→ official 禁用`);
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

/**
 * official Guardian 池是否可用。
 *
 * Phase 11A.3 dev doc §15：必须调用 family validators（Templars + Mammoth Cyst
 * + Shuffling Horror）。任一 family 仍未 ready → pool false。
 * 不再单看 name / roomDefinitionId / actor IDs 三字段（这会导致表面 ready
 * 但实际 family validator 失败）。
 */
export function isDarkestDungeonOfficialGuardianPoolEnabled(): boolean {
  if (OFFICIAL_DARKEST_DUNGEON_GUARDIANS.length !== 3) return false;
  if (!isAllGuardianFamiliesReady()) return false;
  return OFFICIAL_DARKEST_DUNGEON_GUARDIANS.every(
    (g) =>
      g.enabledInOfficialPool &&
      g.officialDataStatus === 'verified' &&
      validateDarkestDungeonGuardian(g).isComplete,
  );
}

export function getDarkestDungeonGuardianDataGaps(): string[] {
  // Phase 11A.3 dev doc §15：缺口必须真实反映 family validator 的判断
  // （不再只是 generic 字段空字符串检查）。
  const familyGaps = getAllGuardianFamilyGaps();
  const localGaps: string[] = [];
  for (const guardian of OFFICIAL_DARKEST_DUNGEON_GUARDIANS) {
    const result = validateDarkestDungeonGuardian(guardian);
    if (!result.isComplete) {
      localGaps.push(`${guardian.id}（${[...result.missing, ...result.issues].join('；')}）`);
    }
  }
  return [...localGaps, ...familyGaps];
}

export function validateDarkestDungeonGuardianRegistry(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];

  if (isDarkestDungeonOfficialGuardianPoolEnabled()) {
    issues.push({
      kind: 'unknown-owner',
      targetId: 'darkest-dungeon-guardian-pool',
      message: 'Darkest Dungeon official Guardian 池意外启用，需复核数据',
    });
  }

  for (const guardian of PROTOTYPE_DARKEST_DUNGEON_GUARDIANS) {
    if (guardian.enabledInOfficialPool) {
      issues.push({
        kind: 'unverified',
        targetId: guardian.id,
        message: 'Prototype Guardian 不得 enabledInOfficialPool（§13）',
      });
    }
    if (!guardian.id.startsWith('prototype-')) {
      issues.push({
        kind: 'unverified',
        targetId: guardian.id,
        message: 'Prototype Guardian 必须使用 prototype- 前缀 ID',
      });
    }
    if (!validateDarkestDungeonGuardian(guardian).isComplete) {
      issues.push({
        kind: 'unknown-owner',
        targetId: guardian.id,
        message: 'Prototype Guardian 不自洽',
      });
    }
  }

  return issues;
}
