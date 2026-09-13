import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  COMMUNITY_SOURCE_BLOCKER_RESOLUTION,
  COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT,
  validateCommunitySourceResolution,
} from '../../src/data/darkest-dungeon/community-reference/source-resolution';

const ROOT = process.cwd();
const BASE_HEAD = '8bb3b23fd3ab10b8258cee6f54328595447022f6';
const DATA_ROOT = 'docs/data/darkest-dungeon/community-reference';
const OUTPUT_ROOT = 'docs/reports/phase-11a3/source-blocker-resolution';
const EVIDENCE_PATH = `${DATA_ROOT}/community-source-blocker-resolution-evidence.json`;
const REPORT_PATH = 'docs/reports/phase-11a3/phase-11a3-community-source-blocker-resolution-report.md';
const DOSSIER_PATH = `${DATA_ROOT}/community-source-blocker-resolution.json`;
const SUPPLEMENT_PATH = `${DATA_ROOT}/community-source-resolution-supplement.json`;
const ENGINE_EVIDENCE = `${DATA_ROOT}/community-engine-capability-final-acceptance-evidence.json`;
const RUNTIME_EVIDENCE = `${DATA_ROOT}/community-reference-runtime-evidence.json`;
const BINDING_EVIDENCE = `${DATA_ROOT}/antha-complete-edition/community-reference-binding-evidence.json`;
const VISUAL_EVIDENCE = `${DATA_ROOT}/community-visual-assets-fresh-evidence.json`;
const OFFICIAL_EVIDENCE = 'docs/data/core-campaign/verification-results.json';

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(resolve(ROOT, path))).digest('hex');
const json = (path: string): Record<string, any> => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as Record<string, any>;
const git = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const input = arg('--input') ?? process.env.PHASE_11A3_INTAKE_PATH;
const tts = arg('--tts') ?? process.env.PHASE_11A3_TTS_PATH;
if (!input || !tts || !existsSync(input) || !existsSync(tts)) throw new Error('Usage: npm run verify:community-source-blocker-resolution -- --input <source intake JSON> --tts <TTS JSON>');
if (git('status', '--porcelain')) throw new Error('Commit A must be committed and the working tree clean before measured verification');
git('merge-base', '--is-ancestor', BASE_HEAD, 'HEAD');

mkdirSync(resolve(ROOT, OUTPUT_ROOT), { recursive: true });
const failures = validateCommunitySourceResolution();
const commands: Array<{ name: string; exitCode: number; durationMs: number; log: string; logSha256: string }> = [];
const run = (name: string, args: string[], timeout: number): void => {
  const started = Date.now();
  const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  const log = `${OUTPUT_ROOT}/${name}.log`;
  writeFileSync(resolve(ROOT, log), `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.stack ?? ''}`);
  const command = { name, exitCode: result.status ?? -1, durationMs: Date.now() - started, log, logSha256: sha256(log) };
  commands.push(command);
  if (command.exitCode !== 0) failures.push(`${name}: command failed; see ${log}`);
};

// The existing acceptance runner insists on a clean Commit A and itself reruns
// Binding, Runtime, Visual, Engine Capability and Official gates. Run it before
// this verifier writes any new evidence files.
rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true });
run('engine-capability-final-acceptance', [
  'node_modules/vite-node/vite-node.mjs',
  'scripts/audit/verify-community-engine-capability-final-acceptance.ts',
  '--input', resolve(input),
  '--tts', resolve(tts),
], 1_200_000);

const sourceReporter = `${OUTPUT_ROOT}/source-integrity.vitest.json`;
run('source-integrity-adversarial', [
  'node_modules/vitest/vitest.mjs', 'run',
  'src/data/darkest-dungeon/community-reference/source-resolution.test.ts',
  '--reporter=json', `--outputFile=${sourceReporter}`,
], 300_000);
run('typecheck', ['node_modules/typescript/bin/tsc', '--noEmit'], 300_000);
rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true });
run('build', ['node_modules/vite/bin/vite.js', 'build'], 300_000);

const sourceReport = json(sourceReporter);
const assertions = (sourceReport.testResults ?? []).flatMap((suite: Record<string, any>) => suite.assertionResults ?? []);
const adversarial = assertions.filter((test: Record<string, any>) => /\bS\d{2}\b/.test(test.title ?? test.fullName ?? ''));
const count = (rows: Record<string, any>[], statuses: string[]) => rows.filter((row) => statuses.includes(row.status)).length;
const adversarialTests = {
  expected: 12,
  discovered: adversarial.length,
  run: count(adversarial, ['passed', 'failed']),
  passed: count(adversarial, ['passed']),
  failed: count(adversarial, ['failed']),
  skipped: count(adversarial, ['pending', 'skipped', 'disabled']),
  todo: count(adversarial, ['todo']),
};
if (adversarialTests.discovered !== 12 || adversarialTests.run !== 12 || adversarialTests.passed !== 12 || adversarialTests.failed || adversarialTests.skipped || adversarialTests.todo) failures.push('adversarial structured count mismatch');

const engine = json(ENGINE_EVIDENCE);
const runtime = json(RUNTIME_EVIDENCE);
const binding = json(BINDING_EVIDENCE);
const visual = json(VISUAL_EVIDENCE);
const official = json(OFFICIAL_EVIDENCE);
const regression = {
  binding: { verdict: binding.terminalVerdict, runId: binding.runId, sha256: sha256(BINDING_EVIDENCE) },
  runtime: { verdict: runtime.terminalVerdict, runId: runtime.runId, sha256: sha256(RUNTIME_EVIDENCE) },
  visual: { verdict: visual.terminalVerdict, runId: visual.runId, sha256: sha256(VISUAL_EVIDENCE) },
  engineCapabilityFinalAcceptance: { verdict: engine.terminalVerdict, runId: engine.runId, sha256: sha256(ENGINE_EVIDENCE) },
  official: {
    verdict: official.phase11A3Status,
    runId: official.runId,
    sha256: sha256(OFFICIAL_EVIDENCE),
    requiredMissing: official.sourceReadinessRequiredMissingCount,
    optionalMissing: official.sourceReadinessOptionalMissingCount,
    openP0: official.openP0,
    openP1: official.openP1,
    onlyOpenP0: official.releaseGateSummary?.onlyOpenP0,
    formalMatrix: official.releaseGateSummary?.officialGuardianMatrix?.combinationsRun,
    canCloseP0_002: official.canCloseP0_002,
    canEnterPhase11B: official.canEnterPhase11B,
  },
};
if (regression.binding.verdict !== 'COMMUNITY-REFERENCE-DATA-BOUND') failures.push('Binding regression failed');
if (regression.runtime.verdict !== 'COMMUNITY-REFERENCE-RUNTIME-FROZEN') failures.push('Runtime regression failed');
if (regression.visual.verdict !== 'COMMUNITY-VISUAL-ASSETS-ACCEPTED') failures.push('Visual regression failed');
if (regression.engineCapabilityFinalAcceptance.verdict !== 'COMMUNITY-SOURCE-BACKED-ENGINE-CAPABILITIES-ACCEPTED') failures.push('Engine Capability Final Acceptance regression failed');
if (JSON.stringify([regression.official.verdict, regression.official.requiredMissing, regression.official.optionalMissing, regression.official.openP0, regression.official.openP1, regression.official.onlyOpenP0, regression.official.formalMatrix, regression.official.canCloseP0_002, regression.official.canEnterPhase11B]) !== JSON.stringify(['SOURCE-BLOCKED', 26, 1, 1, 0, 'ISSUE-P0-002', 0, false, false])) failures.push('Official Source Gate truth changed');

const verifiedImplementationHead = git('rev-parse', 'HEAD');
const implementationFiles = git('diff', '--name-only', BASE_HEAD, verifiedImplementationHead).split(/\r?\n/).filter(Boolean);
const forbiddenImplementationFiles = implementationFiles.filter((path) => path.startsWith('src/game-engine/') || path.startsWith('src/pages/') || path.startsWith('src/store/'));
if (forbiddenImplementationFiles.length) failures.push(`production gameplay changed: ${forbiddenImplementationFiles.join(', ')}`);

const evidence = {
  schemaVersion: 'phase11a3-community-source-blocker-resolution-evidence.v1',
  runId: randomUUID(),
  measuredAt: new Date().toISOString(),
  verificationScope: 'LOCAL MEASURED VERIFICATION',
  verifiedBaseHead: BASE_HEAD,
  verifiedImplementationHead,
  evidencePublicationParent: verifiedImplementationHead,
  dossier: { path: DOSSIER_PATH, sha256: sha256(DOSSIER_PATH), resolutionRunId: COMMUNITY_SOURCE_BLOCKER_RESOLUTION.resolutionRunId },
  supplement: { path: SUPPLEMENT_PATH, sha256: sha256(SUPPLEMENT_PATH), resolutionRunId: COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT.resolutionRunId, runtimeConsumptionAuthorized: false },
  canonicalInputs: { intakeSha256: sha256(resolve(input)), ttsSha256: sha256(resolve(tts)) },
  targets: COMMUNITY_SOURCE_BLOCKER_RESOLUTION.targets.map((target) => ({ blockerCode: target.blockerCode, verdict: target.verdict, sourceAuthority: target.sourceAuthority, sourceReferences: target.sourceReferences, runtimeDependencies: target.runtimeDependencies, requiresAstraReview: target.requiresAstraReview })),
  counts: COMMUNITY_SOURCE_BLOCKER_RESOLUTION.summary,
  adversarialTests,
  commands,
  regressions: regression,
  implementationFiles,
  forbiddenImplementationFiles,
  communityFullActFourPlayable: false,
  phase11BEntered: false,
  terminalVerdict: failures.length ? 'COMMUNITY-SOURCE-BLOCKER-RESOLUTION-FAILED' : 'COMMUNITY-SOURCE-BLOCKERS-RESEARCHED',
  failures,
};
mkdirSync(dirname(resolve(ROOT, EVIDENCE_PATH)), { recursive: true });
mkdirSync(dirname(resolve(ROOT, REPORT_PATH)), { recursive: true });
writeFileSync(resolve(ROOT, EVIDENCE_PATH), `${JSON.stringify(evidence, null, 2)}\n`);
const rows = evidence.targets.map((target) => `| ${target.blockerCode} | ${target.verdict} | ${target.sourceAuthority.join(', ')} | ${target.runtimeDependencies.join('; ') || 'None'} |`).join('\n');
writeFileSync(resolve(ROOT, REPORT_PATH), `# Phase 11A.3 Community Source Blocker Resolution\n\nTerminal verdict: **${evidence.terminalVerdict}**\n\nThis is source research/provenance resolution only. No supplement value is wired into production gameplay. Community Full Act IV playable remains false; Phase 11B was not entered.\n\n## Resolution summary\n\n- Targets: ${evidence.counts.targets}\n- Resolved: ${evidence.counts.resolved}\n- Partially resolved: ${evidence.counts.partiallyResolved}\n- Unresolved: ${evidence.counts.unresolved}\n- Conflicting: ${evidence.counts.conflicting}\n- Astra review required: ${evidence.counts.astraReviewRequired}\n\n| Blocker | Verdict | Authority | Runtime dependencies |\n| --- | --- | --- | --- |\n${rows}\n\n## Adversarial source integrity\n\nS01-S12: ${adversarialTests.passed}/${adversarialTests.expected} passed; discovered=${adversarialTests.discovered}, failed=${adversarialTests.failed}, skipped=${adversarialTests.skipped}, todo=${adversarialTests.todo}.\n\n## Fresh regressions\n\n- Community Binding: ${regression.binding.verdict}\n- Community Runtime: ${regression.runtime.verdict}\n- Community Visual Assets: ${regression.visual.verdict}\n- Community Engine Capability Final Acceptance: ${regression.engineCapabilityFinalAcceptance.verdict}\n- Official Source Gate: ${regression.official.verdict}; requiredMissing=${regression.official.requiredMissing}, optionalMissing=${regression.official.optionalMissing}, openP0=${regression.official.openP0}, onlyOpenP0=${regression.official.onlyOpenP0}, Formal Matrix=${regression.official.formalMatrix}/9, canCloseP0_002=${regression.official.canCloseP0_002}, canEnterPhase11B=${regression.official.canEnterPhase11B}.\n\n## Scope guard\n\nProduction gameplay files changed: ${forbiddenImplementationFiles.length}. Supplement runtime consumption authorized: false. COMMUNITY-FULL-ACT-IV-PLAYABLE=false.\n\nFailures:\n\n${failures.length ? failures.map((failure) => `- ${failure}`).join('\n') : 'None measured.'}\n\nSTOP. Do not implement gameplay or enter Phase 11B on this branch.\n`);
console.log(JSON.stringify({ terminalVerdict: evidence.terminalVerdict, counts: evidence.counts, adversarialTests, regressions: regression, failures }, null, 2));
if (failures.length) process.exit(1);
