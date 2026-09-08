// Phase 11A.3 Source-Gate Integrity Repair dev doc §14-17, §39-41：
// Official Source Audit 模块。
//
// 职责：
//   1. Load canonical requirements（来自 official-source-requirements.ts）
//   2. Discover docs/data/darkest-dungeon/official/** 结构化 JSON
//   3. 字段级 provenance validation（Required Fields ⊆ Verified Field Provenance）
//   4. 派生 SourceReadinessResult（不再 read JSON 直接信任）
//   5. 区分 SOURCE-AUDIT-ERROR（malformed / contradictory）vs SOURCE-BLOCKED（缺资料）
//
// 禁止：
//   - 默认真相 = "source missing"：audit 正常执行 + 全部需求被解析为 missing 才能 SOURCE-BLOCKED
//   - 默认真相 = "source malformed"：必须 audit 显式报 NOT-VERIFIED / SOURCE-AUDIT-ERROR
//   - 跳过字段级 verification

import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
  | 'inconsistent-quantity'
  | 'schema-mismatch';

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
// Source Readiness Result（canonical 派生结果；不是读 JSON）
// ---------------------------------------------------------------------------

export interface SourceReadinessResult {
  schemaVersion: 2;
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

  blockers: Array<{
    requirementId: string;
    missingFields: string[];
    reason: string;
  }>;

  auditErrors: SourceAuditError[];

  outcome: SourceAuditOutcome;
}

// ---------------------------------------------------------------------------
// Source Discovery
// ---------------------------------------------------------------------------

const OFFICIAL_ROOT = 'docs/data/darkest-dungeon/official';

function expandBraces(pattern: string): string[] {
  // 简单 brace expansion: dd-tile-*.json → dd-tile-A.json / dd-tile-B.json（按 pattern 推断）
  // 这里用 glob-lite：从 base path + prefix + extension 找匹配文件。
  if (!pattern.includes('*')) return [pattern];
  // 相对 docs/data/darkest-dungeon/official/
  // pattern 形如 docs/data/darkest-dungeon/official/dungeon-tiles/dd-tile-*.json
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

function discoverAndLoad(): { entries: DiscoveryEntry[]; errors: SourceAuditError[] } {
  const errors: SourceAuditError[] = [];
  const entries: DiscoveryEntry[] = [];
  const seenAssetIds = new Map<string, string>(); // sourceAssetId -> requirementId

  for (const req of OFFICIAL_SOURCE_REQUIREMENTS) {
    if (req.componentGroup === 'rulebook' || req.componentGroup === 'official-errata') {
      // rulebook / errata 不通过文件系统发现（rulebook 是 PDF，errata 是 optional）
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
    if (paths.length !== req.quantity && req.componentGroup !== 'dungeon-tile' /* tile 用 pattern */) {
      // Reflection / Absolute Nothingness 等需要多张：paths.length 应 === quantity
      if (paths.length < req.quantity) {
        // 资料部分缺失
        entries.push({
          requirementId: req.requirementId,
          sourcePath: paths[0] ?? '(none)',
          document: paths[0] ? tryLoad(paths[0], errors, req) : null,
        });
        continue;
      }
    }
    // 加载每个
    for (const p of paths.slice(0, req.quantity)) {
      const doc = tryLoad(p, errors, req);
      if (doc) {
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
      entries.push({
        requirementId: req.requirementId,
        sourcePath: p,
        document: doc,
      });
    }
  }

  return { entries, errors };
}

function tryLoad(
  path: string,
  errors: SourceAuditError[],
  req: OfficialSourceRequirement,
): OfficialSourceDocument | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as OfficialSourceDocument;
    if (parsed.schemaVersion !== 1) {
      errors.push({
        code: 'schema-mismatch',
        requirementId: req.requirementId,
        sourceAssetId: parsed.sourceAssetId,
        message: `schemaVersion=${parsed.schemaVersion}, expected 1`,
      });
      return null;
    }
    // 字段级 provenance validation
    for (const field of req.requiredFields) {
      const provenance = parsed.fieldProvenance?.[field];
      if (provenance?.status === 'verified' && !provenance.sourceReference) {
        errors.push({
          code: 'verified-field-without-provenance',
          requirementId: req.requirementId,
          sourceAssetId: parsed.sourceAssetId,
          message: `Field "${field}" marked verified but has no sourceReference`,
        });
      }
    }
    return parsed;
  } catch (e) {
    errors.push({
      code: 'malformed-source-file',
      requirementId: req.requirementId,
      message: `Parse failed: ${e instanceof Error ? e.message : String(e)}`,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-Requirement Resolution
// ---------------------------------------------------------------------------

type RequirementStatus = 'available' | 'partial' | 'missing' | 'invalid';

interface ResolvedRequirement {
  requirementId: string;
  status: RequirementStatus;
  missingFields: string[];
  reason: string;
}

function resolveRequirement(
  req: OfficialSourceRequirement,
  documents: OfficialSourceDocument[],
): ResolvedRequirement {
  // Tier A: rulebook 永远 available（已提供在仓库）
  if (req.componentGroup === 'rulebook') {
    return { requirementId: req.requirementId, status: 'available', missingFields: [], reason: 'Tier A rulebook present' };
  }
  // Tier C: official-errata optional
  if (req.componentGroup === 'official-errata') {
    if (documents.length === 0) {
      return { requirementId: req.requirementId, status: 'missing', missingFields: [], reason: 'optional, not provided' };
    }
    return { requirementId: req.requirementId, status: 'partial', missingFields: [], reason: 'Tier C errata optional' };
  }
  // Tier B: 必须每张卡都有 source document
  if (documents.length === 0) {
    return {
      requirementId: req.requirementId,
      status: 'missing',
      missingFields: req.requiredFields,
      reason: `no source file at ${req.sourceFilePattern}`,
    };
  }
  if (documents.length < req.quantity) {
    return {
      requirementId: req.requirementId,
      status: 'partial',
      missingFields: ['quantity'],
      reason: `expected ${req.quantity} physical assets, found ${documents.length}`,
    };
  }
  // 字段级 verification
  const allMissing: string[] = [];
  for (const doc of documents) {
    for (const field of req.requiredFields) {
      const prov = doc.fieldProvenance?.[field];
      if (!prov || prov.status !== 'verified') {
        allMissing.push(field);
      }
    }
  }
  if (allMissing.length > 0) {
    return {
      requirementId: req.requirementId,
      status: 'partial',
      missingFields: [...new Set(allMissing)],
      reason: `${allMissing.length} required field(s) not verified`,
    };
  }
  return { requirementId: req.requirementId, status: 'available', missingFields: [], reason: 'all required fields verified' };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditOptions {
  /** 仓库根目录（默认 process.cwd()） */
  repoRoot?: string;
  /** 模拟 / 测试用：注入虚拟 source documents 跳过文件系统 */
  injectDocuments?: Record<string, OfficialSourceDocument[]>;
}

export function runOfficialSourceAudit(options: AuditOptions = {}): {
  readiness: SourceReadinessResult;
  summary: OfficialSourceSummary;
} {
  // 保留 options.repoRoot 兼容性（用于 future paths）
  void options.repoRoot;

  // Discover + load
  const documentsByReq = new Map<string, OfficialSourceDocument[]>();
  const allErrors: SourceAuditError[] = [];

  if (options.injectDocuments) {
    // 测试路径：直接 inject
    for (const req of OFFICIAL_SOURCE_REQUIREMENTS) {
      documentsByReq.set(req.requirementId, options.injectDocuments[req.requirementId] ?? []);
    }
  } else {
    // 文件系统路径
    const { entries, errors } = discoverAndLoad();
    allErrors.push(...errors);
    for (const e of entries) {
      const list = documentsByReq.get(e.requirementId) ?? [];
      if (e.document) list.push(e.document);
      documentsByReq.set(e.requirementId, list);
    }
  }

  // Per-requirement resolution
  const resolved: ResolvedRequirement[] = [];
  for (const req of OFFICIAL_SOURCE_REQUIREMENTS) {
    const docs = documentsByReq.get(req.requirementId) ?? [];
    resolved.push(resolveRequirement(req, docs));
  }

  // Compute summary
  const summary = summarizeRequirements();
  summary.availableRequirements = resolved.filter((r) => r.status === 'available').length;
  summary.partialRequirements = resolved.filter((r) => r.status === 'partial').length;
  summary.missingRequirements = resolved.filter((r) => r.status === 'missing').length;
  // Tier A rulebook 不算 missing
  const tierAMissing = resolved.filter(
    (r) => r.status === 'missing' && OFFICIAL_SOURCE_REQUIREMENTS.find((x) => x.requirementId === r.requirementId)?.componentGroup !== 'rulebook',
  ).length;
  const auditPasses = allErrors.length === 0;
  summary.auditPasses = auditPasses;

  // Outcome
  let outcome: SourceAuditOutcome;
  if (!auditPasses) {
    outcome = { kind: 'source-audit-error', errors: allErrors };
  } else if (tierAMissing === 0 && summary.missingRequirements - 1 === 0 /* rulebook */) {
    outcome = { kind: 'all-ready' };
  } else {
    outcome = {
      kind: 'source-blocked',
      missingRequirementIds: resolved.filter((r) => r.status === 'missing' && r.requirementId !== 'tierA-rulebook').map((r) => r.requirementId),
      partialRequirementIds: resolved.filter((r) => r.status === 'partial').map((r) => r.requirementId),
    };
  }

  // Gates（按 componentGroup 分组）
  const byGroup = (group: string) => resolved.filter((r) => {
    const req = OFFICIAL_SOURCE_REQUIREMENTS.find((x) => x.requirementId === r.requirementId);
    return req?.componentGroup === group;
  });
  const groupReady = (group: string) => {
    const items = byGroup(group);
    if (items.length === 0) return false;
    return items.every((r) => r.status === 'available');
  };

  const gates = {
    questCardsReady: groupReady('quest'),
    templarsReady: groupReady('templars'),
    mammothCystReady: groupReady('mammoth-cyst'),
    shufflingHorrorReady: groupReady('shuffling-horror'),
    finalEncounterReady: groupReady('final-encounter'),
    darkestDungeonMonsterDeckReady: groupReady('monster-deck'),
    allRequiredSourcesReady: auditPasses && tierAMissing === 0,
  };

  // Blockers
  const blockers = resolved
    .filter((r) => r.status === 'missing' || r.status === 'partial')
    .filter((r) => r.requirementId !== 'tierA-rulebook')
    .map((r) => ({
      requirementId: r.requirementId,
      missingFields: r.missingFields,
      reason: r.reason,
    }));

  // Input hash
  const inputHash = computeAuditInputHash(resolved, allErrors);

  const invalidCount = resolved.filter((r) => r.status === 'invalid').length;
  const missingCount = tierAMissing;
  const resolvedCount = summary.availableRequirements;

  const readiness: SourceReadinessResult = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    inputHash,
    requirementCount: OFFICIAL_SOURCE_REQUIREMENTS.length,
    resolvedCount,
    missingCount,
    invalidCount,
    auditPasses,
    gates,
    blockers,
    auditErrors: allErrors,
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

// 注意：以下函数保留向后兼容但标记 deprecated
/** @deprecated 请使用 runOfficialSourceAudit().readiness；本函数不参与真值推导。 */
export function readLegacyReadinessAsDefault(): LegacySourceReadiness {
  // 必须用 audit 派生；legacy 文件仅用于 drift check。
  return runOfficialSourceAudit().readiness as unknown as LegacySourceReadiness;
}
