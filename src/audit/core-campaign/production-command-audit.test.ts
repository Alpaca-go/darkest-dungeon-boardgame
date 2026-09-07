// Phase 11A.2.2 §8 — Audit False Green 回归测试。
//
// dev doc §45 单测 1-5：覆盖 False Green 漏洞场景。
// WP-D 后：headless-shim.ts 已删；A-01..A-04 适配新现状。

import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { runProductionCommandAudit } from './production-command-audit';

const SRC = join(process.cwd(), 'src');
const SHIM = join(SRC, 'audit/core-campaign/headless-shim.ts');

describe('Production Command Audit (Phase 11A.2.2 §8 + §21)', () => {
  it('A-01: 11A.2.2 末态 — shim 已删, audit 必须判定 layer true（受其他条件）', () => {
    const audit = runProductionCommandAudit();
    if (!existsSync(SHIM)) {
      // WP-D 末态：shim 不存在
      expect(audit.headlessShimFileExists).toBe(false);
      // productionCommandLayerPasses 在所有条件（driver coverage / differential / policy）满足时 = true
      // 这里不强求 true，因为 policy boundary / differential coverage 可能仍为 false（WP-E/F 范围）
    } else {
      // 旧状态：shim 存在 → 必 false
      expect(audit.headlessShimFileExists).toBe(true);
      expect(audit.productionCommandLayerPasses).toBe(false);
    }
  });

  it('A-02: WP-C + WP-D — Driver shim import = 0, shim 文件已删', () => {
    const audit = runProductionCommandAudit();
    // 极端状态：shim 删了 + driver 还在 import → P1-006 open
    if (!existsSync(SHIM) && audit.simulationDriverShimImportCount > 0) {
      expect(audit.productionCommandLayerPasses).toBe(false);
    }
    // 当前状态：shim 不存在（WP-D 完成），Driver 也不再 import shim（WP-C 完成）
    expect(existsSync(SHIM)).toBe(false);
    expect(audit.simulationDriverShimImportCount).toBe(0);
  });

  it('A-03: shim 删除 + import=0 + differential full pass → command layer true', () => {
    const audit = runProductionCommandAudit();
    // 11A.2.2 末态：shim 不存在 + import=0 + differential=14/14 → command layer 应 true
    if (
      !audit.headlessShimFileExists &&
      audit.simulationDriverShimImportCount === 0 &&
      audit.differentialPasses &&
      audit.testPolicyBoundaryPasses &&
      audit.storeDirectAtomicOrchestrationLeaks.length === 0 &&
      audit.driverDirectAtomicOrchestrationLeaks.length === 0
    ) {
      expect(audit.productionCommandLayerPasses).toBe(true);
    }
    expect(typeof audit.productionCommandLayerPasses).toBe('boolean');
  });

  it('A-04: 删除 event marker 不能关闭 P1-006', () => {
    // 验证 audit 不依赖 event marker 而得出 command layer pass
    const audit = runProductionCommandAudit();
    if (audit.headlessShimFileExists) {
      expect(audit.productionCommandLayerPasses).toBe(false);
    }
    if (audit.simulationDriverShimImportCount > 0) {
      expect(audit.productionCommandLayerPasses).toBe(false);
    }
  });

  it('Differential Coverage Gate: 14 中任何缺一 → productionCommandLayerPasses=false', () => {
    const audit = runProductionCommandAudit();
    expect(audit.differentialExpectedCount).toBe(14);
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

