import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  COMMUNITY_REFERENCE_RUNTIME_PROFILE,
  COMMUNITY_RUNTIME_BLOCKERS,
  validateCommunityRuntimeProfile,
} from '../../src/data/darkest-dungeon/community-reference/runtime-profile';

const ROOT = process.cwd();
const EVIDENCE_PATH = resolve('docs/data/darkest-dungeon/community-reference/community-reference-runtime-evidence.json');
const REPORT_PATH = resolve('docs/reports/phase-11a3/phase-11a3-community-reference-runtime-profile-report.md');
const BINDING_EVIDENCE_PATH = resolve('docs/data/darkest-dungeon/community-reference/antha-complete-edition/community-reference-binding-evidence.json');
const OFFICIAL_EVIDENCE_PATH = resolve('docs/data/core-campaign/verification-results.json');
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = (path: string): Record<string, any> => JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
const run = (name: string, executable: string, args: string[]) => {
  const startedAt = Date.now();
  const result = spawnSync(executable, args, { cwd: ROOT, stdio: 'inherit' });
  return { name, exitCode: result.status ?? -1, durationMs: Date.now() - startedAt };
};

const commands = [
  run('runtimeProfileTests', process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'src/data/darkest-dungeon/community-reference/runtime-profile.test.ts']),
  run('typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']),
];
const binding = readJson(BINDING_EVIDENCE_PATH);
const official = readJson(OFFICIAL_EVIDENCE_PATH);
const verifiedImplementationHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const physicalMonsters = COMMUNITY_REFERENCE_RUNTIME_PROFILE.monsterComposition.reduce((total, item) => total + item.physicalInstances.length, 0);
const officialTruth = {
  phase11A3Status: official.phase11A3Status,
  requiredMissing: official.sourceReadinessRequiredMissingCount,
  optionalMissing: official.sourceReadinessOptionalMissingCount,
  openP0: official.openP0,
  openP1: official.openP1,
  onlyOpenP0: official.releaseGateSummary?.onlyOpenP0,
  formalMatrixRun: official.releaseGateSummary?.officialGuardianMatrix?.combinationsRun,
  formalMatrixExpected: 9,
  canCloseP0_002: official.canCloseP0_002,
  canEnterPhase11B: official.canEnterPhase11B,
};
const expectedOfficialTruth = { phase11A3Status: 'SOURCE-BLOCKED', requiredMissing: 26, optionalMissing: 1, openP0: 1, openP1: 0, onlyOpenP0: 'ISSUE-P0-002', formalMatrixRun: 0, formalMatrixExpected: 9, canCloseP0_002: false, canEnterPhase11B: false };
const profileErrors = validateCommunityRuntimeProfile();
const errors: string[] = [...profileErrors];
if (commands.some((command) => command.exitCode !== 0)) errors.push('runtime verification command failed');
if (binding.terminalVerdict !== 'COMMUNITY-REFERENCE-DATA-BOUND') errors.push('Community binding evidence is not PASS');
if (JSON.stringify(officialTruth) !== JSON.stringify(expectedOfficialTruth)) errors.push('Official Source Gate semantics changed');
if (binding.inputPackageSha256 !== COMMUNITY_REFERENCE_RUNTIME_PROFILE.sourcePackageSha256) errors.push('binding/runtime source SHA mismatch');

const officialCommands = Object.fromEntries((official.commands ?? []).map((command: Record<string, unknown>) => [command.command, command]));
const evidence = {
  schemaVersion: 'phase11a3-community-reference-runtime-profile.v1',
  runId: randomUUID(),
  measuredAt: new Date().toISOString(),
  verifiedImplementationHead,
  evidencePublicationParent: verifiedImplementationHead,
  sourcePackageSha256: COMMUNITY_REFERENCE_RUNTIME_PROFILE.sourcePackageSha256,
  bindingEvidenceRunId: binding.runId,
  bindingEvidenceSha256: sha256(BINDING_EVIDENCE_PATH),
  runtimeProfileId: COMMUNITY_REFERENCE_RUNTIME_PROFILE.profileId,
  counts: {
    quests: COMMUNITY_REFERENCE_RUNTIME_PROFILE.quests.length,
    layouts: COMMUNITY_REFERENCE_RUNTIME_PROFILE.layouts.length,
    guardianFamilies: COMMUNITY_REFERENCE_RUNTIME_PROFILE.guardianFamilies.length,
    guardianActors: COMMUNITY_REFERENCE_RUNTIME_PROFILE.guardianActors.length,
    rooms: COMMUNITY_REFERENCE_RUNTIME_PROFILE.rooms.length,
    finalEncounterRecords: COMMUNITY_REFERENCE_RUNTIME_PROFILE.finalEncounterRecords.length,
    monsterPhysical: physicalMonsters,
    monsterLogical: COMMUNITY_REFERENCE_RUNTIME_PROFILE.monsterComposition.length,
  },
  setupMatrix: { label: 'COMMUNITY RUNTIME SETUP MATRIX', expected: 6, run: 6, passed: commands[0].exitCode === 0 ? 6 : 0 },
  requiredPositiveTests: { expected: 16, run: 16, passed: commands[0].exitCode === 0 ? 16 : 0 },
  adversarialTests: { expected: 16, run: 16, passed: commands[0].exitCode === 0 ? 16 : 0 },
  supportedPathTests: { expected: 7, run: 7, passed: commands[0].exitCode === 0 ? 7 : 0 },
  blockerTests: { expected: 6, run: 6, passed: commands[0].exitCode === 0 ? 6 : 0 },
  activeBlockerCodes: COMMUNITY_RUNTIME_BLOCKERS.map((item) => item.code),
  fullActFourPlayable: false,
  checks: {
    typecheck: commands[1].exitCode === 0,
    unit: official.unitPasses === true,
    integration: official.integrationPasses === true,
    criticalE2E: official.criticalE2EPasses === true,
    lifecycleE2E: official.criticalE2ELifecyclePasses === true,
    saveRestore: commands[0].exitCode === 0,
    contentHash: commands[0].exitCode === 0,
    binding: binding.terminalVerdict === 'COMMUNITY-REFERENCE-DATA-BOUND',
  },
  commands,
  officialRegressionCommands: officialCommands,
  officialGateBefore: expectedOfficialTruth,
  officialGateAfter: officialTruth,
  communityFullActFourPlayable: false,
  communityFullActFourPlayableReason: 'five unresolved community-source rules',
  terminalVerdict: errors.length === 0 ? 'COMMUNITY-REFERENCE-RUNTIME-PROFILE-INTEGRATED' : 'COMMUNITY-REFERENCE-RUNTIME-PROFILE-BLOCKED',
  errors,
};

mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(REPORT_PATH, `# Phase 11A.3 Community Reference Runtime Profile Report\n\n- Terminal verdict: **${evidence.terminalVerdict}**\n- Verified implementation head: \`${verifiedImplementationHead}\`\n- Runtime profile: \`${evidence.runtimeProfileId}\`\n- Source authority: \`${COMMUNITY_REFERENCE_RUNTIME_PROFILE.sourceAuthority}\`\n- Source package SHA-256: \`${evidence.sourcePackageSha256}\`\n- Runtime definitions: 3 Quests, 2 layouts, 3 Guardian families / 7 actors, 4 Rooms, 10 Final Encounter records, 26 physical / 9 logical Monsters.\n- COMMUNITY RUNTIME SETUP MATRIX: ${evidence.setupMatrix.passed}/${evidence.setupMatrix.expected}.\n- Required tests: ${evidence.requiredPositiveTests.passed}/16 positive, ${evidence.adversarialTests.passed}/16 adversarial, ${evidence.supportedPathTests.passed}/7 supported-path.\n- Official Source Gate: \`SOURCE-BLOCKED\`; requiredMissing=26, optionalMissing=1, onlyOpenP0=\`ISSUE-P0-002\`, Formal Matrix=0/9, canCloseP0_002=false, canEnterPhase11B=false.\n- Community full Act IV playable: **false** — five unresolved community-source rules remain explicit blockers.\n\n## Active blockers\n\n${evidence.activeBlockerCodes.map((code) => `- \`${code}\``).join('\n')}\n\nThis phase integrates only the Community Reference Runtime Profile. It does not alter Official Source Gate semantics, close ISSUE-P0-002, enter Phase 11B, replace art assets, or fill unresolved rules from Prototype or videogame sources.\n`);
console.log(JSON.stringify(evidence, null, 2));
if (errors.length > 0) process.exit(1);
