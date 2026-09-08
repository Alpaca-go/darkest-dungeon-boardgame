import { computeVerificationInputHash as inputHash } from '../../src/audit/core-campaign/verification-input';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const dir = 'docs/data/core-campaign';
const runId = randomUUID();
const logDir = join(dir, 'verification-runs', runId);
mkdirSync(logDir, { recursive: true });
const commands: { label: string; command: string; exitCode: number; durationMs: number; logPath: string }[] = [];
const flags: Record<string, boolean> = {};
const verificationInputHash = inputHash();
function command(label: string, cmd: string, env: NodeJS.ProcessEnv = {}) {
  console.log(`[${label}] ${cmd}`);
  const start = Date.now();
  const result = spawnSync(cmd, { shell: true, encoding: 'utf8', timeout: 900_000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...env } });
  const logPath = join(logDir, `${label}.log`);
  writeFileSync(logPath, `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error ?? ''}`);
  const exitCode = result.status ?? -1;
  commands.push({ label, command: cmd, exitCode, durationMs: Date.now() - start, logPath });
  console.log(`[${label}] exit=${exitCode}`);
  return exitCode;
}
function suite(key: string, path: string, expected?: number) {
  const report = join(logDir, `${key}.json`);
  const exit = command(key, `npx vitest run ${path} --reporter=json --outputFile=${report}`);
  let ok = false;
  if (exit === 0 && existsSync(report)) {
    const r = JSON.parse(readFileSync(report, 'utf8'));
    ok = r.success === true && r.numTotalTests > 0 && r.numFailedTests === 0
      && r.numPendingTests === 0 && r.numTodoTests === 0 && r.numPassedTests === r.numTotalTests
      && (expected === undefined || r.numTotalTests === expected);
  }
  flags[key] = ok;
}
flags.typecheckPasses = command('typecheck', 'npm run typecheck') === 0;
suite('unitPasses', '');
suite('commandContractPasses', 'src/audit/core-campaign/game-command-route-contract.test.ts');
suite('integrationPasses', 'src/integration/core-campaign/integration.test.ts', 5);
flags.buildPasses = command('build', 'npm run build') === 0;
const e2eReport = join(logDir, 'critical-e2e.json');
const e2eExit = command('criticalE2E', 'npx playwright test e2e/phase11a2-critical-campaign.spec.ts --reporter=list,json', { PLAYWRIGHT_JSON_OUTPUT_NAME: e2eReport });
flags.criticalE2EPasses = false;
if (existsSync(e2eReport)) {
  const r = JSON.parse(readFileSync(e2eReport, 'utf8'));
  flags.criticalE2EPasses = e2eExit === 0 && r.stats.expected === 6 && r.stats.unexpected === 0
    && r.stats.skipped === 0 && r.stats.flaky === 0 && r.errors.length === 0;
}
suite('goldenTestPasses', 'src/audit/core-campaign/golden-run.test.ts');
suite('replayDeterminismPasses', 'src/audit/core-campaign/replay-determinism.test.ts');
suite('replayContinuationPasses', 'src/audit/core-campaign/replay-continuation.test.ts', 2);
suite('productSaveRoundTripPasses', 'src/audit/core-campaign/product-save-round-trip.test.ts', 1);
flags.contentAuditPasses = command('contentAudit', 'npm run audit:content') === 0;
flags.rulesAuditPasses = command('rulesAudit', 'npm run audit:rules') === 0;
suite('productionCommandTestsPasses', 'src/audit/core-campaign/production-command-audit.test.ts src/audit/core-campaign/command-differential.test.ts src/testing/e2e/e2e-harness-audit.test.ts');
const pcaExit = command('productionCommandAudit', 'npx vite-node scripts/audit/production-command.ts');
const pca = pcaExit === 0 ? JSON.parse(readFileSync(join(dir, 'production-command-audit.json'), 'utf8')) : null;
flags.productionCommandLayerPasses = flags.productionCommandTestsPasses && pca?.productionCommandLayerPasses === true
  && pca.routeExpected > 0 && pca.routeExpected === pca.routeValidated && pca.importSourceViolations.length === 0;
const sourceFiles = ['e2e/phase11a2-critical-campaign.spec.ts', 'src/integration/core-campaign/integration.test.ts',
  'src/audit/core-campaign/replay-continuation.test.ts'];
flags.falseGreenGuardPasses = sourceFiles.every(f => !/PENDING_|expect\(true\)|\b(?:test|it)\.(?:skip|todo)|\.catch\(\(\)\s*=>\s*\{\s*\}\)/.test(readFileSync(f, 'utf8')));
const preGate = { schemaVersion: '2.0', runId, measuredAt: new Date().toISOString(), verificationInputHash,
  ...flags, goldenPasses: flags.goldenTestPasses, verificationFresh: inputHash() === verificationInputHash, commands };
writeFileSync(join(dir, 'verification-results.json'), JSON.stringify(preGate, null, 2));
writeFileSync(join(logDir, 'pre-gate.json'), JSON.stringify(preGate, null, 2));
const gateExit = command('formalReleaseGate', 'npm run audit:release-gate', {
  PHASE11A_BUILD: flags.buildPasses ? 'pass' : 'fail', PHASE11A_UNIT: flags.unitPasses ? 'pass' : 'fail',
  PHASE11A_INTEGRATION: flags.integrationPasses ? 'pass' : 'fail', PHASE11A_E2E: flags.criticalE2EPasses ? 'pass' : 'fail',
});
const gate = JSON.parse(readFileSync(join(dir, 'release-gate.json'), 'utf8'));
const keys = ['typecheckPasses','unitPasses','commandContractPasses','integrationPasses','buildPasses',
  'criticalE2EPasses','goldenTestPasses','replayDeterminismPasses','replayContinuationPasses','productionCommandLayerPasses'];
const consistencyErrors = keys.filter(k => gate[k] !== flags[k]).map(k => `Gate mismatch: ${k}`);
if (gate.runId !== runId) consistencyErrors.push('Gate did not originate in this run');
if (!preGate.verificationFresh || inputHash() !== verificationInputHash) consistencyErrors.push('Verification inputs changed');
if (gate.unmeasuredGateBits.length) consistencyErrors.push('Unmeasured gate bits');
const onlyContentBlocked = gate.openP0 === 1 && gate.openP1 === 0 && gate.onlyOpenP0 === 'ISSUE-P0-002';
const canEnterPhase11A3 = Object.values(flags).every(Boolean) && consistencyErrors.length === 0
  && gateExit === 1 && gate.verdict === 'CONDITIONAL' && gate.canEnterPhase11A3 === true && onlyContentBlocked
  && gate.campaignOrchestrationReachable === true && gate.elevenQuestLoopClosed === false && gate.campaignVictoryReachable === false;
const final = { ...preGate, commands, consistencyErrors, releaseGatePasses: canEnterPhase11A3,
  canEnterPhase11A3, status: canEnterPhase11A3 ? 'COMPLETE' : 'PARTIAL', verdict: gate.verdict,
  openP0: gate.openP0, openP1: gate.openP1, onlyOpenP0: gate.onlyOpenP0,
  campaignOrchestrationReachable: gate.campaignOrchestrationReachable, unmeasuredGateBits: gate.unmeasuredGateBits };
writeFileSync(join(dir, 'verification-results.json'), JSON.stringify(final, null, 2));
writeFileSync(join(logDir, 'final.json'), JSON.stringify(final, null, 2));
const reports = 'docs/reports/phase-11a2-final';
mkdirSync(reports, { recursive: true });
writeFileSync(join(reports, 'phase-11a2-final-acceptance-report.md'), `# Phase 11A.2 Final Acceptance Closure\n\nStatus: **${final.status}**\n\nRun: ${runId}\n\nInput SHA256: ${verificationInputHash}\n\nLocal verification; no remote CI claim.\n\n| Check | Passed |\n| --- | --- |\n${Object.entries(flags).map(([k,v]) => `| ${k} | ${v} |`).join('\n')}\n\nFormal gate: **${gate.verdict}** (exit ${gateExit}).\n\nConsistency errors: ${JSON.stringify(consistencyErrors)}\n\nOpen P0/P1: ${gate.openP0}/${gate.openP1}; only P0: ${gate.onlyOpenP0}.\n\ncanEnterPhase11A3=${canEnterPhase11A3}.\n\nGolden tests do not imply full official campaign victory: elevenQuestLoopClosed=${gate.elevenQuestLoopClosed}, campaignVictoryReachable=${gate.campaignVictoryReachable}.\n\nLogs and structured suite counts: ../../data/core-campaign/verification-runs/${runId}/\n\n${canEnterPhase11A3 ? 'Implementation acceptance complete. STOP: await independent remote audit before formally closing Phase 11A.2 or starting Phase 11A.3.' : 'Acceptance remains incomplete. Failed checks above must be resolved before proceeding.'}\n`);
console.log(JSON.stringify(final, null, 2));
process.exitCode = canEnterPhase11A3 ? 0 : 1;
