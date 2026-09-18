/**
 * Phase 11A.4R1A WP-5：Guardian Special Skill coverage contract.
 *
 * 关闭 `GUARDIAN_SPECIAL_SKILL_ENGINE_UNSUPPORTED` 的条件：
 * implemented (LEAVES keys) === productionTested === sourceInventory (dossier leafInventory)，
 * 且每条 coverage 绑定真实 production entry（禁止 helper-direct）。
 */
import { COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES } from '../../../game-engine/campaign/act-four/community-guardian-special-skills';
import { COMMUNITY_SOURCE_BLOCKER_RESOLUTION } from './source-resolution';

export type CommunityGuardianSkillProductionEntry =
  | 'monster-turn'
  | 'monster-turn-forced-ability'
  | 'mammoth-action';

export interface CommunityGuardianSkillCoverageEntry {
  localSkillId: keyof typeof COMMUNITY_GUARDIAN_SPECIAL_SKILL_LEAVES;
  /** Normalized requirement that owns the printed skill. */
  requirementId: string;
  /** Source semantic leaf name (Title Case from dossier). */
  sourceSkillName: string;
  /** Runtime implementation symbol that owns the production path. */
  runtimeImplementation: string;
  /** Exact `it('...')` title proving the production path. */
  productionTestId: string;
  /** Production entry classification — helper-direct is forbidden. */
  productionEntryType: CommunityGuardianSkillProductionEntry;
  /** Dedicated save/replay proof id when one exists; otherwise null. */
  saveReplayProofId: string | null;
}

export const COMMUNITY_GUARDIAN_SKILL_COVERAGE: readonly CommunityGuardianSkillCoverageEntry[] = [
  {
    localSkillId: 'torment',
    requirementId: 'tierB-templars-impaler',
    sourceSkillName: 'Torment',
    runtimeImplementation: 'runCommunityGuardianMonsterTurn',
    productionTestId: 'Torment deals damage on the production Monster Turn path',
    productionEntryType: 'monster-turn',
    saveReplayProofId: null,
  },
  {
    localSkillId: 'body-slam',
    requirementId: 'tierB-templars-impaler',
    sourceSkillName: 'Body Slam',
    runtimeImplementation: 'runCommunityGuardianMonsterTurn',
    productionTestId: 'Body Slam moves the Hero into the mapped Pit Area (not event-only)',
    productionEntryType: 'monster-turn',
    saveReplayProofId: 'SR-R1-01',
  },
  {
    localSkillId: 'revelation',
    requirementId: 'tierB-templars-impaler',
    sourceSkillName: 'Revelation',
    runtimeImplementation: 'runCommunityGuardianMonsterTurn',
    productionTestId: 'Revelation applies +2 Stress on the production Monster Turn path',
    productionEntryType: 'monster-turn',
    saveReplayProofId: null,
  },
  {
    localSkillId: 'stinger-shot',
    requirementId: 'tierB-templars-warlord',
    sourceSkillName: 'Stinger Shot',
    runtimeImplementation: 'runCommunityGuardianMonsterTurn',
    productionTestId: 'Stinger Shot applies Blight 3/3 and Debuff 2 turns together',
    productionEntryType: 'monster-turn',
    saveReplayProofId: null,
  },
  {
    localSkillId: 'bulging-gaze',
    requirementId: 'tierB-mammoth-cyst',
    sourceSkillName: 'Bulging Gaze',
    runtimeImplementation: 'executeMammothCystAction',
    productionTestId: 'Bulging Gaze applies Debuff 1 and Stress +1 on hit',
    productionEntryType: 'mammoth-action',
    saveReplayProofId: null,
  },
  {
    localSkillId: 'digestion',
    requirementId: 'tierB-mammoth-cyst',
    sourceSkillName: 'Digestion',
    runtimeImplementation: 'executeMammothCystAction',
    productionTestId: 'Digestion applies Blight 3 on the battle Hero via the formal condition pipeline',
    productionEntryType: 'mammoth-action',
    saveReplayProofId: null,
  },
  {
    localSkillId: 'revivify',
    requirementId: 'tierB-mammoth-cyst',
    sourceSkillName: 'Revivify',
    runtimeImplementation: 'executeMammothCystAction',
    productionTestId: 'Revivify heals self by 15 and never exceeds max HP',
    productionEntryType: 'mammoth-action',
    saveReplayProofId: null,
  },
  {
    localSkillId: 'reconstitute',
    requirementId: 'tierB-white-cell-stalk',
    sourceSkillName: 'Reconstitute',
    runtimeImplementation: 'executeMammothCystAction',
    productionTestId: 'Reconstitute heals Mammoth Cyst by 14 and applies Buff 2 turns',
    productionEntryType: 'mammoth-action',
    saveReplayProofId: null,
  },
  {
    localSkillId: 'displace',
    requirementId: 'tierB-white-cell-stalk',
    sourceSkillName: 'Displace',
    runtimeImplementation: 'executeMammothCystAction',
    productionTestId: 'Displace applies Debuff 2 and starts Room 11 Push 2',
    productionEntryType: 'mammoth-action',
    saveReplayProofId: null,
  },
  {
    localSkillId: 'teleport',
    requirementId: 'tierB-white-cell-stalk',
    sourceSkillName: 'Teleport',
    runtimeImplementation: 'executeMammothCystAction',
    productionTestId: 'Teleport applies Stress +2 then Room 11 d10 relocation',
    productionEntryType: 'mammoth-action',
    saveReplayProofId: 'SR-R1-03',
  },
  {
    localSkillId: 'lacerate',
    requirementId: 'tierB-shuffling-horror',
    sourceSkillName: 'Lacerate',
    runtimeImplementation: 'runCommunityGuardianMonsterTurn',
    productionTestId: 'Lacerate applies Bleed 3/3 on the production Monster Turn path',
    productionEntryType: 'monster-turn',
    saveReplayProofId: null,
  },
  {
    localSkillId: 'undulations',
    requirementId: 'tierB-shuffling-horror',
    sourceSkillName: 'Undulations',
    runtimeImplementation: 'runCommunityGuardianMonsterTurn',
    productionTestId: 'Undulations production Monster Turn redistributes living Heroes onto Stance slots',
    productionEntryType: 'monster-turn',
    saveReplayProofId: 'SR-R1-04',
  },
  {
    localSkillId: 'echoing-disassembly',
    requirementId: 'tierB-shuffling-horror',
    sourceSkillName: 'Echoing Disassembly',
    runtimeImplementation: 'runCommunityGuardianMonsterTurn',
    productionTestId: 'Echoing Disassembly is forced when Monster Stance slots are not filled (not a d10 skill)',
    productionEntryType: 'monster-turn-forced-ability',
    saveReplayProofId: 'SR-R1-05',
  },
  {
    localSkillId: 'death-lash',
    requirementId: 'tierB-cultist-priest',
    sourceSkillName: 'Death Lash',
    runtimeImplementation: 'runCommunityGuardianMonsterTurn',
    productionTestId: 'Death Lash applies Debuff 1 and Stress +1 on hit',
    productionEntryType: 'monster-turn',
    saveReplayProofId: null,
  },
  {
    localSkillId: 'the-finger',
    requirementId: 'tierB-cultist-priest',
    sourceSkillName: 'The Finger',
    runtimeImplementation: 'runCommunityGuardianMonsterTurn',
    productionTestId: 'The Finger Marked Hero Monster Turn adds exactly +5 damage with Bleed and Stress',
    productionEntryType: 'monster-turn',
    saveReplayProofId: null,
  },
  {
    localSkillId: 'maul-the-flesh',
    requirementId: 'tierB-malignant-growth',
    sourceSkillName: 'Maul the Flesh',
    runtimeImplementation: 'runCommunityGuardianMonsterTurn',
    productionTestId: 'Maul the Flesh applies Bleed 2/3 on hit',
    productionEntryType: 'monster-turn',
    saveReplayProofId: null,
  },
  {
    localSkillId: 'daze-the-mind',
    requirementId: 'tierB-malignant-growth',
    sourceSkillName: 'Daze the Mind',
    runtimeImplementation: 'runCommunityGuardianMonsterTurn',
    productionTestId: 'Daze the Mind applies Stun 2 turns on hit',
    productionEntryType: 'monster-turn',
    saveReplayProofId: null,
  },
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
  const helperDirect = COMMUNITY_GUARDIAN_SKILL_COVERAGE.filter(
    (entry) => (entry.productionEntryType as string) === 'helper-direct',
  );

  return {
    implemented,
    productionTested,
    sourceInventory,
    uniqueSourceSkills,
    coveredSourceNames,
    helperDirect,
    equal:
      JSON.stringify(implemented) === JSON.stringify(productionTested)
      && JSON.stringify(implemented) === JSON.stringify(sourceInventory)
      && JSON.stringify(uniqueSourceSkills) === JSON.stringify(coveredSourceNames)
      && helperDirect.length === 0,
  };
}
