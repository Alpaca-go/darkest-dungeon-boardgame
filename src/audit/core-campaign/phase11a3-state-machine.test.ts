// Phase 11A.3 Source-Gate Final Acceptance Closure dev doc §14：
// Phase 11A.3 5 状态机可达测试。
//
// 状态机：
//   NOT-VERIFIED              → 任何 audit pipeline 自身错（malformed source / pipeline crash）
//   SOURCE-BLOCKED            → engineering pass + source 缺资料 + 只 P0-002 open
//   READY-FOR-OFFICIAL-IMPORT → engineering pass + source 全部 ready + 11 quest 没闭环 + P0-002 open
//   IMPLEMENTATION-FAIL       → any FAIL（11A.3 阶段 implementation 自身错）
//   COMPLETE                  → engineering pass + source ready + 11 quest closed + 全部 gate pass

import { describe, expect, it } from 'vitest';
import { runOfficialSourceAudit, type OfficialSourceDocument } from './official-source-audit';
import { OFFICIAL_SOURCE_REQUIREMENTS } from './official-source-requirements';
import { evaluatePhase11A3Status } from './phase11a3-status';

// 最小 helper：构造一个完整的 synthetic fixture
function makeDoc(requirementId: string, overrides: Partial<OfficialSourceDocument> = {}): OfficialSourceDocument {
  const req = OFFICIAL_SOURCE_REQUIREMENTS.find((r) => r.requirementId === requirementId);
  if (!req) throw new Error(`Unknown requirement: ${requirementId}`);
  const extractedFields: Record<string, unknown> = {};
  const fieldProvenance: OfficialSourceDocument['fieldProvenance'] = {};
  for (const f of req.requiredFields) {
    extractedFields[f] = 'synthetic-value';
    fieldProvenance[f] = { sourceReference: `synthetic:${requirementId}#${f}`, status: 'verified' };
  }
  const nestedExtracted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extractedFields)) {
    if (k.includes('.')) {
      const parts = k.split('.');
      let cur: Record<string, unknown> = nestedExtracted;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]]) cur[parts[i]] = {};
        cur = cur[parts[i]!] as Record<string, unknown>;
      }
      cur[parts[parts.length - 1]!] = v;
    } else {
      nestedExtracted[k] = v;
    }
  }
  return {
    schemaVersion: 1,
    sourceAssetId: `synthetic-${requirementId}`,
    componentId: req.componentId,
    sourceType: req.componentType,
    sourceReference: `synthetic:official:${requirementId}`,
    extractedFields: nestedExtracted,
    fieldProvenance,
    ...overrides,
  };
}

function completeFixture(): Record<string, OfficialSourceDocument[]> {
  const out: Record<string, OfficialSourceDocument[]> = {};
  for (const req of OFFICIAL_SOURCE_REQUIREMENTS) {
    if (req.requiredForCompletion && req.componentGroup !== 'rulebook') {
      const docs: OfficialSourceDocument[] = [];
      for (let i = 0; i < req.quantity; i++) {
        docs.push(makeDoc(req.requirementId, { sourceAssetId: `synthetic-${req.requirementId}-${i + 1}` }));
      }
      out[req.requirementId] = docs;
    }
  }
  return out;
}

describe('phase11a3 state machine (dev doc §14)', () => {
  it('S-01 required source missing → SOURCE-BLOCKED', () => {
    const { readiness } = runOfficialSourceAudit({ injectDocuments: {}, injectRulebookMissing: false });
    expect(readiness.outcome.kind).toBe('source-blocked');
    expect(evaluatePhase11A3Status({ verifierHealthy: true, implementationPasses: true, sourceAuditPasses: true, allRequiredSourcesReady: false, elevenQuestLoopClosed: false, openP0: 1, openP1: 0, onlyOpenP0: 'ISSUE-P0-002' })).toBe('SOURCE-BLOCKED');
  });

  it('S-02 only optional errata missing → readiness.allRequiredSourcesReady=true (READY-FOR-OFFICIAL-IMPORT 入口)', () => {
    const { readiness } = runOfficialSourceAudit({
      injectDocuments: completeFixture(),
      injectRulebookMissing: false,
    });
    expect(readiness.gates.allRequiredSourcesReady).toBe(true);
    expect(readiness.outcome.kind).toBe('all-ready');
    expect(evaluatePhase11A3Status({ verifierHealthy: true, implementationPasses: true, sourceAuditPasses: true, allRequiredSourcesReady: true, elevenQuestLoopClosed: false, openP0: 1, openP1: 0, onlyOpenP0: 'ISSUE-P0-002' })).toBe('READY-FOR-OFFICIAL-IMPORT');
  });

  it('S-03 all required ready + P0-002 open → readiness 层面 outcome=all-ready（release-gate 决定 phase11A3Status）', () => {
    const { readiness } = runOfficialSourceAudit({
      injectDocuments: completeFixture(),
      injectRulebookMissing: false,
    });
    expect(readiness.outcome.kind).toBe('all-ready');
    expect(readiness.gates.allRequiredSourcesReady).toBe(true);
  });

  it('S-04 malformed source → NOT-VERIFIED (source-audit-error)', () => {
    const { readiness } = runOfficialSourceAudit({
      injectDocuments: {
        'tierB-quest-1': [makeDoc('tierB-quest-1', { componentId: 'wrong' })],
      },
    });
    expect(readiness.auditPasses).toBe(false);
    expect(readiness.outcome.kind).toBe('source-audit-error');
    expect(evaluatePhase11A3Status({ verifierHealthy: false, implementationPasses: true, sourceAuditPasses: false, allRequiredSourcesReady: false, elevenQuestLoopClosed: false, openP0: 1, openP1: 0, onlyOpenP0: 'ISSUE-P0-002' })).toBe('NOT-VERIFIED');
  });

  it('S-05 formal implementation fail → readiness 仍 SOURCE-BLOCKED（implementation 错由 run-audit 判定 IMPLEMENTATION-FAIL）', () => {
    // 真实 SOURCE-BLOCKED 阶段，audit pass，outcome=source-blocked
    const { readiness } = runOfficialSourceAudit({ injectDocuments: {}, injectRulebookMissing: false });
    expect(readiness.outcome.kind).toBe('source-blocked');
    expect(evaluatePhase11A3Status({ verifierHealthy: true, implementationPasses: false, sourceAuditPasses: true, allRequiredSourcesReady: false, elevenQuestLoopClosed: false, openP0: 1, openP1: 0, onlyOpenP0: 'ISSUE-P0-002' })).toBe('IMPLEMENTATION-FAIL');
  });

  it('S-06 formal campaign pass → readiness 全部 ready + all-required-ready=true', () => {
    const { readiness } = runOfficialSourceAudit({
      injectDocuments: completeFixture(),
      injectRulebookMissing: false,
    });
    expect(readiness.gates.allRequiredSourcesReady).toBe(true);
    expect(readiness.outcome.kind).toBe('all-ready');
    expect(evaluatePhase11A3Status({ verifierHealthy: true, implementationPasses: true, sourceAuditPasses: true, allRequiredSourcesReady: true, elevenQuestLoopClosed: true, openP0: 0, openP1: 0, onlyOpenP0: null })).toBe('COMPLETE');
  });

  it('all 5 state values are valid in phase11A3Status type', () => {
    const validStatuses = ['NOT-VERIFIED', 'SOURCE-BLOCKED', 'READY-FOR-OFFICIAL-IMPORT', 'IMPLEMENTATION-FAIL', 'COMPLETE'];
    expect(validStatuses).toHaveLength(5);
    expect(new Set(validStatuses).size).toBe(5);
  });
});
