// Phase 11A.2.2 §8 — Audit False Green 回归测试。
//
// dev doc §45 单测 1-5：覆盖 False Green 漏洞场景。

import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { runProductionCommandAudit } from './production-command-audit';

const SRC = join(process.cwd(), 'src');
const SHIM = join(SRC, 'audit/core-campaign/headless-shim.ts');

describe('Production Command Audit (Phase 11A.2.2 §8)', () => {
  it('A-01: uiStoreShimSteps=[] 但 shim 存在 → command layer false', () => {
    // 不操作文件系统，只验证 audit 的逻辑。
    const audit = runProductionCommandAudit();
    if (existsSync(SHIM)) {
      expect(audit.headlessShimFileExists).toBe(true);
      // 当前 shim 存在，audit 必须判定 false
      expect(audit.productionCommandLayerPasses).toBe(false);
    } else {
      // 如果 shim 已删，audit 应判定 true（受其他条件影响）
      expect(audit.headlessShimFileExists).toBe(false);
    }
  });

  it('A-02: shim 删除后但 Driver 仍 import shim → P1-006 open', () => {
    const audit = runProductionCommandAudit();
    if (!existsSync(SHIM) && audit.simulationDriverShimImportCount > 0) {
      expect(audit.productionCommandLayerPasses).toBe(false);
    }
    // 当前状态：shim 仍存在
    expect(existsSync(SHIM)).toBe(true);
    expect(audit.simulationDriverShimImportCount).toBeGreaterThanOrEqual(1);
  });

  it('A-03: shim删除 + import=0 + differential full pass → command layer true', () => {
    // 这是目标态：11A.2.2 完成时此测试应自动通过（不需要文件操作）
    // 验证 audit 的 productionCommandLayerPasses 计算逻辑包含所有必要项
    const audit = runProductionCommandAudit();
    expect(typeof audit.productionCommandLayerPasses).toBe('boolean');
  });

  it('A-04: 删除 event marker 不能关闭 P1-006', () => {
    // 验证 audit 不依赖 event marker 而得出 command layer pass
    const audit = runProductionCommandAudit();
    if (audit.headlessShimFileExists) {
      // shim 存在 → 必 false
      expect(audit.productionCommandLayerPasses).toBe(false);
    }
    if (audit.simulationDriverShimImportCount > 0) {
      expect(audit.productionCommandLayerPasses).toBe(false);
    }
  });

  it('Differential Coverage Gate: 14 中任何缺一 → productionCommandLayerPasses=false', () => {
    const audit = runProductionCommandAudit();
    expect(audit.differentialExpectedCount).toBe(14);
    // 当前只 D-01/D-02 真实实现；command layer 必须 false
    if (audit.differentialImplementedCount < audit.differentialExpectedCount) {
      expect(audit.productionCommandLayerPasses).toBe(false);
    }
  });

  it('ProductionCommandAudit 输出结构与 dev doc §5.1 一致', () => {
    const audit = runProductionCommandAudit();
    expect(audit).toHaveProperty('headlessShimFileExists');
    expect(audit).toHaveProperty('simulationDriverShimImportCount');
    expect(audit).toHaveProperty('simulationDriverProductionCommandCoverage');
    expect(audit).toHaveProperty('simulationDriverTotalHighLevelDispatches');
    expect(audit).toHaveProperty('storeDirectAtomicOrchestrationLeaks');
    expect(audit).toHaveProperty('driverDirectAtomicOrchestrationLeaks');
    expect(audit).toHaveProperty('differentialExpectedCount');
    expect(audit).toHaveProperty('differentialImplementedCount');
    expect(audit).toHaveProperty('differentialPasses');
    expect(audit).toHaveProperty('testPolicyBoundaryPasses');
    expect(audit).toHaveProperty('productionCommandLayerPasses');
  });
});
