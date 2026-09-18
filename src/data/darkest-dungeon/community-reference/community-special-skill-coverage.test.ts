import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES } from '../../../game-engine/campaign/act-four/community-guardian-special-skills';
import { requirement } from './normalized';
import {
  COMMUNITY_GUARDIAN_SKILL_COVERAGE,
  communityGuardianSpecialSkillCoverageReport,
} from './special-skill-coverage';

const productionFile = readFileSync(
  'src/data/darkest-dungeon/community-reference/community-guardian-special-skill.test.ts',
  'utf8',
);

describe('Community Guardian special-skill coverage contract (WP-9)', () => {
  it('implemented === productionTested === sourceInventory', () => {
    const report = communityGuardianSpecialSkillCoverageReport();
    expect(report.implemented).toEqual(Object.keys(COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES).sort());
    expect(report.productionTested).toEqual(report.implemented);
    expect(report.sourceInventory).toEqual(report.implemented);
    expect(report.coveredSourceNames).toEqual(report.uniqueSourceSkills);
    expect(report.equal).toBe(true);
  });

  it('every coverage entry binds a real corpus skill and a named production test', () => {
    expect(COMMUNITY_GUARDIAN_SKILL_COVERAGE).toHaveLength(17);
    for (const entry of COMMUNITY_GUARDIAN_SKILL_COVERAGE) {
      expect(entry.localSkillId in COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES).toBe(true);
      const skills = requirement(entry.requirementId).fields.skillIds.value as Array<{ sourceLocalSkillId: string; printedName: string }>;
      expect(skills.some((skill) => skill.sourceLocalSkillId === entry.localSkillId && skill.printedName === entry.sourceSkillName)).toBe(true);
      expect(productionFile).toContain(`it('${entry.productionTestId}'`);
    }
  });
});
