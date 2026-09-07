// Phase 11A.2.2 §36 — Gate/Ledger/Report 一致性测试 C-01..C-10。
//
// dev doc §36：单一数据源 = AuditResult；Gate / Ledger / Report / Verification
// 任何字段都从 AuditResult 派生，不得各自重新猜。
//
// C-09（campaignOrchestrationReachable 一致）已在 Golden Run 内验证。
// C-10（verificationInputHash 一致）依赖 WP-I 提供的 verification-results.json。
// 本文件覆盖 C-01..C-08。

import { describe, expect, it } from 'vitest';
import { stableHashState } from './types';
import { generateContentManifest } from './content-manifest';
import { runAudit, type AuditReport, type RunAuditOptions } from './run-audit';
import { runProductionCommandAudit } from './production-command-audit';

const BASE_OPTIONS: RunAuditOptions = {
  buildPasses: true,
  unitPasses: true,
  integrationPasses: true,
  criticalE2EPasses: false, // C-07 E2E 暂未做（WP-G 待 Playwright E2E）
};

describe('Consistency Tests C-01..C-10 (Phase 11A.2.2 §36)', () => {
  let report: AuditReport;

  it('setup: 跑一次完整 audit', () => {
    report = runAudit(BASE_OPTIONS);
    expect(report).toBeDefined();
    expect(report.gate).toBeDefined();
    expect(report.issues).toBeDefined();
  });

  it('C-01: openP0 = issues 中 P0 + status=open 的数量', () => {
    const computedOpenP0 = report.issues.filter(
      (i) => i.severity === 'P0' && i.status === 'open',
    ).length;
    expect(report.gate.openP0).toBe(computedOpenP0);
  });

  it('C-02: openP1 = issues 中 P1 + status=open 的数量', () => {
    const computedOpenP1 = report.issues.filter(
      (i) => i.severity === 'P1' && i.status === 'open',
    ).length;
    expect(report.gate.openP1).toBe(computedOpenP1);
  });

  it('C-03: productionCommandLayerPasses = pcaResult.productionCommandLayerPasses', () => {
    const pca = runProductionCommandAudit();
    expect(report.gate.productionCommandLayerPasses).toBe(
      pca.productionCommandLayerPasses,
    );
  });

  it('C-04: buildPasses = options.buildPasses', () => {
    expect(report.gate.buildPasses).toBe(BASE_OPTIONS.buildPasses);
  });

  it('C-05: unitPasses = options.unitPasses', () => {
    expect(report.gate.unitPasses).toBe(BASE_OPTIONS.unitPasses);
  });

  it('C-06: integrationPasses = options.integrationPasses', () => {
    expect(report.gate.integrationPasses).toBe(BASE_OPTIONS.integrationPasses);
  });

  it('C-07: criticalE2EPasses = options.criticalE2EPasses', () => {
    expect(report.gate.criticalE2EPasses).toBe(BASE_OPTIONS.criticalE2EPasses);
  });

  it('C-08: replayDeterminismPasses = replayDeterminism.identical', () => {
    expect(report.gate.replayDeterminismPasses).toBe(report.replayDeterminism.identical);
  });

  it('C-09: campaignOrchestrationReachable = goldenRun.campaignOrchestrationReachable', () => {
    expect(report.gate.campaignOrchestrationReachable).toBe(
      report.goldenRun.campaignOrchestrationReachable,
    );
  });

  it('C-10: 重新跑 audit → manifestHash 一致（同一 content manifest）', () => {
    const manifestHash1 = report.manifestHash;
    const manifest = generateContentManifest();
    const manifestHash2 = stableHashState(manifest);
    expect(manifestHash1).toBe(manifestHash2);
  });
});
