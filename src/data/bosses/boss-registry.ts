// Phase 9A §10：Boss Registry。
//
// 与 Hero Level / Trinket Registry 同构：数据与规则彻底分离，
// 引擎只通过本文件的查询函数取 BossDefinition，永远不 import 具体 Boss 常量。
// 拿到正式卡面后，只需往 BOSS_REGISTRY 里加条目并把 officialDataStatus 改成
// 'verified' + enabledInOfficialPool = true，引擎与 UI 均无需改动。

import type { DataMode, RegistryValidationIssue } from '../../types/progression';
import type { BossDefinition, BossSkillDefinition, CampaignLevel } from '../../types/bosses';
import { PROTOTYPE_BOSSES } from './prototype-bosses';
import { ACT_PROGRESSION_BOSSES } from './prototype-act-progression';

/**
 * 当前 Boss 数据模式。
 * Phase 9A 仅有 prototype 数据，因此为 'prototype'；
 * 正式 Boss 卡面接入后切回 'formal'，届时 Registry 校验会把所有非 verified 数据报出来。
 */
export const BOSS_DATA_MODE: DataMode = 'prototype';

/** 全部 Boss 定义（正式 + 原型）。 */
export const BOSS_REGISTRY: BossDefinition[] = [
  ...PROTOTYPE_BOSSES,
  ...ACT_PROGRESSION_BOSSES,
];

/** 按 id 取 Boss 定义。 */
export function getBossDefinitionById(bossId: string): BossDefinition | undefined {
  return BOSS_REGISTRY.find((b) => b.id === bossId);
}

/** 按 Boss Family 取该家族下的全部 Boss 定义。 */
export function getBossDefinitionsByFamily(familyId: string): BossDefinition[] {
  return BOSS_REGISTRY.filter((b) => b.familyId === familyId);
}

/**
 * 取某 Campaign Level 下某家族的 Boss 定义。
 * 找不到时返回 undefined —— 调用方必须显式提示「数据缺失」，
 * 严禁回退到其它 Level 的 Boss 数据（§7.2）。
 */
export function getBossDefinition(
  familyId: string,
  campaignLevel: CampaignLevel
): BossDefinition | undefined {
  return BOSS_REGISTRY.find((b) => b.familyId === familyId && b.campaignLevel === campaignLevel);
}

/** 取 Boss 技能定义。 */
export function getBossSkill(boss: BossDefinition, skillId: string): BossSkillDefinition | undefined {
  return boss.skills.find((s) => s.id === skillId);
}

/** 某模式下可用的 Boss（正式模式只认 verified + 入池）。 */
export function getSelectableBosses(mode: DataMode = BOSS_DATA_MODE): BossDefinition[] {
  if (mode === 'formal') {
    return BOSS_REGISTRY.filter((b) => b.enabledInOfficialPool && b.officialDataStatus === 'verified');
  }
  return [...BOSS_REGISTRY];
}

/**
 * Registry 校验（只报告、不抛异常）：
 * - formal 模式下存在非 verified 数据；
 * - 原型数据错误地进入了正式池；
 * - Summon 技能引用了不存在的 SummonDefinition；
 * - actionsPerRound 非法（必须 >= 1）。
 */
export function validateBossRegistry(mode: DataMode = BOSS_DATA_MODE): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  for (const boss of BOSS_REGISTRY) {
    if (mode === 'formal' && boss.officialDataStatus !== 'verified') {
      issues.push({
        kind: 'unverified',
        targetId: boss.id,
        level: boss.campaignLevel,
        message: `Boss ${boss.id} 数据可信度为 ${boss.officialDataStatus}，formal 模式不允许`,
      });
    }
    if (boss.officialDataStatus === 'prototype' && boss.enabledInOfficialPool) {
      issues.push({
        kind: 'unverified',
        targetId: boss.id,
        message: `Boss ${boss.id} 是原型数据，不得 enabledInOfficialPool`,
      });
    }
    if (boss.actionsPerRound < 1) {
      issues.push({
        kind: 'non-monotonic',
        targetId: boss.id,
        message: `Boss ${boss.id} 的 actionsPerRound 必须 >= 1`,
      });
    }
    for (const skill of boss.skills) {
      if (skill.kind !== 'summon') continue;
      const ok = skill.summonDefinitionId
        ? boss.summonRules.some((r) => r.id === skill.summonDefinitionId)
        : false;
      if (!ok) {
        issues.push({
          kind: 'unknown-owner',
          targetId: skill.id,
          message: `Boss 技能 ${skill.id} 是召唤技能，但 summonDefinitionId 未在 summonRules 中定义`,
        });
      }
    }
  }
  return issues;
}
