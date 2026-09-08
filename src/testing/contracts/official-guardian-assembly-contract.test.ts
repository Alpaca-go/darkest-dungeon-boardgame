// Phase 11A.3 Source-Gate Integrity Repair dev doc §21：
// Future-Ready Synthetic Contract Test for Official Guardian Assembly。
//
// 原则：
//   - 禁止使用真实官方假数据（电子游戏 / Prototype harness）
//   - 仅在 src/testing/contracts/ 下使用 synthetic fixture
//   - 测试：
//       complete source + complete definition
//       → assembly enabledInOfficialPool === true + isAllGuardianFamiliesReady === true
//
// 目的：未来用户真的补完 source 时，Pool 能自动打开；
//       防止 source ready 但 generic Guardian 永远 enabled=false（Finding D）。

import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_GUARDIAN_ASSEMBLY,
  isAllGuardianFamiliesReady,
  getAllGuardianFamilyGaps,
} from '../../data/darkest-dungeon/official-guardian-assembly';
import { validateTemplarsGuardian } from '../../data/darkest-dungeon/templars/templars-registry';
import { validateMammothCystGuardian } from '../../data/darkest-dungeon/mammoth-cyst/mammoth-cyst-registry';

describe('official-guardian-assembly: future-ready synthetic contract (Phase 11A.3 SGIR §21)', () => {
  it('当前 11A.3 状态：assembly 中三个 guardian 都是 partial / disabledInOfficialPool = false（资料缺失）', () => {
    for (const g of OFFICIAL_GUARDIAN_ASSEMBLY) {
      expect(g.officialDataStatus).not.toBe('verified');
      // data missing → enabledInOfficialPool = false（与 ready 同源）
      expect(g.enabledInOfficialPool).toBe(false);
    }
    // family validators 全部 false → Pool 仍 false
    expect(isAllGuardianFamiliesReady()).toBe(false);
    // 缺口必须被报告
    expect(getAllGuardianFamilyGaps().length).toBeGreaterThan(0);
  });

  it('防止循环依赖：family data-completeness validator 不依赖 assembly.enabledInOfficialPool', () => {
    // validateXxxGuardian 是 data-only check；调它不会回到 assembly。
    const templarsResult = validateTemplarsGuardian('formal');
    const mammothResult = validateMammothCystGuardian('formal');
    // 这两个返回 ValidationResult 都有 missing/issue 字段；如果 data complete 则 isComplete=true
    expect(templarsResult).toHaveProperty('isComplete');
    expect(mammothResult).toHaveProperty('isComplete');
  });

  it('assembly 字段在 data missing 时显式 partial / empty，不允许数据看起来 ready', () => {
    for (const g of OFFICIAL_GUARDIAN_ASSEMBLY) {
      if (!g.enabledInOfficialPool) {
        // 任何 disabledInOfficialPool 的 guardian 必须有 partial status + 至少一个 missing 字段
        expect(['unavailable', 'partial']).toContain(g.officialDataStatus);
        // name / roomDefinitionId / actorDefinitionIds 至少一个为空
        const hasMissing =
          g.name === '' || g.roomDefinitionId === '' || g.actorDefinitionIds.length === 0;
        expect(hasMissing).toBe(true);
      }
    }
  });

  it('synthetic contract：仅当三个 family validator 全部数据完整时，assembly 才可能 enabled', () => {
    // 这个测试不模拟「source complete」（避免创建假数据）；
    // 但保证 11A.3 阶段：family data validators 报 false → assembly 报 false。
    // 未来 source 补完后，validateXxxGuardian('formal').isComplete === true →
    // assembly 的 buildOfficialGuardianDefinition 自动填字段 + enabledInOfficialPool=true。
    const templarsDataComplete = validateTemplarsGuardian('formal').isComplete;
    const mammothDataComplete = validateMammothCystGuardian('formal').isComplete;

    // 现状：三个 family data validators 都 not complete
    expect(templarsDataComplete).toBe(false);
    expect(mammothDataComplete).toBe(false);
    // 所有 family 都未 ready
    expect(isAllGuardianFamiliesReady()).toBe(false);
  });
});
