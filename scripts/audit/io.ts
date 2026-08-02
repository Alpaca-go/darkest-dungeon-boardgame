// Phase 11A — 审计脚本共用的落盘助手。
// 纯审计逻辑住在 src/audit/core-campaign/（无 fs 依赖，可被 vitest 直接 import），
// 这里只负责把结果写进 docs/。

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

export const REPO_ROOT = resolve(process.cwd());
export const DATA_DIR = join(REPO_ROOT, 'docs', 'data', 'core-campaign');
export const REPORT_DIR = join(REPO_ROOT, 'docs', 'reports', 'phase-11a');

export function writeArtifact(absPath: string, content: string): string {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  return absPath;
}

export function writeJson(relName: string, value: unknown): string {
  return writeArtifact(join(DATA_DIR, relName), JSON.stringify(value, null, 2));
}

export function writeReport(relName: string, markdown: string): string {
  return writeArtifact(join(REPORT_DIR, relName), markdown);
}

export function rel(absPath: string): string {
  return absPath.replace(`${REPO_ROOT}\\`, '').replace(`${REPO_ROOT}/`, '').replace(/\\/g, '/');
}

export function banner(title: string): void {
  const line = '='.repeat(Math.max(20, title.length + 4));
  console.log(`\n${line}\n  ${title}\n${line}`);
}

export function mdTable(headers: string[], rows: (string | number | boolean)[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map((c) => String(c)).join(' | ')} |`).join('\n');
  return rows.length === 0 ? `${head}\n${sep}\n| _(无)_ |${' |'.repeat(headers.length - 1)}` : `${head}\n${sep}\n${body}`;
}
