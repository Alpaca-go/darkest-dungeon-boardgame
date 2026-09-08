// Phase 11A.3 Source-Gate Final Acceptance Closure dev doc §3-12：
// Official Source Audit 模块。
//
// 职责：
//   1. Load canonical requirements（来自 official-source-requirements.ts）
//   2. Discover docs/data/darkest-dungeon/official/** 结构化 JSON
//   3. Identity / Quantity / Schema 校验
//   4. 字段级 provenance validation（extracted value + provenance status + sourceReference 三重）
//   5. 派生 SourceReadinessResult 与 ResolvedRequirement（generator 直接消费，不允许从 blockers 逆推）
//   6. 区分 SOURCE-AUDIT-ERROR（malformed / contradictory）vs SOURCE-BLOCKED（缺资料）
//   7. 结构化 provenanceAudit 输出
//   8. requiredForCompletion 驱动 allRequiredSourcesReady
//
// 禁止：
//   - 默认真相 = "source missing"：audit 正常执行 + 全部需求被解析为 missing 才能 SOURCE-BLOCKED
//   - 默认真相 = "source malformed"：必须 audit 显式报 NOT-VERIFIED / SOURCE-AUDIT-ERROR
//   - 跳过字段级 verification
//   - 把 expectedSourcePattern 写入 sourceReference（不是 authoritative source）
//   - 让 optional 资料阻塞 allRequiredSourcesReady

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  OFFICIAL_SOURCE_REQUIREMENTS,
  summarizeRequirements,
  type OfficialSourceRequirement,
  type OfficialSourceSummary,
} from './official-source-requirements';

// Re-export so external callers don't need to know internal module split.
export type {
  OfficialSourceRequirement,
  OfficialSourceSummary,
} from './official-source-requirements';
export {
  OFFICIAL_SOURCE_REQUIREMENTS,
  findRequirement,
  getRequirementsByGroup,
  getOfficialActFourRequirementIds,
  getOfficialActFourRequirements,
} from './official-source-requirements';

// ---------------------------------------------------------------------------
// Source Document schema（用户后续提供的结构化 JSON）
// ---------------------------------------------------------------------------

export interface OfficialSourceDocument {
  schemaVersion: 1;
  sourceAssetId: string;
  componentId: string;
  sourceType: string;
  sourceReference: string;
  checksum?: string;
  extractedFields: Record<string, unknown>;
  fieldProvenance: Record<
    string,
    { sourceReference: string; status: 'verified' | 'partial' }
  >;
}

// ---------------------------------------------------------------------------
// Audit 错误信号
// ---------------------------------------------------------------------------

export type SourceAuditErrorCode =
  | 'malformed-source-file'
  | 'duplicate-source-asset'
  | 'verified-field-without-provenance'
  | 'verified-field-without-extracted-value'
  | 'inconsistent-quantity'
  | 'schema-mismatch'
  | 'identity-mismatch'
  | 'source-type-mismatch'
  | 'empty-source-reference'
  | 'tier-a-rulebook-missing'
  | 'quantity-mismatch';

export interface SourceAuditError {
  code: SourceAuditErrorCode;
  requirementId?: string;
  sourceAssetId?: string;
  message: string;
}

export type SourceAuditOutcome =
  | { kind: 'all-ready' }
  | { kind: 'source-blocked'; missingRequirementIds: string[]; partialRequirementIds: string[] }
  | { kind: 'source-audit-error'; errors: SourceAuditError[] };

// ---------------------------------------------------------------------------
// ResolvedRequirement（dev doc §10）：audit 直接产出，generator 只消费，不准从 blockers 推
// ---------------------------------------------------------------------------

export type RequirementStatus = 'available' | 'partial' | 'missing' | 'invalid';

export interface ResolvedRequirement {
  requirementId: string;
  status: RequirementStatus;
  /** 解析到的 source document 数量（rulebook = 0, errata 可能 0 或 1）。 */
  resolvedAssetCount: number;
  /** status===partial 或 missing 时必填；available 时为空。 */
  missingFields: string[];
  /** status===available 时非空，列出所有 source asset id。 */
  sourceAssetIds: string[];
  /** status===available 时非空，列出所有 source reference（来自官方 sourceReference）。 */
  sourceReferences: string[];
  /** 用于 manifest / 报告展示。 */
  reason: string;
}

// ---------------------------------------------------------------------------
// Structured Provenance Audit（dev doc §12）
// ---------------------------------------------------------------------------

export interface ProvenanceAudit {
  requiredFieldCount: number;
  verifiedRequiredFieldCount: number;
  missingValueCount: number;
  missingProvenanceCount: number;
  invalidSourceReferenceCount: number;
  componentMismatchCount: number;
  passes: boolean;
}

// ---------------------------------------------------------------------------
// Source Readiness Result（canonical 派生结果；不是读 JSON）
// ---------------------------------------------------------------------------

export interface SourceReadinessResult {
  schemaVersion: 3;
  generatedAt: string;
  inputHash: string;

  requirementCount: number;
  resolvedCount: number;
  missingCount: number;
  invalidCount: number;

  auditPasses: boolean;

  gates: {
    questCardsReady: boolean;
    templarsReady: boolean;
    mammothCystReady: boolean;
    shufflingHorrorReady: boolean;
    finalEncounterReady: boolean;
    darkestDungeonMonsterDeckReady: boolean;
    allRequiredSourcesReady: boolean;
  };

  /** dev doc §10：所有 requirement 的解析结果（generator / manifest / summary 唯一来源）。 */
  resolvedRequirements: ResolvedRequirement[];

  /** 保留向后兼容；不再用于 generator 推导。 */
  blockers: Array<{
    requirementId: string;
    missingFields: string[];
    reason: string;
  }>;

  auditErrors: SourceAuditError[];

  /** dev doc §12：结构化 provenance 审计。 */
  provenanceAudit: ProvenanceAudit;

  outcome: SourceAuditOutcome;
}

// ---------------------------------------------------------------------------
// Tier A Rulebook 真实存在性校验（dev doc §9）
// ---------------------------------------------------------------------------

const TIER_A_RULEBOOK_PATH = 'docs/DD_EN_COREBOX_RULES.pdf';

function checkTierARulebook(): SourceAuditError[] {
  const errors: SourceAuditError[] = [];
  const exists = existsSync(TIER_A_RULEBOOK_PATH);
  // 一些 Windows / git LFS 环境下 statSync 可能 throw（permission 等），显式 catch
  let readable = false;
  if (exists) {
    try {
      statSync(TIER_A_RULEBOOK_PATH);
      readable = true;
    } catch {
      readable = false;
    }
  }
  if (!exists || !readable) {
    errors.push({
      code: 'tier-a-rulebook-missing',
      requirementId: 'tierA-rulebook',
      message: `Tier A rulebook missing or unreadable: ${TIER_A_RULEBOOK_PATH}`,
    });
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Source Discovery
// ---------------------------------------------------------------------------

const OFFICIAL_ROOT = 'docs/data/darkest-dungeon/official';

function expandBraces(pattern: string): string[] {
  if (!pattern.includes('*')) return [pattern];
  const rel = pattern.replace(/^docs\/data\/darkest-dungeon\/official\//, '');
  const dir = join(OFFICIAL_ROOT, rel.split('/').slice(0, -1).join('/'));
  const filenamePattern = rel.split('/').pop()!;
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => {
    const regex = new RegExp(
      '^' + filenamePattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$',
    );
    return regex.test(f);
  });
  return files.map((f) => join(dir, f));
}

interface DiscoveryEntry {
  requirementId: string;
  sourcePath: string;
  document: OfficialSourceDocument | null;
  error?: SourceAuditError;
}

function discoverAndLoad(
  requirements: OfficialSourceRequirement[],
  errors: SourceAuditError[],
  seenAssetIds: Map<string, string>,
): { entries: DiscoveryEntry[] } {
  const entries: DiscoveryEntry[] = [];

  for (const req of requirements) {
    if (req.componentGroup === 'rulebook') {
      // Tier A 由 checkTierARulebook 单独处理
      continue;
    }
    const paths = expandBraces(req.sourceFilePattern);
    if (paths.length === 0) {
      entries.push({
        requirementId: req.requirementId,
        sourcePath: '(none)',
        document: null,
      });
      continue;
    }
    // quantity vs paths：tile pattern（dd-tile-*.json）允许 brace expansion 任意；
    // 其他 requirement 走严格 quantity
    const useQuantity = req.componentGroup !== 'dungeon-tile';
    const expectedCount = useQuantity ? req.quantity : paths.length;
    if (paths.length < expectedCount) {
      // 资料部分缺失：把现有 path 试着 load，缺的部分当成 missing
      const partialDoc = paths[0] ? tryLoad(paths[0], errors, req, seenAssetIds) : null;
      entries.push({
        requirementId: req.requirementId,
        sourcePath: paths[0] ?? '(none)',
        document: partialDoc,
      });
      continue;
    }
    for (const p of paths.slice(0, expectedCount)) {
      const doc = tryLoad(p, errors, req, seenAssetIds);
      entries.push({
        requirementId: req.requirementId,
        sourcePath: p,
        document: doc,
      });
    }
  }

  return { entries };
}

function tryLoad(
  path: string,
  errors: SourceAuditError[],
  req: OfficialSourceRequirement,
  seenAssetIds: Map<string, string>,
): OfficialSourceDocument | null {
  if (!existsSync(path)) {
    return null;
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (e) {
    errors.push({
      code: 'malformed-source-file',
      requirementId: req.requirementId,
      message: `Read failed: ${e instanceof Error ? e.message : String(e)}`,
    });
    return null;
  }
  let parsed: OfficialSourceDocument;
  try {
    parsed = JSON.parse(raw) as OfficialSourceDocument;
  } catch (e) {
    errors.push({
      code: 'malformed-source-file',
      requirementId: req.requirementId,
      message: `Parse failed: ${e instanceof Error ? e.message : String(e)}`,
    });
    return null;
  }
  // Schema 校验
  if (parsed.schemaVersion !== 1) {
    errors.push({
      code: 'schema-mismatch',
      requirementId: req.requirementId,
      sourceAssetId: parsed.sourceAssetId,
      message: `schemaVersion=${parsed.schemaVersion}, expected 1`,
    });
    return null;
  }
  // Identity 校验（dev doc §8）+ duplicate detection
  validateIdentity(parsed, req, errors);
  if (parsed.sourceAssetId && parsed.sourceAssetId.trim() !== '') {
    if (seenAssetIds.has(parsed.sourceAssetId)) {
      errors.push({
        code: 'duplicate-source-asset',
        requirementId: req.requirementId,
        sourceAssetId: parsed.sourceAssetId,
        message: `Duplicate sourceAssetId "${parsed.sourceAssetId}" (first used by ${seenAssetIds.get(parsed.sourceAssetId)})`,
      });
    } else {
      seenAssetIds.set(parsed.sourceAssetId, req.requirementId);
    }
  }
  return parsed;
}

function validateIdentity(
  doc: OfficialSourceDocument,
  req: OfficialSourceRequirement,
  errors: SourceAuditError[],
): void {
  if (!doc.sourceAssetId || typeof doc.sourceAssetId !== 'string' || doc.sourceAssetId.trim() === '') {
    errors.push({
      code: 'identity-mismatch',
      requirementId: req.requirementId,
      message: 'sourceAssetId empty',
    });
  }
  if (!doc.componentId || typeof doc.componentId !== 'string') {
    errors.push({
      code: 'identity-mismatch',
      requirementId: req.requirementId,
      sourceAssetId: doc.sourceAssetId,
      message: 'componentId empty',
    });
  } else if (doc.componentId !== req.componentId) {
    errors.push({
      code: 'identity-mismatch',
      requirementId: req.requirementId,
      sourceAssetId: doc.sourceAssetId,
      message: `componentId mismatch: doc=${doc.componentId}, requirement=${req.componentId}`,
    });
  }
  if (!doc.sourceType || typeof doc.sourceType !== 'string') {
    errors.push({
      code: 'source-type-mismatch',
      requirementId: req.requirementId,
      sourceAssetId: doc.sourceAssetId,
      message: 'sourceType empty',
    });
  } else if (doc.sourceType !== req.componentType) {
    errors.push({
      code: 'source-type-mismatch',
      requirementId: req.requirementId,
      sourceAssetId: doc.sourceAssetId,
      message: `sourceType mismatch: doc=${doc.sourceType}, requirement=${req.componentType}`,
    });
  }
  if (!doc.sourceReference || typeof doc.sourceReference !== 'string' || doc.sourceReference.trim() === '') {
    errors.push({
      code: 'empty-source-reference',
      requirementId: req.requirementId,
      sourceAssetId: doc.sourceAssetId,
      message: 'sourceReference empty (cannot be just expected path)',
    });
  }
}

/** 校验一组 documents（含 sourceAssetId duplicate 检测），所有错误入 errors。 */
function validateDocuments(
  documents: Array<{ req: OfficialSourceRequirement; doc: OfficialSourceDocument }>,
  seenAssetIds: Map<string, string>,
  errors: SourceAuditError[],
): void {
  for (const { req, doc } of documents) {
    validateIdentity(doc, req, errors);
    if (doc.sourceAssetId && typeof doc.sourceAssetId === 'string' && doc.sourceAssetId.trim() !== '') {
      if (seenAssetIds.has(doc.sourceAssetId)) {
        errors.push({
          code: 'duplicate-source-asset',
          requirementId: req.requirementId,
          sourceAssetId: doc.sourceAssetId,
          message: `Duplicate sourceAssetId "${doc.sourceAssetId}" (first used by ${seenAssetIds.get(doc.sourceAssetId)})`,
        });
      } else {
        seenAssetIds.set(doc.sourceAssetId, req.requirementId);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Path-aware getter（dev doc §7）
// ---------------------------------------------------------------------------

/** 从 extractedFields 取 nested path（用 . 分隔，如 'ancestor.maxHp'）。 */
export function getExtractedValue(
  extractedFields: Record<string, unknown> | undefined,
  fieldPath: string,
): unknown {
  if (!extractedFields) return undefined;
  const parts = fieldPath.split('.');
  let cur: unknown = extractedFields;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function isEffectivelyMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string' && value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Per-Requirement Resolution（dev doc §7-10）
// ---------------------------------------------------------------------------

function resolveRequirement(
  req: OfficialSourceRequirement,
  documents: OfficialSourceDocument[],
  rulebookMissing: boolean,
): ResolvedRequirement {
  // Tier A: rulebook 真实存在性校验（dev doc §9）
  if (req.componentGroup === 'rulebook') {
    if (rulebookMissing) {
      return {
        requirementId: req.requirementId,
        status: 'missing',
        resolvedAssetCount: 0,
        missingFields: ['rulebook'],
        sourceAssetIds: [],
        sourceReferences: [],
        reason: 'Tier A rulebook missing or unreadable',
      };
    }
    return {
      requirementId: req.requirementId,
      status: 'available',
      resolvedAssetCount: 1,
      missingFields: [],
      sourceAssetIds: ['tierA-rulebook'],
      sourceReferences: [TIER_A_RULEBOOK_PATH],
      reason: 'Tier A rulebook present',
    };
  }
  // Tier C: official-errata optional（dev doc §6）
  if (req.componentGroup === 'official-errata') {
    if (documents.length === 0) {
      return {
        requirementId: req.requirementId,
        status: 'missing',
        resolvedAssetCount: 0,
        missingFields: [],
        sourceAssetIds: [],
        sourceReferences: [],
        reason: 'optional, not provided',
      };
    }
    return {
      requirementId: req.requirementId,
      status: 'partial',
      resolvedAssetCount: documents.length,
      missingFields: [],
      sourceAssetIds: documents.map((d) => d.sourceAssetId),
      sourceReferences: documents.map((d) => d.sourceReference).filter((s) => Boolean(s)),
      reason: 'Tier C errata optional',
    };
  }
  // Tier B
  if (documents.length === 0) {
    return {
      requirementId: req.requirementId,
      status: 'missing',
      resolvedAssetCount: 0,
      missingFields: req.requiredFields,
      sourceAssetIds: [],
      sourceReferences: [],
      reason: `no source file at ${req.sourceFilePattern}`,
    };
  }
  if (documents.length < req.quantity) {
    return {
      requirementId: req.requirementId,
      status: 'partial',
      resolvedAssetCount: documents.length,
      missingFields: ['quantity'],
      sourceAssetIds: documents.map((d) => d.sourceAssetId),
      sourceReferences: documents.map((d) => d.sourceReference).filter((s) => Boolean(s)),
      reason: `expected ${req.quantity} physical assets, found ${documents.length}`,
    };
  }
  // 字段级 三重验证（dev doc §7）：value + provenance + sourceReference
  const missingFields: string[] = [];
  for (const field of req.requiredFields) {
    let anyDocHasIt = false;
    let anyDocMissingValue = false;
    for (const doc of documents) {
      const value = getExtractedValue(doc.extractedFields, field);
      if (isEffectivelyMissing(value)) {
        anyDocMissingValue = true;
      } else {
        anyDocHasIt = true;
      }
      const prov = doc.fieldProvenance?.[field];
      if (!prov || prov.status !== 'verified' || !prov.sourceReference) {
        // provenance 缺失 / 未 verified / 没 sourceReference
        anyDocHasIt = false;
      }
    }
    if (!anyDocHasIt) {
      if (anyDocMissingValue) {
        missingFields.push(`${field}(missing-value)`);
      } else {
        missingFields.push(`${field}(missing-provenance)`);
      }
    }
  }
  if (missingFields.length > 0) {
    return {
      requirementId: req.requirementId,
      status: 'partial',
      resolvedAssetCount: documents.length,
      missingFields: [...new Set(missingFields)],
      sourceAssetIds: documents.map((d) => d.sourceAssetId),
      sourceReferences: documents.map((d) => d.sourceReference).filter((s) => Boolean(s)),
      reason: `${missingFields.length} required field(s) not verified`,
    };
  }
  return {
    requirementId: req.requirementId,
    status: 'available',
    resolvedAssetCount: documents.length,
    missingFields: [],
    sourceAssetIds: documents.map((d) => d.sourceAssetId),
    sourceReferences: documents.map((d) => d.sourceReference).filter((s) => Boolean(s)),
    reason: 'all required fields verified',
  };
}

// ---------------------------------------------------------------------------
// Structured Provenance Audit（dev doc §12）
// ---------------------------------------------------------------------------

function computeProvenanceAudit(
  resolved: ResolvedRequirement[],
  requirements: OfficialSourceRequirement[],
  documentsByReq: Map<string, OfficialSourceDocument[]>,
): ProvenanceAudit {
  const reqById = new Map(requirements.map((r) => [r.requirementId, r]));
  let requiredFieldCount = 0;
  let verifiedRequiredFieldCount = 0;
  let missingValueCount = 0;
  let missingProvenanceCount = 0;
  let invalidSourceReferenceCount = 0;
  let componentMismatchCount = 0;
  for (const r of resolved) {
    const req = reqById.get(r.requirementId);
    if (!req) continue;
    for (const field of req.requiredFields) {
      requiredFieldCount++;
      const docs = documentsByReq.get(r.requirementId) ?? [];
      let anyVerified = false;
      for (const doc of docs) {
        const value = getExtractedValue(doc.extractedFields, field);
        const prov = doc.fieldProvenance?.[field];
        if (
          prov?.status === 'verified' &&
          prov.sourceReference &&
          prov.sourceReference.trim() !== '' &&
          !isEffectivelyMissing(value)
        ) {
          anyVerified = true;
        } else if (prov?.status === 'verified' && isEffectivelyMissing(value)) {
          missingValueCount++;
        } else if (!prov || prov.status !== 'verified') {
          missingProvenanceCount++;
        } else if (prov.status === 'verified' && (!prov.sourceReference || prov.sourceReference.trim() === '')) {
          invalidSourceReferenceCount++;
        }
      }
      if (anyVerified) verifiedRequiredFieldCount++;
    }
  }
  // componentMismatchCount: 来自 errors
  return {
    requiredFieldCount,
    verifiedRequiredFieldCount,
    missingValueCount,
    missingProvenanceCount,
    invalidSourceReferenceCount,
    componentMismatchCount,
    passes:
      missingValueCount === 0 &&
      missingProvenanceCount === 0 &&
      invalidSourceReferenceCount === 0 &&
      componentMismatchCount === 0,
  };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditOptions {
  /** 仓库根目录（默认 process.cwd()） */
  repoRoot?: string;
  /** 测试 / 模拟用：注入虚拟 source documents 跳过文件系统 */
  injectDocuments?: Record<string, OfficialSourceDocument[]>;
  /** 测试 / 模拟用：覆盖 Tier A rulebook 存在性（默认 true = 存在）。 */
  injectRulebookMissing?: boolean;
}

export function runOfficialSourceAudit(options: AuditOptions = {}): {
  readiness: SourceReadinessResult;
  summary: OfficialSourceSummary;
} {
  void options.repoRoot;

  const allErrors: SourceAuditError[] = [];
  const documentsByReq = new Map<string, OfficialSourceDocument[]>();
  const seenAssetIds = new Map<string, string>();

  if (options.injectDocuments) {
    // 测试路径：直接 inject，但仍跑 identity / duplicate 校验
    // tierA-rulebook 不在 injectDocuments 时默认视作 available（除非 injectRulebookMissing=true 显式 missing）
    for (const req of OFFICIAL_SOURCE_REQUIREMENTS) {
      if (req.componentGroup === 'rulebook') {
        documentsByReq.set(req.requirementId, []);
      } else {
        documentsByReq.set(req.requirementId, options.injectDocuments[req.requirementId] ?? []);
      }
    }
    // 收集所有 docs 走 validateDocuments
    const allDocs: Array<{ req: OfficialSourceRequirement; doc: OfficialSourceDocument }> = [];
    for (const req of OFFICIAL_SOURCE_REQUIREMENTS) {
      for (const doc of documentsByReq.get(req.requirementId) ?? []) {
        allDocs.push({ req, doc });
      }
    }
    validateDocuments(allDocs, seenAssetIds, allErrors);
    if (options.injectRulebookMissing === true) {
      // 显式注入：必须 push tier-a-rulebook-missing 错误（无论真实 rulebook 文件是否存在）
      allErrors.push({
        code: 'tier-a-rulebook-missing',
        requirementId: 'tierA-rulebook',
        message: `Injected rulebook missing: ${TIER_A_RULEBOOK_PATH}`,
      });
    }
  } else {
    // 真实文件系统路径
    const rulebookErrors = checkTierARulebook();
    allErrors.push(...rulebookErrors);
    const { entries } = discoverAndLoad(OFFICIAL_SOURCE_REQUIREMENTS, allErrors, seenAssetIds);
    for (const e of entries) {
      const list = documentsByReq.get(e.requirementId) ?? [];
      if (e.document) list.push(e.document);
      documentsByReq.set(e.requirementId, list);
    }
  }

  const rulebookMissing = allErrors.some((e) => e.code === 'tier-a-rulebook-missing');

  // Per-requirement resolution
  const resolved: ResolvedRequirement[] = [];
  for (const req of OFFICIAL_SOURCE_REQUIREMENTS) {
    const docs = documentsByReq.get(req.requirementId) ?? [];
    resolved.push(resolveRequirement(req, docs, rulebookMissing));
  }

  // Compute summary
  const summary = summarizeRequirements();
  summary.availableRequirements = resolved.filter((r) => r.status === 'available').length;
  summary.missingRequirements = resolved.filter((r) => r.status === 'missing').length;
  summary.partialRequirements = resolved.filter((r) => r.status === 'partial').length;

  // Phase 11A.3 Source-Gate Final Acceptance Closure §6：
  // requiredForCompletion 分离（optional errata 不阻塞 allRequiredSourcesReady）
  const requiredResolved = resolved.filter((r) => {
    const req = OFFICIAL_SOURCE_REQUIREMENTS.find((x) => x.requirementId === r.requirementId);
    return req?.requiredForCompletion;
  });
  const optionalResolved = resolved.filter((r) => {
    const req = OFFICIAL_SOURCE_REQUIREMENTS.find((x) => x.requirementId === r.requirementId);
    return !req?.requiredForCompletion;
  });
  summary.requiredAvailableCount = requiredResolved.filter((r) => r.status === 'available').length;
  summary.requiredMissingCount = requiredResolved.filter((r) => r.status === 'missing').length;
  summary.requiredPartialCount = requiredResolved.filter((r) => r.status === 'partial').length;
  summary.optionalMissingCount = optionalResolved.filter((r) => r.status === 'missing').length;
  summary.optionalPartialCount = optionalResolved.filter((r) => r.status === 'partial').length;

  const auditPasses = allErrors.length === 0;
  summary.auditPasses = auditPasses;

  // Provenance audit
  const provenanceAudit = computeProvenanceAudit(resolved, OFFICIAL_SOURCE_REQUIREMENTS, documentsByReq);

  // Outcome
  let outcome: SourceAuditOutcome;
  if (!auditPasses) {
    outcome = { kind: 'source-audit-error', errors: allErrors };
  } else if (
    requiredResolved.every((r) => r.status === 'available') &&
    requiredResolved.length > 0
  ) {
    outcome = { kind: 'all-ready' };
  } else {
    outcome = {
      kind: 'source-blocked',
      missingRequirementIds: requiredResolved.filter((r) => r.status === 'missing').map((r) => r.requirementId),
      partialRequirementIds: requiredResolved.filter((r) => r.status === 'partial').map((r) => r.requirementId),
    };
  }

  // Gates
  const byGroup = (group: string) => resolved.filter((r) => {
    const req = OFFICIAL_SOURCE_REQUIREMENTS.find((x) => x.requirementId === r.requirementId);
    return req?.componentGroup === group;
  });
  const groupReady = (group: string) => {
    const items = byGroup(group);
    if (items.length === 0) return false;
    return items.every((r) => r.status === 'available');
  };

  // dev doc §6：allRequiredSourcesReady 仅看 requiredForCompletion=true
  const gates = {
    questCardsReady: groupReady('quest'),
    templarsReady: groupReady('templars'),
    mammothCystReady: groupReady('mammoth-cyst'),
    shufflingHorrorReady: groupReady('shuffling-horror'),
    finalEncounterReady: groupReady('final-encounter'),
    darkestDungeonMonsterDeckReady: groupReady('monster-deck'),
    allRequiredSourcesReady:
      auditPasses &&
      summary.requiredMissingCount === 0 &&
      summary.requiredPartialCount === 0,
  };

  // 保留向后兼容的 blockers 字段（不再被 generator 消费）
  const blockers = resolved
    .filter((r) => r.status === 'missing' || r.status === 'partial')
    .map((r) => ({
      requirementId: r.requirementId,
      missingFields: r.missingFields,
      reason: r.reason,
    }));

  // Input hash
  const inputHash = computeAuditInputHash(resolved, allErrors);

  const invalidCount = resolved.filter((r) => r.status === 'invalid').length;
  const missingCount = summary.missingRequirements;
  const resolvedCount = summary.availableRequirements;

  const readiness: SourceReadinessResult = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    inputHash,
    requirementCount: OFFICIAL_SOURCE_REQUIREMENTS.length,
    resolvedCount,
    missingCount,
    invalidCount,
    auditPasses,
    gates,
    resolvedRequirements: resolved,
    blockers,
    auditErrors: allErrors,
    provenanceAudit,
    outcome,
  };

  return { readiness, summary };
}

function computeAuditInputHash(resolved: ResolvedRequirement[], errors: SourceAuditError[]): string {
  const h = createHash('sha256');
  h.update(JSON.stringify(resolved.map((r) => [r.requirementId, r.status, r.missingFields.length])));
  h.update('\0');
  h.update(JSON.stringify(errors.map((e) => [e.code, e.requirementId, e.sourceAssetId])));
  h.update('\0');
  return h.digest('hex');
}

// ---------------------------------------------------------------------------
// 读旧版 source-readiness.json 仅用于检测 schema drift（不直接信任）
// ---------------------------------------------------------------------------

export interface LegacySourceReadiness {
  gates: {
    allRequiredSourcesReady: boolean;
    questCardsReady: boolean;
    templarsReady: boolean;
    mammothCystReady: boolean;
    shufflingHorrorReady: boolean;
    finalEncounterReady: boolean;
    darkestDungeonMonsterDeckReady: boolean;
  };
  impact: {
    canCloseP0_002: boolean;
    canEnableOfficialGuardianPool: boolean;
    canEnableOfficialFinalEncounter: boolean;
    canEnableOfficialDarkestDungeonQuestPool: boolean;
    canEnableOfficialDarkestDungeonMonsterDeck: boolean;
    verdict: 'SOURCE-BLOCKED' | 'READY';
  };
}

/** 仅用于 drift detection；不参与 readiness 推导。 */
export function readLegacySourceReadinessForDriftCheck(path: string = 'docs/data/core-campaign/source-readiness.json'): LegacySourceReadiness | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as LegacySourceReadiness;
  } catch {
    return null;
  }
}

/** @deprecated 请使用 runOfficialSourceAudit().readiness；本函数不参与真值推导。 */
export function readLegacyReadinessAsDefault(): LegacySourceReadiness {
  return runOfficialSourceAudit().readiness as unknown as LegacySourceReadiness;
}
