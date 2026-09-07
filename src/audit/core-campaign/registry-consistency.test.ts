// Phase 11A.2 §8 — Registry Consistency 静态测试。
//
// 把 Phase 11A.1 留下的 Prototype Boss/Threat Family Namespace 不一致
// （Boss `familyId='prototype-necromancer-family'` vs Threat `bossFamilyId='necromancer'`）
// 通过 Registry Validator 的实际输出固化下来 —— 任何回退都会触发测试变红。
//
// dev doc §45 单元测试 7–12：
//   7. Necromancer Family 一致
//   8. Prophet Family 一致
//   9. Collector Family 一致
//   10. Threat → Boss family 一致
//   11. Threat → Boss level 一致
//   12. Prototype official pool false

import { describe, expect, it } from 'vitest';
import { BOSS_REGISTRY, validateBossRegistry } from '../../data/bosses/boss-registry';
import { THREAT_REGISTRY, validateThreatRegistry } from '../../data/bosses/threat-registry';

const PROTOTYPE_FAMILIES = new Set(['necromancer', 'prophet', 'collector', 'fanatic', 'prototype-summoner-family']);

describe('Registry Consistency (Phase 11A.2 §8)', () => {
  it('validateBossRegistry() 报告 0 个问题（family / level / official pool 全一致）', () => {
    const issues = validateBossRegistry();
    expect(issues).toEqual([]);
  });

  it('validateThreatRegistry() 报告 0 个问题（family / level 全一致）', () => {
    const issues = validateThreatRegistry();
    expect(issues).toEqual([]);
  });

  it('Necromancer Family ID 跨 Boss / Threat 完全一致', () => {
    const necromancerBosses = BOSS_REGISTRY.filter((b) => b.familyId === 'necromancer');
    const necromancerThreats = THREAT_REGISTRY.filter((t) => t.bossFamilyId === 'necromancer');
    expect(necromancerBosses.length).toBeGreaterThan(0);
    expect(necromancerThreats.length).toBeGreaterThan(0);
    // 每个 Necromancer Threat 都能找到对应 Level 的 Boss
    for (const t of necromancerThreats) {
      const boss = necromancerBosses.find((b) => b.campaignLevel === t.campaignLevel);
      expect(boss, `Necromancer L${t.campaignLevel} Threat 找不到对应 Boss`).toBeDefined();
    }
  });

  it('Prophet Family ID 跨 Boss / Threat 完全一致', () => {
    const prophetBosses = BOSS_REGISTRY.filter((b) => b.familyId === 'prophet');
    const prophetThreats = THREAT_REGISTRY.filter((t) => t.bossFamilyId === 'prophet');
    expect(prophetBosses.length).toBeGreaterThan(0);
    expect(prophetThreats.length).toBeGreaterThan(0);
    for (const t of prophetThreats) {
      const boss = prophetBosses.find((b) => b.campaignLevel === t.campaignLevel);
      expect(boss, `Prophet L${t.campaignLevel} Threat 找不到对应 Boss`).toBeDefined();
    }
  });

  it('Collector Family ID 跨 Boss / Threat 完全一致', () => {
    const collectorBosses = BOSS_REGISTRY.filter((b) => b.familyId === 'collector');
    const collectorThreats = THREAT_REGISTRY.filter((t) => t.bossFamilyId === 'collector');
    expect(collectorBosses.length).toBeGreaterThan(0);
    expect(collectorThreats.length).toBeGreaterThan(0);
    for (const t of collectorThreats) {
      const boss = collectorBosses.find((b) => b.campaignLevel === t.campaignLevel);
      expect(boss, `Collector L${t.campaignLevel} Threat 找不到对应 Boss`).toBeDefined();
    }
  });

  it('Threat 全部 bossFamilyId 都属于已知家族', () => {
    for (const t of THREAT_REGISTRY) {
      expect(
        PROTOTYPE_FAMILIES.has(t.bossFamilyId),
        `Threat ${t.id} bossFamilyId=${t.bossFamilyId} 不在已知家族集合`,
      ).toBe(true);
    }
  });

  it('Prototype Boss 必须 officialDataStatus=prototype 且 enabledInOfficialPool=false', () => {
    const allBosses = BOSS_REGISTRY;
    for (const b of allBosses) {
      // 11A.1 / 11A.2 阶段全部 Prototype boss 都不进正式池
      expect(b.officialDataStatus, `Boss ${b.id} officialDataStatus`).toBe('prototype');
      expect(b.enabledInOfficialPool, `Boss ${b.id} enabledInOfficialPool`).toBe(false);
    }
  });

  it('no Boss 仍使用 prototype-* familyId（dev doc §7 修复已生效）', () => {
    // Phase 11A.1 的 prototype-act-progression 之前给 Boss 用了
    // `prototype-necromancer-family` 等命名空间，dev doc §7 明确禁止。
    const banned = (id: string) => id.startsWith('prototype-') && id.endsWith('-family') && id !== 'prototype-summoner-family';
    for (const b of BOSS_REGISTRY) {
      expect(
        banned(b.familyId),
        `Boss ${b.id} familyId=${b.familyId} 仍属于 prototype-*-family 命名空间`,
      ).toBe(false);
    }
  });
});
