// Phase 9A §6.1 / §7.1：Imminent Threat Registry。
//
// Threat 与 Boss 通过 bossFamilyId 一一绑定：抽到 Threat 即等于抽到本 Act 的 Boss。
// 抽取本身在 game-engine/campaign/threat-selection.ts，本文件只负责「有哪些数据 / 谁可入池」。

import type { DataMode, RegistryValidationIssue } from '../../types/progression';
import type { BossThreatDefinition, CampaignLevel } from '../../types/bosses';
import { PROTOTYPE_THREATS } from './prototype-threats';
import { ACT_PROGRESSION_THREATS } from './prototype-act-progression';
import { getBossDefinitionById } from './boss-registry';

/** 当前 Threat 数据模式（与 Boss 保持一致）。 */
export const THREAT_DATA_MODE: DataMode = 'prototype';

/** Threat 被动的默认排序优先级（晚于 Quirk 的 20）。 */
export const THREAT_DEFAULT_PRIORITY = 30;

/** 全部 Threat 定义。 */
export const THREAT_REGISTRY: BossThreatDefinition[] = [
  ...PROTOTYPE_THREATS,
  ...ACT_PROGRESSION_THREATS,
];

/** 按 id 取 Threat。 */
export function getThreatById(threatId: string): BossThreatDefinition | undefined {
  return THREAT_REGISTRY.find((t) => t.id === threatId);
}

/** 取可抽取的 Threat 池（§7.1）。 */
export function getEligibleThreats(params: {
  campaignLevel: CampaignLevel;
  /** 已击败的 Boss 家族（同一家族不再出现）。 */
  excludedBossFamilyIds: string[];
  mode?: DataMode;
}): BossThreatDefinition[] {
  const { campaignLevel, excludedBossFamilyIds } = params;
  const mode = params.mode ?? THREAT_DATA_MODE;
  return THREAT_REGISTRY.filter((t) => {
    if (t.campaignLevel !== campaignLevel) return false;
    if (excludedBossFamilyIds.includes(t.bossFamilyId)) return false;
    if (mode === 'formal') {
      return t.enabledInOfficialPool && t.officialDataStatus === 'verified';
    }
    return true;
  });
}

/**
 * Registry 校验：
 * - formal 模式下的非 verified 数据；
 * - 原型数据误入正式池；
 * - Threat 指向了不存在的 Boss 定义；
 * - Threat 与其 Boss 的 campaignLevel 不一致；
 * - 同一 Threat 内效果 key 重复（一次性效果的消耗记录依赖 key 唯一）。
 */
export function validateThreatRegistry(mode: DataMode = THREAT_DATA_MODE): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  for (const threat of THREAT_REGISTRY) {
    if (mode === 'formal' && threat.officialDataStatus !== 'verified') {
      issues.push({
        kind: 'unverified',
        targetId: threat.id,
        level: threat.campaignLevel,
        message: `Threat ${threat.id} 数据可信度为 ${threat.officialDataStatus}，formal 模式不允许`,
      });
    }
    if (threat.officialDataStatus === 'prototype' && threat.enabledInOfficialPool) {
      issues.push({
        kind: 'unverified',
        targetId: threat.id,
        message: `Threat ${threat.id} 是原型数据，不得 enabledInOfficialPool`,
      });
    }

    const boss = getBossDefinitionById(threat.bossDefinitionId);
    if (!boss) {
      issues.push({
        kind: 'unknown-owner',
        targetId: threat.id,
        message: `Threat ${threat.id} 指向的 Boss 定义 ${threat.bossDefinitionId} 不存在`,
      });
    } else {
      if (boss.familyId !== threat.bossFamilyId) {
        issues.push({
          kind: 'unknown-owner',
          targetId: threat.id,
          message: `Threat ${threat.id} 的 bossFamilyId 与 Boss ${boss.id} 的 familyId 不一致`,
        });
      }
      if (boss.campaignLevel !== threat.campaignLevel) {
        issues.push({
          kind: 'non-monotonic',
          targetId: threat.id,
          level: threat.campaignLevel,
          message: `Threat ${threat.id} 与 Boss ${boss.id} 的 campaignLevel 不一致`,
        });
      }
    }

    const keys = [
      ...threat.hamletEffects.modifiers.map((m) => m.key),
      ...threat.hamletEffects.reactions.map((r) => r.key),
      ...threat.dungeonEffects.modifiers.map((m) => m.key),
      ...threat.dungeonEffects.reactions.map((r) => r.key),
    ];
    const seen = new Set<string>();
    for (const k of keys) {
      if (seen.has(k)) {
        issues.push({
          kind: 'unknown-owner',
          targetId: threat.id,
          message: `Threat ${threat.id} 存在重复的效果 key：${k}`,
        });
      }
      seen.add(k);
    }
  }
  return issues;
}
