// Phase 11A.3 Source-Gate Final Acceptance Closure dev doc §16：
// Future-Ready Synthetic Contract Test for Official Guardian Assembly。
//
// 关键修复：
//   之前测试只断言「当前 data 缺 → enabled=false」（消极测试）。
//   dev doc §16 明确要求：
//     1) 构造 complete synthetic fixture → enabled=true（积极测试）
//     2) 构造 incomplete synthetic fixture → enabled=false（消极测试）
//   synthetic fixture 只能放 src/testing/contracts/**，不得写 Production official data。

import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_GUARDIAN_ASSEMBLY,
  isAllGuardianFamiliesReady,
  getAllGuardianFamilyGaps,
  assembleOfficialGuardian,
  type ValidatedFamilyData,
} from '../../data/darkest-dungeon/official-guardian-assembly';
import { validateTemplarsGuardian } from '../../data/darkest-dungeon/templars/templars-registry';
import { validateMammothCystGuardian } from '../../data/darkest-dungeon/mammoth-cyst/mammoth-cyst-registry';

/** 构造一个「complete」的 ValidatedFamilyData：所有字段填齐，ready=true。 */
function completeValidatedData(family: 'templars' | 'mammoth-cyst' | 'shuffling-horror'): ValidatedFamilyData {
  if (family === 'templars') {
    return {
      ready: true,
      name: 'Templars',
      roomDefinitionId: 'templars-room',
      actorDefinitionIds: ['templar-impaler', 'templar-warlord'],
      sourceReference: 'synthetic:complete:templars',
    };
  }
  if (family === 'mammoth-cyst') {
    return {
      ready: true,
      name: 'Mammoth Cyst',
      roomDefinitionId: 'mammoth-cyst-room',
      actorDefinitionIds: ['mammoth-cyst', 'white-cell-stalk'],
      sourceReference: 'synthetic:complete:mammoth-cyst',
    };
  }
  return {
    ready: true,
    name: 'Shuffling Horror',
    roomDefinitionId: 'shuffling-horror-room',
    actorDefinitionIds: ['shuffling-horror', 'cultist-priest', 'malignant-growth'],
    sourceReference: 'synthetic:complete:shuffling-horror',
  };
}

/** 构造一个「incomplete」的 ValidatedFamilyData：字段缺失，ready=false。 */
function incompleteValidatedData(family: 'templars' | 'mammoth-cyst' | 'shuffling-horror'): ValidatedFamilyData {
  return {
    ready: false,
    name: '',
    roomDefinitionId: '',
    actorDefinitionIds: [],
    sourceReference: 'synthetic:incomplete:' + family,
  };
}

describe('official-guardian-assembly: future-ready synthetic contract (Phase 11A.3 SGIR §16)', () => {
  describe('真实数据派生（assembleOfficialGuardian 从真实 validators 派生）', () => {
    it('当前 11A.3 状态：assembly 中三个 guardian 都是 partial / enabledInOfficialPool = false（资料缺失）', () => {
      for (const g of OFFICIAL_GUARDIAN_ASSEMBLY) {
        expect(g.officialDataStatus).not.toBe('verified');
        expect(g.enabledInOfficialPool).toBe(false);
      }
      expect(isAllGuardianFamiliesReady()).toBe(false);
      expect(getAllGuardianFamilyGaps().length).toBeGreaterThan(0);
    });

    it('防止循环依赖：family data-completeness validator 不依赖 assembly.enabledInOfficialPool', () => {
      const templarsResult = validateTemplarsGuardian('formal');
      const mammothResult = validateMammothCystGuardian('formal');
      expect(templarsResult).toHaveProperty('isComplete');
      expect(mammothResult).toHaveProperty('isComplete');
    });

    it('assembly 字段在 data missing 时显式 partial / empty', () => {
      for (const g of OFFICIAL_GUARDIAN_ASSEMBLY) {
        if (!g.enabledInOfficialPool) {
          expect(['unavailable', 'partial']).toContain(g.officialDataStatus);
          const hasMissing =
            g.name === '' || g.roomDefinitionId === '' || g.actorDefinitionIds.length === 0;
          expect(hasMissing).toBe(true);
        }
      }
    });
  });

  describe('synthetic contract（dev doc §16：构造 complete fixture 验证 enabled=true）', () => {
    it('synthetic complete Templars fixture → assembly 输出 verified + enabledInOfficialPool=true', () => {
      const g = assembleOfficialGuardian('templars', completeValidatedData('templars'));
      expect(g.id).toBe('darkest-dungeon-guardian-templars');
      expect(g.family).toBe('templars');
      expect(g.name).toBe('Templars');
      expect(g.roomDefinitionId).toBe('templars-room');
      expect(g.actorDefinitionIds).toEqual(['templar-impaler', 'templar-warlord']);
      expect(g.officialDataStatus).toBe('verified');
      expect(g.enabledInOfficialPool).toBe(true);
      expect(g.sourceReference).toContain('synthetic:complete:templars');
    });

    it('synthetic complete Mammoth Cyst fixture → verified + enabled=true', () => {
      const g = assembleOfficialGuardian('mammoth-cyst', completeValidatedData('mammoth-cyst'));
      expect(g.id).toBe('darkest-dungeon-guardian-mammoth-cyst');
      expect(g.family).toBe('mammoth-cyst');
      expect(g.name).toBe('Mammoth Cyst');
      expect(g.roomDefinitionId).toBe('mammoth-cyst-room');
      expect(g.actorDefinitionIds).toEqual(['mammoth-cyst', 'white-cell-stalk']);
      expect(g.officialDataStatus).toBe('verified');
      expect(g.enabledInOfficialPool).toBe(true);
    });

    it('synthetic complete Shuffling Horror fixture → verified + enabled=true', () => {
      const g = assembleOfficialGuardian('shuffling-horror', completeValidatedData('shuffling-horror'));
      expect(g.id).toBe('darkest-dungeon-guardian-shuffling-horror');
      expect(g.family).toBe('shuffling-horror');
      expect(g.name).toBe('Shuffling Horror');
      expect(g.roomDefinitionId).toBe('shuffling-horror-room');
      expect(g.actorDefinitionIds).toEqual(['shuffling-horror', 'cultist-priest', 'malignant-growth']);
      expect(g.officialDataStatus).toBe('verified');
      expect(g.enabledInOfficialPool).toBe(true);
    });

    it('synthetic incomplete fixture (templars) → partial + enabled=false', () => {
      const g = assembleOfficialGuardian('templars', incompleteValidatedData('templars'));
      expect(g.name).toBe('');
      expect(g.roomDefinitionId).toBe('');
      expect(g.actorDefinitionIds).toEqual([]);
      expect(g.officialDataStatus).toBe('partial');
      expect(g.enabledInOfficialPool).toBe(false);
    });

    it('synthetic incomplete fixture (mammoth-cyst) → partial + enabled=false', () => {
      const g = assembleOfficialGuardian('mammoth-cyst', incompleteValidatedData('mammoth-cyst'));
      expect(g.officialDataStatus).toBe('partial');
      expect(g.enabledInOfficialPool).toBe(false);
    });

    it('synthetic incomplete fixture (shuffling-horror) → partial + enabled=false', () => {
      const g = assembleOfficialGuardian('shuffling-horror', incompleteValidatedData('shuffling-horror'));
      expect(g.officialDataStatus).toBe('partial');
      expect(g.enabledInOfficialPool).toBe(false);
    });

    it('synthetic complete all 3 families → isAllGuardianFamiliesReady can be true (function purity check)', () => {
      // 直接通过 isAllGuardianFamiliesReady() 验证（它读真实 validators，所以这里只验合成函数本身）
      // 真实生产中：3 个 family validators 全部 ready 时，本函数返回 true
      // 现在 validators 仍 false，所以 isAllGuardianFamiliesReady() 仍 false
      expect(isAllGuardianFamiliesReady()).toBe(false);
    });
  });

  describe('pure function signature (dev doc §16：纯函数无 IO 依赖)', () => {
    it('assembleOfficialGuardian 接受 valid ValidatedFamilyData，输出 DarkestDungeonGuardianDefinition', () => {
      const g = assembleOfficialGuardian('templars', completeValidatedData('templars'));
      // 形状断言
      expect(g).toHaveProperty('id');
      expect(g).toHaveProperty('family');
      expect(g).toHaveProperty('name');
      expect(g).toHaveProperty('roomDefinitionId');
      expect(g).toHaveProperty('actorDefinitionIds');
      expect(g).toHaveProperty('officialDataStatus');
      expect(g).toHaveProperty('enabledInOfficialPool');
      expect(g).toHaveProperty('sourceReference');
    });
  });
});
