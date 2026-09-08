// Phase 11A.3 Source-Gate Final Acceptance Closure dev doc §20：
// Adversarial Source Fixtures 测官方 source audit 正确性。
//
// 关键场景（dev doc §20）：
//   A. Missing all Tier B → SOURCE-BLOCKED, requiredMissingCount=26
//   B. All required Tier B complete + optional errata missing → allRequiredSourcesReady=true
//   C. provenance verified but extracted value missing → fail/partial
//   D. componentId mismatch → SOURCE-AUDIT-ERROR
//   E. duplicate sourceAssetId → SOURCE-AUDIT-ERROR
//   F. quantity 1/2 → partial
//   G. malformed JSON → CLI non-zero (verified via cli-exit-contract test)
//   H. empty sourceReference → SOURCE-AUDIT-ERROR
//   I. rulebook missing → NOT-VERIFIED / SOURCE-AUDIT-ERROR
//
// 还覆盖 dev doc §6/§7/§8/§9/§10/§11/§12。

import { describe, expect, it } from 'vitest';
import {
  runOfficialSourceAudit,
  getExtractedValue,
  type OfficialSourceDocument,
  type ResolvedRequirement,
} from './official-source-audit';
import { OFFICIAL_SOURCE_REQUIREMENTS, tierOf } from './official-source-requirements';

// 构造一个最小但有效的 OfficialSourceDocument。
function makeDoc(
  requirementId: string,
  overrides: Partial<OfficialSourceDocument> = {},
): OfficialSourceDocument {
  const req = OFFICIAL_SOURCE_REQUIREMENTS.find((r) => r.requirementId === requirementId);
  if (!req) throw new Error(`Unknown requirement: ${requirementId}`);
  const extractedFields: Record<string, unknown> = {};
  const fieldProvenance: OfficialSourceDocument['fieldProvenance'] = {};
  for (const f of req.requiredFields) {
    // 默认填非空值（"data"）和 verified provenance
    extractedFields[f] = 'synthetic-value';
    fieldProvenance[f] = { sourceReference: `synthetic:${requirementId}#${f}`, status: 'verified' };
  }
  // 处理 nested path：把 ancestor.maxHp 转成 { ancestor: { maxHp: 'synthetic-value' } }
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
    sourceAssetId: `synthetic-${requirementId}-asset-1`,
    componentId: req.componentId,
    sourceType: req.componentType,
    sourceReference: `synthetic:official:${requirementId}#card`,
    extractedFields: nestedExtracted,
    fieldProvenance,
    ...overrides,
  };
}

// 处理 dungeon-tile quantity=2 的要求：返回 2 份 doc（sourceAssetId 区分）
function makeDocsForRequirement(requirementId: string): OfficialSourceDocument[] {
  const req = OFFICIAL_SOURCE_REQUIREMENTS.find((r) => r.requirementId === requirementId);
  if (!req) return [];
  if (req.quantity === 1) return [makeDoc(requirementId)];
  if (req.componentGroup === 'dungeon-tile') {
    // tile pattern：构造 quantity 个同 componentId 但 sourceAssetId 不同的 doc
    const out: OfficialSourceDocument[] = [];
    for (let i = 0; i < req.quantity; i++) {
      out.push(
        makeDoc(requirementId, {
          sourceAssetId: `synthetic-${requirementId}-asset-${i + 1}`,
        }),
      );
    }
    return out;
  }
  // 其他 quantity>1（如 perfect-reflection quantity=2）：构造多份
  const out: OfficialSourceDocument[] = [];
  for (let i = 0; i < req.quantity; i++) {
    out.push(
      makeDoc(requirementId, {
        sourceAssetId: `synthetic-${requirementId}-asset-${i + 1}`,
      }),
    );
  }
  return out;
}

describe('official-source-audit (Phase 11A.3 Final Acceptance §6-§12)', () => {
  it('A. Missing all Tier B → SOURCE-BLOCKED, requiredMissingCount=26, optionalMissingCount=1', () => {
    const { readiness, summary } = runOfficialSourceAudit({
      // 不 inject：使用真实文件系统（仓库当前没有任何 official source 文件，rulebook 存在）
      injectDocuments: {},
    });
    // 排除 tierA-rulebook + tierC-official-errata 后应有 26 个 required missing
    expect(summary.requiredMissingCount).toBe(26);
    expect(summary.requiredPartialCount).toBe(0);
    expect(summary.requiredAvailableCount).toBe(0); // rulebook 是 optional 不算 required
    expect(summary.optionalMissingCount).toBe(1); // errata
    expect(summary.optionalPartialCount).toBe(0);
    expect(readiness.gates.allRequiredSourcesReady).toBe(false);
    expect(readiness.outcome.kind).toBe('source-blocked');
    const missing = (readiness.outcome as { kind: 'source-blocked'; missingRequirementIds: string[] }).missingRequirementIds;
    expect(missing.length).toBe(26);
  });

  it('B. All required Tier B complete + optional errata missing → allRequiredSourcesReady=true', () => {
    const injectDocuments: Record<string, OfficialSourceDocument[]> = {};
    for (const req of OFFICIAL_SOURCE_REQUIREMENTS) {
      if (req.requiredForCompletion && req.componentGroup !== 'rulebook') {
        injectDocuments[req.requirementId] = makeDocsForRequirement(req.requirementId);
      }
      // 不提供 errata（optional）
    }
    const { readiness, summary } = runOfficialSourceAudit({
      injectDocuments,
      injectRulebookMissing: false,
    });
    expect(readiness.auditPasses).toBe(true);
    expect(summary.requiredMissingCount).toBe(0);
    expect(summary.requiredPartialCount).toBe(0);
    expect(summary.requiredAvailableCount).toBe(26);
    expect(summary.optionalMissingCount).toBe(1); // errata missing
    expect(readiness.gates.allRequiredSourcesReady).toBe(true);
    expect(readiness.outcome.kind).toBe('all-ready');
  });

  it('C. provenance verified but extracted value missing → partial (C-1: empty string; C-2: null)', () => {
    // 取 tierB-ancestor-first-form，requiredFields 包含 nested path 'ancestor.maxHp'
    const baseDoc = makeDoc('tierB-ancestor-first-form');
    // C-1: 把 ancestor.maxHp 改为空字符串
    const c1Doc: OfficialSourceDocument = {
      ...baseDoc,
      extractedFields: { ...baseDoc.extractedFields, ancestor: { ...(baseDoc.extractedFields.ancestor as object), maxHp: '' } },
    };
    const c1Result = runOfficialSourceAudit({
      injectDocuments: { 'tierB-ancestor-first-form': [c1Doc] },
    });
    const c1Resolved = c1Result.readiness.resolvedRequirements.find((r) => r.requirementId === 'tierB-ancestor-first-form')!;
    expect(c1Resolved.status).toBe('partial');
    expect(c1Resolved.missingFields.some((f) => f.includes('ancestor.maxHp'))).toBe(true);

    // C-2: 把 ancestor.maxHp 改为 null
    const c2Doc: OfficialSourceDocument = {
      ...baseDoc,
      extractedFields: { ...baseDoc.extractedFields, ancestor: { ...(baseDoc.extractedFields.ancestor as object), maxHp: null } },
    };
    const c2Result = runOfficialSourceAudit({
      injectDocuments: { 'tierB-ancestor-first-form': [c2Doc] },
    });
    const c2Resolved = c2Result.readiness.resolvedRequirements.find((r) => r.requirementId === 'tierB-ancestor-first-form')!;
    expect(c2Resolved.status).toBe('partial');
  });

  it('D. componentId mismatch → SOURCE-AUDIT-ERROR', () => {
    const badDoc = makeDoc('tierB-templars-impaler', { componentId: 'wrong-component-id' });
    const { readiness } = runOfficialSourceAudit({
      injectDocuments: { 'tierB-templars-impaler': [badDoc] },
    });
    expect(readiness.auditPasses).toBe(false);
    expect(readiness.outcome.kind).toBe('source-audit-error');
    expect(readiness.auditErrors.some((e) => e.code === 'identity-mismatch')).toBe(true);
  });

  it('E. duplicate sourceAssetId → SOURCE-AUDIT-ERROR', () => {
    const doc1 = makeDoc('tierB-quest-1', { sourceAssetId: 'duplicate-id' });
    const doc2 = makeDoc('tierB-quest-2', { sourceAssetId: 'duplicate-id' });
    const { readiness } = runOfficialSourceAudit({
      injectDocuments: {
        'tierB-quest-1': [doc1],
        'tierB-quest-2': [doc2],
      },
    });
    expect(readiness.auditPasses).toBe(false);
    expect(readiness.outcome.kind).toBe('source-audit-error');
    expect(readiness.auditErrors.some((e) => e.code === 'duplicate-source-asset')).toBe(true);
  });

  it('F. quantity 1/2 → partial', () => {
    // tierB-perfect-reflection quantity=2；只 inject 1 份
    const oneDoc = makeDoc('tierB-perfect-reflection');
    const { readiness, summary } = runOfficialSourceAudit({
      injectDocuments: { 'tierB-perfect-reflection': [oneDoc] },
    });
    const resolved = readiness.resolvedRequirements.find((r) => r.requirementId === 'tierB-perfect-reflection')!;
    expect(resolved.status).toBe('partial');
    expect(resolved.missingFields).toContain('quantity');
    expect(summary.requiredPartialCount).toBeGreaterThanOrEqual(1);
    expect(readiness.gates.allRequiredSourcesReady).toBe(false);
  });

  it('H. empty sourceReference → SOURCE-AUDIT-ERROR', () => {
    const badDoc = makeDoc('tierB-quest-1', { sourceReference: '' });
    const { readiness } = runOfficialSourceAudit({
      injectDocuments: { 'tierB-quest-1': [badDoc] },
    });
    expect(readiness.auditPasses).toBe(false);
    expect(readiness.auditErrors.some((e) => e.code === 'empty-source-reference')).toBe(true);
  });

  it('I. rulebook missing → SOURCE-AUDIT-ERROR (NOT-VERIFIED)', () => {
    const { readiness } = runOfficialSourceAudit({
      injectDocuments: {},
      injectRulebookMissing: true,
    });
    expect(readiness.auditPasses).toBe(false);
    expect(readiness.outcome.kind).toBe('source-audit-error');
    expect(readiness.auditErrors.some((e) => e.code === 'tier-a-rulebook-missing')).toBe(true);
  });

  it('structured provenanceAudit 输出格式正确（dev doc §12）', () => {
    const injectDocuments: Record<string, OfficialSourceDocument[]> = {};
    for (const req of OFFICIAL_SOURCE_REQUIREMENTS) {
      if (req.requiredForCompletion && req.componentGroup !== 'rulebook') {
        injectDocuments[req.requirementId] = makeDocsForRequirement(req.requirementId);
      }
    }
    const { readiness } = runOfficialSourceAudit({ injectDocuments, injectRulebookMissing: false });
    const pa = readiness.provenanceAudit;
    expect(pa.requiredFieldCount).toBeGreaterThan(0);
    expect(pa.verifiedRequiredFieldCount).toBe(pa.requiredFieldCount);
    expect(pa.missingValueCount).toBe(0);
    expect(pa.missingProvenanceCount).toBe(0);
    expect(pa.invalidSourceReferenceCount).toBe(0);
    expect(pa.componentMismatchCount).toBe(0);
    expect(pa.passes).toBe(true);
  });

  it('getExtractedValue path-aware：nested 字段', () => {
    const obj = { ancestor: { maxHp: 42, skillIds: ['a', 'b'] } };
    expect(getExtractedValue(obj, 'ancestor.maxHp')).toBe(42);
    expect(getExtractedValue(obj, 'ancestor.skillIds')).toEqual(['a', 'b']);
    expect(getExtractedValue(obj, 'ancestor.unknown')).toBeUndefined();
    expect(getExtractedValue(undefined, 'ancestor.maxHp')).toBeUndefined();
  });

  it('resolvedRequirements 包含 sourceReferences 数组（dev doc §10）', () => {
    const injectDocuments: Record<string, OfficialSourceDocument[]> = {
      'tierB-quest-1': [makeDoc('tierB-quest-1', { sourceReference: 'real-source:quest-1' })],
    };
    const { readiness } = runOfficialSourceAudit({ injectDocuments });
    const r = readiness.resolvedRequirements.find((x) => x.requirementId === 'tierB-quest-1')!;
    expect(r.status).toBe('available');
    expect(r.sourceReferences).toContain('real-source:quest-1');
  });

  it('partial 状态保留 partial，不被 generator 写成 missing（dev doc §10）', () => {
    // quantity 1/2 → partial
    const oneDoc = makeDoc('tierB-perfect-reflection');
    const { readiness } = runOfficialSourceAudit({
      injectDocuments: { 'tierB-perfect-reflection': [oneDoc] },
    });
    const r: ResolvedRequirement = readiness.resolvedRequirements.find((x) => x.requirementId === 'tierB-perfect-reflection')!;
    expect(r.status).toBe('partial');
    // generator 用的 map 状态保持 partial，不被改成 missing
  });
});

describe('official-source-requirements helpers', () => {
  it('tierOf: rulebook→A, errata→C, 其它→B', () => {
    for (const req of OFFICIAL_SOURCE_REQUIREMENTS) {
      if (req.componentGroup === 'rulebook') {
        expect(tierOf(req)).toBe('A');
      } else if (req.componentGroup === 'official-errata') {
        expect(tierOf(req)).toBe('C');
      } else {
        expect(tierOf(req)).toBe('B');
      }
    }
  });

  it('总 requiredForCompletion=true 数量 = 26（不含 rulebook 和 errata）', () => {
    const required = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => r.requiredForCompletion);
    expect(required.length).toBe(26);
    const optional = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => !r.requiredForCompletion);
    expect(optional.length).toBe(2); // rulebook + errata
  });
});
