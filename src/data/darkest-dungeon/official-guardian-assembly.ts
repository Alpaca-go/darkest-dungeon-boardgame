// Phase 11A.3 Source-Gate Final Acceptance Closure dev doc §16：
// Official Guardian Registry Assembly。
//
// 设计：
//   - 单一来源：所有 official Guardian 字段必须从 family-specific registry 组装
//     （Templars / Mammoth Cyst / Shuffling Horror），不再手填 stub。
//   - 通用「Official Guardian Pool Enabled」必须调用 family validators：
//     Templars + Mammoth Cyst + Shuffling Horror 全部 ready 才 true。
//   - 关键修复：assembly 之前 `enabledInOfficialPool: ready` 永远是 false，
//     即使 family validator 全部通过。修法：
//     a) 使用 `validateXxxGuardian('formal').isComplete`（data-completeness only，
//        不依赖 `enabledInOfficialPool`），避免循环依赖。
//     b) assembly 自己的 `enabledInOfficialPool = ready`：当 data complete 时
//        generic Pool 自动 enable（不再永久 false）。
//   - 防御循环：assembly 调 `validateXxxGuardian('formal')`（不调
//     `isXxxOfficialEncounterEnabled()`，后者会读 encounter.enabledInOfficialPool，
//     与 assembly 的 enabledInOfficialPool 字段解耦，无环）。
//
// Phase 11A.3 Source-Gate Final Acceptance Closure §16：
//   抽 `assembleOfficialGuardian(family, validatedFamilyData)` 纯函数：
//     纯函数不调真实 validators，接收 caller 提供的 validated data；用于 future-ready
//     synthetic contract test（构造 complete synthetic fixture → assembly 输出 verified / enabled=true）。
//   实际 OFFICIAL_GUARDIAN_ASSEMBLY 仍由 buildOfficialGuardianDefinition 从真实 validators 派生。

import type { DarkestDungeonGuardianDefinition } from '../../types/act-four';
import {
  validateTemplarsGuardian,
  getTemplarsDataGaps,
} from './templars/templars-registry';
import {
  validateMammothCystGuardian,
  getMammothCystDataGaps,
} from './mammoth-cyst/mammoth-cyst-registry';
import { getShufflingHorrorOfficialReadiness } from './shuffling-horror/registry';

// ---------------------------------------------------------------------------
// Family-level validators（dev doc §15：通用 Pool 必须调用 family validators）
// ---------------------------------------------------------------------------

export interface GuardianFamilyReadiness {
  family: 'templars' | 'mammoth-cyst' | 'shuffling-horror';
  ready: boolean;
  gaps: string[];
}

/** Templars family data-completeness（不依赖 enabledInOfficialPool，避免循环）。 */
export function getTemplarsFamilyReadiness(): GuardianFamilyReadiness {
  const dataComplete = validateTemplarsGuardian('formal').isComplete;
  return {
    family: 'templars',
    ready: dataComplete,
    gaps: dataComplete ? [] : getTemplarsDataGaps(),
  };
}

/** Mammoth Cyst family data-completeness（不依赖 enabledInOfficialPool）。 */
export function getMammothCystFamilyReadiness(): GuardianFamilyReadiness {
  const dataComplete = validateMammothCystGuardian('formal').isComplete;
  return {
    family: 'mammoth-cyst',
    ready: dataComplete,
    gaps: dataComplete ? [] : getMammothCystDataGaps(),
  };
}

/** Shuffling Horror family data-completeness（已有 getShufflingHorrorOfficialReadiness）。 */
export function getShufflingHorrorFamilyReadiness(): GuardianFamilyReadiness {
  const readiness = getShufflingHorrorOfficialReadiness();
  return {
    family: 'shuffling-horror',
    ready: readiness.ready,
    gaps: readiness.missing,
  };
}

export function getAllGuardianFamilyReadiness(): GuardianFamilyReadiness[] {
  return [
    getTemplarsFamilyReadiness(),
    getMammothCystFamilyReadiness(),
    getShufflingHorrorFamilyReadiness(),
  ];
}

// ---------------------------------------------------------------------------
// Phase 11A.3 Source-Gate Final Acceptance Closure §16：
// 纯函数 assembleOfficialGuardian
// ---------------------------------------------------------------------------

/**
 * Caller 提供的 validated family data（从真实 validators 或 synthetic fixture）。
 * 纯函数只读取这些字段，不调任何真实 IO / validators，避免循环依赖与 future-ready test
 * 无法构造 complete 状态的难题。
 */
export interface ValidatedFamilyData {
  ready: boolean;
  /** 资料齐时填，非空。 */
  name: string;
  roomDefinitionId: string;
  actorDefinitionIds: string[];
  /** 资料齐时填完整 source reference 链。 */
  sourceReference: string;
}

/** Templars Validated Data（dev doc §16：构造 complete synthetic fixture 用） */
export function buildValidatedTemplarsData(): ValidatedFamilyData {
  const ready = validateTemplarsGuardian('formal').isComplete;
  return {
    ready,
    name: ready ? 'Templars' : '',
    roomDefinitionId: ready ? 'templars-room' : '',
    actorDefinitionIds: ready ? ['templar-impaler', 'templar-warlord'] : [],
    sourceReference: ready
      ? 'DD_EN_COREBOX_RULES.pdf:p39 + Templar Impaler / Warlord Battle Card + Templars Room Card'
      : 'DD_EN_COREBOX_RULES.pdf:p39（仅 structural fields）',
  };
}

export function buildValidatedMammothCystData(): ValidatedFamilyData {
  const ready = validateMammothCystGuardian('formal').isComplete;
  return {
    ready,
    name: ready ? 'Mammoth Cyst' : '',
    roomDefinitionId: ready ? 'mammoth-cyst-room' : '',
    actorDefinitionIds: ready ? ['mammoth-cyst', 'white-cell-stalk'] : [],
    sourceReference: ready
      ? 'DD_EN_COREBOX_RULES.pdf:p39 + Mammoth Cyst / White Cell Stalk Battle Card + Mammoth Cyst Room Card'
      : 'DD_EN_COREBOX_RULES.pdf:p39（仅 structural fields）',
  };
}

export function buildValidatedShufflingHorrorData(): ValidatedFamilyData {
  const readiness = getShufflingHorrorOfficialReadiness();
  const ready = readiness.ready;
  return {
    ready,
    name: ready ? 'Shuffling Horror' : '',
    roomDefinitionId: readiness.roomComplete ? 'shuffling-horror-room' : '',
    actorDefinitionIds: readiness.roomComplete
      ? ['shuffling-horror', 'cultist-priest', 'malignant-growth']
      : [],
    sourceReference: readiness.sourceComplete
      ? 'DD_EN_COREBOX_RULES.pdf:p40 + Shuffling Horror / Cultist Priest / Malignant Growth Battle Card + Shuffling Horror Room Card'
      : 'DD_EN_COREBOX_RULES.pdf:p40（仅 structural fields）',
  };
}

/**
 * 纯函数：根据 caller 提供的 validated data 组装一个 official Guardian Definition。
 * 不调任何真实 IO / validators —— 用于 future-ready synthetic contract test 构造
 * complete / incomplete 状态（dev doc §16）。
 */
export function assembleOfficialGuardian(
  family: 'templars' | 'mammoth-cyst' | 'shuffling-horror',
  data: ValidatedFamilyData,
): DarkestDungeonGuardianDefinition {
  const idMap: Record<typeof family, string> = {
    'templars': 'darkest-dungeon-guardian-templars',
    'mammoth-cyst': 'darkest-dungeon-guardian-mammoth-cyst',
    'shuffling-horror': 'darkest-dungeon-guardian-shuffling-horror',
  };
  return {
    id: idMap[family],
    family,
    name: data.name,
    roomDefinitionId: data.roomDefinitionId,
    actorDefinitionIds: data.actorDefinitionIds,
    officialDataStatus: data.ready ? 'verified' : 'partial',
    enabledInOfficialPool: data.ready,
    sourceReference: data.sourceReference,
  };
}

// ---------------------------------------------------------------------------
// Official Guardian Definitions（dev doc §14：从 family-specific registries 组装）
// ---------------------------------------------------------------------------

/**
 * 组装一个 official Guardian Definition（从真实 validators）。
 *
 * 严格遵守：
 *   - 不在 generic registry 中手填 name / roomDefinitionId / actorDefinitionIds
 *   - 所有字段必须来自 family-specific registry 或 family validator
 *   - 资料未齐时（family validator not ready）保留 partial / unavailable 状态
 */
function buildOfficialGuardianDefinition(
  family: 'templars' | 'mammoth-cyst' | 'shuffling-horror',
): DarkestDungeonGuardianDefinition {
  if (family === 'templars') {
    return assembleOfficialGuardian('templars', buildValidatedTemplarsData());
  }
  if (family === 'mammoth-cyst') {
    return assembleOfficialGuardian('mammoth-cyst', buildValidatedMammothCystData());
  }
  return assembleOfficialGuardian('shuffling-horror', buildValidatedShufflingHorrorData());
}

/** 三个 official Guardian Definitions（唯一组装入口；generic registry 只消费这里）。 */
export const OFFICIAL_GUARDIAN_ASSEMBLY: DarkestDungeonGuardianDefinition[] = [
  buildOfficialGuardianDefinition('templars'),
  buildOfficialGuardianDefinition('mammoth-cyst'),
  buildOfficialGuardianDefinition('shuffling-horror'),
];

// ---------------------------------------------------------------------------
// Combined Pool Gate（dev doc §15：调用所有 family validators）
// ---------------------------------------------------------------------------

/**
 * Guardian Pool 启用 = 三个 family validators 全部 ready。
 * 不调用 family validator 的话无法通过 dev doc §15。
 */
export function isAllGuardianFamiliesReady(): boolean {
  return getAllGuardianFamilyReadiness().every((f) => f.ready);
}

/** 列出所有 family 缺口（用于 audit:content / debug 面板）。 */
export function getAllGuardianFamilyGaps(): string[] {
  const gaps: string[] = [];
  for (const readiness of getAllGuardianFamilyReadiness()) {
    if (!readiness.ready) {
      gaps.push(`[${readiness.family}] ${readiness.gaps.join('；')}`);
    }
  }
  return gaps;
}
