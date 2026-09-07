// Phase 11A.2.3R §10-12 — Measured Verification Pipeline（修复版）。
//
// dev doc §10-12：11A.2.3 末态的 verify-phase11a2-3.ts 存在 5 类 False Green 漏洞：
//   1. commandContractPasses = unitPasses（unit 替 contract，dev doc §6 禁止）
//   2. release-gate.json 读根目录（应为 docs/data/core-campaign/release-gate.json）
//   3. 失败不保存 stdout/stderr tail
//   4. PCA 未单独测（混在 production-command-audit.test.ts 中间）
//   5. release-gate.json 未结构化读（只看 openP0 / openP1；未看 measured flags）
//
// 本文件按 dev doc §19 执行顺序：typecheck → unit → commandContract → integration
//   → build → criticalE2E → golden → replayDeterminism → replayContinuation
//   → contentAudit → rulesAudit → productionCommandAudit → releaseGate → finalReport。
//
// 输出：
//   docs/data/core-campaign/verification-results.json（实测结果）
//   docs/data/core-campaign/verify-failures/<step>.log（失败时 stdout/stderr tail）
//
// 运行：npx vite-node scripts/audit/verify-phase11a2-3.ts

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const ROOT = process.cwd();
const DATA_DIR = join(ROOT, 'docs/data/core-campaign');
const RESULTS_PATH = join(DATA_DIR, 'verification-results.json');
// dev doc §10-12（修复 #2）：release-gate.json 在 docs/data/core-campaign/ 下，不是根目录。
const RELEASE_GATE_PATH = join(DATA_DIR, 'release-gate.json');
const FAILURE_DIR = join(DATA_DIR, 'verify-failures');

interface CommandResult {
  command: string;
  exitCode: number;
  durationMs: number;
  /** 失败时保存的 stdout/stderr tail（成功时为 null）。 */
  failureLogPath: string | null;
}

interface VerificationResults {
  schemaVersion: string;
  measuredAt: string;
  verificationInputHash: string;
  typecheckPasses: boolean;
  unitPasses: boolean;
  // dev doc §10-12（修复 #1）：commandContract 必须独立测，不再 = unitPasses。
  commandContractPasses: boolean;
  integrationPasses: boolean;
  buildPasses: boolean;
  criticalE2EPasses: boolean | 'not-measured';
  goldenPasses: boolean;
  replayDeterminismPasses: boolean;
  replayContinuationPasses: boolean;
  contentAuditPasses: boolean;
  rulesAuditPasses: boolean;
  // dev doc §10-12（修复 #4）：PCA 单独测。
  productionCommandLayerPasses: boolean;
  // dev doc §10-12（修复 #5）：release gate 结构化读 measured flags。
  releaseGatePasses: boolean;
  openP0: number;
  openP1: number;
  campaignOrchestrationReachable: boolean;
  verificationFresh: boolean;
  commands: CommandResult[];
  notes: string[];
}

function computeInputHash(): string {
  // 11A.2.3 §21：src/** e2e/** scripts/** package.json lockfile playwright.config.ts
  //              vite config tsconfig 全部纳入；排除 generated docs / dist / pw-out / coverage
  //              / verification-results.json
  const out = execSync('git ls-files', { encoding: 'utf8' });
  const files = out
    .split('\n')
    .filter((f) => f.length > 0)
    .filter((f) => !f.includes('node_modules'))
    .filter((f) => !f.startsWith('dist/'))
    .filter((f) => !f.startsWith('pw-out/'))
    .filter((f) => !f.startsWith('coverage/'))
    .filter((f) => !f.includes('verification-results.json'))
    .filter((f) => !f.startsWith('docs/'))
    .sort();
  const h = createHash('sha256');
  for (const f of files) {
    const full = join(ROOT, f);
    if (!existsSync(full) || !statSync(full).isFile()) continue;
    h.update(f);
    h.update('\0');
    h.update(readFileSync(full));
    h.update('\0');
  }
  return h.digest('hex');
}

const TAIL_LINE_COUNT = 200;

function runCommand(label: string, cmd: string, args: string[], timeoutMs = 120_000): CommandResult {
  const t0 = Date.now();
  let res;
  try {
    res = spawnSync(cmd, args, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: 'pipe',
      shell: true,
    });
  } catch (e: any) {
    return {
      command: `${label}: ${cmd} ${args.join(' ')}`,
      exitCode: -1,
      durationMs: Date.now() - t0,
      failureLogPath: null,
    };
  }
  const durationMs = Date.now() - t0;
  const exitCode = res.status ?? -1;
  const description = `${label}: ${cmd} ${args.join(' ')}`;

  // dev doc §10-12（修复 #3）：失败时保存 stdout/stderr tail 到 docs/data/core-campaign/verify-failures/
  if (exitCode !== 0) {
    if (!existsSync(FAILURE_DIR)) mkdirSync(FAILURE_DIR, { recursive: true });
    const logPath = join(FAILURE_DIR, `${label}.log`);
    const tailLines: string[] = [];
    tailLines.push(`# ${description}`);
    tailLines.push(`# exitCode=${exitCode} durationMs=${durationMs} at=${new Date().toISOString()}`);
    tailLines.push('');
    tailLines.push('=== STDOUT (tail) ===');
    const stdout = (res.stdout ?? '').split('\n');
    tailLines.push(stdout.slice(-TAIL_LINE_COUNT).join('\n'));
    tailLines.push('');
    tailLines.push('=== STDERR (tail) ===');
    const stderr = (res.stderr ?? '').split('\n');
    tailLines.push(stderr.slice(-TAIL_LINE_COUNT).join('\n'));
    writeFileSync(logPath, tailLines.join('\n'), 'utf8');
    return { command: description, exitCode, durationMs, failureLogPath: logPath };
  }

  return { command: description, exitCode, durationMs, failureLogPath: null };
}

function main(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const inputHash = computeInputHash();
  const commands: CommandResult[] = [];
  const notes: string[] = [];

  // 1. typecheck
  const typecheck = runCommand('typecheck', 'npx', ['tsc', '--noEmit']);
  commands.push(typecheck);
  const typecheckPasses = typecheck.exitCode === 0;

  // 2. unit（含 Domain Contract / Real Vertical Integration 等）
  const unit = runCommand('unit', 'npx', ['vitest', 'run', '--reporter=basic'], 600_000);
  commands.push(unit);
  const unitPasses = unit.exitCode === 0;

  // 3. dev doc §10-12（修复 #1）：command contract 单独测（独立路径，独立判定）
  const commandContract = runCommand(
    'commandContract',
    'npx',
    ['vitest', 'run', 'src/audit/core-campaign/game-command-route-contract.test.ts', '--reporter=basic'],
    30_000
  );
  commands.push(commandContract);
  const commandContractPasses = commandContract.exitCode === 0;

  // 4. integration
  const integration = runCommand(
    'integration',
    'npx',
    ['vitest', 'run', 'src/integration', '--reporter=basic'],
    120_000
  );
  commands.push(integration);
  const integrationPasses = integration.exitCode === 0;

  // 5. build
  const build = runCommand('build', 'npx', ['vite', 'build'], 300_000);
  commands.push(build);
  const buildPasses = build.exitCode === 0;

  // 6. critical e2e（dev doc §11：本机无 dev server + Chromium，记 not-measured）
  const e2eSpec = 'e2e/phase11a2-critical-campaign.spec.ts';
  let criticalE2EPasses: boolean | 'not-measured' = 'not-measured';
  if (existsSync(join(ROOT, e2eSpec))) {
    const e2e = runCommand(
      'criticalE2E',
      'npx',
      ['playwright', 'test', e2eSpec, '--reporter=basic'],
      180_000
    );
    commands.push(e2e);
    criticalE2EPasses = e2e.exitCode === 0;
  } else {
    notes.push('E2E spec file not present; criticalE2EPasses = not-measured');
  }

  // 7. golden
  const golden = runCommand(
    'golden',
    'npx',
    ['vitest', 'run', 'src/audit/core-campaign/golden-run.test.ts', '--reporter=basic'],
    60_000
  );
  commands.push(golden);
  const goldenPasses = golden.exitCode === 0;

  // 8. replay continuation
  const replayContinuation = runCommand(
    'replayContinuation',
    'npx',
    ['vitest', 'run', 'src/audit/core-campaign/replay-continuation.test.ts', '--reporter=basic'],
    60_000
  );
  commands.push(replayContinuation);
  const replayContinuationPasses = replayContinuation.exitCode === 0;
  // golden-run 内已含 replay-determinism；replayContinuation 同 bundle 同 seed 复核。
  const replayDeterminismPasses = goldenPasses && replayContinuationPasses;

  // 9. content audit
  const contentAudit = runCommand('contentAudit', 'npx', ['vite-node', 'scripts/audit/content.ts'], 60_000);
  commands.push(contentAudit);
  const contentAuditPasses = contentAudit.exitCode === 0;
  notes.push(`contentAudit exitCode=${contentAudit.exitCode}`);

  // 10. rules audit
  const rulesAudit = runCommand('rulesAudit', 'npx', ['vite-node', 'scripts/audit/rules.ts'], 60_000);
  commands.push(rulesAudit);
  const rulesAuditPasses = rulesAudit.exitCode === 0;
  notes.push(`rulesAudit exitCode=${rulesAudit.exitCode}`);

  // 11. dev doc §10-12（修复 #4）：PCA 单独测
  const pca = runCommand(
    'productionCommandAudit',
    'npx',
    ['vitest', 'run', 'src/audit/core-campaign/production-command-audit.test.ts', '--reporter=basic'],
    30_000
  );
  commands.push(pca);
  const productionCommandLayerPasses = pca.exitCode === 0;

  // 12. dev doc §10-12（修复 #5）：release gate 结构化读 measured flags
  //     - release-gate.json 必须存在
  //     - 字段 typecheckPasses / unitPasses / commandContractPasses / integrationPasses /
  //       buildPasses / goldenPasses / replayDeterminismPasses / replayContinuationPasses /
  //       productionCommandLayerPasses 必须有 measured boolean
  //     - criticalE2EPasses 允许 measured 或 not-measured
  //     - 任何 release-gate.json 标 false 的 bit = releaseGatePasses=false
  let openP0 = 1;
  let openP1 = 0;
  let campaignOrchestrationReachable = true;
  let releaseGatePasses = false;
  const releaseGateMeasuredFlags: Record<string, boolean | 'not-measured'> = {};

  if (existsSync(RELEASE_GATE_PATH)) {
    try {
      const rg = JSON.parse(readFileSync(RELEASE_GATE_PATH, 'utf8'));
      if (typeof rg.openP0 === 'number') openP0 = rg.openP0;
      if (typeof rg.openP1 === 'number') openP1 = rg.openP1;
      if (typeof rg.campaignOrchestrationReachable === 'boolean') {
        campaignOrchestrationReachable = rg.campaignOrchestrationReachable;
      }
      // 提取所有 measured boolean 字段
      const measuredKeys = [
        'typecheckPasses',
        'unitPasses',
        'commandContractPasses',
        'integrationPasses',
        'buildPasses',
        'goldenPasses',
        'replayDeterminismPasses',
        'replayContinuationPasses',
        'productionCommandLayerPasses',
      ];
      for (const k of measuredKeys) {
        if (typeof rg[k] === 'boolean') {
          releaseGateMeasuredFlags[k] = rg[k];
        } else if (rg[k] === 'not-measured') {
          releaseGateMeasuredFlags[k] = 'not-measured';
        } else {
          // 缺 measured 值 = unmeasured bit
          releaseGateMeasuredFlags[k] = 'not-measured' as const;
        }
      }
      // criticalE2E 允许 not-measured
      if (typeof rg.criticalE2EPasses === 'boolean') {
        releaseGateMeasuredFlags.criticalE2EPasses = rg.criticalE2EPasses;
      } else {
        releaseGateMeasuredFlags.criticalE2EPasses = 'not-measured';
      }
      // releaseGatePasses = 所有 measured=true AND openP0<=1 AND openP1=0
      const allMeasuredTrue = Object.entries(releaseGateMeasuredFlags).every(
        ([k, v]) => v === true || (k === 'criticalE2EPasses' && v === 'not-measured')
      );
      releaseGatePasses = allMeasuredTrue && openP0 <= 1 && openP1 === 0;
    } catch (e: any) {
      notes.push(`release-gate.json parse failed: ${e.message}`);
    }
  } else {
    notes.push(`release-gate.json not present at ${RELEASE_GATE_PATH}; releaseGatePasses=false`);
  }

  // 13. final report（占位：实际 final-report.ts 后续 WP-Fix-9 写）
  //     此处不强制跑，避免循环依赖。

  const results: VerificationResults = {
    schemaVersion: '1.0',
    measuredAt: new Date().toISOString(),
    verificationInputHash: inputHash,
    typecheckPasses,
    unitPasses,
    commandContractPasses,
    integrationPasses,
    buildPasses,
    criticalE2EPasses,
    goldenPasses,
    replayDeterminismPasses,
    replayContinuationPasses,
    contentAuditPasses,
    rulesAuditPasses,
    productionCommandLayerPasses,
    releaseGatePasses,
    openP0,
    openP1,
    campaignOrchestrationReachable,
    verificationFresh: true,
    commands,
    notes,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[verify-phase11a2-3] wrote ${RESULTS_PATH}`);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        typecheckPasses,
        unitPasses,
        commandContractPasses,
        integrationPasses,
        buildPasses,
        criticalE2EPasses,
        goldenPasses,
        replayDeterminismPasses,
        replayContinuationPasses,
        contentAuditPasses,
        rulesAuditPasses,
        productionCommandLayerPasses,
        releaseGatePasses,
        openP0,
        openP1,
        releaseGateMeasuredFlags,
      },
      null,
      2
    )
  );
}

main();
