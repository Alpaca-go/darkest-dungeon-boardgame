// Phase 11A.3 Source-Gate Integrity Repair dev doc §18-21：
// Official Guardian Registry Assembly。
//
// 设计（修复 Finding D）：
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
// Official Guardian Definitions（dev doc §14：从 family-specific registries 组装）
// ---------------------------------------------------------------------------

/**
 * 组装一个 official Guardian Definition。
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
    // Phase 11A.3 Source-Gate Integrity Repair §19：用 validateTemplarsGuardian（data only）
    // 而非 isTemplarsOfficialEncounterEnabled（policy 包含 enabledInOfficialPool），
    // 避免循环依赖。
    const ready = validateTemplarsGuardian('formal').isComplete;
    return {
      id: 'darkest-dungeon-guardian-templars',
      family,
      // 资料齐备后才填 name；未齐时 name 留空 → validateDarkestDungeonGuardian 报 missing
      name: ready ? 'Templars' : '',
      roomDefinitionId: ready ? 'templars-room' : '',
      actorDefinitionIds: ready
        ? ['templar-impaler', 'templar-warlord']
        : [],
      // Phase 11A.3 Source-Gate Integrity Repair §19：enabledInOfficialPool = ready。
      // 之前 hardcoded false 导致未来 source 齐备时 Pool 仍 false（dev doc §18 Finding D）。
      // 现在 data complete 时自动 enable generic Pool。
      officialDataStatus: ready ? 'verified' : 'partial',
      enabledInOfficialPool: ready,
      sourceReference: ready
        ? 'DD_EN_COREBOX_RULES.pdf:p39 + Templar Impaler / Warlord Battle Card + Templars Room Card'
        : 'DD_EN_COREBOX_RULES.pdf:p39（仅 structural fields）',
    };
  }
  if (family === 'mammoth-cyst') {
    // 同 Templars：用 validateMammothCystGuardian（data only）
    const ready = validateMammothCystGuardian('formal').isComplete;
    return {
      id: 'darkest-dungeon-guardian-mammoth-cyst',
      family,
      name: ready ? 'Mammoth Cyst' : '',
      roomDefinitionId: ready ? 'mammoth-cyst-room' : '',
      actorDefinitionIds: ready ? ['mammoth-cyst', 'white-cell-stalk'] : [],
      officialDataStatus: ready ? 'verified' : 'partial',
      enabledInOfficialPool: ready,
      sourceReference: ready
        ? 'DD_EN_COREBOX_RULES.pdf:p39 + Mammoth Cyst / White Cell Stalk Battle Card + Mammoth Cyst Room Card'
        : 'DD_EN_COREBOX_RULES.pdf:p39（仅 structural fields）',
    };
  }
  // shuffling-horror
  const readiness = getShufflingHorrorOfficialReadiness();
  const ready = readiness.ready;
  return {
    id: 'darkest-dungeon-guardian-shuffling-horror',
    family,
    name: ready ? 'Shuffling Horror' : '',
    roomDefinitionId: readiness.roomComplete ? 'shuffling-horror-room' : '',
    actorDefinitionIds: readiness.roomComplete
      ? ['shuffling-horror', 'cultist-priest', 'malignant-growth']
      : [],
    officialDataStatus: readiness.officialVerified ? 'verified' : 'partial',
    enabledInOfficialPool: ready,
    sourceReference: readiness.sourceComplete
      ? 'DD_EN_COREBOX_RULES.pdf:p40 + Shuffling Horror / Cultist Priest / Malignant Growth Battle Card + Shuffling Horror Room Card'
      : 'DD_EN_COREBOX_RULES.pdf:p40（仅 structural fields）',
  };
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
