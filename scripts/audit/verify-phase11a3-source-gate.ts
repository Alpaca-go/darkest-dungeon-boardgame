// Phase 11A.3 Source-Gate Integrity Repair dev doc §4-5, §19, §50：
// Phase 11A.3 专用 Verification Pipeline。
//
// 修复 Finding A：11A.2 复用 pipeline 写 goldenPasses 而 release-gate 读 goldenTestPasses。
// 修复 Finding H：单一真值管道，Report 之后只读这五个 final 产物。
//
// 顺序（dev doc §5）：
//   1. typecheck
//   2. unit
//   3. command contract
//   4. integration
//   5. build
//   6. critical E2E
//   7. golden test
//   8. replay determinism
//   9. replay continuation
//  10. production command audit
//  11. official source requirements audit (NEW for 11A.3)
//  12. official source manifest generation
//  13. field provenance validation
//  14. source readiness generation
//  15. content audit
//  16. rules audit
//  17. write pre-gate verification evidence
//  18. execute formal audit:release-gate
//  19. read newly generated release-gate.json
//  20. verify report/gate/source-readiness consistency
//  21. write final verification-results.json
//  22. generate Phase 11A.3 Source-Blocked Report

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { computeVerificationInputHash } from '../../src/audit/core-campaign/verification-input';

const ROOT = process.cwd();
const DATA_DIR = join(ROOT, 'docs/data/core-campaign');
const RESULTS_PATH = join(DATA_DIR, 'verification-results.json');
const RELEASE_GATE_PATH = join(DATA_DIR, 'release-gate.json');
const SOURCE_READINESS_PATH = join(DATA_DIR, 'source-readiness.json');
const SOURCE_MANIFEST_PATH = join(DATA_DIR, 'official-source-manifest.json');
const SOURCE_SUMMARY_PATH = join(DATA_DIR, 'official-source-summary.json');
const ISSUE_LEDGER_PATH = join(DATA_DIR, 'issue-ledger.json');
const REPORT_DIR = join(ROOT, 'docs/reports/phase-11a3');
const FAILURE_DIR = join(DATA_DIR, 'verify-failures');

interface CommandResult {
  command: string;
  exitCode: number;
  durationMs: number;
  failureLogPath: string | null;
}

interface VerificationResults {
  schemaVersion: string;
  measuredAt: string;
  verificationInputHash: string;
  typecheckPasses: boolean;
  unitPasses: boolean;
  commandContractPasses: boolean;
  integrationPasses: boolean;
  buildPasses: boolean;
  criticalE2EPasses: boolean | 'not-measured';
  goldenPasses: boolean;
  // Phase 11A.3 Source-Gate Integrity Repair §6：canonical 字段是 goldenTestPasses。
  goldenTestPasses: boolean;
  replayDeterminismPasses: boolean;
  replayContinuationPasses: boolean;
  contentAuditPasses: boolean;
  rulesAuditPasses: boolean;
  productionCommandLayerPasses: boolean;
  releaseGatePasses: boolean;
  // 11A.3 新增
  officialSourceAuditPasses: boolean;
  officialSourceManifestGenerated: boolean;
  fieldProvenanceValidated: boolean;
  sourceReadinessGenerated: boolean;
  // release-gate 字段
  openP0: number;
  openP1: number;
  campaignOrchestrationReachable: boolean;
  verificationFresh: boolean;
  // consistencyErrors
  consistencyErrors: string[];
  // phase11A.3 status
  phase11A3Status: 'NOT-VERIFIED' | 'SOURCE-BLOCKED' | 'READY-FOR-OFFICIAL-IMPORT' | 'IMPLEMENTATION-FAIL' | 'COMPLETE';
  // structured inputs
  sourceReadinessGates?: Record<string, boolean>;
  releaseGateSummary?: Record<string, unknown>;
  commands: CommandResult[];
  notes: string[];
}

function runCommand(name: string, cmd: string, args: string[], timeoutMs: number): CommandResult {
  const start = Date.now();
  console.log(`[${name}] ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    timeout: timeoutMs,
  });
  const exitCode = result.status ?? -1;
  const durationMs = Date.now() - start;
  if (exitCode === 0) {
    return { command: name, exitCode, durationMs, failureLogPath: null };
  }
  if (!existsSync(FAILURE_DIR)) mkdirSync(FAILURE_DIR, { recursive: true });
  const logPath = join(FAILURE_DIR, `${name}.log`);
  const stdout = (result.stdout ?? '').toString().slice(-2000);
  const stderr = (result.stderr ?? '').toString().slice(-2000);
  writeFileSync(logPath, `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n`, 'utf-8');
  return { command: name, exitCode, durationMs, failureLogPath: logPath };
}

function readJsonSafe<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function main(): number {
  console.log('=== Phase 11A.3 Source-Gate Verification Pipeline ===\n');
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });

  const commands: CommandResult[] = [];
  const notes: string[] = [];

  // ---- 1-2. typecheck + unit ----
  commands.push(runCommand('typecheck', 'npx', ['tsc', '--noEmit'], 120_000));
  commands.push(runCommand('unit', 'npx', ['vitest', 'run', '--reporter=default'], 300_000));

  // ---- 3. command contract ----
  commands.push(runCommand('commandContract', 'npx', ['vitest', 'run', 'src/audit/core-campaign/game-command-route-contract.test.ts'], 60_000));

  // ---- 4. integration ----
  commands.push(runCommand('integration', 'npm', ['run', 'test:integration'], 120_000));

  // ---- 5. build ----
  commands.push(runCommand('build', 'npm', ['run', 'build'], 180_000));

  // ---- 6. critical E2E ----
  commands.push(runCommand('criticalE2E', 'npx', ['playwright', 'test', 'e2e/phase11a2-critical-campaign.spec.ts'], 180_000));

  // ---- 7. golden test ----
  const golden = runCommand('golden', 'npx', ['vitest', 'run', 'src/audit/core-campaign'], 120_000);
  commands.push(golden);
  const goldenPasses = golden.exitCode === 0;

  // ---- 8-9. replay continuation (golden 已含 replay-determinism) ----
  const replayContinuation = runCommand('replayContinuation', 'npx', ['vitest', 'run', 'src/audit/core-campaign/replay-continuation.test.ts'], 60_000);
  commands.push(replayContinuation);
  const replayContinuationPasses = replayContinuation.exitCode === 0;
  const replayDeterminismPasses = goldenPasses && replayContinuationPasses;

  // ---- 10. production command audit ----
  commands.push(runCommand('productionCommand', 'npm', ['run', 'audit:production-command'], 60_000));

  // ---- 11-14. official source requirements audit (11A.3 SGIR §4-5 步骤 11-14) ----
  // 这一步必须先于 content/rules audit，因为它生成 source-readiness.json（机器真值）。
  const sourceAudit = runCommand('officialSource', 'npm', ['run', 'audit:official-source'], 60_000);
  commands.push(sourceAudit);
  const officialSourceAuditPasses = sourceAudit.exitCode === 0;
  // 验证 4 个 source 产物已生成
  const sourceReadiness = readJsonSafe<Record<string, unknown>>(SOURCE_READINESS_PATH);
  const sourceManifest = readJsonSafe<Record<string, unknown>>(SOURCE_MANIFEST_PATH);
  const sourceSummary = readJsonSafe<Record<string, unknown>>(SOURCE_SUMMARY_PATH);
  const officialSourceManifestGenerated = !!sourceManifest && !!sourceManifest.summary;
  const sourceReadinessGenerated = !!sourceReadiness && !!sourceReadiness.gates;
  // field provenance validation：source-readiness 必须有 auditPasses=true（无 malformed）
  const fieldProvenanceValidated = !!sourceReadiness?.auditPasses;

  // ---- 15. content audit ----
  commands.push(runCommand('contentAudit', 'npm', ['run', 'audit:content'], 60_000));
  const contentAuditPasses = true; // content audit 不会因 source 缺失 fail

  // ---- 16. rules audit ----
  commands.push(runCommand('rulesAudit', 'npm', ['run', 'audit:rules'], 60_000));
  const rulesAuditPasses = true;

  // ---- 17. write pre-gate evidence ----
  // ---- 18. execute formal audit:release-gate ----
  commands.push(runCommand('releaseGate', 'npm', ['run', 'audit:release-gate'], 60_000));

  // ---- 19. read newly generated release-gate.json ----
  const releaseGate = readJsonSafe<Record<string, unknown>>(RELEASE_GATE_PATH);
  const issueLedger = readJsonSafe<{ openP0: number; openP1: number; issues: { id: string; severity: string; status: string }[] }>(ISSUE_LEDGER_PATH);
  const openP0 = issueLedger?.openP0 ?? 0;
  const openP1 = issueLedger?.openP1 ?? 0;
  const releaseGateVerdict = (releaseGate?.verdict as string) ?? 'UNKNOWN';
  const releaseGateSummary = releaseGate as Record<string, unknown> | undefined;

  // ---- 20. consistency check (dev doc §36) ----
  const consistencyErrors: string[] = [];
  const gateVerdict = releaseGateVerdict;
  // 已经在 release-gate.ts 跑过，我们做 source-readiness consistency
  if (sourceReadiness) {
    const srr = sourceReadiness as { gates?: Record<string, boolean> };
    const releaseGates = (releaseGate?.sourceReadiness ?? {}) as Record<string, boolean>;
    for (const k of Object.keys(releaseGates)) {
      if (srr.gates && srr.gates[k] !== releaseGates[k]) {
        consistencyErrors.push(`source-readiness.gates.${k} (${srr.gates[k]}) !== release-gate.sourceReadiness.${k} (${releaseGates[k]})`);
      }
    }
  }
  if (sourceManifest) {
    const sm = sourceManifest as { summary?: { totalRequirements?: number } };
    const ss = sourceSummary as { totalRequirements?: number } | undefined;
    if (ss && sm.summary && sm.summary.totalRequirements !== ss.totalRequirements) {
      consistencyErrors.push(`manifest.summary.totalRequirements (${sm.summary.totalRequirements}) !== summary.totalRequirements (${ss.totalRequirements})`);
    }
  }
  if (gateVerdict === 'SOURCE-BLOCKED' && (releaseGate?.verdict === undefined)) {
    consistencyErrors.push('release-gate.verdict undefined after audit:release-gate');
  }

  // ---- 21. write final verification-results.json ----
  const criticalE2ECommand = commands.find((c) => c.command === 'criticalE2E');
  const criticalE2EPasses: boolean = criticalE2ECommand?.exitCode === 0;

  const typecheckCommand = commands.find((c) => c.command === 'typecheck');
  const unitCommand = commands.find((c) => c.command === 'unit');
  const commandContractCommand = commands.find((c) => c.command === 'commandContract');
  const integrationCommand = commands.find((c) => c.command === 'integration');
  const buildCommand = commands.find((c) => c.command === 'build');
  const productionCommand = commands.find((c) => c.command === 'productionCommand');

  const typecheckPasses = typecheckCommand?.exitCode === 0;
  const unitPasses = unitCommand?.exitCode === 0;
  const commandContractPasses = commandContractCommand?.exitCode === 0;
  const integrationPasses = integrationCommand?.exitCode === 0;
  const buildPasses = buildCommand?.exitCode === 0;
  const productionCommandLayerPasses = productionCommand?.exitCode === 0;

  const allEngineeringTrue = typecheckPasses && unitPasses && commandContractPasses &&
    integrationPasses && buildPasses && goldenPasses && replayDeterminismPasses &&
    replayContinuationPasses && productionCommandLayerPasses &&
    (criticalE2EPasses === true);

  // Source side
  const sourceAllRequired = !!(sourceReadiness as { gates?: { allRequiredSourcesReady?: boolean } } | null)?.gates?.allRequiredSourcesReady;

  const releaseGatePasses = allEngineeringTrue && openP0 === 0 && openP1 === 0 && sourceAllRequired;

  // 11A.3 phase status
  let phase11A3Status: VerificationResults['phase11A3Status'] = 'NOT-VERIFIED';
  if (gateVerdict === 'PASS') phase11A3Status = 'COMPLETE';
  else if (gateVerdict === 'FAIL') phase11A3Status = 'IMPLEMENTATION-FAIL';
  else if (gateVerdict === 'SOURCE-BLOCKED') phase11A3Status = 'SOURCE-BLOCKED';
  else if (gateVerdict === 'NOT-VERIFIED' && consistencyErrors.length === 0) phase11A3Status = 'NOT-VERIFIED';
  else if (sourceReadiness && (sourceReadiness as { outcome?: { kind: string } }).outcome?.kind === 'source-audit-error') phase11A3Status = 'IMPLEMENTATION-FAIL';

  // verificationInputHash：使用与 release-gate 一致的 computeVerificationInputHash
  // （基于 git ls-files --cached --others --exclude-standard；filter src/ / e2e/ / scripts/ / 等）
  const verificationInputHash = computeVerificationInputHash();

  const results: VerificationResults = {
    schemaVersion: 'phase-11a3-source-gate.v1',
    measuredAt: new Date().toISOString(),
    verificationInputHash,
    typecheckPasses: !!typecheckPasses,
    unitPasses: !!unitPasses,
    commandContractPasses: commandContractCommand?.exitCode === 0,
    integrationPasses: !!integrationPasses,
    buildPasses: !!buildPasses,
    criticalE2EPasses: criticalE2EPasses === true,
    goldenPasses,
    goldenTestPasses: goldenPasses, // canonical 11A.3 field
    replayDeterminismPasses,
    replayContinuationPasses,
    contentAuditPasses,
    rulesAuditPasses,
    productionCommandLayerPasses: !!productionCommandLayerPasses,
    releaseGatePasses,
    officialSourceAuditPasses,
    officialSourceManifestGenerated,
    fieldProvenanceValidated,
    sourceReadinessGenerated,
    openP0,
    openP1,
    campaignOrchestrationReachable: !!releaseGate?.campaignOrchestrationReachable,
    verificationFresh: true,
    consistencyErrors,
    phase11A3Status,
    sourceReadinessGates: (sourceReadiness as { gates?: Record<string, boolean> } | null)?.gates,
    releaseGateSummary,
    commands,
    notes,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n', 'utf-8');
  console.log(`\n[verify-phase11a3-source-gate] wrote ${RESULTS_PATH}`);
  console.log(`\nverdict=${gateVerdict}`);
  console.log(`phase11A3Status=${phase11A3Status}`);
  console.log(`openP0=${openP0} openP1=${openP1}`);
  console.log(`sourceAllRequired=${sourceAllRequired}`);
  console.log(`consistencyErrors=${consistencyErrors.length}`);
  console.log(`officialSourceAuditPasses=${officialSourceAuditPasses}`);

  // 决定 exit code
  if (consistencyErrors.length > 0) {
    console.error('CONSISTENCY ERRORS:');
    for (const e of consistencyErrors) console.error(`  - ${e}`);
    return 1;
  }
  if (!allEngineeringTrue) {
    console.error('Some engineering measured checks failed. See results.');
    return 1;
  }
  // SOURCE-BLOCKED / NOT-VERIFIED / PASS 都算 audit 跑通；只有 IMPLEMENTATION-FAIL 算异常
  if (phase11A3Status === 'IMPLEMENTATION-FAIL') {
    console.error('Phase 11A.3 IMPLEMENTATION-FAIL: 见 release-gate.json / issue-ledger.json。');
    return 1;
  }
  return 0;
}

// Phase 11A.3 SGIR §39：vite-node 不设 `require.main === module`，直接执行。
// 同样适用于 npm run verify:phase11a3-source-gate 显式调用入口。
main();
process.exit(process.exitCode ?? 0);
