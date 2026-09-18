/**
 * Phase 11A.4R1A — Guardian & Room acceptance measured verification.
 * Writes LOCAL MEASURED VERIFICATION evidence under docs/reports/phase-11a4r1/.
 * Does not claim CI green. Requires a clean working tree at the implementation HEAD.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMUNITY_REFERENCE_RUNTIME_PROFILE,
  COMMUNITY_RUNTIME_BLOCKERS,
} from '../../src/data/darkest-dungeon/community-reference/runtime-profile';

const ROOT = process.cwd();
const OUTPUT = 'docs/reports/phase-11a4r1';
const EVIDENCE = 'docs/data/darkest-dungeon/community-reference/community-guardian-room-acceptance-evidence.json';
const REPORT = `${OUTPUT}/phase-11a4r1a-community-guardian-room-acceptance-report.md`;

const EXPECTED_BLOCKERS = [
  'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED',
  'FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED',
  'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED',
  'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED',
  'COME_UNTO_YOUR_MAKER_UNRESOLVED',
] as const;

const SUITES = {
  guardianProduction: {
    file: 'src/data/darkest-dungeon/community-reference/community-guardian-special-skill.test.ts',
    expected: 22,
  },
  specialSkillCoverage: {
    file: 'src/data/darkest-dungeon/community-reference/community-special-skill-coverage.test.ts',
    expected: 3,
  },
  monsterTargetingAdversarial: {
    file: 'src/data/darkest-dungeon/community-reference/community-monster-targeting-adversarial.test.ts',
    expected: 4,
  },
  physicalPlacementProduction: {
    file: 'src/data/darkest-dungeon/community-reference/community-physical-monster-placement-production.test.ts',
    expected: 2,
  },
  r1SaveReplay: {
    file: 'src/data/darkest-dungeon/community-reference/community-guardian-room-save-replay.test.ts',
    expected: 6,
  },
  r1Adversarial: {
    file: 'src/data/darkest-dungeon/community-reference/community-guardian-room-adversarial.test.ts',
    expected: 17,
  },
  routeMatrix: {
    file: 'src/data/darkest-dungeon/community-reference/community-act4-route-matrix.test.ts',
    expected: 5,
  },
  playableClosureProduction: {
    file: 'src/data/darkest-dungeon/community-reference/community-act4-playable-closure.test.ts',
    expected: 12,
  },
  frozenMonster: {
    file: 'src/data/darkest-dungeon/community-reference/community-runtime-monster.test.ts',
    expected: 7,
  },
} as const;

const git = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(resolve(ROOT, path))).digest('hex');
const json = (path: string): Record<string, any> => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as Record<string, any>;

const dirty = git('status', '--porcelain', '--untracked-files=no');
if (dirty) {
  throw new Error('Working tree must be clean before measured R1A verification');
}

const verifiedImplementationHead = git('rev-parse', 'HEAD');
mkdirSync(resolve(ROOT, OUTPUT), { recursive: true });

const failures: string[] = [];
const blockerCodes = COMMUNITY_RUNTIME_BLOCKERS.map((blocker) => blocker.code);
if (JSON.stringify(blockerCodes) !== JSON.stringify([...EXPECTED_BLOCKERS])) {
  failures.push(`Active blockers mismatch: ${JSON.stringify(blockerCodes)}`);
}
if (COMMUNITY_REFERENCE_RUNTIME_PROFILE.capabilities.fullActFourPlayable !== false) {
  failures.push('fullActFourPlayable must remain false');
}
if ((COMMUNITY_REFERENCE_RUNTIME_PROFILE.capabilities as { manualPlaytestCandidate?: boolean }).manualPlaytestCandidate === true) {
  failures.push('manualPlaytestCandidate must remain false/absent');
}

const commands: Array<{ name: string; exitCode: number; durationMs: number; log: string; logSha256: string }> = [];
const run = (name: string, args: string[], timeout: number, env?: NodeJS.ProcessEnv): void => {
  const started = Date.now();
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PLAYWRIGHT_CHANNEL: process.env.PLAYWRIGHT_CHANNEL || 'chrome', ...env },
  });
  const log = `${OUTPUT}/${name}.log`;
  writeFileSync(resolve(ROOT, log), `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.stack ?? ''}`);
  const command = { name, exitCode: result.status ?? -1, durationMs: Date.now() - started, log, logSha256: sha256(log) };
  commands.push(command);
  if (command.exitCode !== 0) failures.push(`${name}: command failed; see ${log}`);
};

run('typecheck', ['node_modules/typescript/bin/tsc', '--noEmit'], 300_000);

const structuredTestGroups: Record<string, any> = {};
for (const [name, suite] of Object.entries(SUITES)) {
  const output = `${OUTPUT}/${name}.vitest.json`;
  if (existsSync(resolve(ROOT, output))) rmSync(resolve(ROOT, output));
  run(name, ['node_modules/vitest/vitest.mjs', 'run', suite.file, '--reporter=json', `--outputFile=${output}`], 600_000);
  let assertions: Record<string, any>[] = [];
  try {
    assertions = (json(output).testResults ?? []).flatMap((entry: Record<string, any>) => entry.assertionResults ?? []);
  } catch (error) {
    failures.push(`${name}: unreadable structured report (${String(error)})`);
  }
  const count = (statuses: string[]) => assertions.filter((test) => statuses.includes(test.status)).length;
  const group = {
    expected: suite.expected,
    discovered: assertions.length,
    run: count(['passed', 'failed']),
    passed: count(['passed']),
    failed: count(['failed']),
    skipped: count(['pending', 'skipped', 'disabled']),
    todo: count(['todo']),
    reporter: output,
    sha256: existsSync(resolve(ROOT, output)) ? sha256(output) : null,
  };
  structuredTestGroups[name] = group;
  if (group.discovered !== group.expected || group.passed !== group.expected || group.failed || group.skipped || group.todo) {
    failures.push(`${name}: structured count mismatch ${JSON.stringify(group)}`);
  }
}

rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true });
run('build', ['node_modules/vite/bin/vite.js', 'build'], 300_000);

const e2eOutput = `${OUTPUT}/community-act4-playable-closure-e2e.json`;
run('playableClosureE2E', ['scripts/e2e/run-community-act4-playable-closure-e2e.mjs'], 300_000, {
  COMMUNITY_E2E_JSON_PATH: resolve(ROOT, e2eOutput),
  PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(ROOT, e2eOutput),
});
const e2eResults: string[] = [];
try {
  const visit = (node: Record<string, any>): void => {
    for (const spec of node.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? []) e2eResults.push(result.status);
    for (const suite of node.suites ?? []) visit(suite);
  };
  if (existsSync(resolve(ROOT, e2eOutput))) visit(json(e2eOutput));
} catch (error) {
  failures.push(`playableClosureE2E: unreadable report (${String(error)})`);
}
const e2e = {
  expected: 3,
  discovered: e2eResults.length,
  run: e2eResults.filter((status) => ['passed', 'failed', 'timedOut', 'interrupted'].includes(status)).length,
  passed: e2eResults.filter((status) => status === 'passed').length,
  failed: e2eResults.filter((status) => ['failed', 'timedOut', 'interrupted'].includes(status)).length,
  skipped: e2eResults.filter((status) => status === 'skipped').length,
  reporter: e2eOutput,
  sha256: existsSync(resolve(ROOT, e2eOutput)) ? sha256(e2eOutput) : null,
};
if (e2e.discovered !== e2e.expected || e2e.passed !== e2e.expected || e2e.failed) {
  failures.push(`playableClosureE2E: structured count mismatch ${JSON.stringify(e2e)}`);
}

if (git('rev-parse', 'HEAD') !== verifiedImplementationHead) {
  failures.push('Implementation HEAD changed during verification');
}

const terminalVerdict = failures.length === 0
  ? 'COMMUNITY-GUARDIAN-ROOM-IMPLEMENTATION-ACCEPTED'
  : 'FAILED';

const evidence = {
  schemaVersion: 'phase11a4r1a-community-guardian-room-acceptance.v1',
  runId: randomUUID(),
  measuredAt: new Date().toISOString(),
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  verifiedImplementationHead,
  evidencePublicationParent: verifiedImplementationHead,
  terminalVerdict,
  sourceBlocked: 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED',
  activeRuntimeBlockers: blockerCodes,
  expectedRuntimeBlockers: [...EXPECTED_BLOCKERS],
  flags: {
    manualPlaytestCandidate: false,
    fullActFourPlayable: false,
    canEnterPhase11B: false,
  },
  structuredTestGroups,
  e2e,
  commands,
  failures,
  acceptanceNotes: [
    'R1 implementation acceptance complete when terminalVerdict is COMMUNITY-GUARDIAN-ROOM-IMPLEMENTATION-ACCEPTED.',
    'R1 source closure remains blocked by TEMPLARS_PIT_EXIT_RULE_UNRESOLVED.',
    'This evidence is LOCAL MEASURED VERIFICATION; it does not claim CI green.',
    'Final Encounter R2 scope is explicitly out of this phase.',
  ],
};

writeFileSync(resolve(ROOT, EVIDENCE), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(
  resolve(ROOT, REPORT),
  `# Phase 11A.4R1A Community Guardian / Room Acceptance

- Terminal verdict: **${terminalVerdict}**
- Verification scope: **LOCAL MEASURED VERIFICATION**
- Verified implementation head: \`${verifiedImplementationHead}\`
- Source-blocked: \`TEMPLARS_PIT_EXIT_RULE_UNRESOLVED\`
- Active blockers (${blockerCodes.length}): ${blockerCodes.map((code) => `\`${code}\``).join(', ')}
- Flags: manualPlaytestCandidate=false, fullActFourPlayable=false, canEnterPhase11B=false

## Suites

| Suite | Expected | Passed | Failed |
| --- | ---: | ---: | ---: |
${Object.entries(structuredTestGroups).map(([name, group]) => `| ${name} | ${group.expected} | ${group.passed} | ${group.failed} |`).join('\n')}
| playableClosureE2E | ${e2e.expected} | ${e2e.passed} | ${e2e.failed} |

## Commands

${commands.map((command) => `- ${command.name}: exit ${command.exitCode} (${command.durationMs}ms) → ${command.log}`).join('\n')}

## Failures

${failures.length === 0 ? '_none_' : failures.map((item) => `- ${item}`).join('\n')}

## Verdict guidance

\`COMMUNITY-GUARDIAN-ROOM-IMPLEMENTATION-ACCEPTED\`
\`SOURCE-BLOCKED: TEMPLARS_PIT_EXIT_RULE_UNRESOLVED\`

Do not claim FULL ACT IV PLAYABLE.
`,
);

if (failures.length) {
  console.error(JSON.stringify({ terminalVerdict, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  terminalVerdict,
  verifiedImplementationHead,
  evidence: EVIDENCE,
  report: REPORT,
}, null, 2));
