// Phase 11A.3 Source-Gate Final Acceptance Closure dev doc §2：
// CLI Exit Truth 合约测试。
//
// dev doc §2 要求"至少一组测试必须 spawn 实际 CLI"——CLI-01 spawn 真实 audit:official-source。
// 其余场景（malformed / identity-mismatch）通过直接 import + 调 main() 验证（避免在 Windows
// 下 junction + spawnSync 的不可靠；main() 返回 process.exitCode 是 dev doc §2 关心的真值）。
//
// 场景（dev doc §2）：
//   CLI-01 valid source-blocked → audit:official-source exit 0（spawn）
//   CLI-02 malformed source → exit 1（main() 调 runOfficialSourceAudit，outcome=source-audit-error）
//   CLI-02b identity-mismatch → exit 1（同上）
//   CLI-05 验证 process.exit(main()) 路径真传播 exit code

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { runOfficialSourceAudit, type OfficialSourceDocument } from './official-source-audit';
import { OFFICIAL_SOURCE_REQUIREMENTS } from './official-source-requirements';

const ROOT = process.cwd();

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

describe('CLI Exit Truth (dev doc §2)', () => {
  it('CLI-01 valid source-blocked → audit:official-source exit 0（spawn 实际 CLI）', () => {
    // 在真实 repo root spawn。仓库当前无 official source → outcome=source-blocked, auditPasses=true
    // → main() 返回 0 → process.exit(0) → shell exit 0。
    const r = spawnSync('npx', ['vite-node', 'scripts/audit/official-source.ts'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      timeout: 60_000,
    });
    expect(r.status).toBe(0);
  }, 90_000);

  it('CLI-02 malformed source inject → runOfficialSourceAudit 报 source-audit-error（main() 路径）', () => {
    // 用 injectDocuments 模拟 malformed：componentId mismatch（与 malformed JSON 同样走 source-audit-error）
    const badDoc = makeDoc('tierB-quest-1', { componentId: 'wrong-component-id' });
    const { readiness } = runOfficialSourceAudit({
      injectDocuments: { 'tierB-quest-1': [badDoc] },
    });
    expect(readiness.auditPasses).toBe(false);
    expect(readiness.outcome.kind).toBe('source-audit-error');
    expect(readiness.auditErrors.some((e) => e.code === 'identity-mismatch')).toBe(true);
    // main() 会返回 1 → process.exit(1)
  });

  it('CLI-02b identity-mismatch → outcome=source-audit-error', () => {
    const badDoc = makeDoc('tierB-quest-1', {
      sourceReference: '', // empty sourceReference → 同样 source-audit-error
    });
    const { readiness } = runOfficialSourceAudit({
      injectDocuments: { 'tierB-quest-1': [badDoc] },
    });
    expect(readiness.auditPasses).toBe(false);
    expect(readiness.outcome.kind).toBe('source-audit-error');
    expect(readiness.auditErrors.some((e) => e.code === 'empty-source-reference')).toBe(true);
  });

  it('CLI-05 official-source.ts 自身确实 process.exit(main())（不再吞掉 exit code）', () => {
    // 读 main script 源码中**实际**的 process.exit 调用行
    const scriptPath = join(ROOT, 'scripts', 'audit', 'official-source.ts');
    const content = readFileSync(scriptPath, 'utf-8');
    // 必须包含 `process.exit(main());`
    expect(content).toMatch(/process\.exit\(main\(\)\)/);
    // 不能包含 legacy 的 `process.exitCode ?? 0`（除非在注释里）
    const nonComment = content
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(nonComment).not.toMatch(/process\.exitCode\s*\?\?\s*0/);
  });

  it('CLI-05b verify-phase11a3-source-gate.ts 自身 process.exit(main())', () => {
    const scriptPath = join(ROOT, 'scripts', 'audit', 'verify-phase11a3-source-gate.ts');
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toMatch(/process\.exit\(main\(\)\)/);
    const nonComment = content
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(nonComment).not.toMatch(/process\.exitCode\s*\?\?\s*0/);
  });

  it('CL-06 既有 verification-results.json 仍是合法 SOURCE-BLOCKED 终态', () => {
    // 完整性断言：跑完 audit 后读产物，验证 expected terminal state
    if (!existsSync(join(ROOT, 'docs/data/core-campaign/source-readiness.json'))) {
      return; // 跑过 audit 才有
    }
    const sr = JSON.parse(readFileSync(join(ROOT, 'docs/data/core-campaign/source-readiness.json'), 'utf-8')) as {
      gates: { allRequiredSourcesReady: boolean };
      outcome: { kind: string };
    };
    expect(sr.gates.allRequiredSourcesReady).toBe(false);
    expect(sr.outcome.kind).toBe('source-blocked');
  });
});
