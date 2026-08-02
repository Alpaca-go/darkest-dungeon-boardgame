// Phase 11A — 审计全链路编排。
//
// 为什么需要这个脚本而不是 npm 的 `&&` 链：
// `audit:release-gate` 在判定 FAIL 时**故意**以退出码 1 结束（CI 信号），
// 用 `&&` 串联会导致它之后的 `audit:final-report` 永远不执行 —— 也就是
// 「越是失败，越拿不到最终报告」，恰好和审计的目的相反。
//
// 本脚本的语义：
//   1. 前置步骤（content / rules / test:golden）任一失败 → 立即中止（数据都没有，报告无意义）。
//   2. release-gate 无论 PASS/FAIL 都继续跑 final-report。
//   3. 进程最终退出码 = release-gate 的退出码（保留 CI 门禁语义）。

import { spawnSync } from 'child_process';

import { banner } from './io';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(script: string, env?: NodeJS.ProcessEnv): number {
  const r = spawnSync(npmCmd, ['run', script], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  return r.status ?? 1;
}

/** 前置步骤：失败即中止，因为后续报告会读到过期或缺失的数据产物。 */
const PREREQUISITES = ['audit:content', 'audit:rules', 'test:golden'];

for (const step of PREREQUISITES) {
  const code = run(step);
  if (code !== 0) {
    banner('audit:all 中止');
    console.error(`前置步骤 \`${step}\` 失败（退出码 ${code}）。`);
    console.error('未生成最终报告：数据产物不完整时生成报告会得到失真结论。');
    process.exit(code);
  }
}

// ---------------------------------------------------------------------------
// 真实测量 build / 全量单测
//
// ReleaseGateResult 里这两位默认 `?? false`，但「未测量」与「测量后失败」在报告里
// 是完全不同的结论。这里实测一次并通过 env flag 注入，避免出现
// 「build 明明是过的、报告写 ❌」这种反向失真。
// integration / E2E 本阶段不跑，保持 undefined → 报告渲染为「⚪ 未验证」。
// ---------------------------------------------------------------------------

banner('audit:all 实测 build / unit');
const buildCode = run('build');
const unitCode = run('test');
console.log(`build : ${buildCode === 0 ? 'PASS' : `FAIL(${buildCode})`}`);
console.log(`unit  : ${unitCode === 0 ? 'PASS' : `FAIL(${unitCode})`}`);

// Release Gate：允许 FAIL，但必须继续产出最终报告。
const gateCode = run('audit:release-gate', {
  PHASE11A_BUILD: buildCode === 0 ? 'pass' : 'fail',
  PHASE11A_UNIT: unitCode === 0 ? 'pass' : 'fail',
});

// §32 性能基线：必须先于最终报告生成，final-report 会读取 performance-baseline.json
// 把「Performance Baseline」一项从「未采集」改为已采集。
const perfCode = run('audit:performance-baseline');
if (perfCode !== 0) {
  console.error('⚠️ 性能基线生成失败，最终报告将仍标记该项为未采集。');
}

const reportCode = run('audit:final-report');

banner('audit:all 汇总');
console.log(`release-gate 退出码 : ${gateCode}${gateCode === 0 ? '（PASS）' : '（FAIL / CONDITIONAL）'}`);
console.log(`final-report 退出码 : ${reportCode}`);

if (reportCode !== 0) {
  console.error('⚠️ 最终报告生成失败，这本身是一个必须修复的问题。');
  process.exit(reportCode);
}

// 保留门禁语义：审计链路整体以 Release Gate 的判定为准。
process.exit(gateCode);
