// Phase 11A — Deterministic RNG Audit (spec §14).
// Scans the official game-engine + data + store for Math.random() leakage and
// non-deterministic time sources that would corrupt replay / milestone hashes.
// Also verifies definition-hash stability.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { stableHash } from './types';

export interface RngAuditFinding {
  file: string;
  line: number;
  text: string;
  severity: 'error' | 'warning';
  category: 'math-random' | 'date-now' | 'new-date' | 'other';
  /** Phase 11A.2 §31：标记为 System Runtime Adapter allowlist；不阻塞 pass。 */
  allowlisted?: boolean;
}

function walk(dir: string, acc: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      // audit/ 是审计器自身，不属于被审计的正式运行时。
      if (e === 'node_modules' || e === 'dist' || e === '.git' || e === 'audit') continue;
      walk(full, acc);
    } else if (e.endsWith('.ts') || e.endsWith('.tsx')) {
      acc.push(full);
    }
  }
}

/**
 * 去掉行内注释与字符串字面量（单引号 / 双引号 / 反引号），
 * 只保留"真正会被执行的代码"用于模式匹配。
 */
export function stripCommentsAndStrings(line: string): string {
  let out = '';
  let quote: '"' | "'" | '`' | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') break;
    if (ch === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function scanFile(path: string, findings: RngAuditFinding[]): void {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  // Phase 11A.2 §31：System Runtime Adapter（src/game-engine/runtime-sources.ts 内的
  // SystemRandom / SystemClock / ProductionIdSource）允许直接使用 Math.random /
  // Date.now / new Date —— 它们是「唯一受信任的入口」。所有其它代码必须走 RuntimeSources facade。
  const isSystemRuntimeAdapter = /runtime-sources\.ts$/.test(path);
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const ln = idx + 1;
    // 剥离注释与字符串字面量，避免把文档/报错文案里的 "Math.random()" 误判为真实调用。
    const stripped = stripCommentsAndStrings(line);

    // `let _rng = Math.random` / `_rng = fn ?? Math.random` 是**合法的注入点默认值**，
    // 不是散落在业务逻辑里的直接调用，降级为 warning。
    const isInjectionPoint = /_rng\s*(:[^=]*)?=|setRandomSource/.test(stripped);

    if (/Math\.random\s*\(/.test(stripped)) {
      if (isSystemRuntimeAdapter) {
        findings.push({
          file: path,
          line: ln,
          text: `${line.trim()} (System Runtime Adapter — allowlist)`,
          severity: 'warning',
          category: 'math-random',
          allowlisted: true,
        });
      } else {
        findings.push({
          file: path,
          line: ln,
          text: isInjectionPoint ? `${line.trim()} (legitimate default / injection point)` : line.trim(),
          severity: isInjectionPoint ? 'warning' : 'error',
          category: isInjectionPoint ? 'other' : 'math-random',
        });
      }
    } else if (/\bMath\.random\b/.test(stripped)) {
      // 以函数引用形式出现（未立即调用），只可能是注入点默认值。
      findings.push({
        file: path,
        line: ln,
        text: `${line.trim()}${isInjectionPoint ? ' (legitimate default / injection point)' : ''}`,
        severity: isInjectionPoint ? 'warning' : 'error',
        category: isInjectionPoint ? 'other' : 'math-random',
      });
    }
    if (/\bDate\.now\s*\(/.test(stripped)) {
      if (isSystemRuntimeAdapter) {
        findings.push({
          file: path,
          line: ln,
          text: `${line.trim()} (System Runtime Adapter — allowlist)`,
          severity: 'warning',
          category: 'date-now',
          allowlisted: true,
        });
      } else {
        findings.push({ file: path, line: ln, text: line.trim(), severity: 'warning', category: 'date-now' });
      }
    }
    if (/\bnew\s+Date\s*\(/.test(stripped)) {
      if (isSystemRuntimeAdapter) {
        findings.push({
          file: path,
          line: ln,
          text: `${line.trim()} (System Runtime Adapter — allowlist)`,
          severity: 'warning',
          category: 'new-date',
          allowlisted: true,
        });
      } else {
        findings.push({ file: path, line: ln, text: line.trim(), severity: 'warning', category: 'new-date' });
      }
    }
  });
}

export function auditRngSources(rootDir = join(process.cwd(), 'src')): RngAuditFinding[] {
  const files: string[] = [];
  walk(rootDir, files);
  const findings: RngAuditFinding[] = [];
  for (const f of files) scanFile(f, findings);
  return findings;
}

/** Verify that hashing a definition twice yields identical results. */
export function verifyDefinitionHashStability(): { stable: boolean; sampleBefore: string; sampleAfter: string } {
  const sample = { id: 'x', a: [1, 2, { b: 3 }], c: 'y' };
  const before = stableHash(sample);
  const after = stableHash(sample);
  return { stable: before === after, sampleBefore: before, sampleAfter: after };
}

export interface RngAuditReport {
  errorCount: number;
  warningCount: number;
  mathRandomLeaks: number;
  timeSourceLeaks: number;
  findings: RngAuditFinding[];
  definitionHashStable: boolean;
  passed: boolean;
}

export function runRngAudit(rootDir?: string): RngAuditReport {
  const findings = auditRngSources(rootDir);
  const timeLeaks = findings.filter((f) => f.category === 'date-now' || f.category === 'new-date').length;
  const def = verifyDefinitionHashStability();
  // Phase 11A.2 §31：System Runtime Adapter（src/game-engine/runtime-sources.ts）
  // 允许直接使用 Math.random / Date.now / new Date，但所有其它代码必须走 RuntimeSources facade。
  // 这里过滤掉 allowlist 项。
  const blockingFindings = findings.filter((f) => !f.allowlisted);
  // Official-path Math.random leak is a hard error -> blocks pass.
  const realMathRandom = blockingFindings.filter((f) => f.category === 'math-random').length;
  return {
    errorCount: blockingFindings.filter((f) => f.severity === 'error').length,
    warningCount: blockingFindings.filter((f) => f.severity === 'warning').length,
    mathRandomLeaks: realMathRandom,
    timeSourceLeaks: timeLeaks,
    findings,
    definitionHashStable: def.stable,
    passed: realMathRandom === 0 && def.stable,
  };
}
