import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  COMMUNITY_REFERENCE_RUNTIME_PROFILE,
  COMMUNITY_RUNTIME_BLOCKERS,
  validateCommunityRuntimeProfile,
} from '../../src/data/darkest-dungeon/community-reference/runtime-profile';
import {
  COMMUNITY_RUNTIME_FIELD_COVERAGE,
  runtimeFieldCoverageTotals,
  validateCommunityRuntimeFieldCoverage,
} from '../../src/data/darkest-dungeon/community-reference/runtime-field-coverage';

type CommandResult = { name: string; exitCode: number; durationMs: number };
type StructuredResult = CommandResult & { expected: number; discovered: number; run: number; passed: number; failed: number; skipped: number; todo: number };

const ROOT = process.cwd();
const EVIDENCE_PATH = resolve('docs/data/darkest-dungeon/community-reference/community-reference-runtime-evidence.json');
const COVERAGE_PATH = resolve('docs/data/darkest-dungeon/community-reference/community-runtime-field-coverage.json');
const REPORT_PATH = resolve('docs/reports/phase-11a3/phase-11a3-community-reference-runtime-profile-report.md');
const BINDING_EVIDENCE_PATH = resolve('docs/data/darkest-dungeon/community-reference/antha-complete-edition/community-reference-binding-evidence.json');
const OFFICIAL_EVIDENCE_PATH = resolve('docs/data/core-campaign/verification-results.json');
const scratch = mkdtempSync(resolve(tmpdir(), 'phase11a3-runtime-acceptance-'));
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = (path: string): Record<string, any> => JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;

function run(name: string, executable: string, args: string[], env?: NodeJS.ProcessEnv): CommandResult {
  const startedAt = Date.now();
  const result = spawnSync(executable, args, { cwd: ROOT, env: env ?? process.env, stdio: 'inherit' });
  return { name, exitCode: result.status ?? -1, durationMs: Date.now() - startedAt };
}

function structuredVitest(name: string, file: string, expected: number): StructuredResult {
  const output = resolve(scratch, `${name}.json`);
  const command = run(name, process.execPath, ['node_modules/vitest/vitest.mjs', 'run', file, '--reporter=json', `--outputFile=${output}`]);
  let assertions: Record<string, any>[] = [];
  try {
    const report = readJson(output);
    assertions = (report.testResults ?? []).flatMap((suite: Record<string, any>) => suite.assertionResults ?? []);
  } catch { /* command failure is represented by an empty discovery set */ }
  const count = (statuses: string[]) => assertions.filter((test) => statuses.includes(test.status)).length;
  const passed = count(['passed']);
  const failed = count(['failed']);
  const skipped = count(['pending', 'skipped', 'disabled']);
  const todo = count(['todo']);
  return { ...command, expected, discovered: assertions.length, run: passed + failed, passed, failed, skipped, todo };
}

function structuredE2e(expected: number): StructuredResult {
  const output = resolve(scratch, 'community-e2e.json');
  const command = run('communityE2E', process.execPath, ['scripts/e2e/run-community-reference-e2e.mjs'], {
    ...process.env,
    COMMUNITY_E2E_JSON_PATH: output,
    PLAYWRIGHT_JSON_OUTPUT_FILE: output,
  });
  const results: string[] = [];
  try {
    const visit = (node: Record<string, any>): void => {
      for (const spec of node.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? []) results.push(result.status);
      for (const suite of node.suites ?? []) visit(suite);
    };
    visit(readJson(output));
  } catch { /* command failure is represented by an empty discovery set */ }
  const passed = results.filter((status) => status === 'passed').length;
  const failed = results.filter((status) => ['failed', 'timedOut', 'interrupted'].includes(status)).length;
  const skipped = results.filter((status) => status === 'skipped').length;
  return { ...command, expected, discovered: results.length, run: passed + failed, passed, failed, skipped, todo: 0 };
}

const inputIndex = process.argv.indexOf('--input');
const canonicalInput = inputIndex >= 0 ? process.argv[inputIndex + 1] : undefined;
const runtimeRelevantFields = COMMUNITY_RUNTIME_FIELD_COVERAGE.filter((entry) => entry.runtimeClassification === 'consumed' || entry.runtimeClassification.endsWith('blocker')).length;
const structured = [
  structuredVitest('validators', 'src/data/darkest-dungeon/community-reference/community-runtime-validator.test.ts', 3),
  structuredVitest('setup', 'src/data/darkest-dungeon/community-reference/community-runtime-setup.test.ts', 6),
  structuredVitest('production', 'src/data/darkest-dungeon/community-reference/community-runtime-production.test.ts', 6),
  structuredVitest('guardian', 'src/data/darkest-dungeon/community-reference/community-runtime-guardian.test.ts', 16),
  structuredVitest('excavation', 'src/data/darkest-dungeon/community-reference/community-runtime-excavation.test.ts', 6),
  structuredVitest('finalEncounter', 'src/data/darkest-dungeon/community-reference/community-runtime-final.test.ts', 12),
  structuredVitest('monster', 'src/data/darkest-dungeon/community-reference/community-runtime-monster.test.ts', 7),
  structuredVitest('saveReplay', 'src/data/darkest-dungeon/community-reference/community-runtime-save-replay.test.ts', 12),
  structuredVitest('traceability', 'src/data/darkest-dungeon/community-reference/community-runtime-traceability.test.ts', runtimeRelevantFields + 2),
  structuredVitest('adversarial', 'src/data/darkest-dungeon/community-reference/community-runtime-adversarial.test.ts', 20),
  structuredE2e(3),
];
const commands: CommandResult[] = [
  run('typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']),
  run('build', process.execPath, ['node_modules/vite/bin/vite.js', 'build']),
  run('officialSourceGateRegression', process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/audit/verify-phase11a3-source-gate.ts']),
  ...(canonicalInput ? [run('bindingRegression', process.execPath, ['node_modules/vite-node/vite-node.mjs', 'scripts/audit/verify-community-reference-binding.ts', '--input', canonicalInput])] : []),
];

const binding = readJson(BINDING_EVIDENCE_PATH);
const official = readJson(OFFICIAL_EVIDENCE_PATH);
const verifiedImplementationHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
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
const errors = [...validateCommunityRuntimeProfile(), ...validateCommunityRuntimeFieldCoverage()];
for (const group of structured) {
  if (group.exitCode !== 0 || group.discovered !== group.expected || group.run !== group.expected || group.passed !== group.expected || group.failed !== 0 || group.skipped !== 0 || group.todo !== 0) errors.push(`${group.name} structured count mismatch`);
}
if (commands.some((command) => command.exitCode !== 0)) errors.push('runtime verification command failed');
if (!canonicalInput) errors.push('canonical --input is required for fresh binding regression');
if (binding.terminalVerdict !== 'COMMUNITY-REFERENCE-DATA-BOUND') errors.push('Community binding evidence is not PASS');
if (JSON.stringify(officialTruth) !== JSON.stringify(expectedOfficialTruth)) errors.push('Official Source Gate semantics changed');
if (binding.inputPackageSha256 !== COMMUNITY_REFERENCE_RUNTIME_PROFILE.sourcePackageSha256) errors.push('binding/runtime source SHA mismatch');

const physicalMonsters = COMMUNITY_REFERENCE_RUNTIME_PROFILE.monsterComposition.reduce((total, item) => total + item.physicalInstances.length, 0);
const coverageTotals = runtimeFieldCoverageTotals() as ReturnType<typeof runtimeFieldCoverageTotals> & Record<string, number>;
const evidence = {
  schemaVersion: 'phase11a3-community-reference-runtime-final-acceptance.v1',
  runId: randomUUID(),
  measuredAt: new Date().toISOString(),
  verifiedImplementationHead,
  evidencePublicationParent: verifiedImplementationHead,
  sourcePackageSha256: COMMUNITY_REFERENCE_RUNTIME_PROFILE.sourcePackageSha256,
  normalizedRequirementsSha256: COMMUNITY_REFERENCE_RUNTIME_PROFILE.artifactIdentities.normalizedRequirementsSha256,
  sourceBindingManifestSha256: COMMUNITY_REFERENCE_RUNTIME_PROFILE.artifactIdentities.sourceBindingManifestSha256,
  bindingEvidenceRunId: binding.runId,
  bindingEvidenceSha256: sha256(BINDING_EVIDENCE_PATH),
  runtimeProfileId: COMMUNITY_REFERENCE_RUNTIME_PROFILE.profileId,
  runtimeAdapterVersion: COMMUNITY_REFERENCE_RUNTIME_PROFILE.runtimeAdapterVersion,
  contentHash: COMMUNITY_REFERENCE_RUNTIME_PROFILE.contentHash,
  counts: { quests: COMMUNITY_REFERENCE_RUNTIME_PROFILE.quests.length, layouts: COMMUNITY_REFERENCE_RUNTIME_PROFILE.layouts.length, guardianFamilies: COMMUNITY_REFERENCE_RUNTIME_PROFILE.guardianFamilies.length, guardianActors: COMMUNITY_REFERENCE_RUNTIME_PROFILE.guardianActors.length, rooms: COMMUNITY_REFERENCE_RUNTIME_PROFILE.rooms.length, finalEncounterRecords: COMMUNITY_REFERENCE_RUNTIME_PROFILE.finalEncounterRecords.length, monsterPhysical: physicalMonsters, monsterLogical: COMMUNITY_REFERENCE_RUNTIME_PROFILE.monsterComposition.length },
  fieldCoverage: coverageTotals,
  testGroups: Object.fromEntries(structured.map((group) => [group.name, group])),
  blockerInventory: { sourceLevel: COMMUNITY_RUNTIME_BLOCKERS.filter((item) => item.classification === 'source-level').length, runtimeOnly: COMMUNITY_RUNTIME_BLOCKERS.filter((item) => item.classification === 'runtime-only').length, total: COMMUNITY_RUNTIME_BLOCKERS.length },
  activeBlockerCodes: COMMUNITY_RUNTIME_BLOCKERS.map((item) => item.code),
  commands,
  officialGateBefore: expectedOfficialTruth,
  officialGateAfter: officialTruth,
  communityFullActFourPlayable: false,
  communityFullActFourPlayableReason: `${COMMUNITY_RUNTIME_BLOCKERS.length} active source/runtime blockers`,
  terminalVerdict: errors.length === 0 ? 'COMMUNITY-REFERENCE-RUNTIME-ACCEPTED' : 'COMMUNITY-REFERENCE-RUNTIME-FINAL-ACCEPTANCE-BLOCKED',
  errors,
};

mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(COVERAGE_PATH, `${JSON.stringify({ schemaVersion: 'phase11a3-community-runtime-field-coverage.v1', generatedAt: evidence.measuredAt, verifiedImplementationHead, totals: coverageTotals, entries: COMMUNITY_RUNTIME_FIELD_COVERAGE }, null, 2)}\n`);
writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
const groupSummary = structured.map((group) => `- ${group.name}: ${group.passed}/${group.expected} passed; discovered=${group.discovered}, run=${group.run}, failed=${group.failed}, skipped=${group.skipped}, todo=${group.todo}.`).join('\n');
writeFileSync(REPORT_PATH, `# Phase 11A.3 Community Reference Runtime Final Acceptance Report\n\n- Terminal verdict: **${evidence.terminalVerdict}**\n- Verified implementation head: \`${verifiedImplementationHead}\`\n- Runtime profile: \`${evidence.runtimeProfileId}\`\n- Source package SHA-256: \`${evidence.sourcePackageSha256}\`\n- Content hash: \`${evidence.contentHash}\`\n- Field coverage: ${coverageTotals.total} total; ${coverageTotals.consumed} consumed, ${coverageTotals['explicit-source-blocker']} source-blocked, ${coverageTotals['engine-unsupported-blocker']} engine-blocked, ${coverageTotals['display-only']} display-only, ${coverageTotals['not-runtime-relevant']} not-runtime-relevant, ${coverageTotals.unclassified} unclassified.\n\n## Exact test counts\n\n${groupSummary}\n\n- Active blockers: ${evidence.blockerInventory.sourceLevel} source-level + ${evidence.blockerInventory.runtimeOnly} runtime-only = ${evidence.blockerInventory.total}.\n- Official Source Gate: \`SOURCE-BLOCKED\`; requiredMissing=26, optionalMissing=1, onlyOpenP0=\`ISSUE-P0-002\`, Formal Matrix=0/9, canCloseP0_002=false, canEnterPhase11B=false.\n- Community full Act IV playable: **false**.\n\n## Active blockers\n\n${evidence.activeBlockerCodes.map((code) => `- \`${code}\``).join('\n')}\n\nThis acceptance does not alter Official Source Gate semantics, close ISSUE-P0-002, enter Phase 11B, replace art assets, or fill unresolved rules from Prototype or videogame sources.\n`);
rmSync(scratch, { recursive: true, force: true });
console.log(JSON.stringify(evidence, null, 2));
if (errors.length > 0) process.exit(1);
