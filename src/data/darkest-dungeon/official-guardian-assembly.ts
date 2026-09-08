// Phase 11A.3 dev doc §13-15：Official Guardian Registry Assembly。
//
// 设计：
//   - 单一来源：所有 official Guardian 字段必须从 family-specific registry 组装
//     （Templars / Mammoth Cyst / Shuffling Horror），不再手填 stub。
//   - Generic Guardian Registry（guardian-registry.ts）只能消费本 assembly，
//     禁止在 guardian-registry.ts 再手填一份不同数据。
//   - 通用「Official Guardian Pool Enabled」必须调用 family validators：
//     Templars + Mammoth Cyst + Shuffling Horror 全部通过才 true。
//   - 任一 family 不通过 → pool false，调用 getDarkestDungeonGuardianDataGaps()
//     列出根因。
//
// Phase 11A.3 阶段：所有 family validator 仍因 Battle Card / Room Card 缺失返回
// false；本文件主要建立「不再两套 official truth」的结构 + 把 family
// validator 调用串起来。资料齐备后 source-of-truth 自然切换。

import type { DarkestDungeonGuardianDefinition } from '../../types/act-four';
import { isTemplarsOfficialEncounterEnabled, getTemplarsDataGaps } from './templars/templars-registry';
import {
  isMammothCystOfficialEncounterEnabled,
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

export function getTemplarsFamilyReadiness(): GuardianFamilyReadiness {
  return {
    family: 'templars',
    ready: isTemplarsOfficialEncounterEnabled(),
    gaps: getTemplarsDataGaps(),
  };
}

export function getMammothCystFamilyReadiness(): GuardianFamilyReadiness {
  return {
    family: 'mammoth-cyst',
    ready: isMammothCystOfficialEncounterEnabled(),
    gaps: getMammothCystDataGaps(),
  };
}

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
    const ready = isTemplarsOfficialEncounterEnabled();
    return {
      id: 'darkest-dungeon-guardian-templars',
      family,
      // 资料齐备后才填 name；未齐时 name 留空 → validateDarkestDungeonGuardian 报 missing
      name: ready ? 'Templars' : '',
      roomDefinitionId: ready ? 'templars-room' : '',
      actorDefinitionIds: ready
        ? ['templar-impaler', 'templar-warlord']
        : [],
      // Phase 11A.3 dev doc §17：partial 状态必须保持
      officialDataStatus: ready ? 'verified' : 'partial',
      enabledInOfficialPool: false,
      sourceReference: ready
        ? 'DD_EN_COREBOX_RULES.pdf:p39 + Templar Impaler / Warlord Battle Card + Templars Room Card'
        : 'DD_EN_COREBOX_RULES.pdf:p39（仅 structural fields）',
    };
  }
  if (family === 'mammoth-cyst') {
    const ready = isMammothCystOfficialEncounterEnabled();
    return {
      id: 'darkest-dungeon-guardian-mammoth-cyst',
      family,
      name: ready ? 'Mammoth Cyst' : '',
      roomDefinitionId: ready ? 'mammoth-cyst-room' : '',
      actorDefinitionIds: ready ? ['mammoth-cyst', 'white-cell-stalk'] : [],
      officialDataStatus: ready ? 'verified' : 'partial',
      enabledInOfficialPool: false,
      sourceReference: ready
        ? 'DD_EN_COREBOX_RULES.pdf:p39 + Mammoth Cyst / White Cell Stalk Battle Card + Mammoth Cyst Room Card'
        : 'DD_EN_COREBOX_RULES.pdf:p39（仅 structural fields）',
    };
  }
  // shuffling-horror
  const readiness = getShufflingHorrorOfficialReadiness();
  return {
    id: 'darkest-dungeon-guardian-shuffling-horror',
    family,
    name: readiness.ready ? 'Shuffling Horror' : '',
    roomDefinitionId: readiness.roomComplete ? 'shuffling-horror-room' : '',
    actorDefinitionIds: readiness.roomComplete
      ? ['shuffling-horror', 'cultist-priest', 'malignant-growth']
      : [],
    officialDataStatus: readiness.officialVerified ? 'verified' : 'partial',
    enabledInOfficialPool: false,
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
