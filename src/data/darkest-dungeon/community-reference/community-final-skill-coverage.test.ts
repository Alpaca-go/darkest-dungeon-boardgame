import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY } from './community-final-skill-source-inventory';
import {
  COMMUNITY_FINAL_SKILL_COVERAGE,
  communityFinalSkillCoverageReport,
  extractTestBody,
} from './community-final-skill-coverage';
import { COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';

const productionFile = readFileSync('src/data/darkest-dungeon/community-reference/community-final-production.test.ts', 'utf8');
const saveReplayFile = readFileSync('src/data/darkest-dungeon/community-reference/community-final-encounter-save-replay.test.ts', 'utf8');
const combatFile = readFileSync('src/game-engine/campaign/act-four/community-final-combat.ts', 'utf8');

const coverageFiles = { productionTestFile: productionFile, saveReplayTestFile: saveReplayFile };

describe('Community Final skill coverage contract', () => {
  it('requiredSourceInventory === implemented: every source-complete leaf has a runtime path', () => {
    const report = communityFinalSkillCoverageReport(coverageFiles);
    expect(report.helperDirect).toEqual([]);
    expect(report.uncoveredSource).toEqual([]);
    expect(report.required).toEqual(report.implemented);
    expect(combatFile).toContain('export function runCommunityFinalFormTurn');
  });

  it('WP-3: production proof requires the real Final production seam, not metadata-only assertions', () => {
    const report = communityFinalSkillCoverageReport(coverageFiles);
    for (const proof of report.proofs) {
      if (!proof.productionBodyFound) continue;
      // 任何包含真实 seam 的 body 不得再引用 source inventory 作为证明。
      if (proof.productionSeamPresent) {
        expect(proof.productionMetadataOnly, `${proof.key} must not mix production seam with metadata self-proof`).toBe(false);
      }
    }
    // metadata-only 反例必须被 contract 识别（R2 false-green 不再计入）。
    const puncture = report.proofs.find((proof) => proof.key === 'heart-of-darkness:puncture')!;
    const dissolution = report.proofs.find((proof) => proof.key === 'heart-of-darkness:dissolution')!;
    const blockerActive = COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED');
    if (blockerActive && puncture.productionMetadataOnly) {
      // 修复期：metadata-only 测试存在时必须被排除在 productionTested 之外。
      expect(puncture.proven).toBe(false);
      expect(dissolution.proven).toBe(false);
    }
  });

  it('WP-3/WP-19: coverage closure and FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED are strict mutex', () => {
    const report = communityFinalSkillCoverageReport(coverageFiles);
    const blockerActive = COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED');
    // 两种 false-green 都在这里失败：
    //   blocker 打开但 report 声称关闭（metadata-only 计入）；
    //   blocker 关闭但 report 未真正关闭（缺真实 proof）。
    expect(report.equal).toBe(!blockerActive);
    if (blockerActive) {
      expect(report.missingProofs.length).toBeGreaterThan(0);
    }
  });

  it('every source-complete leaf binds production turn runtime and save/replay proof ids', () => {
    expect(COMMUNITY_FINAL_SKILL_COVERAGE).toHaveLength(COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.length);
    for (const entry of COMMUNITY_FINAL_SKILL_COVERAGE) {
      expect(entry.sourceComplete).toBe(true);
      expect(entry.productionEntryType).toBe('final-form-turn');
      expect(entry.runtimeImplementation).toBe('runCommunityFinalFormTurn');
      expect(entry.saveReplayProofId).toMatch(/^FR-SR-\d+$/);
      expect(entry.productionTestId).not.toMatch(/performXXXHelper|helper-direct|finalReady\(/);
    }
  });

  it('extractTestBody parses real bodies and rejects unknown ids', () => {
    const body = extractTestBody(productionFile, 'P-final-ancestor-first-form-time-heals-all');
    expect(body).toBeTruthy();
    expect(body!).toContain('runCommunityFinalFormTurn(');
    expect(extractTestBody(productionFile, 'P-final-does-not-exist')).toBeNull();
  });
});
