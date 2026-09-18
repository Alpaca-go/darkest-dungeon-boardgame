/**
 * Phase 11A.4R1 WP-9：Guardian Special Skill coverage contract。
 *
 * 关闭 `GUARDIAN_SPECIAL_SKILL_ENGINE_UNSUPPORTED` 的条件：
 * implemented (LEAVES keys) === productionTested === sourceInventory (dossier leafInventory)。
 */
import { COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES } from '../../../game-engine/campaign/act-four/community-guardian-special-skills';
import { COMMUNITY_SOURCE_BLOCKER_RESOLUTION } from './source-resolution';

export interface CommunityGuardianSkillCoverageEntry {
  localSkillId: keyof typeof COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES;
  /** Normalized requirement that owns the printed skill. */
  requirementId: string;
  /** Exact `it('...')` title in community-guardian-special-skill.test.ts. */
  productionTestId: string;
  /** Dossier leafInventory skill name (Title Case). */
  sourceSkillName: string;
}

export const COMMUNITY_GUARDIAN_SKILL_COVERAGE: readonly CommunityGuardianSkillCoverageEntry[] = [
  { localSkillId: 'torment', requirementId: 'tierB-templars-impaler', productionTestId: 'Torment deals damage on the production Monster Turn path', sourceSkillName: 'Torment' },
  { localSkillId: 'body-slam', requirementId: 'tierB-templars-impaler', productionTestId: 'Body Slam moves the Hero into the mapped Pit Area (not event-only)', sourceSkillName: 'Body Slam' },
  { localSkillId: 'revelation', requirementId: 'tierB-templars-impaler', productionTestId: 'Revelation applies +2 Stress on the production Monster Turn path', sourceSkillName: 'Revelation' },
  { localSkillId: 'stinger-shot', requirementId: 'tierB-templars-warlord', productionTestId: 'Stinger Shot applies Blight 3/3 and Debuff 2 turns together', sourceSkillName: 'Stinger Shot' },
  { localSkillId: 'bulging-gaze', requirementId: 'tierB-mammoth-cyst', productionTestId: 'Bulging Gaze applies Debuff 1 and Stress +1 on hit', sourceSkillName: 'Bulging Gaze' },
  { localSkillId: 'digestion', requirementId: 'tierB-mammoth-cyst', productionTestId: 'Digestion applies Blight 3 on the battle Hero via the formal condition pipeline', sourceSkillName: 'Digestion' },
  { localSkillId: 'revivify', requirementId: 'tierB-mammoth-cyst', productionTestId: 'Revivify heals self by 15 and never exceeds max HP', sourceSkillName: 'Revivify' },
  { localSkillId: 'reconstitute', requirementId: 'tierB-white-cell-stalk', productionTestId: 'Reconstitute heals Mammoth Cyst by 14 and applies Buff 2 turns', sourceSkillName: 'Reconstitute' },
  { localSkillId: 'displace', requirementId: 'tierB-white-cell-stalk', productionTestId: 'Displace applies Debuff 2 and starts Room 11 Push 2', sourceSkillName: 'Displace' },
  { localSkillId: 'teleport', requirementId: 'tierB-white-cell-stalk', productionTestId: 'Teleport applies Stress +2 then Room 11 d10 relocation', sourceSkillName: 'Teleport' },
  { localSkillId: 'lacerate', requirementId: 'tierB-shuffling-horror', productionTestId: 'Lacerate applies Bleed 3/3 on the production Monster Turn path', sourceSkillName: 'Lacerate' },
  { localSkillId: 'undulations', requirementId: 'tierB-shuffling-horror', productionTestId: 'Undulations production Monster Turn redistributes living Heroes onto Stance slots', sourceSkillName: 'Undulations' },
  { localSkillId: 'echoing-disassembly', requirementId: 'tierB-shuffling-horror', productionTestId: 'Echoing Disassembly is forced when Monster Stance slots are not filled (not a d10 skill)', sourceSkillName: 'Echoing Disassembly' },
  { localSkillId: 'death-lash', requirementId: 'tierB-cultist-priest', productionTestId: 'Death Lash applies Debuff 1 and Stress +1 on hit', sourceSkillName: 'Death Lash' },
  { localSkillId: 'the-finger', requirementId: 'tierB-cultist-priest', productionTestId: 'The Finger marked bonus enters the damage pipeline', sourceSkillName: 'The Finger' },
  { localSkillId: 'maul-the-flesh', requirementId: 'tierB-malignant-growth', productionTestId: 'Maul the Flesh applies Bleed 2/3 on hit', sourceSkillName: 'Maul the Flesh' },
  { localSkillId: 'daze-the-mind', requirementId: 'tierB-malignant-growth', productionTestId: 'Daze the Mind applies Stun 2 turns on hit', sourceSkillName: 'Daze the Mind' },
] as const;

function dossierLeafInventory(): Array<{ actor: string; skill: string; sourceComplete: boolean }> {
  const target = COMMUNITY_SOURCE_BLOCKER_RESOLUTION.targets.find(
    (entry) => entry.blockerCode === 'GUARDIAN_SPECIAL_SKILL_ENGINE_UNSUPPORTED',
  );
  const inventory = (target?.resolvedValue as { leafInventory?: Array<{ actor: string; skill: string; sourceComplete: boolean }> } | null)?.leafInventory;
  if (!inventory) throw new Error('Missing GUARDIAN_SPECIAL_SKILL leafInventory in source-blocker-resolution dossier');
  return inventory;
}

export function communityGuardianSpecialSkillCoverageReport() {
  const implemented = Object.keys(COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES).sort();
  const productionTested = COMMUNITY_GUARDIAN_SKILL_COVERAGE.map((entry) => entry.localSkillId).sort();
  const sourceNames = new Set(
    dossierLeafInventory()
      .filter((leaf) => leaf.sourceComplete)
      .map((leaf) => leaf.skill),
  );
  const sourceInventory = COMMUNITY_GUARDIAN_SKILL_COVERAGE
    .filter((entry) => sourceNames.has(entry.sourceSkillName))
    .map((entry) => entry.localSkillId)
    .sort();
  // Torment / Revelation appear twice in dossier (Impaler + Warlord); coverage is by localSkillId.
  const uniqueSourceSkills = [...new Set(
    dossierLeafInventory().filter((leaf) => leaf.sourceComplete).map((leaf) => leaf.skill),
  )].sort();
  const coveredSourceNames = COMMUNITY_GUARDIAN_SKILL_COVERAGE.map((entry) => entry.sourceSkillName).sort();

  return {
    implemented,
    productionTested,
    sourceInventory,
    uniqueSourceSkills,
    coveredSourceNames,
    equal:
      JSON.stringify(implemented) === JSON.stringify(productionTested)
      && JSON.stringify(implemented) === JSON.stringify(sourceInventory)
      && JSON.stringify(uniqueSourceSkills) === JSON.stringify(coveredSourceNames),
  };
}
