import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY } from './community-final-skill-source-inventory';
import {
  COMMUNITY_FINAL_SKILL_COVERAGE,
  communityFinalSkillCoverageReport,
} from './community-final-skill-coverage';
import { COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';

const productionFile = readFileSync('src/data/darkest-dungeon/community-reference/community-final-production.test.ts', 'utf8');
const saveReplayFile = readFileSync('src/data/darkest-dungeon/community-reference/community-final-encounter-save-replay.test.ts', 'utf8');
const combatFile = readFileSync('src/game-engine/campaign/act-four/community-final-combat.ts', 'utf8');

describe('Community Final skill coverage contract', () => {
  it('requiredSourceInventory === implemented === productionTested without helper-direct', () => {
    const report = communityFinalSkillCoverageReport();
    expect(report.helperDirect).toEqual([]);
    expect(report.uncoveredSource).toEqual([]);
    expect(report.required).toEqual(report.implemented);
    expect(report.required).toEqual(report.productionTested);
    // Phase 11A.4R2A WP-0：修复验收期间 blocker 保持打开；coverage 关闭断言
    // 由 WP-3 强化后的 contract 负责（metadata-only 测试不再计入 productionTested）。
    expect(COMMUNITY_RUNTIME_BLOCKERS.some((blocker) => blocker.code === 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED')).toBe(true);
  });

  it('every source-complete leaf binds production turn runtime and save/replay proof', () => {
    expect(COMMUNITY_FINAL_SKILL_COVERAGE).toHaveLength(COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.length);
    expect(combatFile).toContain('export function runCommunityFinalFormTurn');
    for (const entry of COMMUNITY_FINAL_SKILL_COVERAGE) {
      expect(entry.sourceComplete).toBe(true);
      expect(entry.productionEntryType).toBe('final-form-turn');
      expect(entry.runtimeImplementation).toBe('runCommunityFinalFormTurn');
      expect(productionFile).toContain(entry.productionTestId);
      expect(saveReplayFile).toContain(entry.saveReplayProofId);
      expect(entry.productionTestId).not.toMatch(/performXXXHelper|helper-direct|finalReady\(/);
    }
  });
});
