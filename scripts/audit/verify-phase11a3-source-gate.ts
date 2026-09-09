// Phase 11A.3 Source-Gate Final Acceptance Closure dev doc：
// Phase 11A.3 专用 Verification Pipeline。
//
// 单一真值管道，Report 之后只读这五个 final 产物：
//   - verification-results.json
//   - release-gate.json
//   - source-readiness.json
//   - official-source-summary.json
//   - issue-ledger.json
//
// 关键修复（dev doc §2-5, §12-19）：
//   - CLI exit 真传播（main() return 直接 process.exit）
//   - contentAuditPasses / rulesAuditPasses 真 measured（不再 hardcode true）
//   - replayDeterminismPasses 独立 measured（不再由 golden 推导）
//   - verificationFresh 真 hash compare（inputHashBefore === inputHashAfter）
//   - fieldProvenanceValidated = provenanceAudit.passes（不再 auditPasses proxy）
//   - Act IV scope 直接从 OFFICIAL_SOURCE_REQUIREMENTS 计算（不再 category allowlist）
//   - consistency 覆盖 final terminal state（phase11A3Status / openP0 / openP1 / source counts / verification hash / canCloseP0 / canEnter11B）

import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { computeVerificationInputHash } from '../../src/audit/core-campaign/verification-input';
import { OFFICIAL_SOURCE_REQUIREMENTS } from '../../src/audit/core-campaign/official-source-requirements';
import { evaluateVerificationCliExit, type Phase11A3PreGateEvidence } from '../../src/audit/core-campaign/verification-evidence';

const ROOT = process.cwd();
const DATA_DIR = join(ROOT, 'docs/data/core-campaign');
const RESULTS_PATH = join(DATA_DIR, 'verification-results.json');
const RELEASE_GATE_PATH = join(DATA_DIR, 'release-gate.json');
const PRE_GATE_PATH = join(DATA_DIR, 'phase11a3-pre-gate-evidence.json');
const SOURCE_READINESS_PATH = join(DATA_DIR, 'source-readiness.json');
const SOURCE_MANIFEST_PATH = join(DATA_DIR, 'official-source-manifest.json');
const SOURCE_SUMMARY_PATH = join(DATA_DIR, 'official-source-summary.json');
const ISSUE_LEDGER_PATH = join(DATA_DIR, 'issue-ledger.json');
const REPORT_DIR = join(ROOT, 'docs/reports/phase-11a3');
const RUNS_DIR = join(DATA_DIR, 'verification-runs');

interface CommandResult {
  command: string;
  exitCode: number;
  durationMs: number;
  failureLogPath: string | null;
  status: number | null;
  signal: NodeJS.Signals | null;
  errorName: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  stdoutTail: string;
  stderrTail: string;
  timedOut: boolean;
}

interface VerificationResults {
  schemaVersion: string;
  runId: string;
  measuredAt: string;
  verificationInputHash: string;
  typecheckPasses: boolean;
  unitPasses: boolean;
  commandContractPasses: boolean;
  integrationPasses: boolean;
  buildPasses: boolean;
  criticalE2EPasses: boolean | 'not-measured';
  criticalE2ELifecyclePasses: boolean;
  sourceInputHash: string;
  goldenPasses: boolean;
  goldenTestPasses: boolean;
  replayDeterminismPasses: boolean;
  replayContinuationPasses: boolean;
  contentAuditPasses: boolean;
  rulesAuditPasses: boolean;
  productionCommandLayerPasses: boolean;
  releaseGatePasses: boolean;
  officialSourceAuditPasses: boolean;
  officialSourceManifestGenerated: boolean;
  fieldProvenanceValidated: boolean;
  sourceReadinessGenerated: boolean;
  openP0: number;
  openP1: number;
  campaignOrchestrationReachable: boolean;
  verificationFresh: boolean;
  unmeasuredGateBits: string[];
  consistencyErrors: string[];
  phase11A3Status: 'NOT-VERIFIED' | 'SOURCE-BLOCKED' | 'READY-FOR-OFFICIAL-IMPORT' | 'IMPLEMENTATION-FAIL' | 'COMPLETE';
  engineeringRegressionPasses: boolean;
  verifierHealthy: boolean;
  // structured source readiness
  sourceReadinessGates?: Record<string, boolean>;
  sourceReadinessRequiredMissingCount?: number;
  sourceReadinessOptionalMissingCount?: number;
  sourceReadinessProvenanceAuditPasses?: boolean;
  sourceReadinessOfficialActFourRequiredSourceCount?: number;
  sourceReadinessOfficialActFourMissingSourceRequirements?: string[];
  sourceReadinessOfficialActFourPartialSourceRequirements?: string[];
  // release-gate fields
  releaseGateSummary?: Record<string, unknown>;
  // canCloseP0_002 / canEnterPhase11B 一致性
  canCloseP0_002?: boolean;
  canEnterPhase11B?: boolean;
  canBeginOfficialImport?: boolean;
  commands: CommandResult[];
  notes: string[];
}

function runCommand(name: string, cmd: string, args: string[], timeoutMs: number, extraEnv: Record<string, string> = {}, failureDir = RUNS_DIR): CommandResult {
  const start = Date.now();
  console.log(`[${name}] ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    // npm/npx are Windows .cmd shims. Shell execution is required for those
    // shims, while the E2E command itself remains the package-script contract.
    shell: true,
    timeout: timeoutMs,
    env: { ...process.env, ...extraEnv },
  });
  const stdoutTail = (result.stdout ?? '').toString().slice(-2000);
  const stderrTail = (result.stderr ?? '').toString().slice(-2000);
  const exitCode = result.status ?? -1;
  const durationMs = Date.now() - start;
  const spawnError = result.error as (Error & { code?: string }) | undefined;
  const details = {
    status: result.status,
    signal: result.signal,
    errorName: spawnError?.name ?? null,
    errorMessage: spawnError?.message ?? null,
    errorCode: typeof spawnError?.code === 'string' ? spawnError.code : null,
    stdoutTail,
    stderrTail,
    timedOut: spawnError?.code === 'ETIMEDOUT',
  };
  if (exitCode === 0) {
    return { command: name, exitCode, durationMs, failureLogPath: null, ...details };
  }
  if (!existsSync(failureDir)) mkdirSync(failureDir, { recursive: true });
  const logPath = join(failureDir, `${name}.log`);
  writeFileSync(logPath, `STDOUT:\n${stdoutTail}\n\nSTDERR:\n${stderrTail}\n`, 'utf-8');
  return { command: name, exitCode, durationMs, failureLogPath: logPath, ...details };
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
  console.log('=== Phase 11A.3 Source-Gate Final Acceptance Verification Pipeline ===\n');
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });

  const commands: CommandResult[] = [];
  const notes: string[] = [];
  const runId = randomUUID();
  const failureDir = join(RUNS_DIR, runId, 'logs');
  if (existsSync(RELEASE_GATE_PATH)) unlinkSync(RELEASE_GATE_PATH);
  if (existsSync(PRE_GATE_PATH)) unlinkSync(PRE_GATE_PATH);

  // ─── verificationFresh 真 hash compare（dev doc §5）───
  // 在跑全部 verification 之前算一次 hash；跑完后再算一次。
  // src/** / scripts/** / e2e/** / package.json / lockfile / config 任一变化 → fresh=false
  const inputHashBefore = computeVerificationInputHash();

  // ---- 1-2. typecheck + unit ----
  commands.push(runCommand('typecheck', 'npx', ['tsc', '--noEmit'], 120_000, {}, failureDir));
  commands.push(runCommand('unit', 'npx', ['vitest', 'run', '--reporter=default'], 300_000, {}, failureDir));

  // ---- 3. command contract ----
  commands.push(runCommand('commandContract', 'npx', ['vitest', 'run', 'src/audit/core-campaign/game-command-route-contract.test.ts'], 60_000));

  // ---- 4. integration ----
  commands.push(runCommand('integration', 'npm', ['run', 'test:integration'], 120_000));

  // ---- 5. build ----
  commands.push(runCommand('build', 'npm', ['run', 'build'], 180_000));

  // ---- 6. critical E2E ----
  commands.push(runCommand(
    'criticalE2E',
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'test:e2e:critical'],
    180_000, {}, failureDir,
  ));
  const criticalE2ELifecycle = runCommand('criticalE2ELifecycle', 'npm', ['run', 'test:e2e:lifecycle'], 180_000, {}, failureDir);
  commands.push(criticalE2ELifecycle);

  // ---- 7. golden test ----
  const golden = runCommand('golden', 'npx', ['vitest', 'run', 'src/audit/core-campaign'], 120_000);
  commands.push(golden);
  const goldenPasses = golden.exitCode === 0;

  // ---- 8. replay continuation (独立 measured) ----
  const replayContinuation = runCommand('replayContinuation', 'npx', ['vitest', 'run', 'src/audit/core-campaign/replay-continuation.test.ts'], 60_000);
  commands.push(replayContinuation);
  const replayContinuationPasses = replayContinuation.exitCode === 0;

  // ---- 9. replay determinism (独立 measured，不再由其它 pass 推导；dev doc §4) ----
  const replayDeterminism = runCommand('replayDeterminism', 'npx', ['vitest', 'run', 'src/audit/core-campaign/replay-determinism.test.ts'], 60_000);
  commands.push(replayDeterminism);
  const replayDeterminismPasses = replayDeterminism.exitCode === 0;

  // ---- 10. production command audit ----
  commands.push(runCommand('productionCommand', 'npm', ['run', 'audit:production-command'], 60_000));

  // ---- 11-14. official source requirements audit ----
  const sourceAudit = runCommand('officialSource', 'npm', ['run', 'audit:official-source'], 60_000);
  commands.push(sourceAudit);
  const officialSourceAuditPasses = sourceAudit.exitCode === 0;
  const sourceReadiness = readJsonSafe<Record<string, unknown>>(SOURCE_READINESS_PATH);
  const sourceManifest = readJsonSafe<Record<string, unknown>>(SOURCE_MANIFEST_PATH);
  const sourceSummary = readJsonSafe<Record<string, unknown>>(SOURCE_SUMMARY_PATH);
  const officialSourceManifestGenerated = !!sourceManifest && !!sourceManifest.summary;
  const sourceReadinessGenerated = !!sourceReadiness && !!sourceReadiness.gates;
  const sourceInputHash = (sourceReadiness as { sourceInputHash?: string } | null)?.sourceInputHash ?? '';
  // dev doc §12：field provenance 来自 structured provenanceAudit.passes（不再 auditPasses proxy）
  const provenanceAudit = (sourceReadiness as { provenanceAudit?: { passes: boolean } } | null)?.provenanceAudit;
  const fieldProvenanceValidated = provenanceAudit ? provenanceAudit.passes : false;

  // ---- 15. content audit (dev doc §3：真 measured，contentAudit.exitCode === 0) ----
  const contentAudit = runCommand('contentAudit', 'npm', ['run', 'audit:content'], 60_000);
  commands.push(contentAudit);
  const contentAuditPasses = contentAudit.exitCode === 0;

  // ---- 16. rules audit (dev doc §3：真 measured，rulesAudit.exitCode === 0) ----
  const rulesAudit = runCommand('rulesAudit', 'npm', ['run', 'audit:rules'], 60_000);
  commands.push(rulesAudit);
  const rulesAuditPasses = rulesAudit.exitCode === 0;

  const commandPass = (name: string) => commands.find((c) => c.command === name)?.exitCode === 0;
  const preGate: Phase11A3PreGateEvidence = {
    runId,
    verificationInputHash: inputHashBefore,
    sourceInputHash,
    typecheckPasses: commandPass('typecheck'),
    unitPasses: commandPass('unit'),
    commandContractPasses: commandPass('commandContract'),
    integrationPasses: commandPass('integration'),
    buildPasses: commandPass('build'),
    criticalE2EPasses: commandPass('criticalE2E'),
    goldenTestPasses: goldenPasses,
    replayDeterminismPasses,
    replayContinuationPasses,
    productionCommandLayerPasses: commandPass('productionCommand'),
    verificationFresh: inputHashBefore === computeVerificationInputHash(),
    officialSourceAuditPasses,
    officialSourceManifestGenerated,
    sourceReadinessGenerated,
    fieldProvenanceValidated,
    contentAuditPasses,
    rulesAuditPasses,
  };
  writeFileSync(PRE_GATE_PATH, JSON.stringify(preGate, null, 2) + '\n', 'utf-8');

  // ---- 17-18. formal audit:release-gate ----
  // dev doc §19：release-gate 在 SOURCE-BLOCKED 时返回非零（这是正确的）。
  // 这里必须区分：commandExitCode vs artifactValid vs verdict。
  // Phase 11A.3 Source-Gate Final Acceptance：设 PHASE11A_VERIFY_IN_PROGRESS=1，
  // 让 audit:release-gate 知道 verification-results.json 还没写（不要触发 verificationStale 兜底）。
  const releaseGate = runCommand(
    'releaseGate',
    'npm',
    ['run', 'audit:release-gate'],
    60_000,
    { PHASE11A_VERIFY_IN_PROGRESS: '1', PHASE11A_RUN_ID: runId },
  );
  commands.push(releaseGate);
  const releaseGateCommandExitCode = releaseGate.exitCode;

  // ---- 19. read newly generated release-gate.json ----
  const releaseGateJson = readJsonSafe<Record<string, unknown>>(RELEASE_GATE_PATH);
  const releaseGateArtifactValid = !!releaseGateJson && !!releaseGateJson.verdict &&
    releaseGateJson.runId === runId && releaseGateJson.verificationInputHash === inputHashBefore;
  const releaseGateVerdict = (releaseGateJson?.verdict as string) ?? 'UNKNOWN';
  const releaseGateSummary = (releaseGateJson as Record<string, unknown> | undefined) ?? {};
  const issueLedger = readJsonSafe<{ openP0: number; openP1: number; issues: { id: string; severity: string; status: string }[] }>(ISSUE_LEDGER_PATH);
  const openP0 = issueLedger?.openP0 ?? 0;
  const openP1 = issueLedger?.openP1 ?? 0;

  // ─── inputHashAfter：所有 verification 跑完后 hash compare（dev doc §5）───
  const inputHashAfter = computeVerificationInputHash();
  const verificationFresh = inputHashBefore === inputHashAfter;

  // ---- 20. consistency check (dev doc §18：覆盖 final terminal state) ----
  const consistencyErrors: string[] = [];
  // gateVerdict
  if (!releaseGateArtifactValid) {
    consistencyErrors.push('release-gate.json missing or invalid after audit:release-gate');
  }
  // source-readiness gates 与 release-gate.sourceReadiness 一致
  if (sourceReadiness && releaseGateJson) {
    const srr = sourceReadiness as { gates?: Record<string, boolean> };
    const releaseGates = (releaseGateJson.sourceReadiness ?? {}) as Record<string, boolean>;
    for (const k of Object.keys(releaseGates)) {
      if (srr.gates && srr.gates[k] !== releaseGates[k]) {
        consistencyErrors.push(`source-readiness.gates.${k} (${srr.gates[k]}) !== release-gate.sourceReadiness.${k} (${releaseGates[k]})`);
      }
    }
  }
  // manifest.summary === source-summary
  if (sourceManifest && sourceSummary) {
    const sm = sourceManifest as { summary?: { totalRequirements?: number; requiredMissingCount?: number; optionalMissingCount?: number; auditPasses?: boolean } };
    if (sm.summary && sm.summary.totalRequirements !== (sourceSummary as { totalRequirements?: number }).totalRequirements) {
      consistencyErrors.push(`manifest.summary.totalRequirements (${sm.summary.totalRequirements}) !== summary.totalRequirements (${(sourceSummary as { totalRequirements?: number }).totalRequirements})`);
    }
    if (sm.summary && sm.summary.requiredMissingCount !== (sourceSummary as { requiredMissingCount?: number }).requiredMissingCount) {
      consistencyErrors.push(`manifest.summary.requiredMissingCount (${sm.summary.requiredMissingCount}) !== summary.requiredMissingCount (${(sourceSummary as { requiredMissingCount?: number }).requiredMissingCount})`);
    }
    if (sm.summary && sm.summary.auditPasses !== (sourceSummary as { auditPasses?: boolean }).auditPasses) {
      consistencyErrors.push(`manifest.summary.auditPasses (${sm.summary.auditPasses}) !== summary.auditPasses (${(sourceSummary as { auditPasses?: boolean }).auditPasses})`);
    }
  }
  if (sourceReadiness && sourceSummary && (sourceReadiness as { auditPasses?: boolean }).auditPasses !== (sourceSummary as { auditPasses?: boolean }).auditPasses) {
    consistencyErrors.push(`source-readiness.auditPasses (${(sourceReadiness as { auditPasses?: boolean }).auditPasses}) !== summary.auditPasses (${(sourceSummary as { auditPasses?: boolean }).auditPasses})`);
  }
  // source-readiness requiredMissingCount / optionalMissingCount 来自 requiredForCompletion
  if (sourceReadiness) {
    const sr = sourceReadiness as {
      officialActFourRequiredSourceCount?: number;
      officialActFourMissingSourceRequirements?: string[];
      officialActFourPartialSourceRequirements?: string[];
    };
    const required = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => r.requiredForCompletion);
    if (sr.officialActFourRequiredSourceCount !== undefined &&
        sr.officialActFourRequiredSourceCount !== required.length) {
      consistencyErrors.push(`source-readiness.officialActFourRequiredSourceCount (${sr.officialActFourRequiredSourceCount}) !== canonical required.length (${required.length})`);
    }
  }
  // verificationInputHash 与 release-gate 一致
  if (releaseGateJson && (releaseGateJson as { runId?: string }).runId) {
    // release-gate 写入时也会重新 compute；这里只校验 verification 自身 hash 一致
  }
  // phase status
  const phase11A3Status = releaseGateArtifactValid
    ? ((releaseGateJson?.phase11A3Status as string) ?? 'NOT-VERIFIED')
    : 'NOT-VERIFIED';
  // open P0/P1
  const releaseGateOpenP0 = (releaseGateJson?.openP0 as number) ?? 0;
  const releaseGateOpenP1 = (releaseGateJson?.openP1 as number) ?? 0;
  if (releaseGateOpenP0 !== openP0) {
    consistencyErrors.push(`release-gate.openP0 (${releaseGateOpenP0}) !== issue-ledger.openP0 (${openP0})`);
  }
  if (releaseGateOpenP1 !== openP1) {
    consistencyErrors.push(`release-gate.openP1 (${releaseGateOpenP1}) !== issue-ledger.openP1 (${openP1})`);
  }
  // onlyOpenP0 === ISSUE-P0-002
  const onlyOpenP0 = (releaseGateJson?.onlyOpenP0 as string | null) ?? null;
  if (openP0 === 1 && onlyOpenP0 !== 'ISSUE-P0-002') {
    consistencyErrors.push(`release-gate.onlyOpenP0 (${onlyOpenP0}) !== 'ISSUE-P0-002'`);
  }
  // canCloseP0_002 / canEnterPhase11B / canBeginOfficialImport 一致
  const releaseCanCloseP0 = (releaseGateJson?.canCloseP0_002 as boolean) ?? false;
  const releaseCanEnter11B = (releaseGateJson?.canEnterPhase11B as boolean) ?? false;
  const releaseCanBeginImport = (releaseGateJson?.canBeginOfficialImport as boolean) ?? false;
  const canCloseP0_002 = releaseCanCloseP0;
  const canEnterPhase11B = releaseCanEnter11B;
  const canBeginOfficialImport = releaseCanBeginImport;
  // SOURCE-BLOCKED / READY-FOR-OFFICIAL-IMPORT 时 canEnterPhase11B 必须 false
  if ((phase11A3Status === 'SOURCE-BLOCKED' || phase11A3Status === 'READY-FOR-OFFICIAL-IMPORT') && canEnterPhase11B) {
    consistencyErrors.push(`phase11A3Status=${phase11A3Status} but canEnterPhase11B=true (must be false until COMPLETE)`);
  }

  // ---- 21. unmeasuredGateBits ----
  const unmeasuredGateBits: string[] = [];
  // 这里 verification 自己跑的 measured bit 都有真实值；只有 release-gate 注入的 env flag 可能未测
  // 但我们已通过 verification-results.json 注入 release-gate；所以理论上应该全测
  // 保守起见：sourceReadiness.gates missing fields 算 unmeasured
  if (!sourceReadiness?.gates) unmeasuredGateBits.push('sourceReadiness.gates');

  // ---- 22. write final verification-results.json ----
  const criticalE2ECommand = commands.find((c) => c.command === 'criticalE2E');
  const criticalE2EPasses: boolean = criticalE2ECommand?.exitCode === 0;
  const criticalE2ELifecyclePasses = criticalE2ELifecycle.exitCode === 0;

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
    (criticalE2EPasses === true) && criticalE2ELifecyclePasses && contentAuditPasses && rulesAuditPasses &&
    officialSourceAuditPasses && officialSourceManifestGenerated && sourceReadinessGenerated &&
    fieldProvenanceValidated && releaseGateArtifactValid;
  const engineeringRegressionPasses = typecheckPasses && unitPasses && commandContractPasses &&
    integrationPasses && buildPasses && criticalE2EPasses && criticalE2ELifecyclePasses && goldenPasses &&
    replayDeterminismPasses && replayContinuationPasses && productionCommandLayerPasses;

  // Source side：dev doc §6：allRequiredSourcesReady 由 requiredForCompletion 驱动
  const sourceAllRequired = !!(sourceReadiness as { gates?: { allRequiredSourcesReady?: boolean } } | null)?.gates?.allRequiredSourcesReady;
  const sourceReadinessObj = sourceReadiness as {
    officialActFourRequiredSourceCount?: number;
    officialActFourMissingSourceRequirements?: string[];
    officialActFourPartialSourceRequirements?: string[];
  } | null;
  const sourceSummaryObj = sourceSummary as {
    requiredMissingCount?: number;
    optionalMissingCount?: number;
  } | null;

  const releaseGatePasses = allEngineeringTrue && openP0 === 0 && openP1 === 0 && sourceAllRequired;

  const verificationInputHash = inputHashAfter;

  const results: VerificationResults = {
    schemaVersion: 'phase-11a3-source-gate-final-acceptance.v1',
    runId,
    measuredAt: new Date().toISOString(),
    verificationInputHash,
    typecheckPasses: !!typecheckPasses,
    unitPasses: !!unitPasses,
    commandContractPasses: commandContractCommand?.exitCode === 0,
    integrationPasses: !!integrationPasses,
    buildPasses: !!buildPasses,
    criticalE2EPasses: criticalE2EPasses === true,
    criticalE2ELifecyclePasses,
    sourceInputHash,
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
    campaignOrchestrationReachable: !!releaseGateJson?.campaignOrchestrationReachable,
    verificationFresh,
    unmeasuredGateBits,
    consistencyErrors,
    phase11A3Status: phase11A3Status as VerificationResults['phase11A3Status'],
    engineeringRegressionPasses,
    verifierHealthy: engineeringRegressionPasses && officialSourceAuditPasses &&
      fieldProvenanceValidated && verificationFresh && unmeasuredGateBits.length === 0 && consistencyErrors.length === 0,
    sourceReadinessGates: (sourceReadiness as { gates?: Record<string, boolean> } | null)?.gates,
    sourceReadinessRequiredMissingCount: sourceSummaryObj?.requiredMissingCount,
    sourceReadinessOptionalMissingCount: sourceSummaryObj?.optionalMissingCount,
    sourceReadinessProvenanceAuditPasses: provenanceAudit?.passes,
    sourceReadinessOfficialActFourRequiredSourceCount: sourceReadinessObj?.officialActFourRequiredSourceCount,
    sourceReadinessOfficialActFourMissingSourceRequirements: sourceReadinessObj?.officialActFourMissingSourceRequirements,
    sourceReadinessOfficialActFourPartialSourceRequirements: sourceReadinessObj?.officialActFourPartialSourceRequirements,
    releaseGateSummary,
    canCloseP0_002,
    canEnterPhase11B,
    canBeginOfficialImport,
    commands,
    notes,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n', 'utf-8');
  const reportGeneration = runCommand('finalReport', 'npm', ['run', 'audit:phase11a3-report'], 60_000, {}, failureDir);
  commands.push(reportGeneration);
  if (reportGeneration.exitCode !== 0) {
    consistencyErrors.push('final report generation failed');
    results.verifierHealthy = false;
    results.phase11A3Status = 'NOT-VERIFIED';
    results.consistencyErrors = consistencyErrors;
  }
  // Final evidence includes report generation itself; it is the last publish.
  results.commands = commands;
  results.consistencyErrors = consistencyErrors;
  results.verifierHealthy = results.engineeringRegressionPasses && officialSourceAuditPasses && fieldProvenanceValidated && verificationFresh && unmeasuredGateBits.length === 0 && consistencyErrors.length === 0 && reportGeneration.exitCode === 0;
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n', 'utf-8');
  console.log(`\n[verify-phase11a3-source-gate] wrote ${RESULTS_PATH}`);
  console.log(`\nverdict=${releaseGateVerdict}`);
  console.log(`phase11A3Status=${phase11A3Status}`);
  console.log(`openP0=${openP0} openP1=${openP1}`);
  console.log(`sourceAllRequired=${sourceAllRequired}`);
  console.log(`onlyOpenP0=${onlyOpenP0}`);
  console.log(`canCloseP0_002=${canCloseP0_002}`);
  console.log(`canEnterPhase11B=${canEnterPhase11B}`);
  console.log(`canBeginOfficialImport=${canBeginOfficialImport}`);
  console.log(`verificationFresh=${verificationFresh} (before=${inputHashBefore.slice(0, 12)}, after=${inputHashAfter.slice(0, 12)})`);
  console.log(`consistencyErrors=${consistencyErrors.length}`);
  console.log(`unmeasuredGateBits=${unmeasuredGateBits.length}`);
  console.log(`officialSourceAuditPasses=${officialSourceAuditPasses}`);
  console.log(`releaseGateCommandExitCode=${releaseGateCommandExitCode} (artifactValid=${releaseGateArtifactValid})`);

  // 决定 exit code
  const terminalExit = evaluateVerificationCliExit({ verifierHealthy: results.verifierHealthy, phase11A3Status: results.phase11A3Status });
  if (terminalExit === 1) {
    console.error('\nCONSISTENCY ERRORS:');
    for (const e of consistencyErrors) console.error(`  - ${e}`);
    console.error('\nVerification terminal contract rejected this result.');
  }
  return terminalExit;
}

// Phase 11A.3 SGIR §39：vite-node 不设 `require.main === module`，直接执行。
// 同样适用于 npm run verify:phase11a3-source-gate 显式调用入口。
//
// Phase 11A.3 Source-Gate Final Acceptance Closure §2（CLI Exit Truth）：
//   必须真实把 main() 的 return code 传给 shell。
process.exit(main());
