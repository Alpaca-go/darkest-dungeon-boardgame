import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES } from '../../../game-engine/campaign/act-four/community-guardian-special-skills';
import { requirement } from './normalized';
import {
  COMMUNITY_GUARDIAN_SKILL_COVERAGE,
  communityGuardianSpecialSkillCoverageReport,
  type CommunityGuardianSkillProductionEntry,
} from './special-skill-coverage';

const productionFile = readFileSync(
  'src/data/darkest-dungeon/community-reference/community-guardian-special-skill.test.ts',
  'utf8',
);
const combatFile = readFileSync(
  'src/game-engine/campaign/act-four/community-guardian-combat.ts',
  'utf8',
);
const mammothFile = readFileSync(
  'src/game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action.ts',
  'utf8',
);
const saveReplayFile = readFileSync(
  'src/data/darkest-dungeon/community-reference/community-guardian-room-save-replay.test.ts',
  'utf8',
);

const ALLOWED_ENTRY: ReadonlySet<CommunityGuardianSkillProductionEntry> = new Set([
  'monster-turn',
  'monster-turn-forced-ability',
  'mammoth-action',
]);

function testBody(title: string): string {
  const start = productionFile.indexOf(`it('${title}'`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = productionFile.indexOf("\n  it('", start + 1);
  return productionFile.slice(start, next < 0 ? undefined : next);
}

describe('Community Guardian special-skill coverage contract (WP-5 / WP-9)', () => {
  it('implemented === productionTested === sourceInventory without helper-direct', () => {
    const report = communityGuardianSpecialSkillCoverageReport();
    expect(report.helperDirect).toEqual([]);
    expect(report.implemented).toEqual(Object.keys(COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES).sort());
    expect(report.productionTested).toEqual(report.implemented);
    expect(report.sourceInventory).toEqual(report.implemented);
    expect(report.coveredSourceNames).toEqual(report.uniqueSourceSkills);
    expect(report.equal).toBe(true);
  });

  it('every coverage entry binds source semantic, runtime implementation, production test, and entry type', () => {
    expect(COMMUNITY_GUARDIAN_SKILL_COVERAGE).toHaveLength(17);
    expect(combatFile).toContain('export function runCommunityGuardianMonsterTurn');
    expect(mammothFile).toContain('export function executeMammothCystAction');

    for (const entry of COMMUNITY_GUARDIAN_SKILL_COVERAGE) {
      expect(entry.localSkillId in COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES).toBe(true);
      const skills = requirement(entry.requirementId).fields.skillIds.value as Array<{ sourceLocalSkillId: string; printedName: string }>;
      expect(skills.some((skill) => skill.sourceLocalSkillId === entry.localSkillId && skill.printedName === entry.sourceSkillName)).toBe(true);
      expect(ALLOWED_ENTRY.has(entry.productionEntryType)).toBe(true);
      expect(entry.productionEntryType as string).not.toBe('helper-direct');

      const body = testBody(entry.productionTestId);
      expect(body).not.toMatch(/markedBonusDamage\s*\(/);
      expect(body).not.toMatch(/applyCommunityGuardianSpecialSkill\s*\(/);

      if (entry.productionEntryType === 'mammoth-action') {
        expect(entry.runtimeImplementation).toBe('executeMammothCystAction');
        expect(body).toMatch(/executeMammothCystAction\s*\(|attack\s*\(/);
      } else {
        expect(entry.runtimeImplementation).toBe('runCommunityGuardianMonsterTurn');
        expect(body).toMatch(/runMonsterTurn\s*\(|communityAttack\s*\(/);
      }

      if (entry.saveReplayProofId) {
        expect(saveReplayFile).toContain(entry.saveReplayProofId);
      }
    }
  });

  it('pins The Finger / Echoing / Undulations production entry types', () => {
    expect(COMMUNITY_GUARDIAN_SKILL_COVERAGE.find((entry) => entry.localSkillId === 'the-finger')).toMatchObject({
      productionEntryType: 'monster-turn',
      runtimeImplementation: 'runCommunityGuardianMonsterTurn',
    });
    expect(COMMUNITY_GUARDIAN_SKILL_COVERAGE.find((entry) => entry.localSkillId === 'echoing-disassembly')).toMatchObject({
      productionEntryType: 'monster-turn-forced-ability',
    });
    expect(COMMUNITY_GUARDIAN_SKILL_COVERAGE.find((entry) => entry.localSkillId === 'undulations')).toMatchObject({
      productionEntryType: 'monster-turn',
    });
  });
});
