import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { COMMUNITY_RUNTIME_BLOCKERS } from '../../src/data/darkest-dungeon/community-reference/runtime-profile';
import { runtimeFieldCoverageTotals, validateCommunityRuntimeFieldCoverage } from '../../src/data/darkest-dungeon/community-reference/runtime-field-coverage';

const ROOT = process.cwd();
const EVIDENCE = resolve('docs/data/darkest-dungeon/community-reference/community-engine-capability-closure-evidence.json');
const REPORT = resolve('docs/reports/phase-11a3/phase-11a3-community-source-backed-engine-capability-closure-report.md');
const TRIAGE = resolve('docs/data/darkest-dungeon/community-reference/community-engine-blocker-triage.json');
const CLOSED = [
  'GUARDIAN_RESISTANCE_ENGINE_UNSUPPORTED', 'GUARDIAN_CRIT_ENGINE_UNSUPPORTED',
  'QUEST_CARD_PROVISION_POLICY_ENGINE_UNSUPPORTED', 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED',
  'FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED', 'GUARDIAN_VICTORY_POLICY_ENGINE_UNSUPPORTED',
] as const;
const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const intake = argument('--input');
const tts = argument('--tts');
const node = process.execPath;

const commands = [
  ['typecheck', node, ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['capabilityTests', node, ['node_modules/vitest/vitest.mjs', 'run', 'src/data/darkest-dungeon/community-reference/community-engine-capability-closure.test.ts']],
  ['adversarialTests', node, ['node_modules/vitest/vitest.mjs', 'run', 'src/data/darkest-dungeon/community-reference/community-engine-capability-adversarial.test.ts']],
  ['bindingGate', node, ['node_modules/vite-node/vite-node.mjs', 'scripts/audit/verify-community-reference-binding.ts', '--input', intake ?? '']],
  ['runtimeGate', node, ['node_modules/vite-node/vite-node.mjs', 'scripts/audit/verify-community-reference-runtime.ts', '--input', intake ?? '']],
  ['visualGate', node, ['scripts/audit/verify-community-visual-assets.mjs', '--intake', intake ?? '', '--tts', tts ?? '']],
  ['officialSourceGate', node, ['node_modules/vite-node/vite-node.mjs', 'scripts/audit/verify-phase11a3-source-gate.ts']],
] as const;

const results = commands.map(([name, executable, args]) => {
  const started = Date.now();
  const result = spawnSync(executable, args, { cwd: ROOT, stdio: 'inherit' });
  return { name, exitCode: result.status ?? -1, durationMs: Date.now() - started };
});
const triage = JSON.parse(readFileSync(TRIAGE, 'utf8')) as { runtimeOnlyBlockersBefore: number; sourceBackedEngineCount: number; sourceGapCount: number };
const activeCodes = COMMUNITY_RUNTIME_BLOCKERS.map((item) => item.code);
const sourceBlockers = COMMUNITY_RUNTIME_BLOCKERS.filter((item) => item.classification === 'source-level');
const sourceGapRuntimeBlockers = COMMUNITY_RUNTIME_BLOCKERS.filter((item) => item.classification === 'runtime-only');
const coverageErrors = validateCommunityRuntimeFieldCoverage();
const coverage = runtimeFieldCoverageTotals();
const failures = [
  ...(!intake ? ['canonical --input is required'] : []),
  ...(!tts ? ['canonical --tts is required'] : []),
  ...results.filter((result) => result.exitCode !== 0).map((result) => `${result.name} exited ${result.exitCode}`),
  ...(triage.runtimeOnlyBlockersBefore !== 12 || triage.sourceBackedEngineCount !== 6 || triage.sourceGapCount !== 6 ? ['triage count mismatch'] : []),
  ...(sourceBlockers.length !== 5 || sourceGapRuntimeBlockers.length !== 6 ? ['remaining blocker count mismatch'] : []),
  ...CLOSED.filter((code) => activeCodes.includes(code)).map((code) => `closed blocker remains active: ${code}`),
  ...coverageErrors,
];
const status = failures.length === 0 ? 'COMMUNITY-SOURCE-BACKED-ENGINE-CAPABILITIES-CLOSED' : 'FAILED';
const evidence = {
  schemaVersion: 'phase11a3-community-engine-capability-closure.v1',
  generatedAt: new Date().toISOString(),
  terminalStatus: status,
  triage: { runtimeOnlyBefore: 12, sourceBacked: 6, sourceGaps: 6 },
  closure: { attempted: 6, successful: CLOSED.filter((code) => !activeCodes.includes(code)).length, closedCodes: CLOSED },
  remaining: { total: COMMUNITY_RUNTIME_BLOCKERS.length, sourceLevel: sourceBlockers.length, runtimeSourceGaps: sourceGapRuntimeBlockers.length, codes: activeCodes },
  fieldCoverage: coverage,
  commands: results,
  officialTruthInvariant: { status: 'SOURCE-BLOCKED', complete: 26, partial: 1, issue: 'ISSUE-P0-002', formal: '0/9', canEnterPhase11B: false },
  failures,
};
mkdirSync(dirname(EVIDENCE), { recursive: true });
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(REPORT, `# Phase 11A.3 Community Source-Backed Engine Capability Closure\n\n- Terminal status: **${status}**\n- Runtime-only blockers before triage: 12\n- Source-backed capabilities closed: ${evidence.closure.successful}/6\n- Preserved source-gap runtime blockers: ${sourceGapRuntimeBlockers.length}/6\n- Preserved source-level blockers: ${sourceBlockers.length}/5\n- Remaining blockers: ${COMMUNITY_RUNTIME_BLOCKERS.length}\n- Runtime field coverage: ${JSON.stringify(coverage)}\n- Official truth invariant: SOURCE-BLOCKED 26/1; ISSUE-P0-002; Formal 0/9; canEnterPhase11B=false.\n\n## Verification commands\n\n${results.map((item) => `- ${item.name}: exit ${item.exitCode} (${item.durationMs} ms)`).join('\n')}\n\n## Remaining blocker codes\n\n${activeCodes.map((code) => `- ${code}`).join('\n')}\n\n## Failures\n\n${failures.length ? failures.map((failure) => `- ${failure}`).join('\n') : '- None'}\n`);
console.log(status);
if (failures.length) process.exitCode = 1;
